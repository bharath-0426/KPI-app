const express = require('express');
const { db } = require('../db/schema');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const VALID_BEHAVIORS = ['scale', 'distribution', 'calculated'];

// GET /api/score-types
router.get('/', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM score_type_configs ORDER BY display_order, label').all());
});

// POST /api/score-types
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { key, label, behavior, min_value, max_value, display_order, step, higher_is_better, suffix } = req.body;
  if (!key || !key.trim()) return res.status(400).json({ error: 'key is required' });
  if (!label || !label.trim()) return res.status(400).json({ error: 'label is required' });
  if (!VALID_BEHAVIORS.includes(behavior)) {
    return res.status(400).json({ error: 'behavior must be scale, distribution, or calculated' });
  }

  const nextOrder = display_order !== undefined && display_order !== ''
    ? parseInt(display_order)
    : (db.prepare('SELECT MAX(display_order) AS m FROM score_type_configs').get()?.m ?? 0) + 1;

  try {
    const result = db.prepare(`
      INSERT INTO score_type_configs (key, label, behavior, min_value, max_value, display_order, step, higher_is_better, suffix)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      key.trim().toLowerCase().replace(/\s+/g, '_'),
      label.trim(),
      behavior,
      behavior === 'scale' ? (parseFloat(min_value) ?? null) : null,
      behavior === 'scale' ? (parseFloat(max_value) ?? null) : null,
      nextOrder,
      step !== undefined && step !== '' ? parseFloat(step) : 1,
      higher_is_better !== undefined ? (higher_is_better ? 1 : 0) : 1,
      suffix !== undefined ? String(suffix).trim() : ''
    );
    res.status(201).json(db.prepare('SELECT * FROM score_type_configs WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'A score type with that key already exists.' });
    throw err;
  }
});

// PUT /api/score-types/:id  (key is immutable — only label/behavior/range/order)
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.prepare('SELECT * FROM score_type_configs WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Score type not found' });

  const { label, behavior, min_value, max_value, display_order, step, higher_is_better, suffix } = req.body;
  if (behavior && !VALID_BEHAVIORS.includes(behavior)) {
    return res.status(400).json({ error: 'behavior must be scale, distribution, or calculated' });
  }

  const newBehavior = behavior ?? existing.behavior;
  db.prepare(`
    UPDATE score_type_configs
       SET label = ?, behavior = ?, min_value = ?, max_value = ?, display_order = ?,
           step = ?, higher_is_better = ?, suffix = ?
     WHERE id = ?
  `).run(
    label !== undefined ? label.trim() : existing.label,
    newBehavior,
    newBehavior === 'scale' ? (min_value !== undefined ? parseFloat(min_value) : existing.min_value) : null,
    newBehavior === 'scale' ? (max_value !== undefined ? parseFloat(max_value) : existing.max_value) : null,
    display_order !== undefined ? parseInt(display_order) : existing.display_order,
    step !== undefined && step !== '' ? parseFloat(step) : (existing.step ?? 1),
    higher_is_better !== undefined ? (higher_is_better ? 1 : 0) : (existing.higher_is_better ?? 1),
    suffix !== undefined ? String(suffix).trim() : (existing.suffix ?? ''),
    id
  );
  res.json(db.prepare('SELECT * FROM score_type_configs WHERE id = ?').get(id));
});

// DELETE /api/score-types/:id
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.prepare('SELECT * FROM score_type_configs WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Score type not found' });
  if (existing.is_system) return res.status(409).json({ error: 'Cannot delete a built-in score type.' });

  const count = db.prepare('SELECT COUNT(*) AS n FROM kpi_templates WHERE score_type = ?').get(existing.key).n;
  if (count > 0) return res.status(409).json({ error: `Cannot delete — ${count} template(s) use this score type.` });

  db.prepare('DELETE FROM score_type_configs WHERE id = ?').run(id);
  res.json({ success: true });
});

module.exports = router;
