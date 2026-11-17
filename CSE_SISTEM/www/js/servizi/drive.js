// Google Drive: accesso diretto dall'app Android (API REST v3 di Drive).
//
// Il token arriva dal plugin nativo "Dispositivo" (scelta dell'account Google
// e permesso, una volta sola); qui ci sono le poche operazioni che servono
// alla sincronizzazione (servizi/sincro.js): elencare una cartella, creare
// cartelle, scaricare, caricare, spostare nel cestino.

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const CARTELLA = 'application/vnd.google-apps.folder';
const CAMPI = 'id,name,mimeType,md5Checksum,modifiedTime,size';

/** Errore dell'API di Drive con lo stato HTTP. */
export class ErroreDrive extends Error {
  constructor(stato, testo) {
    super(stato === 403 && /storageQuota/i.test(testo) ? 'Google Drive: spazio esaurito'
      : stato === 401 ? 'Google Drive: accesso scaduto, ricollega Google Drive nelle Impostazioni'
        : `Google Drive: errore ${stato}${testo ? ` (${String(testo).slice(0, 200)})` : ''}`);
    this.stato = stato;
  }
}

const tipoDa = (nome) => ({
  pdf: 'application/pdf', json: 'application/json', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', txt: 'text/plain',
}[String(nome).split('.').pop().toLowerCase()] || 'application/octet-stream');

const q = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/**
 * Client di Drive.
 * @param {(rinnova: boolean) => Promise<string>} token restituisce il token (rinnova = il precedente è scaduto)
 * @param {typeof fetch} fetchFn
 */
export function clientDrive(token, fetchFn = (...a) => globalThis.fetch(...a)) {
  async function chiama(url, opzioni = {}, tentativo = 0) {
    const t = await token(tentativo > 0);
    let r;
    try {
      r = await fetchFn(url, { ...opzioni, headers: { ...(opzioni.headers || {}), Authorization: `Bearer ${t}` } });
    } catch (e) {
      throw new Error(`Google Drive non raggiungibile: controlla la connessione (${e.message})`);
    }
    if (r.status === 401 && tentativo === 0) return chiama(url, opzioni, 1);
    // troppe richieste o errore temporaneo: si riprova con un po' di attesa
    if ((r.status === 429 || r.status >= 500) && tentativo < 3) {
      await new Promise((ok) => setTimeout(ok, 800 * 2 ** tentativo));
      return chiama(url, opzioni, tentativo + 1);
    }
    if (!r.ok) throw new ErroreDrive(r.status, await r.text().catch(() => ''));
    return r;
  }

  async function multipart(url, metodo, metadati, byte) {
    const confine = `cse${Math.random().toString(36).slice(2)}`;
    const enc = new TextEncoder();
    const testa = enc.encode(`--${confine}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadati)}\r\n--${confine}\r\nContent-Type: ${tipoDa(metadati.name || '')}\r\n\r\n`);
    const coda = enc.encode(`\r\n--${confine}--`);
    const corpo = new Uint8Array(testa.length + byte.length + coda.length);
    corpo.set(testa, 0);
    corpo.set(byte, testa.length);
    corpo.set(coda, testa.length + byte.length);
    const r = await chiama(url, { method: metodo, headers: { 'Content-Type': `multipart/related; boundary=${confine}` }, body: corpo });
    return r.json();
  }

  async function ripresa(url, metodo, metadati, byte) {
    // file grandi (oltre 5 MB): caricamento «riprendibile» in un solo pezzo
    const avvio = await chiama(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': tipoDa(metadati.name || ''), 'X-Upload-Content-Length': String(byte.length) },
      body: JSON.stringify(metadati),
    });
    const dove = avvio.headers.get('Location');
    if (!dove) throw new Error('Google Drive: caricamento non avviato');
    const r = await chiama(dove, { method: 'PUT', headers: { 'Content-Type': tipoDa(metadati.name || '') }, body: byte });
    return r.json();
  }

  return {
    /** Contenuto di una cartella: [{ id, name, mimeType, md5Checksum, modifiedTime, size, cartella }]. */
    async elenca(idCartella) {
      const out = [];
      let pagina = '';
      do {
        const u = `${API}/files?q=${encodeURIComponent(`'${q(idCartella)}' in parents and trashed=false`)}&fields=${encodeURIComponent(`nextPageToken,files(${CAMPI})`)}&pageSize=1000&spaces=drive${pagina ? `&pageToken=${encodeURIComponent(pagina)}` : ''}`;
        const d = await (await chiama(u)).json();
        for (const f of d.files || []) out.push({ ...f, cartella: f.mimeType === CARTELLA });
        pagina = d.nextPageToken || '';
      } while (pagina);
      return out;
    },

    /** Cartella con quel nome dentro idPadre ('root' = Il mio Drive), creata se manca. */
    async cartella(nome, idPadre = 'root', crea = true) {
      const u = `${API}/files?q=${encodeURIComponent(`name='${q(nome)}' and '${q(idPadre)}' in parents and mimeType='${CARTELLA}' and trashed=false`)}&fields=files(id,name)&spaces=drive`;
      const d = await (await chiama(u)).json();
      if (d.files?.length) return d.files[0].id;
      if (!crea) return null;
      return this.creaCartella(nome, idPadre);
    },

    async creaCartella(nome, idPadre) {
      const r = await chiama(`${API}/files?fields=id`, {
        method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({ name: nome, mimeType: CARTELLA, parents: [idPadre] }),
      });
      return (await r.json()).id;
    },

    async scarica(id) {
      const r = await chiama(`${API}/files/${encodeURIComponent(id)}?alt=media`);
      return new Uint8Array(await r.arrayBuffer());
    },

    /** Carica un file nuovo (idPadre) o ne sostituisce il contenuto (id). Restituisce { id, md5Checksum, ... }. */
    async carica({ nome, idPadre = null, id = null, byte }) {
      const metadati = id ? {} : { name: nome, parents: [idPadre] };
      if (id) metadati.name = nome;
      const base = id ? `${UPLOAD}/files/${encodeURIComponent(id)}` : `${UPLOAD}/files`;
      const metodo = id ? 'PATCH' : 'POST';
      if (byte.length > 5 * 1024 * 1024) return ripresa(`${base}?uploadType=resumable&fields=${CAMPI}`, metodo, metadati, byte);
      return multipart(`${base}?uploadType=multipart&fields=${CAMPI}`, metodo, metadati, byte);
    },

    /** Sposta nel cestino di Drive (si recupera per 30 giorni). */
    async cestina(id) {
      await chiama(`${API}/files/${encodeURIComponent(id)}?fields=id`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify({ trashed: true }),
      });
    },
  };
}

// ------------------------------------------------------------ MD5
// Drive dà l'MD5 di ogni file: confrontandolo con quello del file sul telefono
// si capisce se sono uguali senza scaricarli (prima sincronizzazione, conflitti).

const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

/** MD5 di un Uint8Array, in esadecimale minuscolo (come md5Checksum di Drive). */
export function md5(byte) {
  const n = byte.length;
  const totale = ((n + 8) >>> 6) + 1 << 6;
  const m = new Uint8Array(totale);
  m.set(byte);
  m[n] = 0x80;
  const bit = n * 8;
  const dv = new DataView(m.buffer);
  dv.setUint32(totale - 8, bit >>> 0, true);
  dv.setUint32(totale - 4, Math.floor(bit / 2 ** 32), true);
  let a0 = 0x67452301; let b0 = 0xefcdab89; let c0 = 0x98badcfe; let d0 = 0x10325476;
  const M = new Uint32Array(16);
  for (let o = 0; o < totale; o += 64) {
    for (let i = 0; i < 16; i++) M[i] = dv.getUint32(o + i * 4, true);
    let A = a0; let B = b0; let C = c0; let D = d0;
    for (let i = 0; i < 64; i++) {
      let F; let g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; } else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; } else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  return [a0, b0, c0, d0].map((x) => [0, 8, 16, 24].map((s) => ((x >>> s) & 0xff).toString(16).padStart(2, '0')).join('')).join('');
}
