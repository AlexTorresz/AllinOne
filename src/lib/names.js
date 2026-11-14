'use strict';
const path = require('path');

const GENERIC = new Set([
  'game', 'launcher', 'start', 'run', 'play', 'bin', 'main', 'app', 'client',
  'win64', 'win32', 'shipping', 'setup', 'launch',
]);

// Sugere um título a partir do caminho do executável.
// "D:\Jogos\Hollow Knight\hollow_knight.exe" -> "hollow knight"
// "D:\Jogos\Stardew Valley\Game.exe"        -> "Stardew Valley" (nome genérico, usa a pasta)
function suggestName(file) {
  const win = file.includes('\\') && !file.includes('/');
  const p = win ? path.win32 : path.posix;
  const base = p.basename(file, p.extname(file));
  let name = base;
  if (GENERIC.has(base.toLowerCase()) || base.length < 4) {
    name = p.basename(p.dirname(file)) || base;
  }
  return name
    .replace(/[_.]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { suggestName };
