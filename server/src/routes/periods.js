const express = require('express');
const { db } = require('../db/schema');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const {
  getAvailablePeriodsForYear,
  getCurrentDefaultPeriod,
} = require('../lib/periods');

const router = express.Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns submission stats for a period. */
function getPeriodStats(periodId) {
  const total = db.prepare(`
    SELECT COUNT(DISTINCT e.id) AS n
      FROM employees e
      JOIN roles r ON r.id = e.role_id
     WHERE e.is_active = 1 AND r.hierarchy_level > 0
  `).get().n;

  const submitted = db.prepare(`
    SELECT COUNT(DISTINCT employee_id) AS n
      FROM kpi_scores
     WHERE scoring_period_id = ?
       AND status IN ('self_submitted','both_submitted','manager_submitted','disputed','reconciled')
  `).get(periodId).n;

  const managerReviewed = db.prepare(`
    SELECT COUNT(DISTINCT employee_id) AS n
      FROM kpi_scores
     WHERE scoring_period_id = ?
       AND status IN ('both_submitted','manager_submitted','disputed','reconciled')
  `).get(periodId).n;

  const reconciled = db.prepare(`
    SELECT COUNT(DISTINCT employee_id) AS n
      FROM kpi_scores
     WHERE scoring_period_id = ? AND status = 'reconciled'
  `).get(periodId).n;

  const disputed = db.prepare(`
    SELECT COUNT(*) AS n
      FROM kpi_scores
     WHERE scoring_period_id = ? AND status = 'disputed'
  `).get(periodId).n;

  return { total_employees: total, self_submitted: submitted, manager_reviewed: managerReviewed, reconciled, disputed };
}

// ── GET /api/periods/available?type=weekly&year=2025 ──────────────────────────
// Returns all non-future periods for a type+year (auto-creates them).
router.get('/available', requireAuth, (req, res) => {
  const { type, year } = req.query;
  const validTypes = db.prepare('SELECT key FROM frequency_configs').all().map(r => r.key);
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
  }
  const y = parseInt(year);
  if (!y || y < 2025 || y > 2047) {
    return res.status(400).json({ error: 'year must be between 2025 and 2047' });
  }
  const periods = getAvailablePeriodsForYear(type, y);
  res.json(periods);
});

// ── GET /api/periods/defaults ─────────────────────────────────────────────────
// Returns current default period for each type.
router.get('/defaults', requireAuth, (req, res) => {
  const types = db.prepare('SELECT key FROM frequency_configs').all().map(r => r.key);
  const defaults = {};
  for (const type of types) {
    defaults[type] = getCurrentDefaultPeriod(type);
  }
  res.json(defaults);
});

// ── GET /api/periods ──────────────────────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const periods = db.prepare(`
    SELECT * FROM scoring_periods ORDER BY start_date DESC
  `).all();

  const enriched = periods.map(p => ({
    ...p,
    stats: getPeriodStats(p.id),
  }));

  res.json(enriched);
});

// ── GET /api/periods/active ───────────────────────────────────────────────────
router.get('/active', requireAuth, (req, res) => {
  const periods = db.prepare(`
    SELECT * FROM scoring_periods WHERE is_active = 1 ORDER BY start_date DESC
  `).all();
  res.json(periods);
});

// ── GET /api/periods/:id ──────────────────────────────────────────────────────
router.get('/:id', requireAuth, (req, res) => {
  const period = db.prepare('SELECT * FROM scoring_periods WHERE id = ?').get(req.params.id);
  if (!period) return res.status(404).json({ error: 'Period not found' });
  res.json({ ...period, stats: getPeriodStats(period.id) });
});

// ── PUT /api/periods/:id ──────────────────────────────────────────────────────
router.put('/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const period = db.prepare('SELECT * FROM scoring_periods WHERE id = ?').get(id);
  if (!period) return res.status(404).json({ error: 'Period not found' });

  const { label, is_active } = req.body;
  const newLabel  = label?.trim() || period.label;
  const newActive = is_active !== undefined ? (is_active ? 1 : 0) : period.is_active;

  db.prepare(`UPDATE scoring_periods SET label=?, is_active=? WHERE id=?`).run(newLabel, newActive, id);
  const updated = db.prepare('SELECT * FROM scoring_periods WHERE id = ?').get(id);
  res.json({ ...updated, stats: getPeriodStats(id) });
});

// ── DELETE /api/periods/:id ───────────────────────────────────────────────────
router.delete('/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const period = db.prepare('SELECT * FROM scoring_periods WHERE id = ?').get(id);
  if (!period) return res.status(404).json({ error: 'Period not found' });

  const scoreCount = db.prepare('SELECT COUNT(*) AS n FROM kpi_scores WHERE scoring_period_id = ?').get(id).n;
  if (scoreCount > 0) {
    return res.status(409).json({
      error: `Cannot delete: ${scoreCount} score record(s) exist for this period. Close it instead.`,
    });
  }

  db.prepare('DELETE FROM scoring_periods WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
