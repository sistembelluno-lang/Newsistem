# Guida installazione: Controllo Lavori e Ore Dipendenti

Versione 1.7.0 · 5 ottobre 2026

## Panoramica

Due programmi e una cartella sul server: i dipendenti inseriscono le ore con **Ore Dipendenti**, l'amministratore gestisce tutto con **Controllo Lavori**, installato solo sul suo PC.

| Programma | Dove si installa | Chi lo usa | A cosa serve |
| --- | --- | --- | --- |
| Controllo Lavori | solo il PC dell'amministratore | amministratore | lavori, importi, preventivi, fatture, dipendenti e PIN, report mensili per le buste paga |
| Ore Dipendenti | ogni PC dei dipendenti | dipendenti, ciascuno con il proprio PIN | inserire le proprie ore e assenze |

**Cosa può fare un dipendente** in Ore Dipendenti, e nient'altro:

- inserire le ore lavorate su un lavoro, scelto dall'elenco dei codici;
- spuntare **Ore in trasferta**;
- registrare le **uscite in cantiere** sui lavori Worksite;
- inserire **km** e **spese**;
- segnare **ferie** e **permessi** (oltre a malattia e a una nota del giorno);
- vedere, correggere e stampare solo le **proprie** registrazioni.

**Cosa non può fare un dipendente:**

- aprire Controllo Lavori: non è installato sul suo PC e, sul PC dell'amministratore, all'apertura chiede un PIN che conosce solo l'amministratore;
- vedere importi, preventivi, fatturato o note dei lavori: dalla cartella condivisa legge solo codice, nome e cliente;
- vedere le ore dei colleghi o cambiare dipendenti, PIN ed elenco dei lavori.

Le ore inserite dai dipendenti entrano da sole nel lavoro, senza approvazione: si sommano a **Ore totali**, anche a **Ore trasferta** se c'è la spunta, i km a **Km** e le spese a **Extra €**.

## File da scaricare

Tutti i programmi si scaricano dalla pagina [Controllo Lavori e Ore Dipendenti, ultima versione](https://github.com/sistembelluno-lang/Newsistem/releases/latest), in fondo alla voce **Assets**. Se GitHub chiede di accedere, usa l'account **sistembelluno-lang**.

| PC | Programma | File da scaricare |
| --- | --- | --- |
| Amministratore (Windows 7, 32 bit) | Controllo Lavori | [Controllo-Lavori-1.7.0-Windows7-32bit-setup.exe](https://github.com/sistembelluno-lang/Newsistem/releases/download/v1.7.0/Controllo-Lavori-1.7.0-Windows7-32bit-setup.exe) |
| Ogni dipendente (Windows 7, 8, 10 o 11) | Ore Dipendenti | [Ore-Dipendenti-1.7.0-Windows7-32bit-setup.exe](https://github.com/sistembelluno-lang/Newsistem/releases/download/v1.7.0/Ore-Dipendenti-1.7.0-Windows7-32bit-setup.exe) |

- I file **Windows7-32bit** funzionano su tutti i Windows dal 7 in poi: usa questi su tutti i PC, così la versione è la stessa ovunque.
- I file **-portable.exe** partono senza installazione (utili per una prova); i **-setup.exe** installano il programma con l'icona nel menu Start: consigliati.
- Non dare mai ai dipendenti il file **Controllo-Lavori**: serve solo sul PC dell'amministratore.

Copia `Ore-Dipendenti-1.7.0-Windows7-32bit-setup.exe` in una cartella del server, ad esempio `\\SERVER\Programmi`: da lì lo installi su ogni PC senza chiavette.

## Passo 1 · Server (per il tecnico, circa 10 minuti)

Sul server servono due cartelle: una condivisa con i dipendenti e una privata dell'amministratore.

1. Crea la cartella condivisa **`\\SERVER\ControlloLavori`** e, al suo interno, la sottocartella **`ore`**.
2. Crea la cartella privata **`\\SERVER\Amministrazione\ControlloLavori`**, accessibile solo all'amministratore. Qui finiscono i dati veri dei lavori.
3. Crea **`\\SERVER\Programmi`** per l'installatore di Ore Dipendenti.
4. Imposta i permessi come in tabella.
5. Includi le tre cartelle nei backup periodici del server.

| Cartella | Amministratore | Dipendenti |
| --- | --- | --- |
| `\\SERVER\ControlloLavori` | controllo completo | sola lettura |
| `\\SERVER\ControlloLavori\ore` | controllo completo | modifica |
| `\\SERVER\Amministrazione\ControlloLavori` | controllo completo | nessun accesso |
| `\\SERVER\Programmi` | controllo completo | sola lettura |

Con questi permessi un dipendente può scrivere solo le proprie ore e non può modificare l'elenco dei dipendenti, i PIN o l'elenco dei lavori. Se i PC usano un utente Windows comune, il tecnico assegna i permessi "dipendenti" a quell'utente.

## Passo 2 · PC dell'amministratore (Windows 7, 32 bit)

Si fa una volta sola, in circa 15 minuti. Tieni a portata di mano il tuo backup `.json` e i nomi dei dipendenti.

**Installare il programma**

1. Scarica `Controllo-Lavori-1.7.0-Windows7-32bit-setup.exe` (vedi "File da scaricare") e fai doppio clic.
2. Se compare un avviso di sicurezza, scegli **Esegui** (su Windows 10/11: "Ulteriori informazioni" → "Esegui comunque").
3. Lascia la cartella proposta, premi **Installa**, poi **Fine**. Si apre Controllo Lavori.

**Caricare i tuoi dati**

4. Premi **Importa dati** → **Scegli file .json…** e scegli il tuo backup. Va fatto solo la prima volta: da qui in poi ogni modifica si salva da sola.
5. Sotto le tariffe c'è la riga "Salvataggio automatico in …". Premi **Cambia cartella** e scegli la cartella privata **`\\SERVER\Amministrazione\ControlloLavori`**. Non scegliere mai `\\SERVER\ControlloLavori`, che è quella dei dipendenti.

**Proteggere il programma**

6. Premi **👥 Ore dipendenti** → **Impostazioni** → **Imposta PIN di apertura**. Scegli un PIN di 4-8 cifre diverso da quelli dei dipendenti e ripetilo. Da ora Controllo Lavori chiede il PIN a ogni apertura e dopo 20 minuti senza attività; con **🔒 Blocca** lo chiudi subito quando ti allontani.
7. Proteggi anche il tuo utente di Windows con una password.

**Collegare il server**

8. Sempre in **Impostazioni**, alla voce "Cartella condivisa sul server", premi **Scegli cartella…**. Nella finestra scrivi `\\SERVER\ControlloLavori` nella casella **Cartella**, premi Invio e poi **Seleziona cartella**.

**Creare i dipendenti**

9. Apri la scheda **Dipendenti e PIN**.
10. Premi **Imposta PIN amministratore**: è il PIN con cui entri nel programma Ore Dipendenti di qualsiasi PC.
11. Per ogni persona: **+ Aggiungi dipendente**, scrivi nome e cognome, premi **Imposta** e scegli il suo PIN.
12. Nella colonna "Ore su lavori" scegli **Tutti i lavori** oppure **Solo cantieri (Worksite)**; lascia spuntato **Ferie, permessi, malattia** e **Attivo**.
13. Premi **Salva dipendenti**. L'elenco dei lavori viene pubblicato sul server in automatico.
14. Comunica a ciascuno il suo PIN di persona.

Controllo Lavori va installato **solo su questo PC**: su un secondo PC avrebbe dati separati.

## Passo 3 · PC di ogni dipendente

Circa 5 minuti a PC, da fare con il dipendente presente perché serve il suo PIN per la prova finale.

1. Dal PC del dipendente apri `\\SERVER\Programmi` e fai doppio clic su **`Ore-Dipendenti-1.7.0-Windows7-32bit-setup.exe`**.
2. Se compare un avviso di sicurezza: **Esegui** (su Windows 10/11 "Ulteriori informazioni" → "Esegui comunque"). Premi **Installa**, poi **Fine**.
3. Al primo avvio il programma chiede la **cartella condivisa**: premi **Scegli cartella…**, scrivi `\\SERVER\ControlloLavori`, premi Invio e **Seleziona cartella**. Si fa una sola volta per PC.
4. Compare "Chi sei?" con i nomi dei dipendenti. Il dipendente sceglie il suo nome e scrive il suo PIN.
5. **Prova:** inserisce un'ora su un lavoro qualsiasi e preme **Salva**. Sul tuo PC, entro un minuto, le ore compaiono nella scheda di quel lavoro, in **Ore totali**. Poi il dipendente cancella la prova con ✕ e le ore spariscono anche dal lavoro.
6. Il dipendente preme **Esci**.

Su questi PC **non va installato Controllo Lavori**. Il programma Ore Dipendenti non contiene importi, preventivi né dati dei lavori: legge dal server solo codice, nome e cliente.

<div class="pb"></div>

## Guida per i dipendenti (da stampare)

Ogni giorno, o almeno a fine settimana, inserisci le tue ore nel programma **Ore Dipendenti**. Quello che salvi arriva subito in ufficio.

**Entrare**

1. Apri **Ore Dipendenti** dal menu Start.
2. Clicca il tuo nome, scrivi il tuo **PIN** e premi **Entra**. Il PIN è personale: non darlo ai colleghi.

**Ore su un lavoro**

3. **Data**: il giorno in cui hai lavorato (di solito è già oggi).
4. **Tipo**: "Ore su lavoro".
5. **Lavoro**: scrivi il codice o il nome e sceglilo dall'elenco che compare.
6. **Ore**: le ore lavorate quel giorno su quel lavoro, anche con i decimali (es. 7,5).
7. Se quel giorno eri in trasferta, spunta **Ore in trasferta**.
8. **Km** e **Spese €**, se ci sono; **Note** facoltative.
9. Premi **Salva**. Se hai lavorato su più lavori nello stesso giorno, fai una riga per ciascuno.

**Uscite in cantiere**: per i lavori segnati "cantiere" nell'elenco, sotto compare "Cantiere: verrà registrata come uscita in cantiere" e il pulsante diventa **Salva uscita in cantiere**. Si compila come le ore normali.

**Ferie e permessi**

10. In **Tipo** scegli **Ferie** o **Permesso** (o Malattia), metti la data e le ore (per un giorno intero di ferie: 8) e premi **Salva**.
11. **Nota del giorno**: per segnalare qualcosa all'ufficio (es. "visita medica ore 9").

**Controllare e correggere**

12. Sotto vedi il tuo mese giorno per giorno, con i totali in alto. Con **‹ ›** cambi mese.
13. Per correggere premi **✎**, modifica e salva; per cancellare premi **✕**. La correzione arriva in ufficio da sola.
14. **Stampa report del mese** stampa il tuo riepilogo.
15. Alla fine premi **Esci**.

Se compare "Server non raggiungibile", continua pure: le ore restano sul PC e partono da sole quando il server torna disponibile.

<div class="pb"></div>

## Uso quotidiano e situazioni frequenti

L'amministratore non deve fare nulla perché le ore arrivino: Controllo Lavori rilegge il server all'apertura, ogni minuto e quando ci si torna sopra. Le schede dei lavori aperte non vengono toccate finché non le chiudi.

**Dove guardare**

- **Scheda del lavoro**: Ore totali e Ore trasferta comprendono già le ore dei dipendenti; sotto, la riga "Dalle ore dei dipendenti" e l'elenco con data, dipendente, ore, km e spese. Nei cantieri le uscite compaiono anche nella tabella Worksite (segnate 👤).
- **👥 Ore dipendenti → Registrazioni**: tutto ciò che hanno inserito, per dipendente e mese.
- **👥 Ore dipendenti → Ferie, permessi e note**: assenze e note del mese.
- **👥 Ore dipendenti → Report mensile**: scegli mese e dipendente (o tutti), poi **Stampa** (un foglio A4 a testa con le firme) o **Esporta Excel** per il consulente delle buste paga.

| Situazione | Cosa fare |
| --- | --- |
| Nuovo dipendente | 👥 → Dipendenti e PIN → + Aggiungi dipendente → Imposta PIN → Salva dipendenti; poi Passo 3 sul suo PC |
| Dipendente che dimentica il PIN | 👥 → Dipendenti e PIN → Cambia accanto al nome → Salva dipendenti |
| Dipendente che lascia l'azienda | Togli la spunta Attivo e salva: le sue ore restano nei report |
| Inserire ore al posto di un dipendente | Apri Ore Dipendenti, scegli Amministratore, PIN amministratore, poi il dipendente in alto |
| Nuovo lavoro | Crealo in Controllo Lavori: compare da solo nell'elenco dei dipendenti (i lavori Finito e Non fare no) |
| Ore con lavoro non trovato (⚠ sul pulsante 👥) | Il lavoro è stato cancellato o ha cambiato codice: ripristina il codice o fai correggere la riga al dipendente |
| Server spento | I dipendenti continuano: le ore partono quando il server torna; nessuna ora viene tolta ai lavori |
| PC dell'amministratore spento | Le ore entrano nei lavori alla prossima apertura di Controllo Lavori |
| Nuova versione dei programmi | Esegui il nuovo setup sopra al vecchio: dati e impostazioni restano |
| PIN di apertura dimenticato | Chiudi Controllo Lavori, cancella la cartella `C:\Users\<tuo utente>\AppData\Roaming\Controllo Lavori\Local Storage` e riapri: i lavori si ricaricano dal salvataggio automatico sul server; poi imposta un nuovo PIN |

**Prima di partire con tutti**

- [ ] Una settimana di prova con 1-2 dipendenti
- [ ] **Esporta backup** dal tuo programma il primo giorno e conservalo
- [ ] Controllare che le cartelle del server siano nei backup
