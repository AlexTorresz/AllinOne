'use strict';
// Cada provider expõe scan() -> Promise<Game[]>.
// Para suportar outra loja (EA, Battle.net...), crie um módulo novo e registre aqui.
const providers = {
  steam: require('./steam'),
  epic: require('./epic'),
  gog: require('./gog'),
};

async function scanAll() {
  const names = Object.keys(providers);
  const results = await Promise.allSettled(names.map((n) => providers[n].scan()));
  const games = [];
  const errors = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') games.push(...r.value);
    else errors.push({ provider: names[i], error: String(r.reason && r.reason.message || r.reason) });
  });
  const seen = new Set();
  const unique = games.filter((g) => (seen.has(g.id) ? false : (seen.add(g.id), true)));
  return { games: unique, errors };
}

module.exports = { scanAll, providers };
