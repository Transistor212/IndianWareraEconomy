const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');

const config = require('./config');
require('./db'); // ensures tables exist on boot
const { requireAuth } = require('./discordAuth');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');

const app = express();

// Trust Vercel's proxy so Express sees correct protocol (HTTPS) for secure cookies
app.set('trust proxy', 1);

app.use(express.json());
app.use(
  cookieSession({
    name: 'session',
    secret: config.sessionSecret,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    secure: !!process.env.VERCEL, // HTTPS-only on Vercel
    sameSite: 'lax',
  })
);

app.use('/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', apiRoutes);

// Gate the dashboard page itself
app.get(['/', '/index.html'], requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, '..', 'public')));

// On Vercel: export app for serverless handler (no listen, no bot, no cron)
// Locally / Railway: start everything normally
if (!process.env.VERCEL) {
  const scheduler = require('./scheduler');
  const bot = require('./discordBot');

  app.listen(config.port, () => {
    console.log(`[server] listening on http://localhost:${config.port}`);
    if (config.warera.apiKey) {
      console.log(`[warera] ✅ API key set`);
    } else {
      console.log(`[warera] ⚠️  No auth configured. Add WARERA_API_KEY=wae_... to .env`);
    }
  });

  bot.start();
  scheduler.start();
}

// Vercel needs the app exported as the default export
module.exports = app;
