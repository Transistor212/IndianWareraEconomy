// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

const fmtCoins = (n) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' 🪙';

const fmtPct = (n) => (n == null ? '—' : `${Number(n).toFixed(1)}%`);

const RESOURCE_EMOJI = {
  paper: '📄', oil: '🛢️', petroleum: '⛽', wood: '🪵', grain: '🌾',
  iron: '⚙️', steel: '🔩', livestock: '🐄', fish: '🐟', lead: '🔋',
  coal: '🪨', gold: '🥇', uranium: '☢️', diamonds: '💎', lithium: '⚡',
  rareearths: '🌏', limestone: '🏔️', concrete: '🏗️', coca: '🌿',
  bread: '🍞', steak: '🥩', cookedfish: '🍤', scraps: '🔧',
  ammo: '🔫', lightammo: '🔫', heavyammo: '💣',
};

const RANKING_LABEL = {
  countryRegionDiff: 'Region Domination',
  countryDamages: 'Total Damages',
  weeklyCountryDamages: 'Weekly Damages',
  weeklyCountryDamagesPerCitizen: 'Damages / Citizen',
  countryDevelopment: 'Development',
  countryActivePopulation: 'Active Population',
  countryWealth: 'Wealth',
  countryBounty: 'Bounty',
  countryProductionBonus: 'Production Bonus',
};

const TIER_ORDER = ['diamond', 'platinum', 'gold', 'silver', 'bronze'];

function tierBadge(tier) {
  if (!tier) return '';
  return `<span class="tier tier-${tier}">${tier.toUpperCase()}</span>`;
}

// ─── API call ─────────────────────────────────────────────────────────────────

async function api(path) {
  const res = await fetch(path);
  if (res.status === 401 || res.redirected) {
    window.location.href = '/login.html';
    return null;
  }
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

// ─── User badge ──────────────────────────────────────────────────────────────

async function loadUser() {
  const data = await api('/api/me');
  if (!data) return;
  const badge = document.getElementById('user-badge');
  const avatarUrl = data.user.avatar
    ? `https://cdn.discordapp.com/avatars/${data.user.id}/${data.user.avatar}.png?size=32`
    : '';
  badge.innerHTML = `
    ${avatarUrl ? `<img src="${avatarUrl}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;" alt="">` : ''}
    <span>${data.user.username}</span>
    <form method="POST" action="/auth/logout" style="display:inline">
      <button type="submit" class="logout-btn">Logout</button>
    </form>
  `;
}

// ─── Economy / Treasury ──────────────────────────────────────────────────────

async function loadEconomy() {
  const summaryEl = document.getElementById('economy-summary');
  const tbody = document.querySelector('#resource-table tbody');
  const marketEl = document.getElementById('market-orders');
  const gameEstEl = document.getElementById('game-estimates');
  const countryOverviewEl = document.getElementById('country-overview');
  const rankingsEl = document.getElementById('rankings-list');
  const strategicEl = document.getElementById('strategic-resources');
  const inventoryBadge = document.getElementById('inventory-status-badge');
  const lastUpdated = document.getElementById('last-updated');

  try {
    const data = await api('/api/economy');
    if (!data) return;

    // Timestamp
    lastUpdated.textContent = 'Updated ' + new Date().toLocaleTimeString();

    // ── Treasury summary ─────────────────────────────────────────────────────
    // coins is always live from rankings.countryWealth.value (public endpoint)
    // resource breakdown only available when session cookie is configured
    const authNeeded = !data.inventoryAvailable;

    summaryEl.innerHTML = `
      <div class="stat primary">
        <span>Coins in Treasury</span>
        <strong>${fmtCoins(data.coins)}</strong>
      </div>
      <div class="stat">
        <span>Resource Value</span>
        <strong>${authNeeded ? '<span style="color:var(--muted)">—</span>' : fmtCoins(data.totalResourceValue || 0)}</strong>
      </div>
      <div class="stat">
        <span>Coins in Orders</span>
        <strong>${fmtCoins(data.marketOrders?.totalCoinsLocked || 0)}</strong>
      </div>
      <div class="stat">
        <span>Net Worth</span>
        <strong>${fmtCoins(data.netWorth)}</strong>
      </div>
    `;

    // Only show note if resources are locked (small, non-blocking)
    if (authNeeded) {
      gameEstEl.innerHTML = `<p class="muted" style="font-size:11px;margin:8px 0 0;opacity:.65">
        Resource inventory locked — set WARERA_COOKIE in .env for resource breakdown
      </p>`;
    } else if (data.gameEstimatedValues) {
      const g = data.gameEstimatedValues;
      gameEstEl.innerHTML = `
        <p class="muted" style="margin:12px 0 0; font-size:12px;">
          Game cross-check — money: ${fmtCoins(g.money)} &nbsp;·&nbsp;
          items: ${fmtCoins(g.basicItems)} &nbsp;·&nbsp;
          total: ${fmtCoins(g.total)}
        </p>`;
    } else {
      gameEstEl.innerHTML = '';
    }

    // ── Country overview ──────────────────────────────────────────────────────
    const cs = data.countryStats || {};
    const overviewRows = [
      ['Population', fmt(cs.population)],
      ['Development', `${fmt(cs.development)} (avg ${fmt(cs.averageDevelopment)})`],
      ['Specialized Item', cs.specializedItem ? `${RESOURCE_EMOJI[cs.specializedItem.toLowerCase()] || ''} ${cs.specializedItem}` : '—'],
      ['Production Bonus', fmtPct(cs.productionBonus)],
      ['Allies', fmt(cs.allyCount)],
      ['At War With', fmt(cs.warCount)],
      ['Income Tax', cs.taxes?.income != null ? `${cs.taxes.income}%` : '—'],
      ['Market Tax', cs.taxes?.market != null ? `${cs.taxes.market}%` : '—'],
      ['Work Tax', cs.taxes?.selfWork != null ? `${cs.taxes.selfWork}%` : '—'],
      ['Unrest', cs.unrest ? `${fmt(cs.unrest.bar)} / ${fmt(cs.unrest.barMax)}` : '—'],
      ...(cs.discordUrl ? [['Discord', `<a href="${cs.discordUrl}" target="_blank" rel="noopener" style="color:var(--accent)">Join Server</a>`]] : []),
    ];
    countryOverviewEl.innerHTML = overviewRows
      .map(([l, v]) => `<div class="stat-row"><span class="label">${l}</span><span class="value">${v}</span></div>`)
      .join('');

    // ── Rankings ─────────────────────────────────────────────────────────────
    const rankings = cs.rankings || {};
    const rankRows = Object.entries(rankings)
      .filter(([k]) => RANKING_LABEL[k])
      .map(([k, r]) => {
        const label = RANKING_LABEL[k];
        const badge = tierBadge(r.tier);
        return `<div class="stat-row">
          <span class="label">${label}</span>
          <span class="value">Rank #${r.rank} ${badge}</span>
        </div>`;
      });
    rankingsEl.innerHTML = rankRows.length
      ? rankRows.join('')
      : '<p class="muted" style="padding:8px 12px">No ranking data.</p>';

    // ── Strategic resources ───────────────────────────────────────────────────
    const sr = cs.strategicResources || {};
    const chipEntries = Object.entries(sr);
    if (chipEntries.length) {
      strategicEl.innerHTML = `<div class="resource-chips">${chipEntries
        .map(([res, ids]) => {
          const emoji = RESOURCE_EMOJI[res.toLowerCase()] || '🔹';
          return `<div class="resource-chip">
            ${emoji} <span>${res.charAt(0).toUpperCase() + res.slice(1)}</span>
            <span class="chip-count">${Array.isArray(ids) ? ids.length : 1} region${Array.isArray(ids) && ids.length !== 1 ? 's' : ''}</span>
          </div>`;
        })
        .join('')}</div>`;
    } else {
      strategicEl.innerHTML = '<span class="resource-chip-empty">No strategic resources controlled.</span>';
    }

    // ── Resource inventory table ─────────────────────────────────────────────
    if (data.inventoryAvailable && data.resources?.length) {
      inventoryBadge.textContent = 'Live Data';
      inventoryBadge.className = 'badge ok';
      tbody.innerHTML = data.resources
        .sort((a, b) => b.value - a.value)
        .map((r) => {
          const emoji = RESOURCE_EMOJI[r.resource.toLowerCase()] || '📦';
          return `<tr>
            <td>${emoji} ${r.resource.charAt(0).toUpperCase() + r.resource.slice(1)}</td>
            <td>${fmt(r.quantity)}</td>
            <td>${fmt(r.avgPrice)} 🪙</td>
            <td>${fmtCoins(r.value)}</td>
          </tr>`;
        })
        .join('');
    } else {
      inventoryBadge.textContent = 'No Cookie';
      inventoryBadge.className = 'badge warn';
      tbody.innerHTML = `<tr><td colspan="4">
        <div class="no-inventory-notice">
          <strong>Inventory data requires authentication.</strong><br>
          Set <code>WARERA_COOKIE</code> in your <code>.env</code> file to see exact resource quantities.<br>
          <em>Log into app.warera.io → DevTools → Application → Cookies → copy the session token.</em>
        </div>
      </td></tr>`;
    }

    // ── Market orders ─────────────────────────────────────────────────────────
    const buyOrders = data.marketOrders?.buyOrders || [];
    const sellOrders = data.marketOrders?.sellOrders || [];
    const lockedCoins = data.marketOrders?.totalCoinsLocked || 0;

    marketEl.innerHTML = `
      <div class="orders-summary">
        <div class="order-stat buy">
          <div class="os-label">Open Buy Orders</div>
          <div class="os-value">${buyOrders.length}</div>
        </div>
        <div class="order-stat sell">
          <div class="os-label">Open Sell Orders</div>
          <div class="os-value">${sellOrders.length}</div>
        </div>
        <div class="order-stat locked">
          <div class="os-label">Coins Locked (Buys)</div>
          <div class="os-value">${fmtCoins(lockedCoins)}</div>
        </div>
      </div>
      ${buyOrders.length ? `
      <div class="orders-table-wrap">
        <table>
          <thead><tr><th>Item</th><th>Quantity</th><th>Price / unit</th><th>Total</th></tr></thead>
          <tbody>
            ${buyOrders.map((o) => {
              const emoji = RESOURCE_EMOJI[(o.itemCode || '').toLowerCase()] || '📦';
              const total = (o.quantity || 0) * (o.price || 0);
              return `<tr>
                <td>${emoji} ${o.itemCode}</td>
                <td>${fmt(o.quantity)}</td>
                <td>${fmt(o.price)} 🪙</td>
                <td>${fmtCoins(total)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : '<p class="muted">No open buy orders.</p>'}
    `;

  } catch (err) {
    document.getElementById('economy-summary').innerHTML =
      `<p class="warn-text">Failed to load economy data: ${err.message}</p>`;
    console.error(err);
  }
}

// ─── Watchdog ─────────────────────────────────────────────────────────────────

const STAGE_META = {
  ok:           { text: 'Healthy',       cls: 'ok' },
  warning:      { text: 'Early Warning', cls: 'warning' },
  at_threshold: { text: 'At Threshold',  cls: 'at-threshold' },
  critical:     { text: 'CRITICAL',      cls: 'critical' },
  unknown:      { text: 'Gathering data…', cls: 'unknown' },
};

async function loadWatchdog() {
  const el = document.getElementById('watchdog');
  try {
    const data = await api('/api/consumption');
    if (!data) return;

    el.innerHTML = data.watchdog.map((w) => {
      const meta = STAGE_META[w.stage] || STAGE_META.unknown;
      const emoji = RESOURCE_EMOJI[w.resource.toLowerCase()] || '📦';
      return `
      <div class="watchdog-item ${meta.cls}">
        <h3>${emoji} ${w.resource.toUpperCase()}</h3>
        <p class="status-pill ${meta.cls}">${meta.text}</p>
        <dl>
          <dt>Current Stock</dt>
          <dd>${w.current != null ? fmt(w.current) : '—'}</dd>
          <dt>Daily Consumption</dt>
          <dd>${fmt(w.dailyConsumption)}</dd>
          <dt>Threshold (days)</dt>
          <dd>${fmt(w.thresholdDays)}</dd>
          <dt>Tolerance</dt>
          <dd>${fmtPct(w.tolerancePct)}</dd>
          <dt>Safety Level</dt>
          <dd>${fmt(w.thresholdQty)}</dd>
        </dl>
        ${!w.inventoryAvailable ? '<p class="muted" style="margin:10px 0 0;font-size:12px;">Set WARERA_COOKIE for live stock data.</p>' : ''}
      </div>`;
    }).join('');
  } catch (err) {
    el.innerHTML = `<p class="warn-text">Failed to load watchdog data: ${err.message}</p>`;
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

loadUser();
loadEconomy();
loadWatchdog();

// Auto-refresh: economy every 30s (matches server cache TTL), watchdog every 60s
setInterval(loadEconomy,  30 * 1000);
setInterval(loadWatchdog, 60 * 1000);
