/**
 * Seed ~100 dummy employees with realistic KPI scores.
 * Safe to run multiple times — uses INSERT OR IGNORE on emails.
 *
 * Usage: node server/src/db/seed-dummy.js
 */

const bcrypt = require('bcryptjs');
const { db, initSchema } = require('./schema');

initSchema();

// ── Lookup existing roles, dept, periods ──────────────────────────────────────
const roleMap = {};
db.prepare('SELECT id, name FROM roles').all().forEach(r => { roleMap[r.name] = r.id; });

const dept = db.prepare("SELECT id FROM departments WHERE name = 'Engineering'").get();
if (!dept) { console.error('Run seed.js first.'); process.exit(1); }
const deptId = dept.id;

const periods = db.prepare('SELECT * FROM scoring_periods ORDER BY start_date DESC').all();
if (periods.length === 0) { console.error('No scoring periods found. Create some in the app first.'); process.exit(1); }

// Use the two most recent periods for scores
const [period1, period2] = periods;

const templatesByRole = {};
for (const role of ['Project Manager', 'Engineering Manager', 'Project Lead', 'Team Member']) {
  templatesByRole[role] = db.prepare(
    'SELECT * FROM kpi_templates WHERE role_id = ?'
  ).all(roleMap[role]);
}

// ── Name pools ────────────────────────────────────────────────────────────────
const firstNames = [
  'Aarav','Aditi','Akash','Amit','Ananya','Anjali','Arjun','Aryan','Deepa','Deepak',
  'Divya','Gaurav','Ishaan','Karan','Kavya','Manish','Meera','Mihir','Neha','Nikhil',
  'Nisha','Pooja','Priya','Rahul','Raj','Rajesh','Ravi','Rohan','Rohini','Sachin',
  'Sanjay','Shruti','Sneha','Soham','Suresh','Tanvi','Tanya','Uday','Varun','Vijay',
  'Vikram','Vikas','Vinay','Vishal','Yamini','Yash','Zara','Zoya','Kriti','Lakshmi',
  'Manoj','Neeraj','Pallavi','Pranav','Preeti','Radhika','Sameer','Siddharth','Smita','Suraj',
];
const lastNames = [
  'Sharma','Verma','Singh','Kumar','Patel','Shah','Mehta','Joshi','Gupta','Mishra',
  'Nair','Reddy','Rao','Iyer','Pillai','Desai','Chopra','Malhotra','Kapoor','Bose',
  'Das','Sen','Ghosh','Mukherjee','Chatterjee','Pandey','Tiwari','Dubey','Srivastava','Shukla',
];

let nameIdx = 0;
function nextName() {
  const first = firstNames[nameIdx % firstNames.length];
  const last = lastNames[Math.floor(nameIdx / firstNames.length) % lastNames.length];
  nameIdx++;
  return { first, last, full: `${first} ${last}` };
}

// ── Password hash (same for all dummies) ─────────────────────────────────────
const passwordHash = bcrypt.hashSync('password123', 10);

// ── Score helpers ─────────────────────────────────────────────────────────────
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function scoreForType(type) {
  if (type === 'scale_2_5') return randInt(2, 5);
  if (type === 'scale_1_5') return randInt(1, 5);
  if (type === 'scale_1_10') return randInt(1, 10);
  if (type === 'raw_100') return null; // set by distribution, skip
  if (type === 'calculated') return randInt(2, 5);
  return null;
}

const insertEmployee = db.prepare(`
  INSERT OR IGNORE INTO employees
    (name, email, password_hash, role_id, department_id, reports_to, is_active, joined_at)
  VALUES (?, ?, ?, ?, ?, ?, 1, ?)
`);

const insertScore = db.prepare(`
  INSERT OR IGNORE INTO kpi_scores
    (employee_id, kpi_template_id, scoring_period_id,
     self_score, manager_score, final_score,
     self_notes, manager_notes, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function getOrCreate(email, name, roleKey, reportsTo) {
  const existing = db.prepare('SELECT id FROM employees WHERE email = ?').get(email);
  if (existing) return existing.id;
  const joinedAt = `${randInt(2021, 2024)}-${String(randInt(1,12)).padStart(2,'0')}-${String(randInt(1,28)).padStart(2,'0')}`;
  insertEmployee.run(name, email, passwordHash, roleMap[roleKey], deptId, reportsTo, joinedAt);
  return db.prepare('SELECT id FROM employees WHERE email = ?').get(email).id;
}

/**
 * scoreProfile:
 *   'reconciled'  — self + manager scored, no dispute (diff < 1)
 *   'disputed'    — self + manager scored, diff ≥ 1
 *   'self_only'   — only self scored
 *   'mgr_only'    — only manager scored
 *   'pending'     — no scores
 */
function addScores(empId, roleKey, periodId, profile) {
  const templates = templatesByRole[roleKey] ?? [];
  for (const t of templates) {
    if (t.score_type === 'raw_100') continue; // skip distribution KPIs

    let selfScore = null, managerScore = null, finalScore = null, status = 'pending';

    if (profile === 'pending') {
      continue; // no rows inserted
    }

    if (profile === 'self_only') {
      selfScore = scoreForType(t.score_type);
      status = 'self_submitted';
    } else if (profile === 'mgr_only') {
      managerScore = scoreForType(t.score_type);
      status = 'manager_submitted';
    } else if (profile === 'reconciled') {
      selfScore = scoreForType(t.score_type);
      managerScore = selfScore; // same → auto reconcile (diff = 0)
      finalScore = managerScore;
      status = 'reconciled';
    } else if (profile === 'disputed') {
      selfScore = scoreForType(t.score_type);
      // force a 1+ point difference
      const maxScore = t.score_type === 'scale_1_10' ? 10 : 5;
      managerScore = selfScore === 2 ? selfScore + 1 : selfScore - 1;
      managerScore = Math.max(1, Math.min(maxScore, managerScore));
      status = Math.abs(selfScore - managerScore) >= 1 ? 'disputed' : 'reconciled';
      if (status === 'reconciled') finalScore = managerScore;
    }

    insertScore.run(
      empId, t.id, periodId,
      selfScore, managerScore, finalScore,
      selfScore !== null ? 'Self assessment submitted.' : null,
      managerScore !== null ? 'Reviewed by manager.' : null,
      status
    );
  }
}

// ── Profiles assigned by bucket ───────────────────────────────────────────────
// Cycle through profiles so we get a realistic mix
const profiles = [
  'reconciled','reconciled','reconciled',   // 30%
  'disputed','disputed',                    // 20%
  'self_only','self_only',                  // 20%
  'mgr_only',                               // 10%
  'pending','pending',                      // 20%
];
let profileIdx = 0;
function nextProfile() {
  return profiles[profileIdx++ % profiles.length];
}

// ── Build the org ─────────────────────────────────────────────────────────────
const run = db.transaction(() => {

  // ── 1 GH ──────────────────────────────────────────────────────────────────
  const ghName = nextName();
  const ghId = getOrCreate(
    'gh.arjun@company.com', 'Arjun Sharma', 'Group Head', null
  );

  // ── 4 Project Managers reporting to GH ───────────────────────────────────
  const pmIds = [];
  for (let i = 0; i < 4; i++) {
    const n = nextName();
    const email = `pm.${n.first.toLowerCase()}${i + 1}@company.com`;
    const id = getOrCreate(email, n.full, 'Project Manager', ghId);
    pmIds.push(id);
    addScores(id, 'Project Manager', period1.id, nextProfile());
    if (period2) addScores(id, 'Project Manager', period2.id, nextProfile());
  }

  // ── 3 Engineering Managers reporting to GH ───────────────────────────────
  const emIds = [];
  for (let i = 0; i < 3; i++) {
    const n = nextName();
    const email = `em.${n.first.toLowerCase()}${i + 1}@company.com`;
    const id = getOrCreate(email, n.full, 'Engineering Manager', ghId);
    emIds.push(id);
    addScores(id, 'Engineering Manager', period1.id, nextProfile());
    if (period2) addScores(id, 'Engineering Manager', period2.id, nextProfile());
  }

  // ── 15 Project Leads — split between PMs and EMs ─────────────────────────
  const plIds = [];
  const plManagers = [...pmIds, ...pmIds, ...emIds];
  for (let i = 0; i < 15; i++) {
    const n = nextName();
    const email = `pl.${n.first.toLowerCase()}${i + 1}@company.com`;
    const managerId = plManagers[i % plManagers.length];
    const id = getOrCreate(email, n.full, 'Project Lead', managerId);
    plIds.push(id);
    addScores(id, 'Project Lead', period1.id, nextProfile());
    if (period2) addScores(id, 'Project Lead', period2.id, nextProfile());
  }

  // ── ~77 Team Members — 5 per PL ───────────────────────────────────────────
  let tmCount = 0;
  for (let p = 0; p < plIds.length; p++) {
    const perPl = p < 2 ? 6 : 5;
    for (let t = 0; t < perPl; t++) {
      const n = nextName();
      const email = `tm.${n.first.toLowerCase()}${tmCount + 1}@company.com`;
      const id = getOrCreate(email, n.full, 'Team Member', plIds[p]);
      addScores(id, 'Team Member', period1.id, nextProfile());
      if (period2) addScores(id, 'Team Member', period2.id, nextProfile());
      tmCount++;
    }
  }

  return { ghId, pmCount: pmIds.length, emCount: emIds.length, plCount: plIds.length, tmCount };
});

const result = run();

const total = db.prepare('SELECT COUNT(*) AS n FROM employees WHERE is_active = 1').get().n;
const scoreCount = db.prepare('SELECT COUNT(*) AS n FROM kpi_scores').get().n;

console.log('\n✓ Dummy seed complete!');
console.log(`  GH: 1, PM: ${result.pmCount}, EM: ${result.emCount}, PL: ${result.plCount}, TM: ${result.tmCount}`);
console.log(`  Total active employees: ${total}`);
console.log(`  Total score records: ${scoreCount}`);
console.log(`  All dummy passwords: password123`);
console.log(`  Period scored: ${period1.label}${period2 ? ` + ${period2.label}` : ''}\n`);
