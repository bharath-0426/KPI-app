const express = require('express');
const { db } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');
const { getVisibleEmployeeIds } = require('../lib/hierarchy');
const { FREQ_LEVEL } = require('../lib/periods');

const router = express.Router();

// ── GET /api/ratings/team?periodId=X ─────────────────────────────────────────
router.get('/team', requireAuth, (req, res) => {
  const periodId = parseInt(req.query.periodId);
  const viewer = req.employee;

  const period = db.prepare('SELECT * FROM scoring_periods WHERE id = ?').get(periodId);
  if (!period) return res.status(404).json({ error: 'Period not found' });

  if (viewer.is_admin) {
    // Return all externally-scored KPI data across the whole org for this period
    const allTemplates = db.prepare(`
      SELECT DISTINCT kt.*, ka.name AS attribute_name, ka.display_order AS attribute_order
        FROM kpi_templates kt
        JOIN kpi_template_scored_by sb ON sb.template_id = kt.id
        JOIN kpi_attributes ka ON ka.id = kt.attribute_id
       WHERE kt.score_type != 'raw_100'
         AND kt.frequency = ?
       ORDER BY ka.display_order, kt.display_order
    `).all(period.period_type);

    if (allTemplates.length === 0) {
      return res.json({ employees: [], templates: [], period, scorer_frequencies: [], is_admin_view: true });
    }

    const templateIds = allTemplates.map(t => t.id);
    const tph = templateIds.map(() => '?').join(',');

    const allEmployees = db.prepare(`
      SELECT DISTINCT e.id, e.name, e.email, e.role_id, e.department_id,
             r.name AS role_name, d.name AS department_name
        FROM employees e
        JOIN roles r ON r.id = e.role_id
        LEFT JOIN departments d ON d.id = e.department_id
        JOIN kpi_template_assignments ta ON (ta.role_id = e.role_id OR ta.dept_id = e.department_id)
       WHERE ta.template_id IN (${tph})
         AND e.is_active = 1
         AND e.id != ?
       ORDER BY r.hierarchy_level, e.name
    `).all(...templateIds, viewer.id);

    if (allEmployees.length === 0) {
      return res.json({ employees: [], templates: allTemplates, period, scorer_frequencies: [], is_admin_view: true });
    }

    const empIds = allEmployees.map(e => e.id);
    const emph = empIds.map(() => '?').join(',');

    const existingScores = db.prepare(`
      SELECT * FROM kpi_scores
       WHERE employee_id IN (${emph})
         AND kpi_template_id IN (${tph})
         AND scoring_period_id = ?
    `).all(...empIds, ...templateIds, periodId);

    const scoreMap = {};
    for (const s of existingScores) {
      scoreMap[`${s.employee_id}_${s.kpi_template_id}`] = s;
    }

    const enriched = allEmployees.map(emp => {
      const scores = {};
      for (const t of allTemplates) {
        const assigned = db.prepare(`
          SELECT 1 FROM kpi_template_assignments
           WHERE template_id = ? AND (role_id = ? OR dept_id = ?) LIMIT 1
        `).get(t.id, emp.role_id, emp.department_id);
        if (assigned) {
          scores[t.id] = scoreMap[`${emp.id}_${t.id}`] || null;
        }
      }
      return { ...emp, scores };
    }).filter(emp => Object.keys(emp.scores).length > 0);

    return res.json({ employees: enriched, templates: allTemplates, period, scorer_frequencies: [], is_admin_view: true });
  }

  if (!viewer.role_id) return res.json({ employees: [], templates: [], period: null, scorer_frequencies: [] });

  // All templates this role is designated to score — exclude raw_100 (those belong to ₹100 distribution)
  const allScorerTemplates = db.prepare(`
    SELECT kt.*, ka.name AS attribute_name, ka.display_order AS attribute_order
      FROM kpi_templates kt
      JOIN kpi_template_scored_by sb ON sb.template_id = kt.id
      JOIN kpi_attributes ka ON ka.id = kt.attribute_id
     WHERE sb.role_id = ?
       AND kt.score_type != 'raw_100'
     ORDER BY ka.display_order, kt.display_order
  `).all(viewer.role_id);

  // Unique frequencies this scorer has templates in — sent back so frontend can suggest correct period type
  const scorer_frequencies = [...new Set(allScorerTemplates.map(t => t.frequency))];

  // Strict exact-frequency match: a KPI is only rateable in its own base frequency period
  const scorerTemplates = allScorerTemplates.filter(t => t.frequency === period.period_type);

  if (scorerTemplates.length === 0) {
    return res.json({ employees: [], templates: [], period, scorer_frequencies });
  }

  const templateIds = scorerTemplates.map(t => t.id);

  // Get reportees (excluding self)
  const reporteeIds = getVisibleEmployeeIds(viewer.id).filter(id => id !== viewer.id);
  if (reporteeIds.length === 0) {
    return res.json({ employees: [], templates: scorerTemplates, period, scorer_frequencies });
  }

  const eph = reporteeIds.map(() => '?').join(',');
  const tph = templateIds.map(() => '?').join(',');

  // Get reportees that have at least one of these templates assigned
  const reportees = db.prepare(`
    SELECT DISTINCT e.id, e.name, e.email, e.role_id, e.department_id,
           r.name AS role_name, d.name AS department_name
      FROM employees e
      JOIN roles r ON r.id = e.role_id
      LEFT JOIN departments d ON d.id = e.department_id
      JOIN kpi_template_assignments ta ON (ta.role_id = e.role_id OR ta.dept_id = e.department_id)
     WHERE e.id IN (${eph})
       AND ta.template_id IN (${tph})
       AND e.is_active = 1
     ORDER BY r.hierarchy_level, e.name
  `).all(...reporteeIds, ...templateIds);

  if (reportees.length === 0) {
    return res.json({ employees: [], templates: scorerTemplates, period, scorer_frequencies });
  }

  const empIds = reportees.map(e => e.id);
  const emph = empIds.map(() => '?').join(',');

  // Fetch existing scores
  const existingScores = db.prepare(`
    SELECT * FROM kpi_scores
     WHERE employee_id IN (${emph})
       AND kpi_template_id IN (${tph})
       AND scoring_period_id = ?
  `).all(...empIds, ...templateIds, periodId);

  const scoreMap = {};
  for (const s of existingScores) {
    scoreMap[`${s.employee_id}_${s.kpi_template_id}`] = s;
  }

  // For each reportee, determine which templates apply to them
  const enriched = reportees.map(emp => {
    const scores = {};
    for (const t of scorerTemplates) {
      const assigned = db.prepare(`
        SELECT 1 FROM kpi_template_assignments
         WHERE template_id = ? AND (role_id = ? OR dept_id = ?) LIMIT 1
      `).get(t.id, emp.role_id, emp.department_id);
      if (assigned) {
        scores[t.id] = scoreMap[`${emp.id}_${t.id}`] || null;
      }
    }
    return { ...emp, scores };
  }).filter(emp => Object.keys(emp.scores).length > 0);

  res.json({ employees: enriched, templates: scorerTemplates, period, scorer_frequencies });
});

// ── POST /api/ratings/team/:periodId ─────────────────────────────────────────
router.post('/team/:periodId', requireAuth, (req, res) => {
  const periodId = parseInt(req.params.periodId);
  const viewer = req.employee;
  const { ratings } = req.body;

  if (!Array.isArray(ratings) || ratings.length === 0) {
    return res.status(400).json({ error: 'ratings array is required' });
  }

  const period = db.prepare('SELECT * FROM scoring_periods WHERE id = ?').get(periodId);
  if (!period) return res.status(404).json({ error: 'Period not found' });
  if (!period.is_active) return res.status(400).json({ error: 'Period is closed' });

  const today = new Date().toISOString().slice(0, 10);
  if (period.start_date > today) {
    return res.status(400).json({ error: 'Cannot rate for a future period' });
  }

  // Valid templates for this scorer's role
  const validTemplateIds = new Set(
    db.prepare('SELECT template_id FROM kpi_template_scored_by WHERE role_id = ?')
      .all(viewer.role_id).map(r => r.template_id)
  );

  // Valid employee ids (reportees only, not self)
  const validEmpIds = new Set(
    getVisibleEmployeeIds(viewer.id).filter(id => id !== viewer.id)
  );

  db.transaction(() => {
    for (const { employee_id, kpi_template_id, final_score } of ratings) {
      if (!validTemplateIds.has(kpi_template_id)) continue;
      if (!validEmpIds.has(employee_id)) continue;
      if (final_score === null || final_score === undefined) continue;

      const existing = db.prepare(`
        SELECT * FROM kpi_scores
         WHERE employee_id = ? AND kpi_template_id = ? AND scoring_period_id = ?
      `).get(employee_id, kpi_template_id, periodId);

      if (existing) {
        db.prepare(`
          UPDATE kpi_scores
             SET final_score = ?, status = 'reconciled', reconciled_by = ?,
                 updated_at = datetime('now')
           WHERE id = ?
        `).run(final_score, viewer.id, existing.id);
      } else {
        db.prepare(`
          INSERT INTO kpi_scores
            (employee_id, kpi_template_id, scoring_period_id, final_score, status, reconciled_by)
          VALUES (?, ?, ?, ?, 'reconciled', ?)
        `).run(employee_id, kpi_template_id, periodId, final_score, viewer.id);
      }
    }
  })();

  res.json({ ok: true });
});

module.exports = router;
