const express = require('express');
const { db } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/notifications — get my notifications (most recent 20)
router.get('/', requireAuth, (req, res) => {
  const notes = db.prepare(`
    SELECT * FROM notifications
     WHERE employee_id = ?
     ORDER BY created_at DESC
     LIMIT 20
  `).all(req.employee.id);
  res.json(notes);
});

// GET /api/notifications/unread-count
router.get('/unread-count', requireAuth, (req, res) => {
  const { count } = db.prepare(`
    SELECT COUNT(*) AS count FROM notifications
     WHERE employee_id = ? AND is_read = 0
  `).get(req.employee.id);
  res.json({ count });
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', requireAuth, (req, res) => {
  db.prepare(`
    UPDATE notifications SET is_read = 1
     WHERE id = ? AND employee_id = ?
  `).run(parseInt(req.params.id), req.employee.id);
  res.json({ ok: true });
});

// PATCH /api/notifications/read-all
router.patch('/read-all', requireAuth, (req, res) => {
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE employee_id = ?`).run(req.employee.id);
  res.json({ ok: true });
});

module.exports = router;
