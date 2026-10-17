// Modelli integrati. ambito: 'intestatario' (una lettera per ogni intestatario), 'ditta' (uno per ditta), 'pratica' (uno solo).
// I testi si possono modificare dal programma (scheda Documenti → Modifica modello): la versione modificata resta nella pratica.
(function (ES) {
  'use strict';
  const INTESTAZIONE_LETTERA = `Prot. n. ________	{{luogo}}, {{oggi}}
Trasmessa a mezzo {{dest.mezzo}}
**Ditta {{ditta.n}}**
>> {{dest.saluto}}
>> **{{dest.nome}}**
>> {{dest.via}}
>> {{dest.cittaCap}}
{{#dest.pec}}>> PEC: {{dest.pec}}
{{/dest.pec}}
`;
  const OGGETTO = `**Oggetto: {{pratica.oggetto}}{{#pratica.cup}} – CUP {{pratica.cup}}{{/pratica.cup}}**`;
  const CHIUSURA = `{{#dati.lettere}}{{dati.lettere}}
{{/dati.lettere}}Ringraziando per l'attenzione e rimanendo a disposizione per qualsiasi chiarimento, si porgono cordiali saluti.
[[firma {{ente.ruolo}}|{{ente.responsabile}}]]
Documento informatico sottoscritto con firma digitale ai sensi dell'art. 24 del D.Lgs. 82/2005 e ss.mm.ii.`;
  // Schema del piano particellare per la ditta: estratto con il numero di piano e un taglio per ogni particella
  const SCHEMA = `
[[salto]]
## Schema del piano particellare – Ditta n. {{ditta.n}}
[[planimetria scala=1000]]
[[tagli]]`;
  const PLANIMETRIA = `
[[salto]]
## Planimetria catastale con evidenziata l'area interessata
[[planimetria scala=1000]]`;


  // Decreto di esproprio sul modello dello studio (es. decreto n. 1/2026 del Comune di Sedico).
  // urgente = true: art. 22 (indennità determinata in via d'urgenza nel decreto); false: dopo art. 20 / 22-bis (indennità già determinata, pagata o depositata).
  function decreto(urgente) {
    const unita = (tipo, cosa, sup, map, s) => `{{#un${tipo}}}
**Unità negoziale n° {{un}} – {{np}}:** {{#parts}}{{catasto}} Comune di {{comuneU}} - Fg {{fg}} Mapp {{${map}}}, {{qual${s}}} di mq {{sup${s}}}, R.D. {{rd${s}}} – R.A. {{ra${s}}} con superficie di ${cosa} pari a mq {{${sup}}}; {{/parts}}di proprietà della ditta {{#intestatari}}{{anagrafica}} {{diritto}}{{^_ultimo}}; {{/_ultimo}}{{/intestatari}} e per una indennità di ${tipo === 'Espr' ? 'esproprio' : tipo === 'Serv' ? 'asservimento' : 'occupazione'} complessiva di {{ind${tipo}}} (diconsì euro {{ind${tipo}Lettere}})${urgente ? '' : '{{#statoInd}}, {{statoInd}}{{/statoInd}}'};
{{/un${tipo}}}`;
    return `## {{ente.nome}}{{#ente.provincia}} – Provincia di {{ente.provincia}}{{/ente.provincia}}
# DECRETO {{ente.ruoloDel}}
Numero Registro Generale ________	Data ____________
**OGGETTO: DECRETO DI ESPROPRIO RELATIVO AI LAVORI DI {{pratica.oggettoMaiuscolo}}{{#pratica.cup}}. CUP {{pratica.cup}}{{/pratica.cup}}.**
Rep. n. ________

## {{ente.ruoloMaiuscolo}}
**PREMESSO che:**
- {{#comunicazioni.avvio}}{{comunicazioni.avvio}}{{/comunicazioni.avvio}}{{^comunicazioni.avvio}}con {{atti.avvio16.testo}}{{/comunicazioni.avvio}} {{ente.nome}} ha provveduto a notificare alle ditte proprietarie risultanti dagli atti catastali l'avvio del procedimento previsto dal D.P.R. 327/2001 preordinato alle procedure espropriative delle aree interessate dai lavori indicati all'oggetto, con avviso ex art. 16 del D.P.R. 327/2001 e ss.mm.ii.;
**DATO ATTO che:**
- la dichiarazione di pubblica utilità dei lavori ha durata di anni cinque dall'approvazione del progetto avvenuta con {{atti.dpu.testo}}{{#dati.progetto}} ({{dati.progetto}}){{/dati.progetto}} e che pertanto il presente decreto è emanato tempestivamente ai sensi dell'art. 23, comma 1, lettera a) del D.P.R. 327/2001;
- {{#comunicazioni.com17}}{{comunicazioni.com17}}{{/comunicazioni.com17}}{{^comunicazioni.com17}}con {{atti.com17.testo}}{{/comunicazioni.com17}} {{ente.nome}} ha provveduto a notificare alle ditte proprietarie risultanti dagli atti catastali l'avviso ex art. 17 del D.P.R. 327/2001 e ss.mm.ii.;
- trattandosi di espropriazione per causa di pubblica utilità il presente provvedimento è esente dall'imposta di bollo ai sensi dell'art. 22 Tab. B del D.P.R. 642/1972;
{{#atti.frazionamento.estremi}}- visti i tipi di frazionamento delle aree interessate {{atti.frazionamento.testo}} regolarmente approvati dall'Agenzia delle Entrate – Ufficio provinciale – Territorio;
{{/atti.frazionamento.estremi}}{{#osservazioni.0}}- a seguito delle comunicazioni sono state accolte le osservazioni riguardanti:
{{/osservazioni.0}}{{#osservazioni}}Ditta {{n}} – {{testo}};
{{/osservazioni}}{{#dati.premesse}}{{dati.premesseElenco}}
{{/dati.premesse}}` + (urgente ? `- ai sensi dell'art. 22 TUES, il decreto di esproprio può essere emanato ed eseguito in base alla determinazione urgente dell'indennità di espropriazione, senza particolari indagini o formalità, sussistendo i presupposti di cui al medesimo art. 22 commi 1 e 2;
- nel caso di specie sussiste il presupposto per il ricorso alla procedura di urgenza di cui al citato art. 22 comma 1, rivestendo l'avvio dei lavori carattere di urgenza tale da non consentire l'applicazione delle disposizioni dell'art. 20, per cui il decreto di esproprio può essere emanato ed eseguito in base alla determinazione urgente dell'indennità di espropriazione, senza particolari indagini o formalità, per le ragioni di urgenza costituite da {{pratica.urgenza}};
` : `- l'indennità di espropriazione è stata determinata in via provvisoria e notificata alle ditte proprietarie ai sensi degli artt. 20 e 22-bis del D.P.R. 327/2001{{#atti.decreto22bis.estremi}} (decreto di occupazione d'urgenza {{atti.decreto22bis.testo}}){{/atti.decreto22bis.estremi}} e, per ciascuna ditta, è stata condivisa e corrisposta ovvero depositata presso il Ministero dell'Economia e delle Finanze – Ragioneria Territoriale dello Stato, come indicato nel dispositivo, ai sensi degli artt. 20 e 26 del medesimo D.P.R.;
`) + `**ATTESO che:**
- sono configurate le condizioni previste dal TUES per procedere alla conclusione – mediante il trasferimento del diritto – della vicenda ablatoria relativa all'opera e in ordine alle ditte in oggetto, e in particolare che riguardo i beni oggetto del presente provvedimento, ai sensi dell'art. 8 TUES:
a) {{#atti.vincolo.estremi}}con {{atti.vincolo.testo}} {{/atti.vincolo.estremi}}è stato apposto il vincolo preordinato all'esproprio di durata quinquennale, ai sensi dell'art. 9 del D.P.R. 327/2001, sulle aree interessate;
b) è stata dichiarata la pubblica utilità, il cui termine di durata è tuttora in corso;
c) ${urgente ? 'viene in questa sede determinata l\'indennità di esproprio;' : 'è stata determinata l\'indennità di esproprio, corrisposta o depositata come sotto indicato;'}
{{#dati.visti}}**VISTI:**
{{dati.vistiElenco}}
{{/dati.visti}}## DECRETA:
{{#haEspr}}- l'espropriazione a favore di **{{ente.beneficiario}}** con sede in {{ente.sedeBeneficiario}} - C.F. {{ente.cfBeneficiario}} dei beni immobili come dettagliatamente individuati nel presente decreto e quindi è disposto il passaggio a favore dello stesso del diritto di proprietà 1/1, sotto la condizione sospensiva che il presente decreto sia successivamente notificato ed eseguito mediante l'immissione in possesso:
Elenco unità negoziali:
${unita('Espr', 'esproprio', 'espr', 'mappaleEspr', 'E')}{{/haEspr}}{{#haServ}}- la costituzione di una servitù{{#dati.servitu}} {{dati.servitu}}{{/dati.servitu}} a favore di **{{ente.beneficiario}}** con sede in {{ente.sedeBeneficiario}} - C.F. {{ente.cfBeneficiario}} dei beni immobili come dettagliatamente individuati nel presente decreto, sotto la condizione sospensiva che il presente decreto sia successivamente notificato ed eseguito mediante l'immissione in possesso:
${unita('Serv', 'servitù', 'servTot', 'mappaleServ', 'S')}{{/haServ}}{{#haOcc}}- l'occupazione temporanea a favore di **{{ente.beneficiario}}** con sede in {{ente.sedeBeneficiario}} - C.F. {{ente.cfBeneficiario}} dei beni immobili come dettagliatamente individuati nel presente decreto, per la durata presunta di mesi {{mesiOcc}}, sotto la condizione sospensiva che il presente decreto sia successivamente notificato ed eseguito mediante l'immissione in possesso:
${unita('Occ', 'occupazione temporanea', 'occ', 'mappaleOcc', 'O')}{{/haOcc}}- si dà atto che l'indennità da corrispondere agli aventi diritto ${urgente ? 'a titolo provvisorio è stabilita in via d\'urgenza, ai sensi dell\'art. 22 del D.P.R. 327/2001,' : 'è stata determinata ai sensi degli artt. 20 e 22-bis del D.P.R. 327/2001 ed è'} {{#haEspr}}per l'esproprio dei beni immobili complessivamente pari ad euro {{tot.espr}}{{/haEspr}}{{#haServ}}, per la servitù dei beni immobili complessivamente pari ad euro {{tot.serv}}{{/haServ}}{{#haOcc}} e per l'occupazione temporanea dei beni immobili complessivamente pari ad euro {{tot.occ}}{{/haOcc}}, quindi per un totale pari ad euro **{{tot.tot}}** (diconsì euro {{tot.lettere}});
- il presente atto è registrato presso il competente ufficio dell'Agenzia delle Entrate e trascritto presso la Conservatoria dei Registri Immobiliari a cura e spese di {{ente.beneficiario}} e sarà trasmesso entro cinque giorni dalla sua emanazione per la pubblicazione sul {{ente.bur}} ai sensi dell'art. 23 del D.P.R. 327/2001;
- il presente provvedimento è altresì pubblicato all'Albo Pretorio di {{ente.nome}}.
## AUTORIZZA
i tecnici{{#ente.studio}} dello studio {{ente.studio}}{{#ente.sedeStudio}} con sede in {{ente.sedeStudio}}{{/ente.sedeStudio}} incaricato da {{ente.nome}}{{/ente.studio}}, muniti di valido documento di riconoscimento ed assieme al personale ausiliario che le operazioni comportano, ad occupare in modo congiunto o disgiunto le aree espropriate, asservite ed occupate sopra individuate, in esecuzione del presente decreto.
` + (urgente ? `## INVITA
gli espropriati, nei 30 (trenta) giorni successivi all'immissione in possesso, a comunicare a questo Ufficio, a mezzo di dichiarazione irrevocabile (mediante il modulo allegato), se condividono la determinazione dell'indennità provvisoria di espropriazione, rendendola definitiva;
## AVVISA:
- non sono accettate comunicazioni di condivisione dell'indennità parziali, condizionate o revocabili; in caso di comproprietari di beni indivisi sono accettate comunicazioni di condivisione pro quota;
- ricevuta dall'espropriato la comunicazione di condivisione e la documentazione comprovante la piena e libera disponibilità del bene, sarà disposto il pagamento dell'indennità di espropriazione nel termine di sessanta giorni; se, invece, non sarà prodotta tempestiva comunicazione di condivisione dell'indennità ovvero, pur producendola, non sarà dichiarata l'assenza di diritti di terzi sul bene ovvero non sarà prodotta la documentazione attestante la piena e libera proprietà del bene, il corrispettivo verrà depositato presso il Ministero dell'Economia e delle Finanze, Ragioneria Territoriale dello Stato, servizio depositi amministrativi definitivi; in presenza di diritti od opposizioni di terzi, l'effettivo pagamento della somma depositata avrà luogo in conformità della pronuncia dell'autorità giudiziaria adita su domanda di chi vi abbia interesse; ai sensi dell'art. 26.3 TUES qualora il bene sia gravato da ipoteca, al fine di ottenere il pagamento, potrà essere presentata una dichiarazione del titolare di tale diritto, con firma autentica, che autorizza la riscossione della somma; nel caso in cui il bene risulti gravato da altri diritti reali, ovvero siano presentate opposizioni al pagamento delle indennità, il pagamento potrà comunque essere effettuato in presenza di un accordo sulle modalità di riscossione tra tutti gli aventi diritto;
- i provvedimenti di pagamento o di deposito dell'indennità saranno assoggettati alle modalità, ai tempi e alle forme pubblicitarie previsti dall'art. 26 TUES;
- in caso di mancata condivisione dell'indennità provvisoria contenuta nel presente provvedimento sarà effettuata una nuova determinazione dell'indennità ai sensi dell'art. 21 TUES da parte della competente Commissione Provinciale Espropri, senza oneri per l'espropriato, ovvero da parte di un collegio di tecnici composto da un tecnico designato dal proprietario, uno individuato dal beneficiario dell'esproprio ed uno nominato, su istanza di chi vi abbia interesse, dal Presidente del Tribunale Civile di {{ente.tribunale}}; le spese del collegio saranno poste a carico del proprietario se l'indennità determinata dallo stesso sarà inferiore alla somma determinata con il presente provvedimento, divise per metà tra il beneficiario dell'esproprio e l'espropriato se la differenza non supererà in aumento il decimo e, negli altri casi, poste a carico del beneficiario dell'esproprio; i tecnici incaricati comunicheranno agli interessati mediante lettera raccomandata con avviso di ricevimento (o con mezzo telematico) il luogo, la data e ora delle operazioni, almeno 7 gg. prima della data stabilita; la S.V. potrà assistere alle operazioni di stima, anche mediante persona di fiducia, formulare osservazioni e presentare memorie scritte;
- se l'espropriato non condivide la determinazione dell'indennità di espropriazione contenuta nel presente provvedimento, entro il termine previsto per l'accettazione può chiedere la costituzione del collegio dei tecnici di cui al punto precedente indicando il nominativo del proprio tecnico; in assenza di tale istanza, la scrivente autorità espropriante provvederà a richiedere la determinazione dell'indennità alla Commissione Provinciale Espropri, che provvederà entro il termine di trenta giorni, e sarà data comunicazione della medesima determinazione all'espropriato, con avviso notificato con le forme degli atti processuali civili;
` : `## AVVISA:
- per le ditte la cui indennità è stata depositata, il pagamento della somma depositata avrà luogo con le modalità dell'art. 28 TUES; in presenza di diritti od opposizioni di terzi l'effettivo pagamento avrà luogo in conformità della pronuncia dell'autorità giudiziaria adita su domanda di chi vi abbia interesse;
- i provvedimenti di pagamento o di deposito dell'indennità sono assoggettati alle modalità, ai tempi e alle forme pubblicitarie previsti dall'art. 26 TUES;
`) + `- ai sensi dell'art. 23.4 TUES le operazioni di trascrizione e di voltura nel catasto e nei libri censuari del presente provvedimento avranno luogo senza indugio a cura e a spese del beneficiario dell'esproprio e, ai sensi dell'art. 25.3 TUES, una volta trascritto il presente decreto, tutti i diritti di terzi relativi agli immobili espropriati potranno essere fatti valere esclusivamente sull'indennità;
- ai sensi degli articoli 23.1 lett. h) e 24 TUES il presente decreto sarà eseguito mediante immissione in possesso delle aree interessate entro il termine perentorio di due anni; in calce al presente provvedimento sarà indicata la data dell'avvenuta immissione in possesso e verrà trasmessa copia del relativo verbale all'Ufficio per i Registri Immobiliari, per l'annotazione; dell'avvenuta immissione in possesso sarà inoltre data comunicazione all'ufficio competente alla tenuta degli atti delle procedure espropriative ai sensi degli articoli 24.6 e 14 del TUES;
- ai sensi dell'art. 23.1 lett. g) TUES il presente decreto sarà notificato ai proprietari nelle forme degli atti processuali civili, con un avviso contenente l'indicazione del luogo, del giorno e dell'ora in cui è prevista la sua esecuzione mediante immissione in possesso, almeno sette giorni prima di essa;
## INFORMA che
- sarà proponibile l'opposizione del terzo entro i trenta giorni successivi alla pubblicazione dell'estratto del presente provvedimento nella Gazzetta Ufficiale della Repubblica o nel Bollettino Ufficiale della Regione nel cui territorio si trova il bene e, decorso tale termine in assenza di impugnazioni, anche per il terzo l'indennità resterà fissata nella somma depositata;
- la proposizione di eventuali ricorsi da parte dei possessori dei diritti reali sui beni oggetto di esproprio potrà avvenire entro il termine di 30 gg. decorrenti dalla pubblicazione del decreto;
- avverso il presente decreto di esproprio la ditta espropriata potrà presentare ricorso al T.A.R. {{ente.tar}} entro 60 giorni dalla notifica dello stesso oppure ricorso straordinario al Capo dello Stato entro 120 giorni dalla medesima notifica;
- ai sensi dell'art. 35 TUES, sull'indennità relativa ad aree ricadenti nelle zone omogenee A, B, C e D sarà operata, nei confronti dei soggetti che non esercitano un'impresa commerciale, la ritenuta del 20% a titolo d'imposta, con facoltà di opzione per la tassazione ordinaria;
- ai sensi del Regolamento UE 2016/679 (GDPR) si informa la ditta proprietaria che il trattamento dei dati personali forniti o comunque acquisiti è finalizzato alla redazione del presente atto, alla sua registrazione, trascrizione e voltura, ed avverrà presso {{ente.nome}} e l'Agenzia delle Entrate, con l'utilizzo di procedure anche informatiche, nei modi e nei limiti necessari per perseguire le predette finalità; il conferimento dei dati è obbligatorio; agli interessati sono riconosciuti i diritti di accesso, rettifica, aggiornamento e cancellazione dei dati e di opposizione al trattamento per motivi legittimi; il titolare del trattamento è {{ente.nome}}{{#ente.responsabile}} e il responsabile cui rivolgersi per l'esercizio dei diritti è {{ente.responsabile}}{{/ente.responsabile}}.
## RICHIEDE
la registrazione del presente provvedimento con l'applicazione delle imposte di registro, ipotecaria e catastale, ai sensi delle vigenti disposizioni di legge.
## ATTESTA
ai sensi e per gli effetti di cui all'art. 24.5 del D.P.R. n. 327 dell'08.06.2001, che il presente decreto di espropriazione sarà eseguito, previa sua notificazione, ai sensi dell'art. 23.1 lett. h) TUES, in data {{#dataImmissione}}{{dataImmissione}}{{/dataImmissione}}{{^dataImmissione}}________________{{/dataImmissione}} mediante immissione nel possesso, con la redazione del verbale di cui all'art. 24 del medesimo Testo Unico.
{{luogo}}, {{oggi}}
[[firma {{ente.ruolo}}|{{ente.responsabile}}]]
Documento informatico sottoscritto con firma digitale ai sensi dell'art. 24 del D.Lgs. 82/2005 e ss.mm.ii.
[[salto]]
## {{ente.nome}}{{#ente.provincia}} – Provincia di {{ente.provincia}}{{/ente.provincia}}
# CERTIFICATO DI PUBBLICAZIONE
Atto di DECRETO {{ente.ruoloDel}} n. ______ del ____________, avente ad oggetto DECRETO DI ESPROPRIO RELATIVO AI LAVORI DI {{pratica.oggettoMaiuscolo}}{{#pratica.cup}}. CUP {{pratica.cup}}{{/pratica.cup}}., pubblicato all'Albo Pretorio di questo Ente dal ____________ per giorni 15 consecutivi ai sensi dell'art. 124 comma 1 D.Lgs. 267/2000 e dell'art. 32 comma 1 L. 69/2009.
{{luogo}}, ____________
[[firma L'addetto alla pubblicazione|]]
Documento informatico sottoscritto con firma digitale ai sensi dell'art. 24 del D.Lgs. 82/2005 e ss.mm.ii.`;
  }

  ES.modelli.INTEGRATI = {
    avvio_11_16: {
      nome: 'Avviso di avvio del procedimento – vincolo e dichiarazione di pubblica utilità', art: 'artt. 11 e 16', ambito: 'intestatario', fase: 'Avvio',
      testo: INTESTAZIONE_LETTERA + OGGETTO + `
**Comunicazione di avvio del procedimento per l'apposizione del vincolo preordinato all'esproprio e per la dichiarazione di pubblica utilità dell'opera (art. 11 e art. 16 D.P.R. 8.6.2001 n. 327)**

{{dest.gentile}}, La avvisiamo che:
- è in corso di predisposizione il progetto dell'opera pubblica di cui all'oggetto, che interessa aree di cui Lei risulta intestatario/a catastale, destinate ad essere oggetto di esproprio, asservimento o occupazione per pubblica utilità secondo la procedura prevista dal D.P.R. 327/2001;
- con la presente comunicazione è avviato il procedimento per l'apposizione sulle aree interessate del vincolo urbanistico preordinato all'esproprio, consistente nella previsione dell'opera nello strumento urbanistico comunale mediante apposita variante (art. 9 D.P.R. 327/2001);
- con la presente comunicazione è altresì avviato il procedimento per la dichiarazione di pubblica utilità dell'opera, consistente nella valutazione delle ragioni di pubblico interesse che giustificano il sacrificio della proprietà privata (art. 42, terzo comma, della Costituzione; artt. 12-13 D.P.R. 327/2001);
- l'apposizione del vincolo e la dichiarazione di pubblica utilità configurano, assieme alla futura determinazione dell'indennità, le condizioni per procedere all'espropriazione (art. 8 D.P.R. 327/2001);
- entrambi i procedimenti si concluderanno con l'approvazione del progetto dell'opera.

Le aree interessate sono così identificate in catasto:
[[tabella particelle colonne=comune,fg,map,haareca,rd,ra,espr,servtot,occ]]
Intestatari catastali e quote:
[[tabella intestatari]]
Si rende noto che nel termine di 30 giorni dalla presente comunicazione Lei ha facoltà di formulare eventuali osservazioni rispetto all'apposizione del vincolo preordinato all'esproprio e alla dichiarazione di pubblica utilità, trasmettendole all'Autorità espropriante, all'attenzione del responsabile del procedimento, mediante posta ordinaria, posta elettronica o PEC ({{ente.pec}}), con riferimento all'opera in oggetto e con la dicitura «osservazioni ex artt. 11-16 TUES». Le osservazioni saranno valutate dall'Autorità espropriante ai fini delle definitive determinazioni, e dell'esito della valutazione sarà dato conto nel provvedimento di approvazione del progetto.
Il progetto dell'opera, contenente una relazione sulla natura e sullo scopo degli interventi da eseguire e un allegato con la descrizione delle aree da espropriare e dei relativi intestatari, è depositato presso {{ente.ufficio}} {{ente.nome}}{{#dati.consultazione}} ({{dati.consultazione}}){{/dati.consultazione}}, dove può essere consultato previo appuntamento.{{#ente.link}} La documentazione è consultabile anche al seguente indirizzo: {{ente.link}}{{/ente.link}}
Il proprietario, nel formulare le proprie osservazioni, può chiedere che l'espropriazione riguardi anche le frazioni residue dei suoi beni qualora per esse risulti una disagevole utilizzazione ovvero siano necessari considerevoli lavori per disporne un'agevole utilizzazione.
Ai sensi dell'art. 32, comma 2, D.P.R. 327/2001 non saranno considerate nella determinazione dell'indennità le costruzioni, le piantagioni e le migliorie intraprese sui fondi dopo la presente comunicazione allo scopo di conseguire un'indennità maggiore.
Nel caso in cui la S.V., pur risultando catastalmente intestataria dei beni sopra descritti, non ne fosse più proprietaria, è tenuta ai sensi dell'art. 3, comma 3, D.P.R. 327/2001 a darne comunicazione entro 30 giorni dal ricevimento della presente, indicando, ove ne sia a conoscenza, il nuovo proprietario o fornendo copia degli atti utili a ricostruire le vicende del bene.
Il responsabile del procedimento è {{ente.rup}}. Si allega planimetria catastale con evidenziata l'area interessata dall'intervento.
` + CHIUSURA + PLANIMETRIA
    },
    avvio_16: {
      nome: 'Avviso di avvio del procedimento – sola dichiarazione di pubblica utilità', art: 'art. 16 c.4', ambito: 'intestatario', fase: 'Avvio',
      testo: INTESTAZIONE_LETTERA + OGGETTO + `
**Comunicazione di avvio del procedimento di approvazione del progetto con dichiarazione di pubblica utilità (art. 16, comma 4, D.P.R. 8.6.2001 n. 327)**

{{dest.gentile}}, La informiamo che è in corso il procedimento di approvazione del progetto dell'opera in oggetto, la cui approvazione comporterà la dichiarazione di pubblica utilità dell'opera ai sensi degli artt. 12 e seguenti del D.P.R. 327/2001. Le aree soggette al vincolo preordinato all'esproprio, di cui Lei risulta intestatario/a catastale, sono le seguenti:
[[tabella particelle colonne=comune,fg,map,haareca,rd,ra,espr,servtot,occ]]
[[tabella intestatari]]
Il progetto, con la relazione sulla natura e lo scopo delle opere e l'elenco delle aree da espropriare con i nominativi dei proprietari catastali, è depositato presso {{ente.ufficio}} {{ente.nome}}{{#dati.consultazione}} ({{dati.consultazione}}){{/dati.consultazione}}.{{#ente.link}} La documentazione è consultabile anche al seguente indirizzo: {{ente.link}}{{/ente.link}}
Ai sensi dell'art. 16, comma 10, D.P.R. 327/2001, Lei può formulare osservazioni al responsabile del procedimento nel termine perentorio di trenta giorni dal ricevimento della presente. Le osservazioni saranno valutate ai fini delle definitive determinazioni.
Ai sensi dell'art. 3, comma 3, D.P.R. 327/2001, qualora non fosse più proprietario/a dei beni, è tenuto/a a comunicarlo entro 30 giorni indicando, ove ne sia a conoscenza, il nuovo proprietario.
Il responsabile del procedimento è {{ente.rup}}.
` + CHIUSURA + PLANIMETRIA
    },
    com_17: {
      nome: 'Comunicazione efficacia DPU e invito a fornire elementi per la stima', art: 'art. 17 c.2', ambito: 'intestatario', fase: 'Dichiarazione di pubblica utilità',
      testo: INTESTAZIONE_LETTERA + OGGETTO + `
**Comunicazione di avvenute apposizione del vincolo preordinato all'esproprio e dichiarazione di pubblica utilità dell'opera e invito a fornire elementi utili per la stima dell'indennità (art. 17, comma 2, D.P.R. 8.6.2001 n. 327)**

{{dest.gentile}}, La avvisiamo che:
- con {{atti.dpu.testo}}{{#dati.progetto}} ({{dati.progetto}}){{/dati.progetto}} è stato approvato il progetto dell'opera in oggetto, con effetto di dichiarazione di pubblica utilità;
- {{#atti.vincolo.estremi}}con {{atti.vincolo.testo}} {{/atti.vincolo.estremi}}è stato apposto il vincolo preordinato all'esproprio sulle aree interessate dalle opere.
La documentazione progettuale può essere visionata presso {{ente.ufficio}} {{ente.nome}}{{#dati.consultazione}} ({{dati.consultazione}}){{/dati.consultazione}}{{#ente.link}} o in formato digitale al seguente indirizzo: {{ente.link}}{{/ente.link}}.
Con la presente comunicazione viene avviato il procedimento per l'emanazione del decreto di esproprio/asservimento/occupazione delle aree di seguito specificate. Entro il termine di 30 (trenta) giorni dal ricevimento della presente, i proprietari hanno facoltà di produrre eventuali osservazioni e di fornire ogni elemento ritenuto utile per la stima dell'indennità loro spettante.
Nel caso di aree edificabili, di aree legittimamente edificate e di aree non edificabili, l'indennità di esproprio sarà determinata in misura pari al relativo valore venale.
L'area interessata dall'intervento, prevista nel piano particellare allegato al progetto approvato, è la seguente:
[[tabella particelle colonne=fg,map,sup,rd,ra,espr,servop,serv,occ]]
[[tabella intestatari]]
Ai sensi dell'art. 45, comma 1, D.P.R. 327/2001, dalla data della dichiarazione di pubblica utilità e fino all'esecuzione del decreto di esproprio, il proprietario ha il diritto di stipulare con il beneficiario dell'espropriazione l'atto di cessione del bene o della sua quota di proprietà.
Si invita la S.V. a comunicare tempestivamente:
- la presenza di eventuali diritti di terzi sulle aree;
- l'eventuale fittavolo, mezzadro, colono o compartecipante che coltivi l'area da almeno un anno prima della data della dichiarazione di pubblica utilità;
- qualora il bene sia stato trasferito, il nominativo del nuovo proprietario;
- se preferisce ricevere le successive comunicazioni a mezzo PEC, l'indirizzo da utilizzare.
Avverso i provvedimenti che hanno disposto la dichiarazione di pubblica utilità e l'apposizione del vincolo può essere proposto ricorso al T.A.R. {{ente.tar}} ovvero ricorso straordinario al Presidente della Repubblica nei termini di legge, decorrenti dal ricevimento della presente.
Si allega planimetria catastale con evidenziata l'area interessata dall'intervento.
` + CHIUSURA + PLANIMETRIA
    },
    avvio_49: {
      nome: 'Avvio del procedimento di occupazione temporanea non preordinata all\'esproprio', art: 'art. 49 – art. 7 L. 241/1990', ambito: 'intestatario', fase: 'Occupazione temporanea',
      testo: INTESTAZIONE_LETTERA + OGGETTO + `
**Comunicazione di avvio del procedimento ex art. 7 Legge 241/1990 per l'occupazione temporanea non preordinata all'esproprio di aree occorrenti per i lavori in oggetto ai sensi dell'art. 49 del D.P.R. 327/2001 e s.m.i.**

{{dest.gentile}},
si comunica che questo Ente ha avviato il procedimento amministrativo volto all'adozione del provvedimento di occupazione temporanea, ai sensi dell'art. 49 del D.P.R. 8 giugno 2001, n. 327, dell'immobile di Sua proprietà di seguito identificato:
[[tabella particelle colonne=comune,fg,map,sup,qual,rd,ra,occ]]
[[tabella intestatari]]
L'occupazione temporanea dell'area sopra descritta si rende necessaria ed indifferibile per consentire la corretta esecuzione dei lavori in oggetto. La durata presunta dell'occupazione è stimata in mesi {{mesiOcc}}, a decorrere dalla data del verbale di immissione in possesso.
Ai sensi degli artt. 7 e 10 della Legge 241/1990 e s.m.i.: il responsabile del procedimento è {{ente.rup}}{{#ente.telefono}}, tel. {{ente.telefono}}{{/ente.telefono}}{{#ente.email}}, e-mail {{ente.email}}{{/ente.email}}. Gli atti del procedimento sono consultabili presso {{ente.ufficio}} {{ente.nome}}{{#dati.consultazione}} ({{dati.consultazione}}){{/dati.consultazione}}, previo appuntamento{{#ente.link}}, oppure al seguente indirizzo: {{ente.link}}{{/ente.link}}.
Entro il termine di 15 giorni dal ricevimento della presente comunicazione, la S.V. ha facoltà di presentare memorie scritte e documenti, che saranno valutati dall'Amministrazione ai fini dell'adozione del provvedimento finale.
A seguito dell'immissione in possesso e della redazione del relativo stato di consistenza in contraddittorio, verrà determinata e corrisposta l'indennità spettante per l'occupazione temporanea, calcolata ai sensi dell'art. 50 del D.P.R. 327/2001 per ciascun anno o frazione di anno di occupazione.
Distinti saluti.
[[firma {{ente.ruolo}}|{{ente.responsabile}}]]` + PLANIMETRIA
    },
    offerta_20: {
      nome: 'Notifica elenco dei beni e somma offerta per l\'espropriazione', art: 'art. 20 c.1', ambito: 'intestatario', fase: 'Indennità',
      testo: INTESTAZIONE_LETTERA + OGGETTO + `
**Notifica dell'elenco dei beni da espropriare e indicazione della somma offerta per l'espropriazione (art. 20, comma 1, D.P.R. 8.6.2001 n. 327)**

## IL RESPONSABILE DEL PROCEDIMENTO
Premesso che con {{atti.dpu.testo}}{{#dati.progetto}} ({{dati.progetto}}){{/dati.progetto}} è stato approvato e dichiarato di pubblica utilità il progetto dell'opera pubblica in oggetto, il quale prevede espropriazioni per pubblica utilità;
richiamata la comunicazione inviata ai sensi dell'art. 17, comma 2, D.P.R. 327/2001;
visto l'art. 45, comma 1, D.P.R. 327/2001, ai sensi del quale, dalla dichiarazione di pubblica utilità e fino all'esecuzione del decreto di esproprio, il proprietario ha diritto di stipulare con il beneficiario l'atto di cessione del bene o della sua quota;
## NOTIFICA
per estratto l'elenco dei beni di proprietà della S.V. interessati dal procedimento espropriativo, con l'indicazione della somma offerta:
[[tabella particelle colonne=fg,map,qual,sup,espr,servtot,occ,ind]]
[[tabella indennita]]
Somma complessivamente offerta: **{{ditta.tot}}** (diconsi euro {{ditta.totLettere}}).
## AVVISA
- ai sensi dell'art. 20, comma 1, la S.V. può presentare osservazioni scritte e depositare documenti entro trenta giorni dalla presente notifica presso {{ente.ufficio}} {{ente.nome}}, {{ente.indirizzo}}, ovvero via PEC all'indirizzo {{ente.pec}};
- valutate le osservazioni, l'Autorità espropriante procederà alla determinazione in via provvisoria dell'indennità ai sensi dell'art. 20, comma 3;
- nel caso in cui condivida la somma offerta, la S.V. può comunicarlo con l'allegato modulo e chiedere la stipula dell'atto di cessione volontaria (art. 45), previo frazionamento catastale ove necessario;
- non sono accettate comunicazioni di condivisione parziali, condizionate o revocabili; in caso di comproprietari di beni indivisi sono accettate comunicazioni di condivisione pro quota.
` + CHIUSURA
    },
    condivisione: {
      nome: 'Dichiarazione di condivisione dell\'indennità e di piena proprietà', art: 'artt. 20 c.5-6, 22 c.3, 22-bis c.3, 45', ambito: 'ditta', fase: 'Indennità',
      testo: `>> Spett.le {{ente.nome}}
>> {{ente.ufficio}}
>> {{ente.indirizzo}}

${OGGETTO}
**Dichiarazione irrevocabile di condivisione dell'indennità di espropriazione e autocertificazione di piena e libera proprietà (artt. 20, 22, 22-bis e 45 D.P.R. 327/2001 – D.P.R. 445/2000)**

{{#ditta.intestatari}}
Il/La sottoscritto/a **{{nome}}** {{nascita}}, C.F. {{cf}}, residente in {{via}} {{cittaCap}}, titolare del diritto di {{diritto}};
{{/ditta.intestatari}}
intestatario/i della ditta n. **{{ditta.n}}** del piano particellare, in relazione ai seguenti beni:
[[tabella particelle colonne=fg,map,qual,sup,espr,servtot,occ,ind]]
per un'indennità complessiva di **{{ditta.tot}}** (diconsi euro {{ditta.totLettere}}),
## DICHIARA/DICHIARANO
- di condividere in modo irrevocabile la determinazione dell'indennità sopra indicata;
- che i beni sono di sua/loro piena e libera proprietà, liberi da ipoteche, pesi, vincoli, diritti reali o personali di terzi e da trascrizioni pregiudizievoli, assumendosi ogni responsabilità in ordine ad eventuali diritti di terzi;
- di impegnarsi a depositare entro sessanta giorni la documentazione comprovante, anche mediante attestazione notarile, la piena e libera proprietà dei beni (art. 20, comma 8);
- di essere/non essere coltivatore diretto o imprenditore agricolo a titolo principale e che il fondo è/non è condotto da fittavolo, mezzadro, colono o compartecipante;
- di essere consapevole/i delle sanzioni penali previste dall'art. 76 del D.P.R. 445/2000 per le dichiarazioni mendaci;
## CHIEDE/CHIEDONO
che il pagamento sia effettuato mediante bonifico sul conto corrente IBAN ____________________________________ intestato a ______________________________.
Ai fini della ritenuta d'acconto di cui all'art. 35 D.P.R. 327/2001 dichiara/dichiarano di non esercitare / di esercitare attività d'impresa commerciale.
Si allega copia del documento d'identità in corso di validità.
{{luogo}}, lì ________________
{{#ditta.intestatari}}
[[firma {{nome}}|]]
{{/ditta.intestatari}}`
    },
    decreto_esproprio: { nome: 'Decreto di esproprio con determinazione urgente dell\'indennità (art. 22)', art: 'artt. 22 e 23', ambito: 'pratica', fase: 'Decreto', testo: decreto(true) },
    decreto_23: { nome: 'Decreto di esproprio dopo pagamento o deposito dell\'indennità (artt. 20, 22-bis, 23)', art: 'artt. 20, 22-bis, 23, 26', ambito: 'pratica', fase: 'Decreto', testo: decreto(false) },
    decreto_22bis: {
      nome: 'Decreto di occupazione d\'urgenza preordinata all\'esproprio', art: 'art. 22-bis', ambito: 'pratica', fase: 'Decreto',
      testo: `# DECRETO DI OCCUPAZIONE D'URGENZA
## {{pratica.oggetto}}{{#pratica.cup}} – CUP {{pratica.cup}}{{/pratica.cup}}
**Decreto motivato di occupazione d'urgenza preordinata all'espropriazione e di determinazione in via provvisoria dell'indennità (art. 22-bis D.P.R. 8.6.2001 n. 327)**
## {{ente.ruolo}}
**PREMESSO che:**
- con {{atti.dpu.testo}}{{#dati.progetto}} ({{dati.progetto}}){{/dati.progetto}} è stato approvato il progetto dell'opera con effetto di dichiarazione di pubblica utilità;
- con {{atti.com17.testo}} è stata effettuata la comunicazione di cui all'art. 17, comma 2, D.P.R. 327/2001;
- l'avvio dei lavori riveste carattere di particolare urgenza, tale da non consentire l'applicazione delle disposizioni dell'art. 20, commi 1 e 2, per le seguenti ragioni: {{pratica.urgenza}};
{{#dati.premesse}}{{dati.premesseElenco}}
{{/dati.premesse}}{{#dati.visti}}**VISTI:**
{{dati.vistiElenco}}
{{/dati.visti}}## DECRETA
- è disposta l'occupazione anticipata dei beni immobili necessari, come di seguito individuati, a favore di **{{ente.beneficiario}}**, C.F. {{ente.cfBeneficiario}};
- è determinata in via provvisoria l'indennità di espropriazione come segue:
[[tabella piano colonne=np,fg,map,qual,sup,espr,servtot,occ,ind]]
- il presente decreto perde efficacia ove l'occupazione non segua nel termine di tre mesi dalla sua emanazione (art. 22-bis, comma 4); all'atto dell'immissione in possesso sarà redatto il verbale di consistenza in contraddittorio;
- il proprietario, nei trenta giorni successivi all'immissione in possesso, può comunicare se condivide l'indennità; in caso di condivisione e di autocertificazione della piena e libera proprietà gli sarà corrisposto un acconto dell'80% (art. 22-bis, comma 3, e art. 20, comma 6);
- per il periodo intercorrente tra l'immissione in possesso e la corresponsione dell'indennità di espropriazione è dovuta l'indennità di occupazione calcolata ai sensi dell'art. 50 (art. 22-bis, comma 5);
- l'efficacia del presente decreto cessa se non è emanato il decreto di esproprio nel termine di efficacia della dichiarazione di pubblica utilità (art. 22-bis, comma 6).
Avverso il presente decreto può essere proposto ricorso al T.A.R. {{ente.tar}} entro 60 giorni dalla notifica o ricorso straordinario al Capo dello Stato entro 120 giorni.
{{luogo}}, {{oggi}}
[[firma {{ente.ruolo}}|{{ente.responsabile}}]]`
    },
    avviso_immissione: {
      nome: 'Avviso di immissione in possesso e redazione dello stato di consistenza', art: 'art. 23 c.1 lett. g – art. 24', ambito: 'intestatario', fase: 'Esecuzione',
      testo: INTESTAZIONE_LETTERA + OGGETTO + `
**Avviso di esecuzione del decreto mediante immissione in possesso e redazione dello stato di consistenza (artt. 23, comma 1, lett. g, e 24 D.P.R. 8.6.2001 n. 327)**

{{dest.gentile}}, in esecuzione del decreto n. ______ del ____________, che si notifica unitamente al presente avviso, si comunica che il giorno **{{ditta.ev.immissione.data}}** alle ore **{{ditta.ev.immissione.ora}}**, con ritrovo presso {{ditta.ev.immissione.luogo}}, i tecnici incaricati procederanno all'immissione in possesso e alla redazione del verbale di stato di consistenza dei seguenti beni:
[[tabella particelle colonne=fg,map,qual,sup,espr,servtot,occ]]
La S.V. è invitata ad intervenire personalmente o a mezzo di persona di fiducia munita di delega. In caso di assenza le operazioni si svolgeranno ugualmente alla presenza di due testimoni che non siano dipendenti del beneficiario dell'espropriazione (art. 24, comma 3).
Possono partecipare alle operazioni anche i titolari di diritti reali o personali sul bene (fittavoli, affittuari, conduttori).
` + CHIUSURA + SCHEMA
    },
    verbale_consistenza: {
      nome: 'Rilievo dello stato di consistenza e verbale di immissione in possesso', art: 'artt. 22, 22-bis, 24, 49', ambito: 'ditta', fase: 'Esecuzione',
      testo: `**Ditta N°{{ditta.n}}**
## {{ente.nome}}
{{#ente.provincia}}## PROVINCIA DI {{ente.provincia}}
{{/ente.provincia}}
**OGGETTO: {{pratica.oggetto}}{{#pratica.cup}} – CUP {{pratica.cup}}{{/pratica.cup}}**
# RILIEVO DELLO STATO DI CONSISTENZA E VERBALE DI IMMISSIONE IN POSSESSO
## (artt. 22 e 24 del TUES)
**PREMESSO:**
- che con {{atti.avvio16.testo}} è stato comunicato alle ditte proprietarie risultanti dagli atti catastali l'avvio del procedimento ai sensi dell'art. 16 del D.P.R. 327/2001;
- che con {{atti.dpu.testo}}{{#dati.progetto}} ({{dati.progetto}}){{/dati.progetto}} è stato approvato il progetto con effetto di dichiarazione di pubblica utilità, di durata quinquennale;
- che con {{atti.vincolo.testo}} è stato apposto il vincolo preordinato all'esproprio;
- che con {{atti.com17.testo}} è stata effettuata la comunicazione di cui all'art. 17 del D.P.R. 327/2001;
{{#ditta.osservazioni}}- che a seguito delle comunicazioni sono pervenute le seguenti osservazioni: {{ditta.osservazioni}};
{{/ditta.osservazioni}}- che dal piano particellare allegato al progetto{{#atti.frazionamento.estremi}}, considerati i tipi di frazionamento {{atti.frazionamento.testo}}{{/atti.frazionamento.estremi}}, risultano interessate le seguenti particelle:
[[tabella consistenza]]
con i seguenti intestatari:
{{#ditta.intestatari}}
**{{nome}}** {{nascita}} – C.F. {{cf}} – {{diritto}}
{{/ditta.intestatari}}
- che con {{atti.decreto.testo}} è stato decretato l'esproprio, la servitù e/o l'occupazione dei beni interessati, con contestuale determinazione in via provvisoria dell'indennità ai sensi dell'art. 22 del TUES;
- che il decreto è stato notificato al proprietario nelle forme degli atti processuali civili con un avviso contenente l'indicazione del luogo, del giorno e dell'ora dell'esecuzione, almeno sette giorni prima di essa (art. 23, comma 1, lett. g).
{{#dati.premesse}}{{dati.premesseElenco}}
{{/dati.premesse}}**TUTTO CIÒ PREMESSO**
il giorno {{ditta.ev.immissione.data}}, alle ore {{ditta.ev.immissione.ora}}, il sottoscritto {{ente.tecnico}}, tecnico incaricato da {{ente.nome}}, munito di documento di identità n. ____________ in corso di validità, si è portato in prossimità dell'accesso delle aree da espropriare/asservire/occupare ed ivi, alla presenza degli intervenuti:
Sig. ______________________ nato a ______________________ il ____________ in qualità di ______________________
Sig. ______________________ nato a ______________________ il ____________ in qualità di ______________________
nonché, in qualità di testimoni non dipendenti dell'ente beneficiario dell'espropriazione:
Sig. ______________________ nato a ______________________ il ____________ residente a ______________________
Sig. ______________________ nato a ______________________ il ____________ residente a ______________________
il sottoscritto, dopo essersi qualificato e identificato, verificata l'assenza di impedimenti all'accesso, ha proceduto all'esatta individuazione in loco delle aree come indicate nell'estratto del piano particellare di esproprio approvato e procede al
# RILIEVO DELLO STATO DI CONSISTENZA
**Descrizione dei luoghi:**
{{#ditta.particelle}}{{etichetta}} ______________________________________________________________
_____________________________________________________________________________
{{/ditta.particelle}}
**Manufatti in genere:**
{{#ditta.particelle}}{{etichetta}} ______________________________________________________________
{{/ditta.particelle}}
**Servitù:**
{{#ditta.particelle}}{{etichetta}} ______________________________________________________________
{{/ditta.particelle}}
**Frutti pendenti:**
{{#ditta.particelle}}{{etichetta}} ______________________________________________________________
{{/ditta.particelle}}
**Piante esistenti:**
{{#ditta.particelle}}{{etichetta}} ______________________________________________________________
{{/ditta.particelle}}
**Conducente del fondo:**
{{#ditta.particelle}}{{etichetta}} ______________________________________________________________
{{/ditta.particelle}}
**Variazioni intestazione proprietà:**
{{#ditta.particelle}}{{etichetta}} ______________________________________________________________
{{/ditta.particelle}}
**Altro:**
{{#ditta.particelle}}{{etichetta}} ______________________________________________________________
{{/ditta.particelle}}
**Dichiarazioni e richieste dei proprietari o di altri intervenuti:**
_____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________
# VERBALE DI IMMISSIONE IN POSSESSO
Rilevato, come sopra, lo stato dei luoghi, {{ente.beneficiario}} si immette nel possesso delle aree sopra descritte {{#ditta.particelle}}{{#espr}}per una superficie di esproprio di {{espr}} mq (Comune di {{comune}} Fg. {{fg}} Mapp. {{mappaleEspr}}); {{/espr}}{{#servTot}}di servitù di {{servTot}} mq (Comune di {{comune}} Fg. {{fg}} Mapp. {{mappaleServ}}); {{/servTot}}{{#occ}}di occupazione temporanea di {{occ}} mq (Comune di {{comune}} Fg. {{fg}} Mapp. {{mappaleOcc}}); {{/occ}}{{/ditta.particelle}}ritenendo, da oggi, la ditta proprietaria spogliata di ogni pretesa di utilizzo e permanenza sul bene per le aree espropriate. A riprova dell'avvenuta materiale apprensione del bene e allo scopo di dimensionarla fisicamente vengono apposti sul fondo dei picchetti che, ove non materializzati in altro modo, indicano i limiti delle aree.
[[salto]]
## Schema del piano particellare – Ditta n. {{ditta.n}}
[[planimetria scala=1000]]
[[tagli]]
**LA DITTA PROPRIETARIA**
{{#ditta.intestatari}}
______________________________ ({{nome}})
{{/ditta.intestatari}}
{{luogo}}, lì ________________
**I TESTIMONI**
______________________________          ______________________________
[[firma IL TECNICO INCARICATO|{{ente.tecnico}}]]`
    },
    decreto_49: {
      nome: 'Decreto di occupazione temporanea e determinazione dell\'indennità', art: 'artt. 49 e 50', ambito: 'pratica', fase: 'Occupazione temporanea',
      testo: `# DECRETO DI OCCUPAZIONE TEMPORANEA
## {{pratica.oggetto}}{{#pratica.cup}} – CUP {{pratica.cup}}{{/pratica.cup}}
**Decreto di occupazione temporanea di aree non soggette ad esproprio e determinazione dell'indennità di occupazione (artt. 49 e 50 D.P.R. 8.6.2001 n. 327)**
## {{ente.ruolo}}
**PREMESSO che:**
- con {{atti.dpu.testo}}{{#dati.progetto}} ({{dati.progetto}}){{/dati.progetto}} è stato approvato il progetto dell'opera in oggetto;
- con {{atti.avvio49.testo}} i proprietari dei terreni interessati sono stati avvisati dell'avvio del procedimento e messi in condizione di presentare osservazioni;
- per la corretta esecuzione dei lavori occorre disporre l'occupazione temporanea di aree non soggette al procedimento espropriativo ai sensi dell'art. 49 del D.P.R. 327/2001;
- l'indennità di occupazione è determinata ai sensi dell'art. 50, in misura pari, per ogni anno, a un dodicesimo di quanto sarebbe dovuto in caso di esproprio e, per ogni mese o frazione di mese, a un dodicesimo di quella annua, sulla base di una durata presunta di mesi {{mesiOcc}}, da ricalcolare alla restituzione sulla base della durata effettiva;
{{#dati.premesse}}{{dati.premesseElenco}}
{{/dati.premesse}}{{#dati.visti}}**VISTI:**
{{dati.vistiElenco}}
{{/dati.visti}}## DECRETA
- l'occupazione temporanea non preordinata all'esproprio, a favore di **{{ente.beneficiario}}**, dei seguenti beni:
[[tabella piano colonne=np,fg,map,qual,sup,occ,ind]]
- l'indennità di occupazione è determinata nella misura sopra riportata, per complessivi **{{tot.occ}}** (diconsi euro {{tot.occLettere}});
- il presente decreto sarà notificato ai proprietari con l'indicazione del luogo, del giorno e dell'ora dell'immissione in possesso almeno sette giorni prima; all'atto dell'immissione sarà redatto il verbale di consistenza in contraddittorio;
- al termine dell'occupazione le aree saranno restituite nello stato originario previa redazione di apposito verbale.
Avverso il presente decreto può essere proposto ricorso al T.A.R. {{ente.tar}} entro 60 giorni dalla notifica o ricorso straordinario al Capo dello Stato entro 120 giorni.
{{luogo}}, {{oggi}}
[[firma {{ente.ruolo}}|{{ente.responsabile}}]]`
    },
    restituzione: {
      nome: 'Avviso di restituzione delle aree occupate temporaneamente', art: 'art. 49', ambito: 'intestatario', fase: 'Occupazione temporanea',
      testo: INTESTAZIONE_LETTERA + OGGETTO + `
**Avviso di restituzione delle aree occupate temporaneamente (art. 49 D.P.R. 8.6.2001 n. 327)**

{{dest.gentile}}, si comunica che il giorno **{{ditta.ev.restituzione.data}}** alle ore **{{ditta.ev.restituzione.ora}}** si procederà alla restituzione delle seguenti aree occupate temporaneamente, con redazione del verbale di restituzione in contraddittorio:
[[tabella particelle colonne=fg,map,qual,sup,occ]]
La S.V. è invitata ad intervenire personalmente o a mezzo di persona di fiducia munita di delega. In caso di assenza le operazioni si svolgeranno alla presenza di due testimoni.
L'indennità di occupazione sarà liquidata ai sensi dell'art. 50 del D.P.R. 327/2001 sulla base dell'effettiva durata dell'occupazione.
` + CHIUSURA
    },
    deposito: {
      nome: 'Ordinanza di deposito delle indennità non condivise (MEF – RTS)', art: 'artt. 20 c.14, 26', ambito: 'pratica', fase: 'Indennità',
      testo: `# ORDINANZA DI DEPOSITO
## {{pratica.oggetto}}{{#pratica.cup}} – CUP {{pratica.cup}}{{/pratica.cup}}
**Deposito presso il Ministero dell'Economia e delle Finanze – Ragioneria Territoriale dello Stato, servizio depositi amministrativi definitivi, delle indennità non condivise (artt. 20, comma 14, e 26 D.P.R. 8.6.2001 n. 327)**
## {{ente.ruolo}}
**PREMESSO** che con {{atti.decreto.testo}} è stata determinata in via provvisoria l'indennità spettante alle ditte proprietarie dei beni interessati dai lavori in oggetto e che, decorso il termine previsto, le ditte di seguito indicate non hanno comunicato la condivisione dell'indennità ovvero non hanno prodotto la documentazione attestante la piena e libera proprietà dei beni;
{{#dati.premesse}}{{dati.premesseElenco}}
{{/dati.premesse}}{{#dati.visti}}**VISTI:**
{{dati.vistiElenco}}
{{/dati.visti}}## ORDINA
il deposito presso il Ministero dell'Economia e delle Finanze – Ragioneria Territoriale dello Stato competente, servizio depositi amministrativi definitivi, delle seguenti somme:
{{#ditte}}
- Ditta {{n}} – {{nome}}: **{{tot}}**
{{/ditte}}
Il presente provvedimento sarà pubblicato per estratto nel {{ente.bur}} ai sensi dell'art. 26, comma 7, D.P.R. 327/2001 e diverrà esecutivo decorsi trenta giorni dalla pubblicazione se non è proposta da terzi opposizione per l'ammontare dell'indennità o per la garanzia.
{{luogo}}, {{oggi}}
[[firma {{ente.ruolo}}|{{ente.responsabile}}]]`
    },
    pagamento: {
      nome: 'Ordinanza di pagamento diretto delle indennità condivise', art: 'artt. 20 c.8, 26', ambito: 'pratica', fase: 'Indennità',
      testo: `# ORDINANZA DI PAGAMENTO
## {{pratica.oggetto}}{{#pratica.cup}} – CUP {{pratica.cup}}{{/pratica.cup}}
**Pagamento diretto delle indennità condivise (artt. 20, comma 8, e 26 D.P.R. 8.6.2001 n. 327)**
## {{ente.ruolo}}
**PREMESSO** che le ditte di seguito indicate hanno comunicato in modo irrevocabile la condivisione dell'indennità determinata con {{atti.decreto.testo}} e hanno prodotto la documentazione comprovante la piena e libera proprietà dei beni, dichiarando l'assenza di diritti di terzi;
{{#dati.premesse}}{{dati.premesseElenco}}
{{/dati.premesse}}{{#dati.visti}}**VISTI:**
{{dati.vistiElenco}}
{{/dati.visti}}## ORDINA
il pagamento diretto delle seguenti somme agli aventi diritto, al netto dell'eventuale ritenuta del 20% di cui all'art. 35 D.P.R. 327/2001 ove dovuta:
{{#ditte}}
- Ditta {{n}} – {{nome}}: **{{tot}}**{{#ritenuta}} (ritenuta art. 35: {{ritenuta}}){{/ritenuta}}
{{/ditte}}
Il presente provvedimento sarà pubblicato per estratto nel {{ente.bur}} ai sensi dell'art. 26, comma 7, D.P.R. 327/2001 e diverrà esecutivo decorsi trenta giorni dalla pubblicazione se non è proposta da terzi opposizione per l'ammontare dell'indennità o per la garanzia.
{{luogo}}, {{oggi}}
[[firma {{ente.ruolo}}|{{ente.responsabile}}]]`
    },
    invito_21: {
      nome: 'Invito ai non concordatari a designare il tecnico di fiducia', art: 'art. 21 c.2', ambito: 'intestatario', fase: 'Indennità',
      testo: INTESTAZIONE_LETTERA + OGGETTO + `
**Invito a designare un tecnico di fiducia per la determinazione definitiva dell'indennità (art. 21, comma 2, D.P.R. 8.6.2001 n. 327)**

{{dest.gentile}}, preso atto che la S.V. non ha condiviso l'indennità determinata in via provvisoria in relazione ai beni della ditta n. {{ditta.n}}, si invita la S.V., ai sensi dell'art. 21, comma 2, D.P.R. 327/2001, a comunicare entro venti giorni dal ricevimento della presente se intende avvalersi, per la determinazione dell'indennità definitiva, di un collegio di tre tecnici, designando un tecnico di propria fiducia.
Il collegio sarà composto dal tecnico designato dalla S.V., da un tecnico nominato dall'Autorità espropriante e da un terzo tecnico nominato dal Presidente del Tribunale Civile di {{ente.tribunale}}. Le spese saranno poste a carico del proprietario se l'indennità definitiva risulterà inferiore a quella provvisoria, divise a metà se la differenza non supererà in aumento il decimo, a carico del beneficiario negli altri casi.
In mancanza di designazione nel termine indicato, l'indennità sarà determinata dalla Commissione Provinciale Espropri ai sensi dell'art. 21, comma 15, senza oneri per l'espropriato.
` + CHIUSURA
    },
    estratto_bur: {
      nome: 'Estratto del decreto per la pubblicazione sul BUR / GURI', art: 'art. 23 c.5', ambito: 'pratica', fase: 'Decreto',
      testo: `# ESTRATTO DI DECRETO DI ESPROPRIO
**{{ente.nome}}** – Decreto n. ______ del ____________ – {{pratica.oggetto}}{{#pratica.cup}} – CUP {{pratica.cup}}{{/pratica.cup}}
Si rende noto che con decreto n. ______ del ____________ di {{ente.ruolo}} è stata pronunciata a favore di {{ente.beneficiario}} (C.F. {{ente.cfBeneficiario}}) l'espropriazione/costituzione di servitù/occupazione temporanea dei seguenti beni, con determinazione in via provvisoria delle relative indennità:
{{#ditte}}
- Ditta {{n}} – {{nome}}: {{#particelle}}Fg. {{fg}} Mapp. {{mappale}}{{#espr}} esproprio mq {{espr}}{{/espr}}{{#servTot}} servitù mq {{servTot}}{{/servTot}}{{#occ}} occupazione mq {{occ}}{{/occ}}; {{/particelle}}indennità {{tot}}.
{{/ditte}}
L'opposizione del terzo è proponibile entro i trenta giorni successivi alla pubblicazione del presente estratto (art. 23, comma 5, D.P.R. 327/2001).
[[firma {{ente.ruolo}}|{{ente.responsabile}}]]`
    },
    avvio_42bis: {
      nome: 'Avvio del procedimento di acquisizione sanante', art: 'art. 42-bis – art. 7 L. 241/1990', ambito: 'intestatario', fase: 'Acquisizione sanante',
      testo: INTESTAZIONE_LETTERA + OGGETTO + `
**Comunicazione di avvio del procedimento per l'acquisizione al patrimonio indisponibile dei beni utilizzati per scopi di interesse pubblico (art. 42-bis D.P.R. 8.6.2001 n. 327 – artt. 7 e 8 L. 241/1990)**

{{dest.gentile}}, si comunica che {{ente.nome}} ha avviato il procedimento volto all'eventuale adozione del provvedimento di acquisizione, ai sensi dell'art. 42-bis del D.P.R. 327/2001, dei seguenti beni, attualmente utilizzati per scopi di interesse pubblico in assenza di un valido ed efficace provvedimento di esproprio o dichiarativo della pubblica utilità:
[[tabella particelle colonne=comune,fg,map,qual,sup,espr]]
[[tabella intestatari]]
Il provvedimento di acquisizione, ove adottato, dovrà recare la motivazione sulle attuali ed eccezionali ragioni di interesse pubblico che lo giustificano, valutati comparativamente con i contrapposti interessi privati ed evidenziando l'assenza di ragionevoli alternative, e disporrà la corresponsione di un indennizzo per il pregiudizio patrimoniale, pari al valore venale del bene, e non patrimoniale, forfetariamente liquidato nella misura del dieci per cento del valore venale, oltre al risarcimento per il periodo di occupazione senza titolo nella misura del cinque per cento annuo sul valore venale, salvo prova di una diversa entità del danno.
Il responsabile del procedimento è {{ente.rup}}. Entro 30 giorni dal ricevimento della presente la S.V. può prendere visione degli atti e presentare memorie scritte e documenti, che l'Amministrazione ha l'obbligo di valutare.
` + CHIUSURA
    },
    atto_42bis: {
      nome: 'Provvedimento di acquisizione sanante e indennizzo', art: 'art. 42-bis', ambito: 'ditta', fase: 'Acquisizione sanante',
      testo: `# PROVVEDIMENTO DI ACQUISIZIONE
## {{pratica.oggetto}}
**Acquisizione al patrimonio indisponibile di beni utilizzati per scopi di interesse pubblico (art. 42-bis D.P.R. 8.6.2001 n. 327) – Ditta n. {{ditta.n}}**
## {{ente.ruolo}}
**PREMESSO** che i beni di seguito indicati sono utilizzati per scopi di interesse pubblico e sono stati modificati in assenza di un valido ed efficace provvedimento di esproprio o dichiarativo della pubblica utilità;
**DATO ATTO** dell'avvio del procedimento comunicato con {{ditta.ev.avvio42.prot}} del {{ditta.ev.avvio42.data}} e delle memorie eventualmente pervenute;
**VALUTATE** le attuali ed eccezionali ragioni di interesse pubblico, comparativamente con i contrapposti interessi privati, e l'assenza di ragionevoli alternative all'adozione del presente provvedimento: ______________________________________;
{{#dati.premesse}}{{dati.premesseElenco}}
{{/dati.premesse}}{{#dati.visti}}**VISTI:**
{{dati.vistiElenco}}
{{/dati.visti}}## DISPONE
- l'acquisizione non retroattiva al patrimonio indisponibile di {{ente.beneficiario}} dei seguenti beni:
[[tabella particelle colonne=comune,fg,map,qual,sup,espr]]
di proprietà di: {{#ditta.intestatari}}{{anagrafica}} {{diritto}}; {{/ditta.intestatari}}
- la corresponsione dell'indennizzo come di seguito determinato:
[[tabella indennita]]
per complessivi **{{ditta.tot}}** (diconsi euro {{ditta.totLettere}});
- il passaggio del diritto di proprietà è sottoposto alla condizione sospensiva del pagamento delle somme dovute ovvero del loro deposito ai sensi dell'art. 20, comma 14, entro trenta giorni dal presente provvedimento;
- il presente provvedimento è notificato al proprietario, trascritto senza indugio presso il Servizio di Pubblicità Immobiliare ed è trasmesso in copia, entro trenta giorni, alla Corte dei conti (art. 42-bis, comma 7).
{{luogo}}, {{oggi}}
[[firma {{ente.ruolo}}|{{ente.responsabile}}]]`
    },
    cessione: {
      nome: 'Schema di atto di cessione volontaria', art: 'art. 45', ambito: 'ditta', fase: 'Indennità',
      testo: `# ATTO DI CESSIONE VOLONTARIA
## {{pratica.oggetto}}
**Cessione volontaria di beni immobili ai sensi dell'art. 45 D.P.R. 8.6.2001 n. 327 – Ditta n. {{ditta.n}}**
L'anno ________, il giorno ______ del mese di ____________, in ______________, presso ______________,
**TRA**
{{#ditta.intestatari}}
- **{{nome}}** {{nascita}}, C.F. {{cf}}, residente in {{indirizzo}}, titolare del diritto di {{diritto}};
{{/ditta.intestatari}}
di seguito «parte cedente»,
**E**
**{{ente.beneficiario}}**, C.F. {{ente.cfBeneficiario}}, con sede in {{ente.sedeBeneficiario}}, rappresentato da ______________________, di seguito «parte cessionaria»,
**PREMESSO** che con {{atti.dpu.testo}}{{#dati.progetto}} ({{dati.progetto}}){{/dati.progetto}} è stato approvato il progetto dell'opera in oggetto con effetto di dichiarazione di pubblica utilità e che la parte cedente ha comunicato di condividere l'indennità offerta;
{{#dati.premesse}}{{dati.premesseElenco}}
{{/dati.premesse}}**SI CONVIENE E SI STIPULA QUANTO SEGUE**
1. La parte cedente cede alla parte cessionaria, che accetta, i seguenti beni:
[[tabella particelle colonne=comune,fg,map,qual,sup,espr,servtot]]
2. Il corrispettivo della cessione, determinato ai sensi dell'art. 45, comma 2, D.P.R. 327/2001, è stabilito in **{{ditta.tot}}** (diconsi euro {{ditta.totLettere}}), che la parte cessionaria corrisponde con le modalità di cui all'art. 26.
3. La parte cedente garantisce la piena e libera proprietà dei beni, liberi da ipoteche, pesi, vincoli e diritti di terzi.
4. Il possesso dei beni è trasferito alla parte cessionaria dalla data odierna (ovvero è già stato trasferito con verbale del ____________).
5. Il presente atto produce gli effetti del decreto di esproprio e non è soggetto a retrocessione se non nei casi previsti dalla legge (art. 45, comma 3).
6. Le spese del presente atto, della registrazione, trascrizione e voltura sono a carico della parte cessionaria.
Letto, confermato e sottoscritto.
**La parte cedente**
{{#ditta.intestatari}}
______________________________ ({{nome}})
{{/ditta.intestatari}}
[[firma La parte cessionaria|{{ente.beneficiario}}]]`
    },
    pubblico_avviso: {
      nome: 'Pubblico avviso di avvio del procedimento (oltre 50 destinatari)', art: 'art. 11 c.2 – art. 16 c.5', ambito: 'pratica', fase: 'Avvio',
      testo: `# AVVISO PUBBLICO
## {{ente.nome}}
**Avvio del procedimento per l'apposizione del vincolo preordinato all'esproprio e per la dichiarazione di pubblica utilità dei lavori di: {{pratica.oggetto}}{{#pratica.cup}} – CUP {{pratica.cup}}{{/pratica.cup}} (artt. 11, comma 2, e 16, comma 5, D.P.R. 8.6.2001 n. 327)**
## IL RESPONSABILE DEL PROCEDIMENTO
**RENDE NOTO**
- che è avviato il procedimento per l'apposizione del vincolo preordinato all'esproprio e per la dichiarazione di pubblica utilità dell'opera in oggetto;
- che, essendo il numero dei destinatari superiore a cinquanta, la comunicazione personale è sostituita dal presente avviso, pubblicato all'Albo Pretorio dei Comuni interessati, su quotidiani a diffusione nazionale e locale e sul sito informatico della Regione;
- che il progetto, con l'elenco delle aree interessate e dei proprietari catastali, è depositato presso {{ente.ufficio}} {{ente.nome}}{{#dati.consultazione}} ({{dati.consultazione}}){{/dati.consultazione}}, {{ente.indirizzo}}{{#ente.link}}, ed è consultabile all'indirizzo {{ente.link}}{{/ente.link}};
- che entro trenta giorni dalla pubblicazione del presente avviso gli interessati possono presentare osservazioni scritte al responsabile del procedimento, {{ente.rup}}, anche via PEC all'indirizzo {{ente.pec}}.
Elenco delle ditte catastali interessate:
[[tabella piano colonne=np,fg,map,espr,servtot,occ]]
{{luogo}}, {{oggi}}
[[firma {{ente.ruolo}}|{{ente.responsabile}}]]`
    },
    elenco_ditte: {
      nome: 'Piano particellare – elenco delle ditte e indennità', art: 'art. 16 c.1 – All. I.7 D.Lgs. 36/2023', ambito: 'pratica', fase: 'Piano particellare',
      testo: `# PIANO PARTICELLARE DI ESPROPRIO
## {{pratica.oggetto}}{{#pratica.cup}} – CUP {{pratica.cup}}{{/pratica.cup}}
**Elenco delle ditte catastali con l'indicazione dei beni, delle superfici interessate e delle indennità**
[[tabella piano colonne=np,fg,map,qual,sup,rd,ra,espr,servop,serv,occ,ind]]
Indennità complessive: esproprio {{tot.espr}} – servitù {{tot.serv}} – occupazione temporanea {{tot.occ}} – **totale {{tot.tot}}**.
{{luogo}}, {{oggi}}
[[firma Il tecnico|{{ente.tecnico}}]]`
    }
  };
})(ES);
