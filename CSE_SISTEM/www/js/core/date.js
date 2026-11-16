// Date in formato italiano e conversioni usate in tutto il programma.
// Le date si salvano come testo ISO locale "AAAA-MM-GGTHH:MM:SS" (senza fuso:
// è l'ora del cantiere, come la scrive la macchina fotografica).

const due = (n) => String(n).padStart(2, '0');

/** Date -> "AAAA-MM-GGTHH:MM:SS" (ora locale). */
export function isoLocale(d = new Date()) {
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}T${due(d.getHours())}:${due(d.getMinutes())}:${due(d.getSeconds())}`;
}

/** "AAAA-MM-GG" di oggi (ora locale). */
export function oggi(d = new Date()) {
  return isoLocale(d).slice(0, 10);
}

/** "AAAA-MM-GG..." -> "GG/MM/AAAA". */
export function dataIt(iso) {
  if (!iso) return '';
  const [a, m, g] = String(iso).slice(0, 10).split('-');
  return g && m && a ? `${g}/${m}/${a}` : String(iso);
}

/** "AAAA-MM-GGTHH:MM..." -> "GG/MM/AAAA HH:MM". */
export function dataOraIt(iso) {
  if (!iso) return '';
  const s = String(iso);
  const ora = s.length >= 16 ? s.slice(11, 16) : '';
  return ora ? `${dataIt(s)} ${ora}` : dataIt(s);
}

/** Data EXIF "AAAA:MM:GG HH:MM:SS" -> ISO locale, o null se non valida. */
export function daExif(testo) {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(testo || '').trim());
  if (!m) return null;
  const [, a, me, g, h, mi, s] = m;
  if (a === '0000' || me === '00' || g === '00') return null; // "0000:00:00 00:00:00" = data assente
  return `${a}-${me}-${g}T${h}:${mi}:${s}`;
}

/** Confronto tra due date ISO (stringhe): ordinamento cronologico. */
export function confronta(a, b) {
  return String(a || '').localeCompare(String(b || ''));
}
