const express = require('express');
const { db } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');
const { getVisibleEmployeeIds, getDirectReports } = require('../lib/hierarchy');
const { buildFreqLevel, computeAggregatedScore } = require('../lib/periods');
const { isPeriodOpen, getScoringWindows } = require('../lib/scoringWindow');

const router = express.Router();

// ── Score history helper ──────────────────────────────────────────────────────
function writeHistory(scoreId, employeeId, templateId, periodId, changedBy, changeType, oldValue, newValue, notes) {
  db.prepare(`
    INSERT INTO kpi_score_history
      (kpi_score_id, employee_id, kpi_template_id, scoring_period_id, changed_by, change_type, old_value, new_value, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(scoreId, employeeId, templateId, periodId, changedBy, changeType, oldValue ?? null, newValue ?? null, notes ?? null);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getThreshold() {
  const s = db.prepare("SELECT value FROM app_settings WHERE key = 'reconciliation_threshold'").get();
  return s ? parseFloat(s.value) : 1;
}

function evaluateStatus(selfScore, managerScore, scoreType) {
  if (selfScore === null || managerScore === null) return null;
  if (scoreType === 'raw_100') return 'reconciled';
  const diff = Math.abs(selfScore - managerScore);
  return diff >= getThreshold() ? 'disputed' : 'reconciled';
}

/**
 * Returns KPI templates + scores for an employee in a given period.
 *
 * - Only templates whose frequency level ≤ period level are included
 *   (e.g. a monthly KPI does NOT appear in a weekly period).
 * - For templates below the period's level, scores are auto-aggregated
 *   from child periods and marked is_aggregated=true (read-only).
 */
function getMyScores(employeeId, period) {
  const employee = db.prepare('SELECT role_id, department_id FROM employees WHERE id = ?').get(employeeId);
  if (!employee?.role_id) return [];

  const FREQ_LEVEL  = buildFreqLevel();
  const periodLevel = FREQ_LEVEL[period.period_type] || 1;

  // Fetch templates via junction table (role or dept assignment)
  // Use role-specific weight from assignment if available, else fall back to template weight
  const allTemplates = db.prepare(`
    SELECT DISTINCT t.id, t.role_id, t.attribute_id, t.sub_metric_name, t.measurement_description,
           t.scoring_guide, t.frequency, t.formula, t.calculation_guide,
           t.score_type, t.display_order, t.created_at,
           COALESCE(ta_role.weight_percentage, t.weight_percentage) AS weight_percentage,
           a.name AS attribute_name, a.display_order AS attribute_order,
           CASE WHEN sb.template_id IS NOT NULL THEN 1 ELSE 0 END AS is_externally_scored,
           stc.min_value AS stc_min, stc.max_value AS stc_max,
           stc.step AS stc_step, stc.higher_is_better AS stc_higher_is_better,
           stc.suffix AS stc_suffix
      FROM kpi_templates t
      JOIN kpi_template_assignments ta ON ta.template_id = t.id
      JOIN kpi_attributes a ON a.id = t.attribute_id
      LEFT JOIN kpi_template_assignments ta_role ON ta_role.template_id = t.id AND ta_role.role_id = ?
      LEFT JOIN kpi_template_scored_by sb ON sb.template_id = t.id
      LEFT JOIN score_type_configs stc ON stc.key = t.score_type
     WHERE ta.role_id = ?
        OR (ta.dept_id = ?
            AND NOT EXISTS (
              SELECT 1 FROM kpi_template_assignments ta2
               WHERE ta2.template_id = t.id AND ta2.role_id IS NOT NULL
            ))
     ORDER BY a.display_order, t.display_order
  `).all(employee.role_id, employee.role_id, employee.department_id);

  // Filter to templates whose frequency level ≤ this period's level
  const templates = allTemplates.filter(t => {
    const tLevel = FREQ_LEVEL[t.frequency] || 1;
    return tLevel <= periodLevel;
  });

  // Stored scores for this period
  const stored = db.prepare(`
    SELECT * FROM kpi_scores WHERE employee_id=? AND scoring_period_id=?
  `).all(employeeId, period.id);
  const scoreMap = {};
  stored.forEach(s => { scoreMap[s.kpi_template_id] = s; });

  return templates.map(t => {
    const tLevel = FREQ_LEVEL[t.frequency] || 1;

    if (tLevel < periodLevel) {
      // Aggregated — compute from child periods on the fly
      const agg      = computeAggregatedScore(employeeId, t.id, t.frequency, period);
      const override = scoreMap[t.id];
      return {
        template: t,
        score: {
          self_score:    agg.self_score,
          manager_score: agg.manager_score,
          final_score:   override?.final_score ?? null,
          status:        override?.status ?? 'aggregated',
          self_notes:    null,
          manager_notes: override?.manager_notes ?? null,
          is_aggregated: true,
          child_count:   agg.child_count,
          child_scores:  agg.child_scores,
        },
      };
    }

    return { template: t, score: scoreMap[t.id] || null };
  });
}

// ── GET /api/scoring/:periodId/my ─────────────────────────────────────────────
router.get('/:periodId/my', requireAuth, (req, res) => {
  const periodId = parseInt(req.params.periodId);
  const period = db.prepare('SELECT * FROM scoring_periods WHERE id=?').get(periodId);
  if (!period) return res.status(404).json({ error: 'Period not found' });

  const items = getMyScores(req.employee.id, period);
  const window = isPeriodOpen(period);
  res.json({ period, items, window });
});

// ── POST /api/scoring/:periodId/my ───────────────────────────────────────────
router.post('/:periodId/my', requireAuth, (req, res) => {
  const periodId = parseInt(req.params.periodId);
  const period = db.prepare('SELECT * FROM scoring_periods WHERE id=?').get(periodId);
  if (!period) return res.status(404).json({ error: 'Period not found' });
  if (!period.is_active) return res.status(400).json({ error: 'This scoring period is closed' });

  // Block future periods
  const today = new Date().toISOString().slice(0, 10);
  if (period.start_date > today) {
    return res.status(400).json({ error: 'Cannot submit scores for a future period' });
  }

  // Enforce scoring window
  const windowStatus = isPeriodOpen(period);
  if (!windowStatus.open) {
    return res.status(400).json({ error: windowStatus.reason, opens_on: windowStatus.opens_on });
  }

  const { scores } = req.body;
  if (!Array.isArray(scores) || scores.length === 0) {
    return res.status(400).json({ error: 'scores array is required' });
  }

  const periodLevel = buildFreqLevel()[period.period_type] || 1;
  const employee = db.prepare('SELECT role_id, department_id FROM employees WHERE id=?').get(req.employee.id);

  db.transaction(() => {
    for (const item of scores) {
      const { kpi_template_id, self_score, self_notes } = item;

      // Verify template is assigned to this employee's role or dept
      const assignment = db.prepare(`
        SELECT ta.id FROM kpi_template_assignments ta
         WHERE ta.template_id = ? AND (ta.role_id = ? OR ta.dept_id = ?)
         LIMIT 1
      `).get(kpi_template_id, employee.role_id, employee.department_id);
      const template = assignment
        ? db.prepare('SELECT * FROM kpi_templates WHERE id=?').get(kpi_template_id)
        : null;
      if (!template) continue;
      if (template.score_type === 'raw_100') continue;

      // Skip aggregated templates — they can't be manually scored
      const tLevel = buildFreqLevel()[template.frequency] || 1;
      if (tLevel < periodLevel) continue;

      const existing = db.prepare(`
        SELECT * FROM kpi_scores
         WHERE employee_id=? AND kpi_template_id=? AND scoring_period_id=?
      `).get(req.employee.id, kpi_template_id, periodId);

      if (existing) {
        if (existing.status === 'reconciled') continue;
        const newStatus = existing.status === 'manager_submitted'
          ? evaluateStatus(self_score, existing.manager_score, template.score_type) || 'both_submitted'
          : 'self_submitted';
        const finalScore = newStatus === 'reconciled' ? existing.manager_score : existing.final_score;
        db.prepare(`
          UPDATE kpi_scores
             SET self_score=?, self_notes=?, status=?, final_score=?, updated_at=datetime('now')
           WHERE id=?
        `).run(self_score, self_notes || null, newStatus, finalScore, existing.id);
        writeHistory(existing.id, req.employee.id, kpi_template_id, periodId, req.employee.id, 'self_score', existing.self_score, self_score, self_notes || null);
      } else {
        const result = db.prepare(`
          INSERT INTO kpi_scores
            (employee_id, kpi_template_id, scoring_period_id, self_score, self_notes, status)
          VALUES (?,?,?,?,?,'self_submitted')
        `).run(req.employee.id, kpi_template_id, periodId, self_score, self_notes || null);
        writeHistory(result.lastInsertRowid, req.employee.id, kpi_template_id, periodId, req.employee.id, 'self_score', null, self_score, self_notes || null);
      }
    }
  })();

  const items = getMyScores(req.employee.id, period);
  res.json({ items });
});

// ── GET /api/scoring/:periodId/reports ───────────────────────────────────────
router.get('/:periodId/reports', requireAuth, (req, res) => {
  const periodId = parseInt(req.params.periodId);
  const period = db.prepare('SELECT * FROM scoring_periods WHERE id=?').get(periodId);
  if (!period) return res.status(404).json({ error: 'Period not found' });

  let visibleIds;
  if (req.employee.is_admin) {
    visibleIds = db.prepare(
      'SELECT id FROM employees WHERE is_active=1 AND role_id IS NOT NULL AND id != ?'
    ).all(req.employee.id).map(r => r.id);
  } else {
    visibleIds = getVisibleEmployeeIds(req.employee.id).filter(id => id !== req.employee.id);
  }
  if (visibleIds.length === 0) return res.json([]);

  const ph = visibleIds.map(() => '?').join(',');
  const reports = db.prepare(`
    SELECT e.id, e.name, e.email, e.role_id, e.department_id,
           r.name AS role_name, r.hierarchy_level,
           d.name AS department_name
      FROM employees e
      LEFT JOIN roles r ON r.id = e.role_id
      LEFT JOIN departments d ON d.id = e.department_id
     WHERE e.id IN (${ph}) AND e.is_active=1 AND e.role_id IS NOT NULL
     ORDER BY r.hierarchy_level, e.name
  `).all(...visibleIds);

  const freqLevel = buildFreqLevel();
  const periodLevel = freqLevel[period.period_type] || 1;

  // Batch-fetch all scores for visible employees in a single query
  const allScoreRows = reports.length > 0 ? (() => {
    const empIds = reports.map(e => e.id);
    const eph = empIds.map(() => '?').join(',');
    return db.prepare(`
      SELECT employee_id, status, COUNT(*) AS count
        FROM kpi_scores
       WHERE employee_id IN (${eph}) AND scoring_period_id = ?
       GROUP BY employee_id, status
    `).all(...empIds, periodId);
  })() : [];

  const scoresByEmp = {};
  for (const s of allScoreRows) {
    if (!scoresByEmp[s.employee_id]) scoresByEmp[s.employee_id] = {};
    scoresByEmp[s.employee_id][s.status] = s.count;
  }

  // Pre-fetch template frequencies per unique (role_id, dept_id) combo to avoid N queries
  const comboMap = new Map();
  for (const emp of reports) {
    const key = `${emp.role_id}-${emp.department_id}`;
    if (!comboMap.has(key)) comboMap.set(key, { role_id: emp.role_id, dept_id: emp.department_id });
  }
  const templateCountByCombo = {};
  for (const [key, combo] of comboMap) {
    const tmplFreqs = db.prepare(`
      SELECT DISTINCT t.frequency FROM kpi_templates t
        JOIN kpi_template_assignments ta ON ta.template_id = t.id
       WHERE ta.role_id = ? OR ta.dept_id = ?
    `).all(combo.role_id, combo.dept_id);
    templateCountByCombo[key] = tmplFreqs.filter(t => (freqLevel[t.frequency] || 1) <= periodLevel).length;
  }

  const submittedStatuses = new Set(['self_submitted','both_submitted','manager_submitted','disputed','reconciled']);

  const enriched = reports.map(emp => {
    const statusMap = scoresByEmp[emp.id] || {};
    const totalTemplates = templateCountByCombo[`${emp.role_id}-${emp.department_id}`] ?? 0;

    return {
      ...emp,
      total_templates: totalTemplates,
      status_summary: statusMap,
      has_self_submitted: Object.keys(statusMap).some(s => submittedStatuses.has(s)),
      has_disputes: (statusMap['disputed'] || 0) > 0,
    };
  });

  res.json(enriched);
});

// ── GET /api/scoring/:periodId/reports/:employeeId ───────────────────────────
router.get('/:periodId/reports/:employeeId', requireAuth, (req, res) => {
  const periodId = parseInt(req.params.periodId);
  const targetId = parseInt(req.params.employeeId);

  if (!req.employee.is_admin) {
    const visible = getVisibleEmployeeIds(req.employee.id);
    if (!visible.includes(targetId)) return res.status(403).json({ error: 'Access denied' });
  }

  const period = db.prepare('SELECT * FROM scoring_periods WHERE id=?').get(periodId);
  if (!period) return res.status(404).json({ error: 'Period not found' });

  const target = db.prepare(`
    SELECT e.*, r.name AS role_name, d.name AS department_name
      FROM employees e
      LEFT JOIN roles r ON r.id = e.role_id
      LEFT JOIN departments d ON d.id = e.department_id
     WHERE e.id=?
  `).get(targetId);
  if (!target) return res.status(404).json({ error: 'Employee not found' });

  const items = getMyScores(targetId, period);
  res.json({ period, employee: target, items });
});

// ── POST /api/scoring/:periodId/reports/:employeeId ──────────────────────────
router.post('/:periodId/reports/:employeeId', requireAuth, (req, res) => {
  const periodId = parseInt(req.params.periodId);
  const targetId = parseInt(req.params.employeeId);

  if (!req.employee.is_admin) {
    const visible = getVisibleEmployeeIds(req.employee.id);
    if (!visible.includes(targetId) || targetId === req.employee.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
  }

  const period = db.prepare('SELECT * FROM scoring_periods WHERE id=?').get(periodId);
  if (!period) return res.status(404).json({ error: 'Period not found' });
  if (!period.is_active) return res.status(400).json({ error: 'This scoring period is closed' });

  const today = new Date().toISOString().slice(0, 10);
  if (period.start_date > today) {
    return res.status(400).json({ error: 'Cannot submit scores for a future period' });
  }

  const { scores } = req.body;
  if (!Array.isArray(scores) || scores.length === 0) {
    return res.status(400).json({ error: 'scores array is required' });
  }

  const target = db.prepare('SELECT role_id, department_id FROM employees WHERE id=?').get(targetId);
  const periodLevel = buildFreqLevel()[period.period_type] || 1;

  db.transaction(() => {
    for (const item of scores) {
      const { kpi_template_id, manager_score, manager_notes } = item;

      // Verify template is assigned to this employee's role or dept
      const assignment = db.prepare(`
        SELECT ta.id FROM kpi_template_assignments ta
         WHERE ta.template_id = ? AND (ta.role_id = ? OR ta.dept_id = ?)
         LIMIT 1
      `).get(kpi_template_id, target.role_id, target.department_id);
      const template = assignment
        ? db.prepare('SELECT * FROM kpi_templates WHERE id=?').get(kpi_template_id)
        : null;
      if (!template) continue;
      if (template.score_type === 'raw_100') continue;

      // Block manager scoring on externally-scored templates
      const isExternallyScored = db.prepare(
        'SELECT COUNT(*) AS n FROM kpi_template_scored_by WHERE template_id = ?'
      ).get(kpi_template_id).n > 0;
      if (isExternallyScored) continue;

      const tLevel = buildFreqLevel()[template.frequency] || 1;
      if (tLevel < periodLevel) continue; // skip aggregated

      const existing = db.prepare(`
        SELECT * FROM kpi_scores
         WHERE employee_id=? AND kpi_template_id=? AND scoring_period_id=?
      `).get(targetId, kpi_template_id, periodId);

      if (existing) {
        if (existing.status === 'reconciled') continue;
        const newStatus = existing.status === 'self_submitted'
          ? evaluateStatus(existing.self_score, manager_score, template.score_type) || 'both_submitted'
          : 'manager_submitted';
        const finalScore = newStatus === 'reconciled' ? manager_score : existing.final_score;
        db.prepare(`
          UPDATE kpi_scores
             SET manager_score=?, manager_notes=?, status=?, final_score=?, updated_at=datetime('now')
           WHERE id=?
        `).run(manager_score, manager_notes || null, newStatus, finalScore, existing.id);
        writeHistory(existing.id, targetId, kpi_template_id, periodId, req.employee.id, 'manager_score', existing.manager_score, manager_score, manager_notes || null);
      } else {
        const result = db.prepare(`
          INSERT INTO kpi_scores
            (employee_id, kpi_template_id, scoring_period_id, manager_score, manager_notes, status)
          VALUES (?,?,?,?,?,'manager_submitted')
        `).run(targetId, kpi_template_id, periodId, manager_score, manager_notes || null);
        writeHistory(result.lastInsertRowid, targetId, kpi_template_id, periodId, req.employee.id, 'manager_score', null, manager_score, manager_notes || null);
      }
    }
  })();

  const items = getMyScores(targetId, period);
  res.json({ items });
});

// GET /api/scoring/history/:scoreId
router.get('/history/:scoreId', requireAuth, (req, res) => {
  const scoreId = parseInt(req.params.scoreId);
  const score = db.prepare('SELECT * FROM kpi_scores WHERE id = ?').get(scoreId);
  if (!score) return res.status(404).json({ error: 'Score not found' });

  const history = db.prepare(`
    SELECT h.*, e.name AS changed_by_name
      FROM kpi_score_history h
      JOIN employees e ON e.id = h.changed_by
     WHERE h.kpi_score_id = ?
     ORDER BY h.changed_at DESC
  `).all(scoreId);

  res.json(history);
});

module.exports = router;
