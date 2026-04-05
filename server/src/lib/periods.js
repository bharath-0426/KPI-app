/**
 * Period helpers — frequency hierarchy and aggregation are driven by
 * the frequency_configs table rather than hardcoded constants.
 */

const { db } = require('../db/schema');

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// ── Date helpers ──────────────────────────────────────────────────────────────
function isoDate(d) { return d.toISOString().slice(0, 10); }
function todayStr() { return new Date().toISOString().slice(0, 10); }

// ── Dynamic frequency config ──────────────────────────────────────────────────

/** In-memory cache — avoids re-hitting the DB for stable config data */
let _freqConfigsCache = null;

/** Returns all frequency configs ordered by hierarchy_order. */
function getFreqConfigs() {
  if (!_freqConfigsCache) {
    _freqConfigsCache = db.prepare('SELECT * FROM frequency_configs ORDER BY hierarchy_order, display_order').all();
  }
  return _freqConfigsCache;
}

/** Call after any INSERT/UPDATE/DELETE on frequency_configs */
function invalidateFreqConfigsCache() {
  _freqConfigsCache = null;
}

/**
 * Returns { key → hierarchy_order } map.
 * Falls back to positional index for any key not in the table.
 */
function buildFreqLevel() {
  const map = {};
  for (const f of getFreqConfigs()) map[f.key] = f.hierarchy_order;
  return map;
}

/**
 * Returns { parentKey → childKey } map based on hierarchy_order.
 * e.g. monthly(2) → weekly(1), quarterly(3) → monthly(2)
 */
function buildChildType() {
  const configs = getFreqConfigs();
  const map = {};
  for (let i = 1; i < configs.length; i++) {
    map[configs[i].key] = configs[i - 1].key;
  }
  return map;
}

// ── Period generators (built-in types) ───────────────────────────────────────

function getWeeksForYear(year) {
  const weeks = [];
  const jan1    = new Date(Date.UTC(year, 0, 1));
  const jan1Day = jan1.getUTCDay();
  const offset  = jan1Day === 1 ? 0 : jan1Day === 0 ? 1 : 8 - jan1Day;
  const mon = new Date(jan1);
  mon.setUTCDate(mon.getUTCDate() + offset);

  let wk = 1;
  while (mon.getUTCFullYear() === year) {
    const fri = new Date(mon);
    fri.setUTCDate(fri.getUTCDate() + 4);
    const fmt   = { day: 'numeric', month: 'short', timeZone: 'UTC' };
    weeks.push({
      weekNum: wk,
      start: isoDate(mon),
      end:   isoDate(fri),
      label: `Week ${wk} ${year}  (${mon.toLocaleDateString('en-GB', fmt)} – ${fri.toLocaleDateString('en-GB', fmt)})`,
    });
    mon.setUTCDate(mon.getUTCDate() + 7);
    wk++;
  }
  return weeks;
}

function getMonthsForYear(year) {
  return Array.from({ length: 12 }, (_, m) => ({
    month: m + 1,
    start: isoDate(new Date(Date.UTC(year, m, 1))),
    end:   isoDate(new Date(Date.UTC(year, m + 1, 0))),
    label: `${MONTH_NAMES[m]} ${year}`,
  }));
}

function getQuartersForYear(year) {
  return [1, 2, 3, 4].map(q => ({
    quarter: q,
    start: isoDate(new Date(Date.UTC(year, (q - 1) * 3, 1))),
    end:   isoDate(new Date(Date.UTC(year, q * 3, 0))),
    label: `Q${q} ${year}`,
  }));
}

// ── DB helpers ────────────────────────────────────────────────────────────────

function getOrCreatePeriod(type, startDate, endDate, label) {
  let p = db.prepare(
    'SELECT * FROM scoring_periods WHERE period_type=? AND start_date=? AND end_date=?'
  ).get(type, startDate, endDate);
  if (!p) {
    const r = db.prepare(
      'INSERT INTO scoring_periods (period_type, start_date, end_date, label, is_active) VALUES (?,?,?,?,1)'
    ).run(type, startDate, endDate, label);
    p = db.prepare('SELECT * FROM scoring_periods WHERE id=?').get(r.lastInsertRowid);
  }
  return p;
}

/**
 * Returns available (non-future) periods for type + year.
 * Built-in types (weekly/monthly/quarterly/yearly) are auto-generated.
 * Custom types just return what's in the DB for that type and year.
 */
function getAvailablePeriodsForYear(type, year) {
  const today = todayStr();
  let items = [];

  if (type === 'weekly') {
    items = getWeeksForYear(year)
      .filter(w => w.start <= today)
      .map(w => getOrCreatePeriod('weekly', w.start, w.end, w.label));

  } else if (type === 'monthly') {
    items = getMonthsForYear(year)
      .filter(m => m.start <= today)
      .map(m => getOrCreatePeriod('monthly', m.start, m.end, m.label));

  } else if (type === 'quarterly') {
    items = getQuartersForYear(year)
      .filter(q => q.start <= today)
      .map(q => getOrCreatePeriod('quarterly', q.start, q.end, q.label));

  } else if (type === 'yearly') {
    const currentYear = new Date().getUTCFullYear();
    if (year <= currentYear) {
      items = [getOrCreatePeriod('yearly', `${year}-01-01`, `${year}-12-31`, `Year ${year}`)];
    }
  } else {
    // Custom frequency — return manually created periods from DB
    const yearStart = `${year}-01-01`;
    const yearEnd   = `${year}-12-31`;
    items = db.prepare(
      "SELECT * FROM scoring_periods WHERE period_type=? AND start_date>=? AND end_date<=? ORDER BY start_date DESC"
    ).all(type, yearStart, yearEnd);
  }

  return items.reverse();
}

/**
 * Returns the current default period for a given type.
 * For custom types, returns the most recent active period.
 */
function getCurrentDefaultPeriod(type) {
  const today  = new Date();
  const tStr   = isoDate(today);
  const y      = today.getUTCFullYear();
  const mo     = today.getUTCMonth();

  if (type === 'weekly') {
    const day   = today.getUTCDay();
    const toMon = day === 1 ? 0 : day === 0 ? -6 : 1 - day;
    const mon   = new Date(today);
    mon.setUTCDate(mon.getUTCDate() + toMon);
    const monStr = isoDate(mon);
    if (monStr > tStr) return null;
    const wks = getWeeksForYear(mon.getUTCFullYear());
    const wk  = wks.find(w => w.start === monStr);
    if (!wk) return null;
    const fri = new Date(mon); fri.setUTCDate(fri.getUTCDate() + 4);
    return getOrCreatePeriod('weekly', monStr, isoDate(fri), wk.label);
  }
  if (type === 'monthly') {
    const m = getMonthsForYear(y)[mo];
    return getOrCreatePeriod('monthly', m.start, m.end, m.label);
  }
  if (type === 'quarterly') {
    const q = getQuartersForYear(y)[Math.floor(mo / 3)];
    return getOrCreatePeriod('quarterly', q.start, q.end, q.label);
  }
  if (type === 'yearly') {
    return getOrCreatePeriod('yearly', `${y}-01-01`, `${y}-12-31`, `Year ${y}`);
  }
  // Custom: most recent active period that includes today
  return db.prepare(
    "SELECT * FROM scoring_periods WHERE period_type=? AND start_date<=? AND end_date>=? AND is_active=1 ORDER BY start_date DESC LIMIT 1"
  ).get(type, tStr, tStr) || null;
}

// ── Score aggregation ─────────────────────────────────────────────────────────

/**
 * Compute aggregated self/manager scores for a template within a higher-level period.
 * Uses equal-weight average (or sum / best_of) based on the parent frequency's rollup_method.
 * Returns { self_score, manager_score, child_count, child_scores[], is_aggregated }
 */
/**
 * _configs is optional — pass it to avoid re-fetching from DB on recursive calls.
 */
function computeAggregatedScore(employeeId, templateId, templateFreq, period, _configs) {
  const configs     = _configs || getFreqConfigs();
  const childTypeMap = {};
  for (let i = 1; i < configs.length; i++) {
    childTypeMap[configs[i].key] = configs[i - 1].key;
  }

  const childType = childTypeMap[period.period_type];
  if (!childType) {
    return { self_score: 0, manager_score: 0, child_count: 0, child_scores: [], is_aggregated: true };
  }

  const parentConfig  = configs.find(c => c.key === period.period_type);
  const rollupMethod  = parentConfig?.rollup_method || 'average';

  const childPeriods = db.prepare(
    'SELECT * FROM scoring_periods WHERE period_type=? AND start_date>=? AND start_date<=? ORDER BY start_date'
  ).all(childType, period.start_date, period.end_date);

  const selfValues    = [];
  const managerValues = [];
  const childScores   = [];

  for (const child of childPeriods) {
    let selfVal = 0, managerVal = 0;

    if (childType === templateFreq) {
      // Base level — read actual stored score
      const row = db.prepare(
        'SELECT self_score, manager_score, final_score, status FROM kpi_scores WHERE employee_id=? AND kpi_template_id=? AND scoring_period_id=?'
      ).get(employeeId, templateId, child.id);
      selfVal    = row?.self_score    ?? 0;
      managerVal = row?.manager_score ?? 0;
      childScores.push({
        period_id:     child.id,
        period_label:  child.label,
        period_start:  child.start_date,
        period_end:    child.end_date,
        self_score:    row?.self_score    ?? null,
        manager_score: row?.manager_score ?? null,
        final_score:   row?.final_score   ?? null,
        status:        row?.status        ?? 'pending',
      });
    } else {
      // Recurse one level deeper
      const sub   = computeAggregatedScore(employeeId, templateId, templateFreq, child, configs);
      selfVal    = sub.self_score;
      managerVal = sub.manager_score;
      childScores.push({
        period_id:     child.id,
        period_label:  child.label,
        period_start:  child.start_date,
        period_end:    child.end_date,
        self_score:    sub.self_score,
        manager_score: sub.manager_score,
        final_score:   null,
        status:        'aggregated',
      });
    }
    selfValues.push(selfVal);
    managerValues.push(managerVal);
  }

  let self_score = 0, manager_score = 0;
  if (selfValues.length > 0) {
    if (rollupMethod === 'sum') {
      self_score    = selfValues.reduce((a, b) => a + b, 0);
      manager_score = managerValues.reduce((a, b) => a + b, 0);
    } else if (rollupMethod === 'best_of') {
      self_score    = Math.max(...selfValues);
      manager_score = Math.max(...managerValues);
    } else {
      // average — equal weight for all periods
      self_score    = selfValues.reduce((a, b) => a + b, 0)    / selfValues.length;
      manager_score = managerValues.reduce((a, b) => a + b, 0) / managerValues.length;
    }
  }

  return {
    self_score,
    manager_score,
    child_count:  childPeriods.length,
    child_scores: childScores,
    is_aggregated: true,
  };
}

module.exports = {
  buildFreqLevel, buildChildType, getFreqConfigs, invalidateFreqConfigsCache,
  getWeeksForYear, getMonthsForYear, getQuartersForYear,
  getOrCreatePeriod, getAvailablePeriodsForYear, getCurrentDefaultPeriod,
  computeAggregatedScore,
};
