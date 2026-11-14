'use strict';
const { execFile } = require('child_process');

// Executa um script PowerShell e devolve o stdout (UTF-8). Só existe no Windows.
// Usa -EncodedCommand para evitar qualquer problema de aspas.
function ps(script, timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') return resolve('');
    const wrapped =
      "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $ErrorActionPreference='Stop'; " + script;
    const encoded = Buffer.from(wrapped, 'utf16le').toString('base64');
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, timeout, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' },
      (err, stdout) => {
        if (err) return reject(err);
        resolve(String(stdout).replace(/^﻿/, '').trim());
      }
    );
  });
}

async function psJson(script, timeout) {
  const out = await ps(script, timeout);
  if (!out) return null;
  try { return JSON.parse(out); } catch { return null; }
}

module.exports = { ps, psJson };
