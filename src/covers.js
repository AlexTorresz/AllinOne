'use strict';
const fs = require('fs');
const path = require('path');
const { net, nativeImage } = require('electron');

const HOSTS = ['cdn.cloudflare.steamstatic.com', 'cdn.akamai.steamstatic.com'];
const NAMES = ['library_600x900.jpg', 'library_600x900_2x.jpg'];

const hex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

// Cor média da imagem (usada para tingir o fundo da tela). Null se não der para ler.
function toneFromBuffer(buf) {
  try {
    const img = nativeImage.createFromBuffer(buf);
    if (img.isEmpty()) return null;
    const bmp = img.resize({ width: 16, height: 24, quality: 'good' }).toBitmap(); // BGRA
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i + 3 < bmp.length; i += 4) { b += bmp[i]; g += bmp[i + 1]; r += bmp[i + 2]; n++; }
    if (!n) return null;
    return `#${hex(r / n)}${hex(g / n)}${hex(b / n)}`;
  } catch {
    return null;
  }
}

const safe = (id) => id.replace(/[^a-z0-9]/gi, '_');

// Baixa a capa vertical de um jogo da Steam. Devolve { file, tone } ou null.
async function fetchSteam(appid, dir) {
  for (const host of HOSTS) {
    for (const name of NAMES) {
      try {
        const res = await net.fetch(`https://${host}/steam/apps/${appid}/${name}`);
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 2000) continue;
        const file = path.join(dir, `steam-${appid}.jpg`);
        fs.writeFileSync(file, buf);
        return { file, tone: toneFromBuffer(buf) };
      } catch { /* tenta o próximo */ }
    }
  }
  return null;
}

// Copia uma imagem escolhida pelo usuário para a pasta de capas.
function importFile(src, dir, id) {
  const buf = fs.readFileSync(src);
  const ext = path.extname(src).toLowerCase() || '.png';
  const file = path.join(dir, `${safe(id)}-${Date.now()}${ext}`);
  fs.writeFileSync(file, buf);
  return { file, tone: toneFromBuffer(buf) };
}

// true se o arquivo é uma imagem que o Electron consegue abrir
function isImage(src) {
  try { return !nativeImage.createFromPath(src).isEmpty(); } catch { return false; }
}

module.exports = { fetchSteam, importFile, toneFromBuffer, isImage };
