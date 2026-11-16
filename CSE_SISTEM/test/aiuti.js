// Aiuti per i test: JPEG minimi con dati EXIF costruiti a mano.

/**
 * JPEG (non visualizzabile, ma con intestazione EXIF valida) con le date
 * indicate. little=true: ordine Intel ("II"), false: Motorola ("MM").
 */
export function jpegConExif({ dataOriginale = null, data = null, orientamento = null, little = true } = {}) {
  const ifd0 = [];
  const exif = [];
  if (orientamento) ifd0.push({ tag: 0x0112, tipo: 3, valore: orientamento });
  if (data) ifd0.push({ tag: 0x0132, tipo: 2, testo: data });
  if (dataOriginale) exif.push({ tag: 0x9003, tipo: 2, testo: dataOriginale });
  if (exif.length) ifd0.push({ tag: 0x8769, tipo: 4, puntatoreExif: true });

  const byte = [];
  const u16 = (v) => (little ? [v & 0xff, v >> 8] : [v >> 8, v & 0xff]);
  const u32 = (v) => (little ? [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24] : [v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]);
  const enc = (s) => [...s].map((c) => c.charCodeAt(0)).concat([0]);

  // disposizione: intestazione TIFF (8) | IFD0 | IFD Exif | dati delle stringhe
  const dimIfd = (n) => 2 + n * 12 + 4;
  const offIfd0 = 8;
  const offExif = offIfd0 + dimIfd(ifd0.length);
  let offDati = offExif + (exif.length ? dimIfd(exif.length) : 0);
  const dati = [];
  function voce(v) {
    const out = [...u16(v.tag), ...u16(v.tipo)];
    if (v.tipo === 2) {
      const s = enc(v.testo);
      out.push(...u32(s.length), ...u32(offDati));
      dati.push(...s);
      offDati += s.length;
    } else if (v.puntatoreExif) {
      out.push(...u32(1), ...u32(offExif));
    } else {
      out.push(...u32(1), ...u16(v.valore), 0, 0);
    }
    return out;
  }
  const tiff = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(offIfd0)];
  tiff.push(...u16(ifd0.length), ...ifd0.flatMap(voce), ...u32(0));
  if (exif.length) tiff.push(...u16(exif.length), ...exif.flatMap(voce), ...u32(0));
  tiff.push(...dati);

  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]; // "Exif\0\0"
  const lung = app1.length + 2;
  byte.push(0xff, 0xd8, 0xff, 0xe1, lung >> 8, lung & 0xff, ...app1, 0xff, 0xd9);
  return new Uint8Array(byte);
}
