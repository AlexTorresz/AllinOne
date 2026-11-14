'use strict';
// IDs das plataformas (usados no nome dos arquivos da pasta de ícones).
// Mantida em sincronia com renderer/platforms.js — o teste `npm test` confere.
const PLATFORM_IDS = [
  ['windows', 'Windows'],
  ['nes', 'Nintendo Entertainment System'], ['snes', 'Super Nintendo'], ['n64', 'Nintendo 64'],
  ['gc', 'Nintendo GameCube'], ['wii', 'Nintendo Wii'], ['wiiu', 'Nintendo Wii U'], ['switch', 'Nintendo Switch'],
  ['gb', 'Game Boy'], ['gbc', 'Game Boy Color'], ['gba', 'Game Boy Advance'], ['nds', 'Nintendo DS'], ['3ds', 'Nintendo 3DS'],
  ['ps1', 'PlayStation'], ['ps2', 'PlayStation 2'], ['ps3', 'PlayStation 3'], ['ps4', 'PlayStation 4'], ['ps5', 'PlayStation 5'],
  ['psp', 'PlayStation Portable'], ['vita', 'PlayStation Vita'],
  ['xbox', 'Xbox'], ['x360', 'Xbox 360'], ['xone', 'Xbox One'], ['xsx', 'Xbox Series X|S'],
  ['sms', 'Master System'], ['genesis', 'Mega Drive / Genesis'], ['saturn', 'Sega Saturn'], ['dc', 'Dreamcast'],
  ['arcade', 'Arcade'],
];
module.exports = { PLATFORM_IDS };
