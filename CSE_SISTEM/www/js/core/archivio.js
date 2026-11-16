// Archivio dei cantieri: tutte le letture e scritture passano da qui.
//
// L'archivio non sa su che dispositivo gira: usa un "disco" (vedi
// piattaforme/) che offre poche operazioni elementari sui percorsi relativi
// alla cartella dei dati:
//   leggiTesto(p) / scriviTesto(p, testo)
//   leggiByte(p)  / scriviByte(p, Uint8Array)
//   elenca(p) -> [{ nome, cartella: bool }]
//   esiste(p), creaCartella(p), elimina(p)
//   apri(p)     apre il file con il programma del sistema (PDF, DWG, ...)

import {
  RADICE, SEZIONI, cartelleIniziali, cartellaCantiere, cartellaSezione, cartellaImpresa, nomeSicuro, percorso,
} from './cartelle.js';
import { aggiorna, controlla } from './modelli.js';
import { isoLocale } from './date.js';

export class Archivio {
  /** @param {object} disco operazioni elementari della piattaforma */
  constructor(disco) {
    this.disco = disco;
  }

  // ------------------------------------------------------------ JSON
  async leggiJson(p) {
    if (!(await this.disco.esiste(p))) return null;
    return aggiorna(JSON.parse(await this.disco.leggiTesto(p)));
  }

  async scriviJson(p, obj) {
    const errori = controlla(obj);
    if (errori.length) throw new Error(errori.join('\n'));
    // i campi che iniziano con "_" servono solo in memoria (es. _file, _cartella)
    const dati = Object.fromEntries(Object.entries({ ...obj, modificato: isoLocale() }).filter(([k]) => !k.startsWith('_')));
    await this.disco.scriviTesto(p, JSON.stringify(dati, null, 2));
    return dati;
  }

  /** Tutti gli oggetti JSON di una cartella (non ricorsivo). */
  async leggiTutti(cartella) {
    if (!(await this.disco.esiste(cartella))) return [];
    const voci = await this.disco.elenca(cartella);
    const out = [];
    for (const v of voci) {
      if (!v.cartella && v.nome.endsWith('.json')) {
        const o = await this.leggiJson(percorso(cartella, v.nome));
        if (o) out.push({ ...o, _file: v.nome });
      }
    }
    return out;
  }

  // ------------------------------------------------------------ cantieri
  async elencoCantieri() {
    if (!(await this.disco.esiste(RADICE))) return [];
    const out = [];
    for (const v of await this.disco.elenca(RADICE)) {
      if (!v.cartella) continue;
      const c = await this.leggiJson(percorso(RADICE, v.nome, 'cantiere.json'));
      if (c) out.push(c);
    }
    return out.sort((a, b) => String(a.codice).localeCompare(String(b.codice)));
  }

  async leggiCantiere(codice) {
    return this.leggiJson(percorso(cartellaCantiere(codice), 'cantiere.json'));
  }

  /** Crea la cartella del cantiere con tutte le sezioni e salva l'anagrafica. */
  async creaCantiere(cantiere) {
    const base = cartellaCantiere(cantiere.codice);
    if (await this.disco.esiste(percorso(base, 'cantiere.json'))) {
      throw new Error(`Esiste già un cantiere con codice ${cantiere.codice}`);
    }
    for (const c of cartelleIniziali(cantiere.codice)) await this.disco.creaCartella(c);
    return this.scriviJson(percorso(base, 'cantiere.json'), cantiere);
  }

  async salvaCantiere(cantiere) {
    return this.scriviJson(percorso(cartellaCantiere(cantiere.codice), 'cantiere.json'), cantiere);
  }

  // ------------------------------------------------------------ registrazioni per sezione
  /** Salva una registrazione JSON (voce di giornale, verbale, verifica, ...) nella sua sezione. */
  async salvaRegistrazione(codice, sezione, obj, nomeFile = null) {
    const cart = obj.tipo === 'foto' ? percorso(cartellaSezione(codice, 'foto'), 'schede') : cartellaSezione(codice, sezione);
    await this.disco.creaCartella(cart);
    const nome = obj._file || nomeFile || `${obj.id}.json`;
    return { ...(await this.scriviJson(percorso(cart, nome), obj)), _file: nome };
  }

  async registrazioni(codice, sezione) {
    const cart = sezione === 'foto' ? percorso(cartellaSezione(codice, 'foto'), 'schede') : cartellaSezione(codice, sezione);
    return this.leggiTutti(cart);
  }

  /** Elimina una registrazione letta con registrazioni() (usa il suo nome di file). */
  async eliminaRegistrazione(codice, sezione, obj) {
    const cart = sezione === 'foto' ? percorso(cartellaSezione(codice, 'foto'), 'schede') : cartellaSezione(codice, sezione);
    await this.disco.elimina(percorso(cart, obj._file || `${obj.id}.json`));
  }

  // ------------------------------------------------------------ file caricati
  /**
   * Copia un file nella cartella indicata senza sovrascrivere: se il nome
   * esiste già aggiunge " (2)", " (3)", ... Restituisce il nome usato.
   */
  async salvaFile(cartella, nome, byte) {
    await this.disco.creaCartella(cartella);
    const punto = nome.lastIndexOf('.');
    const radice = nomeSicuro(punto > 0 ? nome.slice(0, punto) : nome);
    const est = punto > 0 ? nome.slice(punto).toLowerCase() : '';
    let finale = `${radice}${est}`;
    for (let k = 2; await this.disco.esiste(percorso(cartella, finale)); k++) finale = `${radice} (${k})${est}`;
    await this.disco.scriviByte(percorso(cartella, finale), byte);
    return finale;
  }

  // ------------------------------------------------------------ imprese
  async elencoImprese(codice) {
    const cart = cartellaSezione(codice, 'imprese');
    if (!(await this.disco.esiste(cart))) return [];
    const out = [];
    for (const v of await this.disco.elenca(cart)) {
      if (!v.cartella) continue;
      const imp = await this.leggiJson(percorso(cart, v.nome, 'impresa.json'));
      if (imp) out.push({ ...imp, _cartella: v.nome });
    }
    return out.sort((a, b) => String(a.ragioneSociale).localeCompare(String(b.ragioneSociale)));
  }

  async salvaImpresa(codice, impresa) {
    const cart = impresa._cartella ? percorso(cartellaSezione(codice, 'imprese'), impresa._cartella)
      : cartellaImpresa(codice, impresa.ragioneSociale);
    await this.disco.creaCartella(percorso(cart, 'POS'));
    const { _cartella, ...dati } = impresa;
    return this.scriviJson(percorso(cart, 'impresa.json'), dati);
  }

  cartellaPos(codice, impresa) {
    const cart = impresa._cartella ? percorso(cartellaSezione(codice, 'imprese'), impresa._cartella)
      : cartellaImpresa(codice, impresa.ragioneSociale);
    return percorso(cart, 'POS');
  }

  // ------------------------------------------------------------ varie
  async apri(p) {
    return this.disco.apri(p);
  }

  titoloSezione(sezione) {
    return SEZIONI[sezione]?.titolo || sezione;
  }
}
