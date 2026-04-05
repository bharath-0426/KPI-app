const { getEmployeeWithRole } = require('../lib/hierarchy');

/** Attaches full employee record to req.employee if session exists. */
function attachEmployee(req, res, next) {
  if (req.session && req.session.employeeId) {
    const emp = getEmployeeWithRole(req.session.employeeId);
    if (emp && emp.is_active) {
      req.employee = emp;
    } else {
      req.session.destroy(() => {});
    }
  }
  next();
}

/** Requires a logged-in session. */
function requireAuth(req, res, next) {
  if (!req.employee) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

/** Requires is_admin = 1. */
function requireAdmin(req, res, next) {
  if (!req.employee || !req.employee.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { attachEmployee, requireAuth, requireAdmin };
