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

/**
 * Check list di verifica del POS e dell'idoneità tecnico-professionale
 * (modello SISTEM): A contenuti minimi del POS, B idoneità tecnico-
 * professionale (All. XVII), C ulteriori adempimenti del Titolo IV.
 * la: richiesta anche ai lavoratori autonomi (All. XVII p. 2).
 * affidataria: voce che riguarda solo l'impresa affidataria.
 */
export const SEZIONI_CHECKLIST = {
  A: 'A — CONTENUTI MINIMI DEL POS (art. 89 c.1 lett. h e art. 96 c.1 lett. g; All. XV punto 3.2.1)',
  B: 'B — IDONEITÀ TECNICO-PROFESSIONALE (art. 90 c. 9; art. 97 c. 2; All. XVII) — LA = richiesto anche ai lavoratori autonomi (All. XVII p. 2)',
  C: 'C — ULTERIORI ADEMPIMENTI (Titolo IV)',
};

export const CHECKLIST_POS = [
  { codice: '1', sezione: 'A', testo: 'Nominativo del datore di lavoro, gli indirizzi ed i riferimenti telefonici della sede legale e degli uffici di cantiere', rif: 'All. XV p. 3.2.1 lett. a) n.1' },
  { codice: '2', sezione: 'A', testo: "Specifica attività e le singole lavorazioni svolte in cantiere dall'impresa esecutrice e dai lavoratori autonomi sub affidatari", rif: 'All. XV p. 3.2.1 lett. a) n.2' },
  { codice: '3', sezione: 'A', testo: 'Nominativi', rif: 'All. XV p. 3.2.1 lett. a) nn.3-6' },
  { codice: '3.a', sezione: 'A', sotto: true, testo: 'Direttore tecnico di cantiere', rif: 'All. XV p. 3.2.1 lett. a) n.6' },
  { codice: '3.b', sezione: 'A', sotto: true, testo: 'Capocantiere', rif: 'All. XV p. 3.2.1 lett. a) n.6' },
  { codice: '3.c', sezione: 'A', sotto: true, testo: 'Responsabile del servizio di prevenzione e protezione', rif: 'All. XV p. 3.2.1 lett. a) n.5' },
  { codice: '3.d', sezione: 'A', sotto: true, testo: 'Addetti al pronto soccorso', rif: 'All. XV p. 3.2.1 lett. a) n.3' },
  { codice: '3.e', sezione: 'A', sotto: true, testo: 'Addetti antincendio ed evacuazione dei lavoratori e, comunque, della gestione emergenze in cantiere', rif: 'All. XV p. 3.2.1 lett. a) n.3' },
  { codice: '3.f', sezione: 'A', sotto: true, testo: 'Del rappresentante dei lavoratori per la sicurezza, aziendale o territoriale, ove eletto o designato', rif: 'All. XV p. 3.2.1 lett. a) n.3' },
  { codice: '3.g', sezione: 'A', sotto: true, testo: 'Del medico competente, ove previsto', rif: 'All. XV p. 3.2.1 lett. a) n.4' },
  { codice: '3.h', sezione: 'A', sotto: true, testo: 'Del/dei preposto/i per l’attività svolta in cantiere (da indicare espressamente al committente)', rif: 'art. 26 c. 8-bis D.Lgs 81/08 (L. 215/2021); Interpello n. 4/2024' },
  { codice: '4', sezione: 'A', testo: "Numero e le relative qualifiche dei lavoratori dipendenti dell'impresa esecutrice e dei lavoratori autonomi operanti in cantiere per conto della stessa impresa", rif: 'All. XV p. 3.2.1 lett. a) n.7' },
  { codice: '5', sezione: 'A', testo: "Specifiche mansioni, inerenti la sicurezza, svolte in cantiere da ogni figura nominata allo scopo dall'impresa esecutrice", rif: 'All. XV p. 3.2.1 lett. b)' },
  { codice: '6', sezione: 'A', testo: "Descrizione dell'attività di cantiere, delle modalità organizzative e dei turni di lavoro", rif: 'All. XV p. 3.2.1 lett. c)' },
  { codice: '7', sezione: 'A', testo: 'Elenco dei ponteggi, dei ponti su ruote a torre e di altre opere provvisionali di notevole importanza, delle macchine e degli impianti utilizzati nel cantiere', rif: 'All. XV p. 3.2.1 lett. d)' },
  { codice: '8', sezione: 'A', testo: 'Elenco delle sostanze e preparati pericolosi utilizzati nel cantiere con le relative schede di sicurezza', rif: 'All. XV p. 3.2.1 lett. e)' },
  { codice: '9', sezione: 'A', testo: 'Esito del rapporto di valutazione del rumore', rif: 'All. XV p. 3.2.1 lett. f); artt. 190-192' },
  { codice: '10', sezione: 'A', testo: 'Individuazione delle misure preventive e protettive, integrative rispetto a quelle contenute nel PSC quando previsto, adottate in relazione ai rischi connessi alle proprie lavorazioni in cantiere', rif: 'All. XV p. 3.2.1 lett. g)' },
  { codice: '11', sezione: 'A', testo: 'Procedure complementari e di dettaglio, richieste dal PSC quando previsto', rif: 'All. XV p. 3.2.1 lett. h)' },
  { codice: '12', sezione: 'A', testo: 'Elenco dei dispositivi di protezione individuale forniti ai lavoratori occupati in cantiere con documento di consegna al lavoratore sottoscritto', rif: 'All. XV p. 3.2.1 lett. i)' },
  { codice: '13', sezione: 'A', testo: "Documentazione in merito all'informazione ed alla formazione fornite ai lavoratori occupati in cantiere", rif: 'All. XV p. 3.2.1 lett. l); artt. 36-37; Accordo Stato-Regioni 17/04/2025' },
  { codice: '14', sezione: 'A', testo: 'Abilitazioni degli operatori per le attrezzature che richiedono specifica abilitazione (es. macchine movimento terra, gru, PLE, trattori, carrelli)', rif: 'art. 73 c. 5; Accordo Stato-Regioni 17/04/2025' },
  { codice: '15', sezione: 'A', testo: 'Addestramento all’uso dei DPI di III categoria e dei DPI otoprotettori (es. anticaduta)', rif: 'art. 77 c. 5' },
  { codice: '16', sezione: 'A', testo: "Valutazione dei rischi per le singole fasi di lavorazione in relazione alla probabilità di accadimento di un evento per la gravità del danno", rif: '' },
  { codice: '17', sezione: 'B', la: true, testo: 'Iscrizione alla camera di commercio, industria ed artigianato con oggetto sociale inerente alla tipologia dell’appalto', rif: 'All. XVII p. 1 lett. a) e p. 2 lett. a)' },
  { codice: '18', sezione: 'B', testo: 'Documento di valutazione dei rischi (anche redatto secondo le procedure standardizzate)', rif: 'All. XVII p. 1 lett. b); art. 17 c.1 lett. a); art. 29 cc. 5-6 — l’autocertificazione non è più ammessa dal 31/05/2013' },
  { codice: '19', sezione: 'B', la: true, testo: 'DURC documento unico di regolarità contributiva', rif: 'All. XVII p. 1 lett. c) e p. 2 lett. e); art. 90 c. 9' },
  { codice: '20', sezione: 'B', testo: 'Dichiarazione di non essere oggetto di provvedimenti di sospensione o interdittivi di cui all’art. 14 del D.lgs. n. 81/2008 seguita da copia del documento di identità del datore di lavoro, in corso di validità', rif: 'All. XVII p. 1 lett. d); art. 38 DPR 445/2000 (copia documento)' },
  { codice: '21', sezione: 'B', la: true, testo: 'Patente a crediti in corso di validità (o attestazione SOA in classifica pari o superiore alla III)', rif: 'art. 27 D.Lgs 81/08 come modificato da D.L. 19/2024 e D.L. 159/2025' },
  { codice: '22', sezione: 'B', testo: 'Dichiarazione dell’organico medio annuo distinto per qualifica, estremi delle denunce INPS, INAIL e Cassa Edile, contratto collettivo applicato', rif: 'art. 90 c. 9 lett. b)' },
  { codice: '23', sezione: 'B', la: true, testo: 'Fotocopia delle dichiarazioni di conformità CE delle macchine ed attrezzature', rif: 'All. XVII p. 2 lett. b)' },
  { codice: '24', sezione: 'B', testo: 'Ponteggi: copia dell’autorizzazione ministeriale e PiMUS (se presenti ponteggi)', rif: '' },
  { codice: '25', sezione: 'B', la: true, testo: 'Copia dei certificati di idoneità medico-sanitaria in riferimento alla mansione', rif: '' },
  { codice: '26', sezione: 'C', affidataria: true, testo: 'Impresa affidataria: nominativo del soggetto incaricato dell’assolvimento dei compiti di cui all’art. 97 e relative mansioni', rif: 'All. XVII p. 01; art. 97' },
  { codice: '27', sezione: 'C', affidataria: true, testo: 'Impresa affidataria: attestati di formazione del datore di lavoro, dei dirigenti e dei preposti per i compiti di cui all’art. 97', rif: 'art. 97 c. 3-ter' },
  { codice: '28', sezione: 'C', affidataria: true, testo: 'Impresa affidataria: verifica di congruenza dei POS delle imprese esecutrici/subappaltatrici rispetto al proprio prima della trasmissione al CSE', rif: 'art. 97 c. 3 lett. b); art. 101 c. 3' },
  { codice: '29', sezione: 'C', testo: 'Consultazione del RLS prima dell’accettazione del PSC e delle sue modifiche significative', rif: 'art. 102; art. 100 c. 4' },
  { codice: '30', sezione: 'C', la: true, testo: 'Tessera di riconoscimento con fotografia, generalità del lavoratore, indicazione del datore di lavoro e data di assunzione (per autonomi: generalità e committente)', rif: 'art. 18 c. 1 lett. u); art. 26 c. 8; art. 21 c. 1 lett. c); badge di cantiere con codice anticontraffazione (D.L. 159/2025, art. 3) operativo dopo il decreto attuativo' },
];

/** Esiti di una voce della check list (colonne SI / NO / NON PREVISTO). */
export const ESITI_CHECKLIST = { si: 'Sì', no: 'No', np: 'Non previsto' };

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
