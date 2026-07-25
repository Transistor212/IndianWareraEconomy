const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin } = require('../discordAuth');

router.use(requireAdmin);

/**
 * Body: { resource: 'paper'|'oil', thresholdDays: number, tolerancePct: number }
 */
router.post('/thresholds', (req, res) => {
  const { resource, thresholdDays, tolerancePct } = req.body || {};

  if (!resource || typeof thresholdDays !== 'number' || typeof tolerancePct !== 'number') {
    return res.status(400).json({ error: 'resource, thresholdDays, tolerancePct are required' });
  }

  db.prepare(
    `INSERT INTO thresholds (resource, threshold_days, tolerance_pct) VALUES (?, ?, ?)
     ON CONFLICT(resource) DO UPDATE SET threshold_days = excluded.threshold_days, tolerance_pct = excluded.tolerance_pct`
  ).run(resource, thresholdDays, tolerancePct);

  res.json({ ok: true });
});

module.exports = router;
