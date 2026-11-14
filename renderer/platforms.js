// Plataformas (Windows + consoles). Cada uma tem identidade visual PRÓPRIA do app:
// nome, cor, fabricante e um glifo genérico. Não são as logos oficiais.
// Quer as logos oficiais? Coloque os arquivos na pasta de ícones (Menu → Ícones das plataformas),
// com o id da plataforma no nome: switch.svg, ps2.png, x360.webp ... e o app passa a usá-los.
(() => {
  'use strict';

  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const x = (v) => Math.round(255 * v).toString(16).padStart(2, '0');
    return `#${x(f(0))}${x(f(8))}${x(f(4))}`;
  }

  const GROUPS = [
    { id: 'pc', label: 'PC' },
    { id: 'nintendo', label: 'Nintendo' },
    { id: 'playstation', label: 'PlayStation' },
    { id: 'xbox', label: 'Xbox' },
    { id: 'sega', label: 'Sega' },
    { id: 'other', label: 'Outros' },
  ];

  // id, nome, rótulo curto, grupo, matiz, glifo
  const RAW = [
    ['windows', 'Windows', 'PC', 'pc', 196, 'pc'],

    ['nes', 'Nintendo Entertainment System', 'NES', 'nintendo', 6, 'cart'],
    ['snes', 'Super Nintendo', 'SNES', 'nintendo', 272, 'cart'],
    ['n64', 'Nintendo 64', 'N64', 'nintendo', 148, 'cart'],
    ['gc', 'Nintendo GameCube', 'GAMECUBE', 'nintendo', 258, 'disc'],
    ['wii', 'Nintendo Wii', 'WII', 'nintendo', 190, 'console'],
    ['wiiu', 'Nintendo Wii U', 'WII U', 'nintendo', 204, 'console'],
    ['switch', 'Nintendo Switch', 'SWITCH', 'nintendo', 352, 'hybrid'],
    ['gb', 'Game Boy', 'GAME BOY', 'nintendo', 96, 'pocket'],
    ['gbc', 'Game Boy Color', 'GB COLOR', 'nintendo', 306, 'pocket'],
    ['gba', 'Game Boy Advance', 'GBA', 'nintendo', 248, 'handheld'],
    ['nds', 'Nintendo DS', 'DS', 'nintendo', 214, 'handheld'],
    ['3ds', 'Nintendo 3DS', '3DS', 'nintendo', 18, 'handheld'],

    ['ps1', 'PlayStation', 'PS1', 'playstation', 222, 'disc'],
    ['ps2', 'PlayStation 2', 'PS2', 'playstation', 232, 'console'],
    ['ps3', 'PlayStation 3', 'PS3', 'playstation', 212, 'console'],
    ['ps4', 'PlayStation 4', 'PS4', 'playstation', 218, 'console'],
    ['ps5', 'PlayStation 5', 'PS5', 'playstation', 202, 'console'],
    ['psp', 'PlayStation Portable', 'PSP', 'playstation', 240, 'handheld'],
    ['vita', 'PlayStation Vita', 'VITA', 'playstation', 226, 'handheld'],

    ['xbox', 'Xbox', 'XBOX', 'xbox', 112, 'console'],
    ['x360', 'Xbox 360', 'XBOX 360', 'xbox', 98, 'console'],
    ['xone', 'Xbox One', 'XBOX ONE', 'xbox', 124, 'console'],
    ['xsx', 'Xbox Series X|S', 'SERIES X|S', 'xbox', 138, 'console'],

    ['sms', 'Master System', 'MASTER', 'sega', 350, 'cart'],
    ['genesis', 'Mega Drive / Genesis', 'MEGA DRIVE', 'sega', 236, 'cart'],
    ['saturn', 'Sega Saturn', 'SATURN', 'sega', 262, 'disc'],
    ['dc', 'Dreamcast', 'DREAMCAST', 'sega', 28, 'disc'],

    ['arcade', 'Arcade', 'ARCADE', 'other', 320, 'stick'],
  ];

  // glifos genéricos (traço), viewBox 64
  const GLYPHS = {
    pc: '<rect x="7" y="10" width="50" height="32" rx="3"/><path d="M22 54h20M32 42v12"/>',
    console: '<rect x="6" y="22" width="52" height="22" rx="4"/><path d="M13 31h22M44 33h7"/><path d="M12 44v4M52 44v4"/>',
    hybrid: '<rect x="4" y="16" width="56" height="32" rx="9"/><rect x="16" y="20" width="32" height="24" rx="2"/><circle cx="10" cy="32" r="2"/><circle cx="54" cy="32" r="2"/>',
    handheld: '<rect x="4" y="17" width="56" height="30" rx="9"/><rect x="22" y="22" width="20" height="18" rx="1.5"/><path d="M12 32h7M15.5 28.5v7"/><circle cx="50" cy="29" r="2"/><circle cx="46" cy="36" r="2"/>',
    pocket: '<rect x="17" y="6" width="30" height="52" rx="5"/><rect x="22" y="12" width="20" height="16" rx="1.5"/><path d="M24 43h8M28 39v8"/><circle cx="40" cy="41" r="2"/><circle cx="36" cy="46" r="2"/>',
    cart: '<path d="M15 7h34v34l-5 5v11H20V46l-5-5z"/><rect x="23" y="14" width="18" height="16" rx="1.5"/><path d="M26 50h12"/>',
    disc: '<circle cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="5"/><path d="M32 10a22 22 0 0 1 22 22"/>',
    stick: '<circle cx="32" cy="14" r="7"/><path d="M32 21v14"/><rect x="8" y="35" width="48" height="18" rx="3"/><circle cx="20" cy="44" r="2.4"/><circle cx="32" cy="44" r="2.4"/><circle cx="44" cy="44" r="2.4"/>',
  };

  const glyphSvg = (kind, cls = '') =>
    `<svg class="${cls}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPHS[kind] || GLYPHS.console}</svg>`;

  const list = RAW.map(([id, name, short, group, hue, kind]) => {
    const h2 = (hue + 52) % 360;
    return {
      id, name, short, group, hue, kind,
      _pal: {
        ac: hslToHex(hue, 92, 60), ac2: hslToHex(h2, 88, 62),
        c1: hslToHex(hue, 92, 58), c2: hslToHex(hue, 55, 13), c3: hslToHex(h2, 90, 64),
      },
    };
  });
  const byId = Object.fromEntries(list.map((p) => [p.id, p]));

  window.Platforms = { list, byId, groups: GROUPS, glyphSvg, hslToHex };
})();
