const express = require('express');
const { db } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');
const { getVisibleEmployeeIds } = require('../lib/hierarchy');

const router = express.Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvRow(cells) {
  return cells.map(csvEscape).join(',');
}

/**
 * Get all visible employees with their full score data for a period.
 * Returns employees ordered by hierarchy level, then name.
 */
function getPeriodReportData(viewer, periodId) {
  let visibleIds;
  if (viewer.is_admin) {
    visibleIds = db.prepare('SELECT id FROM employees WHERE is_active = 1 AND role_id IS NOT NULL').all().map(r => r.id);
  } else {
    // Exclude the viewer themselves — managers see only their reporting chain
    visibleIds = getVisibleEmployeeIds(viewer.id).filter(id => id !== viewer.id);
  }
  if (visibleIds.length === 0) return { period: null, employees: [], templates: [] };

  const period = db.prepare('SELECT * FROM scoring_periods WHERE id = ?').get(periodId);
  if (!period) return { period: null, employees: [], templates: [] };

  const ph = visibleIds.map(() => '?').join(',');

  const employees = db.prepare(`
    SELECT e.id, e.employee_code, e.name, e.email,
           r.name AS role_name, r.hierarchy_level,
           d.name AS department_name,
           mgr.name AS manager_name
      FROM employees e
      LEFT JOIN roles r ON r.id = e.role_id
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN employees mgr ON mgr.id = e.reports_to
     WHERE e.id IN (${ph}) AND e.is_active = 1 AND e.role_id IS NOT NULL
     ORDER BY r.hierarchy_level, e.name
  `).all(...visibleIds);

  // Templates filtered by frequency — only include templates whose frequency
  // hierarchy_order <= the period's hierarchy_order (roll-up rule)
  const freqLevel = getPeriodFreqLevel(periodId);
  const templates = db.prepare(`
    SELECT DISTINCT kt.id, kt.sub_metric_name,
                    COALESCE(ta_role.weight_percentage, kt.weight_percentage) AS weight_percentage,
                    kt.score_type, kt.frequency,
                    ka.name AS attribute_name, ka.display_order AS attr_order,
                    r.name AS role_name, r.hierarchy_level, kt.display_order
      FROM kpi_templates kt
      JOIN kpi_attributes ka ON ka.id = kt.attribute_id
      JOIN roles r ON r.id = kt.role_id
      LEFT JOIN kpi_template_assignments ta_role ON ta_role.template_id = kt.id AND ta_role.role_id = r.id
      LEFT JOIN frequency_configs fc ON fc.key = kt.frequency
     WHERE r.id IN (
       SELECT DISTINCT role_id FROM employees WHERE id IN (${ph}) AND role_id IS NOT NULL
     )
       AND (fc.hierarchy_order IS NULL OR fc.hierarchy_order <= ${freqLevel})
     ORDER BY r.hierarchy_level, ka.display_order, kt.display_order
  `).all(...visibleIds);

  // All scores for this period
  const scores = db.prepare(`
    SELECT ks.*
      FROM kpi_scores ks
     WHERE ks.employee_id IN (${ph}) AND ks.scoring_period_id = ?
  `).all(...visibleIds, periodId);

  // Index scores by employee_id + template_id
  const scoreMap = {};
  for (const s of scores) {
    scoreMap[`${s.employee_id}_${s.kpi_template_id}`] = s;
  }

  return { period, employees, templates, scoreMap };
}

// ── GET /api/reports/periods ──────────────────────────────────────────────────
router.get('/periods', requireAuth, (req, res) => {
  const periods = db.prepare(`
    SELECT * FROM scoring_periods ORDER BY start_date DESC
  `).all();
  res.json(periods);
});

// ── GET /api/reports/period/:periodId ─────────────────────────────────────────
// JSON data for period summary report
router.get('/period/:periodId', requireAuth, (req, res) => {
  const periodId = parseInt(req.params.periodId);
  const { period, employees, templates, scoreMap } = getPeriodReportData(req.employee, periodId);

  if (!period) return res.status(404).json({ error: 'Period not found' });

  // Attach scores to each employee
  const enriched = employees.map(emp => {
    const empTemplates = templates.filter(t => t.role_name === emp.role_name);
    const empScores = empTemplates.map(t => {
      const s = scoreMap[`${emp.id}_${t.id}`] ?? null;
      return {
        template_id: t.id,
        sub_metric_name: t.sub_metric_name,
        attribute_name: t.attribute_name,
        weight_percentage: t.weight_percentage,
        score_type: t.score_type,
        self_score: s?.self_score ?? null,
        manager_score: s?.manager_score ?? null,
        final_score: s?.final_score ?? null,
        status: s?.status ?? 'pending',
      };
    });

    // Weighted score: sum(final_score / max_for_type * weight) for reconciled items
    const maxForType = { scale_2_5: 5, scale_1_5: 5, scale_1_10: 10, raw_100: 100, calculated: 10 };
    const reconciled = empScores.filter(s => s.status === 'reconciled' && s.final_score !== null);
    const totalWeight = reconciled.reduce((s, x) => s + x.weight_percentage, 0);
    const weightedScore = totalWeight > 0
      ? reconciled.reduce((sum, x) => {
          const max = maxForType[x.score_type] ?? 5;
          return sum + (x.final_score / max) * x.weight_percentage;
        }, 0) / 100 * 100  // out of 100
      : null;

    return { ...emp, scores: empScores, weighted_score: weightedScore ? parseFloat(weightedScore.toFixed(2)) : null };
  });

  res.json({ period, employees: enriched, templates });
});

// ── GET /api/reports/period/:periodId/csv ─────────────────────────────────────
// CSV download for period summary
router.get('/period/:periodId/csv', requireAuth, (req, res) => {
  const periodId = parseInt(req.params.periodId);
  const { period, employees, templates, scoreMap } = getPeriodReportData(req.employee, periodId);

  if (!period) return res.status(404).json({ error: 'Period not found' });

  const lines = [];

  // Header
  lines.push(buildCsvRow([`KPI Report — ${period.label}`, '', '', '', '', '']));
  lines.push('');

  // Group templates by role
  const templatesByRole = {};
  for (const t of templates) {
    if (!templatesByRole[t.role_name]) templatesByRole[t.role_name] = [];
    templatesByRole[t.role_name].push(t);
  }

  // One section per role
  const roleGroups = {};
  for (const emp of employees) {
    if (!roleGroups[emp.role_name]) roleGroups[emp.role_name] = [];
    roleGroups[emp.role_name].push(emp);
  }

  for (const [roleName, roleEmps] of Object.entries(roleGroups)) {
    const roleTemplates = templatesByRole[roleName] ?? [];
    lines.push(buildCsvRow([`Role: ${roleName}`, '', '', '', '']));

    // Column headers
    const headers = ['Employee Code', 'Employee', 'Manager', 'Status Summary'];
    for (const t of roleTemplates) {
      headers.push(`${t.sub_metric_name} (${t.weight_percentage}%)`);
    }
    headers.push('Weighted Score');
    lines.push(buildCsvRow(headers));

    for (const emp of roleEmps) {
      const scores = roleTemplates.map(t => {
        const s = scoreMap[`${emp.id}_${t.id}`];
        if (!s) return 'pending';
        if (s.final_score !== null) return s.final_score;
        if (s.status === 'disputed') return 'disputed';
        return s.status;
      });

      const reconciled = roleTemplates.filter(t => {
        const s = scoreMap[`${emp.id}_${t.id}`];
        return s?.status === 'reconciled';
      });
      const statusSummary = `${reconciled.length}/${roleTemplates.length} reconciled`;

      const maxForType = { scale_2_5: 5, scale_1_5: 5, scale_1_10: 10, raw_100: 100, calculated: 10 };
      const reconciledScores = roleTemplates.filter(t => {
        const s = scoreMap[`${emp.id}_${t.id}`];
        return s?.status === 'reconciled' && s.final_score !== null;
      });
      const ws = reconciledScores.length > 0
        ? (reconciledScores.reduce((sum, t) => {
            const s = scoreMap[`${emp.id}_${t.id}`];
            const max = maxForType[t.score_type] ?? 5;
            return sum + (s.final_score / max) * t.weight_percentage;
          }, 0) / 100 * 100).toFixed(2)
        : '';

      lines.push(buildCsvRow([emp.employee_code || '', emp.name, emp.manager_name || '', statusSummary, ...scores, ws]));
    }

    lines.push('');
  }

  const csv = lines.join('\r\n');
  const filename = `kpi-report-${period.label.replace(/\s+/g, '-')}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\uFEFF' + csv); // BOM for Excel
});

// ── GET /api/reports/employee/:employeeId/history ─────────────────────────────
// An employee's score history across all periods
router.get('/employee/:employeeId/history', requireAuth, (req, res) => {
  const targetId = parseInt(req.params.employeeId);

  if (!req.employee.is_admin && targetId !== req.employee.id) {
    const visible = getVisibleEmployeeIds(req.employee.id);
    if (!visible.includes(targetId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
  }

  const employee = db.prepare(`
    SELECT e.*, r.name AS role_name, d.name AS department_name
      FROM employees e
      LEFT JOIN roles r ON r.id = e.role_id
      LEFT JOIN departments d ON d.id = e.department_id
     WHERE e.id = ?
  `).get(targetId);
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const periods = db.prepare(`
    SELECT DISTINCT sp.*
      FROM scoring_periods sp
      JOIN kpi_scores ks ON ks.scoring_period_id = sp.id
     WHERE ks.employee_id = ?
     ORDER BY sp.start_date DESC
  `).all(targetId);

  const history = periods.map(period => {
    const periodFreqLevel = getPeriodFreqLevel(period.id);
    const scores = db.prepare(`
      SELECT ks.*,
             kt.sub_metric_name,
             COALESCE(ta_role.weight_percentage, kt.weight_percentage) AS weight_percentage,
             kt.score_type, kt.frequency,
             ka.name AS attribute_name, ka.display_order AS attr_order,
             kt.display_order
        FROM kpi_scores ks
        JOIN kpi_templates kt ON kt.id = ks.kpi_template_id
        JOIN kpi_attributes ka ON ka.id = kt.attribute_id
        LEFT JOIN kpi_template_assignments ta_role ON ta_role.template_id = kt.id AND ta_role.role_id = ?
        LEFT JOIN frequency_configs fc ON fc.key = kt.frequency
       WHERE ks.employee_id = ? AND ks.scoring_period_id = ?
         AND (fc.hierarchy_order IS NULL OR fc.hierarchy_order <= ${periodFreqLevel})
       ORDER BY ka.display_order, kt.display_order
    `).all(employee.role_id, targetId, period.id);

    return { period, scores };
  });

  res.json({ employee, history });
});

// ── GET /api/reports/employee/:employeeId/history.csv ─────────────────────────
router.get('/employee/:employeeId/history/csv', requireAuth, (req, res) => {
  const targetId = parseInt(req.params.employeeId);

  if (!req.employee.is_admin && targetId !== req.employee.id) {
    const visible = getVisibleEmployeeIds(req.employee.id);
    if (!visible.includes(targetId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
  }

  const employee = db.prepare(`
    SELECT e.*, r.name AS role_name FROM employees e LEFT JOIN roles r ON r.id = e.role_id WHERE e.id = ?
  `).get(targetId);
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const periods = db.prepare(`
    SELECT DISTINCT sp.*
      FROM scoring_periods sp
      JOIN kpi_scores ks ON ks.scoring_period_id = sp.id
     WHERE ks.employee_id = ?
     ORDER BY sp.start_date DESC
  `).all(targetId);

  const lines = [];
  const empLabel = employee.employee_code
    ? `${employee.name} [${employee.employee_code}] (${employee.role_name})`
    : `${employee.name} (${employee.role_name})`;
  lines.push(buildCsvRow([`Score History — ${empLabel}`, '', '', '', '', '']));
  lines.push('');
  lines.push(buildCsvRow(['Period', 'Attribute', 'KPI', 'Weight %', 'Self Score', 'Manager Score', 'Final Score', 'Status']));

  for (const period of periods) {
    const periodFreqLevel = getPeriodFreqLevel(period.id);
    const scores = db.prepare(`
      SELECT ks.*, kt.sub_metric_name,
             COALESCE(ta_role.weight_percentage, kt.weight_percentage) AS weight_percentage,
             kt.score_type,
             ka.name AS attribute_name, ka.display_order AS attr_order, kt.display_order
        FROM kpi_scores ks
        JOIN kpi_templates kt ON kt.id = ks.kpi_template_id
        JOIN kpi_attributes ka ON ka.id = kt.attribute_id
        LEFT JOIN kpi_template_assignments ta_role ON ta_role.template_id = kt.id AND ta_role.role_id = ?
        LEFT JOIN frequency_configs fc ON fc.key = kt.frequency
       WHERE ks.employee_id = ? AND ks.scoring_period_id = ?
         AND (fc.hierarchy_order IS NULL OR fc.hierarchy_order <= ${periodFreqLevel})
       ORDER BY ka.display_order, kt.display_order
    `).all(employee.role_id, targetId, period.id);

    for (const s of scores) {
      lines.push(buildCsvRow([
        period.label, s.attribute_name, s.sub_metric_name,
        s.weight_percentage, s.self_score ?? '', s.manager_score ?? '',
        s.final_score ?? '', s.status,
      ]));
    }
    lines.push('');
  }

  const csv = lines.join('\r\n');
  const filename = `score-history-${employee.name.replace(/\s+/g, '-')}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\uFEFF' + csv);
});

// ── Drill-down helpers ────────────────────────────────────────────────────────

function getVisibleEmpIds(viewer) {
  if (viewer.is_admin) {
    return db.prepare('SELECT id FROM employees WHERE is_active=1 AND role_id IS NOT NULL').all().map(r => r.id);
  }
  return getVisibleEmployeeIds(viewer.id).filter(id => id !== viewer.id);
}

/**
 * Returns the hierarchy_order of the frequency_config matching a period's type.
 * Falls back to 999 (show everything) if the type isn't in frequency_configs.
 */
function getPeriodFreqLevel(periodId) {
  const row = db.prepare(`
    SELECT COALESCE(fc.hierarchy_order, 999) AS level
      FROM scoring_periods sp
      LEFT JOIN frequency_configs fc ON fc.key = sp.period_type
     WHERE sp.id = ?
  `).get(periodId);
  const level = row?.level ?? 999;
  console.log(`[freq] periodId=${periodId} → period_type lookup → level=${level}`);
  return level;
}

/**
 * Returns all frequency keys whose hierarchy_order <= the period's level.
 * Used for explicit WHERE kt.frequency IN (...) filtering.
 */
function getValidFreqKeys(periodId) {
  const freqLevel = getPeriodFreqLevel(periodId);
  const keys = db.prepare(
    'SELECT key FROM frequency_configs WHERE hierarchy_order <= ?'
  ).all(freqLevel).map(r => r.key);
  console.log(`[freq] validFreqKeys for level=${freqLevel}:`, keys);
  return keys;
}

// Normalizes a raw score to 0-100% using score_type_configs min/max
const normScore = `
  CASE
    WHEN stc.behavior = 'scale'
         AND stc.max_value IS NOT NULL AND stc.min_value IS NOT NULL
         AND (stc.max_value - stc.min_value) > 0
    THEN (ks.final_score - stc.min_value) / (stc.max_value - stc.min_value) * 100.0
    ELSE ks.final_score
  END`;

// ── GET /api/reports/drill/departments?period_id=X ────────────────────────────
router.get('/drill/departments', requireAuth, (req, res) => {
  const periodId = parseInt(req.query.period_id);
  if (!periodId) return res.status(400).json({ error: 'period_id required' });
  const ids = getVisibleEmpIds(req.employee);
  if (!ids.length) return res.json([]);
  const ph = ids.map(() => '?').join(',');
  const freqLevel = getPeriodFreqLevel(periodId);

  const rows = db.prepare(`
    SELECT d.id, d.name AS label,
           COUNT(DISTINCT e.id) AS emp_count,
           COUNT(DISTINCT CASE WHEN ks.status='reconciled' AND ks.final_score IS NOT NULL
                               AND (fc_k.hierarchy_order IS NULL OR fc_k.hierarchy_order <= ${freqLevel})
                          THEN e.id END) AS scored_count,
           ROUND(AVG(CASE WHEN ks.status='reconciled' AND ks.final_score IS NOT NULL
                          AND (fc_k.hierarchy_order IS NULL OR fc_k.hierarchy_order <= ${freqLevel})
                     THEN ${normScore} END), 1) AS avg_pct
      FROM departments d
      JOIN employees e ON e.department_id=d.id AND e.is_active=1 AND e.role_id IS NOT NULL AND e.id IN (${ph})
      LEFT JOIN kpi_scores ks ON ks.employee_id=e.id AND ks.scoring_period_id=?
      LEFT JOIN kpi_templates kt ON kt.id=ks.kpi_template_id
      LEFT JOIN score_type_configs stc ON stc.key=kt.score_type
      LEFT JOIN frequency_configs fc_k ON fc_k.key=kt.frequency
     GROUP BY d.id, d.name
     ORDER BY d.name
  `).all(...ids, periodId);
  res.json(rows);
});

// ── GET /api/reports/drill/departments/:deptId/roles?period_id=X ──────────────
router.get('/drill/departments/:deptId/roles', requireAuth, (req, res) => {
  const { deptId } = req.params;
  const periodId = parseInt(req.query.period_id);
  if (!periodId) return res.status(400).json({ error: 'period_id required' });
  const ids = getVisibleEmpIds(req.employee);
  if (!ids.length) return res.json([]);
  const ph = ids.map(() => '?').join(',');
  const freqLevel = getPeriodFreqLevel(periodId);

  const rows = db.prepare(`
    SELECT r.id, r.name AS label, r.hierarchy_level,
           COUNT(DISTINCT e.id) AS emp_count,
           COUNT(DISTINCT CASE WHEN ks.status='reconciled' AND ks.final_score IS NOT NULL
                               AND (fc_k.hierarchy_order IS NULL OR fc_k.hierarchy_order <= ${freqLevel})
                          THEN e.id END) AS scored_count,
           ROUND(AVG(CASE WHEN ks.status='reconciled' AND ks.final_score IS NOT NULL
                          AND (fc_k.hierarchy_order IS NULL OR fc_k.hierarchy_order <= ${freqLevel})
                     THEN ${normScore} END), 1) AS avg_pct
      FROM roles r
      JOIN employees e ON e.role_id=r.id AND e.department_id=? AND e.is_active=1 AND e.id IN (${ph})
      LEFT JOIN kpi_scores ks ON ks.employee_id=e.id AND ks.scoring_period_id=?
      LEFT JOIN kpi_templates kt ON kt.id=ks.kpi_template_id
      LEFT JOIN score_type_configs stc ON stc.key=kt.score_type
      LEFT JOIN frequency_configs fc_k ON fc_k.key=kt.frequency
     GROUP BY r.id, r.name
     ORDER BY r.hierarchy_level, r.name
  `).all(deptId, ...ids, periodId);
  res.json(rows);
});

// ── GET /api/reports/drill/roles/:roleId/kpis?period_id=X ────────────────────
router.get('/drill/roles/:roleId/kpis', requireAuth, (req, res) => {
  const { roleId } = req.params;
  const periodId = parseInt(req.query.period_id);
  if (!periodId) return res.status(400).json({ error: 'period_id required' });
  const ids = getVisibleEmpIds(req.employee);
  if (!ids.length) return res.json([]);
  const ph = ids.map(() => '?').join(',');

  const validFreqs = getValidFreqKeys(periodId);
  if (!validFreqs.length) return res.json([]);
  const fpPh = validFreqs.map(() => '?').join(',');

  const rows = db.prepare(`
    SELECT kt.id, kt.sub_metric_name AS label, ka.name AS attribute_name,
           ka.display_order AS attr_order, kt.display_order,
           COUNT(DISTINCT e.id) AS emp_count,
           COUNT(DISTINCT CASE WHEN ks.status='reconciled' AND ks.final_score IS NOT NULL THEN e.id END) AS scored_count,
           ROUND(AVG(CASE WHEN ks.status='reconciled' AND ks.final_score IS NOT NULL
                     THEN ${normScore} END), 1) AS avg_pct
      FROM kpi_templates kt
      JOIN kpi_template_assignments kta ON kta.template_id=kt.id AND kta.role_id=?
      JOIN kpi_attributes ka ON ka.id=kt.attribute_id
      JOIN employees e ON e.role_id=? AND e.is_active=1 AND e.id IN (${ph})
      LEFT JOIN kpi_scores ks ON ks.kpi_template_id=kt.id AND ks.employee_id=e.id AND ks.scoring_period_id=?
      LEFT JOIN score_type_configs stc ON stc.key=kt.score_type
     WHERE kt.frequency IN (${fpPh})
     GROUP BY kt.id
     ORDER BY ka.display_order, kt.display_order
  `).all(roleId, roleId, ...ids, periodId, ...validFreqs);
  res.json(rows);
});

// ── GET /api/reports/drill/roles/:roleId/employees?period_id=X ───────────────
router.get('/drill/roles/:roleId/employees', requireAuth, (req, res) => {
  const { roleId } = req.params;
  const periodId = parseInt(req.query.period_id);
  if (!periodId) return res.status(400).json({ error: 'period_id required' });
  const ids = getVisibleEmpIds(req.employee);
  if (!ids.length) return res.json([]);
  const ph = ids.map(() => '?').join(',');
  const freqLevel = getPeriodFreqLevel(periodId);

  const rows = db.prepare(`
    SELECT e.id, e.name AS label, e.employee_code,
           COUNT(DISTINCT kt.id) AS kpi_count,
           COUNT(DISTINCT CASE WHEN ks.status='reconciled' AND ks.final_score IS NOT NULL THEN ks.id END) AS scored_count,
           ROUND(AVG(CASE WHEN ks.status='reconciled' AND ks.final_score IS NOT NULL
                     THEN ${normScore} END), 1) AS avg_pct
      FROM employees e
      JOIN kpi_template_assignments kta ON kta.role_id=e.role_id
      JOIN kpi_templates kt ON kt.id=kta.template_id
      LEFT JOIN kpi_scores ks ON ks.kpi_template_id=kt.id AND ks.employee_id=e.id AND ks.scoring_period_id=?
      LEFT JOIN score_type_configs stc ON stc.key=kt.score_type
      LEFT JOIN frequency_configs fc_k ON fc_k.key=kt.frequency
     WHERE e.role_id=? AND e.is_active=1 AND e.id IN (${ph})
       AND (fc_k.hierarchy_order IS NULL OR fc_k.hierarchy_order <= ${freqLevel})
     GROUP BY e.id, e.name
     ORDER BY avg_pct DESC, e.name
  `).all(periodId, roleId, ...ids);
  res.json(rows);
});

// ── GET /api/reports/drill/kpis/:templateId/employees?period_id=X ────────────
router.get('/drill/kpis/:templateId/employees', requireAuth, (req, res) => {
  const { templateId } = req.params;
  const periodId = parseInt(req.query.period_id);
  if (!periodId) return res.status(400).json({ error: 'period_id required' });
  const ids = getVisibleEmpIds(req.employee);
  if (!ids.length) return res.json([]);
  const ph = ids.map(() => '?').join(',');

  // Validate: only show this KPI's employees if the KPI's frequency is valid for the period
  const freqLevel = getPeriodFreqLevel(periodId);
  const templateFreqRow = db.prepare(`
    SELECT fc.hierarchy_order AS freq_level
      FROM kpi_templates kt
      LEFT JOIN frequency_configs fc ON fc.key = kt.frequency
     WHERE kt.id = ?
  `).get(templateId);
  if (templateFreqRow && templateFreqRow.freq_level != null && templateFreqRow.freq_level > freqLevel) {
    return res.json([]); // KPI frequency too high for the selected period
  }

  const rows = db.prepare(`
    SELECT e.id, e.name AS label, e.employee_code,
           ks.final_score AS raw_score, ks.self_score, ks.manager_score, ks.status,
           ROUND(CASE WHEN ks.final_score IS NOT NULL THEN ${normScore} END, 1) AS avg_pct
      FROM employees e
      JOIN kpi_template_assignments kta ON kta.role_id=e.role_id AND kta.template_id=?
      JOIN kpi_templates kt ON kt.id=?
      LEFT JOIN kpi_scores ks ON ks.kpi_template_id=? AND ks.employee_id=e.id AND ks.scoring_period_id=?
      LEFT JOIN score_type_configs stc ON stc.key=kt.score_type
     WHERE e.is_active=1 AND e.id IN (${ph})
     ORDER BY ks.final_score DESC, e.name
  `).all(templateId, templateId, templateId, periodId, ...ids);
  res.json(rows);
});

// ── GET /api/reports/drill/employees/:empId/kpis?period_id=X ─────────────────
router.get('/drill/employees/:empId/kpis', requireAuth, (req, res) => {
  const empId = parseInt(req.params.empId);
  const periodId = parseInt(req.query.period_id);
  if (!periodId) return res.status(400).json({ error: 'period_id required' });

  if (!req.employee.is_admin) {
    const visible = getVisibleEmployeeIds(req.employee.id);
    if (!visible.includes(empId)) return res.status(403).json({ error: 'Access denied' });
  }

  const emp = db.prepare(`
    SELECT e.*, r.name AS role_name FROM employees e
    LEFT JOIN roles r ON r.id=e.role_id WHERE e.id=?
  `).get(empId);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });

  const freqLevel = getPeriodFreqLevel(periodId);

  const kpis = db.prepare(`
    SELECT kt.id, kt.sub_metric_name AS label, ka.name AS attribute_name,
           ka.display_order AS attr_order, kt.display_order,
           ks.final_score AS raw_score, ks.self_score, ks.manager_score, ks.status,
           ROUND(CASE WHEN ks.final_score IS NOT NULL THEN ${normScore} END, 1) AS avg_pct,
           stc.min_value, stc.max_value
      FROM kpi_templates kt
      JOIN kpi_template_assignments kta ON kta.template_id=kt.id AND kta.role_id=?
      JOIN kpi_attributes ka ON ka.id=kt.attribute_id
      LEFT JOIN kpi_scores ks ON ks.kpi_template_id=kt.id AND ks.employee_id=? AND ks.scoring_period_id=?
      LEFT JOIN score_type_configs stc ON stc.key=kt.score_type
      LEFT JOIN frequency_configs fc_k ON fc_k.key=kt.frequency
     WHERE (fc_k.hierarchy_order IS NULL OR fc_k.hierarchy_order <= ${freqLevel})
     ORDER BY ka.display_order, kt.display_order
  `).all(emp.role_id, empId, periodId);

  res.json({ employee: emp, kpis });
});

module.exports = router;
