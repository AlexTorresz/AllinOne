'use strict';
// Parser mínimo do formato KeyValues (VDF/ACF) usado pela Steam.

function parseVdf(text) {
  const len = text.length;
  let i = 0;

  function skipWs() {
    while (i < len) {
      const c = text[i];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') i++;
      else if (c === '/' && text[i + 1] === '/') {
        while (i < len && text[i] !== '\n') i++;
      } else break;
    }
  }

  function readString() {
    i++; // abre aspas
    let s = '';
    while (i < len && text[i] !== '"') {
      if (text[i] === '\\' && i + 1 < len) {
        const n = text[i + 1];
        s += n === 'n' ? '\n' : n === 't' ? '\t' : n;
        i += 2;
      } else {
        s += text[i++];
      }
    }
    i++; // fecha aspas
    return s;
  }

  function readObject() {
    const obj = {};
    for (;;) {
      skipWs();
      if (i >= len) return obj;
      if (text[i] === '}') { i++; return obj; }
      if (text[i] !== '"') { i++; continue; }
      const key = readString();
      skipWs();
      if (text[i] === '{') { i++; obj[key] = readObject(); }
      else if (text[i] === '"') { obj[key] = readString(); }
    }
  }

  return readObject();
}

// Busca de chave sem diferenciar maiúsculas de minúsculas.
function getCI(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined;
  const k = Object.keys(obj).find((x) => x.toLowerCase() === key.toLowerCase());
  return k === undefined ? undefined : obj[k];
}

module.exports = { parseVdf, getCI };
