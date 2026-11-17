// Anteprime dei documenti (prima pagina dei PDF, immagini, .p7m) da mostrare
// nel verbale e da stampare come «immaginetta» su foglio A4.
// I PDF si disegnano con pdf.js (www/vendor/pdfjs, Mozilla, Apache-2.0).

import { estraiP7m } from './p7m.js';

let pdfjs = null;
export async function caricaPdfjs() {
  if (!pdfjs) {
    pdfjs = await import('../../vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  }
  return pdfjs;
}

const IMMAGINE = /\.(jpe?g|png|gif|webp|bmp)$/i;

/** Tipo del documento dal nome: pdf, immagine, p7m, altro. */
export function tipoDocumento(nome) {
  const n = String(nome).toLowerCase();
  if (n.endsWith('.p7m')) return 'p7m';
  if (n.endsWith('.pdf')) return 'pdf';
  if (IMMAGINE.test(n)) return 'immagine';
  return 'altro';
}

function suTela(larghezza, altezza) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(larghezza));
  c.height = Math.max(1, Math.round(altezza));
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  return { c, g };
}

/**
 * Anteprima di un documento.
 * @param {Uint8Array} byte
 * @param {string} nome nome del file (per il tipo)
 * @returns {Promise<{ src: string, pagine: number, tipo: string, firmatari: string[] }>} src: data URL JPEG ('' se non disegnabile)
 */
export async function anteprima(byte, nome, { larghezza = 900 } = {}) {
  let tipo = tipoDocumento(nome);
  let firmatari = [];
  if (tipo === 'p7m') {
    const e = estraiP7m(byte);
    byte = e.byte;
    firmatari = e.firmatari;
    tipo = e.estensione === '.pdf' ? 'pdf' : IMMAGINE.test(e.estensione) ? 'immagine' : 'altro';
  }
  if (tipo === 'pdf') {
    const lib = await caricaPdfjs();
    const doc = await lib.getDocument({ data: byte.slice(), isEvalSupported: false }).promise;
    try {
      const pag = await doc.getPage(1);
      const v0 = pag.getViewport({ scale: 1 });
      const vista = pag.getViewport({ scale: larghezza / v0.width });
      const { c, g } = suTela(vista.width, vista.height);
      await pag.render({ canvasContext: g, viewport: vista }).promise;
      return { src: c.toDataURL('image/jpeg', 0.82), pagine: doc.numPages, tipo: 'pdf', firmatari };
    } finally {
      doc.destroy();
    }
  }
  if (tipo === 'immagine') {
    const img = await createImageBitmap(new Blob([byte]));
    const k = Math.min(1, larghezza / img.width);
    const { c, g } = suTela(img.width * k, img.height * k);
    g.drawImage(img, 0, 0, c.width, c.height);
    img.close?.();
    return { src: c.toDataURL('image/jpeg', 0.82), pagine: 1, tipo: 'immagine', firmatari };
  }
  return { src: '', pagine: 0, tipo: 'altro', firmatari };
}
