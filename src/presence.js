'use strict';
// Rich Presence: o que mostrar no Discord (buildActivity) e como saber quando um jogo foi aberto/fechado (PlayTracker).
const path = require('path');
const { PLATFORM_IDS } = require('./platformIds');

const NAMES = Object.fromEntries(PLATFORM_IDS);
const LARGE_KEY = 'logo';                               // nome do Art Asset grande no portal do Discord
const LARGE_TEXT = 'All in One · Just play all in one';

const sysLabel = (id) => (!id || id === 'windows' ? 'PC' : NAMES[id] || id);
const STORE = { steam: 'Steam', epic: 'Epic Games', gog: 'GOG' };

// O Discord exige de 2 a 128 caracteres.
function fit(s) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  if (t.length < 2) return undefined;
  return t.length > 128 ? t.slice(0, 127) + '…' : t;
}

// Frases que se alternam na tela de plataformas (curiosidade para quem vê o perfil).
const FLAVOR = ['Todos eles, num só lugar', 'Just play all in one', 'Qual vai ser hoje?', 'Um só Start'];

// state:
//   { kind: 'platforms', index, total, name }
//   { kind: 'games', sysId, index, total, title }
//   { kind: 'playing', title, sysId, store, start }
// mode: 'full' (mostra nomes) | 'discreet' (só plataforma). tick: rotaciona as frases. appStart: ms desde o início do app.
function buildActivity(state, mode = 'full', opts = {}) {
  if (!state) return null;
  const full = mode !== 'discreet';
  const tick = opts.tick || 0;
  const a = {
    assets: { large_image: LARGE_KEY, large_text: LARGE_TEXT },
    instance: false,
  };
  const setSmall = (sysId) => {
    if (!sysId) return;
    a.assets.small_image = sysId;
    a.assets.small_text = fit(sysLabel(sysId));
  };
  const party = (i, t) => {
    if (full && Number.isInteger(i) && Number.isInteger(t) && t >= 1 && i >= 1 && i <= t) a.party = { size: [i, t] };
  };

  if (state.kind === 'playing') {
    const where = sysLabel(state.sysId);
    if (full) {
      a.details = fit(`Jogando ${state.title}`);
      a.state = fit(STORE[state.store] ? `${where} · via ${STORE[state.store]}` : where);
    } else {
      a.details = fit(`Jogando no ${where}`);
      a.state = 'Pelo All in One';
    }
    a.timestamps = { start: state.start || Date.now() };
    setSmall(state.sysId);
  } else if (state.kind === 'games') {
    const where = sysLabel(state.sysId);
    a.details = fit(`Explorando ${where}`);
    a.state = full && state.title ? fit(`Olhando ${state.title}`) : 'Escolhendo o que jogar';
    party(state.index, state.total);
    if (opts.appStart) a.timestamps = { start: opts.appStart };
    setSmall(state.sysId);
  } else if (state.kind === 'platforms') {
    a.details = 'Escolhendo o próximo mundo';
    a.state = fit(FLAVOR[tick % FLAVOR.length]);
    party(state.index, state.total);
    if (opts.appStart) a.timestamps = { start: opts.appStart };
  } else {
    return null;
  }
  return a;
}

// ---------------------------------------------------------------- detectar quando o jogo roda / fecha
// "    RunningAppID    REG_DWORD    0x1b2c4"  ->  111300
function parseRunningAppId(out) {
  const m = /RunningAppID\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(String(out || ''));
  return m ? parseInt(m[1], 16) : 0;
}
// tasklist /FO CSV: "Game.exe","1234",...
function parseTasklist(out, image) {
  const want = `"${String(image).toLowerCase()}"`;
  return String(out || '').split(/\r?\n/).some((l) => l.toLowerCase().startsWith(want));
}

class PlayTracker {
  // opts: { run(cmd, args) -> Promise<string>, now(), onEnd(), intervalMs }
  constructor(opts) {
    this.run = opts.run;
    this.now = opts.now || Date.now;
    this.onEnd = opts.onEnd || (() => {});
    this.intervalMs = opts.intervalMs || 5000;
    this.timer = null;
    this.game = null;
  }

  get active() { return !!this.game; }

  start(game) {
    this.stop();
    this.game = game;
    this.t0 = this.now();
    this.seen = false;
    this.missing = 0;
    const l = game.launch || {};
    const ext = l.exe ? path.win32.extname(l.exe).toLowerCase() : '';
    if (game.platform === 'steam' && game.sourceId) this.kind = 'steam';
    else if (l.exe && (ext === '.exe' || ext === '.com')) { this.kind = 'proc'; this.image = path.win32.basename(l.exe); }
    else this.kind = 'focus';           // epic (protocolo), .lnk, .bat…: sem processo conhecido
    this.timer = setInterval(() => { this._tick().catch(() => {}); }, this.intervalMs);
    if (this.timer.unref) this.timer.unref();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.game = null;
  }

  _end() {
    if (!this.game) return;
    this.stop();
    this.onEnd();
  }

  // a janela do All in One voltou ao primeiro plano
  onFocus() {
    if (this.game && this.kind === 'focus' && this.now() - this.t0 >= 20000) this._end();
  }

  async _tick() {
    const g = this.game;
    if (!g) return;
    const elapsed = this.now() - this.t0;
    if (this.kind === 'steam') {
      const out = await this.run('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'RunningAppID']);
      const id = parseRunningAppId(out);
      if (id && String(id) === String(g.sourceId)) { this.seen = true; return; }
      if (this.seen || elapsed > 120000) this._end();
    } else if (this.kind === 'proc') {
      const out = await this.run('tasklist', ['/FI', `IMAGENAME eq ${this.image}`, '/NH', '/FO', 'CSV']);
      if (parseTasklist(out, this.image)) { this.seen = true; this.missing = 0; return; }
      if (this.seen) { if (++this.missing >= 2) this._end(); }
      else if (elapsed > 30000) this.kind = 'focus';     // era só um lançador que fechou: volta a depender da janela
    }
  }
}

module.exports = { buildActivity, parseRunningAppId, parseTasklist, PlayTracker, sysLabel, fit, FLAVOR, LARGE_KEY };
