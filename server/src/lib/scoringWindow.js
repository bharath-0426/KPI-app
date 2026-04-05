const { db } = require('../db/schema');

const FREQS = ['daily', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'semi_annual', 'yearly'];

const DEFAULTS = {
  daily:       { enabled: false, days: 1  },
  weekly:      { enabled: true,  days: 28 },
  fortnightly: { enabled: true,  days: 14 },
  monthly:     { enabled: true,  days: 7  },
  quarterly:   { enabled: false, days: 15 },
  semi_annual: { enabled: false, days: 15 },
  yearly:      { enabled: false, days: 30 },
};

/**
 * Returns scoring window config for every frequency.
 * { freq: { enabled: bool, days: number } }
 * enabled = past periods can be scored up to `days` days after they ended.
 */
function getScoringWindows() {
  const rows = db.prepare(
    "SELECT key, value FROM app_settings WHERE key LIKE 'scoring_window_%'"
  ).all();
  const map = {};
  for (const r of rows) map[r.key] = r.value;

  const result = {};
  for (const freq of FREQS) {
    const eKey = `scoring_window_${freq}_enabled`;
    const dKey = `scoring_window_${freq}_days`;
    result[freq] = {
      enabled: map[eKey] !== undefined ? map[eKey] === '1' : DEFAULTS[freq].enabled,
      days:    map[dKey] !== undefined ? parseInt(map[dKey])  : DEFAULTS[freq].days,
    };
  }
  return result;
}

/**
 * Checks whether self-scoring is allowed for a given period right now.
 * Returns { open: bool, reason?: string }
 *
 * A period is open when:
 *   - is_active, start_date <= today, AND
 *   - either the period is still ongoing (end_date >= today)
 *   - or past scoring is enabled and the period ended within the last `days` days
 */
function isPeriodOpen(period) {
  const today = new Date().toISOString().slice(0, 10);

  if (!period.is_active) {
    return { open: false, reason: 'This scoring period is closed.' };
  }
  if (period.start_date > today) {
    return { open: false, reason: 'This period has not started yet.' };
  }

  // Period still ongoing
  if (period.end_date >= today) {
    return { open: true };
  }

  // Period has ended — check past scoring window
  const windows = getScoringWindows();
  const w = windows[period.period_type] ?? { enabled: false, days: 0 };

  if (!w.enabled) {
    return { open: false, reason: 'Past scoring is not enabled for this period type.' };
  }

  const endMs    = new Date(period.end_date).getTime();
  const todayMs  = new Date(today).getTime();
  const daysPast = Math.round((todayMs - endMs) / 86400000);

  if (daysPast > w.days) {
    return {
      open: false,
      reason: `Scoring window closed — this period ended ${daysPast} day${daysPast !== 1 ? 's' : ''} ago (limit: ${w.days} days).`,
    };
  }

  return { open: true };
}

module.exports = { getScoringWindows, isPeriodOpen };
