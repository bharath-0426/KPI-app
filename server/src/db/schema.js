const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../data/kpi.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');   // safe with WAL, faster than FULL
db.pragma('cache_size = -16000');    // 16 MB page cache (negative = kibibytes)
db.pragma('temp_store = MEMORY');    // temp tables & indices in memory

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      parent_role_id INTEGER REFERENCES roles(id),
      hierarchy_level INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role_id INTEGER REFERENCES roles(id),
      department_id INTEGER REFERENCES departments(id),
      reports_to INTEGER REFERENCES employees(id),
      is_admin INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      joined_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS kpi_attributes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      display_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kpi_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role_id INTEGER NOT NULL REFERENCES roles(id),
      attribute_id INTEGER NOT NULL REFERENCES kpi_attributes(id),
      sub_metric_name TEXT NOT NULL,
      measurement_description TEXT,
      scoring_guide TEXT,
      frequency TEXT NOT NULL,
      formula TEXT,
      calculation_guide TEXT,
      weight_percentage REAL NOT NULL,
      score_type TEXT NOT NULL CHECK(score_type IN ('scale_2_5','raw_100','scale_1_5','scale_1_10','calculated')),
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scoring_periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_type TEXT NOT NULL CHECK(period_type IN ('weekly','monthly','quarterly')),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      label TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS kpi_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      kpi_template_id INTEGER NOT NULL REFERENCES kpi_templates(id),
      scoring_period_id INTEGER NOT NULL REFERENCES scoring_periods(id),
      self_score REAL,
      manager_score REAL,
      final_score REAL,
      self_notes TEXT,
      manager_notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','self_submitted','manager_submitted','both_submitted','disputed','reconciled')),
      reconciled_by INTEGER REFERENCES employees(id),
      reconciliation_notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(employee_id, kpi_template_id, scoring_period_id)
    );

    CREATE TABLE IF NOT EXISTS rupee_distributions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      distributor_id INTEGER NOT NULL REFERENCES employees(id),
      scoring_period_id INTEGER NOT NULL REFERENCES scoring_periods(id),
      kpi_template_id INTEGER NOT NULL REFERENCES kpi_templates(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(distributor_id, scoring_period_id, kpi_template_id)
    );

    CREATE TABLE IF NOT EXISTS rupee_distribution_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      distribution_id INTEGER NOT NULL REFERENCES rupee_distributions(id),
      recipient_id INTEGER NOT NULL REFERENCES employees(id),
      amount INTEGER NOT NULL DEFAULT 0 CHECK(amount >= 0 AND amount <= 100)
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      type TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_employee ON notifications(employee_id, is_read)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS kpi_score_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kpi_score_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      kpi_template_id INTEGER NOT NULL,
      scoring_period_id INTEGER NOT NULL,
      changed_by INTEGER NOT NULL,
      change_type TEXT NOT NULL,
      old_value REAL,
      new_value REAL,
      notes TEXT,
      changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_score_history_score ON kpi_score_history(kpi_score_id)`);

  // Performance indexes (only for tables created in initSchema)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_kpi_scores_employee_period
      ON kpi_scores (employee_id, scoring_period_id);
    CREATE INDEX IF NOT EXISTS idx_kpi_scores_template
      ON kpi_scores (kpi_template_id);
    CREATE INDEX IF NOT EXISTS idx_kpi_scores_status
      ON kpi_scores (status);
    CREATE INDEX IF NOT EXISTS idx_employees_role
      ON employees (role_id);
    CREATE INDEX IF NOT EXISTS idx_employees_reports_to
      ON employees (reports_to);
    CREATE INDEX IF NOT EXISTS idx_scoring_periods_active
      ON scoring_periods (is_active);
    CREATE INDEX IF NOT EXISTS idx_rdi_recipient
      ON rupee_distribution_items (recipient_id);
    CREATE INDEX IF NOT EXISTS idx_kpi_scores_period
      ON kpi_scores (scoring_period_id);
  `);
}

/**
 * Run one-time schema migrations.
 * Add 'yearly' to scoring_periods.period_type CHECK constraint by recreating the table.
 */
function runMigrations() {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='scoring_periods'"
  ).get();

  // If table doesn't exist yet or already has 'yearly', nothing to do
  if (row && !row.sql.includes('yearly')) {
    console.log('[migrate] Upgrading scoring_periods to support yearly period type…');
    db.pragma('foreign_keys = 0');
    db.exec(`
      CREATE TABLE scoring_periods_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        period_type TEXT NOT NULL CHECK(period_type IN ('weekly','monthly','quarterly','yearly')),
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        label TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO scoring_periods_new SELECT * FROM scoring_periods;
      DROP TABLE scoring_periods;
      ALTER TABLE scoring_periods_new RENAME TO scoring_periods;
    `);
    db.pragma('foreign_keys = 1');
    console.log('[migrate] Done.');
  }

  // M1) Expand scoring_periods to support daily, fortnightly, semi_annual period types
  const spRowM1 = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='scoring_periods'").get();
  if (spRowM1 && !spRowM1.sql.includes('daily')) {
    console.log('[migrate] Expanding scoring_periods to support daily/fortnightly/semi_annual…');
    db.pragma('foreign_keys = 0');
    db.exec(`
      CREATE TABLE scoring_periods_m1 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        period_type TEXT NOT NULL CHECK(period_type IN ('daily','weekly','fortnightly','monthly','quarterly','semi_annual','yearly')),
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        label TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO scoring_periods_m1 SELECT * FROM scoring_periods;
      DROP TABLE scoring_periods;
      ALTER TABLE scoring_periods_m1 RENAME TO scoring_periods;
    `);
    db.pragma('foreign_keys = 1');
    console.log('[migrate] Done.');
  }

  // M2) Insert daily, fortnightly, semi_annual frequencies and renumber hierarchy_order
  // Guard: frequency_configs table is created in migration H — skip on fresh databases
  const fcTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='frequency_configs'").get();
  const hasDaily = fcTableExists ? db.prepare("SELECT id FROM frequency_configs WHERE key='daily'").get() : null;
  if (fcTableExists && !hasDaily) {
    console.log('[migrate] Adding daily/fortnightly/semi_annual frequencies…');
    // Renumber existing built-ins to make room: weekly→2, monthly→4, quarterly→5, yearly→7
    for (const [key, order] of [['weekly',2],['monthly',4],['quarterly',5],['yearly',7]]) {
      db.prepare("UPDATE frequency_configs SET hierarchy_order=? WHERE key=?").run(order, key);
    }
    const fcInsertNew = db.prepare(`
      INSERT OR IGNORE INTO frequency_configs (key, label, display_order, is_system, hierarchy_order, duration_unit, duration_value, start_anchor, rollup_method)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const f of [
      ['daily',       'Daily',       0, 1, 1, 'day',   1, 1, 'average'],
      ['fortnightly', 'Fortnightly', 0, 1, 3, 'week',  2, 1, 'average'],
      ['semi_annual', 'Semi Annual', 0, 1, 6, 'month', 6, 1, 'average'],
    ]) fcInsertNew.run(...f);
    // Fix display_order so all appear in logical order
    const displayOrders = [
      ['daily', 1], ['weekly', 2], ['fortnightly', 3],
      ['monthly', 4], ['quarterly', 5], ['semi_annual', 6], ['yearly', 7],
    ];
    for (const [key, ord] of displayOrders) {
      db.prepare("UPDATE frequency_configs SET display_order=? WHERE key=?").run(ord, key);
    }
    console.log('[migrate] Done.');
  }

  // A0) Add parent_dept_id to departments if missing
  const deptCols = db.prepare("PRAGMA table_info(departments)").all();
  if (!deptCols.find(c => c.name === 'parent_dept_id')) {
    console.log('[migrate] Adding parent_dept_id to departments…');
    db.exec('ALTER TABLE departments ADD COLUMN parent_dept_id INTEGER REFERENCES departments(id)');
  }

  // A) Add parent_role_id to roles if missing, then remove department_id
  const rolesCols = db.prepare("PRAGMA table_info(roles)").all();
  if (!rolesCols.find(c => c.name === 'parent_role_id')) {
    console.log('[migrate] Adding parent_role_id to roles…');
    db.exec('ALTER TABLE roles ADD COLUMN parent_role_id INTEGER REFERENCES roles(id)');
  }
  if (rolesCols.find(c => c.name === 'department_id')) {
    console.log('[migrate] Removing department_id from roles…');
    db.pragma('foreign_keys = 0');
    db.exec(`
      CREATE TABLE roles_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        parent_role_id INTEGER,
        hierarchy_level INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO roles_new (id, name, parent_role_id, hierarchy_level, created_at)
        SELECT id, name, parent_role_id, hierarchy_level, created_at FROM roles;
      DROP TABLE roles;
      ALTER TABLE roles_new RENAME TO roles;
    `);
    db.pragma('foreign_keys = 1');
    console.log('[migrate] Done removing department_id from roles.');
  }

  // B) Create junction table for multi-assignment
  db.exec(`
    CREATE TABLE IF NOT EXISTS kpi_template_scored_by (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES kpi_templates(id) ON DELETE CASCADE,
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      UNIQUE(template_id, role_id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS kpi_template_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES kpi_templates(id) ON DELETE CASCADE,
      role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
      dept_id INTEGER REFERENCES departments(id) ON DELETE CASCADE
    )
  `);

  // Indexes for migration-created tables
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_kpi_template_assignments_template
      ON kpi_template_assignments (template_id);
    CREATE INDEX IF NOT EXISTS idx_kpi_template_scored_by_role
      ON kpi_template_scored_by (role_id);
    CREATE INDEX IF NOT EXISTS idx_kta_role
      ON kpi_template_assignments (role_id);
    CREATE INDEX IF NOT EXISTS idx_kta_dept
      ON kpi_template_assignments (dept_id);
  `);

  // C) Migrate existing kpi_templates.role_id → assignments (run once)
  const alreadyMigrated = db.prepare("SELECT COUNT(*) AS n FROM kpi_template_assignments").get().n;
  if (alreadyMigrated === 0) {
    console.log('[migrate] Migrating existing template role assignments…');
    db.exec(`
      INSERT INTO kpi_template_assignments (template_id, role_id)
      SELECT id, role_id FROM kpi_templates WHERE role_id IS NOT NULL
    `);
  }

  // D) Add per-role weight_percentage to kpi_template_assignments
  const assignCols = db.prepare("PRAGMA table_info(kpi_template_assignments)").all();
  if (!assignCols.find(c => c.name === 'weight_percentage')) {
    console.log('[migrate] Adding per-role weight_percentage to kpi_template_assignments…');
    db.exec('ALTER TABLE kpi_template_assignments ADD COLUMN weight_percentage REAL NOT NULL DEFAULT 0');
    db.exec(`
      UPDATE kpi_template_assignments
         SET weight_percentage = (SELECT weight_percentage FROM kpi_templates WHERE id = template_id)
       WHERE role_id IS NOT NULL
    `);
    console.log('[migrate] Done.');
  }

  // E) Rename abbreviated role names to full names
  //    If the target name already exists, merge: re-point all references then drop the source.
  const renames = [
    ['Dir of Ops',  'Director of Operations'],
    ['GH',          'Group Head'],
    ['PM',          'Project Manager'],
    ['EM',          'Engineering Manager'],
    ['PL',          'Project Lead'],
    ['TM',          'Team Member'],
  ];
  for (const [from, to] of renames) {
    const src = db.prepare("SELECT id FROM roles WHERE name = ?").get(from);
    if (!src) continue;
    const dst = db.prepare("SELECT id FROM roles WHERE name = ?").get(to);
    if (!dst) {
      // Simple rename
      console.log(`[migrate] Renaming role '${from}' → '${to}'`);
      db.prepare("UPDATE roles SET name = ? WHERE name = ?").run(to, from);
    } else {
      // Target already exists — merge src into dst then delete src
      console.log(`[migrate] Merging role '${from}' (id ${src.id}) into '${to}' (id ${dst.id})`);
      db.prepare("UPDATE employees SET role_id = ? WHERE role_id = ?").run(dst.id, src.id);
      db.prepare("UPDATE kpi_templates SET role_id = ? WHERE role_id = ?").run(dst.id, src.id);
      db.prepare("UPDATE kpi_template_assignments SET role_id = ? WHERE role_id = ?").run(dst.id, src.id);
      db.prepare("DELETE FROM kpi_template_scored_by WHERE role_id = ?").run(src.id);
      db.prepare("UPDATE roles SET parent_role_id = ? WHERE parent_role_id = ?").run(dst.id, src.id);
      db.prepare("DELETE FROM roles WHERE id = ?").run(src.id);
    }
  }

  // F) Fix hierarchy levels for the canonical role names
  const correctLevels = [
    ['Director of Operations', 1],
    ['Group Head',             2],
    ['Project Manager',        3],
    ['Engineering Manager',    3],
    ['Project Lead',           4],
    ['Team Member',            5],
  ];
  for (const [name, level] of correctLevels) {
    const row = db.prepare("SELECT id, hierarchy_level FROM roles WHERE name = ?").get(name);
    if (row && row.hierarchy_level !== level) {
      console.log(`[migrate] Fixing hierarchy level for '${name}': ${row.hierarchy_level} → ${level}`);
      db.prepare("UPDATE roles SET hierarchy_level = ? WHERE name = ?").run(level, name);
    }
  }

  // G) score_type_configs table + built-in seed
  db.exec(`
    CREATE TABLE IF NOT EXISTS score_type_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      behavior TEXT NOT NULL CHECK(behavior IN ('scale','distribution','calculated')),
      min_value REAL,
      max_value REAL,
      display_order INTEGER NOT NULL DEFAULT 0,
      is_system INTEGER NOT NULL DEFAULT 0
    )
  `);
  // Add new columns to existing installs
  const stcCols = db.prepare("PRAGMA table_info(score_type_configs)").all().map(c => c.name);
  for (const [col, def] of [
    ['step',             'REAL NOT NULL DEFAULT 1'],
    ['higher_is_better', 'INTEGER NOT NULL DEFAULT 1'],
    ['suffix',           "TEXT NOT NULL DEFAULT ''"],
  ]) {
    if (!stcCols.includes(col)) {
      db.exec(`ALTER TABLE score_type_configs ADD COLUMN ${col} ${def}`);
    }
  }

  const stcInsert = db.prepare(`
    INSERT OR IGNORE INTO score_type_configs (key, label, behavior, min_value, max_value, display_order, is_system)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const s of [
    ['scale_2_5',  'Scale 2–5',               'scale',        2, 5,    1, 1],
    ['scale_1_5',  'Scale 1–5',               'scale',        1, 5,    2, 1],
    ['scale_1_10', 'Scale 1–10',              'scale',        1, 10,   3, 1],
    ['raw_100',    'Raw 100 (₹ distribution)', 'distribution', null, null, 4, 1],
    ['calculated', 'Calculated',              'calculated',   null, null, 5, 1],
  ]) stcInsert.run(...s);

  // H) frequency_configs table + built-in seed
  db.exec(`
    CREATE TABLE IF NOT EXISTS frequency_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      is_system INTEGER NOT NULL DEFAULT 0,
      hierarchy_order INTEGER NOT NULL DEFAULT 0,
      duration_unit TEXT NOT NULL DEFAULT 'month',
      duration_value INTEGER NOT NULL DEFAULT 1,
      start_anchor INTEGER NOT NULL DEFAULT 1,
      rollup_method TEXT NOT NULL DEFAULT 'average'
    )
  `);
  // Add new columns to existing installs
  const fcCols = db.prepare("PRAGMA table_info(frequency_configs)").all().map(c => c.name);
  for (const [col, def] of [
    ['hierarchy_order', 'INTEGER NOT NULL DEFAULT 0'],
    ['duration_unit',   "TEXT NOT NULL DEFAULT 'month'"],
    ['duration_value',  'INTEGER NOT NULL DEFAULT 1'],
    ['start_anchor',    'INTEGER NOT NULL DEFAULT 1'],
    ['rollup_method',   "TEXT NOT NULL DEFAULT 'average'"],
    ['is_active',       'INTEGER NOT NULL DEFAULT 1'],
  ]) {
    if (!fcCols.includes(col)) {
      db.exec(`ALTER TABLE frequency_configs ADD COLUMN ${col} ${def}`);
    }
  }
  const fcInsert = db.prepare(`
    INSERT OR IGNORE INTO frequency_configs (key, label, display_order, is_system, hierarchy_order, duration_unit, duration_value, start_anchor, rollup_method)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const f of [
    ['daily',       'Daily',       1, 1, 1, 'day',     1, 1, 'average'],
    ['weekly',      'Weekly',      2, 1, 2, 'week',    1, 1, 'average'],
    ['fortnightly', 'Fortnightly', 3, 1, 3, 'week',    2, 1, 'average'],
    ['monthly',     'Monthly',     4, 1, 4, 'month',   1, 1, 'average'],
    ['quarterly',   'Quarterly',   5, 1, 5, 'quarter', 1, 1, 'average'],
    ['semi_annual', 'Semi Annual', 6, 1, 6, 'month',   6, 1, 'average'],
    ['yearly',      'Yearly',      7, 1, 7, 'year',    1, 1, 'average'],
  ]) fcInsert.run(...f);
  // Backfill hierarchy_order for existing built-ins that have 0
  for (const [key, order] of [['weekly',1],['monthly',2],['quarterly',3],['yearly',4]]) {
    db.prepare("UPDATE frequency_configs SET hierarchy_order=?, duration_unit=CASE key WHEN 'weekly' THEN 'week' WHEN 'monthly' THEN 'month' WHEN 'quarterly' THEN 'quarter' WHEN 'yearly' THEN 'year' ELSE duration_unit END WHERE key=? AND hierarchy_order=0").run(order, key);
  }

  // I-0) Scoring window: past_enabled + past_days per frequency
  // enabled=1 means past periods can be scored up to `days` days after they ended
  for (const [key, val] of [
    ['scoring_window_daily_enabled',       '0'],
    ['scoring_window_daily_days',          '1'],
    ['scoring_window_weekly_enabled',      '1'],
    ['scoring_window_weekly_days',         '28'],
    ['scoring_window_fortnightly_enabled', '1'],
    ['scoring_window_fortnightly_days',    '14'],
    ['scoring_window_monthly_enabled',     '1'],
    ['scoring_window_monthly_days',        '7'],
    ['scoring_window_quarterly_enabled',   '0'],
    ['scoring_window_quarterly_days',      '15'],
    ['scoring_window_semi_annual_enabled', '0'],
    ['scoring_window_semi_annual_days',    '15'],
    ['scoring_window_yearly_enabled',      '0'],
    ['scoring_window_yearly_days',         '30'],
  ]) {
    db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run(key, val);
  }

  // EC) Add employee_code column to employees if missing
  const empCols = db.prepare("PRAGMA table_info(employees)").all().map(c => c.name);
  if (!empCols.includes('employee_code')) {
    console.log('[migrate] Adding employee_code to employees…');
    db.exec('ALTER TABLE employees ADD COLUMN employee_code TEXT');
    // Create unique index (allows multiple NULLs in SQLite)
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_employee_code ON employees(employee_code) WHERE employee_code IS NOT NULL');
    console.log('[migrate] Done.');
  }

  // CM) Add can_manage column to roles
  const roleCols = db.prepare("PRAGMA table_info(roles)").all().map(c => c.name);
  if (!roleCols.includes('can_manage')) {
    db.exec("ALTER TABLE roles ADD COLUMN can_manage INTEGER NOT NULL DEFAULT 0");
    // Seed: roles at hierarchy_level <= 4 are managers (GH, PM, EM, PL or equivalent)
    db.prepare("UPDATE roles SET can_manage = 1 WHERE hierarchy_level <= 4").run();
    console.log('[migrate] Added can_manage to roles');
  }

  // I) Remove CHECK constraint on kpi_templates.score_type
  const ktRow = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='kpi_templates'").get();
  if (ktRow && ktRow.sql.includes("CHECK(score_type IN")) {
    console.log('[migrate] Removing score_type CHECK constraint from kpi_templates…');
    db.pragma('foreign_keys = 0');
    db.exec(`
      CREATE TABLE kpi_templates_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role_id INTEGER REFERENCES roles(id),
        attribute_id INTEGER NOT NULL REFERENCES kpi_attributes(id),
        sub_metric_name TEXT NOT NULL,
        measurement_description TEXT,
        scoring_guide TEXT,
        frequency TEXT NOT NULL,
        formula TEXT,
        calculation_guide TEXT,
        weight_percentage REAL NOT NULL,
        score_type TEXT NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO kpi_templates_new SELECT * FROM kpi_templates;
      DROP TABLE kpi_templates;
      ALTER TABLE kpi_templates_new RENAME TO kpi_templates;
    `);
    db.pragma('foreign_keys = 1');
    console.log('[migrate] Done.');
  }
}

module.exports = { db, initSchema, runMigrations };
