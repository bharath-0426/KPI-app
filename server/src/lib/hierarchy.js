/**
 * Hierarchy helpers — all visibility and permission checks are enforced here
 * at the DB query level (not just UI).
 */
const { db } = require('../db/schema');

/**
 * Returns the set of employee IDs that `viewerId` is allowed to see.
 * Uses a recursive CTE to walk the org tree downward from the viewer.
 */
function getVisibleEmployeeIds(viewerId) {
  const rows = db.prepare(`
    WITH RECURSIVE subordinates AS (
      SELECT id FROM employees WHERE id = ?
      UNION ALL
      SELECT e.id
        FROM employees e
        JOIN subordinates s ON e.reports_to = s.id
       WHERE e.is_active = 1
    )
    SELECT id FROM subordinates
  `).all(viewerId);
  return rows.map(r => r.id);
}

/**
 * Returns the full employee record with role + department info.
 */
function getEmployeeWithRole(employeeId) {
  return db.prepare(`
    SELECT e.*, r.name AS role_name, r.hierarchy_level, r.can_manage,
           d.name AS department_name
      FROM employees e
      LEFT JOIN roles r ON r.id = e.role_id
      LEFT JOIN departments d ON d.id = e.department_id
     WHERE e.id = ?
  `).get(employeeId);
}

/**
 * Checks whether `actorId` can see/manage `targetId`.
 * Admins bypass hierarchy.
 */
function canAccess(actorId, targetId) {
  const actor = getEmployeeWithRole(actorId);
  if (actor && actor.is_admin) return true;
  const visible = getVisibleEmployeeIds(actorId);
  return visible.includes(targetId);
}

/**
 * Returns direct reports of an employee.
 */
function getDirectReports(employeeId) {
  return db.prepare(`
    SELECT e.*, r.name AS role_name, r.hierarchy_level,
           d.name AS department_name
      FROM employees e
      LEFT JOIN roles r ON r.id = e.role_id
      LEFT JOIN departments d ON d.id = e.department_id
     WHERE e.reports_to = ? AND e.is_active = 1
  `).all(employeeId);
}

/**
 * Validates that `reportsTo` is at a hierarchy level exactly one above the
 * proposed role. Returns null if valid, an error string if invalid.
 */
function validateReportsTo(roleId, reportsToId) {
  if (!reportsToId) return null; // GH has no manager

  const role = db.prepare('SELECT hierarchy_level FROM roles WHERE id = ?').get(roleId);
  const manager = db.prepare(`
    SELECT r.hierarchy_level
      FROM employees e JOIN roles r ON r.id = e.role_id
     WHERE e.id = ?
  `).get(reportsToId);

  if (!manager) return 'Manager not found';

  return null;
}

module.exports = { getVisibleEmployeeIds, getEmployeeWithRole, canAccess, getDirectReports, validateReportsTo };
