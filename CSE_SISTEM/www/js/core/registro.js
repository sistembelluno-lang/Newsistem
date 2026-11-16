// Registro delle funzioni (moduli) del programma.
//
// Ogni modulo dichiara a quale ruolo appartiene (CSE oggi, DL domani), la
// sezione dell'archivio che usa e come si disegna. Il menu e il router si
// costruiscono da qui: per aggiungere la Direzione Lavori basterà registrare
// nuovi moduli con ruolo 'dl', senza toccare quelli del CSE.

export const RUOLI = Object.freeze({
  cse: { titolo: "Coordinatore per la sicurezza in fase di esecuzione" },
  dl: { titolo: 'Direzione lavori' }, // in futuro
});

const moduli = new Map();

/**
 * @param {object} m
 * @param {string} m.id        identificativo univoco (usato nell'indirizzo #/cantiere/<codice>/<id>)
 * @param {string} m.titolo    nome nel menu
 * @param {string} m.ruolo     chiave di RUOLI
 * @param {number} m.ordine    posizione nel menu
 * @param {string} [m.sezione] sezione dell'archivio (core/cartelle.js)
 * @param {(ctx: object) => Promise<HTMLElement|string>} m.disegna
 */
export function registra(m) {
  if (!m?.id || !m.titolo || !m.ruolo || typeof m.disegna !== 'function') {
    throw new Error(`Modulo non valido: ${m?.id}`);
  }
  if (!RUOLI[m.ruolo]) throw new Error(`Ruolo sconosciuto: ${m.ruolo}`);
  if (moduli.has(m.id)) throw new Error(`Modulo già registrato: ${m.id}`);
  moduli.set(m.id, { ordine: 100, ...m });
}

export function modulo(id) {
  return moduli.get(id) || null;
}

export function moduliDelRuolo(ruolo) {
  return [...moduli.values()].filter((m) => m.ruolo === ruolo).sort((a, b) => a.ordine - b.ordine);
}

/** Solo per i test. */
export function _svuota() {
  moduli.clear();
}
