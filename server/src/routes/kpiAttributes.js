/**
 * KPI Attributes CRUD routes
 */
const express = require('express');
const { db } = require('../db/schema');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/kpi-attributes — list all
router.get('/', requireAuth, (req, res) => {
  const attrs = db.prepare('SELECT * FROM kpi_attributes ORDER BY display_order, name').all();
  res.json(attrs);
});

// POST /api/kpi-attributes — create {name, display_order?}
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { name, display_order } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  const nextOrder = display_order !== undefined && display_order !== ''
    ? parseInt(display_order)
    : (() => {
        const max = db.prepare('SELECT MAX(display_order) AS m FROM kpi_attributes').get()?.m ?? 0;
        return max + 1;
      })();

  try {
    const result = db.prepare(
      'INSERT INTO kpi_attributes (name, display_order) VALUES (?, ?)'
    ).run(name.trim(), nextOrder);
    const created = db.prepare('SELECT * FROM kpi_attributes WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'An attribute with that name already exists.' });
    }
    throw err;
  }
});

// PUT /api/kpi-attributes/:id — update {name, display_order}
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.prepare('SELECT * FROM kpi_attributes WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Attribute not found' });

  const { name, display_order } = req.body;

  try {
    db.prepare(`
      UPDATE kpi_attributes
         SET name = ?,
             display_order = ?
       WHERE id = ?
    `).run(
      name !== undefined ? name.trim() : existing.name,
      display_order !== undefined ? parseInt(display_order) : existing.display_order,
      id
    );
    const updated = db.prepare('SELECT * FROM kpi_attributes WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'An attribute with that name already exists.' });
    }
    throw err;
  }
});

// DELETE /api/kpi-attributes/:id — only if no templates reference it
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.prepare('SELECT * FROM kpi_attributes WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Attribute not found' });

  const templateCount = db.prepare(
    'SELECT COUNT(*) AS n FROM kpi_templates WHERE attribute_id = ?'
  ).get(id).n;
  if (templateCount > 0) {
    return res.status(409).json({ error: `Cannot delete — ${templateCount} template(s) reference this attribute.` });
  }

  db.prepare('DELETE FROM kpi_attributes WHERE id = ?').run(id);
  res.json({ success: true });
});

module.exports = router;
