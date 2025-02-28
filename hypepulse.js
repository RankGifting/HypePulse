require('dotenv').config();
const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const NodeCache = require('node-cache');
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const paginationEmbed = require('discordjs-button-pagination');

// 1) Configure axios to retry failed requests
axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay });

// 2) Create an in-memory cache (5 minutes TTL)
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// 3) Provide your fallback image URL
const ICON_URL = 'https://packshq.com/assets/img/hsbr.jpg';

// 4) Create the Discord client
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// 5) Helper function: split a long string into multiple chunks
function splitString(str, maxLength = 4000) {
  const chunks = [];
  for (let i = 0; i < str.length; i += maxLength) {
    chunks.push(str.slice(i, i + maxLength));
  }
  return chunks;
}

// 6) Define slash commands
const commands = [
  new SlashCommandBuilder()
    .setName('uuid')
    .setDescription('Get the Mojang UUID for a Minecraft username.')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Minecraft username')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('player')
    .setDescription('Get basic Hypixel player info.')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Minecraft username')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('recentgames')
    .setDescription('Get the recent games played by a player.')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Minecraft username')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('guild')
    .setDescription('Get the guild info for a player.')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Minecraft username')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Get ALL Hypixel stats for a player (all game modes).')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Minecraft username')
        .setRequired(true)
    ),
  // Specific game modes
  new SlashCommandBuilder()
    .setName('skywars')
    .setDescription('Get detailed SkyWars stats.')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Minecraft username')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('bedwars')
    .setDescription('Get detailed BedWars stats.')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Minecraft username')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('duels')
    .setDescription('Get detailed Duels stats.')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Minecraft username')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('bridgeduels')
    .setDescription('Get detailed Bridge Duels stats.')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Minecraft username')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('skyblock')
    .setDescription('Get detailed SkyBlock stats.')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Minecraft username')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('pit')
    .setDescription('Get detailed Pit stats.')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Minecraft username')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('detailedstats')
    .setDescription('Get detailed stats paginated by game mode for a player.')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Minecraft username')
        .setRequired(true)
    )
].map(cmd => cmd.toJSON());

// 7) Register slash commands
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    console.log('Refreshing application (/) commands...');
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error reloading commands:', error);
  }
})();

// --- Utility Functions for API calls ---

// Mojang: fetch UUID
async function fetchUUID(username) {
  const cacheKey = `uuid_${username.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  try {
    const url = `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`;
    const response = await axios.get(url);
    if (!response.data) throw new Error('Username not found in Mojang API.');
    const uuid = response.data.id;
    cache.set(cacheKey, uuid);
    return uuid;
  } catch (error) {
    const errMsg = error.response?.data
      ? JSON.stringify(error.response.data)
      : error.message;
    throw new Error(`Error fetching UUID: ${errMsg}`);
  }
}

// Hypixel: fetch player
async function fetchHypixelPlayer(uuid) {
  const cacheKey = `player_${uuid}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  try {
    const url = `https://api.hypixel.net/player?key=${process.env.HYPIXEL_API_KEY}&uuid=${uuid}`;
    const response = await axios.get(url);
    if (!response.data.success) throw new Error('Failed to fetch data from Hypixel API.');
    if (!response.data.player) throw new Error('Player not found on Hypixel.');
    cache.set(cacheKey, response.data.player);
    return response.data.player;
  } catch (error) {
    const errMsg = error.response?.data
      ? JSON.stringify(error.response.data)
      : error.message;
    throw new Error(`Error fetching Hypixel player data: ${errMsg}`);
  }
}

// Hypixel: fetch recent games
async function fetchRecentGames(uuid) {
  const cacheKey = `recentgames_${uuid}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  try {
    const url = `https://api.hypixel.net/recentgames?key=${process.env.HYPIXEL_API_KEY}&uuid=${uuid}`;
    const response = await axios.get(url);
    if (!response.data.success) throw new Error('Failed to fetch recent games.');
    const games = response.data.games || [];
    cache.set(cacheKey, games, 60);
    return games;
  } catch (error) {
    const errMsg = error.response?.data
      ? JSON.stringify(error.response.data)
      : error.message;
    throw new Error(`Error fetching recent games: ${errMsg}`);
  }
}

// Hypixel: fetch guild
async function fetchGuild(uuid) {
  const cacheKey = `guild_${uuid}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  try {
    const url = `https://api.hypixel.net/guild?key=${process.env.HYPIXEL_API_KEY}&player=${uuid}`;
    const response = await axios.get(url);
    if (!response.data.success) throw new Error('Failed to fetch guild data from Hypixel API.');
    if (!response.data.guild) throw new Error('Guild not found for this player.');
    cache.set(cacheKey, response.data.guild);
    return response.data.guild;
  } catch (error) {
    const errMsg = error.response?.data
      ? JSON.stringify(error.response.data)
      : error.message;
    throw new Error(`Error fetching guild info: ${errMsg}`);
  }
}

// Format an object to avoid [object Object]
function formatSection(title, dataObj) {
  let section = `**${title}:**\n`;
  for (let key in dataObj) {
    if (dataObj[key] !== null && dataObj[key] !== undefined) {
      const value = typeof dataObj[key] === 'object'
        ? JSON.stringify(dataObj[key], null, 2)
        : dataObj[key];
      section += `**${key}:** ${value}\n`;
    }
  }
  return section;
}

// Format all stats text
function formatAllStatsText(player) {
  let output = `**All Stats for ${player.displayname}:**\n`;
  if (player.stats) {
    for (let mode in player.stats) {
      output += `\n**${mode} Stats:**\n`;
      const modeStats = player.stats[mode];
      for (let stat in modeStats) {
        let value = modeStats[stat];
        if (typeof value === 'object') {
          value = JSON.stringify(value, null, 2);
        }
        output += `**${stat}:** ${value}\n`;
      }
    }
  } else {
    output += 'No stats available.';
  }
  return output;
}

// Specific game mode formatters
function formatSkyWarsStats(player) {
  const sw = (player.stats && player.stats.SkyWars) || {};
  const data = {
    stars: sw.skywars_level || 'N/A',
    kills: sw.skywars_kills || 0,
    deaths: sw.skywars_deaths || 0,
    kdr: sw.skywars_deaths ? (sw.skywars_kills / sw.skywars_deaths).toFixed(2) : sw.skywars_kills,
    wins: sw.skywars_wins || 0,
    losses: sw.skywars_losses || 0,
    wlr: sw.skywars_losses ? (sw.skywars_wins / sw.skywars_losses).toFixed(2) : sw.skywars_wins,
    finalKills: sw.skywars_final_kills || 0,
    finalDeaths: sw.skywars_final_deaths || 0,
    fkdr: sw.skywars_final_deaths ? (sw.skywars_final_kills / sw.skywars_final_deaths).toFixed(2) : sw.skywars_final_kills
  };
  return formatSection(`SkyWars Stats for ${player.displayname}`, data);
}

function formatBedWarsStats(player) {
  const bw = (player.stats && player.stats.Bedwars) || {};
  const data = {
    kills: bw.kills_bedwars || 0,
    deaths: bw.deaths_bedwars || 0,
    kdr: bw.deaths_bedwars ? (bw.kills_bedwars / bw.deaths_bedwars).toFixed(2) : bw.kills_bedwars,
    finalKills: bw.final_kills_bedwars || 0,
    finalDeaths: bw.final_deaths_bedwars || 0,
    fkdr: bw.final_deaths_bedwars ? (bw.final_kills_bedwars / bw.final_deaths_bedwars).toFixed(2) : bw.final_kills_bedwars,
    wins: bw.wins_bedwars || 0,
    losses: bw.losses_bedwars || 0,
    wlr: bw.losses_bedwars ? (bw.wins_bedwars / bw.losses_bedwars).toFixed(2) : bw.wins_bedwars,
    bedsBroken: bw.beds_broken_bedwars || 0,
    gamesPlayed: bw.games_played_bedwars || 0
  };
  return formatSection(`BedWars Stats for ${player.displayname}`, data);
}

function formatDuelsStats(player) {
  const duels = (player.stats && player.stats.Duels) || {};
  const data = {
    wins: duels.wins || 0,
    losses: duels.losses || 0,
    kills: duels.kills || 0,
    deaths: duels.deaths || 0,
    kdr: duels.deaths ? (duels.kills / duels.deaths).toFixed(2) : duels.kills,
    wlr: duels.losses ? (duels.wins / duels.losses).toFixed(2) : duels.wins,
    games: duels.games || 0,
    comboKills: duels.combo_kills || 0,
    comboDeaths: duels.combo_deaths || 0
  };
  return formatSection(`Duels Stats for ${player.displayname}`, data);
}

function formatBridgeDuelsStats(player) {
  const duels = (player.stats && player.stats.Duels) || {};
  const data = {
    wins: duels.bridge_duels_wins || 0,
    losses: duels.bridge_duels_losses || 0,
    kills: duels.bridge_duels_kills || 0,
    deaths: duels.bridge_duels_deaths || 0,
    kdr: duels.bridge_duels_deaths ? (duels.bridge_duels_kills / duels.bridge_duels_deaths).toFixed(2) : duels.bridge_duels_kills,
    wlr: duels.bridge_duels_losses ? (duels.bridge_duels_wins / duels.bridge_duels_losses).toFixed(2) : duels.bridge_duels_wins
  };
  return formatSection(`Bridge Duels Stats for ${player.displayname}`, data);
}

function formatSkyBlockStats(player) {
  const sb = (player.stats && player.stats.SkyBlock) || {};
  let output = `**SkyBlock Stats for ${player.displayname}:**\n`;
  if (Object.keys(sb).length === 0) {
    output += "No SkyBlock stats available.";
    return output;
  }
  if (sb.profiles) output += formatSection("Profiles", sb.profiles);
  if (sb.collections) output += formatSection("Collections", sb.collections);
  if (sb.slayers) output += formatSection("Slayers", sb.slayers);
  const extras = {};
  for (let key in sb) {
    if (!['profiles', 'collections', 'slayers'].includes(key)) {
      extras[key] = sb[key];
    }
  }
  if (Object.keys(extras).length > 0) output += formatSection("Other SkyBlock Stats", extras);
  return output;
}

function formatPitStats(player) {
  const pit = (player.stats && player.stats.Pit) || {};
  const data = {
    coins: pit.coins || 0,
    kills: pit.kills || 0,
    deaths: pit.deaths || 0,
    kdr: pit.deaths ? (pit.kills / pit.deaths).toFixed(2) : pit.kills,
    level: pit.level || 'N/A'
  };
  return formatSection(`Pit Stats for ${player.displayname}`, data);
}

// Detailed stats: one embed per game mode
function formatDetailedStats(player) {
  const embeds = [];

  // General info embed
  const generalEmbed = new EmbedBuilder()
    .setTitle(`General Info for ${player.displayname}`)
    .setThumbnail(ICON_URL)
    .addFields(
      { name: 'Rank', value: player.rank || player.newPackageRank || 'N/A', inline: true },
      { name: 'First Login', value: player.firstLogin ? new Date(player.firstLogin).toLocaleDateString() : 'N/A', inline: true },
      { name: 'Last Login', value: player.lastLogin ? new Date(player.lastLogin).toLocaleDateString() : 'N/A', inline: true }
    )
    .setColor(0x00AE86)
    .setTimestamp();
  embeds.push(generalEmbed);

  // One embed per game mode
  if (player.stats) {
    for (let mode in player.stats) {
      const stats = player.stats[mode];
      if (typeof stats !== 'object' || stats === null) continue;
      let description = '';
      for (let key in stats) {
        let value = stats[key];
        if (typeof value === 'object') {
          value = JSON.stringify(value, null, 2);
        }
        description += `**${key}:** ${value}\n`;
      }
      // If description is too long, split
      const parts = splitString(description, 4000);
      parts.forEach((part, idx) => {
        const embed = new EmbedBuilder()
          .setTitle(`${mode} Stats${parts.length > 1 ? ` (Part ${idx + 1})` : ''}`)
          .setDescription(part || 'No data available.')
          .setThumbnail(ICON_URL)
          .setColor(0x0099ff)
          .setTimestamp();
        embeds.push(embed);
      });
    }
  }
  return embeds;
}

// --- Interaction Handlers ---
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const commandName = interaction.commandName;
  const username = interaction.options.getString('username');

  try {
    // Defer the reply so that pagination can work on the resulting message
    await interaction.deferReply({ ephemeral: false });

    // /uuid
    if (commandName === 'uuid') {
      const uuid = await fetchUUID(username);
      return interaction.editReply(`UUID for **${username}** is: \`${uuid}\``);
    }

    // For other commands, we fetch the UUID from Mojang
    const uuid = await fetchUUID(username);

    // /guild
    if (commandName === 'guild') {
      const guild = await fetchGuild(uuid);
      const embed = new EmbedBuilder()
        .setTitle(`Guild Info for ${username}`)
        .setDescription(`**Guild Name:** ${guild.name || 'N/A'}\n**Tag:** ${guild.tag || 'N/A'}`)
        .setThumbnail(ICON_URL)
        .setColor(0xFFD700)
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    // /detailedstats
    if (commandName === 'detailedstats') {
      const player = await fetchHypixelPlayer(uuid);
      player.uuid = uuid;
      const pages = formatDetailedStats(player);
      if (pages.length > 1) {
        const buttonPrev = new ButtonBuilder()
          .setCustomId('prevbtn')
          .setLabel('Previous')
          .setStyle(ButtonStyle.Danger);
        const buttonNext = new ButtonBuilder()
          .setCustomId('nextbtn')
          .setLabel('Next')
          .setStyle(ButtonStyle.Success);
        const buttonList = [buttonPrev, buttonNext].map(b => b.toJSON());
        return paginationEmbed(interaction, pages, buttonList, 180000, false);
      } else {
        return interaction.editReply({ embeds: pages });
      }
    }

    // /player
    if (commandName === 'player') {
      const player = await fetchHypixelPlayer(uuid);
      player.uuid = uuid;
      const embed = new EmbedBuilder()
        .setTitle(`Hypixel Profile: ${player.displayname}`)
        .setDescription(`UUID: \`${uuid}\``)
        .setThumbnail(ICON_URL)
        .addFields(
          { name: 'Rank', value: player.rank || player.newPackageRank || 'N/A', inline: true },
          { name: 'First Login', value: player.firstLogin ? new Date(player.firstLogin).toLocaleDateString() : 'N/A', inline: true },
          { name: 'Last Login', value: player.lastLogin ? new Date(player.lastLogin).toLocaleDateString() : 'N/A', inline: true }
        )
        .setColor(0x00AE86)
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    // /recentgames
    if (commandName === 'recentgames') {
      const games = await fetchRecentGames(uuid);
      if (games.length === 0) {
        return interaction.editReply(`No recent games found for **${username}**.`);
      } else {
        let message = `**Recent Games for ${username}:**\n`;
        games.forEach((game, index) => {
          message += `**Game ${index + 1}:** ${game.gameType || 'Unknown'} on ${game.map || 'N/A'}\n`;
        });
        return interaction.editReply(message);
      }
    }

    // All other stats commands:
    const player = await fetchHypixelPlayer(uuid);
    player.uuid = uuid;

    let replyText = '';
    switch (commandName) {
      case 'stats':
        replyText = formatAllStatsText(player);
        break;
      case 'skywars':
        replyText = formatSkyWarsStats(player);
        break;
      case 'bedwars':
        replyText = formatBedWarsStats(player);
        break;
      case 'duels':
        replyText = formatDuelsStats(player);
        break;
      case 'bridgeduels':
        replyText = formatBridgeDuelsStats(player);
        break;
      case 'skyblock':
        replyText = formatSkyBlockStats(player);
        break;
      case 'pit':
        replyText = formatPitStats(player);
        break;
      default:
        replyText = 'Unknown command.';
    }

    // If the reply text is too long, paginate
    if (replyText.length > 3500) {
      const chunks = splitString(replyText, 3500);
      const embedPages = chunks.map(chunk => 
        new EmbedBuilder()
          .setTitle(`Stats for ${player.displayname}`)
          .setDescription(chunk)
          .setThumbnail(ICON_URL)
          .setColor(0x00AE86)
          .setTimestamp()
      );
      const buttonPrev = new ButtonBuilder()
        .setCustomId('prevbtn')
        .setLabel('Previous')
        .setStyle(ButtonStyle.Danger);
      const buttonNext = new ButtonBuilder()
        .setCustomId('nextbtn')
        .setLabel('Next')
        .setStyle(ButtonStyle.Success);
      const buttonList = [buttonPrev, buttonNext].map(b => b.toJSON());
      return paginationEmbed(interaction, embedPages, buttonList, 120000, false);
    } else {
      return interaction.editReply(replyText);
    }
  } catch (error) {
    console.error(`Error handling command ${commandName} for ${username}:`, error);
    return interaction.editReply(`Error: ${error.message}`);
  }
});

// 8) On ready
client.once('ready', () => {
  console.log(`HypePulse is online as ${client.user.tag}`);
});

// 9) Login
client.login(process.env.DISCORD_TOKEN);
