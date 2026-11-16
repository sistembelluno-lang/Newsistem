// Lettura dei dati EXIF dai file JPEG: data di scatto e orientamento.
//
// La data di scatto è DateTimeOriginal (tag 0x9003 nella sotto-cartella Exif);
// se manca si usa DateTimeDigitized (0x9004) o DateTime (0x0132). Nessuna
// libreria esterna: funziona uguale su Windows e Android.

import { daExif } from '../core/date.js';

const TAG_ORIENTAMENTO = 0x0112;
const TAG_DATA = 0x0132;
const TAG_EXIF_IFD = 0x8769;
const TAG_DATA_ORIGINALE = 0x9003;
const TAG_DATA_DIGITALE = 0x9004;

/**
 * @param {Uint8Array|ArrayBuffer} dati contenuto del file
 * @returns {{ scattata: string|null, orientamento: number|null }}
 */
export function leggiExif(dati) {
  const b = dati instanceof Uint8Array ? dati : new Uint8Array(dati);
  const vuoto = { scattata: null, orientamento: null };
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return vuoto; // non è un JPEG
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let pos = 2;
  while (pos + 4 <= b.length) {
    if (b[pos] !== 0xff) return vuoto;
    const marcatore = b[pos + 1];
    if (marcatore === 0xd9 || marcatore === 0xda) return vuoto; // fine immagine / inizio dati
    const lung = dv.getUint16(pos + 2);
    if (marcatore === 0xe1 && lung >= 8 && testo(b, pos + 4, 4) === 'Exif' && b[pos + 8] === 0 && b[pos + 9] === 0) {
      return leggiTiff(dv, pos + 10, Math.min(b.length, pos + 2 + lung));
    }
    pos += 2 + lung;
  }
  return vuoto;
}

function testo(b, da, n) {
  let s = '';
  for (let i = 0; i < n && da + i < b.length; i++) s += String.fromCharCode(b[da + i]);
  return s;
}

function leggiTiff(dv, t0, fine) {
  const out = { scattata: null, orientamento: null };
  if (t0 + 8 > fine) return out;
  const ordine = dv.getUint16(t0);
  if (ordine !== 0x4949 && ordine !== 0x4d4d) return out;
  const le = ordine === 0x4949; // "II" = little endian
  const u16 = (o) => dv.getUint16(o, le);
  const u32 = (o) => dv.getUint32(o, le);
  if (u16(t0 + 2) !== 42) return out;

  function voci(offsetIfd) {
    const o = t0 + offsetIfd;
    if (o + 2 > fine) return [];
    const n = u16(o);
    const lista = [];
    for (let i = 0; i < n; i++) {
      const e = o + 2 + i * 12;
      if (e + 12 > fine) break;
      lista.push({ tag: u16(e), tipo: u16(e + 2), conta: u32(e + 4), valore: e + 8 });
    }
    return lista;
  }

  function stringa(v) {
    // tipo 2 = ASCII; oltre 4 byte il valore è un offset
    if (v.tipo !== 2) return null;
    const da = v.conta > 4 ? t0 + u32(v.valore) : v.valore;
    if (da + v.conta > fine) return null;
    let s = '';
    for (let i = 0; i < v.conta; i++) {
      const c = dv.getUint8(da + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }

  const ifd0 = voci(u32(t0 + 4));
  let dataBase = null;
  let exifIfd = null;
  for (const v of ifd0) {
    if (v.tag === TAG_ORIENTAMENTO && v.tipo === 3) out.orientamento = u16(v.valore);
    else if (v.tag === TAG_DATA) dataBase = daExif(stringa(v));
    else if (v.tag === TAG_EXIF_IFD) exifIfd = u32(v.valore);
  }
  let originale = null;
  let digitale = null;
  if (exifIfd !== null) {
    for (const v of voci(exifIfd)) {
      if (v.tag === TAG_DATA_ORIGINALE) originale = daExif(stringa(v));
      else if (v.tag === TAG_DATA_DIGITALE) digitale = daExif(stringa(v));
    }
  }
  out.scattata = originale || digitale || dataBase;
  return out;
}
