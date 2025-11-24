// index.js - Render-ready Discord bot with Express keep-alive
import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----------------------
// EXPRESS KEEP-ALIVE
// ----------------------
const app = express();
app.get('/', (req, res) => res.send('Bot is running via Render.'));
app.listen(3000, () => console.log('Webserver live on port 3000'));

// ----------------------
// DISCORD CLIENT
// ----------------------
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// ----------------------
// SQLITE DATABASE
// ----------------------
const dbFile = path.join(__dirname, 'bot-data.sqlite');
const db = new sqlite3.Database(dbFile);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS renders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL,
    assigned_to TEXT,
    result_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// ----------------------
// SLASH COMMANDS
// ----------------------
const commands = [
  new SlashCommandBuilder()
    .setName('submit-render')
    .setDescription('Stuur een renderjob in')
    .addStringOption(o => o.setName('description').setDescription('Job beschrijving').setRequired(true)),

  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Toon openstaande renderjobs (staff)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Claim een renderjob (staff)')
    .addIntegerOption(o => o.setName('job_id').setDescription('Job ID').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('complete')
    .setDescription('Markeer een renderjob als voltooid')
    .addIntegerOption(o => o.setName('job_id').setDescription('Job ID').setRequired(true))
    .addStringOption(o => o.setName('result_url').setDescription('Resultaat link').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
].map(c => c.toJSON());

// ----------------------
// COMMAND DEPLOY
// ----------------------
const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('Commands registered.');
  } catch (e) {
    console.error(e);
  }
})();

// ----------------------
// BOT READY
// ----------------------
client.on('ready', () => {
  console.log(`Bot ingelogd als ${client.user.tag}`);
});

// ----------------------
// COMMAND HANDLER
// ----------------------
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'submit-render') {
    const desc = interaction.options.getString('description');
    db.run('INSERT INTO renders (user_id, description, status) VALUES (?, ?, ?)', [interaction.user.id, desc, 'pending'], function (err) {
      if (err) return interaction.reply({ content: 'Fout bij opslaan.', ephemeral: true });
      interaction.reply(`Renderjob aangemaakt! ID **${this.lastID}**`);
    });
  }

  if (interaction.commandName === 'queue') {
    db.all("SELECT * FROM renders WHERE status != 'complete'", (err, rows) => {
      if (err) return interaction.reply('Fout.');
      if (!rows.length) return interaction.reply('Geen open jobs.');
      const text = rows.map(r => `ID: ${r.id} — ${r.description} — Status: ${r.status}`).join("\n");
      interaction.reply(text);
    });
  }

  if (interaction.commandName === 'claim') {
    const id = interaction.options.getInteger('job_id');
    db.run('UPDATE renders SET status = ?, assigned_to = ? WHERE id = ?', ['in-progress', interaction.user.id, id], err => {
      if (err) return interaction.reply('Fout.');
      interaction.reply(`Job **${id}** is geclaimd.`);
    });
  }

  if (interaction.commandName === 'complete') {
    const id = interaction.options.getInteger('job_id');
    const url = interaction.options.getString('result_url');
    db.run('UPDATE renders SET status = ?, result_url = ? WHERE id = ?', ['complete', url, id], err => {
      if (err) return interaction.reply('Fout.');
      interaction.reply(`Job **${id}** voltooid! Resultaat: ${url}`);
    });
  }
});

// ----------------------
// LOGIN
// ----------------------
client.login(TOKEN);
