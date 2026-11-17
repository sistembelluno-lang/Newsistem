// File firmati digitalmente (.p7m, CAdES): si estrae il documento firmato
// (di solito un PDF) e si legge il nome di chi ha firmato.
//
// Un .p7m è una busta CMS «SignedData» in codifica DER o BER (anche a
// lunghezza indefinita e con il contenuto spezzato in più pezzi), a volte
// salvata in Base64. Può contenere a sua volta un altro .p7m (doppia firma):
// si apre finché si arriva al documento.

const OID_CN = '2.5.4.3';

/** Base64 (anche con intestazioni «-----BEGIN ...» e a capo) -> Uint8Array, o null. */
function daBase64(byte) {
  const testo = new TextDecoder('latin1').decode(byte.subarray(0, Math.min(byte.length, 64)));
  if (!/^\s*(-----BEGIN|MI[A-Za-z0-9+/])/.test(testo)) return null;
  try {
    const t = new TextDecoder('latin1').decode(byte).replace(/-----[^-]+-----/g, '').replace(/[^A-Za-z0-9+/=]/g, '');
    const s = atob(t);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** Legge un elemento ASN.1 (TLV) a partire da i. */
function leggi(b, i, fine = b.length) {
  if (i + 2 > fine) throw new Error('p7m troncato');
  const primo = b[i];
  const classe = primo >> 6;
  const composto = !!(primo & 0x20);
  let numero = primo & 0x1f;
  let j = i + 1;
  if (numero === 0x1f) {
    numero = 0;
    while (b[j] & 0x80) numero = (numero << 7) | (b[j++] & 0x7f);
    numero = (numero << 7) | b[j++];
  }
  let lung = b[j++];
  let indefinita = false;
  if (lung === 0x80) {
    indefinita = true;
    lung = -1;
  } else if (lung & 0x80) {
    const n = lung & 0x7f;
    if (n > 4) throw new Error('lunghezza non valida');
    lung = 0;
    for (let k = 0; k < n; k++) lung = lung * 256 + b[j++];
  }
  const nodo = { classe, composto, numero, inizio: j, figli: null, fine: 0 };
  if (indefinita) {
    if (!composto) throw new Error('lunghezza indefinita non valida');
    nodo.figli = [];
    let k = j;
    while (!(b[k] === 0 && b[k + 1] === 0)) {
      const f = leggi(b, k, fine);
      nodo.figli.push(f);
      k = f.dopo;
    }
    nodo.fine = k;
    nodo.dopo = k + 2;
  } else {
    nodo.fine = j + lung;
    nodo.dopo = nodo.fine;
    if (nodo.fine > fine) throw new Error('p7m troncato');
    if (composto) {
      nodo.figli = [];
      for (let k = j; k < nodo.fine;) {
        const f = leggi(b, k, nodo.fine);
        nodo.figli.push(f);
        k = f.dopo;
      }
    }
  }
  return nodo;
}

/** Contenuto di un OCTET STRING, anche spezzato in più pezzi (BER). */
function ottetti(b, n) {
  if (!n.composto) return b.subarray(n.inizio, n.fine);
  const pezzi = n.figli.map((f) => ottetti(b, f));
  const out = new Uint8Array(pezzi.reduce((s, p) => s + p.length, 0));
  let k = 0;
  for (const p of pezzi) { out.set(p, k); k += p.length; }
  return out;
}

function oid(b, n) {
  const v = b.subarray(n.inizio, n.fine);
  const parti = [Math.floor(v[0] / 40), v[0] % 40];
  let x = 0;
  for (let i = 1; i < v.length; i++) {
    x = x * 128 + (v[i] & 0x7f);
    if (!(v[i] & 0x80)) { parti.push(x); x = 0; }
  }
  return parti.join('.');
}

/** Nomi (CN) dei soggetti dei certificati contenuti nella busta. */
function firmatari(b, signedData) {
  const certificati = signedData.figli.find((f) => f.classe === 2 && f.numero === 0 && f.composto);
  if (!certificati) return [];
  const nomi = [];
  for (const cert of certificati.figli || []) {
    try {
      const tbs = cert.figli[0];
      const campi = tbs.figli.filter((f) => !(f.classe === 2)); // senza [0] version e le estensioni
      // seriale, algoritmo, emittente, validità, soggetto
      const soggetto = campi[4];
      let cn = '';
      for (const set of soggetto.figli || []) {
        for (const seq of set.figli || []) {
          if (oid(b, seq.figli[0]) === OID_CN) cn = new TextDecoder('utf-8').decode(b.subarray(seq.figli[1].inizio, seq.figli[1].fine));
        }
      }
      // i certificati delle autorità di certificazione hanno l'estensione basicConstraints CA: si tengono per ultimi
      if (cn) nomi.push(cn);
    } catch { /* certificato non leggibile: si salta */ }
  }
  return nomi;
}

/** true se i byte sembrano un .p7m (busta SignedData). */
export function eP7m(byte) {
  try {
    const b = daBase64(byte) || byte;
    const r = leggi(b, 0);
    return r.composto && oid(b, r.figli[0]) === '1.2.840.113549.1.7.2';
  } catch {
    return false;
  }
}

/**
 * Estrae il documento firmato.
 * @returns {{ byte: Uint8Array, firmatari: string[], livelli: number, estensione: string }}
 */
export function estraiP7m(byte) {
  let b = byte;
  const nomi = [];
  let livelli = 0;
  if (!eP7m(b)) throw new Error('Il file non è una busta firmata (.p7m) leggibile');
  for (;;) {
    b = daBase64(b) || b;
    const radice = leggi(b, 0);
    if (!radice.composto || oid(b, radice.figli[0]) !== '1.2.840.113549.1.7.2') {
      if (!livelli) throw new Error('Il file non è una busta firmata (.p7m) leggibile');
      break;
    }
    const signedData = radice.figli[1].figli[0];
    const encap = signedData.figli.find((f) => f.classe === 0 && f.numero === 16 && f.figli?.length && f.figli[0].numero === 6);
    const contenuto = encap?.figli[1];
    if (!contenuto) throw new Error('Firma «staccata»: il .p7m non contiene il documento');
    nomi.push(...firmatari(b, signedData));
    b = ottetti(b, contenuto.figli[0]);
    livelli++;
    if (!eP7m(b) || livelli > 5) break;
  }
  const inizio = new TextDecoder('latin1').decode(b.subarray(0, 8));
  const estensione = inizio.startsWith('%PDF') ? '.pdf' : b[0] === 0xff && b[1] === 0xd8 ? '.jpg' : inizio.startsWith('\x89PNG') ? '.png' : inizio.startsWith('PK') ? '.zip' : '';
  return { byte: b, firmatari: [...new Set(nomi)], livelli, estensione };
}

/** Nome del documento contenuto: «POS.pdf.p7m» -> «POS.pdf» (o con l'estensione trovata). */
export function nomeEstratto(nome, estensione = '.pdf') {
  let n = String(nome).split('/').pop();
  while (/\.p7m$/i.test(n)) n = n.replace(/\.p7m$/i, '');
  return /\.[a-z0-9]{2,4}$/i.test(n) ? n : `${n}${estensione || '.pdf'}`;
}
