// Disco su Windows (Electron): le operazioni passano dal processo principale
// tramite window.cseNative (electron/preload.cjs). La cartella dei dati è
// Documenti\CSE_SISTEM, oppure quella scelta nelle impostazioni (anche una
// cartella condivisa sul server o sincronizzata con il cloud).

export function discoElectron(nativo = globalThis.cseNative) {
  if (!nativo) throw new Error('Ponte Electron non disponibile');
  return {
    nome: 'windows',
    esiste: (p) => nativo.esiste(p),
    creaCartella: (p) => nativo.creaCartella(p),
    scriviByte: (p, byte) => nativo.scriviByte(p, byte),
    leggiByte: async (p) => new Uint8Array(await nativo.leggiByte(p)),
    scriviTesto: (p, t) => nativo.scriviTesto(p, t),
    leggiTesto: (p) => nativo.leggiTesto(p),
    elenca: (p) => nativo.elenca(p),
    elimina: (p) => nativo.elimina(p),
    apri: (p) => nativo.apri(p),
  };
}

/** Altre funzioni del sistema su Windows. */
export function serviziElectron(nativo = globalThis.cseNative) {
  return {
    /** Fa scegliere uno o più file dal PC: [{ nome, byte, modificato }]. */
    scegliFile: (filtri) => nativo.scegliFile(filtri),
    /** Salva un PDF dall'HTML (stampa del verbale, della verifica, ...). */
    pdfDaHtml: (html, percorsoPdf) => nativo.pdfDaHtml(html, percorsoPdf),
    cartellaDati: () => nativo.cartellaDati(),
    scegliCartellaDati: () => nativo.scegliCartellaDati(),
    /** Cartelle di Google Drive per desktop trovate sul PC. */
    cartelleGoogleDrive: () => nativo.cartelleGoogleDrive(),
    usaCartellaDati: (p) => nativo.usaCartellaDati(p),
  };
}
