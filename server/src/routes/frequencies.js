const express = require('express');
const { db } = require('../db/schema');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { invalidateFreqConfigsCache } = require('../lib/periods');

const router = express.Router();

// GET /api/frequencies
// ?all=true returns all (for admin management); default returns only active
router.get('/', requireAuth, (req, res) => {
  const all = req.query.all === 'true';
  const rows = all
    ? db.prepare('SELECT * FROM frequency_configs ORDER BY display_order, label').all()
    : db.prepare('SELECT * FROM frequency_configs WHERE is_active=1 ORDER BY display_order, label').all();
  res.json(rows);
});

const VALID_ROLLUP = ['average', 'sum', 'best_of'];
const VALID_UNITS  = ['day', 'week', 'month', 'quarter', 'year'];

// POST /api/frequencies
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { key, label, display_order, hierarchy_order, duration_unit, duration_value, start_anchor, rollup_method } = req.body;
  if (!key || !key.trim()) return res.status(400).json({ error: 'key is required' });
  if (!label || !label.trim()) return res.status(400).json({ error: 'label is required' });
  if (duration_unit && !VALID_UNITS.includes(duration_unit))
    return res.status(400).json({ error: `duration_unit must be one of: ${VALID_UNITS.join(', ')}` });
  if (rollup_method && !VALID_ROLLUP.includes(rollup_method))
    return res.status(400).json({ error: `rollup_method must be one of: ${VALID_ROLLUP.join(', ')}` });

  const maxOrder = db.prepare('SELECT MAX(display_order) AS m FROM frequency_configs').get()?.m ?? 0;
  const maxHierarchy = db.prepare('SELECT MAX(hierarchy_order) AS m FROM frequency_configs').get()?.m ?? 0;

  try {
    const result = db.prepare(`
      INSERT INTO frequency_configs (key, label, display_order, hierarchy_order, duration_unit, duration_value, start_anchor, rollup_method)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      key.trim().toLowerCase().replace(/\s+/g, '_'),
      label.trim(),
      display_order !== undefined && display_order !== '' ? parseInt(display_order) : maxOrder + 1,
      hierarchy_order !== undefined && hierarchy_order !== '' ? parseInt(hierarchy_order) : maxHierarchy + 1,
      duration_unit  || 'month',
      duration_value !== undefined && duration_value !== '' ? parseInt(duration_value) : 1,
      start_anchor   !== undefined && start_anchor   !== '' ? parseInt(start_anchor)   : 1,
      rollup_method  || 'average'
    );
    invalidateFreqConfigsCache();
    res.status(201).json(db.prepare('SELECT * FROM frequency_configs WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'A frequency with that key already exists.' });
    throw err;
  }
});

// PUT /api/frequencies/:id  (key is immutable)
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.prepare('SELECT * FROM frequency_configs WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Frequency not found' });

  const { label, display_order, hierarchy_order, duration_unit, duration_value, start_anchor, rollup_method, is_active } = req.body;
  if (duration_unit && !VALID_UNITS.includes(duration_unit))
    return res.status(400).json({ error: `duration_unit must be one of: ${VALID_UNITS.join(', ')}` });
  if (rollup_method && !VALID_ROLLUP.includes(rollup_method))
    return res.status(400).json({ error: `rollup_method must be one of: ${VALID_ROLLUP.join(', ')}` });

  db.prepare(`
    UPDATE frequency_configs
       SET label = ?, display_order = ?, hierarchy_order = ?,
           duration_unit = ?, duration_value = ?, start_anchor = ?, rollup_method = ?,
           is_active = ?
     WHERE id = ?
  `).run(
    label          !== undefined ? label.trim()              : existing.label,
    display_order  !== undefined ? parseInt(display_order)   : existing.display_order,
    hierarchy_order !== undefined ? parseInt(hierarchy_order) : existing.hierarchy_order,
    duration_unit  !== undefined ? duration_unit             : existing.duration_unit,
    duration_value !== undefined ? parseInt(duration_value)  : existing.duration_value,
    start_anchor   !== undefined ? parseInt(start_anchor)    : existing.start_anchor,
    rollup_method  !== undefined ? rollup_method             : existing.rollup_method,
    is_active      !== undefined ? (is_active ? 1 : 0)       : (existing.is_active ?? 1),
    id
  );
  invalidateFreqConfigsCache();
  res.json(db.prepare('SELECT * FROM frequency_configs WHERE id = ?').get(id));
});

// DELETE /api/frequencies/:id
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.prepare('SELECT * FROM frequency_configs WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Frequency not found' });
  if (existing.is_system) return res.status(409).json({ error: 'Cannot delete a built-in frequency.' });

  const count = db.prepare('SELECT COUNT(*) AS n FROM kpi_templates WHERE frequency = ?').get(existing.key).n;
  if (count > 0) return res.status(409).json({ error: `Cannot delete — ${count} template(s) use this frequency.` });

  db.prepare('DELETE FROM frequency_configs WHERE id = ?').run(id);
  invalidateFreqConfigsCache();
  res.json({ success: true });
});

module.exports = router;
