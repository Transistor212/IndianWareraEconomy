const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, '..', 'data.sqlite'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS thresholds (
    resource TEXT PRIMARY KEY,   -- e.g. 'paper', 'oil'
    threshold_days REAL NOT NULL,
    tolerance_pct REAL NOT NULL  -- e.g. 10 for 10%
  );

  CREATE TABLE IF NOT EXISTS consumption (
    resource TEXT PRIMARY KEY,   -- daily consumption estimate
    daily_amount REAL NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Tracks which alert stage we most recently fired, per resource,
  -- so we don't spam the channel every time the scheduler runs.
  CREATE TABLE IF NOT EXISTS alert_state (
    resource TEXT PRIMARY KEY,
    stage TEXT NOT NULL DEFAULT 'ok', -- 'ok' | 'warning' | 'at_threshold' | 'critical'
    updated_at TEXT NOT NULL
  );

  -- Raw hourly inventory snapshots, used to derive daily consumption rate.
  CREATE TABLE IF NOT EXISTS inventory_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource TEXT NOT NULL,
    quantity REAL NOT NULL,
    recorded_at TEXT NOT NULL
  );
`);

// Seed sane defaults if empty
const seedDefaults = db.prepare(
  `INSERT OR IGNORE INTO thresholds (resource, threshold_days, tolerance_pct) VALUES (?, ?, ?)`
);
seedDefaults.run('paper', 2, 10);
seedDefaults.run('oil', 5, 10);

module.exports = db;
