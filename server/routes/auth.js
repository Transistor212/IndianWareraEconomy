const express = require('express');
const router = express.Router();
const discordAuth = require('../discordAuth');

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

    res.redirect('/');
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
