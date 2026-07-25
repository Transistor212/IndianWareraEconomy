const cron = require('node-cron');
const db = require('./db');
const config = require('./config');
const warera = require('./warera');
const bot = require('./discordBot');

const TRACKED_RESOURCES = ['paper', 'oil'];

async function recordSnapshot() {
  const snapshot = await warera.getCountrySnapshot(config.warera.countryName);
  const now = new Date().toISOString();

  const insert = db.prepare(
    `INSERT INTO inventory_history (resource, quantity, recorded_at) VALUES (?, ?, ?)`
  );
  for (const resource of TRACKED_RESOURCES) {
    const qty = Number(snapshot.resources[resource] || 0);
    insert.run(resource, qty, now);
  }

  // Keep history from growing forever (30 days of hourly rows is plenty)
  db.prepare(
    `DELETE FROM inventory_history WHERE recorded_at < datetime('now', '-30 days')`
  ).run();

  return snapshot;
}

/**
 * Daily consumption = average hourly drop over the last 24h of samples,
 * projected to a full day. Only counts drops (production/imports would
 * show as increases, which we ignore for a conservative "worst case"
 * consumption estimate).
 */
function computeDailyConsumption(resource) {
  const rows = db
    .prepare(
      `SELECT quantity, recorded_at FROM inventory_history
       WHERE resource = ? AND recorded_at >= datetime('now', '-1 day')
       ORDER BY recorded_at ASC`
    )
    .all(resource);

  if (rows.length < 2) return null; // not enough data yet

  let totalDrop = 0;
  for (let i = 1; i < rows.length; i++) {
    const drop = rows[i - 1].quantity - rows[i].quantity;
    if (drop > 0) totalDrop += drop;
  }

  const hoursSpanned =
    (new Date(rows[rows.length - 1].recorded_at) - new Date(rows[0].recorded_at)) / 36e5;
  if (hoursSpanned <= 0) return null;

  const dailyRate = (totalDrop / hoursSpanned) * 24;

  db.prepare(
    `INSERT INTO consumption (resource, daily_amount, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(resource) DO UPDATE SET daily_amount = excluded.daily_amount, updated_at = excluded.updated_at`
  ).run(resource, dailyRate);

  return dailyRate;
}

function getThreshold(resource) {
  return db.prepare(`SELECT * FROM thresholds WHERE resource = ?`).get(resource);
}

function getAlertState(resource) {
  const row = db.prepare(`SELECT * FROM alert_state WHERE resource = ?`).get(resource);
  return row?.stage || 'ok';
}

function setAlertState(resource, stage) {
  db.prepare(
    `INSERT INTO alert_state (resource, stage, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(resource) DO UPDATE SET stage = excluded.stage, updated_at = excluded.updated_at`
  ).run(resource, stage);
}

/**
 * Stage rules (matches the spec):
 *  - thresholdQty = dailyConsumption * threshold_days
 *  - warning:      current <= thresholdQty * (1 + tolerance_pct/100)   AND current > thresholdQty
 *  - at_threshold: current == thresholdQty (we treat "<= threshold but > 0 tolerance below" as at_threshold band)
 *  - critical:     current < thresholdQty
 */
function classifyStage(current, thresholdQty, tolerancePct) {
  const warningCeiling = thresholdQty * (1 + tolerancePct / 100);
  if (current < thresholdQty) return 'critical';
  if (current === thresholdQty) return 'at_threshold';
  if (current <= warningCeiling) return 'warning';
  return 'ok';
}

async function checkThresholdsAndAlert(snapshot) {
  for (const resource of TRACKED_RESOURCES) {
    const dailyRow = db.prepare(`SELECT daily_amount FROM consumption WHERE resource = ?`).get(resource);
    const threshold = getThreshold(resource);
    if (!dailyRow || !threshold) continue;

    const current = Number(snapshot.resources[resource] || 0);
    const thresholdQty = dailyRow.daily_amount * threshold.threshold_days;
    const stage = classifyStage(current, thresholdQty, threshold.tolerance_pct);

    const previousStage = getAlertState(resource);

    // Only fire a Discord message when the stage gets WORSE than last time
    // we checked, so we don't re-ping every hour while sitting in the same band.
    const severity = { ok: 0, warning: 1, at_threshold: 2, critical: 3 };
    if (stage !== 'ok' && severity[stage] > severity[previousStage]) {
      await bot.postAlert({
        resource,
        stage,
        current,
        thresholdQty: Math.round(thresholdQty),
        dailyConsumption: Math.round(dailyRow.daily_amount),
      });
    }

    // Reset back down if stock recovered above the warning band
    setAlertState(resource, stage);
  }
}

async function runHourlyJob() {
  try {
    const snapshot = await recordSnapshot();
    for (const resource of TRACKED_RESOURCES) computeDailyConsumption(resource);
    await checkThresholdsAndAlert(snapshot);
    console.log('[scheduler] hourly check complete', new Date().toISOString());
  } catch (err) {
    console.error('[scheduler] hourly job failed:', err.message);
  }
}

function start() {
  // Every hour, on the hour.
  cron.schedule('0 * * * *', runHourlyJob);
  // Run once at boot so the dashboard has data immediately instead of
  // waiting up to an hour for the first sample.
  runHourlyJob();
}

module.exports = { start, runHourlyJob, computeDailyConsumption, classifyStage };
