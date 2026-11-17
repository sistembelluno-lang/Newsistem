// Modelli dei dati: come è fatta ogni registrazione e come se ne crea una nuova.
//
// Ogni oggetto salvato porta `tipo` e `versione` dello schema, così i file
// scritti da una versione vecchia del programma si possono aggiornare
// (vedi `aggiorna`). I campi delle schede sono descritti anche come elenco
// (CAMPI_*): la grafica costruirà i moduli da qui, senza ripeterli.

import { nuovoId } from './id.js';
import { isoLocale, oggi } from './date.js';

export const VERSIONE_SCHEMA = 1;

function base(tipo, campi = {}) {
  const adesso = isoLocale();
  return { tipo, versione: VERSIONE_SCHEMA, id: nuovoId(), creato: adesso, modificato: adesso, ...campi };
}

// ---------------------------------------------------------------- cantiere
/**
 * Anagrafica di cantiere: i contenuti della notifica preliminare (art. 99 e
 * Allegato XII del D.Lgs 81/08) più i dati che servono al CSE.
 */
export const CAMPI_ANAGRAFICA = [
  { chiave: 'codice', etichetta: 'Codice cantiere', tipo: 'testo', obbligatorio: true, gruppo: 'opera' },
  { chiave: 'denominazione', etichetta: "Denominazione dell'opera", tipo: 'testo', obbligatorio: true, gruppo: 'opera' },
  { chiave: 'indirizzo', etichetta: 'Indirizzo del cantiere', tipo: 'testo', rif: 'All. XII p. 2', gruppo: 'opera' },
  { chiave: 'comune', etichetta: 'Comune', tipo: 'testo', gruppo: 'opera' },
  { chiave: 'naturaOpera', etichetta: "Natura dell'opera", tipo: 'testo_lungo', rif: 'All. XII p. 4', gruppo: 'opera' },
  { chiave: 'committenti', etichetta: 'Committente/i (nome e indirizzo)', tipo: 'persone', etichettaSingola: 'Committente', rif: 'All. XII p. 3', gruppo: 'soggetti' },
  { chiave: 'responsabileLavoriNonNominato', etichetta: 'Responsabile dei lavori non nominato', tipo: 'spunta', largo: true, gruppo: 'soggetti' },
  { chiave: 'responsabileLavori', etichetta: 'Responsabile dei lavori', tipo: 'persona', rif: 'All. XII p. 5', gruppo: 'soggetti' },
  { chiave: 'csp', etichetta: 'Coordinatore per la progettazione (CSP)', tipo: 'persona', rif: 'All. XII p. 6', gruppo: 'soggetti' },
  { chiave: 'cse', etichetta: "Coordinatore per l'esecuzione (CSE)", tipo: 'persona', rif: 'All. XII p. 7', gruppo: 'soggetti' },
  { chiave: 'direttoreLavori', etichetta: 'Direttore dei lavori', tipo: 'persona', gruppo: 'soggetti' },
  { chiave: 'dataNotifica', etichetta: 'Data della notifica preliminare', tipo: 'data', rif: 'All. XII p. 1', gruppo: 'tempi' },
  { chiave: 'inizioLavori', etichetta: 'Data presunta di inizio lavori', tipo: 'data', rif: 'All. XII p. 8', gruppo: 'tempi' },
  { chiave: 'durataGiorni', etichetta: 'Durata presunta dei lavori (giorni)', tipo: 'numero', rif: 'All. XII p. 9', gruppo: 'tempi' },
  { chiave: 'maxLavoratori', etichetta: 'Numero massimo presunto di lavoratori', tipo: 'numero', rif: 'All. XII p. 10', gruppo: 'tempi' },
  { chiave: 'numeroImprese', etichetta: 'Numero previsto di imprese e lavoratori autonomi', tipo: 'numero', rif: 'All. XII p. 11', gruppo: 'tempi' },
  { chiave: 'importoLavori', etichetta: 'Ammontare complessivo presunto dei lavori (€)', tipo: 'importo', rif: 'All. XII p. 13', gruppo: 'tempi' },
  { chiave: 'titoloEdilizio', etichetta: 'Titolo abilitativo (permesso, SCIA, ...)', tipo: 'testo', gruppo: 'opera' },
  { chiave: 'note', etichetta: 'Note', tipo: 'testo_lungo', gruppo: 'note' },
];

/** Gruppi dell'anagrafica, nell'ordine in cui si mostrano. */
export const GRUPPI_ANAGRAFICA = {
  opera: "L'opera",
  soggetti: 'Soggetti (committente, responsabile dei lavori, coordinatori, DL)',
  tempi: 'Notifica, tempi e importi',
  note: 'Note',
};

export function nuovaPersona(campi = {}) {
  return { nome: '', qualifica: '', indirizzo: '', telefono: '', email: '', pec: '', codiceFiscale: '', ...campi };
}

export function nuovoCantiere(campi = {}) {
  const c = base('cantiere', {
    codice: '',
    denominazione: '',
    indirizzo: '',
    comune: '',
    naturaOpera: '',
    committenti: [],
    responsabileLavori: nuovaPersona(),
    responsabileLavoriNonNominato: false,
    csp: nuovaPersona(),
    cse: nuovaPersona(),
    direttoreLavori: nuovaPersona(),
    dataNotifica: '',
    inizioLavori: '',
    durataGiorni: null,
    maxLavoratori: null,
    numeroImprese: null,
    importoLavori: null,
    titoloEdilizio: '',
    stato: 'in_corso', // in_corso | sospeso | concluso
    note: '',
  });
  return { ...c, ...campi };
}

// ---------------------------------------------------------------- documenti
/** Scheda di un documento caricato (progetto, PSC, notifica, POS, ...). */
export function nuovoDocumento(campi = {}) {
  return base('documento', {
    sezione: '',        // progetto | psc | notifica | ricevuti
    categoria: '',      // documenti ricevuti: verbale tra imprese, disegno, comunicazione, ...
    firmatari: [],      // file firmati (.p7m): chi ha firmato
    titolo: '',
    file: '',           // nome del file nella cartella della sezione
    revisione: '0',
    data: oggi(),
    autore: '',
    note: '',
    ...campi,
  });
}

// ---------------------------------------------------------------- imprese
/** Impresa esecutrice o lavoratore autonomo (dati del POS, All. XV 3.2.1 lett. a). */
export function nuovaImpresa(campi = {}) {
  return base('impresa', {
    ragioneSociale: '',
    tipoSoggetto: 'impresa', // impresa | lavoratore_autonomo
    ruolo: 'esecutrice',     // affidataria | esecutrice | subappaltatrice
    affidataria: '',         // id dell'impresa affidataria, per le subappaltatrici
    partitaIva: '',
    codiceFiscale: '',
    sede: '',
    telefono: '',
    email: '',
    pec: '',
    datoreLavoro: '',
    rspp: '',
    medicoCompetente: '',
    rls: '',
    direttoreTecnico: '',
    capocantiere: '',
    lavorazioni: '',
    ingresso: '',   // data di ingresso in cantiere
    uscita: '',
    note: '',
    ...campi,
  });
}

/** POS di un'impresa (una revisione = una scheda). */
export function nuovoPos(campi = {}) {
  return base('pos', {
    impresa: '',      // id dell'impresa
    revisione: '0',
    dataPos: '',      // data del documento
    dataRicezione: oggi(),
    file: '',         // primo elaborato (per aprire il POS con un clic)
    // il POS può essere composto da più elaborati: [{ file: 'POS rev 1/Relazione.pdf', titolo }]
    // (file relativi alla cartella POS; quelli copiati a mano in «POS rev N» si trovano da soli)
    elaborati: [],
    // documenti arrivati con il POS o dopo (attestati, DURC, visura, ...):
    // [{ file: 'Allegati rev 0/attestati.pdf', titolo, data }] (file relativo alla cartella POS)
    allegati: [],
    stato: 'da_verificare', // da_verificare | idoneo | idoneo_con_prescrizioni | non_idoneo
    note: '',
    ...campi,
  });
}

/**
 * Verifica di idoneità del POS da parte del CSE (art. 92 c. 1 lett. b) e
 * dell'idoneità tecnico-professionale (All. XVII), con la check list SISTEM
 * (lista 'v2', normativa.js CHECKLIST_POS) e la lettera all'impresa.
 */
export function nuovaVerificaPos(campi = {}) {
  return base('verifica_pos', {
    impresa: '',
    pos: '',            // id del POS verificato
    data: oggi(),
    lista: 'v2',
    voci: [],           // [{ codice, esito: 'si'|'no'|'np'|'', note, nascosta }]
    documentazione: '', // documenti esaminati, come compare in testa alla check list
    idoneitaTP: '',     // si | no: idoneità tecnico-professionale (All. XVII)
    esito: '',          // idoneo | idoneo_con_prescrizioni | non_idoneo
    motivo: '',         // perché il POS non è idoneo
    daIntegrare: '',    // in breve, sotto l'esito della check list
    adeguati: [],       // aspetti risultati adeguati (lettera)
    integrazioni: [],   // [{ titolo, testo }]: allegato della check list e lettera
    lettera: {          // lettera di trasmissione / richiesta integrazioni
      mittente: '', destinatari: '', epc: '', oggetto: '', esitoTesto: '', termini: '', luogo: '',
    },
    prescrizioni: '',   // (verifiche della versione 0.3)
    trasmessaIl: '',    // data di trasmissione dell'esito all'impresa
    esterna: false,     // verifica fatta fuori dal programma (es. da un altro tecnico): conta l'esito
    fileEsterno: '',    // il documento della verifica esterna (percorso nella cartella dei dati)
    ai: null,           // { modello, data, documenti: [...] } se compilata con Claude
    note: '',
    ...campi,
  });
}

// ---------------------------------------------------------------- giornale
/** Voce del giornale dei lavori del CSE (una per giorno di presenza). */
export function nuovaVoceGiornale(campi = {}) {
  return base('voce_giornale', {
    data: oggi(),
    oraArrivo: '',
    oraPartenza: '',
    meteo: '',
    imprese: [],        // [{ impresa: id, addetti: n, lavorazioni: '' }]
    lavorazioni: '',
    osservazioni: '',
    disposizioni: '',
    foto: [],           // id delle foto collegate
    verbale: '',        // id del verbale redatto quel giorno, se c'è
    ...campi,
  });
}

// ---------------------------------------------------------------- foto
/** Scheda di una foto del registro fotografico. */
export function nuovaFoto(campi = {}) {
  return base('foto', {
    scattata: '',       // data di scatto (EXIF), ISO locale
    fonteData: '',      // exif | file | manuale
    originale: '',      // nome del file in originali/
    timbrata: '',       // nome del file in timbrate/
    didascalia: '',
    luogo: '',
    nascondiData: false, // true: nel registro e nei verbali si usa la foto senza la data stampata
    imprese: [],
    larghezza: null,
    altezza: null,
    ...campi,
  });
}

// ---------------------------------------------------------------- verbali
/** Verbale di sopralluogo del CSE (art. 92 D.Lgs 81/08). */
export function nuovoVerbale(campi = {}) {
  return base('verbale', {
    numero: null,           // progressivo per cantiere
    data: oggi(),
    oraInizio: '',
    oraFine: '',
    presenti: [],           // [{ nome, qualifica, impresa }]
    sopralluogo: true,      // tipo di verbale: sopralluogo (art. 92 c. 1 lett. a), coordinamento (lett. c) o entrambi
    coordinamento: false,
    argomentiCoordinamento: '', // riunione di coordinamento: argomenti trattati, accordi, sfasamenti
    destinatari: '',        // a chi si invia il verbale (uno per riga), in alto a sinistra nella stampa
    impresePresenti: [],    // id delle imprese in cantiere
    lavorazioniInCorso: '',
    verifiche: [],          // [{ codice, esito: 'conforme'|'non_conforme'|'da_adeguare'|'', note, nascosta }] (le nascoste non si stampano)
    nonConformita: [],      // [{ descrizione, impresa, gravita: 'lieve'|'grave'|'pericolo_grave_imminente', foto: [] }]
    prescrizioni: [],       // [{ descrizione, impresa, entro: data }]
    sospensione: null,      // { lavorazioni, motivo, dal } (art. 92 c. 1 lett. f)
    segnalazioneCommittente: false, // art. 92 c. 1 lett. e
    foto: [],               // id delle foto del registro da allegare al verbale
    documenti: [],          // documenti allegati al verbale: [{ sezione, file }] (anteprima della prima pagina nella stampa)
    note: '',
    chiuso: false,          // un verbale chiuso (firmato) non si modifica più
    ...campi,
  });
}

// ---------------------------------------------------------------- versioni
/** Porta un oggetto letto da disco alla versione attuale dello schema. */
export function aggiorna(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const v = obj.versione || 0;
  if (v > VERSIONE_SCHEMA) {
    throw new Error(`Il file è stato scritto da una versione più recente del programma (schema ${v}).`);
  }
  // migrazioni future: if (v < 2) { ...; obj.versione = 2; }
  return { ...obj, versione: VERSIONE_SCHEMA };
}

/** Controlli minimi prima di salvare; restituisce l'elenco dei problemi. */
export function controlla(obj) {
  const errori = [];
  if (!obj?.tipo) errori.push('Tipo mancante');
  if (obj?.tipo === 'cantiere') {
    for (const c of CAMPI_ANAGRAFICA.filter((c) => c.obbligatorio)) {
      if (!String(obj[c.chiave] ?? '').trim()) errori.push(`${c.etichetta}: obbligatorio`);
    }
  }
  if (obj?.tipo === 'impresa' && !String(obj.ragioneSociale || '').trim()) errori.push('Ragione sociale: obbligatoria');
  if (obj?.tipo === 'verbale' && obj.chiuso && !obj.numero) errori.push('Un verbale chiuso deve avere un numero');
  return errori;
}
