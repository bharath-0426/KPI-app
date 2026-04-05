const express = require('express');
const { db } = require('../db/schema');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getScoringWindows } = require('../lib/scoringWindow');

const router = express.Router();

// GET /api/settings/scoring-windows
router.get('/scoring-windows', requireAuth, (req, res) => {
  const windows = getScoringWindows();
  res.json(windows);
});

// PUT /api/settings/scoring-windows  (admin only)
// Body: { daily: { enabled, days }, weekly: { enabled, days }, … }
router.put('/scoring-windows', requireAdmin, (req, res) => {
  const VALID = ['daily','weekly','fortnightly','monthly','quarterly','semi_annual','yearly'];
  for (const freq of VALID) {
    const w = req.body[freq];
    if (!w) continue;
    const days = parseInt(w.days);
    if (!Number.isFinite(days) || days < 0 || days > 366) {
      return res.status(400).json({ error: `Invalid days for ${freq}: must be 0–366` });
    }
    db.prepare('UPDATE app_settings SET value = ? WHERE key = ?')
      .run(w.enabled ? '1' : '0', `scoring_window_${freq}_enabled`);
    db.prepare('UPDATE app_settings SET value = ? WHERE key = ?')
      .run(String(days), `scoring_window_${freq}_days`);
  }
  res.json(getScoringWindows());
});

// GET /api/settings/reconciliation-threshold
router.get('/reconciliation-threshold', requireAuth, (req, res) => {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'reconciliation_threshold'").get();
  res.json({ threshold: row ? parseFloat(row.value) : 1 });
});

// PUT /api/settings/reconciliation-threshold  (admin only)
router.put('/reconciliation-threshold', requireAdmin, (req, res) => {
  const { threshold } = req.body;
  const val = parseFloat(threshold);
  if (!Number.isFinite(val) || val < 0) {
    return res.status(400).json({ error: 'Threshold must be a non-negative number' });
  }
  db.prepare("UPDATE app_settings SET value = ? WHERE key = 'reconciliation_threshold'").run(String(val));
  res.json({ threshold: val });
});

module.exports = router;
