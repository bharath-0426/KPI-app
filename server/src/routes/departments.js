/**
 * Departments CRUD routes
 */
const express = require('express');
const { db } = require('../db/schema');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/departments — list all with parent name and employee count
router.get('/', requireAuth, (req, res) => {
  const depts = db.prepare(`
    SELECT d.*,
           p.name AS parent_name,
           COUNT(DISTINCT e.id) AS employee_count
      FROM departments d
      LEFT JOIN departments p ON p.id = d.parent_dept_id
      LEFT JOIN employees e ON e.department_id = d.id AND e.is_active = 1
     GROUP BY d.id
     ORDER BY d.name
  `).all();
  res.json(depts);
});

// POST /api/departments — create {name, parent_dept_id?}
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { name, parent_dept_id } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (parent_dept_id) {
    const parent = db.prepare('SELECT * FROM departments WHERE id = ?').get(parseInt(parent_dept_id));
    if (!parent) return res.status(404).json({ error: 'Parent department not found' });
  }
  try {
    const result = db.prepare(
      'INSERT INTO departments (name, parent_dept_id) VALUES (?, ?)'
    ).run(name.trim(), parent_dept_id ? parseInt(parent_dept_id) : null);
    const created = db.prepare(`
      SELECT d.*, p.name AS parent_name
        FROM departments d
        LEFT JOIN departments p ON p.id = d.parent_dept_id
       WHERE d.id = ?
    `).get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'A department with that name already exists.' });
    }
    throw err;
  }
});

// PUT /api/departments/:id — update {name?, parent_dept_id?}
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.prepare('SELECT * FROM departments WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Department not found' });

  const { name, parent_dept_id } = req.body;

  // Prevent circular reference — walk up the intended parent chain
  if (parent_dept_id) {
    if (parseInt(parent_dept_id) === id) {
      return res.status(400).json({ error: 'A department cannot be its own parent.' });
    }
    // Check that setting this parent wouldn't create a cycle
    let cur = parseInt(parent_dept_id);
    const visited = new Set();
    while (cur) {
      if (visited.has(cur)) break;
      if (cur === id) {
        return res.status(400).json({ error: 'Circular department hierarchy detected.' });
      }
      visited.add(cur);
      const row = db.prepare('SELECT parent_dept_id FROM departments WHERE id = ?').get(cur);
      cur = row?.parent_dept_id || null;
    }
  }

  const newName = name !== undefined ? name.trim() : existing.name;
  const newParent = parent_dept_id !== undefined
    ? (parent_dept_id === '' || parent_dept_id === null ? null : parseInt(parent_dept_id))
    : existing.parent_dept_id;

  try {
    db.prepare('UPDATE departments SET name = ?, parent_dept_id = ? WHERE id = ?')
      .run(newName, newParent, id);
    const updated = db.prepare(`
      SELECT d.*, p.name AS parent_name,
             COUNT(DISTINCT e.id) AS employee_count
        FROM departments d
        LEFT JOIN departments p ON p.id = d.parent_dept_id
        LEFT JOIN employees e ON e.department_id = d.id AND e.is_active = 1
       WHERE d.id = ?
       GROUP BY d.id
    `).get(id);
    res.json(updated);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'A department with that name already exists.' });
    }
    throw err;
  }
});

// DELETE /api/departments/:id — only if no employees, no roles, no child depts
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.prepare('SELECT * FROM departments WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Department not found' });

  const empCount = db.prepare(
    'SELECT COUNT(*) AS n FROM employees WHERE department_id = ? AND is_active = 1'
  ).get(id).n;
  if (empCount > 0) {
    return res.status(409).json({ error: `Cannot delete — ${empCount} active employee(s) belong to this department.` });
  }

  const childCount = db.prepare(
    'SELECT COUNT(*) AS n FROM departments WHERE parent_dept_id = ?'
  ).get(id).n;
  if (childCount > 0) {
    return res.status(409).json({ error: `Cannot delete — ${childCount} child department(s) exist. Delete or reassign them first.` });
  }

  db.prepare('DELETE FROM departments WHERE id = ?').run(id);
  res.json({ success: true });
});

module.exports = router;
