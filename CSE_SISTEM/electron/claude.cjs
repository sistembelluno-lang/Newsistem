// Collegamento con Claude (API di Anthropic) per la verifica dei POS.
//
// La chiave API si inserisce in Impostazioni e si conserva cifrata con il
// portachiavi di Windows (safeStorage). I documenti si caricano con la Files
// API una volta sola: l'identificativo resta in memoria finché il file non
// cambia, così una seconda verifica dello stesso POS non li ricarica.

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const Anthropic = require('@anthropic-ai/sdk');

const { toFile } = Anthropic;

const TIPI = {
  '.pdf': ['application/pdf', 'document'],
  '.txt': ['text/plain', 'document'],
  '.jpg': ['image/jpeg', 'image'],
  '.jpeg': ['image/jpeg', 'image'],
  '.png': ['image/png', 'image'],
  '.gif': ['image/gif', 'image'],
  '.webp': ['image/webp', 'image'],
};

function messaggioErrore(e) {
  if (e instanceof Anthropic.APIUserAbortError) return 'Verifica interrotta.';
  if (e instanceof Anthropic.AuthenticationError) return 'Chiave API di Claude non valida: controllala in Impostazioni.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'La chiave API non ha i permessi per questa operazione o per il modello.';
  if (e instanceof Anthropic.RateLimitError) return 'Troppe richieste o credito esaurito: attendi un minuto o controlla il credito su console.anthropic.com.';
  if (e instanceof Anthropic.BadRequestError) return `Richiesta non accettata da Claude: ${e.error?.error?.message || e.message}`;
  if (e instanceof Anthropic.InternalServerError) return 'Il servizio Claude è momentaneamente sovraccarico: riprova tra poco.';
  if (e instanceof Anthropic.APIConnectionError) return 'Nessuna connessione con Claude: controlla internet o il proxy.';
  if (e instanceof Anthropic.APIError) return `Errore di Claude ${e.status || ''}: ${e.message}`;
  return e?.message || String(e);
}

function creaClaude({ cartellaUtente, safeStorage }) {
  const fileImpostazioni = path.join(cartellaUtente, 'claude.json');
  const fileCache = path.join(cartellaUtente, 'claude-file.json');
  const leggi = (f) => {
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; }
  };
  const scrivi = (f, d) => {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(d, null, 2));
  };

  function chiave() {
    if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
    const s = leggi(fileImpostazioni);
    if (!s.chiave) return '';
    try {
      return s.cifrata ? safeStorage.decryptString(Buffer.from(s.chiave, 'base64')) : s.chiave;
    } catch {
      return '';
    }
  }

  const impronta = (k) => crypto.createHash('sha256').update(k).digest('hex').slice(0, 12);

  function client() {
    const k = chiave();
    if (!k) throw new Error('Manca la chiave API di Claude: inseriscila in Impostazioni.');
    return { cl: new Anthropic.default({ apiKey: k, maxRetries: 3, timeout: 20 * 60 * 1000 }), impronta: impronta(k) };
  }

  /** Carica un file con la Files API (o riusa quello già caricato). */
  async function carica(cl, imp, assoluto, titolo) {
    const est = path.extname(assoluto).toLowerCase();
    const tipo = TIPI[est];
    if (!tipo) throw new Error(`«${titolo}»: formato ${est || 'sconosciuto'} non leggibile da Claude. Usa PDF o immagini (un .p7m va prima aperto e salvato in PDF).`);
    const st = await fsp.stat(assoluto);
    const cache = leggi(fileCache);
    const k = `${imp}|${assoluto}|${st.size}|${Math.round(st.mtimeMs)}`;
    if (cache[k]) return { id: cache[k], tipo, nuovo: false };
    const up = await cl.files.upload({ file: await toFile(fs.createReadStream(assoluto), path.basename(assoluto), { type: tipo[0] }) });
    cache[k] = up.id;
    scrivi(fileCache, cache);
    return { id: up.id, tipo, nuovo: true };
  }

  function dimenticaFile() {
    scrivi(fileCache, {});
  }

  let inCorso = null;

  return {
    stato() {
      return { chiave: !!chiave(), daAmbiente: !!process.env.ANTHROPIC_API_KEY };
    },

    salvaChiave(k) {
      const s = leggi(fileImpostazioni);
      k = String(k || '').trim();
      if (!k) {
        delete s.chiave;
        delete s.cifrata;
      } else if (safeStorage.isEncryptionAvailable()) {
        s.chiave = safeStorage.encryptString(k).toString('base64');
        s.cifrata = true;
      } else {
        s.chiave = k;
        s.cifrata = false;
      }
      scrivi(fileImpostazioni, s);
      dimenticaFile(); // i file caricati appartengono all'account della chiave
      return this.stato();
    },

    async prova(modello) {
      try {
        const { cl } = client();
        const m = await cl.models.retrieve(modello);
        return { ok: true, testo: `Collegamento riuscito: ${m.display_name || m.id} disponibile.` };
      } catch (e) {
        return { ok: false, testo: messaggioErrore(e) };
      }
    },

    annulla() {
      inCorso?.abort();
    },

    /**
     * Verifica: carica i documenti, invia istruzioni e testo, chiede una
     * risposta che rispetti lo schema JSON. avanzamento(testo) informa la
     * pagina su cosa sta succedendo.
     */
    async verifica({ modello, istruzioni, testo, schema, documenti }, { assoluto, avanzamento = () => {} }) {
      const { cl, impronta: imp } = client();
      const controllo = new AbortController();
      inCorso = controllo;
      try {
        let tentativo = 0;
        for (;;) {
          const blocchi = [];
          for (const [i, d] of documenti.entries()) {
            avanzamento(`Invio dei documenti a Claude (${i + 1} di ${documenti.length}): ${d.titolo}`);
            const f = await carica(cl, imp, assoluto(d.percorso), d.titolo);
            blocchi.push(f.tipo[1] === 'image'
              ? { type: 'image', source: { type: 'file', file_id: f.id } }
              : { type: 'document', source: { type: 'file', file_id: f.id }, title: d.titolo });
          }
          avanzamento('Claude sta leggendo i documenti e compilando la check list: può richiedere alcuni minuti…');
          const base = {
            model: modello,
            max_tokens: 64000,
            thinking: { type: 'adaptive' },
            output_config: { effort: 'high', format: { type: 'json_schema', schema } },
            system: istruzioni,
            messages: [{ role: 'user', content: [...blocchi, { type: 'text', text: testo }] }],
          };
          let msg;
          try {
            msg = await richiesta(cl, base, controllo.signal, avanzamento);
          } catch (e) {
            // un file caricato in precedenza non esiste più (cancellato o scaduto): si ricaricano tutti, una volta
            if (tentativo === 0 && (e instanceof Anthropic.NotFoundError || (e instanceof Anthropic.BadRequestError && /file/i.test(e.message)))) {
              tentativo++;
              dimenticaFile();
              continue;
            }
            throw e;
          }
          if (msg.stop_reason === 'refusal') throw new Error('Claude non ha potuto completare la verifica di questi documenti.');
          if (msg.stop_reason === 'max_tokens') throw new Error('La risposta di Claude è stata troncata: riprova con meno documenti.');
          const t = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
          let dati;
          try {
            dati = JSON.parse(t);
          } catch {
            throw new Error('Risposta di Claude non leggibile: riprova.');
          }
          return { dati, modello: msg.model, uso: msg.usage };
        }
      } catch (e) {
        throw new Error(messaggioErrore(e));
      } finally {
        inCorso = null;
      }
    },
  };
}

// Se un filtro di sicurezza blocca per errore la risposta, l'API la ripete su
// un altro modello (fallbacks: 'default'); se l'account non lo accetta si
// riprova senza.
let ripiego = true;

async function richiesta(cl, base, signal, avanzamento) {
  for (;;) {
    try {
      const corpo = ripiego ? { ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : base;
      const stream = cl.beta.messages.stream(corpo, { signal });
      let caratteri = 0;
      let ultimo = 0;
      stream.on('text', (d) => {
        caratteri += d.length;
        if (caratteri - ultimo > 400) {
          ultimo = caratteri;
          avanzamento(`Claude sta scrivendo la verifica… (${Math.round(caratteri / 100) / 10} mila caratteri)`);
        }
      });
      return await stream.finalMessage();
    } catch (e) {
      if (ripiego && e instanceof Anthropic.BadRequestError && /fallback/i.test(e.message)) {
        ripiego = false;
        continue;
      }
      throw e;
    }
  }
}

module.exports = { creaClaude, messaggioErrore, TIPI };
