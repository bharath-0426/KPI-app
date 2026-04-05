const express = require('express');
const { db } = require('../db/schema');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function validScoreTypeKeys() {
  return db.prepare('SELECT key FROM score_type_configs').all().map(r => r.key);
}
function validFrequencyKeys() {
  return db.prepare('SELECT key FROM frequency_configs').all().map(r => r.key);
}

function listTemplates() {
  const templates = db.prepare(`
    SELECT kt.*,
           ka.name AS attribute_name,
           ka.display_order AS attribute_order
      FROM kpi_templates kt
      JOIN kpi_attributes ka ON ka.id = kt.attribute_id
     ORDER BY ka.display_order, kt.display_order
  `).all();

  // Attach assignments to each template
  const assignments = db.prepare(`
    SELECT ta.template_id,
           ta.role_id,
           ta.dept_id,
           ta.weight_percentage,
           r.name AS role_name,
           d.name AS dept_name
      FROM kpi_template_assignments ta
      LEFT JOIN roles r ON r.id = ta.role_id
      LEFT JOIN departments d ON d.id = ta.dept_id
  `).all();

  const assignMap = {};
  for (const a of assignments) {
    if (!assignMap[a.template_id]) assignMap[a.template_id] = [];
    if (a.role_id) {
      assignMap[a.template_id].push({ type: 'role', id: a.role_id, name: a.role_name, weight_percentage: a.weight_percentage });
    } else if (a.dept_id) {
      assignMap[a.template_id].push({ type: 'dept', id: a.dept_id, name: a.dept_name });
    }
  }

  // Attach scored_by_roles
  const scoredBy = db.prepare(`
    SELECT sb.template_id, sb.role_id, r.name AS role_name
      FROM kpi_template_scored_by sb
      JOIN roles r ON r.id = sb.role_id
  `).all();
  const scoredByMap = {};
  for (const s of scoredBy) {
    if (!scoredByMap[s.template_id]) scoredByMap[s.template_id] = [];
    scoredByMap[s.template_id].push({ role_id: s.role_id, role_name: s.role_name });
  }

  return templates.map(t => ({
    ...t,
    assignments: assignMap[t.id] || [],
    scored_by_roles: scoredByMap[t.id] || [],
  }));
}

function saveScoredBy(templateId, roleIds) {
  db.prepare('DELETE FROM kpi_template_scored_by WHERE template_id = ?').run(templateId);
  const stmt = db.prepare('INSERT OR IGNORE INTO kpi_template_scored_by (template_id, role_id) VALUES (?, ?)');
  for (const rid of (roleIds || [])) {
    stmt.run(templateId, parseInt(rid));
  }
}

// roleAssignments = [{role_id, weight_percentage}]
function saveAssignments(templateId, roleAssignments, deptIds) {
  db.prepare('DELETE FROM kpi_template_assignments WHERE template_id = ?').run(templateId);
  const insertStmt = db.prepare(
    'INSERT INTO kpi_template_assignments (template_id, role_id, dept_id, weight_percentage) VALUES (?, ?, ?, ?)'
  );
  for (const ra of (roleAssignments || [])) {
    insertStmt.run(templateId, parseInt(ra.role_id), null, parseFloat(ra.weight_percentage) || 0);
  }
  for (const did of (deptIds || [])) {
    insertStmt.run(templateId, null, parseInt(did), 0);
  }
}

// ── GET /api/kpi-templates ────────────────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const templates = listTemplates();
  const roles = db.prepare('SELECT * FROM roles ORDER BY hierarchy_level, name').all();
  const attributes = db.prepare('SELECT * FROM kpi_attributes ORDER BY display_order').all();
  const departments = db.prepare('SELECT * FROM departments ORDER BY name').all();
  const scoreTypes = db.prepare('SELECT * FROM score_type_configs ORDER BY display_order, label').all();
  const frequencies = db.prepare('SELECT * FROM frequency_configs ORDER BY display_order, label').all();
  res.json({ templates, roles, attributes, departments, scoreTypes, frequencies });
});

// ── GET /api/kpi-templates/:id ────────────────────────────────────────────────
router.get('/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const tmpl = db.prepare(`
    SELECT kt.*, ka.name AS attribute_name
      FROM kpi_templates kt
      JOIN kpi_attributes ka ON ka.id = kt.attribute_id
     WHERE kt.id = ?
  `).get(id);
  if (!tmpl) return res.status(404).json({ error: 'Template not found' });

  const assignments = db.prepare(`
    SELECT ta.role_id, ta.dept_id, r.name AS role_name, d.name AS dept_name
      FROM kpi_template_assignments ta
      LEFT JOIN roles r ON r.id = ta.role_id
      LEFT JOIN departments d ON d.id = ta.dept_id
     WHERE ta.template_id = ?
  `).all(id);

  res.json({ ...tmpl, assignments });
});

// ── POST /api/kpi-templates ───────────────────────────────────────────────────
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const {
    attribute_id, sub_metric_name, measurement_description,
    scoring_guide, frequency, formula, calculation_guide,
    weight_percentage, score_type, display_order,
    role_assignments, dept_ids, scored_by_role_ids,
  } = req.body;

  if (!attribute_id || !sub_metric_name || !score_type || !frequency) {
    return res.status(400).json({ error: 'attribute_id, sub_metric_name, score_type, and frequency are required' });
  }
  if (!validScoreTypeKeys().includes(score_type)) {
    return res.status(400).json({ error: `Invalid score_type: ${score_type}` });
  }
  if (!validFrequencyKeys().includes(frequency)) {
    return res.status(400).json({ error: `Invalid frequency: ${frequency}` });
  }

  const effectiveRoleAssignments = role_assignments || [];
  const effectiveDeptIds = dept_ids || [];

  if (effectiveRoleAssignments.length === 0 && effectiveDeptIds.length === 0) {
    return res.status(400).json({ error: 'At least one role or department assignment is required.' });
  }

  const legacyRoleId = effectiveRoleAssignments.length > 0 ? parseInt(effectiveRoleAssignments[0].role_id) : null;

  // Template-level weight_percentage = default for dept assignments
  const templateWeight = parseFloat(weight_percentage) || 0;

  // Compute display_order if not provided
  const nextOrder = display_order ?? (() => {
    const max = db.prepare(
      'SELECT MAX(display_order) AS m FROM kpi_templates'
    ).get()?.m ?? 0;
    return max + 1;
  })();

  const result = db.prepare(`
    INSERT INTO kpi_templates
      (role_id, attribute_id, sub_metric_name, measurement_description,
       scoring_guide, frequency, formula, calculation_guide,
       weight_percentage, score_type, display_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    legacyRoleId, attribute_id, sub_metric_name, measurement_description || null,
    scoring_guide || null, frequency, formula || null, calculation_guide || null,
    templateWeight, score_type, nextOrder
  );

  const templateId = result.lastInsertRowid;
  saveAssignments(templateId, effectiveRoleAssignments, effectiveDeptIds);
  saveScoredBy(templateId, scored_by_role_ids || []);

  const created = db.prepare('SELECT * FROM kpi_templates WHERE id = ?').get(templateId);
  res.status(201).json(created);
});

// ── PUT /api/kpi-templates/:id ────────────────────────────────────────────────
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.prepare('SELECT * FROM kpi_templates WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Template not found' });

  const {
    attribute_id, sub_metric_name, measurement_description,
    scoring_guide, frequency, formula, calculation_guide,
    weight_percentage, score_type, display_order,
    role_assignments, dept_ids, scored_by_role_ids,
  } = req.body;

  if (score_type && !validScoreTypeKeys().includes(score_type)) {
    return res.status(400).json({ error: `Invalid score_type: ${score_type}` });
  }
  if (frequency && !validFrequencyKeys().includes(frequency)) {
    return res.status(400).json({ error: `Invalid frequency: ${frequency}` });
  }

  if (scored_by_role_ids !== undefined) {
    saveScoredBy(id, scored_by_role_ids);
  }

  const effectiveRoleAssignments = role_assignments || [];
  const effectiveDeptIds = dept_ids || [];

  if (effectiveRoleAssignments.length === 0 && effectiveDeptIds.length === 0) {
    return res.status(400).json({ error: 'At least one role or department assignment is required.' });
  }

  const newLegacyRoleId = effectiveRoleAssignments.length > 0 ? parseInt(effectiveRoleAssignments[0].role_id) : null;
  saveAssignments(id, effectiveRoleAssignments, effectiveDeptIds);

  db.prepare(`
    UPDATE kpi_templates
       SET role_id = ?,
           attribute_id = ?,
           sub_metric_name = ?,
           measurement_description = ?,
           scoring_guide = ?,
           frequency = ?,
           formula = ?,
           calculation_guide = ?,
           weight_percentage = ?,
           score_type = ?,
           display_order = ?
     WHERE id = ?
  `).run(
    newLegacyRoleId ?? existing.role_id,
    attribute_id ?? existing.attribute_id,
    sub_metric_name ?? existing.sub_metric_name,
    measurement_description !== undefined ? (measurement_description || null) : existing.measurement_description,
    scoring_guide !== undefined ? (scoring_guide || null) : existing.scoring_guide,
    frequency ?? existing.frequency,
    formula !== undefined ? (formula || null) : existing.formula,
    calculation_guide !== undefined ? (calculation_guide || null) : existing.calculation_guide,
    weight_percentage !== undefined ? parseFloat(weight_percentage) : existing.weight_percentage,
    score_type ?? existing.score_type,
    display_order !== undefined ? display_order : existing.display_order,
    id
  );

  const updated = db.prepare('SELECT * FROM kpi_templates WHERE id = ?').get(id);
  res.json(updated);
});

// ── DELETE /api/kpi-templates/:id ─────────────────────────────────────────────
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.prepare('SELECT * FROM kpi_templates WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Template not found' });

  // Block deletion if any scores reference this template
  const scoreCount = db.prepare(
    'SELECT COUNT(*) AS n FROM kpi_scores WHERE kpi_template_id = ?'
  ).get(id).n;
  if (scoreCount > 0) {
    return res.status(409).json({
      error: `Cannot delete — ${scoreCount} score record(s) reference this template. Archive or reassign them first.`,
    });
  }

  db.prepare('DELETE FROM kpi_templates WHERE id = ?').run(id);
  res.json({ success: true });
});

module.exports = router;
