/**
 * Full re-seed: wipes all employee / score data and rebuilds
 * the org from scratch with the correct department structure.
 *
 * Org structure
 * ─────────────
 *   Operations dept  → Dir of Operations  (level 1) — 1 person
 *   PDE dept         → GH                 (level 2) — 1 GH
 *                       └─ 3 PMs          (level 3)
 *                           └─ 11 PLs     (level 4)  (4 + 4 + 3)
 *                               └─ 55 TMs (level 5)  5 per PL
 *   Plant dept       → GH                 (level 2) — 1 GH
 *                       └─ 2 PMs          (level 3)
 *                           └─ 6 PLs      (level 4)  3 per PM
 *                               └─ 24 TMs (level 5)  4 per PL
 *   Machine Team dept→ GH                 (level 2) — 1 GH
 *                       └─ 1 PM           (level 3)
 *                           └─ 3 PLs      (level 4)
 *                               └─ 9 TMs  (level 5)  3 per PL
 *
 * Usage: node server/src/db/restructure.js
 */

const bcrypt = require('bcryptjs');
const { db, initSchema, runMigrations } = require('./schema');

initSchema();
runMigrations();

const PASSWORD     = bcrypt.hashSync('password123', 10);
const ADMIN_PASS   = bcrypt.hashSync('admin123', 10);

const run = db.transaction(() => {

  // ── 1. Wipe employee & score data ─────────────────────────────────────────
  db.exec(`
    DELETE FROM rupee_distribution_items;
    DELETE FROM rupee_distributions;
    DELETE FROM kpi_scores;
    DELETE FROM employees;
  `);
  console.log('[1] Cleared employees and scores.');

  // ── 2. Departments ─────────────────────────────────────────────────────────
  for (const name of ['Operations', 'PDE', 'Plant', 'Machine Team']) {
    db.prepare('INSERT OR IGNORE INTO departments (name) VALUES (?)').run(name);
  }
  // Remove old single-department if no longer needed (soft: just leave it, it won't be used)
  const deptMap = {};
  db.prepare('SELECT id, name FROM departments').all()
    .forEach(d => { deptMap[d.name] = d.id; });
  console.log('[2] Departments:', Object.keys(deptMap).join(', '));

  // ── 3. Roles ───────────────────────────────────────────────────────────────
  // Remove legacy "Director" role (was above Dir of Ops in old structure)
  db.prepare("DELETE FROM roles WHERE name = 'Director'").run();

  const roleSpecs = [
    { name: 'Director of Operations', level: 1 },
    { name: 'Group Head',             level: 2 },
    { name: 'Project Manager',        level: 3 },
    { name: 'Engineering Manager',    level: 3 }, // retained for KPI templates; no active employees
    { name: 'Project Lead',           level: 4 },
    { name: 'Team Member',            level: 5 },
  ];
  for (const r of roleSpecs) {
    db.prepare('INSERT OR IGNORE INTO roles (name, hierarchy_level) VALUES (?, ?)').run(r.name, r.level);
    db.prepare('UPDATE roles SET hierarchy_level = ? WHERE name = ?').run(r.level, r.name);
  }
  const roleMap = {};
  db.prepare('SELECT id, name FROM roles').all()
    .forEach(r => { roleMap[r.name] = r.id; });
  console.log('[3] Roles set:', Object.entries(roleMap).map(([n, id]) => `${n}(${id})`).join(', '));

  // ── 4. Name pool ───────────────────────────────────────────────────────────
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
    const last  = lastNames[Math.floor(nameIdx / firstNames.length) % lastNames.length];
    nameIdx++;
    return `${first} ${last}`;
  }

  // Track per-prefix counters for sequential emails
  const emailCounters = {};
  function makeEmail(prefix) {
    emailCounters[prefix] = (emailCounters[prefix] || 0) + 1;
    return `${prefix}.${emailCounters[prefix]}@company.com`;
  }

  function joinDate() {
    const y = 2019 + Math.floor(Math.random() * 6); // 2019–2024
    const m = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0');
    return `${y}-${m}-01`;
  }

  function createEmp(name, email, roleKey, deptKey, reportsTo) {
    db.prepare(`
      INSERT OR IGNORE INTO employees
        (name, email, password_hash, role_id, department_id, reports_to, is_active, joined_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `).run(name, email, PASSWORD, roleMap[roleKey], deptMap[deptKey], reportsTo, joinDate());
    return db.prepare('SELECT id FROM employees WHERE email = ?').get(email).id;
  }

  // ── 5. Dir of Operations (Operations dept) ─────────────────────────────────
  const dooId = createEmp('Priya Desai', 'doo@company.com', 'Director of Operations', 'Operations', null);

  // ── 6. PDE — biggest ──────────────────────────────────────────────────────
  //   PM branch : 3 PMs → (4+4+3) PLs → 5 TMs each
  //   EM branch : EM1 → 2 PLs (4 TMs each) + 2 direct TMs
  //               EM2 → 3 PLs (4 TMs each)
  const ghPde = createEmp(nextName(), 'gh.pde@company.com', 'Group Head', 'PDE', dooId);

  const pdePlsPerPm = [4, 4, 3];
  for (let m = 0; m < 3; m++) {
    const pmId = createEmp(nextName(), `pm.pde${m + 1}@company.com`, 'Project Manager', 'PDE', ghPde);
    for (let l = 0; l < pdePlsPerPm[m]; l++) {
      const plId = createEmp(nextName(), makeEmail('pl.pde'), 'Project Lead', 'PDE', pmId);
      for (let t = 0; t < 5; t++) {
        createEmp(nextName(), makeEmail('tm.pde'), 'Team Member', 'PDE', plId);
      }
    }
  }

  // EMs — no direct reports (3 in PDE)
  createEmp(nextName(), 'em.pde1@company.com', 'Engineering Manager', 'PDE', ghPde);
  createEmp(nextName(), 'em.pde2@company.com', 'Engineering Manager', 'PDE', ghPde);
  createEmp(nextName(), 'em.pde3@company.com', 'Engineering Manager', 'PDE', ghPde);

  // ── 7. Plant — medium ─────────────────────────────────────────────────────
  //   PM branch : 2 PMs → 3 PLs each → 4 TMs each
  //   EM branch : 1 EM → 2 PLs (3 TMs each) + 2 direct TMs
  const ghPlant = createEmp(nextName(), 'gh.plant@company.com', 'Group Head', 'Plant', dooId);

  for (let m = 0; m < 2; m++) {
    const pmId = createEmp(nextName(), `pm.plant${m + 1}@company.com`, 'Project Manager', 'Plant', ghPlant);
    for (let l = 0; l < 3; l++) {
      const plId = createEmp(nextName(), makeEmail('pl.plant'), 'Project Lead', 'Plant', pmId);
      for (let t = 0; t < 4; t++) {
        createEmp(nextName(), makeEmail('tm.plant'), 'Team Member', 'Plant', plId);
      }
    }
  }

  // EMs — no direct reports (2 in Plant)
  createEmp(nextName(), 'em.plant1@company.com', 'Engineering Manager', 'Plant', ghPlant);
  createEmp(nextName(), 'em.plant2@company.com', 'Engineering Manager', 'Plant', ghPlant);

  // ── 8. Machine Team — smallest ────────────────────────────────────────────
  //   PM branch : 1 PM → 3 PLs → 3 TMs each
  //   EM branch : 1 EM → 2 direct TMs
  const ghMachine = createEmp(nextName(), 'gh.machine@company.com', 'Group Head', 'Machine Team', dooId);

  const pmMachine = createEmp(nextName(), 'pm.machine1@company.com', 'Project Manager', 'Machine Team', ghMachine);
  for (let l = 0; l < 3; l++) {
    const plId = createEmp(nextName(), makeEmail('pl.machine'), 'Project Lead', 'Machine Team', pmMachine);
    for (let t = 0; t < 3; t++) {
      createEmp(nextName(), makeEmail('tm.machine'), 'Team Member', 'Machine Team', plId);
    }
  }

  // EM — no direct reports
  createEmp(nextName(), 'em.machine1@company.com', 'Engineering Manager', 'Machine Team', ghMachine);

  // ── 9. Restore admin account ───────────────────────────────────────────────
  db.prepare(`
    INSERT OR IGNORE INTO employees (name, email, password_hash, is_admin, is_active)
    VALUES ('Admin', 'admin@company.com', ?, 1, 1)
  `).run(ADMIN_PASS);

  // ── 9b. Assign all KPI templates to PDE, Plant, Machine Team departments ──
  const targetDeptNames = ['PDE', 'Plant', 'Machine Team'];
  const allTemplateIds = db.prepare('SELECT id FROM kpi_templates').all().map(t => t.id);
  const deptInsert = db.prepare(
    'INSERT OR IGNORE INTO kpi_template_assignments (template_id, dept_id, weight_percentage) VALUES (?, ?, 0)'
  );
  for (const deptName of targetDeptNames) {
    const dept = db.prepare('SELECT id FROM departments WHERE name = ?').get(deptName);
    if (!dept) continue;
    for (const tid of allTemplateIds) {
      deptInsert.run(tid, dept.id);
    }
  }
  console.log(`[9b] Assigned ${allTemplateIds.length} templates to ${targetDeptNames.join(', ')}.`);

  // ── 10. Summary ────────────────────────────────────────────────────────────
  return db.prepare(`
    SELECT d.name AS dept, r.name AS role, COUNT(*) AS n
      FROM employees e
      JOIN roles r ON r.id = e.role_id
      LEFT JOIN departments d ON d.id = e.department_id
     WHERE e.is_active = 1 AND e.is_admin = 0
     GROUP BY d.name, r.name
     ORDER BY r.hierarchy_level, d.name
  `).all();
});

const summary = run();

const total = db.prepare("SELECT COUNT(*) AS n FROM employees WHERE is_active = 1 AND is_admin = 0").get().n;

console.log('\n✓ Restructure complete!\n');
console.log('Headcount by department and role:');
let lastRole = null;
for (const row of summary) {
  if (row.role !== lastRole) { console.log(`  ${row.role}`); lastRole = row.role; }
  console.log(`    ${(row.dept || '—').padEnd(15)} ${row.n}`);
}
console.log(`\nTotal active employees: ${total}`);
console.log('\nLogins (password: password123 — admin: admin123):');
console.log('  admin@company.com       Admin');
console.log('  doo@company.com         Dir of Operations');
console.log('  gh.pde@company.com      GH — PDE');
console.log('  gh.plant@company.com    GH — Plant');
console.log('  gh.machine@company.com  GH — Machine Team');
console.log('  pm.pde1@company.com     PM — PDE (1 of 3)');
console.log('  pm.plant1@company.com   PM — Plant (1 of 2)');
console.log('  pm.machine1@company.com PM — Machine Team');
