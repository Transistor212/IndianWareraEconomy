const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
let ready = false;

client.once('clientReady', () => {
  ready = true;
  console.log(`[discordBot] logged in as ${client.user.tag}`);
});

async function start() {
  if (!config.discord.botToken) {
    console.warn('[discordBot] No DISCORD_BOT_TOKEN set — alert posting disabled.');
    return;
  }
  await client.login(config.discord.botToken);
}

/**
 * Posts an alert message to the configured channel, pinging FM/VP/President roles.
 * stage: 'warning' | 'at_threshold' | 'critical'
 */
async function postAlert({ resource, stage, current, thresholdQty, dailyConsumption }) {
  if (!ready) {
    console.warn('[discordBot] not ready, skipping alert:', resource, stage);
    return;
  }

  const channel = await client.channels.fetch(config.discord.alertChannelId).catch(() => null);
  if (!channel) {
    console.error('[discordBot] alert channel not found:', config.discord.alertChannelId);
    return;
  }

  const roleMentions = [
    config.discord.alertRoleIds.fm,
    config.discord.alertRoleIds.vp,
    config.discord.alertRoleIds.president,
  ]
    .filter(Boolean)
    .map((id) => `<@&${id}>`)
    .join(' ');

  const stageCopy = {
    warning: {
      emoji: '⚠️',
      title: `Early Warning: ${resource.toUpperCase()} approaching threshold`,
    },
    at_threshold: {
      emoji: '🟠',
      title: `${resource.toUpperCase()} has hit the safety threshold`,
    },
    critical: {
      emoji: '🔴',
      title: `CRITICAL: ${resource.toUpperCase()} is BELOW the safety threshold`,
    },
  }[stage];

  const message =
    `${roleMentions}\n` +
    `**${stageCopy.emoji} ${stageCopy.title}**\n` +
    `Current stock: **${current.toLocaleString()}**\n` +
    `Safety threshold: **${thresholdQty.toLocaleString()}**\n` +
    `Est. daily consumption: **${dailyConsumption.toLocaleString()}/day**`;

  await channel.send({ content: message });
}

module.exports = { start, postAlert };
