# ESPROPRI_SISTEM – Guida dei processi

Versione 1.18.0. Guida generata dal programma: percorsi, passi, termini e documenti sono quelli che il programma usa. I termini sono promemoria del D.P.R. 327/2001 (TUES) e della L. 241/1990: vanno sempre verificati sul testo vigente e sugli atti della pratica.

## 1. Il lavoro in breve

- **Nuova pratica** → dati dell'ente, del progetto, del responsabile; **cartella di lavoro** (es. `L:\…\05-Espropri`): dentro il programma crea `ESPROPRI_SISTEM` con `00 GENERALE` e una cartella per ditta (`DITTA 1 COGNOME NOME`).
- **Importa** il disegno (DXF, DWG o tavola PDF) e l'**Excel delle visure**: le ditte si formano dalle particelle con gli stessi intestatari e le stesse quote.
- **Piano particellare**: superfici per particella e per tipo (esproprio, servitù, occupazione); si correggono a mano quelle misurate.
- **Ditte e iter**: per ogni ditta intestatari, indirizzi di residenza, note, percorso della procedura e date dei passi.
- **Indennità**: valori unitari e criteri; quadro per ditta.
- **Documenti**: per ogni passo il documento generale (tutte le ditte, «stampa unione») e quello della singola ditta nella sua cartella; il testo base si modifica per tutte le pratiche o solo per quella aperta.
- **Scadenze**: termini calcolati dalle date registrate; **stati di consistenza** con foto e scansione firmata → PDF finale.

## 2. Dal disegno alle ditte

### Disegno

- **DXF/DWG**: aree d'intervento già tagliate sulle particelle con il numero dentro, oppure layer delle particelle + aree intere (il programma taglia da solo). Si sceglie l'uso di ogni layer; le sovrapposizioni si tolgono per priorità esproprio > servitù ingombro opere > servitù fascia > occupazione.
- **Tavola PDF** (esportata dal CAD, non scansionata): lettura «a occhio» di legenda, simboli (colori, tratteggi), aree, confini, numeri di particella, scala e fogli. Si controllano tipo delle voci di legenda, colori non spiegati e scala (anche stimata dalle superfici catastali). Le superfici sono marcate «dal PDF – da verificare».
- Mappa catastale a immagine (numeri disegnati, non scritti): il programma legge i numeri con il riconoscimento dei caratteri (OCR) e da ogni numero ricostruisce la particella seguendo le linee della mappa, anche sotto le aree colorate. Il confronto con il PDF originale mostra sopra la tavola i contorni riconosciuti.
- Legende con i nomi delle ditte o colori senza legenda: si dice al programma il tipo di ogni colore. Se una campitura copre tutta la particella e dentro c'è una fascia, di solito la campitura indica solo la particella interessata e l'area è la fascia: il programma lo segnala.
- Scala: quella letta nel cartiglio si vede e si cambia prima della lettura; dopo l'importazione si corregge dalla Tavola grafica (scala giusta, unità del DXF o taratura su una particella di superficie nota).
- Aree senza numero di particella: si assegnano a mano nella scheda Importa.

## 2-bis. Tavola grafica e schemi delle ditte

- **Tavola generale** in scala vera (stampa al 100%): particelle con i numeri, aree con i retini, cerchietto della ditta con i richiami alle sue particelle, legenda, quadro d'unione, elenco ditte, cartiglio; a scelta quote dei lati e superfici.
- **Estratto** di una ditta e **taglio** mappale per mappale con quote e superfici: sono lo **schema del piano particellare** allegato alla convocazione per lo stato di consistenza e allo stato di consistenza stesso (comandi [[planimetria]] e [[tagli]] nei modelli).
- Dalla scheda della ditta, **🗺️ Mostra aree** apre estratto e tagli da scorrere e li salva in PDF nella cartella della ditta.

### Excel delle ditte

- Formato a blocchi del riepilogo visure (N., Ditta Catastale, Comune, Catasto, Foglio, Mappale, Qualità/Classe, Superficie, Rd, Ra) o una riga per particella.
- Ditta = stessi intestatari **e** stesse quote (ROSSI 500/1000 + VERDI 500/1000 ≠ ROSSI 100/1000 + VERDI 900/1000).
- Codice fiscale mancante o errato: la ditta si crea lo stesso e viene segnalata; il codice si inserisce nella scheda della ditta.
- Indirizzi di residenza: nella scheda della ditta o nella scheda Indirizzi (import/export Excel).

## 3. Fasi della pratica (una data per pratica)

Si registrano nella scheda Pratica; dalle date nascono i termini dello scadenzario.

| Fase | Articolo | Termini che ne derivano |
|---|---|---|
| Accesso ai fondi per rilievi | art. 15 | Avviso ai proprietari almeno 7 giorni prima dell'accesso |
| Avvio procedimento apposizione vincolo | art. 11 | Osservazioni dei proprietari (30 giorni); Delibera/atto non prima di 20 giorni dall'avviso |
| Avvio procedimento dichiarazione di pubblica utilità | art. 16 | Osservazioni dei proprietari (30 giorni, perentorio) |
| Vincolo preordinato all'esproprio efficace | artt. 9-10 | Decadenza del vincolo (5 anni) |
| Dichiarazione di pubblica utilità efficace (approvazione progetto) | artt. 12-13 | Termine per il decreto di esproprio (5 anni, prorogabile fino a 2); Elenco beni e offerta (procedura ordinaria) entro 30 giorni |
| Proroga della dichiarazione di pubblica utilità | art. 13 c.5 | — |
| Comunicazione efficacia DPU ai proprietari | art. 17 c.2 | Osservazioni ed elementi per la stima (30 giorni) |
| Frazionamento catastale approvato | — | — |
| Decreto di esproprio / asservimento / occupazione | artt. 22, 22-bis, 23 | Trasmissione estratto per BUR/GURI (5 giorni); Esecuzione con immissione in possesso (2 anni, perentorio) |
| Decreto di occupazione d'urgenza | art. 22-bis | Immissione in possesso entro 3 mesi (altrimenti il decreto perde efficacia) |
| Pubblicazione estratto sul BUR / GURI | art. 23 c.5 | Opposizione dei terzi (30 giorni) |
| Registrazione, trascrizione e voltura | art. 23 c.4 | — |
| Avvio procedimento occupazione temporanea | art. 49 – art. 7 L. 241/1990 | Memorie e documenti (15 giorni) |
| Decreto di occupazione temporanea | art. 49 | — |
| Provvedimento di acquisizione sanante | art. 42-bis | Pagamento o deposito dell'indennizzo (30 giorni, condizione sospensiva); Comunicazione alla Corte dei conti (30 giorni) |
| Ultimazione dell'opera | art. 46 | — |

## 4. Percorsi per ditta

Ogni ditta segue il percorso della pratica o uno proprio (es. una ditta in cessione volontaria). Per ogni passo: documenti che il programma genera e termini per la ditta («dalla notifica» = dalla data di notifica registrata).

### Ordinaria (art. 20)

Quando: procedura ordinaria: offerta e indennità provvisoria prima del decreto.

| N. | Passo | Articolo | Documenti | Termini |
|---|---|---|---|---|
| 1 | Avviso di avvio del procedimento (vincolo e/o DPU) | artt. 11 e 16 | Avviso di avvio del procedimento – vincolo e dichiarazione di pubblica utilità; Avviso di avvio del procedimento – sola dichiarazione di pubblica utilità | Osservazioni (30 giorni dal ricevimento) |
| 2 | Comunicazione efficacia DPU e invito a fornire elementi per la stima | art. 17 c.2 | Comunicazione efficacia DPU e invito a fornire elementi per la stima | Osservazioni ed elementi per la stima (30 giorni) |
| 3 | Notifica elenco beni e somma offerta | art. 20 c.1 | Notifica elenco dei beni e somma offerta per l'espropriazione | Osservazioni e documenti (30 giorni dalla notifica) |
| 4 | Determinazione e notifica dell'indennità provvisoria | art. 20 c.3-4 | Notifica elenco dei beni e somma offerta per l'espropriazione | Condivisione dell'indennità (30 giorni dalla notifica) |
| 5 | Condivisione dell'indennità e dichiarazione di piena proprietà | artt. 20 c.5-6, 22 c.3 | Dichiarazione di condivisione dell'indennità e di piena proprietà | Documentazione di piena e libera proprietà (60 giorni) |
| 6 | Pagamento dell'indennità | artt. 20 c.8, 26 | Ordinanza di pagamento diretto delle indennità condivise | — |
| 7 | Deposito presso MEF – Ragioneria Territoriale dello Stato | artt. 20 c.14, 26 | Ordinanza di deposito delle indennità non condivise (MEF – RTS) | — |
| 8 | Decreto di esproprio | artt. 20, 23 | Decreto di esproprio dopo pagamento o deposito dell'indennità (artt. 20, 22-bis, 23); Estratto del decreto per la pubblicazione sul BUR / GURI | — |
| 9 | Notifica del decreto con avviso di immissione in possesso | art. 23 c.1 lett. g | Avviso di immissione in possesso e redazione dello stato di consistenza | Immissione non prima di 7 giorni dalla notifica |
| 10 | Stato di consistenza e verbale di immissione in possesso | art. 24 | Rilievo dello stato di consistenza e verbale di immissione in possesso | — |
| 11 | Determinazione definitiva (collegio tecnici o Commissione provinciale) | art. 21 | Invito ai non concordatari a designare il tecnico di fiducia | Designazione del tecnico di fiducia (20 giorni) |

### Decreto con indennità urgente (art. 22)

Quando: urgenza (art. 22 c.2) o oltre 50 destinatari: decreto con indennità determinata in via urgente, poi condivisione entro 30 giorni dall'immissione.

| N. | Passo | Articolo | Documenti | Termini |
|---|---|---|---|---|
| 1 | Avviso di avvio del procedimento (vincolo e/o DPU) | artt. 11 e 16 | Avviso di avvio del procedimento – vincolo e dichiarazione di pubblica utilità; Avviso di avvio del procedimento – sola dichiarazione di pubblica utilità | Osservazioni (30 giorni dal ricevimento) |
| 2 | Comunicazione efficacia DPU e invito a fornire elementi per la stima | art. 17 c.2 | Comunicazione efficacia DPU e invito a fornire elementi per la stima | Osservazioni ed elementi per la stima (30 giorni) |
| 3 | Decreto di esproprio con determinazione urgente dell'indennità | artt. 22, 23 | Decreto di esproprio con determinazione urgente dell'indennità (art. 22); Estratto del decreto per la pubblicazione sul BUR / GURI | — |
| 4 | Notifica del decreto con avviso di immissione in possesso | art. 23 c.1 lett. g | Avviso di immissione in possesso e redazione dello stato di consistenza | Immissione non prima di 7 giorni dalla notifica |
| 5 | Stato di consistenza e verbale di immissione in possesso | art. 24 | Rilievo dello stato di consistenza e verbale di immissione in possesso | — |
| 6 | Condivisione dell'indennità (entro 30 giorni dall'immissione) | art. 22 c.3 | Dichiarazione di condivisione dell'indennità e di piena proprietà | Termine per la condivisione |
| 7 | Pagamento dell'indennità | artt. 20 c.8, 26 | Ordinanza di pagamento diretto delle indennità condivise | — |
| 8 | Deposito presso MEF – Ragioneria Territoriale dello Stato | artt. 20 c.14, 26 | Ordinanza di deposito delle indennità non condivise (MEF – RTS) | — |
| 9 | Determinazione definitiva (collegio tecnici o Commissione provinciale) | art. 21 | Invito ai non concordatari a designare il tecnico di fiducia | Designazione del tecnico di fiducia (20 giorni) |

### Occupazione d'urgenza preordinata (art. 22-bis)

Quando: avvio lavori urgente: occupazione d'urgenza preordinata all'esproprio, acconto 80% a chi condivide, decreto di esproprio entro il termine della DPU.

| N. | Passo | Articolo | Documenti | Termini |
|---|---|---|---|---|
| 1 | Avviso di avvio del procedimento (vincolo e/o DPU) | artt. 11 e 16 | Avviso di avvio del procedimento – vincolo e dichiarazione di pubblica utilità; Avviso di avvio del procedimento – sola dichiarazione di pubblica utilità | Osservazioni (30 giorni dal ricevimento) |
| 2 | Comunicazione efficacia DPU e invito a fornire elementi per la stima | art. 17 c.2 | Comunicazione efficacia DPU e invito a fornire elementi per la stima | Osservazioni ed elementi per la stima (30 giorni) |
| 3 | Decreto di occupazione d'urgenza e indennità provvisoria | art. 22-bis | Decreto di occupazione d'urgenza preordinata all'esproprio | — |
| 4 | Avviso di esecuzione del decreto di occupazione | artt. 22-bis c.4, 24 | Avviso di immissione in possesso e redazione dello stato di consistenza | Immissione non prima di 7 giorni dalla notifica |
| 5 | Stato di consistenza e verbale di immissione in possesso | artt. 22-bis c.4, 24 | Rilievo dello stato di consistenza e verbale di immissione in possesso | — |
| 6 | Condivisione dell'indennità (entro 30 giorni dall'immissione) – acconto 80% | art. 22-bis c.3 | Dichiarazione di condivisione dell'indennità e di piena proprietà | Termine per la condivisione |
| 7 | Pagamento dell'indennità | artt. 20 c.8, 26 | Ordinanza di pagamento diretto delle indennità condivise | — |
| 8 | Deposito presso MEF – Ragioneria Territoriale dello Stato | artt. 20 c.14, 26 | Ordinanza di deposito delle indennità non condivise (MEF – RTS) | — |
| 9 | Decreto di esproprio (entro il termine della DPU) | artt. 22-bis, 23 | Decreto di esproprio dopo pagamento o deposito dell'indennità (artt. 20, 22-bis, 23); Estratto del decreto per la pubblicazione sul BUR / GURI | — |
| 10 | Determinazione definitiva (collegio tecnici o Commissione provinciale) | art. 21 | Invito ai non concordatari a designare il tecnico di fiducia | Designazione del tecnico di fiducia (20 giorni) |

### Cessione volontaria (art. 45)

Quando: il proprietario accetta l'indennità: atto di cessione volontaria al posto del decreto.

| N. | Passo | Articolo | Documenti | Termini |
|---|---|---|---|---|
| 1 | Avviso di avvio del procedimento (vincolo e/o DPU) | artt. 11 e 16 | Avviso di avvio del procedimento – vincolo e dichiarazione di pubblica utilità; Avviso di avvio del procedimento – sola dichiarazione di pubblica utilità | Osservazioni (30 giorni dal ricevimento) |
| 2 | Comunicazione efficacia DPU e invito a fornire elementi per la stima | art. 17 c.2 | Comunicazione efficacia DPU e invito a fornire elementi per la stima | Osservazioni ed elementi per la stima (30 giorni) |
| 3 | Offerta dell'indennità | art. 20 c.1 | Notifica elenco dei beni e somma offerta per l'espropriazione | Osservazioni (30 giorni) |
| 4 | Istanza di cessione volontaria | art. 45 | Dichiarazione di condivisione dell'indennità e di piena proprietà | — |
| 5 | Atto di cessione volontaria | art. 45 | Schema di atto di cessione volontaria | — |
| 6 | Pagamento dell'indennità | artt. 20 c.8, 26 | Ordinanza di pagamento diretto delle indennità condivise | — |

### Acquisizione sanante (art. 42-bis)

Quando: opera già realizzata senza valido titolo espropriativo: acquisizione sanante con indennizzo (pregiudizio patrimoniale + 10% non patrimoniale + 5% annuo per l'occupazione).

| N. | Passo | Articolo | Documenti | Termini |
|---|---|---|---|---|
| 1 | Avvio del procedimento di acquisizione | art. 42-bis – art. 7 L. 241/1990 | Avvio del procedimento di acquisizione sanante | Memorie e documenti (giorni indicati nell'avviso) |
| 2 | Provvedimento di acquisizione e indennizzo | art. 42-bis c.1-4 | Provvedimento di acquisizione sanante e indennizzo | Pagamento o deposito entro 30 giorni dal provvedimento |
| 3 | Pagamento dell'indennità | artt. 20 c.8, 26 | Ordinanza di pagamento diretto delle indennità condivise | — |
| 4 | Deposito presso MEF – Ragioneria Territoriale dello Stato | artt. 20 c.14, 26 | Ordinanza di deposito delle indennità non condivise (MEF – RTS) | — |

### Sola occupazione temporanea (art. 49)

Quando: aree che servono solo per il cantiere: occupazione temporanea non preordinata all'esproprio e restituzione.

| N. | Passo | Articolo | Documenti | Termini |
|---|---|---|---|---|
| 1 | Avvio del procedimento di occupazione temporanea | art. 49 – art. 7 L. 241/1990 | Avvio del procedimento di occupazione temporanea non preordinata all'esproprio | Memorie e documenti (15 giorni) |
| 2 | Decreto di occupazione temporanea | artt. 49-50 | Decreto di occupazione temporanea e determinazione dell'indennità | — |
| 3 | Avviso di esecuzione dell'occupazione | art. 49 c.4 | Avviso di immissione in possesso e redazione dello stato di consistenza | Immissione non prima di 7 giorni dalla notifica |
| 4 | Verbale di immissione e stato di consistenza | art. 49 | Rilievo dello stato di consistenza e verbale di immissione in possesso | — |
| 5 | Avviso e verbale di restituzione delle aree | art. 49 | Avviso di restituzione delle aree occupate temporaneamente | — |
| 6 | Pagamento dell'indennità | artt. 20 c.8, 26 | Ordinanza di pagamento diretto delle indennità condivise | — |

## 5. Documenti

Per ogni documento il programma produce il file generale (tutte le ditte) in `00 GENERALE` e il file della ditta nella sua cartella, in Word e/o PDF; ogni documento prodotto compare nella scheda della ditta.

| Fase | Documento | Riferimento |
|---|---|---|
| Avvio | Avviso di avvio del procedimento – vincolo e dichiarazione di pubblica utilità | artt. 11 e 16 |
| Avvio | Avviso di avvio del procedimento – sola dichiarazione di pubblica utilità | art. 16 c.4 |
| Avvio | Pubblico avviso di avvio del procedimento (oltre 50 destinatari) | art. 11 c.2 – art. 16 c.5 |
| Dichiarazione di pubblica utilità | Comunicazione efficacia DPU e invito a fornire elementi per la stima | art. 17 c.2 |
| Occupazione temporanea | Avvio del procedimento di occupazione temporanea non preordinata all'esproprio | art. 49 – art. 7 L. 241/1990 |
| Occupazione temporanea | Decreto di occupazione temporanea e determinazione dell'indennità | artt. 49 e 50 |
| Occupazione temporanea | Avviso di restituzione delle aree occupate temporaneamente | art. 49 |
| Indennità | Notifica elenco dei beni e somma offerta per l'espropriazione | art. 20 c.1 |
| Indennità | Dichiarazione di condivisione dell'indennità e di piena proprietà | artt. 20 c.5-6, 22 c.3, 22-bis c.3, 45 |
| Indennità | Ordinanza di deposito delle indennità non condivise (MEF – RTS) | artt. 20 c.14, 26 |
| Indennità | Ordinanza di pagamento diretto delle indennità condivise | artt. 20 c.8, 26 |
| Indennità | Invito ai non concordatari a designare il tecnico di fiducia | art. 21 c.2 |
| Indennità | Schema di atto di cessione volontaria | art. 45 |
| Decreto | Decreto di esproprio con determinazione urgente dell'indennità (art. 22) | artt. 22 e 23 |
| Decreto | Decreto di esproprio dopo pagamento o deposito dell'indennità (artt. 20, 22-bis, 23) | artt. 20, 22-bis, 23, 26 |
| Decreto | Decreto di occupazione d'urgenza preordinata all'esproprio | art. 22-bis |
| Decreto | Estratto del decreto per la pubblicazione sul BUR / GURI | art. 23 c.5 |
| Esecuzione | Avviso di immissione in possesso e redazione dello stato di consistenza | art. 23 c.1 lett. g – art. 24 |
| Esecuzione | Rilievo dello stato di consistenza e verbale di immissione in possesso | artt. 22, 22-bis, 24, 49 |
| Acquisizione sanante | Avvio del procedimento di acquisizione sanante | art. 42-bis – art. 7 L. 241/1990 |
| Acquisizione sanante | Provvedimento di acquisizione sanante e indennizzo | art. 42-bis |
| Piano particellare | Piano particellare – elenco delle ditte e indennità | art. 16 c.1 – All. I.7 D.Lgs. 36/2023 |

- Testo base: modificabile per tutte le pratiche (livello «base») o solo per la pratica aperta; si torna sempre all'originale.
- Dati specifici della pratica (progetto approvato, premesse, visti, finanziamento…) e campi aggiunti: si inseriscono una volta e compaiono nei documenti.
- Modelli Word dello studio: si caricano con i segnaposto {{…}} o i campi unione.

## 6. Stato di consistenza e immissione in possesso

- Si genera il verbale per la ditta, si stampa e si compila e firma sul posto.
- Si caricano le foto (con didascalia e particella) e la scansione PDF firmata: il programma crea il PDF finale con verbale firmato e pagine delle foto nella cartella della ditta.
- La data del verbale di immissione fa partire i termini «dall'immissione» (condivisione dell'indennità negli artt. 22 e 22-bis).

## 6-quater. Mother File System (Excel con tutti i dati)

- In alto a destra, **MOTHER FILE › ⬇ Export**: un Excel con tutti i dati della pratica nei fogli PRATICA (ente e dati per i documenti), ATTI, DITTE, INTESTATARI (nomi, C.F., nascita, diritti, quote, indirizzi, PEC), PARTICELLE (dati catastali, superfici di progetto, stima) e ITER (date, notifiche e protocolli di ogni passo per ditta). Nel programma installato si salva anche in «00 GENERALE».
- Si correggono **solo le celle gialle**; le grigie (codici ID e valori calcolati) sono bloccate e il foglio è protetto: non si aggiungono, tolgono o spostano righe e colonne. Date gg/mm/aaaa, SI/NO dove richiesto, elenchi a discesa per i codici.
- Superfici di progetto: il valore cambiato diventa un valore inserito a mano; svuotando la cella si torna al valore dal disegno.
- **MOTHER FILE › ⬆ Import**: il programma controlla formato, pratica, fogli, intestazioni, numero e ordine delle righe e ogni valore. Se qualcosa non torna **rifiuta il file per intero** e spiega perché (la pratica non cambia); se è valido mostra l'elenco delle modifiche (prima → dopo) e le applica solo con la conferma.
- Prima di applicare tiene una copia della pratica: il pulsante **↶** accanto a MOTHER FILE annulla l'ultima importazione.
- Se nel programma si aggiungono o tolgono ditte, intestatari o particelle dopo l'esportazione, il vecchio file viene rifiutato: si esporta un nuovo Mother File.

## 6-ter. Carta intestata, estratti di mappa, documenti e file inseriti

- **Carta intestata** (Pratica › 🏛️ Carta intestata dell'ente): si scrivono nel programma il **taglio alto** (intestazione) e il **taglio basso** (piè di pagina) con loghi, tabelle, testi e dati dell'ente (come campi che si aggiornano da soli, es. {{ente.nome}}); si può partire da un Word .docx dell'ente con «Importa da Word» e poi correggere. Vale per tutti i documenti: Word (intestazione e piè di pagina veri), anteprima e PDF; «Usa per tutte le pratiche» la rende predefinita.
- **Foto dello stato di consistenza** (scheda ditta): si trascinano, si incollano o si scelgono anche molte insieme; al caricamento si indica la particella (della ditta, o foglio e mappale scritti a mano) e una didascalia comune, poi ogni foto ha il suo foglio/mappale e la sua didascalia, che compaiono sotto la foto nel PDF finale («Figura N_Fg. x Mapp. y – didascalia»); «Ordina per particella» le raggruppa.
- **Estratti di mappa della ditta** (scheda ditta, con didascalia e foglio/mappale sotto ogni immagine): si caricano una o più immagini (png, jpg…) con le occupazioni della ditta; se ci sono, sostituiscono l'estratto automatico dalla planimetria in tutti i documenti (anche senza aver importato DXF o PDF).
- **Inserisci nuovo documento**: in Documenti, in ogni passo della procedura, accanto ai documenti standard (es. art. 22 e successivi); il nuovo modello resta collegato al passo e compare anche nell'iter della ditta. **📎 Inserisci file** aggiunge al fascicolo un documento già pronto (PDF firmato, ricevuta, scansione) per la pratica o per le ditte, con la data del passo.
- **PDF per la stampa fronte/retro**: ogni documento (intestatario o ditta) ha la sua numerazione «Pag. 1 di N» e, se finisce su una pagina dispari, è seguito da un foglio bianco, così il documento successivo comincia sempre su un foglio nuovo.

## 6-bis. Ricerca sul web

- Per i casi difficili: una domanda in italiano (es. «cosa succede se la particella da espropriare è edificabile?»); il programma cerca in rete norme, sentenze e prassi e dà una risposta di sintesi con l'elenco delle fonti da aprire e verificare. Usa il servizio Claude di Anthropic con una chiave API dell'ufficio; non si inviano dati personali delle ditte. Non sostituisce il parere legale.

## 7. Controlli prima dell'invio

- **⚠️ Problemi da risolvere**: tutto quello che il programma non ha capito o che manca (dati dell'ente, aree senza particella, particelle senza superfici o senza categoria di stima, codici fiscali, quote, indirizzi, termini scaduti), con il collegamento alla schermata dove si corregge; l'elenco si esporta in Excel.
- **Area d'intervento più grande della superficie catastale** (es. 210 mq su una particella di 200 mq, per gli errori della mappa): il programma lo segnala e l'operatore sceglie, d'accordo con la committenza, se usare la superficie catastale (le superfici dal disegno si riducono in proporzione) o tenere la misura.
- Banner dei controlli sulle ditte: codice fiscale mancante o errato, quote che non tornano o non indicate, indirizzo mancante.
- Particelle del disegno non presenti nell'elenco ditte e particelle dell'elenco senza superfici: segnalate nella scheda Importa.
- **Foglio e mappale delle particelle ricostruite** sempre modificabili: nella tabella «Particelle ricostruite» del risultato dell'importazione e con un clic sulla tavola grafica (✏️ Foglio / mappale), per le particelle vicine su fogli diversi (es. Fg. 10 e Fg. 22).
- **Esporta DXF da correggere in CAD**: la planimetria ricostruita con i layer del programma (PARTICELLE, PARTICELLE_NUMERI, ESPROPRIO, SERVITU_INGOMBRO_OPERE, SERVITU_FASCIA, OCCUPAZIONE_TEMPORANEA, SFONDO_CARTOGRAFIA) in metri; corretta in CAD si reimporta da Importa › Disegno e resta allineata.
- Scadenze: in rosso i termini scaduti, in arancio quelli entro 15 giorni.
