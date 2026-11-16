// Riferimenti del D.Lgs 81/2008 usati dal programma.
// Testi riassunti per le liste di controllo: il riferimento resta la norma
// vigente (da tenere aggiornato se cambia).

/** Art. 92 c. 1: obblighi del coordinatore per l'esecuzione dei lavori. */
export const OBBLIGHI_CSE = [
  { codice: '92.1.a', testo: "Verifica, con opportune azioni di coordinamento e controllo, dell'applicazione da parte delle imprese e dei lavoratori autonomi delle disposizioni del PSC e delle procedure di lavoro" },
  { codice: '92.1.b', testo: "Verifica dell'idoneità dei POS, assicurandone la coerenza con il PSC; adeguamento del PSC e del fascicolo dell'opera all'evoluzione dei lavori e alle modifiche intervenute" },
  { codice: '92.1.c', testo: 'Organizzazione tra i datori di lavoro, compresi i lavoratori autonomi, della cooperazione, del coordinamento delle attività e della reciproca informazione' },
  { codice: '92.1.d', testo: 'Verifica dell’attuazione di quanto previsto negli accordi tra le parti sociali per il coordinamento tra i RLS' },
  { codice: '92.1.e', testo: 'Segnalazione al committente o al responsabile dei lavori delle inosservanze (artt. 94, 95, 96, 97 c. 1 e PSC) con proposta di sospensione, allontanamento o risoluzione del contratto' },
  { codice: '92.1.f', testo: 'Sospensione, in caso di pericolo grave e imminente direttamente riscontrato, delle singole lavorazioni fino alla verifica degli avvenuti adeguamenti' },
];

/** Allegato XV punto 3.2.1: contenuti minimi del POS. */
export const CONTENUTI_POS = [
  { codice: 'a.1', lettera: 'a', testo: 'Nominativo del datore di lavoro, indirizzi e riferimenti telefonici della sede legale e degli uffici di cantiere' },
  { codice: 'a.2', lettera: 'a', testo: 'Specifica attività e singole lavorazioni svolte in cantiere dall’impresa e dai lavoratori autonomi subaffidatari' },
  { codice: 'a.3', lettera: 'a', testo: 'Nominativi degli addetti al pronto soccorso, antincendio ed evacuazione e alla gestione delle emergenze; RLS aziendale o territoriale' },
  { codice: 'a.4', lettera: 'a', testo: 'Nominativo del medico competente, ove previsto' },
  { codice: 'a.5', lettera: 'a', testo: 'Nominativo del responsabile del servizio di prevenzione e protezione (RSPP)' },
  { codice: 'a.6', lettera: 'a', testo: 'Nominativi del direttore tecnico di cantiere e del capocantiere' },
  { codice: 'a.7', lettera: 'a', testo: 'Numero e qualifiche dei lavoratori dipendenti e dei lavoratori autonomi operanti in cantiere per conto dell’impresa' },
  { codice: 'b', lettera: 'b', testo: 'Specifiche mansioni inerenti la sicurezza svolte in cantiere da ogni figura nominata allo scopo' },
  { codice: 'c', lettera: 'c', testo: 'Descrizione dell’attività di cantiere, delle modalità organizzative e dei turni di lavoro' },
  { codice: 'd', lettera: 'd', testo: 'Elenco dei ponteggi, ponti su ruote a torre e altre opere provvisionali di notevole importanza, delle macchine e degli impianti utilizzati' },
  { codice: 'e', lettera: 'e', testo: 'Elenco delle sostanze e miscele pericolose utilizzate, con le relative schede di sicurezza' },
  { codice: 'f', lettera: 'f', testo: 'Esito del rapporto di valutazione del rumore' },
  { codice: 'g', lettera: 'g', testo: 'Misure preventive e protettive, integrative rispetto a quelle del PSC, adottate per i rischi delle proprie lavorazioni' },
  { codice: 'h', lettera: 'h', testo: 'Procedure complementari e di dettaglio richieste dal PSC' },
  { codice: 'i', lettera: 'i', testo: 'Elenco dei dispositivi di protezione individuale forniti ai lavoratori' },
  { codice: 'l', lettera: 'l', testo: 'Documentazione sull’informazione e la formazione fornite ai lavoratori' },
];

/** Controlli tipici del sopralluogo (voci del verbale), modificabili dall’utente. */
export const CONTROLLI_SOPRALLUOGO = [
  { codice: 'S01', gruppo: 'Organizzazione', testo: 'Recinzione, accessi e segnaletica di cantiere' },
  { codice: 'S02', gruppo: 'Organizzazione', testo: 'Cartello di cantiere e copia della notifica preliminare affissa (art. 99 c. 2)' },
  { codice: 'S03', gruppo: 'Organizzazione', testo: 'Viabilità, aree di stoccaggio e di lavorazione' },
  { codice: 'S04', gruppo: 'Organizzazione', testo: 'Servizi igienico-assistenziali' },
  { codice: 'S05', gruppo: 'Cadute dall’alto', testo: 'Ponteggi: montaggio conforme a PiMUS, ancoraggi, parapetti, tavole fermapiede' },
  { codice: 'S06', gruppo: 'Cadute dall’alto', testo: 'Protezione di aperture, vani scala, bordi di solaio e scavi' },
  { codice: 'S07', gruppo: 'Cadute dall’alto', testo: 'Lavori in quota: linee vita, DPI anticaduta, trabattelli' },
  { codice: 'S08', gruppo: 'Macchine e impianti', testo: 'Impianto elettrico di cantiere e quadri' },
  { codice: 'S09', gruppo: 'Macchine e impianti', testo: 'Apparecchi di sollevamento (gru, autogru): verifiche e area di manovra' },
  { codice: 'S10', gruppo: 'Macchine e impianti', testo: 'Macchine e attrezzature: protezioni e marcatura CE' },
  { codice: 'S11', gruppo: 'Lavoratori', testo: 'Uso dei DPI (casco, calzature, guanti, otoprotettori, ...)' },
  { codice: 'S12', gruppo: 'Lavoratori', testo: 'Tessera di riconoscimento dei lavoratori (art. 18 c. 1 lett. u)' },
  { codice: 'S13', gruppo: 'Lavoratori', testo: 'Presenza in cantiere solo di imprese e lavoratori autonomi con POS verificato' },
  { codice: 'S14', gruppo: 'Coordinamento', testo: 'Interferenze tra lavorazioni e sfasamenti come da PSC / cronoprogramma' },
  { codice: 'S15', gruppo: 'Coordinamento', testo: 'Gestione delle emergenze: presidi, addetti, numeri utili' },
];

export const ESITI_VERIFICA_POS = {
  idoneo: 'Idoneo',
  idoneo_con_prescrizioni: 'Idoneo con prescrizioni',
  non_idoneo: 'Non idoneo',
};

export const ESITI_VOCE_POS = { si: 'Presente', parziale: 'Incompleto', no: 'Mancante', nd: 'Non pertinente' };
export const ESITI_CONTROLLO = { conforme: 'Conforme', non_conforme: 'Non conforme', nv: 'Non verificato' };
