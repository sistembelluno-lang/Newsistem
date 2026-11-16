// Disco in memoria: per i test e per provare l'interfaccia in un browser
// qualsiasi (i dati spariscono chiudendo la pagina).

function norm(p) {
  return String(p).replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
}

export function discoInMemoria() {
  const file = new Map();      // percorso -> Uint8Array
  const cartelle = new Set(['']);
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function creaGenitori(p) {
    const parti = norm(p).split('/');
    for (let i = 1; i < parti.length; i++) cartelle.add(parti.slice(0, i).join('/'));
  }

  return {
    nome: 'memoria',
    async esiste(p) {
      p = norm(p);
      return file.has(p) || cartelle.has(p);
    },
    async creaCartella(p) {
      p = norm(p);
      creaGenitori(`${p}/x`);
      cartelle.add(p);
    },
    async scriviByte(p, byte) {
      p = norm(p);
      creaGenitori(p);
      file.set(p, new Uint8Array(byte));
    },
    async leggiByte(p) {
      p = norm(p);
      if (!file.has(p)) throw new Error(`File non trovato: ${p}`);
      return file.get(p);
    },
    async scriviTesto(p, testo) {
      return this.scriviByte(p, enc.encode(testo));
    },
    async leggiTesto(p) {
      return dec.decode(await this.leggiByte(p));
    },
    async elenca(p) {
      p = norm(p);
      const pre = p ? `${p}/` : '';
      const visti = new Map();
      for (const k of [...file.keys(), ...cartelle]) {
        if (!k.startsWith(pre) || k === p) continue;
        const resto = k.slice(pre.length);
        if (!resto) continue;
        const nome = resto.split('/')[0];
        const cart = resto.includes('/') || cartelle.has(`${pre}${nome}`);
        visti.set(nome, visti.get(nome) || cart);
      }
      return [...visti].map(([nome, cartella]) => ({ nome, cartella })).sort((a, b) => a.nome.localeCompare(b.nome));
    },
    async elimina(p) {
      p = norm(p);
      file.delete(p);
      for (const k of [...file.keys()]) if (k.startsWith(`${p}/`)) file.delete(k);
      for (const k of [...cartelle]) if (k === p || k.startsWith(`${p}/`)) cartelle.delete(k);
    },
    async apri(p) {
      throw new Error(`Apertura dei file non disponibile in questa prova (${norm(p)})`);
    },
  };
}
