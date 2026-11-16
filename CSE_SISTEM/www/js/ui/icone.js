// Icone a tratto (24×24), disegnate come SVG senza file esterni.

const NS = 'http://www.w3.org/2000/svg';

// Ogni icona: elenco di elementi [tag, attributi].
const P = (d) => ['path', { d }];
const ICONE = {
  riepilogo: [['rect', { x: 3, y: 3, width: 7, height: 9, rx: 1.5 }], ['rect', { x: 14, y: 3, width: 7, height: 5, rx: 1.5 }], ['rect', { x: 14, y: 12, width: 7, height: 9, rx: 1.5 }], ['rect', { x: 3, y: 16, width: 7, height: 5, rx: 1.5 }]],
  anagrafica: [['rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }], ['circle', { cx: 9, cy: 11, r: 2.5 }], P('M5.5 17c.7-1.8 2-2.7 3.5-2.7s2.8.9 3.5 2.7'), P('M15 10h3M15 14h3')],
  progetto: [P('M12 3 3 8l9 5 9-5-9-5z'), P('m3 13 9 5 9-5'), P('m3 17.5 9 4.5 9-4.5')],
  psc: [P('M12 3 5 6v5.5c0 4.3 2.9 8 7 9.5 4.1-1.5 7-5.2 7-9.5V6l-7-3z'), P('m9 12 2 2 4-4')],
  notifica: [P('M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z'), P('M14 3v5h5'), P('M9 13h6M9 17h4')],
  imprese: [P('M3 21h18'), P('M5 21V7l7-4v18'), P('M19 21V11l-7-4'), P('M9 9v.01M9 12v.01M9 15v.01M9 18v.01')],
  giornale: [P('M4 19.5V5a2 2 0 0 1 2-2h14v15H6.5A2.5 2.5 0 0 0 4 20.5 2.5 2.5 0 0 0 6.5 23H20'), P('M8 7h8M8 11h6')],
  foto: [P('M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z'), ['circle', { cx: 12, cy: 13.5, r: 3.5 }]],
  verbali: [['rect', { x: 5, y: 4, width: 14, height: 18, rx: 2 }], P('M9 2h6v4H9z'), P('m9 14 2 2 4-4')],
  impostazioni: [['circle', { cx: 12, cy: 12, r: 3 }], P('M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z')],
  elmetto: [P('M2 18h20'), P('M4 18v-2a8 8 0 0 1 16 0v2'), P('M10 8V5h4v3'), P('M8 9.5 7 13M16 9.5l1 3.5')],
  piu: [P('M12 5v14M5 12h14')],
  aggiorna: [P('M21 12a9 9 0 1 1-2.6-6.4'), P('M21 3v6h-6')],
  occhio: [P('M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z'), ['circle', { cx: 12, cy: 12, r: 3 }]],
  nascosto: [P('M9.9 4.2A10 10 0 0 1 12 4c6.4 0 10 8 10 8a17 17 0 0 1-2.2 3.2'), P('M6.6 6.6C3.9 8.4 2 12 2 12s3.6 8 10 8a9.7 9.7 0 0 0 5.4-1.6'), P('M9.9 9.9a3 3 0 0 0 4.2 4.2'), P('m2 2 20 20')],
  claude: [P('M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8')],
  carica: [P('M12 15V3'), P('m7 8 5-5 5 5'), P('M20 15v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4')],
  apri: [P('M14 4h6v6'), P('M10 14 20 4'), P('M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5')],
  stampa: [P('M6 9V3h12v6'), ['rect', { x: 3, y: 9, width: 18, height: 8, rx: 2 }], P('M6 14h12v7H6z')],
  attenzione: [P('M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'), P('M12 9v4M12 17h.01')],
  ok: [['circle', { cx: 12, cy: 12, r: 9 }], P('m8 12 3 3 5-6')],
  info: [['circle', { cx: 12, cy: 12, r: 9 }], P('M12 16v-4M12 8h.01')],
  chiudi: [P('M18 6 6 18M6 6l12 12')],
  indietro: [P('M15 18 9 12l6-6')],
  avanti: [P('m9 18 6-6-6-6')],
  cartella: [P('M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z')],
  calendario: [['rect', { x: 3, y: 5, width: 18, height: 16, rx: 2 }], P('M16 3v4M8 3v4M3 10h18')],
  luogo: [P('M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z'), ['circle', { cx: 12, cy: 9.5, r: 2.5 }]],
  cestino: [P('M3 6h18'), P('M8 6V4h8v2'), P('M6 6l1 15h10l1-15')],
  matita: [P('M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z')],
  persone: [['circle', { cx: 9, cy: 8, r: 3.5 }], P('M2.5 20c.8-3.4 3.4-5.5 6.5-5.5s5.7 2.1 6.5 5.5'), P('M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.9 2.6 2.6 3 5.2')],
  scatta: [P('M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z'), ['circle', { cx: 12, cy: 13.5, r: 3.5 }], P('M18 11h.01')],
  lucchetto: [['rect', { x: 4, y: 11, width: 16, height: 10, rx: 2 }], P('M8 11V7a4 4 0 0 1 8 0v4')],
  salva: [P('M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z'), P('M7 3v5h8'), P('M7 21v-7h10v7')],
  orologio: [['circle', { cx: 12, cy: 12, r: 9 }], P('M12 7v5l3 2')],
};

/** Elemento <svg> dell'icona richiesta. */
export function icona(nome, classe = '') {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `ico ${classe}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attr] of ICONE[nome] || ICONE.info) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attr)) el.setAttribute(k, v);
    svg.append(el);
  }
  return svg;
}

/** Marchio SISTEM: la "S" con il punto, come nelle altre app SISTEM. */
export function marchio() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', 'M22.5 9.6C20.9 7.9 18.6 7 16.1 7c-4 0-6.9 2.1-6.9 5.2 0 6.7 13.8 3.8 13.8 10.4 0 3.1-2.9 5.4-7.2 5.4-2.8 0-5.2-1-7-2.9');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', '#fff');
  p.setAttribute('stroke-width', '3.6');
  p.setAttribute('stroke-linecap', 'round');
  const c = document.createElementNS(NS, 'circle');
  c.setAttribute('cx', '25.2');
  c.setAttribute('cy', '6.8');
  c.setAttribute('r', '2.2');
  c.setAttribute('fill', '#fde68a');
  svg.append(p, c);
  return svg;
}
