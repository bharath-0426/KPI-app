/**
 * Fill KPI scores for ALL active employees across ALL scoring periods.
 * Skips raw_100 (those need ₹100 distribution).
 * Existing scores are left untouched (INSERT OR IGNORE).
 *
 * Usage: node server/src/db/seed-scores.js
 */

const { db, initSchema } = require('./schema');

initSchema();

// ── Load everything we need ───────────────────────────────────────────────────
const employees = db.prepare(`
  SELECT e.id, e.name, e.reports_to,
         r.name AS role_name, r.id AS role_id
    FROM employees e
    JOIN roles r ON r.id = e.role_id
   WHERE e.is_active = 1 AND e.role_id IS NOT NULL AND e.is_admin = 0
`).all();

const periods = db.prepare('SELECT * FROM scoring_periods ORDER BY start_date').all();

const templatesByRole = {};
db.prepare('SELECT * FROM kpi_templates').all().forEach(t => {
  if (!templatesByRole[t.role_id]) templatesByRole[t.role_id] = [];
  templatesByRole[t.role_id].push(t);
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function scoreForType(type) {
  if (type === 'scale_2_5')  return randInt(2, 5);
  if (type === 'scale_1_5')  return randInt(1, 5);
  if (type === 'scale_1_10') return randInt(1, 10);
  if (type === 'calculated') return randInt(2, 5);
  return null;
}

// Each employee gets a consistent "performance tier" so scores feel realistic
const tiers = {}; // empId → 'high' | 'mid' | 'low'
employees.forEach(e => {
  const r = Math.random();
  tiers[e.id] = r > 0.65 ? 'high' : r > 0.25 ? 'mid' : 'low';
});

function tieredScore(type, tier) {
  if (type === 'scale_2_5') {
    if (tier === 'high') return randInt(4, 5);
    if (tier === 'mid')  return randInt(3, 4);
    return randInt(2, 3);
  }
  if (type === 'scale_1_5') {
    if (tier === 'high') return randInt(4, 5);
    if (tier === 'mid')  return randInt(3, 4);
    return randInt(1, 3);
  }
  if (type === 'scale_1_10') {
    if (tier === 'high') return randInt(7, 10);
    if (tier === 'mid')  return randInt(5, 8);
    return randInt(1, 6);
  }
  if (type === 'calculated') {
    if (tier === 'high') return randInt(4, 5);
    if (tier === 'mid')  return randInt(3, 4);
    return randInt(2, 3);
  }
  return null;
}

const selfNotes = [
  'Completed as per targets.',
  'Met expectations for this period.',
  'Worked hard to achieve this score.',
  'Faced some challenges but delivered.',
  'Exceeded targets this quarter.',
  'On track with project goals.',
  null,
];

const managerNotes = [
  'Good performance.',
  'Meets expectations.',
  'Needs improvement in some areas.',
  'Strong contribution this period.',
  'Consistent delivery.',
  'Keep up the good work.',
  null,
];

function randNote(arr) {
  return arr[randInt(0, arr.length - 1)];
}

// ── Status distribution per period ───────────────────────────────────────────
// Older periods → mostly reconciled
// Most recent period → mix of statuses
function getStatus(periodIndex, totalPeriods, selfScore, managerScore, type) {
  const isLatest = periodIndex === totalPeriods - 1;
  const isRecent = periodIndex === totalPeriods - 2;

  if (!isLatest && !isRecent) {
    // Old period — fully reconciled
    return 'reconciled';
  }

  if (isRecent) {
    // Second-latest — mostly reconciled, some disputed
    const r = Math.random();
    if (r < 0.70) return 'reconciled';
    if (r < 0.85) return 'disputed';
    if (r < 0.93) return 'self_submitted';
    return 'manager_submitted';
  }

  // Latest period — realistic mix
  const r = Math.random();
  if (r < 0.35) return 'reconciled';
  if (r < 0.50) return 'disputed';
  if (r < 0.70) return 'self_submitted';
  if (r < 0.85) return 'manager_submitted';
  return 'pending';
}

const insertScore = db.prepare(`
  INSERT OR IGNORE INTO kpi_scores
    (employee_id, kpi_template_id, scoring_period_id,
     self_score, manager_score, final_score,
     self_notes, manager_notes, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// ── Main loop ─────────────────────────────────────────────────────────────────
let inserted = 0;

const run = db.transaction(() => {
  periods.forEach((period, periodIndex) => {
    employees.forEach(emp => {
      const templates = templatesByRole[emp.role_id] ?? [];
      const tier = tiers[emp.id];

      templates.forEach(t => {
        if (t.score_type === 'raw_100') return; // skip — needs distribution

        const selfScore  = tieredScore(t.score_type, tier);
        const statusDecision = getStatus(periodIndex, periods.length, selfScore, null, t.score_type);

        if (statusDecision === 'pending') return; // leave no row

        let managerScore = null;
        let finalScore   = null;
        let status       = statusDecision;

        if (statusDecision === 'self_submitted') {
          // Only self score exists
          const result = insertScore.run(
            emp.id, t.id, period.id,
            selfScore, null, null,
            randNote(selfNotes), null,
            'self_submitted'
          );
          if (result.changes) inserted++;
          return;
        }

        if (statusDecision === 'manager_submitted') {
          managerScore = tieredScore(t.score_type, tier);
          const result = insertScore.run(
            emp.id, t.id, period.id,
            null, managerScore, null,
            null, randNote(managerNotes),
            'manager_submitted'
          );
          if (result.changes) inserted++;
          return;
        }

        // reconciled or disputed — both scores exist
        managerScore = tieredScore(t.score_type, tier);

        if (statusDecision === 'disputed') {
          // Force at least 1 point difference
          const maxVal = t.score_type === 'scale_1_10' ? 10 : (t.score_type === 'scale_1_5' ? 5 : 5);
          const minVal = t.score_type === 'scale_1_5' ? 1 : 2;
          managerScore = selfScore <= minVal ? selfScore + 1 : selfScore - 1;
          managerScore = Math.max(minVal, Math.min(maxVal, managerScore));
          status = Math.abs(selfScore - managerScore) >= 1 ? 'disputed' : 'reconciled';
        }

        if (status === 'reconciled') {
          finalScore = managerScore;
        }

        const result = insertScore.run(
          emp.id, t.id, period.id,
          selfScore, managerScore, finalScore,
          randNote(selfNotes), randNote(managerNotes),
          status
        );
        if (result.changes) inserted++;
      });
    });
  });
});

console.log('Seeding scores for all employees across all periods...');
run();

// ── Summary ───────────────────────────────────────────────────────────────────
const total      = db.prepare('SELECT COUNT(*) AS n FROM kpi_scores').get().n;
const reconciled = db.prepare("SELECT COUNT(*) AS n FROM kpi_scores WHERE status='reconciled'").get().n;
const disputed   = db.prepare("SELECT COUNT(*) AS n FROM kpi_scores WHERE status='disputed'").get().n;
const selfOnly   = db.prepare("SELECT COUNT(*) AS n FROM kpi_scores WHERE status='self_submitted'").get().n;
const mgrOnly    = db.prepare("SELECT COUNT(*) AS n FROM kpi_scores WHERE status='manager_submitted'").get().n;

console.log('\n✓ Score seed complete!');
console.log(`  New rows inserted : ${inserted}`);
console.log(`  Total score rows  : ${total}`);
console.log(`  Reconciled        : ${reconciled}`);
console.log(`  Disputed          : ${disputed}`);
console.log(`  Self-submitted    : ${selfOnly}`);
console.log(`  Manager-submitted : ${mgrOnly}`);
console.log(`  Periods covered   : ${periods.length} (${periods.map(p => p.label).join(', ')})\n`);
