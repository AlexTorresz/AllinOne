'use strict';
// Testes dos pedaços puros (sem Electron): node test/parsers.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseVdf } = require('../src/lib/vdf');
const { splitArgs } = require('../src/lib/args');
const { suggestName } = require('../src/lib/names');
const steam = require('../src/providers/steam');
const epic = require('../src/providers/epic');
const gog = require('../src/providers/gog');
const { Library } = require('../src/library');

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok  ' + name); };

const LIBRARY_VDF = `"libraryfolders"
{
\t"0"
\t{
\t\t"path"\t\t"C:\\\\Program Files (x86)\\\\Steam"
\t\t"label"\t\t""
\t\t"apps"
\t\t{
\t\t\t"228980"\t\t"123"
\t\t}
\t}
\t"1"
\t{
\t\t"path"\t\t"D:\\\\SteamLibrary"
\t}
}`;

const MANIFEST = (id, name, flags) => `"AppState"
{
\t"appid"\t\t"${id}"
\t"Universe"\t\t"1"
\t"name"\t\t"${name}"
\t"StateFlags"\t\t"${flags}"
\t"installdir"\t\t"Hades"
}`;

test('vdf: caminhos do Windows com barra escapada', () => {
  const o = parseVdf(LIBRARY_VDF);
  assert.strictEqual(o.libraryfolders['0'].path, 'C:\\Program Files (x86)\\Steam');
  assert.strictEqual(o.libraryfolders['1'].path, 'D:\\SteamLibrary');
});

test('steam: bibliotecas', () => {
  assert.deepStrictEqual(steam.parseLibraryFolders(LIBRARY_VDF), [
    'C:\\Program Files (x86)\\Steam',
    'D:\\SteamLibrary',
  ]);
});

test('steam: manifesto e filtros', () => {
  const hades = steam.parseAppManifest(MANIFEST(1145360, 'Hades', 4));
  assert.strictEqual(hades.name, 'Hades');
  assert.ok(steam.isRealGame(hades));
  assert.ok(!steam.isRealGame(steam.parseAppManifest(MANIFEST(228980, 'Steamworks Common Redistributables', 4))));
  assert.ok(!steam.isRealGame(steam.parseAppManifest(MANIFEST(2348590, 'Proton 8.0', 4))));
  assert.ok(!steam.isRealGame(steam.parseAppManifest(MANIFEST(5, 'Meio instalado', 1026))), 'download em andamento');
  assert.ok(steam.isRealGame(steam.parseAppManifest(MANIFEST(6, 'Atualizando', 6))), 'instalado com update pendente');
  const g = steam.toGame(hades);
  assert.strictEqual(g.id, 'steam:1145360');
  assert.strictEqual(g.launch.uri, 'steam://rungameid/1145360');
});

test('epic: jogo, DLC e instalação incompleta', () => {
  const item = (o) => JSON.stringify({
    DisplayName: 'Celeste', AppName: 'Salt', CatalogNamespace: 'ns1', CatalogItemId: 'cat1',
    InstallLocation: 'D:\\Epic\\Celeste', LaunchExecutable: 'Celeste.exe',
    AppCategories: ['public', 'games', 'applications'], ...o,
  });
  const ok = epic.parseItem(item({}));
  assert.ok(epic.isGame(ok));
  assert.strictEqual(
    epic.launchUri(ok),
    'com.epicgames.launcher://apps/ns1%3Acat1%3ASalt?action=launch&silent=true'
  );
  assert.ok(!epic.isGame(epic.parseItem(item({ MainGameAppName: 'Outro' }))), 'DLC');
  assert.ok(!epic.isGame(epic.parseItem(item({ AppCategories: ['addons'] }))), 'addon');
  assert.ok(!epic.isGame(epic.parseItem(item({ bIsIncompleteInstall: true }))), 'incompleto');
  assert.strictEqual(epic.parseItem('isso não é json'), null);
});

test('gog: objeto único, lista e DLC', () => {
  const e = { id: 1207658930, name: 'The Witcher', path: 'D:\\GOG\\W', exe: 'D:\\GOG\\W\\witcher.exe', workingDir: 'D:\\GOG\\W' };
  assert.strictEqual(gog.normalize(e).length, 1);
  assert.strictEqual(gog.normalize([e, { ...e, id: 2, dependsOn: '1207658930' }]).length, 1);
  assert.strictEqual(gog.normalize(null).length, 0);
  assert.strictEqual(gog.normalize(e)[0].id, 'gog:1207658930');
  assert.strictEqual(
    gog.normalize({ id: 3, name: 'X', launchCommand: '"D:\\x\\x.exe"' })[0].launch.exe,
    'D:\\x\\x.exe'
  );
});

test('argumentos com aspas', () => {
  assert.deepStrictEqual(splitArgs('-windowed "C:\\meu mod\\a" -novid'), ['-windowed', 'C:\\meu mod\\a', '-novid']);
  assert.deepStrictEqual(splitArgs('   '), []);
  assert.deepStrictEqual(splitArgs(''), []);
});

test('sugestão de nome', () => {
  assert.strictEqual(suggestName('D:\\Jogos\\Stardew Valley\\Game.exe'), 'Stardew Valley');
  assert.strictEqual(suggestName('D:\\Jogos\\HK\\hollow_knight.exe'), 'hollow knight');
  assert.strictEqual(suggestName('D:\\Jogos\\Dark Souls\\DarkSoulsIII.exe'), 'Dark Souls III');
});

test('biblioteca: manual, favoritos, ocultar e persistência', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-'));
  const lib = new Library(dir);
  lib.setScanned([{ id: 'steam:1', platform: 'steam', sourceId: '1', title: 'Hades', launch: { type: 'uri', uri: 'steam://rungameid/1' } }]);
  const m = lib.addManual({ title: 'Meu Jogo', exe: 'D:\\x\\x.exe', args: '-a' });
  assert.strictEqual(lib.getGames().length, 2);
  assert.strictEqual(lib.toggleFavorite(m.id), true);
  lib.markPlayed('steam:1');
  lib.removeGame('steam:1'); // oculta
  assert.strictEqual(lib.getGames().length, 1);
  assert.strictEqual(lib.hiddenCount(), 1);

  const again = new Library(dir); // recarrega do disco
  const games = again.getGames();
  assert.strictEqual(games.length, 1);
  assert.strictEqual(games[0].favorite, true);
  assert.strictEqual(games[0].editable, true);
  assert.strictEqual(games[0].launch.args, '-a');
  again.unhideAll();
  assert.strictEqual(again.getGames().length, 2);
  assert.ok(again.getGames().find((g) => g.id === 'steam:1').lastPlayed > 0);
  again.removeGame(m.id); // manual some de vez
  assert.strictEqual(again.getGames().length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('plataformas: jogo manual guarda o sistema; antigos e inválidos viram windows', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-'));
  const lib = new Library(dir);
  lib.setScanned([{ id: 'steam:1', platform: 'steam', sourceId: '1', title: 'Hades', launch: { type: 'uri', uri: 'x' } }]);
  const ps2 = lib.addManual({ title: 'God of War', exe: 'C:\\pcsx2.exe', args: '"D:\\roms\\gow.iso"', system: 'ps2' });
  const sem = lib.addManual({ title: 'Sem sistema', exe: 'C:\\a.exe' });
  const ruim = lib.addManual({ title: 'Inválido', exe: 'C:\\b.exe', system: '../etc/passwd' });
  const by = (id) => lib.getGames().find((g) => g.id === id);
  assert.strictEqual(by('steam:1').system, 'windows');
  assert.strictEqual(by(ps2.id).system, 'ps2');
  assert.strictEqual(by(sem.id).system, 'windows');
  assert.strictEqual(by(ruim.id).system, 'windows');
  lib.updateManual(ps2.id, { title: 'God of War', system: 'psp' });
  assert.strictEqual(by(ps2.id).system, 'psp');
  // registro antigo, salvo antes do campo existir
  lib.state.manual.push({ id: 'manual:old', platform: 'manual', title: 'Antigo', launch: { type: 'exe', exe: 'C:\\c.exe', args: '' } });
  assert.strictEqual(by('manual:old').system, 'windows');
  const again = new Library(dir);
  assert.strictEqual(again.getGames().find((g) => g.id === ps2.id).system, 'psp');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('plataformas: lista do app e lista do processo principal estão em sincronia', () => {
  global.window = {};
  require('../renderer/platforms.js');
  const ui = global.window.Platforms.list.map((p) => [p.id, p.name]);
  const { PLATFORM_IDS } = require('../src/platformIds');
  assert.deepStrictEqual(ui, PLATFORM_IDS);
  const need = ['windows', 'switch', 'ps1', 'ps2', 'ps3', 'ps4', 'ps5', 'psp', 'snes', 'gba', 'x360', 'xone'];
  for (const id of need) assert.ok(ui.some(([i]) => i === id), 'falta ' + id);
  assert.strictEqual(new Set(ui.map(([i]) => i)).size, ui.length, 'ids repetidos');
  delete global.window;
});

test('teclado virtual: edição, cursor, maiúsculas e camadas', () => {
  // mini DOM só com o que o osk.js usa
  const mkEl = () => ({
    textContent: '', className: '', style: {}, dataset: {}, children: [], classList: { _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, v) { v ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    replaceChildren() { this.children = []; }, append(...n) { this.children.push(...n); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 10, height: 10 }; },
    set type(v) {}, get type() { return ''; },
  });
  const nodes = {};
  global.document = {
    createElement: mkEl, createTextNode: (t) => ({ t }),
    querySelector: (s) => (nodes[s] = nodes[s] || mkEl()), addEventListener() {},
  };
  global.window = { Sound: undefined };
  delete require.cache[require.resolve('../renderer/osk.js')];
  require('../renderer/osk.js');
  const OSK = global.window.OSK;
  let out = null;
  OSK.open({ label: 'Nome', value: '', max: 10, autoCap: true, onDone: (v) => { out = v; } });
  assert.ok(OSK.isOpen);
  const key = (k) => OSK.onKey({ key: k });
  OSK.act('confirm');                       // tecla Q na tela, com autocapitalização no início
  assert.strictEqual(nodes['#oskBefore'].textContent, 'Q');
  key('Backspace');
  key('d'); key('o'); key('o'); key(' '); key('M');   // teclado físico digita literalmente
  assert.strictEqual(nodes['#oskBefore'].textContent, 'doo M');
  key('ArrowLeft'); key('Backspace');
  assert.strictEqual(nodes['#oskBefore'].textContent, 'doo');
  assert.strictEqual(nodes['#oskAfter'].textContent, 'M');
  key('Enter');
  assert.strictEqual(out, 'dooM');
  assert.ok(!OSK.isOpen);
  // limite de tamanho
  OSK.open({ value: 'abcdefghij', max: 10, onDone: (v) => { out = v; } });
  key('z'); key('Enter');
  assert.strictEqual(out, 'abcdefghij');
  // cancelar não chama onDone
  out = 'x';
  OSK.open({ value: 'a', onDone: () => { out = 'chamou'; }, onCancel: () => { out = 'cancelou'; } });
  OSK.act('back');
  assert.strictEqual(out, 'cancelou');
  delete global.document; delete global.window;
});

console.log(`\n${n} testes passaram.`);
