'use strict';
// Cliente mínimo do Discord Rich Presence (IPC local), sem dependências.
// O Discord aberto no PC escuta num pipe (Windows) ou socket (Linux/macOS) chamado discord-ipc-0..9.
// Protocolo: cada mensagem = [opcode int32 LE][tamanho int32 LE][JSON utf-8].
const net = require('net');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 };

function encode(op, data) {
  const json = Buffer.from(JSON.stringify(data), 'utf8');
  const head = Buffer.alloc(8);
  head.writeInt32LE(op, 0);
  head.writeInt32LE(json.length, 4);
  return Buffer.concat([head, json]);
}

// Lê quantos quadros completos houver no buffer. Devolve { frames, rest }.
function decode(buf) {
  const frames = [];
  let off = 0;
  while (buf.length - off >= 8) {
    const op = buf.readInt32LE(off);
    const len = buf.readInt32LE(off + 4);
    if (len < 0 || len > 1 << 20) return { frames, rest: Buffer.alloc(0), bad: true };
    if (buf.length - off - 8 < len) break;
    let data = null;
    try { data = JSON.parse(buf.slice(off + 8, off + 8 + len).toString('utf8')); } catch { /* ignora */ }
    frames.push({ op, data });
    off += 8 + len;
  }
  return { frames, rest: buf.slice(off) };
}

function pipePath(i, dir) {
  if (process.platform === 'win32') return `\\\\?\\pipe\\discord-ipc-${i}`;
  const base = dir || process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || os.tmpdir() || '/tmp';
  return path.join(base, `discord-ipc-${i}`);
}

class DiscordRPC {
  // opts: { clientId, dir (só testes), retryMs, minGapMs, onState }
  constructor(opts = {}) {
    this.clientId = String(opts.clientId || '');
    this.dir = opts.dir;
    this.retryMs = opts.retryMs || 15000;
    this.minGapMs = opts.minGapMs === undefined ? 4500 : opts.minGapMs;   // o Discord limita ~5 envios / 20 s
    this.onState = opts.onState || (() => {});
    this.onLog = opts.onLog || (() => {});
    this.lastError = '';        // último problema (para mostrar no app)
    this.user = '';
    this.sock = null;
    this.ready = false;
    this.buf = Buffer.alloc(0);
    this.activity = null;       // o que queremos mostrar
    this.sentJson = undefined;  // o que o Discord já tem
    this.lastSend = 0;
    this.timer = null;
    this.flushTimer = null;
    this.stopped = true;
    this.connecting = false;
  }

  get connected() { return this.ready; }

  start() {
    if (!this.clientId || !this.stopped) return;
    this.stopped = false;
    this._connect(0);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer); clearTimeout(this.flushTimer);
    if (this.sock) {
      try { if (this.ready) this.sock.write(encode(OP.CLOSE, {})); } catch { /* ignora */ }
      try { this.sock.destroy(); } catch { /* ignora */ }
    }
    this.sock = null; this.ready = false; this.connecting = false;
  }

  // activity = objeto do Discord, ou null para limpar
  setActivity(activity) {
    this.activity = activity || null;
    this._flush();
  }

  _retry() {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this._connect(0), this.retryMs);
    if (this.timer.unref) this.timer.unref();
  }

  _connect(i) {
    if (this.stopped || this.connecting || this.ready) return;
    if (i > 9) { this._retry(); return; }
    this.connecting = true;
    const where = pipePath(i, this.dir);
    const sock = net.createConnection(where);
    let opened = false;
    sock.on('connect', () => {
      opened = true;
      this.onLog(`conectou em ${where}; enviando handshake (client_id ${this.clientId})`);
      this.sock = sock;
      this.buf = Buffer.alloc(0);
      sock.write(encode(OP.HANDSHAKE, { v: 1, client_id: this.clientId }));
    });
    sock.on('data', (d) => this._onData(d));
    sock.on('error', (e) => {
      if (i === 0 || (e && e.code !== 'ENOENT')) this.onLog(`erro no pipe ${i}: ${(e && e.code) || e}`);
      if (e && e.code === 'ENOENT') { if (!this.lastError || i === 9) this.lastError = 'Discord não encontrado (abra o app do Discord no PC)'; }
      else if (e) this.lastError = `Falha ao falar com o Discord: ${e.code || e.message}`;
    });
    sock.on('close', () => {
      const wasReady = this.ready;
      this.connecting = false;
      if (this.sock === sock) { this.sock = null; this.ready = false; this.sentJson = undefined; }
      if (wasReady) { this.onLog('conexão com o Discord encerrada'); this.onState(false); }
      else if (opened) this.onLog('o Discord fechou a conexão antes do READY');
      if (this.stopped) return;
      if (opened) this._retry();           // o Discord fechou/reiniciou
      else this._connect(i + 1);           // tenta o próximo pipe
    });
  }

  _onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    const { frames, rest, bad } = decode(this.buf);
    this.buf = rest;
    if (bad && this.sock) { this.sock.destroy(); return; }
    for (const f of frames) {
      if (f.op === OP.PING && this.sock) this.sock.write(encode(OP.PONG, f.data || {}));
      else if (f.op === OP.CLOSE) {
        const d = f.data || {};
        this.lastError = `O Discord recusou: ${d.message || 'sem motivo'}${d.code ? ` (código ${d.code})` : ''}`;
        this.onLog(`CLOSE do Discord: ${JSON.stringify(d)}`);
        if (this.sock) this.sock.destroy();
      } else if (f.op === OP.FRAME && f.data && f.data.evt === 'READY') {
        this.ready = true; this.connecting = false; this.sentJson = undefined;
        this.lastError = '';
        this.user = (f.data.data && f.data.data.user && f.data.data.user.username) || '';
        this.onLog(`READY (usuário ${this.user || '?'})`);
        this.onState(true);
        this._flush(true);
      } else if (f.op === OP.FRAME && f.data && f.data.evt === 'ERROR') {
        const d = f.data.data || {};
        this.lastError = `O Discord rejeitou a presença: ${d.message || 'erro'}${d.code ? ` (código ${d.code})` : ''}`;
        this.onLog(`ERRO do Discord em ${f.data.cmd}: ${JSON.stringify(d)}`);
        this.onState(this.ready);
      } else if (f.op === OP.FRAME && f.data && f.data.cmd === 'SET_ACTIVITY') {
        this.lastError = '';
        this.onLog('presença aceita pelo Discord');
      }
    }
  }

  _flush(force) {
    if (!this.ready || !this.sock) return;
    const json = JSON.stringify(this.activity);
    if (json === this.sentJson) return;
    const wait = this.lastSend + this.minGapMs - Date.now();
    if (!force && wait > 0) {
      clearTimeout(this.flushTimer);
      this.flushTimer = setTimeout(() => this._flush(), wait + 20);
      if (this.flushTimer.unref) this.flushTimer.unref();
      return;
    }
    this.lastSend = Date.now();
    this.sentJson = json;
    this.onLog(`enviando presença: ${json === 'null' ? '(limpar)' : json}`);
    try {
      this.sock.write(encode(OP.FRAME, {
        cmd: 'SET_ACTIVITY',
        args: { pid: process.pid, activity: this.activity || undefined },
        nonce: crypto.randomUUID(),
      }));
    } catch { /* o close cuida da reconexão */ }
  }
}

module.exports = { DiscordRPC, encode, decode, pipePath, OP };
