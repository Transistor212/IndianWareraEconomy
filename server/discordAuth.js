const fetch = require('node-fetch');
const config = require('./config');

const API = 'https://discord.com/api/v10';

function getAuthorizeUrl() {
  const params = new URLSearchParams({
    client_id: config.discord.clientId,
    redirect_uri: config.discord.redirectUri,
    response_type: 'code',
    scope: 'identify guilds.members.read',
    prompt: 'consent',
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const body = new URLSearchParams({
    client_id: config.discord.clientId,
    client_secret: config.discord.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.discord.redirectUri,
  });

  const res = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    throw new Error(`Discord token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json(); // { access_token, token_type, ... }
}

async function getUser(accessToken) {
  const res = await fetch(`${API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Discord getUser failed: ${res.status}`);
  return res.json(); // { id, username, avatar, ... }
}

/**
 * Fetches the user's member object (incl. roles) for our specific guild,
 * using the *user's* OAuth token and the guilds.members.read scope.
 */
async function getGuildMember(accessToken) {
  const res = await fetch(`${API}/users/@me/guilds/${config.discord.guildId}/member`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return null; // user isn't in the server
  if (!res.ok) throw new Error(`Discord getGuildMember failed: ${res.status}`);
  return res.json(); // { roles: [id, id, ...], nick, ... }
}

function hasAllowedRole(memberRoleIds) {
  if (!config.discord.allowedRoleIds.length) return true; // no restriction configured
  return memberRoleIds.some((r) => config.discord.allowedRoleIds.includes(r));
}

/** Express middleware: blocks the request unless session has an authorized user. */
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.redirect('/login.html');
}

/** Express middleware: blocks unless the session user holds an admin role. */
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) return res.redirect('/login.html');
  if (!config.discord.adminRoleIds.length) return next(); // no restriction configured
  const isAdmin = req.session.user.roles.some((r) => config.discord.adminRoleIds.includes(r));
  if (!isAdmin) return res.status(403).json({ error: 'Admin role required.' });
  return next();
}

module.exports = {
  getAuthorizeUrl,
  exchangeCodeForToken,
  getUser,
  getGuildMember,
  hasAllowedRole,
  requireAuth,
  requireAdmin,
};
