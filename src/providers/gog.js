'use strict';
const fs = require('fs');
const { psJson } = require('../lib/ps');

const SCRIPT = `
$k = 'HKLM:\\SOFTWARE\\WOW6432Node\\GOG.com\\Games'
Get-ChildItem $k | ForEach-Object {
  $p = Get-ItemProperty $_.PSPath
  [pscustomobject]@{
    id = $p.gameID; name = $p.gameName; path = $p.path; exe = $p.exe
    workingDir = $p.workingDir; launchCommand = $p.launchCommand; dependsOn = $p.dependsOn
  }
} | ConvertTo-Json -Depth 3 -Compress
`;

function stripQuotes(s) {
  return String(s || '').trim().replace(/^"(.*)"$/, '$1');
}

// Saída do PowerShell (objeto único, array ou null) -> lista de jogos
function normalize(raw) {
  const arr = raw == null ? [] : Array.isArray(raw) ? raw : [raw];
  return arr
    .filter((e) => e && e.id && e.name && (e.exe || e.launchCommand) && !e.dependsOn)
    .map((e) => ({
      id: `gog:${e.id}`,
      sourceId: String(e.id),
      platform: 'gog',
      title: String(e.name).trim(),
      launch: {
        type: 'exe',
        exe: stripQuotes(e.exe || e.launchCommand),
        cwd: e.workingDir || e.path || undefined,
      },
    }));
}

async function scan() {
  if (process.platform !== 'win32') return [];
  let raw = null;
  try { raw = await psJson(SCRIPT); } catch { return []; } // GOG não instalado
  return normalize(raw).filter((g) => fs.existsSync(g.launch.exe));
}

module.exports = { scan, normalize };
