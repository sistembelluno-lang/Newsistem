// Sincronizzazione diretta con Google Drive (app Android).
//
// Sul telefono i cantieri restano nella cartella Documenti/CSE_SISTEM (così
// si lavora anche senza rete); questa funzione la allinea con la cartella
// CSE_SISTEM di Google Drive, la stessa che su Windows si vede con «Google
// Drive per desktop». Si confronta ogni file con com'era all'ultima
// sincronizzazione (stato salvato in .sincro-drive.json):
//   - cambiato solo sul telefono  -> si carica su Drive
//   - cambiato solo su Drive      -> si scarica
//   - nuovo da una parte          -> si copia dall'altra
//   - eliminato da una parte (e non cambiato dall'altra) -> si elimina anche
//     dall'altra (su Drive va nel cestino, recuperabile per 30 giorni)
//   - cambiato da tutte e due     -> si tengono entrambi: la versione del
//     telefono diventa una copia «(conflitto telefono ...)»; per i dati del
//     programma (.json, stesso id) vale la più recente (core/archivio.js unisciCopie)

import { RADICE, percorso } from '../core/cartelle.js';
import { md5 } from './drive.js';

export const FILE_STATO = `${RADICE}/.sincro-drive.json`;

/** File che non si sincronizzano: nascosti, temporanei, di sistema. */
export function escluso(rel) {
  return rel.split('/').some((p) => p.startsWith('.')) || /\.tmp$|(^|\/)(desktop\.ini|thumbs\.db)$/i.test(rel);
}

/** Tutti i file della cartella locale: Map(percorso relativo -> { size, mtime }). */
export async function elencoLocale(disco, radice = RADICE) {
  const out = new Map();
  if (!(await disco.esiste(radice))) return out;
  const giro = async (rel) => {
    for (const v of await disco.elenca(rel ? percorso(radice, rel) : radice)) {
      const r = rel ? `${rel}/${v.nome}` : v.nome;
      if (escluso(r)) continue;
      if (v.cartella) await giro(r);
      else {
        const i = await disco.info(percorso(radice, r));
        if (i) out.set(r, { size: i.size, mtime: i.mtime });
      }
    }
  };
  await giro('');
  return out;
}

/** Tutti i file della cartella su Drive: { file: Map(rel -> { id, md5, size }), cartelle: Map(rel -> id) }. */
export async function elencoRemoto(drive, idRadice) {
  const file = new Map();
  const cartelle = new Map([['', idRadice]]);
  const giro = async (rel, id) => {
    for (const f of await drive.elenca(id)) {
      const r = rel ? `${rel}/${f.name}` : f.name;
      if (escluso(r)) continue;
      if (f.cartella) {
        cartelle.set(r, f.id);
        await giro(r, f.id);
      } else if (!String(f.mimeType || '').startsWith('application/vnd.google-apps.')) {
        // (i documenti Google Docs/Fogli non sono file: si lasciano stare)
        file.set(r, { id: f.id, md5: f.md5Checksum || '', size: Number(f.size || 0) });
      }
    }
  };
  await giro('', idRadice);
  return { file, cartelle };
}

/** Id della cartella su Drive dal percorso ("CSE_SISTEM" o "Lavoro/CSE_SISTEM"), creata se manca. */
export async function cartellaRadice(drive, percorsoDrive = RADICE) {
  let id = 'root';
  for (const nome of String(percorsoDrive || RADICE).split('/').map((x) => x.trim()).filter(Boolean)) id = await drive.cartella(nome, id, true);
  return id;
}

const due = (n) => String(n).padStart(2, '0');
function nomeConflitto(rel, d = new Date()) {
  const i = rel.lastIndexOf('/');
  const dir = i >= 0 ? rel.slice(0, i + 1) : '';
  const nome = rel.slice(i + 1);
  const p = nome.lastIndexOf('.');
  const [base, est] = p > 0 ? [nome.slice(0, p), nome.slice(p)] : [nome, ''];
  return `${dir}${base} (conflitto telefono ${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())} ${due(d.getHours())}-${due(d.getMinutes())})${est}`;
}

/**
 * Una sincronizzazione completa.
 * @param {object} o
 * @param {object} o.disco disco del dispositivo (esiste, elenca, info, leggiByte, scriviByte, elimina)
 * @param {object} o.drive client di servizi/drive.js
 * @param {string} o.percorsoDrive cartella su Drive
 * @param {object} o.stato file all'ultima sincronizzazione: { [rel]: { id, md5, size, mtime } }
 * @returns {Promise<{ stato, riepilogo: { scaricati, caricati, eliminatiQui, eliminatiSuDrive, conflitti, errori }, cambiatiQui: string[] }>}
 */
export async function sincronizza({ disco, drive, percorsoDrive = RADICE, stato = {}, avanzamento = () => {}, adesso = () => new Date() }) {
  avanzamento('Lettura della cartella su Google Drive…');
  const idRadice = await cartellaRadice(drive, percorsoDrive);
  const remoto = await elencoRemoto(drive, idRadice);
  avanzamento('Lettura dei file sul telefono…');
  const locale = await elencoLocale(disco);
  const prima = Object.keys(stato).length;

  // sicurezza: una cartella vuota dopo una sincronizzazione piena è quasi
  // sempre un errore (cartella sbagliata, cestinata, permessi): non si cancella niente
  if (prima > 5 && remoto.file.size === 0) throw new Error(`La cartella «${percorsoDrive}» su Google Drive risulta vuota: controlla che non sia stata spostata o eliminata. Non è stato cancellato niente.`);
  if (prima > 5 && locale.size === 0) throw new Error('La cartella CSE_SISTEM del telefono risulta vuota: controlla il permesso «Accesso a tutti i file». Non è stato cancellato niente su Drive.');

  const nuovo = { ...stato };
  const r = { scaricati: 0, caricati: 0, eliminatiQui: 0, eliminatiSuDrive: 0, conflitti: 0, errori: [] };
  const cambiatiQui = [];
  const assoluto = (rel) => percorso(RADICE, rel);
  const infoLocale = async (rel) => {
    const i = await disco.info(assoluto(rel));
    return { size: i?.size ?? 0, mtime: i?.mtime ?? 0 };
  };

  async function cartellaSuDrive(relDir) {
    if (remoto.cartelle.has(relDir)) return remoto.cartelle.get(relDir);
    const i = relDir.lastIndexOf('/');
    const padre = await cartellaSuDrive(i >= 0 ? relDir.slice(0, i) : '');
    const id = await drive.creaCartella(relDir.slice(i + 1), padre);
    remoto.cartelle.set(relDir, id);
    return id;
  }
  const dirDi = (rel) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '');
  const nomeDi = (rel) => rel.slice(rel.lastIndexOf('/') + 1);

  async function scarica(rel, R) {
    const byte = await drive.scarica(R.id);
    await disco.scriviByte(assoluto(rel), byte);
    nuovo[rel] = { id: R.id, md5: R.md5 || md5(byte), ...(await infoLocale(rel)) };
    cambiatiQui.push(rel);
    r.scaricati++;
  }
  async function carica(rel, idEsistente = null, nomeRemoto = null) {
    const byte = await disco.leggiByte(assoluto(rel));
    const f = await drive.carica({ nome: nomeDi(nomeRemoto || rel), idPadre: idEsistente ? null : await cartellaSuDrive(dirDi(rel)), id: idEsistente, byte });
    nuovo[nomeRemoto || rel] = { id: f.id, md5: f.md5Checksum || md5(byte), ...(await infoLocale(rel)) };
    r.caricati++;
    return byte;
  }

  const tutti = [...new Set([...locale.keys(), ...remoto.file.keys(), ...Object.keys(stato)])].sort();
  let n = 0;
  for (const rel of tutti) {
    n++;
    if (n % 20 === 0) avanzamento(`Sincronizzazione: ${n} di ${tutti.length} file…`);
    const L = locale.get(rel);
    const R = remoto.file.get(rel);
    const S = stato[rel];
    try {
      const cambiatoQui = L && (!S || L.size !== S.size || L.mtime !== S.mtime);
      const cambiatoLa = R && (!S || (R.md5 && R.md5 !== S.md5) || R.id !== S.id);
      if (L && R) {
        if (!cambiatoQui && !cambiatoLa) continue;
        if (cambiatoQui && !cambiatoLa) await carica(rel, R.id);
        else if (!cambiatoQui && cambiatoLa) await scarica(rel, R);
        else {
          // cambiato da tutte e due (o prima sincronizzazione): se sono uguali basta segnarlo
          const byte = await disco.leggiByte(assoluto(rel));
          if (R.md5 && md5(byte) === R.md5) {
            nuovo[rel] = { id: R.id, md5: R.md5, size: L.size, mtime: L.mtime };
            continue;
          }
          const copia = nomeConflitto(rel, adesso());
          await disco.scriviByte(assoluto(copia), byte);
          await carica(copia);
          await scarica(rel, R);
          cambiatiQui.push(copia);
          r.conflitti++;
        }
      } else if (L && !R) {
        if (S && !cambiatoQui) {
          // eliminato su Drive (da un altro dispositivo): si elimina anche qui
          await disco.elimina(assoluto(rel));
          delete nuovo[rel];
          cambiatiQui.push(rel);
          r.eliminatiQui++;
        } else await carica(rel);
      } else if (!L && R) {
        if (S && !cambiatoLa) {
          // eliminato sul telefono: su Drive va nel cestino
          await drive.cestina(R.id);
          delete nuovo[rel];
          r.eliminatiSuDrive++;
        } else await scarica(rel, R);
      } else delete nuovo[rel];
    } catch (e) {
      r.errori.push(`${rel}: ${e.message}`);
    }
  }
  return { stato: nuovo, riepilogo: r, cambiatiQui };
}

/** Riassunto in italiano di una sincronizzazione. */
export function descriviRiepilogo(r) {
  const parti = [
    r.scaricati ? `${r.scaricati} scaricat${r.scaricati === 1 ? 'o' : 'i'}` : '',
    r.caricati ? `${r.caricati} caricat${r.caricati === 1 ? 'o' : 'i'}` : '',
    r.eliminatiQui + r.eliminatiSuDrive ? `${r.eliminatiQui + r.eliminatiSuDrive} eliminat${r.eliminatiQui + r.eliminatiSuDrive === 1 ? 'o' : 'i'}` : '',
    r.conflitti ? `${r.conflitti} conflitt${r.conflitti === 1 ? 'o' : 'i'} (copia conservata)` : '',
    r.errori.length ? `${r.errori.length} non riuscit${r.errori.length === 1 ? 'o' : 'i'}` : '',
  ].filter(Boolean);
  return parti.length ? parti.join(', ') : 'tutto già allineato';
}

/**
 * Sincronizzatore per l'app: tiene impostazioni e stato in .sincro-drive.json,
 * evita due sincronizzazioni insieme, si ripete da solo.
 * @param {object} o
 * @param {object} o.disco disco del dispositivo (NON quello che avvisa delle scritture)
 * @param {(o: { interattivo: boolean }) => Promise<{ token?: string, serveConsenso?: boolean }>} o.tokenDrive
 * @param {(fetchToken) => object} o.creaDrive di solito (t) => clientDrive(t)
 */
export function creaSincronizzatore({ disco, tokenDrive, creaDrive }) {
  let config = null;
  let inCorso = null;
  let ancora = false;
  let timer = null;
  let token = null;
  let tokenOra = 0;
  const ascolta = new Set();
  const avvisa = (ev) => { for (const f of ascolta) { try { f(ev); } catch { /* nessuno */ } } };

  async function leggi() {
    if (config) return config;
    try {
      config = JSON.parse(await disco.leggiTesto(FILE_STATO));
    } catch {
      config = { collegato: false, percorso: RADICE, ultima: '', esito: '', errore: '', file: {} };
    }
    return config;
  }
  async function scrivi() {
    await disco.scriviTesto(FILE_STATO, JSON.stringify(config));
  }
  async function ottieniToken(rinnova, interattivo = false) {
    if (!rinnova && token && Date.now() - tokenOra < 45 * 60 * 1000) return token;
    const r = await tokenDrive({ interattivo });
    if (r.serveConsenso || !r.token) throw new Error('Google Drive va ricollegato: Impostazioni › Collega Google Drive.');
    token = r.token;
    tokenOra = Date.now();
    return token;
  }

  async function esegui() {
    const c = await leggi();
    if (!c.collegato) return null;
    avvisa({ tipo: 'inizio' });
    try {
      const drive = creaDrive((rinnova) => ottieniToken(rinnova));
      const esito = await sincronizza({ disco, drive, percorsoDrive: c.percorso, stato: c.file || {}, avanzamento: (testo) => avvisa({ tipo: 'avanzamento', testo }) });
      c.file = esito.stato;
      c.ultima = new Date().toISOString();
      c.esito = descriviRiepilogo(esito.riepilogo);
      c.errore = esito.riepilogo.errori.slice(0, 5).join('\n');
      await scrivi();
      avvisa({ tipo: 'fine', ...esito });
      return esito;
    } catch (e) {
      c.errore = e.message;
      c.ultimaProva = new Date().toISOString();
      await scrivi().catch(() => {});
      avvisa({ tipo: 'errore', errore: e.message });
      throw e;
    }
  }

  return {
    leggi,
    suEventi(f) { ascolta.add(f); return () => ascolta.delete(f); },
    inCorso: () => !!inCorso,

    /** Sincronizza adesso (se ce n'è già una in corso, ne fa un'altra subito dopo). */
    async sincronizza() {
      if (inCorso) { ancora = true; return inCorso; }
      inCorso = (async () => {
        try {
          return await esegui();
        } finally {
          inCorso = null;
          if (ancora) { ancora = false; this.pianifica(500); }
        }
      })();
      return inCorso;
    },

    /** Sincronizzazione tra un po' (dopo un salvataggio: si raccolgono più scritture). */
    pianifica(ms = 8000) {
      clearTimeout(timer);
      timer = setTimeout(() => { this.sincronizza().catch(() => {}); }, ms);
    },

    /** Collega Google Drive (scelta dell'account e permesso) e fa la prima sincronizzazione. */
    async collega(percorsoDrive = RADICE) {
      await ottieniToken(true, true);
      const c = await leggi();
      if (c.percorso !== percorsoDrive) c.file = {}; // cartella diversa: si riparte confrontando i file
      Object.assign(c, { collegato: true, percorso: percorsoDrive || RADICE, errore: '' });
      await scrivi();
      return this.sincronizza();
    },

    async scollega() {
      const c = await leggi();
      Object.assign(c, { collegato: false, errore: '' });
      token = null;
      await scrivi();
    },
  };
}
