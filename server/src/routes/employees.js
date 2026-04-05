const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db/schema');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const {
  getVisibleEmployeeIds,
  getEmployeeWithRole,
  validateReportsTo,
} = require('../lib/hierarchy');

const router = express.Router();

// ── GET /api/employees ────────────────────────────────────────────────────────
// Returns all employees visible to the current user.
// Admins see everyone (including inactive). Others see their subtree (active only).
router.get('/', requireAuth, (req, res) => {
  let employees;

  if (req.employee.is_admin) {
    employees = db.prepare(`
      SELECT e.id, e.employee_code, e.name, e.email, e.role_id, e.department_id, e.reports_to,
             e.is_admin, e.is_active, e.joined_at, e.created_at,
             r.name AS role_name, r.hierarchy_level,
             d.name AS department_name,
             m.name AS manager_name
        FROM employees e
        LEFT JOIN roles r ON r.id = e.role_id
        LEFT JOIN departments d ON d.id = e.department_id
        LEFT JOIN employees m ON m.id = e.reports_to
       ORDER BY r.hierarchy_level, e.name
    `).all();
  } else {
    const visibleIds = getVisibleEmployeeIds(req.employee.id);
    const placeholders = visibleIds.map(() => '?').join(',');
    employees = db.prepare(`
      SELECT e.id, e.employee_code, e.name, e.email, e.role_id, e.department_id, e.reports_to,
             e.is_admin, e.is_active, e.joined_at, e.created_at,
             r.name AS role_name, r.hierarchy_level,
             d.name AS department_name,
             m.name AS manager_name
        FROM employees e
        LEFT JOIN roles r ON r.id = e.role_id
        LEFT JOIN departments d ON d.id = e.department_id
        LEFT JOIN employees m ON m.id = e.reports_to
       WHERE e.id IN (${placeholders}) AND e.is_active = 1
       ORDER BY r.hierarchy_level, e.name
    `).all(...visibleIds);
  }

  res.json(employees);
});

// ── GET /api/employees/:id ────────────────────────────────────────────────────
router.get('/:id', requireAuth, (req, res) => {
  const targetId = parseInt(req.params.id);
  const visibleIds = req.employee.is_admin
    ? null
    : getVisibleEmployeeIds(req.employee.id);

  if (visibleIds && !visibleIds.includes(targetId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const employee = db.prepare(`
    SELECT e.id, e.employee_code, e.name, e.email, e.role_id, e.department_id, e.reports_to,
           e.is_admin, e.is_active, e.joined_at, e.created_at,
           r.name AS role_name, r.hierarchy_level,
           d.name AS department_name,
           m.name AS manager_name
      FROM employees e
      LEFT JOIN roles r ON r.id = e.role_id
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN employees m ON m.id = e.reports_to
     WHERE e.id = ?
  `).get(targetId);

  if (!employee) return res.status(404).json({ error: 'Employee not found' });
  res.json(employee);
});

// ── POST /api/employees ───────────────────────────────────────────────────────
router.post('/', requireAdmin, (req, res) => {
  const { name, email, password, role_id, department_id, reports_to, joined_at, employee_code } = req.body;

  if (!name || !email || !password || !role_id || !department_id) {
    return res.status(400).json({ error: 'name, email, password, role_id, department_id are required' });
  }

  const existing = db.prepare('SELECT id FROM employees WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: 'Email already in use' });

  if (employee_code && employee_code.trim()) {
    const dupCode = db.prepare('SELECT id FROM employees WHERE employee_code = ?').get(employee_code.trim());
    if (dupCode) return res.status(409).json({ error: 'Employee code already in use' });
  }

  const hierarchyError = validateReportsTo(role_id, reports_to || null);
  if (hierarchyError) return res.status(400).json({ error: hierarchyError });

  const password_hash = bcrypt.hashSync(password, 10);

  const result = db.prepare(`
    INSERT INTO employees (name, email, password_hash, role_id, department_id, reports_to, joined_at, employee_code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name.trim(),
    email.toLowerCase().trim(),
    password_hash,
    role_id,
    department_id,
    reports_to || null,
    joined_at || null,
    employee_code ? employee_code.trim() : null
  );

  const created = getEmployeeWithRole(result.lastInsertRowid);
  const { password_hash: _, ...safe } = created;
  res.status(201).json(safe);
});

// ── PUT /api/employees/:id ────────────────────────────────────────────────────
router.put('/:id', requireAdmin, (req, res) => {
  const targetId = parseInt(req.params.id);
  const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(targetId);
  if (!existing) return res.status(404).json({ error: 'Employee not found' });

  const { name, email, password, role_id, department_id, reports_to, is_active, joined_at, employee_code } = req.body;

  // Validate hierarchy if role or manager changed
  const newRoleId = role_id ?? existing.role_id;
  const newReportsTo = reports_to !== undefined ? (reports_to || null) : existing.reports_to;

  if (role_id || reports_to !== undefined) {
    const hierarchyError = validateReportsTo(newRoleId, newReportsTo);
    if (hierarchyError) return res.status(400).json({ error: hierarchyError });
  }

  // Check email uniqueness if changed
  if (email && email.toLowerCase().trim() !== existing.email) {
    const dupe = db.prepare('SELECT id FROM employees WHERE email = ? AND id != ?').get(email.toLowerCase().trim(), targetId);
    if (dupe) return res.status(409).json({ error: 'Email already in use' });
  }

  // Check employee_code uniqueness if changed
  const newCode = employee_code !== undefined
    ? (employee_code ? employee_code.trim() : null)
    : existing.employee_code;
  if (newCode && newCode !== existing.employee_code) {
    const dupeCode = db.prepare('SELECT id FROM employees WHERE employee_code = ? AND id != ?').get(newCode, targetId);
    if (dupeCode) return res.status(409).json({ error: 'Employee code already in use' });
  }

  const updates = {
    name: name ?? existing.name,
    email: email ? email.toLowerCase().trim() : existing.email,
    role_id: newRoleId,
    department_id: department_id ?? existing.department_id,
    reports_to: newReportsTo,
    is_active: is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
    joined_at: joined_at !== undefined ? joined_at : existing.joined_at,
    employee_code: newCode,
  };

  db.prepare(`
    UPDATE employees
       SET name = ?, email = ?, role_id = ?, department_id = ?,
           reports_to = ?, is_active = ?, joined_at = ?, employee_code = ?
     WHERE id = ?
  `).run(
    updates.name, updates.email, updates.role_id, updates.department_id,
    updates.reports_to, updates.is_active, updates.joined_at, updates.employee_code, targetId
  );

  if (password) {
    const newHash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE employees SET password_hash = ? WHERE id = ?').run(newHash, targetId);
  }

  const updated = getEmployeeWithRole(targetId);
  const { password_hash, ...safe } = updated;
  res.json(safe);
});

// ── DELETE /api/employees/:id (soft-delete = deactivate) ─────────────────────
router.delete('/:id', requireAdmin, (req, res) => {
  const targetId = parseInt(req.params.id);
  if (targetId === req.employee.id) {
    return res.status(400).json({ error: 'Cannot deactivate your own account' });
  }
  const existing = db.prepare('SELECT id FROM employees WHERE id = ?').get(targetId);
  if (!existing) return res.status(404).json({ error: 'Employee not found' });

  db.prepare('UPDATE employees SET is_active = 0 WHERE id = ?').run(targetId);
  res.json({ ok: true });
});

module.exports = router;
