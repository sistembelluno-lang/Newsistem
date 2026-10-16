# ESPROPRI_SISTEM

Programma per la gestione delle procedure di **esproprio, asservimento e occupazione temporanea** per pubblica utilità
(D.P.R. 8 giugno 2001 n. 327 – Testo unico espropriazioni, «TUES»). Terzo programma della suite SISTEM, accanto a
CONTROLLO_SISTEM e INSERT_SISTEM: stessa struttura (pagina unica `Espropri.html` impacchettata con Electron).

Versione **1.11.0 – prima base**: il flusso completo c'è (disegno → piano particellare → ditte → indennità → documenti →
fascicolo), i modelli e le funzioni si allargheranno nelle prossime versioni.

## Il flusso di lavoro
1. **Pratica**: opera, CUP, ente, firmatari, beneficiario, percorso procedurale (art. 20, 22, 22-bis, cessione art. 45,
   acquisizione sanante art. 42-bis, sola occupazione art. 49) e date/estremi degli atti (vincolo, DPU, comunicazioni…).
2. **Importa DXF/DWG**: si assegna a ogni layer un uso (particelle catastali, esproprio, servitù ingombro opere,
   servitù fascia, occupazione temporanea, numeri di particella, sfondo). Funzionano entrambi i modi di disegnare:
   - aree d'intervento **già tagliate** sui limiti di particella con dentro il numero della particella originaria
     (es. particella 100 di 230 mq tagliata dall'opera: il poligono di 100 mq con il testo «100» sul layer ESPROPRIO);
   - layer delle **particelle catastali** (polilinee chiuse o anche linee sciolte, che vengono ricomposte) con i numeri,
     più le aree d'intervento intere: il programma interseca e divide per particella.
   Le sovrapposizioni si tolgono per priorità (esproprio > servitù opere > servitù fascia > occupazione), le schegge
   sotto la soglia si scartano, le aree senza numero si assegnano a mano. Il DWG si legge nel programma installato
   tramite **ODA File Converter** (gratuito, da installare); altrimenti si salva il disegno come DXF.
3. **Importa Excel/CSV delle ditte** (visure): una riga per particella con foglio, mappale («1706 ex 1367» = mappale
   derivato da frazionamento), qualità («PRATO», «BOSCO ARB»…), classe, superficie (mq o ha/are/ca), redditi,
   intestatari in colonne separate o tutti in una cella come nelle visure. **La ditta è formata dalle particelle con gli
   stessi intestatari e le stesse quote** (ROSSI 500/1000 + VERDI 500/1000 è una ditta; ROSSI 100/1000 + VERDI
   900/1000 è un'altra); il numero di ditta del file diventa il numero di piano. È letto anche il **formato a blocchi
   del riepilogo visure** usato dallo studio (colonne «N.», «Ditta Catastale», «Comune», «Catasto», «Foglio», «Mappale»,
   «Qualità/Classe», «Superficie (mq)», «Rd», «Ra»: numero solo sulla prima riga, intestatari su più righe) e i mappali
   con la barra del catasto di origine austriaca («8611/16»).
4. **Piano particellare**: tabella per ditta con superfici per tipo (dal disegno, eventualmente ragguagliate alla
   superficie catastale, o inserite a mano), categoria di stima e indennità; esportazione Excel, Excel per stampa
   unione (campi «Nome_e_Cognome1», «Foglio1», «Particella1»…), stampa/PDF.
5. **Ditte e iter**: nell'elenco ogni ditta ha le sue **note** (📝) e il pulsante «✏️ Modifica dati»; cliccando una ditta si vedono in alto **i documenti prodotti per quella ditta** (apri, anteprima,
   rigenera); ogni intestatario ha il riquadro dell'**indirizzo di residenza per le comunicazioni** (via, CAP, comune,
   provincia, PEC, mezzo di invio) con l'anteprima dell'intestazione della lettera; la scheda **Indirizzi** raccoglie
   tutti gli intestatari della pratica (una riga per persona, anche se è in più ditte) con import/export Excel.
   Per ogni ditta intestatari (saluto e «nato/nata» ricavati dal codice fiscale; società «Spett.le»),
   conduttore, percorso, e i **passi dell'iter** con date di invio e notifica, protocollo, mezzo e termini calcolati.
6. **Indennità**: valori unitari per categoria e criteri (art. 37, 40, 42, 44, 50, 22-bis, 42-bis, 35), quadro
   riepilogativo e per ditta.
7. **Documenti**, organizzati per passi del percorso: per ogni modello «Genera per tutte le ditte» crea il **file
   generale** con tutte le lettere unite (in `00 GENERALE`) e il **documento di ogni ditta** nella sua cartella (nel
   browser: un unico ZIP con le stesse cartelle), e può segnare il passo come inviato. Il testo di ogni modello si
   modifica in una finestra con due livelli: **testo base** (vale per tutte le pratiche) o **solo questa pratica**, con
   l'elenco dei campi da inserire e l'anteprima; si creano anche modelli nuovi e si esporta/importa la libreria dei
   modelli. I **dati specifici della pratica** (progetto approvato, premesse, visti, finanziamento, consultazione degli
   atti, testo aggiuntivo nelle lettere e campi liberi) si scrivono una volta nella scheda Pratica ed entrano in tutti i
   documenti. Modelli integrati (lettere art. 11+16, art. 16, art. 17 c.2, avvio art. 49, offerta art. 20,
   condivisione, decreto di esproprio art. 22-23 con unità negoziali, decreto 22-bis, avviso di immissione, stato di
   consistenza e verbale, decreto art. 49, restituzione, deposito, pagamento, invito art. 21, estratto BUR, art. 42-bis,
   cessione volontaria, pubblico avviso, elenco ditte) in **Word (.docx)** e PDF, una lettera per ogni intestatario dove
   serve, con l'**estratto di mappa** della ditta. Si possono caricare **i vostri modelli Word**: segnaposto
   `{{campo}}`, righe ripetute `{{#ditta.particelle}}…{{/ditta.particelle}}`, estratto `{{%planimetria}}`; i campi di
   stampa unione già presenti nei vostri documenti vengono riconosciuti.
8. **Fascicolo**: nel programma installato ogni documento si salva in
   `Documenti\ESPROPRI_SISTEM\Pratiche\<pratica>\DITTA 1 ROSSI MARIO\…` (cartella base modificabile), gli atti
   generali in `00 GENERALE`.
9. **Stato di consistenza**: si genera il verbale, si stampa e si fa firmare in sito; poi si caricano le foto (con
   didascalia e particella) e la scansione PDF firmata: il programma crea il **PDF finale** con verbale firmato e pagine
   di documentazione fotografica («Figura 1_Fg. 9 Mapp.859»).
10. **Tavola grafica**: vista interattiva e stampa A4–A0 a scala (retini per tipo, numero di piano, legenda, scala
    grafica, nord, quadro d'unione, cartiglio), estratti per ditta, esportazione SVG e DXF delle aree calcolate.
11. **Scadenze**: tutti i termini della pratica e delle ditte (vincolo 5 anni, DPU 5 anni, osservazioni 30 giorni,
    condivisione, 22-bis 3 mesi, immissione 2 anni, estratto 5 giorni, opposizione terzi 30 giorni…).

## Sviluppo
```
npm install
npm test                  # prove automatiche dei moduli (Node)
npm run build:espropri    # ricompila Espropri.html da espropri/index.html ed espropri/src/
npm run start:espropri    # apre il programma desktop
node scripts/build-espropri.js --demo prova.html   # versione di prova con dati d'esempio già caricati
```
`Espropri.html` si genera: **non modificarlo a mano**. Sorgenti in `espropri/src/`:

| File | Contenuto |
|---|---|
| `core.js` | numeri, date, superfici ha.are.ca, importi in lettere |
| `tabelle.js` | lettura CSV ed Excel .xlsx (senza librerie) |
| `dxf.js` | lettura DXF (polilinee con archi, linee, cerchi, testi, blocchi) e scrittura DXF |
| `geo.js` | aree, punto nel poligono, ricostruzione particelle da linee, intersezioni (polygon-clipping) |
| `analisi.js` | dal disegno alle superfici per particella e tipo; confini N-E-S-O |
| `catasto.js` | importazione ditte, lettura intestatari da testo di visura, codice fiscale, ditte |
| `stima.js` | indennità secondo il TUES |
| `iter.js` | fasi, percorsi procedurali, passi per ditta, scadenze |
| `office.js` | ZIP, Word .docx, compilazione modelli Word dell'utente, Excel .xlsx |
| `modelli.js`, `testi.js` | dati per i documenti, linguaggio dei modelli, modelli integrati |
| `tavola.js` | tavola grafica ed estratti in SVG |
| `normativa.js` | scheda di sintesi della normativa |
| `app.js`, `app2.js` | interfaccia |

Librerie incluse nella pagina (licenza MIT): polygon-clipping 0.15.7, pdf-lib 1.17.1. Dati d'esempio fittizi in
`espropri/esempi/` (`genera_esempio.py`).

## Libreria dei modelli (da convertire nelle prossime versioni)
La libreria fornita (circa 135 modelli RTF/DOC) è organizzata per fase. I modelli integrati coprono già i passaggi
principali; gli altri si possono usare subito come **modelli Word** inserendo i segnaposto, e verranno integrati man
mano. Elenco per fase:

- **art 11**: pubblico avviso avvio procedimento impersonale 12comma2 tues; richiesta albo pretorio 11comma2 tues; richiesta giornali 11comma2 tues; avviso avvio procedimento personale 11comma1a tues; avviso avvio procedimento personale 11comma1b tues; pubblico avviso avvio procedimento impersonale 12comma2 tues massivo; avviso avvio procedimento personale 11comma1a 19 tues; pubblico avviso avvio procedimento impersonale 12comma2 19comma2 tues; richiesta sito regionale 11comma2 tues
- **art 11 + 16**: avviso avvio procedimento personale 11comma1a 16 tues VINCOLO+DPU; avviso avvio procedimento personale 11comma1b 16 tues VINCOLO+DPU; pubblico avviso avvio procedimento impersonale 11comma2 16comma5 tues VINCOLO+DPU; richiesta albo pretorio 11comma2 16comma5 tues; richiesta giornali 11comma2 16comma5 tues; richiesta sito regionale 11comma2 16comma5 tues; deposito atti richiesta avvio procedimento 11+16commi1 2; pronuncia motivata sulle osservazioni 16comma12 tues; pubblico avviso MASSIVO avvio procedimento impersonale 12comma2 16comma5 tues VINCOLO+DPU; avviso avvio procedimento personale 11comma1a 16 19 tues VINCOLO+DPU; pubblico avviso avvio procedimento impersonale 11comma2 16comma5 19comma2 tues VINCOLO+DPU; Comuni avviso ART11 16 AIPO ROVIGO
- **art 14**: Comunicazione esecuzione decreto esproprio 14 3 24 6; Comunicazione impugnazione dpu 14 3 c; Comunicazione impugnazione prg 14 3 c; Comunicazione impugnazione decreto esproprio 14 3 c; Trasmissione dpu 14 1; Trasmissione decreto esproprio 14 1; Comunicazione esecuzione trasmissione decreto esproprio 14 1 14 3 24 6
- **art 15**: Comunicazione avvenuta autorizzazione; Decreto accesso; Richiesta autorizzazione; Verbale delle operazioni; Comunicazione avvenuta richiesta autorizzazione; Invio esito comunicazioni; ART 15
- **art 15 › bim**: decreo art 15 bim; istanza attivazione art 15
- **art 16**: avviso avvio procedimento personale 16comma4 tues; avviso avvio procedimento personale con riunioni 16comma4 tues; deposito atti richiesta avvio procedimento 16commi1 2; pubblico avviso avvio procedimento impersonale 16comma5 tues; richiesta albo pretorio 16comma5 tues; richiesta sito regionale 16comma5 tues; pronuncia motivata sulle osservazioni 16comma12 tues; richiesta giornali 16comma5 tues; pubblico avviso avvio procedimento impersonale MASSIVO 16comma5 tues
- **art 17.2**: avviso avvio procedimento personale 17comma2 SOLO DPU; avviso avvio procedimento personale 17comma2 DPU+VINCOLO
- **art 19**: approvazione progetto definitivo in variante 19comma2; approvazione progetto tecnico economico in variante 19comma2; disposizione efficacia progetto tecnico economico 19comma4; disposizione efficacia progetto definitivo 19comma4
- **art 20 › 1_art 20.1**: elenco beni da espropriare promotore diverso autorita 20co1; richiesta notifica ufficiali giudiziari 20.1; elenco beni da espropriare promotore uguale autorita 20co1; notifica offerta promotore uguale autorita uguale beneficiario 20 1; notifica offerta promotore diverso autorita 20 1
- **art 20 › 2_art 20.1 + 17.2**: notifica offerta promotore diverso autorita 20 1+17co2; elenco beni da espropriare promotore diverso autorita 20co1+17co2; elenco beni da espropriare promotore uguale autorita 20co1+17co2; notifica offerta promotore uguale autorita uguale beneficiario 20 1+17co2; richiesta notifica ufficiali giudiziari 20.1+17co2
- **art 20 › 3_art 20.12-14**: ordinanza deposito indennita condivisa non esclusi diritti alieni 20comma12; richiesta pubblicazione ordinanza deposito indennità condivisa per estratto 26 7; richiesta pubblicazione ordinanza deposito indennità non condivisa per estratto 26 7 Copia; ordinanza deposito indennita non condivisa 20comma14; ordinanza deposito indennita condivisa non incassanti 20comma12
- **art 20 › 4_art 20.2**: invito al proprietario precisazione valore bene 20comma2; invito al beneficiario esproprio precisazione valore bene 20comma2
- **art 20 › 5_art 20.3-4-5**: decreto determinazione indennita provvisoria 20comma3; consultazione uffici 20comma3; richiesta notifica ufficiali giudiziari indennita provvisoria 20comma4; istanza accettazione 20comma5
- **art 20 › 6_art 20.6**: avviso di immissione in possesso 20comma6; ordinanza pagamento acconto 80percento 20comma6; verbale immissione in possesso 20comma6; istanza acconto 80percento 20comma6; richiesta pubblicazione ordinanza pagamento acconto per estratto 26 7
- **art 20 › 7_art 20.7**: designazione tecnico fiducia 20comma7
- **art 20 › 8_art 20.8**: richiesta pubblicazione ordinanza pagamento SALDO intera indennita per estratto 26 7; deposito documentazione richiesta saldo 20comma8; ordinanza pagamento saldo intera somma 20comma8
- **art 20 › 9_Trasferimento del diritto › Atto di cessione**: atto di cessione volontaria 45tues; provvedimento approvazione atto di cessione volontaria 45tues
- **art 20 › 9_Trasferimento del diritto › Decreto di esproprio**: avviso di immissione in possesso 23 1 G; decreto esproprio procedura ordinaria indennita condivisa non incassanti 20comma12; decreto esproprio procedura ordinaria indennita non condivisa 20comma14; decreto esproprio procedura ordinaria indennita condivisa esclusi diritti alieni 20comma11; richiesta pubblicazione per estratto 20 5; verbale immissione in possesso stato consistenza 23 1 h 24; decreto esproprio procedura ordinaria indennita condivisa non esclusi diritti alieni 20comma12
- **art 21 › 1_Adempimenti preliminari**: Elenco non concordatari (Art. 21.1 TU); Invito non concordatari (Art 21.2 TU); Richiesta a U.G. notifica invito (Art. 21.2 TU)
- **art 21 › 2_Collegio tecnici**: Avviso deposito stima definitiva (Art. 21.10 27.1TU); Collegio dei tecnici nomina (Art. 21.3 TU); Deposito stima (Art. 21.10 27.1 TU); Individuazione tecnico di fiducia del proprietario (Art. 21.3 TU); Liquidazione e pagamento competenze (Art. 21.6 27.2 TU); Richiesta nomina terzo tecnico (21.4 TU)
- **art 21 › 3_Commissione provinciale**: Avviso deposito stima (21.16 27.1 TU); Deposito stima (Art. 21.16 27.1); Richiesta stima (Art. 21.15 TU)
- **art 21 › 4_Pagamento-Deposito-Svincolo**: Attestato mancata opposizione di terzi (Art. 28.3.b TU); Autorizzazione pagamento (Art. 28.1 TU); Istanza di svincolo (28.2 TU); Pagamento deposito quota integrativa (Art. 21.12 27.2 TU)
- **art 22 › 1_Decreto**: avviso di immissione in possesso 22 23 1 G; decreto esproprio procedura accelerata 22c1; richiesta pubblicazione decreto esproprio per estratto 22 23 5; verbale immissione in possesso stato consistenza 22 23 1 h 24
- **art 22 › 2_Deposito indennit#U00e0**: Ordine di deposito indennità condivisa (Artt. 22 20.12 26.4 9 TU); Ordine di deposito indennità non condivisa (Artt. 22 26 TU); Richiesta pubblicazione ed estratto indennità non condivisa(Art. 26.7 TU)
- **art 22 › 3_Pagamento indennit#U00e0**: Condivisione indennità (Art. 22.1 22.3 TU); Ordine di pagamento dell'indenità condivisa (Art. 22.3 TU); Richiesta pubblicazione ed estratto (Art. 26.7 TU)
- **art 22bis › 1_Decreto**: Decreto di occupazione; Rideterminazione della indennità di espropriazione; Verbale di immissione nel possesso e stato di consistenza (Artt. 22 bis.4 e 24 TU); Avviso di esecuzione decreto di occupazione (Artt. 22 bis.4 e art. 24 TU)
- **art 22bis › 2_Deposito indennit#U00e0**: Deposito saldo indennità condivisa; Deposito indennità non condivisa
- **art 22bis › 3_Pagamento indennit#U00e0**: Condivisione della indennità ed autocertificazione; Ordine di pagamento 80 per cento Art. 22 bis.3 TU); Pagamento saldo indennità di espropriazione (Artt. 22 bis 20.8 TU)
- **art 22bis › 4_Trasferimento del diritto**: Decreto di esproprio a seguito di corresponsione deposito indennità condivisa; Decreto di esproprio a seguito di deposito indennità non condivisa
- **art 49**: avviso avvio procedimento comunicazione personale 49; avviso esecuzione decreto occupazione 49; decreto occupazione temporanea 49; verbale immissione in possesso occupazione temporanea 49; pronuncia motivata sulle osservazioni 49+7 241; avviso di restituzione 49; verbale restituzione aree occupate temporaneamente 49

## Prossimi passi previsti
- conversione dei modelli della libreria in modelli integrati (art. 14, 15, 19, 20 completo, 21, 26, depositi e svincoli);
- firma a schermo (tablet) nello stato di consistenza;
- lettura dei formati catastali CXF e GML (cartografia dell'Agenzia delle Entrate) e delle visure PDF;
- reliquati, aree demaniali e interferenze come ulteriori tipi d'area; più fogli e comuni con quadro d'unione;
- protocollo e registro delle notifiche con ricevute PEC/raccomandate.
