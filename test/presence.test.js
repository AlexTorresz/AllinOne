'use strict';
// Rich Presence: node test/presence.test.js  (usa um "Discord" falso em socket local)
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const { DiscordRPC, encode, decode, OP } = require('../src/discord');
const P = require('../src/presence');

let n = 0;
const results = [];
const test = (name, fn) => results.push([name, fn]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(cond, ms = 3000) {
  const t0 = Date.now();
  while (!cond()) { if (Date.now() - t0 > ms) throw new Error('timeout'); await sleep(15); }
}

test('quadros do protocolo: ida e volta, e mensagens em pedaços', () => {
  const a = encode(OP.FRAME, { cmd: 'X', ç: 'ã' });
  const b = encode(OP.PING, { n: 1 });
  const all = Buffer.concat([a, b]);
  const r1 = decode(all.slice(0, a.length + 5));          // 2º quadro incompleto
  assert.strictEqual(r1.frames.length, 1);
  assert.strictEqual(r1.frames[0].data.ç, 'ã');
  const r2 = decode(Buffer.concat([r1.rest, all.slice(a.length + 5)]));
  assert.strictEqual(r2.frames.length, 1);
  assert.strictEqual(r2.frames[0].op, OP.PING);
});

test('buildActivity: tela de plataformas, jogos e jogando (completo x discreto)', () => {
  const pl = P.buildActivity({ kind: 'platforms', index: 3, total: 8 }, 'full', { tick: 1, appStart: 123 });
  assert.strictEqual(pl.details, 'Escolhendo o próximo mundo');
  assert.strictEqual(pl.state, 'Just play all in one');
  assert.deepStrictEqual(pl.party.size, [3, 8]);
  assert.strictEqual(pl.timestamps.start, 123);
  assert.strictEqual(pl.assets.large_image, 'logo');

  const gm = P.buildActivity({ kind: 'games', sysId: 'switch', index: 2, total: 5, title: 'Hades' }, 'full');
  assert.strictEqual(gm.details, 'Explorando Nintendo Switch');
  assert.strictEqual(gm.state, 'Olhando Hades');
  assert.strictEqual(gm.assets.small_image, 'switch');

  const pw = P.buildActivity({ kind: 'playing', title: 'Hades', sysId: 'windows', store: 'steam', start: 99 }, 'full');
  assert.strictEqual(pw.details, 'Jogando Hades');
  assert.strictEqual(pw.state, 'PC · via Steam');
  assert.strictEqual(pw.timestamps.start, 99);

  // discreto: nenhum nome de jogo aparece
  const d1 = P.buildActivity({ kind: 'playing', title: 'Hades', sysId: 'ps2', store: 'manual', start: 1 }, 'discreet');
  assert.ok(!JSON.stringify(d1).includes('Hades'));
  assert.strictEqual(d1.details, 'Jogando no PlayStation 2');
  const d2 = P.buildActivity({ kind: 'games', sysId: 'snes', index: 1, total: 4, title: 'Zelda' }, 'discreet');
  assert.ok(!JSON.stringify(d2).includes('Zelda'));
  assert.ok(!d2.party);
});

test('buildActivity: limites do Discord (2 a 128 caracteres) e dados inválidos', () => {
  const big = P.buildActivity({ kind: 'playing', title: 'x'.repeat(500), sysId: 'windows', store: 'epic', start: 1 }, 'full');
  assert.ok(big.details.length <= 128);
  assert.strictEqual(P.fit('a'), undefined);
  assert.strictEqual(P.fit('  '), undefined);
  assert.strictEqual(P.buildActivity(null), null);
  assert.strictEqual(P.buildActivity({ kind: 'nada' }), null);
  const bad = P.buildActivity({ kind: 'platforms', index: 9, total: 3 }, 'full');
  assert.ok(!bad.party);                                   // índice maior que o total não vai para o Discord
});

test('leitores: RunningAppID da Steam e tasklist', () => {
  assert.strictEqual(P.parseRunningAppId('\r\nHKEY_CURRENT_USER\\Software\\Valve\\Steam\r\n    RunningAppID    REG_DWORD    0x1b2c4\r\n'), 111300);
  assert.strictEqual(P.parseRunningAppId('    RunningAppID    REG_DWORD    0x0'), 0);
  assert.strictEqual(P.parseRunningAppId(''), 0);
  const csv = '"Game.exe","1234","Console","1","50.000 K"\r\n';
  assert.ok(P.parseTasklist(csv, 'game.exe'));
  assert.ok(!P.parseTasklist('INFO: No tasks are running which match the specified criteria.', 'game.exe'));
});

test('PlayTracker: Steam abre e fecha', async () => {
  let now = 0, ended = 0, id = '0x0';
  const t = new P.PlayTracker({
    now: () => now, intervalMs: 1000000, onEnd: () => { ended++; },
    run: async () => `    RunningAppID    REG_DWORD    ${id}`,
  });
  t.start({ platform: 'steam', sourceId: '111300', launch: { type: 'uri' } });
  now = 5000; await t._tick(); assert.strictEqual(ended, 0);       // ainda abrindo
  id = '0x1b2c4'; await t._tick(); assert.strictEqual(ended, 0);   // rodando
  id = '0x0'; await t._tick();
  assert.strictEqual(ended, 1);
  assert.ok(!t.active);
});

test('PlayTracker: Steam que nunca abre desiste em 2 minutos', async () => {
  let now = 0, ended = 0;
  const t = new P.PlayTracker({ now: () => now, intervalMs: 1000000, onEnd: () => { ended++; }, run: async () => '' });
  t.start({ platform: 'steam', sourceId: '5', launch: { type: 'uri' } });
  now = 60000; await t._tick(); assert.strictEqual(ended, 0);
  now = 130000; await t._tick(); assert.strictEqual(ended, 1);
});

test('PlayTracker: .exe só termina após 2 leituras sem o processo; lançador que some cai para a janela', async () => {
  let now = 0, ended = 0, up = true;
  const t = new P.PlayTracker({
    now: () => now, intervalMs: 1000000, onEnd: () => { ended++; },
    run: async () => (up ? '"emu.exe","1","Console","1","1 K"' : 'INFO: none'),
  });
  t.start({ platform: 'manual', launch: { exe: 'C:\\emu\\emu.exe' } });
  await t._tick(); up = false;
  await t._tick(); assert.strictEqual(ended, 0);
  await t._tick(); assert.strictEqual(ended, 1);

  // lançador: nunca aparece e some -> depois de 30 s passa a depender do foco da janela
  ended = 0; up = false; now = 0;
  t.start({ platform: 'gog', launch: { exe: 'C:\\g\\launcher.exe' } });
  now = 40000; await t._tick();
  assert.strictEqual(t.kind, 'focus');
  t.onFocus(); assert.strictEqual(ended, 1);
});

test('PlayTracker: Epic/.lnk usam o foco da janela, só depois de 20 s', () => {
  let now = 0, ended = 0;
  const t = new P.PlayTracker({ now: () => now, intervalMs: 1000000, onEnd: () => { ended++; }, run: async () => '' });
  t.start({ platform: 'epic', launch: { type: 'uri', uri: 'com.epicgames.launcher://x' } });
  now = 5000; t.onFocus(); assert.strictEqual(ended, 0);     // foco logo ao abrir não conta
  now = 25000; t.onFocus(); assert.strictEqual(ended, 1);
  t.stop();
});

test('DiscordRPC: handshake, envio, limitação e limpeza (Discord falso)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-rpc-'));
  const sockPath = path.join(dir, 'discord-ipc-0');
  const got = [];
  let hello = null;
  const server = net.createServer((c) => {
    let buf = Buffer.alloc(0);
    c.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      const { frames, rest } = decode(buf); buf = rest;
      for (const f of frames) {
        if (f.op === OP.HANDSHAKE) { hello = f.data; c.write(encode(OP.FRAME, { cmd: 'DISPATCH', evt: 'READY', data: {} })); }
        else if (f.op === OP.FRAME) got.push(f.data);
      }
    });
  });
  await new Promise((r) => server.listen(sockPath, r));

  const states = [];
  const rpc = new DiscordRPC({ clientId: '123456789', dir, retryMs: 100, minGapMs: 150, onState: (s) => states.push(s) });
  rpc.setActivity({ details: 'antes de conectar', assets: {} });     // guardado até conectar
  rpc.start();
  await until(() => got.length >= 1);
  assert.deepStrictEqual(hello, { v: 1, client_id: '123456789' });
  assert.strictEqual(got[0].cmd, 'SET_ACTIVITY');
  assert.strictEqual(got[0].args.activity.details, 'antes de conectar');
  assert.strictEqual(typeof got[0].args.pid, 'number');
  assert.deepStrictEqual(states, [true]);

  // várias mudanças rápidas: só a última chega (limitação de envios)
  rpc.setActivity({ details: 'um' });
  rpc.setActivity({ details: 'dois' });
  rpc.setActivity({ details: 'três' });
  await until(() => got.length >= 2);
  await sleep(400);
  assert.strictEqual(got.length, 2);
  assert.strictEqual(got[1].args.activity.details, 'três');

  // mesmo conteúdo não é reenviado
  rpc.setActivity({ details: 'três' }); await sleep(300);
  assert.strictEqual(got.length, 2);

  // limpar
  rpc.setActivity(null);
  await until(() => got.length >= 3);
  assert.strictEqual(got[2].args.activity, undefined);

  rpc.stop();
  await new Promise((r) => server.close(r));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('DiscordRPC: sem Discord aberto não quebra e conecta quando ele aparece', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-rpc-'));
  const rpc = new DiscordRPC({ clientId: '42', dir, retryMs: 80, minGapMs: 0 });
  rpc.setActivity({ details: 'esperando' });
  rpc.start();
  await sleep(300);                                          // nada escutando: só tenta de novo
  assert.ok(!rpc.connected);
  const got = [];
  const server = net.createServer((c) => {
    c.on('data', (d) => {
      const { frames } = decode(d);
      for (const f of frames) {
        if (f.op === OP.HANDSHAKE) c.write(encode(OP.FRAME, { cmd: 'DISPATCH', evt: 'READY' }));
        else if (f.op === OP.FRAME) got.push(f.data);
      }
    });
  });
  await new Promise((r) => server.listen(path.join(dir, 'discord-ipc-3'), r));   // o Discord pode usar o pipe 0..9
  await until(() => got.length >= 1, 4000);
  assert.strictEqual(got[0].args.activity.details, 'esperando');
  rpc.stop();
  await new Promise((r) => server.close(r));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('DiscordRPC: guarda o motivo quando o Discord recusa o ID ou a presença', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-rpc-'));
  const logs = [];
  let mode = 'badid';
  const server = net.createServer((c) => {
    c.on('data', (d) => {
      const { frames } = decode(d);
      for (const f of frames) {
        if (f.op === OP.HANDSHAKE) {
          if (mode === 'badid') c.write(encode(OP.CLOSE, { code: 4000, message: 'Invalid Client ID' }));
          else c.write(encode(OP.FRAME, { cmd: 'DISPATCH', evt: 'READY', data: { user: { username: 'teste' } } }));
        } else if (f.op === OP.FRAME) {
          c.write(encode(OP.FRAME, { cmd: 'SET_ACTIVITY', evt: 'ERROR', data: { code: 4000, message: 'Invalid timestamp' }, nonce: f.data.nonce }));
        }
      }
    });
  });
  await new Promise((r) => server.listen(path.join(dir, 'discord-ipc-0'), r));
  const rpc = new DiscordRPC({ clientId: '1', dir, retryMs: 1000000, minGapMs: 0, onLog: (m) => logs.push(m) });
  rpc.start();
  await until(() => /Invalid Client ID/.test(rpc.lastError));
  assert.ok(logs.some((l) => l.includes('CLOSE do Discord')));
  rpc.stop();

  mode = 'ok';
  const rpc2 = new DiscordRPC({ clientId: '1', dir, retryMs: 1000000, minGapMs: 0, onLog: (m) => logs.push(m) });
  rpc2.setActivity({ details: 'oi oi' });
  rpc2.start();
  await until(() => /Invalid timestamp/.test(rpc2.lastError));
  assert.ok(logs.some((l) => l.includes('READY (usuário teste)')));
  rpc2.stop();
  await new Promise((r) => server.close(r));
  fs.rmSync(dir, { recursive: true, force: true });
});

(async () => {
  for (const [name, fn] of results) {
    await fn();
    n++;
    console.log('ok  ' + name);
  }
  console.log(`\n${n} testes de Rich Presence passaram.`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
