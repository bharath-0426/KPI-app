const express = require('express');
const { db } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');
const { getVisibleEmployeeIds } = require('../lib/hierarchy');

const router = express.Router();

/**
 * Build distribution state for a manager in a given period.
 * Only shows raw_100 templates where the manager's role is the designated
 * distributor (via kpi_template_scored_by). Recipients are all active
 * employees in the full subtree who have the template assigned.
 */
function getDistributionGroups(managerId, periodId) {
  const manager = db.prepare('SELECT role_id FROM employees WHERE id = ?').get(managerId);
  if (!manager?.role_id) return [];

  const period = db.prepare('SELECT * FROM scoring_periods WHERE id = ?').get(periodId);
  if (!period) return [];

  // Only templates where this manager's role is the designated distributor
  // AND the template's frequency matches the period's type (exact match)
  const templates = db.prepare(`
    SELECT kt.*, ka.name AS attribute_name, ka.display_order AS attr_order
      FROM kpi_templates kt
      JOIN kpi_attributes ka ON ka.id = kt.attribute_id
      JOIN kpi_template_scored_by sb ON sb.template_id = kt.id AND sb.role_id = ?
     WHERE kt.score_type = 'raw_100'
       AND kt.frequency = ?
     ORDER BY ka.display_order, kt.display_order
  `).all(manager.role_id, period.period_type);

  if (templates.length === 0) return [];

  // Full subtree of this manager (excluding self)
  const subIds = getVisibleEmployeeIds(managerId).filter(id => id !== managerId);
  if (subIds.length === 0) return [];

  const subPh = subIds.map(() => '?').join(',');

  const groups = [];
  for (const tmpl of templates) {
    // Recipients = subtree employees who have this template assigned (by role or dept)
    const recipients = db.prepare(`
      SELECT DISTINCT e.id, e.name, e.email, e.role_id, e.department_id,
             r.name AS role_name
        FROM employees e
        LEFT JOIN roles r ON r.id = e.role_id
        JOIN kpi_template_assignments ta ON ta.template_id = ?
          AND (
            ta.role_id = e.role_id
            OR (ta.dept_id = e.department_id
                AND NOT EXISTS (
                  SELECT 1 FROM kpi_template_assignments ta2
                   WHERE ta2.template_id = ta.template_id AND ta2.role_id IS NOT NULL
                ))
          )
       WHERE e.id IN (${subPh})
         AND e.is_active = 1
    `).all(tmpl.id, ...subIds);

    if (recipients.length === 0) continue;

    // Look up existing distribution
    const dist = db.prepare(`
      SELECT * FROM rupee_distributions
       WHERE distributor_id = ? AND scoring_period_id = ? AND kpi_template_id = ?
    `).get(managerId, periodId, tmpl.id);

    let allocations = [];
    if (dist) {
      const items = db.prepare(`
        SELECT * FROM rupee_distribution_items WHERE distribution_id = ?
      `).all(dist.id);
      const itemMap = {};
      items.forEach(i => { itemMap[i.recipient_id] = i.amount; });
      allocations = recipients.map(r => ({
        employee_id: r.id,
        employee_name: r.name,
        role_name: r.role_name,
        amount: itemMap[r.id] ?? 0,
      }));
    } else {
      allocations = recipients.map(r => ({
        employee_id: r.id,
        employee_name: r.name,
        role_name: r.role_name,
        amount: 0,
      }));
    }

    const total = allocations.reduce((s, a) => s + a.amount, 0);

    groups.push({
      kpi_template: tmpl,
      allocations,
      total,
      distribution_id: dist?.id ?? null,
      is_submitted: total === 100,
    });
  }

  return groups;
}

// ── GET /api/distribution/frequencies ────────────────────────────────────────
// Returns the period types this user is a designated distributor for.
router.get('/frequencies', requireAuth, (req, res) => {
  if (req.employee.is_admin) {
    const rows = db.prepare(`
      SELECT DISTINCT kt.frequency
        FROM kpi_templates kt
        JOIN kpi_template_scored_by sb ON sb.template_id = kt.id
       WHERE kt.score_type = 'raw_100'
    `).all();
    return res.json(rows.map(r => r.frequency));
  }

  const manager = db.prepare('SELECT role_id FROM employees WHERE id = ?').get(req.employee.id);
  if (!manager?.role_id) return res.json([]);

  const rows = db.prepare(`
    SELECT DISTINCT kt.frequency
      FROM kpi_templates kt
      JOIN kpi_template_scored_by sb ON sb.template_id = kt.id AND sb.role_id = ?
     WHERE kt.score_type = 'raw_100'
  `).all(manager.role_id);

  res.json(rows.map(r => r.frequency));
});

// ── GET /api/distribution/:periodId ──────────────────────────────────────────
router.get('/:periodId', requireAuth, (req, res) => {
  const periodId = parseInt(req.params.periodId);
  const period = db.prepare('SELECT * FROM scoring_periods WHERE id = ?').get(periodId);
  if (!period) return res.status(404).json({ error: 'Period not found' });

  if (req.employee.is_admin) {
    // Return all distributors' groups for admin (read-only view)
    const distributors = db.prepare(`
      SELECT DISTINCT e.id, e.name, r.name AS role_name
        FROM employees e
        JOIN roles r ON r.id = e.role_id
        JOIN kpi_template_scored_by sb ON sb.role_id = e.role_id
        JOIN kpi_templates kt ON kt.id = sb.template_id AND kt.score_type = 'raw_100'
       WHERE e.is_active = 1
       ORDER BY r.hierarchy_level, e.name
    `).all();

    const allGroups = [];
    for (const dist of distributors) {
      const groups = getDistributionGroups(dist.id, periodId);
      groups.forEach(g => allGroups.push({
        ...g,
        distributor: { id: dist.id, name: dist.name, role_name: dist.role_name },
      }));
    }

    const allFreqs = db.prepare(`
      SELECT DISTINCT kt.frequency FROM kpi_templates kt
        JOIN kpi_template_scored_by sb ON sb.template_id = kt.id
       WHERE kt.score_type = 'raw_100'
    `).all().map(r => r.frequency);

    return res.json({ period, groups: allGroups, distributor_frequencies: allFreqs, is_admin_view: true });
  }

  const groups = getDistributionGroups(req.employee.id, periodId);

  // All frequencies this manager has raw_100 distribution templates in (for UI hint)
  const manager = db.prepare('SELECT role_id FROM employees WHERE id = ?').get(req.employee.id);
  const allFreqs = manager?.role_id ? db.prepare(`
    SELECT DISTINCT kt.frequency
      FROM kpi_templates kt
      JOIN kpi_template_scored_by sb ON sb.template_id = kt.id AND sb.role_id = ?
     WHERE kt.score_type = 'raw_100'
  `).all(manager.role_id).map(r => r.frequency) : [];

  res.json({ period, groups, distributor_frequencies: allFreqs });
});

// ── POST /api/distribution/:periodId/:templateId ──────────────────────────────
// Save (or update) a distribution. Body: { allocations: [{employee_id, amount}] }
router.post('/:periodId/:templateId', requireAuth, (req, res) => {
  const periodId = parseInt(req.params.periodId);
  const templateId = parseInt(req.params.templateId);
  const { allocations } = req.body;

  if (!Array.isArray(allocations) || allocations.length === 0) {
    return res.status(400).json({ error: 'allocations array is required' });
  }

  const period = db.prepare('SELECT * FROM scoring_periods WHERE id = ?').get(periodId);
  if (!period) return res.status(404).json({ error: 'Period not found' });
  if (!period.is_active) return res.status(400).json({ error: 'This scoring period is closed' });

  const manager = db.prepare('SELECT role_id FROM employees WHERE id = ?').get(req.employee.id);

  const template = db.prepare('SELECT * FROM kpi_templates WHERE id = ?').get(templateId);
  if (!template || template.score_type !== 'raw_100') {
    return res.status(400).json({ error: 'Template not found or not a raw_100 type' });
  }

  if (template.frequency !== period.period_type) {
    return res.status(400).json({ error: `This KPI is a ${template.frequency} metric and cannot be distributed in a ${period.period_type} period` });
  }

  // Verify this manager's role is the designated distributor for this template
  const isDesignated = db.prepare(
    'SELECT 1 FROM kpi_template_scored_by WHERE template_id = ? AND role_id = ? LIMIT 1'
  ).get(templateId, manager.role_id);
  if (!isDesignated) {
    return res.status(403).json({ error: 'Your role is not designated to distribute this template' });
  }

  // Validate sum = 100
  const total = allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  if (total !== 100) {
    return res.status(400).json({ error: `Allocations must sum to exactly 100 (currently ${total})` });
  }

  // Validate all recipients are in the subtree and have this template assigned
  const subIds = new Set(getVisibleEmployeeIds(req.employee.id).filter(id => id !== req.employee.id));

  for (const a of allocations) {
    if (!subIds.has(a.employee_id)) {
      return res.status(403).json({ error: `Employee ${a.employee_id} is not in your team` });
    }
    const emp = db.prepare('SELECT role_id, department_id FROM employees WHERE id = ?').get(a.employee_id);
    const assigned = db.prepare(`
      SELECT 1 FROM kpi_template_assignments
       WHERE template_id = ? AND (role_id = ? OR dept_id = ?) LIMIT 1
    `).get(templateId, emp.role_id, emp.department_id);
    if (!assigned) {
      return res.status(400).json({ error: `Employee ${a.employee_id} does not have this KPI template` });
    }
  }

  const save = db.transaction(() => {
    // Upsert rupee_distributions
    let dist = db.prepare(`
      SELECT * FROM rupee_distributions
       WHERE distributor_id = ? AND scoring_period_id = ? AND kpi_template_id = ?
    `).get(req.employee.id, periodId, templateId);

    if (!dist) {
      const result = db.prepare(`
        INSERT INTO rupee_distributions (distributor_id, scoring_period_id, kpi_template_id)
        VALUES (?, ?, ?)
      `).run(req.employee.id, periodId, templateId);
      dist = { id: result.lastInsertRowid };
    }

    // Replace all items
    db.prepare('DELETE FROM rupee_distribution_items WHERE distribution_id = ?').run(dist.id);

    for (const a of allocations) {
      db.prepare(`
        INSERT INTO rupee_distribution_items (distribution_id, recipient_id, amount)
        VALUES (?, ?, ?)
      `).run(dist.id, a.employee_id, Number(a.amount));

      // Write into kpi_scores for this recipient
      const existing = db.prepare(`
        SELECT * FROM kpi_scores
         WHERE employee_id = ? AND kpi_template_id = ? AND scoring_period_id = ?
      `).get(a.employee_id, templateId, periodId);

      const amount = Number(a.amount);
      if (existing) {
        db.prepare(`
          UPDATE kpi_scores
             SET manager_score = ?, final_score = ?, status = 'reconciled',
                 updated_at = datetime('now')
           WHERE id = ?
        `).run(amount, amount, existing.id);
      } else {
        db.prepare(`
          INSERT INTO kpi_scores
            (employee_id, kpi_template_id, scoring_period_id,
             self_score, manager_score, final_score, status)
          VALUES (?, ?, ?, ?, ?, ?, 'reconciled')
        `).run(a.employee_id, templateId, periodId, amount, amount, amount);
      }
    }
  });

  save();
  const groups = getDistributionGroups(req.employee.id, periodId);
  res.json({ groups });
});

module.exports = router;
