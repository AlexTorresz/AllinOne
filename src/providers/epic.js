'use strict';
const fs = require('fs');
const path = require('path');

// Um arquivo .item do Epic -> objeto simplificado (ou null)
function parseItem(text) {
  let j;
  try { j = JSON.parse(text); } catch { return null; }
  if (!j || !j.DisplayName || !j.AppName) return null;
  return {
    appName: j.AppName,
    displayName: j.DisplayName,
    installLocation: j.InstallLocation || '',
    launchExecutable: j.LaunchExecutable || '',
    namespace: j.CatalogNamespace || '',
    catalogItemId: j.CatalogItemId || '',
    mainGameAppName: j.MainGameAppName || j.AppName,
    categories: Array.isArray(j.AppCategories) ? j.AppCategories : null,
    incomplete: !!j.bIsIncompleteInstall,
  };
}

function isGame(item) {
  if (!item || item.incomplete) return false;
  if (item.mainGameAppName !== item.appName) return false; // DLC
  if (!item.launchExecutable) return false;
  if (item.categories) {
    if (item.categories.includes('addons')) return false;
    if (!item.categories.includes('games')) return false;
  }
  return true;
}

function launchUri(item) {
  const ref =
    item.namespace && item.catalogItemId
      ? [item.namespace, item.catalogItemId, item.appName].map(encodeURIComponent).join('%3A')
      : encodeURIComponent(item.appName);
  return `com.epicgames.launcher://apps/${ref}?action=launch&silent=true`;
}

function toGame(item) {
  return {
    id: `epic:${item.appName}`,
    sourceId: item.appName,
    platform: 'epic',
    title: item.displayName.trim(),
    launch: { type: 'uri', uri: launchUri(item) },
  };
}

async function scan() {
  if (process.platform !== 'win32') return [];
  const dir = path.join(
    process.env.ProgramData || 'C:\\ProgramData',
    'Epic', 'EpicGamesLauncher', 'Data', 'Manifests'
  );
  let files = [];
  try { files = fs.readdirSync(dir); } catch { return []; }
  const games = [];
  for (const f of files) {
    if (!f.toLowerCase().endsWith('.item')) continue;
    try {
      const item = parseItem(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (isGame(item)) games.push(toGame(item));
    } catch { /* ignora */ }
  }
  return games;
}

module.exports = { scan, parseItem, isGame, launchUri, toGame };
