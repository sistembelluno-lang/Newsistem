// Visore dei documenti dentro l'app (usato sul telefono): i PDF si vedono
// pagina per pagina, con lo zoom, senza scaricarli né passare da un'altra app;
// le immagini si vedono intere. Pulsanti per condividere o aprire con un'altra app.

import { h, bottone, finestra } from './dom.js';
import { caricaPdfjs } from '../servizi/anteprime.js';

const IMMAGINE = /\.(jpe?g|png|gif|webp|bmp)$/i;

/** true se il visore sa mostrare questo file. */
export function visualizzabile(nome) {
  return /\.pdf$/i.test(nome) || IMMAGINE.test(nome);
}

/**
 * Mostra un documento.
 * @param {object} o
 * @param {string} o.titolo
 * @param {string} o.nome nome del file (per il tipo)
 * @param {Uint8Array} o.byte
 * @param {string} [o.nota] riga sotto il titolo (es. chi ha firmato)
 * @param {Array<HTMLElement>} [o.azioni] pulsanti in fondo (condividi, apri con...)
 */
export async function mostraDocumento({ titolo, nome, byte, nota = '', azioni = [] }) {
  const pagine = h('div', { class: 'visore-pagine' });
  let zoom = 1;
  let cambiaZoom = () => {};
  const indicatore = h('span', { class: 'mu piccolo' });
  const corpo = h('div', { class: 'visore' }, nota ? h('p', { class: 'mu piccolo', style: 'margin:0 0 8px' }, nota) : null, pagine);
  const controlli = [
    bottone('', '−', () => cambiaZoom(-0.25), 'q sm', { title: 'Riduci' }),
    indicatore,
    bottone('piu', '', () => cambiaZoom(0.25), 'q sm icona', { title: 'Ingrandisci' }),
  ];
  const { dlg } = finestra(titolo, corpo, [...controlli, h('span', { style: 'flex:1' }), ...azioni], 'grande visore-finestra');

  if (IMMAGINE.test(nome)) {
    const url = URL.createObjectURL(new Blob([byte]));
    const img = h('img', { src: url, alt: titolo });
    pagine.append(img);
    const disegna = () => { img.style.width = `${zoom * 100}%`; indicatore.textContent = `${Math.round(zoom * 100)}%`; };
    cambiaZoom = (d) => { zoom = Math.min(4, Math.max(0.5, zoom + d)); disegna(); };
    disegna();
    dlg.addEventListener('close', () => URL.revokeObjectURL(url));
    return;
  }

  pagine.append(h('div', { class: 'caricamento' }));
  const lib = await caricaPdfjs();
  const doc = await lib.getDocument({ data: byte.slice(), isEvalSupported: false }).promise;
  dlg.addEventListener('close', () => doc.destroy());
  const tele = [];
  const disegnate = new Map(); // numero pagina -> zoom con cui è disegnata
  const larghezzaBase = () => Math.max(280, pagine.clientWidth - 4);
  const osserva = new IntersectionObserver((voci) => {
    for (const v of voci) if (v.isIntersecting) disegnaPagina(Number(v.target.dataset.n));
  }, { root: corpo.closest('.d-b') || null, rootMargin: '600px' });
  async function disegnaPagina(n) {
    if (disegnate.get(n) === zoom) return;
    disegnate.set(n, zoom);
    const pag = await doc.getPage(n);
    const v0 = pag.getViewport({ scale: 1 });
    const larghezza = larghezzaBase() * zoom;
    const scala = (larghezza / v0.width) * Math.min(2, window.devicePixelRatio || 1);
    const vista = pag.getViewport({ scale: scala });
    const c = tele[n - 1];
    c.width = Math.round(vista.width);
    c.height = Math.round(vista.height);
    c.style.width = `${Math.round(larghezza)}px`;
    c.style.height = `${Math.round(larghezza * v0.height / v0.width)}px`;
    await pag.render({ canvasContext: c.getContext('2d'), viewport: vista }).promise;
  }
  function impagina() {
    indicatore.textContent = `${doc.numPages} pag. · ${Math.round(zoom * 100)}%`;
    for (const [i, c] of tele.entries()) {
      // dimensione prima di disegnare (proporzioni A4), così lo scorrimento è giusto da subito
      const larghezza = larghezzaBase() * zoom;
      c.style.width = `${Math.round(larghezza)}px`;
      if (!disegnate.has(i + 1)) c.style.height = `${Math.round(larghezza * 1.414)}px`;
    }
  }
  cambiaZoom = (d) => {
    zoom = Math.min(4, Math.max(0.5, zoom + d));
    impagina();
    for (const c of tele) { osserva.unobserve(c); osserva.observe(c); }
  };
  pagine.replaceChildren();
  for (let n = 1; n <= doc.numPages; n++) {
    const c = h('canvas', { class: 'visore-pagina', dataset: { n: String(n) } });
    tele.push(c);
    pagine.append(c);
  }
  impagina();
  for (const c of tele) osserva.observe(c);
}
