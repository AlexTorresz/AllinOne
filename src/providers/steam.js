'use strict';
const fs = require('fs');
const path = require('path');
const { parseVdf, getCI } = require('../lib/vdf');
const { psJson } = require('../lib/ps');

const IGNORE_NAME = /^(Steamworks Common Redistributables|Steamworks Shared|Steam Linux Runtime|Proton\b|Steam Controller Configs)/i;
const IGNORE_APPID = new Set(['228980']);

// libraryfolders.vdf -> lista de pastas de biblioteca
function parseLibraryFolders(text) {
  const root = parseVdf(text);
  const lf = getCI(root, 'libraryfolders') || {};
  const paths = [];
  for (const [k, v] of Object.entries(lf)) {
    if (!/^\d+$/.test(k)) continue;
    if (typeof v === 'string') paths.push(v);
    else if (v && v.path) paths.push(v.path);
  }
  return paths;
}

// appmanifest_*.acf -> { appid, name, installdir, stateFlags }
function parseAppManifest(text) {
  const state = getCI(parseVdf(text), 'AppState');
  if (!state) return null;
  const appid = getCI(state, 'appid');
  const name = getCI(state, 'name');
  if (!appid || !name) return null;
  return {
    appid: String(appid),
    name: String(name),
    installdir: getCI(state, 'installdir') || '',
    stateFlags: parseInt(getCI(state, 'StateFlags') || '0', 10) || 0,
  };
}

function isRealGame(m) {
  if (!m) return false;
  if (IGNORE_APPID.has(m.appid)) return false;
  if (IGNORE_NAME.test(m.name)) return false;
  return (m.stateFlags & 4) !== 0; // bit 4 = totalmente instalado
}

function toGame(m) {
  return {
    id: `steam:${m.appid}`,
    sourceId: m.appid,
    platform: 'steam',
    title: m.name.trim(),
    launch: { type: 'uri', uri: `steam://rungameid/${m.appid}` },
  };
}

async function findSteamPath() {
  const candidates = [];
  try {
    const reg = await psJson("(Get-ItemProperty 'HKCU:\\Software\\Valve\\Steam').SteamPath | ConvertTo-Json");
    if (typeof reg === 'string' && reg) candidates.push(path.normalize(reg));
  } catch { /* sem registro: usa os caminhos padrão */ }
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  candidates.push(path.join(pf86, 'Steam'), 'C:\\Program Files\\Steam');
  return candidates.find((p) => fs.existsSync(path.join(p, 'steamapps')));
}

async function scan() {
  if (process.platform !== 'win32') return [];
  const steam = await findSteamPath();
  if (!steam) return [];

  const libs = new Set([steam]);
  try {
    const text = fs.readFileSync(path.join(steam, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    for (const p of parseLibraryFolders(text)) libs.add(path.normalize(p));
  } catch { /* só a biblioteca principal */ }

  const games = [];
  for (const lib of libs) {
    const dir = path.join(lib, 'steamapps');
    let files = [];
    try { files = fs.readdirSync(dir); } catch { continue; }
    for (const f of files) {
      if (!/^appmanifest_\d+\.acf$/i.test(f)) continue;
      try {
        const m = parseAppManifest(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (isRealGame(m)) games.push(toGame(m));
      } catch { /* manifesto corrompido: ignora */ }
    }
  }
  return games;
}

module.exports = { scan, parseLibraryFolders, parseAppManifest, isRealGame, toGame };
