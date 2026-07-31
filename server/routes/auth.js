const express = require('express');
const router = express.Router();
const discordAuth = require('../discordAuth');
const config = require('../config');

// Temporary debug route — shows masked config so we can verify env vars loaded correctly
router.get('/debug', (req, res) => {
  const mask = (s) => s ? `${s.slice(0, 4)}...${s.slice(-4)} (len:${s.length})` : 'NOT SET';
  res.json({
    clientId:    mask(config.discord.clientId),
    clientSecret: mask(config.discord.clientSecret),
    redirectUri: config.discord.redirectUri,
    guildId:     config.discord.guildId,
    VERCEL_URL:  process.env.VERCEL_URL || 'not set',
    NODE_ENV:    process.env.NODE_ENV || 'not set',
  });
});

router.get('/discord', (req, res) => {
  res.redirect(discordAuth.getAuthorizeUrl());
});

router.get('/discord/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code');

  try {
    const token = await discordAuth.exchangeCodeForToken(code);
    const user = await discordAuth.getUser(token.access_token);
    const member = await discordAuth.getGuildMember(token.access_token);

    if (!member) {
      return res.status(403).send('You are not a member of the required Discord server.');
    }

    if (!discordAuth.hasAllowedRole(member.roles || [])) {
      return res
        .status(403)
        .send('Your Discord roles do not have access to this dashboard.');
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      roles: member.roles || [],
    };

    // Use HTML redirect instead of res.redirect() — Vercel's proxy can drop
    // Set-Cookie headers on 302 responses, causing an infinite login loop.
    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0;url=/">
  <title>Logging in...</title>
</head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f1117;color:#fff">
  <p>Logging in... <a href="/" style="color:#5865f2">click here</a> if not redirected.</p>
  <script>window.location.href = '/';</script>
</body>
</html>`);
  } catch (err) {
    console.error('[auth] callback failed:', err.message, err.stack);
    // Show the actual error so we can diagnose — remove detail after debugging
    res.status(500).send(`Login failed: ${err.message}`);
  }
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.redirect('/login.html');
});

module.exports = router;
