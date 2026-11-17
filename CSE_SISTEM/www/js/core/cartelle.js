// Struttura delle cartelle di un cantiere su disco.
//
// Ogni cantiere è una cartella leggibile anche senza il programma (come un
// fascicolo cartaceo): i file caricati stanno nelle sottocartelle numerate, i
// dati (anagrafica, voci del giornale, verifiche, verbali, schede delle foto)
// in file JSON, uno per registrazione, così due dispositivi che lavorano sullo
// stesso cantiere non si sovrascrivono a vicenda.
//
//   CSE_SISTEM/
//     <codice cantiere>/
//       cantiere.json                 anagrafica e figure del cantiere
//       01_Progetto/                  elaborati di progetto
//       02_PSC/                       piano di sicurezza e coordinamento (e aggiornamenti)
//       03_Notifica_preliminare/      notifica (art. 99) e aggiornamenti
//       04_Imprese_e_POS/
//         <impresa>/impresa.json      anagrafica impresa
//         <impresa>/POS/              POS e revisioni (file + scheda .json)
//         <impresa>/Verifica POS_<data>/  check list e lettera in PDF, verifiche esterne
//       05_Verifiche_POS/             verifiche di idoneità del CSE (.json)
//       06_Giornale_lavori/           una voce per giorno (.json)
//       07_Registro_fotografico/
//         originali/                  foto come scattate
//         timbrate/                   copie con la data di scatto in basso a destra
//         schede/                     dati di ogni foto (.json)
//       08_Verbali_sopralluogo/       verbali (.json)
//         Verbali PDF/                verbali stampati

export const RADICE = 'CSE_SISTEM';

/** Logo dello studio per le stampe (comune a tutti i cantieri, sincronizzato con la cartella). */
export const FILE_LOGO = `${RADICE}/logo.png`;

export const SEZIONI = Object.freeze({
  progetto: { cartella: '01_Progetto', titolo: 'Progetto' },
  psc: { cartella: '02_PSC', titolo: 'Piano di sicurezza e coordinamento (PSC)' },
  notifica: { cartella: '03_Notifica_preliminare', titolo: 'Notifica preliminare' },
  imprese: { cartella: '04_Imprese_e_POS', titolo: 'Imprese e POS' },
  verifichePos: { cartella: '05_Verifiche_POS', titolo: 'Verifiche dei POS' },
  giornale: { cartella: '06_Giornale_lavori', titolo: 'Giornale dei lavori' },
  foto: { cartella: '07_Registro_fotografico', titolo: 'Registro fotografico' },
  verbali: { cartella: '08_Verbali_sopralluogo', titolo: 'Verbali di sopralluogo e coordinamento' },
});

/** Sezioni che sono semplici raccolte di documenti caricati (con scheda). */
export const SEZIONI_DOCUMENTI = ['progetto', 'psc', 'notifica'];

/** Nome di file/cartella sicuro su Windows e Android. */
export function nomeSicuro(testo, ripiego = 'senza_nome') {
  const s = String(testo ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // via gli accenti
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  return (s || ripiego).slice(0, 80);
}

export function percorso(...parti) {
  return parti.filter((p) => p !== undefined && p !== null && p !== '').join('/');
}

export function cartellaCantiere(codice) {
  return percorso(RADICE, nomeSicuro(codice));
}

export function cartellaSezione(codice, sezione) {
  const s = SEZIONI[sezione];
  if (!s) throw new Error(`Sezione sconosciuta: ${sezione}`);
  return percorso(cartellaCantiere(codice), s.cartella);
}

export function cartellaImpresa(codice, nomeImpresa) {
  return percorso(cartellaSezione(codice, 'imprese'), nomeSicuro(nomeImpresa));
}

/** Tutte le cartelle da creare per un cantiere nuovo. */
export function cartelleIniziali(codice) {
  const base = cartellaCantiere(codice);
  const foto = cartellaSezione(codice, 'foto');
  return [
    base,
    ...Object.keys(SEZIONI).map((s) => cartellaSezione(codice, s)),
    percorso(foto, 'originali'),
    percorso(foto, 'timbrate'),
    percorso(foto, 'schede'),
  ];
}
