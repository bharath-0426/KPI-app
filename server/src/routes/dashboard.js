const express = require('express');
const { db } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');
const { getVisibleEmployeeIds, getDirectReports } = require('../lib/hierarchy');

const router = express.Router();

// ── Weighted normalised score for one employee in one period (0–100%) ─────────
function getMyScore(empId, roleId, periodId) {
  const r = db.prepare(`
    SELECT
      SUM(
        CASE
          WHEN stc.behavior = 'scale'
           AND stc.max_value IS NOT NULL
           AND (stc.max_value - COALESCE(stc.min_value, 0)) > 0
            THEN ((ks.final_score - COALESCE(stc.min_value, 0))
                  / (stc.max_value - COALESCE(stc.min_value, 0)) * 100.0)
          ELSE ks.final_score
        END * COALESCE(ta_role.weight_percentage, kt.weight_percentage)
      ) AS wsum,
      SUM(COALESCE(ta_role.weight_percentage, kt.weight_percentage)) AS wtotal,
      COUNT(*) AS cnt
    FROM kpi_scores ks
    JOIN kpi_templates kt ON kt.id = ks.kpi_template_id
    LEFT JOIN score_type_configs stc ON stc.key = kt.score_type
    LEFT JOIN kpi_template_assignments ta_role
           ON ta_role.template_id = kt.id AND ta_role.role_id = ?
    WHERE ks.employee_id = ? AND ks.scoring_period_id = ?
      AND ks.final_score IS NOT NULL AND ks.status = 'reconciled'
      AND COALESCE(ta_role.weight_percentage, kt.weight_percentage) > 0
  `).get(roleId, empId, periodId);

  if (!r || !r.wtotal || r.cnt === 0) return null;
  return Math.round((r.wsum / r.wtotal) * 10) / 10;
}

// ── Per-attribute breakdown for one employee in one period ────────────────────
function getAttributeBreakdown(empId, roleId, deptId, periodId) {
  return db.prepare(`
    SELECT ka.name AS attribute_name,
           COUNT(DISTINCT t.id)                                                AS total,
           COUNT(DISTINCT CASE WHEN ks.self_score IS NOT NULL THEN t.id END)  AS scored,
           COUNT(DISTINCT CASE WHEN ks.status = 'reconciled' THEN t.id END)   AS reconciled
      FROM kpi_attributes ka
      JOIN kpi_templates t ON t.attribute_id = ka.id
      JOIN kpi_template_assignments ta ON ta.template_id = t.id
      LEFT JOIN kpi_scores ks
             ON ks.kpi_template_id = t.id
            AND ks.employee_id = ? AND ks.scoring_period_id = ?
     WHERE ta.role_id = ?
        OR (ta.dept_id = ?
            AND NOT EXISTS (
              SELECT 1 FROM kpi_template_assignments ta2
               WHERE ta2.template_id = t.id AND ta2.role_id IS NOT NULL
            ))
     GROUP BY ka.id, ka.display_order
     ORDER BY ka.display_order
  `).all(empId, periodId, roleId, deptId);
}

// ── Score trend: last 12 closed periods of a given type (single batched query) ─
function getScoreTrend(empId, roleId, periodType) {
  const rows = db.prepare(`
    SELECT sp.id, sp.label, sp.start_date,
      SUM(
        CASE
          WHEN stc.behavior = 'scale'
           AND stc.max_value IS NOT NULL
           AND (stc.max_value - COALESCE(stc.min_value, 0)) > 0
            THEN ((ks.final_score - COALESCE(stc.min_value, 0))
                  / (stc.max_value - COALESCE(stc.min_value, 0)) * 100.0)
          ELSE ks.final_score
        END * COALESCE(ta_role.weight_percentage, kt.weight_percentage)
      ) AS wsum,
      SUM(COALESCE(ta_role.weight_percentage, kt.weight_percentage)) AS wtotal,
      COUNT(*) AS cnt
    FROM scoring_periods sp
    JOIN kpi_scores ks ON ks.scoring_period_id = sp.id
    JOIN kpi_templates kt ON kt.id = ks.kpi_template_id
    LEFT JOIN score_type_configs stc ON stc.key = kt.score_type
    LEFT JOIN kpi_template_assignments ta_role
           ON ta_role.template_id = kt.id AND ta_role.role_id = ?
    WHERE sp.period_type = ? AND sp.is_active = 0
      AND ks.employee_id = ?
      AND ks.final_score IS NOT NULL AND ks.status = 'reconciled'
      AND COALESCE(ta_role.weight_percentage, kt.weight_percentage) > 0
    GROUP BY sp.id
    ORDER BY sp.start_date DESC
    LIMIT 12
  `).all(roleId, periodType, empId);

  return rows
    .map(r => ({
      label: r.label,
      score: (!r.wtotal || r.cnt === 0) ? null : Math.round((r.wsum / r.wtotal) * 10) / 10,
    }))
    .reverse(); // oldest → newest for the chart
}

// ── GET /api/dashboard ────────────────────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const me = req.employee;

  // Active periods — at most one per frequency type (the most recent)
  const activePeriods = db.prepare(`
    SELECT sp.* FROM scoring_periods sp
    WHERE sp.is_active = 1
      AND sp.start_date = (
        SELECT MAX(sp2.start_date) FROM scoring_periods sp2
        WHERE sp2.period_type = sp.period_type AND sp2.is_active = 1
      )
    ORDER BY sp.start_date DESC
  `).all();

  // Employee's role + dept
  const empInfo = db.prepare(
    'SELECT role_id, department_id FROM employees WHERE id = ?'
  ).get(me.id) || {};
  const roleId = empInfo.role_id;
  const deptId = empInfo.department_id;

  // Total templates assigned (using the new assignments table)
  const totalTemplates = roleId ? db.prepare(`
    SELECT COUNT(DISTINCT t.id) AS n
      FROM kpi_templates t
      JOIN kpi_template_assignments ta ON ta.template_id = t.id
     WHERE ta.role_id = ?
        OR (ta.dept_id = ?
            AND NOT EXISTS (
              SELECT 1 FROM kpi_template_assignments ta2
               WHERE ta2.template_id = t.id AND ta2.role_id IS NOT NULL
            ))
  `).get(roleId, deptId)?.n ?? 0 : 0;

  // My stats per active period
  const myStats = activePeriods.map(period => {
    const counts = db.prepare(`
      SELECT status, COUNT(*) AS n
        FROM kpi_scores
       WHERE employee_id = ? AND scoring_period_id = ?
       GROUP BY status
    `).all(me.id, period.id);

    const byStatus = {};
    counts.forEach(c => { byStatus[c.status] = c.n; });

    const selfDone = (byStatus.self_submitted ?? 0)
      + (byStatus.manager_submitted ?? 0)
      + (byStatus.both_submitted ?? 0)
      + (byStatus.disputed ?? 0)
      + (byStatus.reconciled ?? 0);

    return {
      period_id:           period.id,
      period_label:        period.label,
      period_type:         period.period_type,
      end_date:            period.end_date,
      total_templates:     totalTemplates,
      self_done:           selfDone,
      fully_reconciled:    byStatus.reconciled ?? 0,
      disputed:            byStatus.disputed ?? 0,
      my_score:            roleId ? getMyScore(me.id, roleId, period.id) : null,
      attribute_breakdown: roleId
        ? getAttributeBreakdown(me.id, roleId, deptId, period.id)
        : [],
    };
  });

  // Score trend for the primary period type
  const primaryType = activePeriods[0]?.period_type || 'monthly';
  const scoreTrend = roleId ? getScoreTrend(me.id, roleId, primaryType) : [];

  // Team stats (direct reports)
  let teamStats = null;
  const directReports = getDirectReports(me.id);

  if (directReports.length > 0) {
    const reportIds = directReports.map(r => r.id);
    const ph = reportIds.map(() => '?').join(',');

    const teamPeriodStats = activePeriods.map(period => {
      const rows = db.prepare(`
        SELECT e.id, e.name, r.name AS role_name,
               SUM(CASE WHEN ks.status IN
                 ('self_submitted','both_submitted','manager_submitted','disputed','reconciled')
                 THEN 1 ELSE 0 END) AS self_done,
               SUM(CASE WHEN ks.status IN ('manager_submitted','disputed','reconciled')
                 THEN 1 ELSE 0 END) AS mgr_done,
               SUM(CASE WHEN ks.status = 'reconciled' THEN 1 ELSE 0 END) AS reconciled,
               SUM(CASE WHEN ks.status = 'disputed'   THEN 1 ELSE 0 END) AS disputed
          FROM employees e
          JOIN roles r ON r.id = e.role_id
          LEFT JOIN kpi_scores ks ON ks.employee_id = e.id AND ks.scoring_period_id = ?
         WHERE e.id IN (${ph}) AND e.is_active = 1
         GROUP BY e.id
      `).all(period.id, ...reportIds);

      return {
        period_id:           period.id,
        period_label:        period.label,
        reports:             rows,
        total_reports:       rows.length,
        self_submitted_count: rows.filter(r => r.self_done > 0).length,
        mgr_reviewed_count:  rows.filter(r => r.mgr_done > 0).length,
        dispute_count:       rows.reduce((s, r) => s + (r.disputed ?? 0), 0),
      };
    });

    teamStats = { periods: teamPeriodStats, direct_reports: directReports.length };
  }

  // Dispute count (visible subtree)
  const visibleIds = getVisibleEmployeeIds(me.id).filter(id => id !== me.id);
  let disputeCount = 0;
  if (visibleIds.length > 0) {
    const ph = visibleIds.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT ks.id, e.reports_to AS manager_id
        FROM kpi_scores ks
        JOIN employees e ON e.id = ks.employee_id
       WHERE ks.employee_id IN (${ph}) AND ks.status = 'disputed'
    `).all(...visibleIds);
    disputeCount = me.is_admin
      ? rows.length
      : rows.filter(r => r.manager_id !== me.id).length;
  }

  // Distribution pending — uses kpi_template_scored_by (same as is_distributor flag)
  let distributionPending = 0;
  if (roleId) {
    const raw100 = db.prepare(`
      SELECT kt.id FROM kpi_templates kt
        JOIN kpi_template_scored_by sb ON sb.template_id = kt.id AND sb.role_id = ?
       WHERE kt.score_type = 'raw_100'
    `).all(roleId);

    if (raw100.length > 0 && activePeriods.length > 0) {
      const tmplIds  = raw100.map(t => t.id);
      const periodIds = activePeriods.map(p => p.id);
      const tmplPh   = tmplIds.map(() => '?').join(',');
      const periodPh = periodIds.map(() => '?').join(',');

      // Single query: find distributions already totalling 100
      const completed = db.prepare(`
        SELECT rd.scoring_period_id, rd.kpi_template_id
          FROM rupee_distributions rd
          LEFT JOIN rupee_distribution_items rdi ON rdi.distribution_id = rd.id
         WHERE rd.distributor_id = ?
           AND rd.scoring_period_id IN (${periodPh})
           AND rd.kpi_template_id  IN (${tmplPh})
         GROUP BY rd.id
        HAVING COALESCE(SUM(rdi.amount), 0) = 100
      `).all(me.id, ...periodIds, ...tmplIds);

      distributionPending = tmplIds.length * periodIds.length - completed.length;
    }
  }

  // Subtree stats (visible employees under manager/admin)
  let subtreeStats = null;
  const subIds = visibleIds;
  if (subIds.length > 0) {
    const sph = subIds.map(() => '?').join(',');

    const subtreePeriodStats = activePeriods.map(period => {
      const empStats = db.prepare(`
        SELECT e.id, r.name AS role_name,
               SUM(CASE WHEN ks.status IN
                 ('self_submitted','both_submitted','manager_submitted','disputed','reconciled')
                 THEN 1 ELSE 0 END) AS self_done,
               SUM(CASE WHEN ks.status = 'reconciled' THEN 1 ELSE 0 END) AS reconciled,
               SUM(CASE WHEN ks.status = 'disputed'   THEN 1 ELSE 0 END) AS disputed
          FROM employees e
          JOIN roles r ON r.id = e.role_id
          LEFT JOIN kpi_scores ks ON ks.employee_id = e.id AND ks.scoring_period_id = ?
         WHERE e.id IN (${sph}) AND e.is_active = 1
         GROUP BY e.id
      `).all(period.id, ...subIds);

      const byRole = {};
      for (const e of empStats) {
        if (!byRole[e.role_name]) byRole[e.role_name] = { total: 0, reconciled: 0, disputed: 0 };
        byRole[e.role_name].total++;
        if (e.reconciled > 0) byRole[e.role_name].reconciled++;
        byRole[e.role_name].disputed += (e.disputed || 0);
      }

      return {
        period_id:            period.id,
        period_label:         period.label,
        total_employees:      empStats.length,
        self_submitted_count: empStats.filter(e => e.self_done > 0).length,
        reconciled_count:     empStats.filter(e => e.reconciled > 0).length,
        dispute_count:        empStats.reduce((s, e) => s + (e.disputed || 0), 0),
        by_role:              byRole,
      };
    });

    subtreeStats = { total_employees: subIds.length, periods: subtreePeriodStats };
  }

  res.json({
    my_stats:             myStats,
    score_trend:          scoreTrend,
    team_stats:           teamStats,
    subtree_stats:        subtreeStats,
    dispute_count:        disputeCount,
    distribution_pending: distributionPending,
    active_period_count:  activePeriods.length,
  });
});

module.exports = router;
