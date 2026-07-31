require('dotenv').config();

function splitIds(str) {
  return (str || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

module.exports = {
  port: process.env.PORT || 3000,

  discord: {
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    // Auto-detect the redirect URI:
    //   1. Explicit env var (highest priority — use this on Vercel with custom domain)
    //   2. Vercel auto-provides VERCEL_URL for each deployment
    //   3. Railway provides RAILWAY_PUBLIC_DOMAIN
    //   4. Fall back to localhost for local dev
    redirectUri: process.env.DISCORD_REDIRECT_URI ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}/auth/discord/callback`
        : process.env.RAILWAY_PUBLIC_DOMAIN
          ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/auth/discord/callback`
          : 'http://localhost:3000/auth/discord/callback'),
    botToken: process.env.DISCORD_BOT_TOKEN,
    guildId: process.env.DISCORD_GUILD_ID,
    allowedRoleIds: splitIds(process.env.ALLOWED_ROLE_IDS),
    adminRoleIds: splitIds(process.env.ADMIN_ROLE_IDS),
    alertChannelId: process.env.ALERT_CHANNEL_ID,
    alertRoleIds: {
      fm: process.env.FM_ROLE_ID,
      vp: process.env.VP_ROLE_ID,
      president: process.env.PRESIDENT_ROLE_ID,
    },
  },

  warera: {
    countryName: process.env.WARERA_COUNTRY_NAME || 'India',
    apiBase: 'https://api2.warera.io/trpc',
    warerastatsBase: 'https://api.warerastats.io',
    // EASIEST AUTH: official API key from Warera Settings -> API Tokens (starts with wae_)
    apiKey:  process.env.WARERA_API_KEY   || null,
    // FALLBACK: device fingerprint headers + raw cookie from browser DevTools
    xVid:   process.env.WARERA_X_VID    || '',
    xGr:    process.env.WARERA_X_GR     || '',
    cookie: process.env.WARERA_COOKIE   || null,
  },

  sessionSecret: process.env.SESSION_SECRET || 'dev_secret_change_me',
};
