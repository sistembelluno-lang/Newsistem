// Navigazione tra le pagine con l'indirizzo dopo il "#":
//   #/                         elenco dei cantieri
//   #/impostazioni             cartella dei dati (Google Drive) e altre impostazioni
//   #/cantiere/<codice>        cruscotto del cantiere
//   #/cantiere/<codice>/<id>   modulo (anagrafica, documenti, imprese, ...)

export function leggiIndirizzo(hash = globalThis.location?.hash || '') {
  const parti = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parti[0] === 'impostazioni') return { pagina: 'impostazioni' };
  if (parti[0] !== 'cantiere' || !parti[1]) return { pagina: 'cantieri' };
  return { pagina: parti[2] ? 'modulo' : 'cantiere', codice: parti[1], modulo: parti[2] || null, resto: parti.slice(3) };
}

export function indirizzo(codice, modulo = null, ...resto) {
  return `#/cantiere/${[codice, modulo, ...resto].filter(Boolean).map(encodeURIComponent).join('/')}`;
}

export function vai(hash) {
  globalThis.location.hash = hash;
}
