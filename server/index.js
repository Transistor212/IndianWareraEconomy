const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');

const config = require('./config');
require('./db'); // ensures tables exist on boot
const { requireAuth } = require('./discordAuth');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const scheduler = require('./scheduler');
const bot = require('./discordBot');

const app = express();

app.use(express.json());
app.use(
  cookieSession({
    name: 'session',
    secret: config.sessionSecret,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    sameSite: 'lax',
  })
);

app.use('/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', apiRoutes);

// Gate the dashboard page itself — everything else in /public (css/js/login page)
// is served openly since it has no sensitive data on its own.
app.get(['/', '/index.html'], requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(config.port, () => {
  console.log(`[server] listening on http://localhost:${config.port}`);

  // Auth status
  if (config.warera.apiKey) {
    console.log(`[warera] ✅ API key set — inventory & treasury will be live`);
  } else if (config.warera.cookie) {
    console.log(`[warera] ✅ Session cookie set — inventory & treasury will be live`);
  } else {
    console.log(`[warera] ⚠️  No auth configured. Add WARERA_API_KEY=wae_... to .env for full data.`);
  }
});


bot.start();
scheduler.start();
