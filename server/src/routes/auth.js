const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');
const { getEmployeeWithRole } = require('../lib/hierarchy');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

function isExternalScorer(roleId) {
  if (!roleId) return false;
  try {
    return db.prepare('SELECT COUNT(*) AS n FROM kpi_template_scored_by WHERE role_id = ?').get(roleId).n > 0;
  } catch { return false; }
}

function isDistributor(roleId) {
  if (!roleId) return false;
  try {
    return db.prepare(`
      SELECT COUNT(*) AS n FROM kpi_template_scored_by sb
        JOIN kpi_templates kt ON kt.id = sb.template_id
       WHERE sb.role_id = ? AND kt.score_type = 'raw_100'
    `).get(roleId).n > 0;
  } catch { return false; }
}

const router = express.Router();

// POST /api/auth/login
router.post('/login', loginLimiter, (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const employee = db.prepare(
    'SELECT * FROM employees WHERE email = ? AND is_active = 1'
  ).get(email.toLowerCase().trim());

  if (!employee) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const match = bcrypt.compareSync(password, employee.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.employeeId = employee.id;
  req.session.save(() => {
    const full = getEmployeeWithRole(employee.id);
    const { password_hash, ...safe } = full;
    safe.is_external_scorer = isExternalScorer(safe.role_id);
    safe.is_distributor = isDistributor(safe.role_id);

    // Check if admin needs to change default password
    const setting = db.prepare("SELECT value FROM app_settings WHERE key = 'admin_password_changed'").get();
    const needsPasswordChange = employee.is_admin && setting && setting.value === '0';

    res.json({ employee: safe, needsPasswordChange });
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const { password_hash, ...safe } = req.employee;
  safe.is_external_scorer = isExternalScorer(safe.role_id);
    safe.is_distributor = isDistributor(safe.role_id);
  res.json({ employee: safe });
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Both current and new password required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.employee.id);
  const match = bcrypt.compareSync(currentPassword, employee.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE employees SET password_hash = ? WHERE id = ?').run(newHash, req.employee.id);

  if (req.employee.is_admin) {
    db.prepare("UPDATE app_settings SET value = '1' WHERE key = 'admin_password_changed'").run();
  }

  res.json({ ok: true });
});

module.exports = router;
