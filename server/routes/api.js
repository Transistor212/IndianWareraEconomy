const express = require('express');
const router = express.Router();

const config = require('../config');
const warera = require('../warera');
const db = require('../db');
const { requireAuth } = require('../discordAuth');
const { classifyStage } = require('../scheduler');

router.use(requireAuth);

router.get('/me', (req, res) => {
  res.json({ user: req.session.user });
});

/**
 * Full economy snapshot:
 * - coins in treasury (from the public country document — always available)
 * - resource inventory + value (only when WARERA_COOKIE is configured)
 * - coins locked in open market buy orders
 * - full country stats: rankings, strategic resources, allies, wars, taxes, etc.
 */
router.get('/economy', async (req, res) => {
  try {
    const snapshot = await warera.getCountrySnapshot(config.warera.countryName);
    const officialPrices = await warera.getMarketPrices();

    // Items missing from the official price list fall back to a price derived
    // from this country's own currently-open orders.
    const fallbackPrices = warera.computeAvgPriceFromOrders(snapshot.openOrders);
    const prices = { ...fallbackPrices, ...officialPrices };

    let totalResourceValue = 0;
    const resourceBreakdown = Object.entries(snapshot.resources).map(([resource, qty]) => {
      const price = prices[resource] || 0;
      const value = qty * price;
      totalResourceValue += value;
      return { resource, quantity: qty, avgPrice: price, value };
    });

    // Compute total coins locked in open buy orders
    const totalBuyOrderCoins = (snapshot.openOrders?.buyOrders || []).reduce(
      (sum, o) => sum + Number(o.quantity || 0) * Number(o.price || 0),
      0
    );

    const marketOrders = {
      totalCoinsLocked: snapshot.lockedMoney || totalBuyOrderCoins,
      buyOrders: snapshot.openOrders?.buyOrders || [],
      sellOrders: snapshot.openOrders?.sellOrders || [],
    };

    // Extract country stats from the public country document
    const cd = snapshot.countryData || {};
    const countryStats = {
      population: cd.currentPopulation || 0,
      development: cd.currentDevelopment || 0,
      averageDevelopment: cd.averageDevelopment || 0,
      taxes: cd.taxes || {},
      specializedItem: cd.specializedItem || null,
      rankings: cd.rankings || {},
      strategicResources: cd.strategicResources?.resources || {},
      productionBonus: cd.strategicResources?.bonuses?.productionPercent || 0,
      allyCount: (cd.allies || []).length,
      warCount: (cd.warsWith || []).length,
      discordUrl: cd.discordUrl || null,
      scheme: cd.scheme || null,
      unrest: cd.unrest || null,
      rulingParty: cd.rulingParty || null,
    };

    res.json({
      country: snapshot.name,
      coins: snapshot.coins,           // always available — from rankings.countryWealth.value
      resources: resourceBreakdown,
      inventoryAvailable: snapshot.inventoryAvailable,
      totalResourceValue,
      marketOrders,
      netWorth: snapshot.coins + marketOrders.totalCoinsLocked + (snapshot.inventoryAvailable ? totalResourceValue : 0),
      countryStats,
      gameEstimatedValues: snapshot.gameEstimatedValues,
    });

  } catch (err) {
    console.error('[api/economy] failed:', err);
    res.status(502).json({ error: 'Failed to fetch WarEra economy data', detail: err.message });
  }
});

/**
 * Consumption watchdog status for paper/oil: current stock, daily
 * consumption estimate, configured threshold, and current alert stage.
 * NOTE: requires WARERA_COOKIE to track exact inventory; shows "unknown"
 * if inventory is unavailable.
 */
router.get('/consumption', async (req, res) => {
  try {
    const snapshot = await warera.getCountrySnapshot(config.warera.countryName);
    const resources = ['paper', 'oil'];

    const result = resources.map((resource) => {
      const dailyRow = db
        .prepare(`SELECT daily_amount FROM consumption WHERE resource = ?`)
        .get(resource);
      const threshold = db.prepare(`SELECT * FROM thresholds WHERE resource = ?`).get(resource);

      // If inventory is unavailable, current stock is unknown
      const current = snapshot.inventoryAvailable
        ? Number(snapshot.resources[resource] || 0)
        : null;

      const dailyConsumption = dailyRow?.daily_amount ?? null;
      const thresholdQty =
        dailyConsumption != null && threshold ? dailyConsumption * threshold.threshold_days : null;
      const stage =
        current != null && thresholdQty != null
          ? classifyStage(current, thresholdQty, threshold.tolerance_pct)
          : 'unknown';

      return {
        resource,
        current,
        dailyConsumption,
        thresholdDays: threshold?.threshold_days ?? null,
        tolerancePct: threshold?.tolerance_pct ?? null,
        thresholdQty,
        stage,
        inventoryAvailable: snapshot.inventoryAvailable,
      };
    });

    res.json({ watchdog: result });
  } catch (err) {
    console.error('[api/consumption] failed:', err);
    res.status(502).json({ error: 'Failed to fetch consumption data', detail: err.message });
  }
});

/** View current thresholds (any logged-in+role-checked user can view). */
router.get('/thresholds', (req, res) => {
  const rows = db.prepare(`SELECT * FROM thresholds`).all();
  res.json({ thresholds: rows });
});

/**
 * Vercel Cron endpoint — called every hour by Vercel's cron scheduler.
 * Secured with CRON_SECRET so only Vercel can call it.
 * On Railway/local this is unused (node-cron handles it instead).
 */
router.get('/cron/hourly', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { runHourlyJob } = require('../scheduler');
    await runHourlyJob();
    res.json({ ok: true, ran: new Date().toISOString() });
  } catch (err) {
    console.error('[cron/hourly] failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
