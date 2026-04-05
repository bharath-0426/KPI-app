/**
 * Meta routes: org tree
 * Note: /roles and /departments are handled by dedicated route files
 */
const express = require('express');
const { db } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');
const { getVisibleEmployeeIds } = require('../lib/hierarchy');

const router = express.Router();

// GET /api/org-tree
// Returns the org tree rooted at the current user (or full tree for admin/GH).
router.get('/org-tree', requireAuth, (req, res) => {
  const visibleIds = req.employee.is_admin
    ? db.prepare('SELECT id FROM employees WHERE is_active = 1').all().map(r => r.id)
    : getVisibleEmployeeIds(req.employee.id);

  const placeholders = visibleIds.map(() => '?').join(',');
  const employees = db.prepare(`
    SELECT e.id, e.name, e.email, e.reports_to,
           r.name AS role_name, r.hierarchy_level,
           d.name AS department_name
      FROM employees e
      LEFT JOIN roles r ON r.id = e.role_id
      LEFT JOIN departments d ON d.id = e.department_id
     WHERE e.id IN (${placeholders}) AND e.is_active = 1
  `).all(...visibleIds);

  // Build tree structure
  const map = {};
  employees.forEach(e => { map[e.id] = { ...e, children: [] }; });
  const roots = [];
  employees.forEach(e => {
    if (e.reports_to && map[e.reports_to]) {
      map[e.reports_to].children.push(map[e.id]);
    } else {
      roots.push(map[e.id]);
    }
  });

  res.json(roots);
});

module.exports = router;
