# India Economy Tracker (WarEra)

A private dashboard that pulls India's treasury/resources from the WarEra API,
values them against market prices, and runs an hourly Paper/Oil consumption
watchdog that pings your Finance Minister / VP / President in Discord when
stock runs low. Access is gated to specific Discord roles.

## What it does

- **Economy summary**: coins in treasury, resource inventory valued at
  current average market price (per-resource and total), and coins locked in
  open market sell orders.
- **Consumption watchdog**: derives India's daily Paper/Oil consumption from
  hourly inventory snapshots, compares it against an admin-set "days of
  buffer" threshold + tolerance %, and posts a Discord alert at three stages:
  early warning → at-threshold → critical (below threshold).
- **Discord login**: users log in with Discord OAuth2; only members holding
  specific role IDs in your server can view the dashboard.

## 1. Discord setup (one-time, do this yourself)

1. https://discord.com/developers/applications → **New Application**.
2. **OAuth2 → General**: copy the **Client ID** and **Client Secret**.
3. **OAuth2 → Redirects**: add `http://localhost:3000/auth/discord/callback`
   (swap the domain later when you deploy).
4. **Bot** tab → **Add Bot** → copy the **Token**. Under
   **Privileged Gateway Intents**, nothing extra is required for posting
   messages (we don't read message content).
5. **OAuth2 → URL Generator**: scopes `bot`; permissions
   `Send Messages`, `View Channel`, `Mention @everyone/roles` → open the
   generated URL and invite the bot to your server.
6. In Discord (enable Developer Mode in User Settings → Advanced):
   - Right-click your server icon → **Copy Server ID** → `DISCORD_GUILD_ID`
   - Right-click each of your FM / VP / President roles → **Copy Role ID**
   - Right-click the alert channel → **Copy Channel ID** → `ALERT_CHANNEL_ID`
   - Right-click whichever role(s) should be able to *view* the dashboard →
     copy those IDs → `ALLOWED_ROLE_IDS`

## 2. Configure

```bash
cp .env.example .env
```

Fill in every value in `.env`. See the comments in `.env.example` for what
each one does. `ADMIN_ROLE_IDS` controls who can change the Paper/Oil
thresholds — leave blank to allow any logged-in viewer to change them.

## 3. Run it

```bash
npm install
npm start
```

Visit `http://localhost:3000`. You'll be bounced to `/login.html` until you
log in with Discord and your account has one of `ALLOWED_ROLE_IDS`.

## 4. Setting thresholds

Thresholds default to Paper = 2 days / Oil = 5 days, both at 10% tolerance
(matching your example). To change them, call the admin API, e.g.:

```bash
curl -X POST http://localhost:3000/api/admin/thresholds \
  -H "Content-Type: application/json" \
  --cookie "session=<your session cookie>" \
  -d '{"resource":"paper","thresholdDays":3,"tolerancePct":10}'
```

(A small settings UI can be added to the dashboard later if you want a form
instead of curl — just say the word.)

## Notes on the data sources

Confirmed live via browser devtools against `api2.warera.io` — no API key
needed for any of this, since it's the same public data the game's own
web/app client reads:

- **`country.getAllCountries`** — used only to resolve a country name to
  its internal `_id`. (Its `money` field is *not* the treasury balance —
  that was an earlier mistake in this project; ignore it.)
- **`inventory.getById({ countryId })`** — the real source of truth.
  Returns the country's actual treasury `money`, exact resource quantities
  (`items.basics`), coins locked in open buy orders (`market.lockedMoney`),
  and the game's own computed value totals (`estimatedValues`).
- **`tradingOrder.getPublicOrdersByOwner({ countryId })`** — the country's
  currently *open* buy/sell orders, with `totalBuyMoneyInvested` matching
  `inventory.getById`'s `market.lockedMoney` exactly.
- **`itemTrading.getPrices`** — average market price per item, for valuing
  the resource inventory. A few items (e.g. `paper`) aren't in this list;
  for those, the app falls back to a price derived from the country's own
  open orders (`computeAvgPriceFromOrders` in `warera.js`).

An earlier version of this app used `country.getAllCountries` for coins
and a third-party trade-history aggregator (warerastats.io) to *estimate*
resource inventory by netting buys/sells — both were wrong, since neither
reflects the actual current stockpile (production, spending, and war loot
aren't market trades). This version uses the real inventory document
instead, so the numbers should now match what you see in-game.

The dashboard also shows the game's own `estimatedValues` alongside the
app's computed values, so you can cross-check them directly.

## Project structure

```
server/
  index.js         Express app entry point
  config.js        Loads .env into one config object
  db.js            SQLite (better-sqlite3): thresholds, consumption history, alert state
  warera.js         WarEra API client (economy + market data)
  discordAuth.js    OAuth2 login + role-check middleware
  discordBot.js     Bot client that posts threshold alerts to your channel
  scheduler.js      Hourly cron: snapshot inventory, compute consumption, check thresholds
  routes/
    auth.js         /auth/discord, /auth/discord/callback, /auth/logout
    api.js          /api/economy, /api/consumption, /api/thresholds (view)
    admin.js         /api/admin/thresholds (set) — admin-role gated
public/
  login.html, index.html, dashboard.js, style.css
```

## Deploying

Any Node host works (Railway, Render, a VPS, etc.). Just remember to:
- Update `DISCORD_REDIRECT_URI` to your real domain, and add that same
  redirect URL in the Discord Developer Portal.
- Keep `.env` out of version control (already in `.gitignore`).
- `data.sqlite` persists thresholds/history — make sure your host's disk
  survives restarts, or swap in a hosted Postgres later if not.
