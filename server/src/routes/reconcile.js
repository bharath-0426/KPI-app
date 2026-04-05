const express = require('express');
const { db } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');
const { getVisibleEmployeeIds } = require('../lib/hierarchy');

const router = express.Router();

/**
 * Who can reconcile a dispute?
 * The reconciler must be:
 *   1. In the current user's visible subtree (i.e. the employee is someone they manage)
 *   2. NOT the person who entered the manager_score (they can't reconcile their own score)
 *   3. At a higher hierarchy level than the employee's direct manager
 *
 * Practical mapping:
 *   TM dispute (TM self vs PL manager)  → PM or GH reconciles
 *   PL dispute (PL self vs PM manager)  → GH reconciles
 *   PM/EM dispute (self vs GH manager)  → GH reconciles (final authority)
 */
function getReconcilableDisputes(viewerId) {
  const viewer = db.prepare(`
    SELECT e.*, r.hierarchy_level
      FROM employees e
      LEFT JOIN roles r ON r.id = e.role_id
     WHERE e.id = ?
  `).get(viewerId);

  if (!viewer) return [];

  // Get all employees in the viewer's subtree (excluding self)
  const visibleIds = getVisibleEmployeeIds(viewerId).filter(id => id !== viewerId);
  if (visibleIds.length === 0) return [];

  const placeholders = visibleIds.map(() => '?').join(',');

  // Find all disputed scores for those employees
  const disputes = db.prepare(`
    SELECT
      ks.id AS score_id,
      ks.employee_id,
      ks.kpi_template_id,
      ks.scoring_period_id,
      ks.self_score,
      ks.manager_score,
      ks.final_score,
      ks.self_notes,
      ks.manager_notes,
      ks.status,
      ks.reconciliation_notes,
      ks.reconciled_by,
      ks.updated_at,

      e.name  AS employee_name,
      er.name AS employee_role,
      er.hierarchy_level AS employee_level,

      kt.sub_metric_name,
      COALESCE(ta_role.weight_percentage, kt.weight_percentage) AS weight_percentage,
      kt.score_type,
      kt.scoring_guide,

      ka.name AS attribute_name,

      sp.label AS period_label,
      sp.period_type,

      mgr.name AS manager_name,
      mgr.id   AS manager_id

    FROM kpi_scores ks
    JOIN employees e   ON e.id  = ks.employee_id
    JOIN roles er      ON er.id = e.role_id
    JOIN kpi_templates kt ON kt.id = ks.kpi_template_id
    JOIN kpi_attributes ka ON ka.id = kt.attribute_id
    JOIN scoring_periods sp ON sp.id = ks.scoring_period_id
    LEFT JOIN employees mgr ON mgr.id = e.reports_to
    LEFT JOIN kpi_template_assignments ta_role ON ta_role.template_id = kt.id AND ta_role.role_id = er.id

   WHERE ks.employee_id IN (${placeholders})
     AND ks.status = 'disputed'
   ORDER BY sp.start_date DESC, e.name, ka.display_order, kt.display_order
  `).all(...visibleIds);

  // Filter: viewer must outrank the employee's direct manager
  // (they shouldn't reconcile if they ARE the direct manager who set the manager_score)
  return disputes.filter(d => {
    if (viewer.is_admin) return true;
    // Viewer must not be the direct manager of the employee
    // (the direct manager already scored — the next level up reconciles)
    return d.manager_id !== viewerId;
  });
}

// ── GET /api/reconcile ────────────────────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const disputes = getReconcilableDisputes(req.employee.id);
  res.json(disputes);
});

// ── GET /api/reconcile/count ──────────────────────────────────────────────────
// Quick count for dashboard badges.
router.get('/count', requireAuth, (req, res) => {
  const disputes = getReconcilableDisputes(req.employee.id);
  res.json({ count: disputes.length });
});

// ── POST /api/reconcile/:scoreId ──────────────────────────────────────────────
router.post('/:scoreId', requireAuth, (req, res) => {
  const scoreId = parseInt(req.params.scoreId);
  const { final_score, reconciliation_notes } = req.body;

  if (final_score === null || final_score === undefined) {
    return res.status(400).json({ error: 'final_score is required' });
  }

  const score = db.prepare('SELECT * FROM kpi_scores WHERE id = ?').get(scoreId);
  if (!score) return res.status(404).json({ error: 'Score not found' });
  if (score.status !== 'disputed') {
    return res.status(400).json({ error: 'This score is not in disputed status' });
  }

  // Verify current user can reconcile this
  const reconcilable = getReconcilableDisputes(req.employee.id);
  if (!req.employee.is_admin && !reconcilable.find(d => d.score_id === scoreId)) {
    return res.status(403).json({ error: 'You are not authorised to reconcile this score' });
  }

  db.prepare(`
    UPDATE kpi_scores
       SET final_score = ?,
           reconciliation_notes = ?,
           reconciled_by = ?,
           status = 'reconciled',
           updated_at = datetime('now')
     WHERE id = ?
  `).run(final_score, reconciliation_notes || null, req.employee.id, scoreId);

  // Notify the employee whose score was reconciled
  const emp = db.prepare('SELECT e.name, kt.sub_metric_name, sp.label FROM kpi_scores ks JOIN employees e ON e.id = ks.employee_id JOIN kpi_templates kt ON kt.id = ks.kpi_template_id JOIN scoring_periods sp ON sp.id = ks.scoring_period_id WHERE ks.id = ?').get(scoreId);
  if (emp) {
    db.prepare(`INSERT INTO notifications (employee_id, type, message) VALUES (?, 'dispute_resolved', ?)`).run(
      score.employee_id,
      `Your dispute for "${emp.sub_metric_name}" (${emp.label}) has been resolved. Final score: ${final_score}.`
    );
  }

  // Write score history for reconciliation
  db.prepare(`
    INSERT INTO kpi_score_history
      (kpi_score_id, employee_id, kpi_template_id, scoring_period_id, changed_by, change_type, old_value, new_value, notes)
    VALUES (?, ?, ?, ?, ?, 'reconciled', ?, ?, ?)
  `).run(scoreId, score.employee_id, score.kpi_template_id, score.scoring_period_id, req.employee.id, score.final_score, final_score, reconciliation_notes || null);

  const updated = db.prepare('SELECT * FROM kpi_scores WHERE id = ?').get(scoreId);
  res.json(updated);
});

module.exports = router;
