'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const WEEK = 7 * 24 * 3600 * 1000;

// id de plataforma: só letras minúsculas/números (ex.: windows, switch, ps2); qualquer outra coisa vira windows
const cleanSystem = (s) => (typeof s === 'string' && /^[a-z0-9]{2,12}$/.test(s) ? s : 'windows');

const defaults = () => ({ scanned: [], manual: [], meta: {}, covers: {} });

// Guarda tudo em <dataDir>/library.json:
//   scanned  jogos achados nos launchers (cache, para abrir instantâneo)
//   manual   jogos adicionados à mão
//   meta     por jogo: favorite, lastPlayed, hidden
//   covers   por jogo: { file, tone }
class Library {
  constructor(dataDir) {
    this.dir = dataDir;
    this.file = path.join(dataDir, 'library.json');
    this.coversDir = path.join(dataDir, 'covers');
    fs.mkdirSync(this.coversDir, { recursive: true });
    this.state = this._load();
    this._timer = null;
  }

  _load() {
    try {
      return { ...defaults(), ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
    } catch {
      return defaults();
    }
  }

  save() {
    clearTimeout(this._timer);
    this._timer = null;
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    fs.renameSync(tmp, this.file);
  }

  saveSoon() {
    if (this._timer) return;
    this._timer = setTimeout(() => this.save(), 400);
  }

  flush() {
    if (this._timer) this.save();
  }

  _meta(id) {
    return (this.state.meta[id] = this.state.meta[id] || {});
  }

  _decorate(g) {
    const m = this.state.meta[g.id] || {};
    const c = this.state.covers[g.id];
    const file = c && c.file && fs.existsSync(c.file) ? c.file : null;
    const out = {
      id: g.id,
      platform: g.platform,
      system: g.system || 'windows',   // 'windows' ou o id de um console
      title: g.title,
      favorite: !!m.favorite,
      lastPlayed: m.lastPlayed || 0,
      coverUrl: file ? pathToFileURL(file).href : null,
      tone: (c && c.tone) || null,
      customCover: !!(file && c.custom),
      editable: g.platform === 'manual',
    };
    if (out.editable) out.launch = { exe: g.launch.exe, args: g.launch.args || '' };
    return out;
  }

  getGames() {
    return [...this.state.scanned, ...this.state.manual]
      .filter((g) => !(this.state.meta[g.id] && this.state.meta[g.id].hidden))
      .map((g) => this._decorate(g));
  }

  hiddenCount() {
    return Object.keys(this.state.meta).filter((id) => this.state.meta[id].hidden).length;
  }

  findGame(id) {
    return (
      this.state.scanned.find((g) => g.id === id) ||
      this.state.manual.find((g) => g.id === id) ||
      null
    );
  }

  setScanned(list) {
    this.state.scanned = list;
    this.save();
  }

  addManual({ title, exe, args, system }) {
    const g = {
      id: `manual:${crypto.randomUUID()}`,
      platform: 'manual',
      system: cleanSystem(system),
      title: String(title).trim(),
      launch: { type: 'exe', exe, args: args || '' },
    };
    this.state.manual.push(g);
    this.save();
    return g;
  }

  updateManual(id, { title, exe, args, system }) {
    const g = this.state.manual.find((x) => x.id === id);
    if (!g) return null;
    if (system != null) g.system = cleanSystem(system);
    if (title != null) g.title = String(title).trim();
    if (exe != null) g.launch.exe = exe;
    if (args != null) g.launch.args = args;
    this.save();
    return g;
  }

  removeGame(id) {
    const g = this.findGame(id);
    if (!g) return false;
    if (g.platform === 'manual') {
      this.state.manual = this.state.manual.filter((x) => x.id !== id);
      this.dropCoverFile(id);
      delete this.state.covers[id];
      delete this.state.meta[id];
    } else {
      this._meta(id).hidden = true;
    }
    this.save();
    return true;
  }

  unhideAll() {
    for (const id of Object.keys(this.state.meta)) delete this.state.meta[id].hidden;
    this.save();
  }

  toggleFavorite(id) {
    const m = this._meta(id);
    m.favorite = !m.favorite;
    this.save();
    return m.favorite;
  }

  markPlayed(id) {
    this._meta(id).lastPlayed = Date.now();
    this.save();
  }

  needsCover(id) {
    const c = this.state.covers[id];
    if (!c) return true;
    if (c.file && fs.existsSync(c.file)) return false;
    if (c.file === null && Date.now() - (c.tried || 0) < WEEK) return false;
    return true;
  }

  setCover(id, cover) {
    this.state.covers[id] = cover;
    this.saveSoon();
  }

  dropCoverFile(id) {
    const c = this.state.covers[id];
    if (c && c.file) {
      try { fs.rmSync(c.file, { force: true }); } catch { /* ignora */ }
    }
  }
}

module.exports = { Library, cleanSystem };
