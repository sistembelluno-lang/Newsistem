// Timbro della data di scatto in basso a destra sulle foto.
//
// La foto originale non si tocca: si salva una copia "timbrata". La parte di
// calcolo (testo, dimensioni, posizione) è separata dal disegno, così si può
// provare senza browser; il disegno usa un canvas (Windows e Android).

import { dataOraIt } from '../core/date.js';

/**
 * Dove e quanto grande scrivere la data, proporzionato alla foto.
 * @returns {{ testo, fontPx, x, y, padding, riquadro: {x, y, w, h} }}
 *   x, y: angolo in basso a destra del testo (allineamento destra/basso)
 */
export function layoutTimbro(larghezza, altezza, isoScatto, larghezzaTesto = null) {
  const testo = dataOraIt(isoScatto);
  const lato = Math.min(larghezza, altezza);
  const fontPx = Math.max(14, Math.round(lato * 0.035));
  const margine = Math.round(fontPx * 0.8);
  const padding = Math.round(fontPx * 0.35);
  // larghezza del testo: misurata dal canvas se disponibile, altrimenti stimata
  const w = larghezzaTesto ?? Math.round(testo.length * fontPx * 0.6);
  const x = larghezza - margine;
  const y = altezza - margine;
  return {
    testo, fontPx, x, y, padding,
    riquadro: { x: x - w - padding, y: y - fontPx - padding, w: w + 2 * padding, h: fontPx + 2 * padding },
  };
}

/**
 * Disegna la data sulla foto e restituisce il JPEG timbrato (Uint8Array).
 * @param {Uint8Array} byteJpeg
 * @param {string} isoScatto
 * La foto viene raddrizzata secondo l'orientamento EXIF (foto fatte con il
 * telefono in verticale), così la data finisce davvero in basso a destra.
 */
export async function timbraFoto(byteJpeg, isoScatto, qualita = 0.9) {
  const blob = new Blob([byteJpeg], { type: 'image/jpeg' });
  // createImageBitmap applica l'orientamento EXIF se richiesto
  const img = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const larghezza = img.width;
  const altezza = img.height;
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(larghezza, altezza)
    : Object.assign(document.createElement('canvas'), { width: larghezza, height: altezza });
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const prova = layoutTimbro(larghezza, altezza, isoScatto);
  ctx.font = `bold ${prova.fontPx}px Arial, sans-serif`;
  const l = layoutTimbro(larghezza, altezza, isoScatto, ctx.measureText(prova.testo).width);
  // fondo scuro semitrasparente: la data si legge su qualsiasi foto
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(l.riquadro.x, l.riquadro.y, l.riquadro.w, l.riquadro.h);
  ctx.fillStyle = '#ffb000';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(l.testo, l.x, l.y);
  const uscita = canvas.convertToBlob
    ? await canvas.convertToBlob({ type: 'image/jpeg', quality: qualita })
    : await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', qualita));
  return { byte: new Uint8Array(await uscita.arrayBuffer()), larghezza, altezza };
}
