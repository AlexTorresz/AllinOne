'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const { pathToFileURL } = require('url');

const { Library } = require('./src/library');
const { scanAll } = require('./src/providers');
const covers = require('./src/covers');
const { splitArgs } = require('./src/lib/args');
const { suggestName } = require('./src/lib/names');
const { PLATFORM_IDS } = require('./src/platformIds');
const { DiscordRPC } = require('./src/discord');
const presence = require('./src/presence');

app.setPath('userData', path.join(app.getPath('appData'), 'AllInOne'));

const windowed = process.argv.includes('--windowed');
let win = null;
let library = null;
let scanning = null;
let quitAllowed = false;   // true quando o encerramento já foi confirmado na interface
let rendererReady = false; // a interface já abriu e sabe pedir confirmação

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
}

// ---------------------------------------------------------------- janela
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    fullscreen: !windowed,
    show: false,
    backgroundColor: '#05060a',
    autoHideMenuBar: true,
    title: 'All in One',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required', // música de fundo sem precisar de clique
      backgroundThrottling: false,
    },
  });
  win.removeMenu();
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => { win = null; });

  // Fechar a janela (X, Alt+F4) passa pela confirmação da interface.
  win.on('close', (e) => {
    if (quitAllowed || !rendererReady || !win || win.isDestroyed()) return;
    e.preventDefault();
    send('app:quit-request');
  });
  // se a interface travar, não deixa o programa preso
  win.webContents.on('render-process-gone', () => { rendererReady = false; });
  win.on('unresponsive', () => { rendererReady = false; });
  win.on('focus', () => { if (rp.tracker) rp.tracker.onFocus(); });
}

// ---------------------------------------------------------------- iniciar jogos
async function launchGame(game) {
  const l = game.launch;
  if (l.type === 'uri') {
    await shell.openExternal(l.uri);
    return;
  }
  if (!fs.existsSync(l.exe)) throw new Error(`Executável não encontrado: ${l.exe}`);

  const cwd = l.cwd && fs.existsSync(l.cwd) ? l.cwd : path.dirname(l.exe);
  try {
    const child = spawn(l.exe, splitArgs(l.args), { cwd, detached: true, stdio: 'ignore' });
    await new Promise((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    child.unref();
  } catch (err) {
    // .lnk, .bat ou programas que pedem administrador: deixa o Windows abrir.
    const msg = await shell.openPath(l.exe);
    if (msg) throw new Error(msg || String(err.message || err));
  }
}


// ---------------------------------------------------------------- Discord Rich Presence
// Application ID do Discord (https://discord.com/developers/applications). Pode ficar vazio aqui e ser
// informado em %APPDATA%\AllInOne\config.json:  { "discordAppId": "123456789012345678" }
const DEFAULT_DISCORD_APP_ID = '1571185090388824155';

const configFile = () => path.join(app.getPath('userData'), 'config.json');
function readConfig() {
  try { return JSON.parse(fs.readFileSync(configFile(), 'utf8')) || {}; } catch { return {}; }
}
function writeConfig(patch) {
  try { fs.writeFileSync(configFile(), JSON.stringify({ ...readConfig(), ...patch }, null, 2)); } catch { /* ignora */ }
}

const rp = {
  rpc: null, appId: '', mode: 'full',
  browse: null, playing: null, tick: 0, appStart: Date.now(),
  tracker: null, rotate: null,
};

// log para diagnóstico: %APPDATA%\AllInOne\presence.log (reinicia quando passa de 200 KB)
const presenceLogFile = () => path.join(app.getPath('userData'), 'presence.log');
function plog(msg) {
  try {
    const f = presenceLogFile();
    try { if (fs.statSync(f).size > 200000) fs.writeFileSync(f, ''); } catch { /* ainda não existe */ }
    fs.appendFileSync(f, `${new Date().toISOString()}  ${msg}\n`);
  } catch { /* ignora */ }
}

function runCmd(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: 8000 }, (err, stdout) => resolve(err ? '' : String(stdout)));
  });
}

function refreshPresence() {
  if (!rp.rpc) return;
  const act = rp.mode === 'off' ? null
    : rp.playing ? presence.buildActivity(rp.playing, rp.mode)
    : presence.buildActivity(rp.browse, rp.mode, { tick: rp.tick, appStart: rp.appStart });
  rp.rpc.setActivity(act);
}

function ensureConfig() {
  // cria %APPDATA%\AllInOne\config.json com os campos à vista, para você só preencher o ID do Discord
  const cur = readConfig();
  const next = { discordAppId: '', presenceMode: 'full', ...cur };
  if (!fs.existsSync(configFile()) || Object.keys(next).length !== Object.keys(cur).length) {
    try { fs.mkdirSync(path.dirname(configFile()), { recursive: true }); } catch { /* ignora */ }
    try { fs.writeFileSync(configFile(), JSON.stringify(next, null, 2)); } catch { /* ignora */ }
  }
}

function initPresence() {
  ensureConfig();
  const cfg = readConfig();
  rp.appId = String(cfg.discordAppId || DEFAULT_DISCORD_APP_ID || '').replace(/\D/g, '');
  rp.mode = ['full', 'discreet', 'off'].includes(cfg.presenceMode) ? cfg.presenceMode : 'full';
  rp.tracker = new presence.PlayTracker({
    run: runCmd,
    onEnd: () => { rp.playing = null; refreshPresence(); },
  });
  plog(`iniciando Rich Presence: id=${rp.appId || '(vazio)'} modo=${rp.mode} app=${app.getVersion()}`);
  if (!rp.appId) return;
  rp.rpc = new DiscordRPC({
    clientId: rp.appId,
    onLog: plog,
    onState: (ok) => send('presence:state', { connected: ok, error: rp.rpc ? rp.rpc.lastError : '' }),
  });
  if (rp.mode !== 'off') rp.rpc.start();
  rp.rotate = setInterval(() => { rp.tick++; if (!rp.playing && rp.browse && rp.browse.kind === 'platforms') refreshPresence(); }, 45000);
  if (rp.rotate.unref) rp.rotate.unref();
}

function startPlaying(g) {
  rp.playing = { kind: 'playing', title: g.title, sysId: g.system || 'windows', store: g.platform, start: Date.now() };
  if (rp.tracker) rp.tracker.start(g);
  refreshPresence();
}

const cleanInt = (n) => (Number.isInteger(n) && n >= 0 && n < 100000 ? n : 0);
const cleanStr = (s) => String(s == null ? '' : s).slice(0, 100);
function sanitizeBrowse(st) {
  if (!st || (st.kind !== 'platforms' && st.kind !== 'games')) return null;
  const out = { kind: st.kind, index: cleanInt(st.index), total: cleanInt(st.total) };
  if (st.kind === 'games') {
    out.sysId = /^[a-z0-9]{2,12}$/.test(String(st.sysId)) ? st.sysId : 'windows';
    out.title = cleanStr(st.title);
  }
  return out;
}

function registerPresenceIpc() {
  ipcMain.handle('presence:update', (_e, st) => { rp.browse = sanitizeBrowse(st); refreshPresence(); return true; });
  ipcMain.handle('presence:get', () => ({
    available: !!rp.rpc, mode: rp.mode, connected: !!(rp.rpc && rp.rpc.connected),
    error: (rp.rpc && rp.rpc.lastError) || '',
  }));
  ipcMain.handle('presence:mode', (_e, mode) => {
    if (!['full', 'discreet', 'off'].includes(mode)) return { ok: false };
    rp.mode = mode;
    writeConfig({ presenceMode: mode });
    if (rp.rpc) {
      if (mode === 'off') { rp.rpc.setActivity(null); setTimeout(() => { if (rp.mode === 'off') rp.rpc.stop(); }, 600); }
      else { rp.rpc.start(); refreshPresence(); }
    }
    return { ok: true, available: !!rp.rpc, mode };
  });
}

// ---------------------------------------------------------------- capas
function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

async function pool(items, size, worker) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(size, queue.length) }, async () => {
      while (queue.length) {
        const item = queue.shift();
        try { await worker(item); } catch { /* segue */ }
      }
    })
  );
}

function queueCovers() {
  const todo = library.state.scanned.filter((g) => g.platform === 'steam' && library.needsCover(g.id));
  if (!todo.length) return;
  pool(todo, 4, async (g) => {
    const r = await covers.fetchSteam(g.sourceId, library.coversDir);
    const mine = library.state.covers[g.id];
    if (mine && mine.custom) return;          // o usuário escolheu uma capa enquanto a busca rodava
    if (r) {
      library.setCover(g.id, r);
      send('cover', { id: g.id, coverUrl: pathToFileURL(r.file).href, tone: r.tone });
    } else {
      library.setCover(g.id, { file: null, tone: null, tried: Date.now() });
    }
  });
}

// ---------------------------------------------------------------- ícones de plataforma
const iconsDir = () => path.join(app.getPath('userData'), 'platform-icons');

function readme() {
  return [
    'ÍCONES DAS PLATAFORMAS',
    '',
    'Coloque aqui as imagens que você quer ver no carrossel de plataformas.',
    'O nome do arquivo é o ID da plataforma + a extensão (svg, png, webp ou jpg).',
    'Exemplo: switch.svg, ps2.png, x360.webp',
    'Se não houver arquivo, o All in One usa um ícone próprio.',
    'Dica: imagens com fundo transparente ficam melhores. Feche e reabra a janela do app (ou volte para ela) para atualizar.',
    '',
    'IDs disponíveis:',
    ...PLATFORM_IDS.map(([id, name]) => `  ${id.padEnd(10)} ${name}`),
    '',
  ].join('\r\n');
}

function ensureIconsDir() {
  const dir = iconsDir();
  fs.mkdirSync(dir, { recursive: true });
  const note = path.join(dir, 'LEIA-ME.txt');
  try { fs.writeFileSync(note, readme()); } catch { /* ok */ }
  return dir;
}

function platformIcons() {
  const dir = ensureIconsDir();
  const out = {};
  for (const f of fs.readdirSync(dir)) {
    const m = /^([a-z0-9-]+)\.(svg|png|webp|jpe?g)$/i.exec(f);
    if (!m) continue;
    const full = path.join(dir, f);
    let v = 0;
    try { v = Math.floor(fs.statSync(full).mtimeMs); } catch { /* ok */ }
    out[m[1].toLowerCase()] = `${pathToFileURL(full).href}?v=${v}`;
  }
  return out;
}

// ---------------------------------------------------------------- biblioteca
const payload = () => ({ games: library.getGames(), hidden: library.hiddenCount() });

function doScan() {
  if (scanning) return scanning;
  scanning = (async () => {
    try {
      const { games, errors } = await scanAll();
      errors.forEach((e) => console.warn(`[scan:${e.provider}]`, e.error));
      library.setScanned(games);
      queueCovers();
    } finally {
      scanning = null;
    }
    return payload();
  })();
  return scanning;
}

function applyCover(id, src) {
  library.dropCoverFile(id);
  if (src === null) {
    delete library.state.covers[id];
    library.save();
    return;
  }
  // custom: capa escolhida pelo usuário (nunca é trocada pela busca automática)
  library.setCover(id, { ...covers.importFile(src, library.coversDir, id), custom: true });
  library.save();
}

function registerIpc() {
  ipcMain.handle('library:get', () => payload());
  ipcMain.handle('library:scan', () => doScan());
  ipcMain.handle('library:unhide', () => { library.unhideAll(); return payload(); });

  ipcMain.handle('game:launch', async (_e, id) => {
    const g = library.findGame(id);
    if (!g) return { ok: false, error: 'Jogo não encontrado.' };
    try {
      await launchGame(g);
      library.markPlayed(id);
      startPlaying(g);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  ipcMain.handle('game:favorite', (_e, id) => library.toggleFavorite(id));
  ipcMain.handle('game:remove', (_e, id) => {
    const g = library.findGame(id);
    if (g && g.platform === 'manual') library.dropCoverFile(id);
    return library.removeGame(id);
  });

  ipcMain.handle('game:add', (_e, d) => {
    try {
      if (!d || !d.title || !d.exe) return { ok: false, error: 'Informe o nome e o executável.' };
      const g = library.addManual(d);
      if (d.cover) applyCover(g.id, d.cover);
      return { ok: true, id: g.id };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  ipcMain.handle('game:update', (_e, id, d) => {
    try {
      if (!d || !d.title || !d.exe) return { ok: false, error: 'Informe o nome e o executável.' };
      if (!library.updateManual(id, d)) return { ok: false, error: 'Jogo não encontrado.' };
      if (d.cover !== undefined) applyCover(id, d.cover); // string = nova, null = remover
      return { ok: true, id };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  // Troca (ou remove) a capa de QUALQUER jogo: Steam, Epic, GOG ou manual.
  ipcMain.handle('game:set-cover', (_e, id, src) => {
    try {
      const g = library.findGame(id);
      if (!g) return { ok: false, error: 'Jogo não encontrado.' };
      if (src === null) {
        applyCover(id, null);
        if (g.platform === 'steam') queueCovers();   // volta a procurar a capa oficial
        return { ok: true, coverUrl: null, tone: null };
      }
      if (typeof src !== 'string' || !/\.(png|jpe?g|webp|bmp|gif)$/i.test(src)) {
        return { ok: false, error: 'Use uma imagem PNG, JPG ou WEBP.' };
      }
      if (!covers.isImage(src)) return { ok: false, error: 'Não consegui abrir essa imagem.' };
      applyCover(id, src);
      const c = library.state.covers[id];
      return { ok: true, coverUrl: pathToFileURL(c.file).href, tone: c.tone };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  ipcMain.handle('dialog:exe', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Escolha o executável do jogo',
      properties: ['openFile'],
      filters: [
        { name: 'Programas', extensions: ['exe', 'lnk', 'bat', 'cmd'] },
        { name: 'Todos os arquivos', extensions: ['*'] },
      ],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    return { path: r.filePaths[0], name: suggestName(r.filePaths[0]) };
  });

  ipcMain.handle('dialog:image', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Escolha a capa',
      properties: ['openFile'],
      filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
  });

  ipcMain.handle('win:fullscreen', () => {
    if (win) win.setFullScreen(!win.isFullScreen());
  });
  ipcMain.handle('platforms:icons', () => platformIcons());
  ipcMain.handle('platforms:open-folder', async () => {
    const dir = ensureIconsDir();
    const err = await shell.openPath(dir);
    return err ? { ok: false, error: err } : { ok: true };
  });
  ipcMain.handle('app:ready', () => { rendererReady = true; });
  ipcMain.handle('app:quit', () => { quitAllowed = true; app.quit(); });
}

// ---------------------------------------------------------------- ciclo de vida
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  library = new Library(app.getPath('userData'));
  registerIpc();
  registerPresenceIpc();
  initPresence();
  createWindow();
});

app.on('before-quit', () => {
  quitAllowed = true;
  if (library) library.flush();
  if (rp.rpc) { try { rp.rpc.setActivity(null); rp.rpc.stop(); } catch { /* ignora */ } }
});
app.on('window-all-closed', () => app.quit());
