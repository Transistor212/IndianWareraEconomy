/**
 * WarEra API client.
 *
 * HOW AUTHENTICATION WORKS:
 *   WarEra has an official API token system. The token starts with "wae_".
 *
 *   HOW TO GET YOUR API KEY (easiest method):
 *     1. Log into https://app.warera.io
 *     2. Go to Settings -> API Tokens  (or look in your profile/account settings)
 *     3. Generate a token — it will look like: wae_xxxxxxxxxxxxxxxx
 *     4. Add to .env:  WARERA_API_KEY=wae_xxxxxxxxxxxxxxxx
 *     5. Restart the server
 *
 *   The API key is sent as:  Authorization: Bearer wae_yourkey
 *   alongside the x-vid and x-gr device headers the game normally sends.
 *
 * Public endpoints (no auth needed):
 *   - country.getAllCountries             -> country doc (rankings, allies, wars, taxes...)
 *   - tradingOrder.getPublicOrdersByOwner -> open buy/sell orders
 *   - itemTrading.getPrices              -> global avg market prices
 *
 * Authenticated endpoint (needs API key OR session cookie):
 *   - inventory.getById  -> actual treasury coins, resource quantities, locked money
 */

const fetch = require('node-fetch');
const config = require('./config');

const BASE = config.warera.apiBase;

async function callEndpoint(endpoint, input, { requireAuth = false } = {}) {
  const url =
    `${BASE}/${endpoint}` +
    (input ? `?input=${encodeURIComponent(JSON.stringify(input))}` : '');

  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36',
    Origin:  'https://app.warera.io',
    Referer: 'https://app.warera.io/',
    Accept:  'application/json',
    'content-type': 'application/json',
    'x-vid': config.warera.xVid || '',
    'x-gr':  config.warera.xGr  || '',
  };

  // Official API key (wae_ prefix) — get from Warera Settings -> API Tokens
  if (config.warera.apiKey) {
    headers['Authorization'] = `Bearer ${config.warera.apiKey}`;
  }

  // Fallback: raw session cookie copied from browser DevTools
  if (!config.warera.apiKey && config.warera.cookie) {
    headers['Cookie'] = config.warera.cookie;
  }

  const res = await fetch(url, { headers });


  if (res.status === 401) {
    if (requireAuth) {
      throw new Error(
        `WarEra API ${endpoint} returned 401 Unauthorized. ` +
          `Set WARERA_COOKIE in your .env file (see server/warera.js for instructions).`
      );
    }
    // Caller requested soft-fail on 401 — return null so the caller can
    // degrade gracefully instead of crashing the whole request.
    return null;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`WarEra API ${endpoint} failed: ${res.status} ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  // tRPC wraps the payload as { result: { data: ... } }
  return json?.result?.data ?? json;
}

// ---------------------------------------------------------------------------
// Country list (cached 5 min — changes rarely)
// ---------------------------------------------------------------------------

let countryListCache = { data: null, fetchedAt: 0 };
const COUNTRY_LIST_TTL_MS = 30 * 1000; // 30 seconds — countryWealth.value is live treasury data


async function getAllCountries() {
  const now = Date.now();
  if (countryListCache.data && now - countryListCache.fetchedAt < COUNTRY_LIST_TTL_MS) {
    return countryListCache.data;
  }
  const data = await callEndpoint('country.getAllCountries');
  countryListCache = { data, fetchedAt: now };
  return data;
}

async function getCountryByName(countryName) {
  const countries = await getAllCountries();
  const match = countries.find((c) => c.name?.toLowerCase() === countryName.toLowerCase());
  if (!match) {
    throw new Error(`Country "${countryName}" not found in country.getAllCountries response`);
  }
  return match;
}

async function getCountryIdByName(countryName) {
  const country = await getCountryByName(countryName);
  return country._id;
}

// ---------------------------------------------------------------------------
// Authenticated: exact resource inventory
// Returns null when WARERA_COOKIE is not set (soft-fail).
// ---------------------------------------------------------------------------
async function getInventory(countryId) {
  return callEndpoint('inventory.getById', { countryId }, { requireAuth: false });
}

// ---------------------------------------------------------------------------
// Public: open market orders for a country
// ---------------------------------------------------------------------------
async function getCountryOpenOrders(countryId) {
  return callEndpoint('tradingOrder.getPublicOrdersByOwner', { countryId });
}

// ---------------------------------------------------------------------------
// Public: global average market prices per item
// ---------------------------------------------------------------------------
async function getMarketPrices() {
  const raw = await callEndpoint('itemTrading.getPrices');
  const prices = {};
  for (const [key, val] of Object.entries(raw || {})) {
    prices[key.toLowerCase()] = Number(val);
  }
  return prices;
}

// ---------------------------------------------------------------------------
// Fallback: derive item prices from the country's own open orders (qty-weighted).
// ---------------------------------------------------------------------------
function computeAvgPriceFromOrders(ordersResponse) {
  const totals = {};
  const allOrders = [
    ...(ordersResponse?.buyOrders || []),
    ...(ordersResponse?.sellOrders || []),
  ];
  for (const o of allOrders) {
    const qty = Number(o.quantity || 0);
    const price = Number(o.price || 0);
    if (qty <= 0) continue;
    const key = (o.itemCode || '').toLowerCase();
    if (!totals[key]) totals[key] = { cost: 0, quantity: 0 };
    totals[key].cost += qty * price;
    totals[key].quantity += qty;
  }
  const prices = {};
  for (const [item, { cost, quantity }] of Object.entries(totals)) {
    if (quantity > 0) prices[item] = cost / quantity;
  }
  return prices;
}

// ---------------------------------------------------------------------------
// Full country snapshot
// ---------------------------------------------------------------------------
/**
 * Returns:
 * {
 *   id, name,
 *   coins,            // from country document (public)
 *   resources,        // from inventory.getById (null if no WARERA_COOKIE)
 *   lockedMoney,      // from inventory OR derived from open buy orders
 *   openOrders,       // raw tradingOrder.getPublicOrdersByOwner response
 *   gameEstimatedValues, // null unless inventory available
 *   countryData,      // full raw country document (rankings, allies, wars, etc.)
 *   inventoryAvailable, // true only when WARERA_COOKIE is set and returns data
 * }
 */
async function getCountrySnapshot(countryName) {
  const country = await getCountryByName(countryName);
  const countryId = country._id;

  // Run inventory + orders in parallel; inventory may return null if unauthed
  const [inventory, openOrders] = await Promise.all([
    getInventory(countryId),
    getCountryOpenOrders(countryId).catch((err) => {
      console.error('[warera] getCountryOpenOrders failed:', err.message);
      return { buyOrders: [], sellOrders: [], totalBuyMoneyInvested: 0, totalSellMoneyExpected: 0 };
    }),
  ]);

  const inventoryAvailable = inventory != null;

  // rankings.countryWealth.value is the actual treasury coin balance — publicly available,
  // matches the ~14k the game shows. No auth needed.
  const countryWealth = Number(country.rankings?.countryWealth?.value || 0);

  return {
    id: countryId,
    name: countryName,
    // Primary treasury source: public rankings.countryWealth.value (always available)
    coins: countryWealth,
    // Exact inventory breakdown (only when session cookie is configured)
    resources: inventoryAvailable ? { ...(inventory.items?.basics || {}) } : {},
    lockedMoney: inventoryAvailable
      ? Number(inventory.market?.lockedMoney ?? openOrders.totalBuyMoneyInvested ?? 0)
      : Number(openOrders.totalBuyMoneyInvested ?? 0),
    openOrders,
    gameEstimatedValues: inventoryAvailable ? (inventory.estimatedValues || null) : null,
    countryData: country,
    inventoryAvailable,
    _raw: inventory,
  };
}

module.exports = {
  callEndpoint,
  getAllCountries,
  getCountryByName,
  getCountryIdByName,
  getInventory,
  getCountryOpenOrders,
  getMarketPrices,
  computeAvgPriceFromOrders,
  getCountrySnapshot,
};
