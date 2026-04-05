/**
 * Roles CRUD routes with parent-child hierarchy support
 */
const express = require('express');
const { db } = require('../db/schema');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/roles — list all with parent name and employee count
router.get('/', requireAuth, (req, res) => {
  const roles = db.prepare(`
    SELECT r.*,
           p.name AS parent_role_name,
           COUNT(DISTINCT e.id) AS employee_count
      FROM roles r
      LEFT JOIN roles p ON p.id = r.parent_role_id
      LEFT JOIN employees e ON e.role_id = r.id AND e.is_active = 1
     GROUP BY r.id
     ORDER BY r.hierarchy_level, r.name
  `).all();
  res.json(roles);
});

// POST /api/roles — create {name, parent_role_id?}
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { name, parent_role_id } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  let hierarchy_level = 1;
  if (parent_role_id) {
    const resolvedParent = db.prepare('SELECT * FROM roles WHERE id = ?').get(parseInt(parent_role_id));
    if (!resolvedParent) return res.status(404).json({ error: 'Parent role not found' });
    hierarchy_level = resolvedParent.hierarchy_level + 1;
  }

  try {
    const result = db.prepare(`
      INSERT INTO roles (name, parent_role_id, hierarchy_level)
      VALUES (?, ?, ?)
    `).run(name.trim(), parent_role_id ? parseInt(parent_role_id) : null, hierarchy_level);

    const created = db.prepare(`
      SELECT r.*, p.name AS parent_role_name
        FROM roles r
        LEFT JOIN roles p ON p.id = r.parent_role_id
       WHERE r.id = ?
    `).get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'A role with that name already exists.' });
    }
    throw err;
  }
});

// PUT /api/roles/:id — update {name, parent_role_id}
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.prepare('SELECT * FROM roles WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Role not found' });

  const { name, parent_role_id } = req.body;

  let hierarchy_level = existing.hierarchy_level;
  let resolvedParentId = existing.parent_role_id;

  if (parent_role_id !== undefined) {
    if (parent_role_id === null || parent_role_id === '') {
      resolvedParentId = null;
      hierarchy_level = 1;
    } else {
      if (parseInt(parent_role_id) === id) {
        return res.status(400).json({ error: 'A role cannot be its own parent.' });
      }
      const parentRole = db.prepare('SELECT * FROM roles WHERE id = ?').get(parseInt(parent_role_id));
      if (!parentRole) return res.status(404).json({ error: 'Parent role not found' });
      resolvedParentId = parseInt(parent_role_id);
      hierarchy_level = parentRole.hierarchy_level + 1;
    }
  }

  try {
    db.prepare(`
      UPDATE roles
         SET name = ?,
             parent_role_id = ?,
             hierarchy_level = ?
       WHERE id = ?
    `).run(
      name !== undefined ? name.trim() : existing.name,
      resolvedParentId,
      hierarchy_level,
      id
    );

    const updated = db.prepare(`
      SELECT r.*, p.name AS parent_role_name,
             COUNT(DISTINCT e.id) AS employee_count
        FROM roles r
        LEFT JOIN roles p ON p.id = r.parent_role_id
        LEFT JOIN employees e ON e.role_id = r.id AND e.is_active = 1
       WHERE r.id = ?
       GROUP BY r.id
    `).get(id);
    res.json(updated);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'A role with that name already exists.' });
    }
    throw err;
  }
});

// DELETE /api/roles/:id — only if no employees
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.prepare('SELECT * FROM roles WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Role not found' });

  const empCount = db.prepare(
    'SELECT COUNT(*) AS n FROM employees WHERE role_id = ? AND is_active = 1'
  ).get(id).n;
  if (empCount > 0) {
    return res.status(409).json({ error: `Cannot delete — ${empCount} active employee(s) have this role.` });
  }

  // Check for child roles
  const childCount = db.prepare(
    'SELECT COUNT(*) AS n FROM roles WHERE parent_role_id = ?'
  ).get(id).n;
  if (childCount > 0) {
    return res.status(409).json({ error: `Cannot delete — ${childCount} child role(s) exist under this role. Delete or reassign them first.` });
  }

  // Check for KPI templates referencing this role
  const templateCount = db.prepare(
    'SELECT COUNT(*) AS n FROM kpi_templates WHERE role_id = ?'
  ).get(id).n;
  if (templateCount > 0) {
    return res.status(409).json({ error: `Cannot delete — ${templateCount} KPI template(s) are assigned to this role. Remove the role from those templates first.` });
  }

  db.prepare('DELETE FROM roles WHERE id = ?').run(id);
  res.json({ success: true });
});

module.exports = router;
