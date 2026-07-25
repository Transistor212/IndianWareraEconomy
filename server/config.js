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
    redirectUri: process.env.DISCORD_REDIRECT_URI,
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
