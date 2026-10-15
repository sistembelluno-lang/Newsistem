// Tavola grafica del piano particellare in SVG: particelle catastali, aree d'intervento con retini, numeri di particella,
// numero di piano (ditta) sulle aree, legenda, scala grafica, nord, quadro d'unione e cartiglio.
// Coordinate del disegno in metri; sulla carta si lavora in millimetri alla scala scelta.
(function (ES) {
  'use strict';
  const T = ES.tavola = {}, G = ES.geo, U = ES.U;

  T.STILI = {
    espr: { nome: 'Area da espropriare', col: '#d62828', fill: 'rgba(214,40,40,.28)', pat: 'p-espr' },
    servop: { nome: 'Servitù – ingombro opere', col: '#7b2cbf', fill: 'rgba(123,44,191,.28)', pat: 'p-servop' },
    serv: { nome: 'Area da asservire', col: '#1d70b8', fill: 'rgba(29,112,184,.22)', pat: 'p-serv' },
    occ: { nome: 'Area da occupare temporaneamente', col: '#e09f00', fill: 'rgba(240,180,0,.30)', pat: 'p-occ' }
  };
  T.FORMATI = { A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841], A0: [841, 1189] };
  T.SCALE = [200, 500, 1000, 2000, 2500, 5000, 10000];

  const defs = () => `<defs>
<pattern id="p-espr" patternUnits="userSpaceOnUse" width="2" height="2" patternTransform="rotate(45)"><rect width="2" height="2" fill="rgba(214,40,40,.22)"/><line x1="0" y1="0" x2="0" y2="2" stroke="#d62828" stroke-width=".35"/></pattern>
<pattern id="p-servop" patternUnits="userSpaceOnUse" width="2" height="2"><rect width="2" height="2" fill="rgba(123,44,191,.20)"/><path d="M0 0L2 2M2 0L0 2" stroke="#7b2cbf" stroke-width=".25"/></pattern>
<pattern id="p-serv" patternUnits="userSpaceOnUse" width="2.4" height="2.4" patternTransform="rotate(-45)"><rect width="2.4" height="2.4" fill="rgba(29,112,184,.16)"/><line x1="0" y1="0" x2="0" y2="2.4" stroke="#1d70b8" stroke-width=".3"/></pattern>
<pattern id="p-occ" patternUnits="userSpaceOnUse" width="2.2" height="2.2"><rect width="2.2" height="2.2" fill="rgba(240,180,0,.26)"/><circle cx="1.1" cy="1.1" r=".35" fill="#c98a00"/></pattern>
</defs>`;

  // Trasformazione mondo → carta (mm) per una finestra [x0,y0,x1,y1] disegnata in un riquadro {x,y,w,h} a scala 1:s
  const trasf = (fin, box, s) => {
    const k = 1000 / s, cx = (fin[0] + fin[2]) / 2, cy = (fin[1] + fin[3]) / 2;
    return { k, f: (x, y) => [box.x + box.w / 2 + (x - cx) * k, box.y + box.h / 2 - (y - cy) * k] };
  };
  const pathMP = (M, f) => M.map(P => P.map(r => 'M' + r.map(p => { const q = f(p[0], p[1]); return q[0].toFixed(2) + ' ' + q[1].toFixed(2); }).join('L') + 'Z').join('')).join('');
  const pathPts = (pts, chiusa, f) => 'M' + pts.map(p => { const q = f(p[0], p[1]); return q[0].toFixed(2) + ' ' + q[1].toFixed(2); }).join('L') + (chiusa ? 'Z' : '');

  // Scala standard che fa stare la finestra nel riquadro
  T.scalaAdatta = (bb, box, minima = 200) => {
    const w = Math.max(1, bb[2] - bb[0]), h = Math.max(1, bb[3] - bb[1]);
    const s = Math.max(w / box.w, h / box.h) * 1000 * 1.08;
    return T.SCALE.find(x => x >= s && x >= minima) || Math.ceil(s / 1000) * 1000;
  };

  // Il disegno della mappa (senza cornice) dentro un riquadro
  function mappa(pr, calc, box, fin, s, opt) {
    const geo = pr.geo; if (!geo) return '';
    const { k, f } = trasf(fin, box, s);
    const cx = (fin[0] + fin[2]) / 2, cy = (fin[1] + fin[3]) / 2, hw = box.w / 2 / k, hh = box.h / 2 / k;
    const vista = [cx - hw, cy - hh, cx + hw, cy + hh];
    const dentro = M => G.bboxOverlap(G.bboxMP(M), vista);
    const partDitta = new Map((pr.particelle || []).map(p => [ES.analisi.chiave(p.fg, p.map, p.sub), p]));
    const dittaDi = kk => { const p = partDitta.get(kk) || partDitta.get(String(kk).split('|').slice(0, 2).join('|')); return p ? (pr.ditte || []).find(d => d.id === p.ditta) : null; };
    const id = 'c' + Math.random().toString(36).slice(2, 7);
    let o = `<clipPath id="${id}"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"/></clipPath><g clip-path="url(#${id})">`;
    o += `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="#fff"/>`;
    // Sfondo
    (geo.sfondo || []).forEach(l => { if (G.bboxOverlap(G.bboxPts(l.pts), vista)) o += `<path d="${pathPts(l.pts, l.chiusa, f)}" fill="none" stroke="#9aa3ad" stroke-width=".18"/>`; });
    // Aree d'intervento
    const sel = opt.ditta || null;
    ['occ', 'serv', 'servop', 'espr'].forEach(t => (geo.pezzi || []).filter(p => p.tipo === t && dentro(p.mp)).forEach(p => {
      const d = p.k ? dittaDi(p.k) : null, altra = sel && (!d || d.id !== sel);
      const st = T.STILI[t];
      o += `<path d="${pathMP(p.mp, f)}" fill="${altra ? 'none' : 'url(#' + st.pat + ')'}" fill-rule="evenodd" stroke="${st.col}" stroke-width="${altra ? .15 : .3}" ${altra ? 'stroke-dasharray="1 .8"' : ''} data-pezzo="${p.id}" data-k="${p.k || ''}"/>`;
    }));
    // Particelle catastali
    (geo.part || []).forEach(p => { if (dentro(p.mp)) o += `<path d="${pathMP(p.mp, f)}" fill="none" stroke="#222" stroke-width=".2" data-k="${p.k || ''}" class="tv-part"/>`; });
    // Numeri di particella: testi del DXF, altrimenti al centro del poligono
    const g = opt.seg || 1, hTxt = (opt.hTesto || 2.2) * g, scritti = new Set();
    (geo.part || []).forEach(p => {
      if (!p.k || !dentro(p.mp) || scritti.has(p.k)) return;
      const lp = G.puntoEtichettaMP(p.mp); if (!lp) return;
      const area = G.areaMP(p.mp) * k * k; if (area < 6 * g * g) return;
      scritti.add(p.k);
      const q = f(lp[0], lp[1]);
      o += `<text x="${q[0].toFixed(2)}" y="${q[1].toFixed(2)}" font-size="${hTxt}" text-anchor="middle" dominant-baseline="middle" fill="#111" font-family="Arial">${U.esc(p.map)}</text>`;
    });
    if (!(geo.part || []).length) (geo.etich || []).forEach(t => { const q = f(t.x, t.y); if (q[0] > box.x && q[0] < box.x + box.w && q[1] > box.y && q[1] < box.y + box.h) o += `<text x="${q[0].toFixed(2)}" y="${q[1].toFixed(2)}" font-size="${hTxt}" fill="#111" font-family="Arial">${U.esc(t.t)}</text>`; });
    // Numero di piano: un cerchio per ditta e gruppo di aree vicine
    const perDitta = new Map();
    (geo.pezzi || []).forEach(p => { const d = p.k ? dittaDi(p.k) : null; if (!d || !dentro(p.mp) || (sel && d.id !== sel)) return; (perDitta.get(d.id) || perDitta.set(d.id, { d, pz: [] }).get(d.id)).pz.push(p); });
    perDitta.forEach(({ d, pz }) => {
      const grande = pz.slice().sort((a, b) => b.a - a.a)[0];
      const lp = G.puntoEtichettaMP(grande.mp); if (!lp) return;
      const q = f(lp[0], lp[1]), r = Math.max(2.2, String(d.n).length * 1.3) * g;
      const ox = q[0] + r * 1.6, oy = q[1] - r * 1.6;
      o += `<line x1="${q[0].toFixed(2)}" y1="${q[1].toFixed(2)}" x2="${ox.toFixed(2)}" y2="${oy.toFixed(2)}" stroke="#d62828" stroke-width="${.25 * g}"/><circle cx="${ox.toFixed(2)}" cy="${oy.toFixed(2)}" r="${r}" fill="#fff" stroke="#d62828" stroke-width="${.35 * g}"/><text x="${ox.toFixed(2)}" y="${oy.toFixed(2)}" font-size="${r * 1.05}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="#d62828" font-family="Arial" data-ditta="${d.id}">${U.esc(d.n)}</text>`;
    });
    o += '</g>';
    return o;
  }

  function legenda(x, y, w, tipi) {
    let o = `<g font-family="Arial"><rect x="${x}" y="${y}" width="${w}" height="${8 + tipi.length * 6 + 6}" fill="#fff" stroke="#222" stroke-width=".25"/><text x="${x + 3}" y="${y + 5}" font-size="3" font-weight="700">LEGENDA</text>`;
    tipi.forEach((t, i) => { const st = T.STILI[t], yy = y + 8 + i * 6; o += `<rect x="${x + 3}" y="${yy}" width="9" height="4.2" fill="url(#${st.pat})" stroke="${st.col}" stroke-width=".3"/><text x="${x + 14}" y="${yy + 3.3}" font-size="2.6">${st.nome}</text>`; });
    const yy = y + 8 + tipi.length * 6;
    o += `<circle cx="${x + 7.5}" cy="${yy + 2.2}" r="2" fill="#fff" stroke="#d62828" stroke-width=".35"/><text x="${x + 7.5}" y="${yy + 2.3}" font-size="2" font-weight="700" fill="#d62828" text-anchor="middle" dominant-baseline="central">N</text><text x="${x + 14}" y="${yy + 3.2}" font-size="2.6">Numero di piano (ditta)</text></g>`;
    return o;
  }
  function scalaGrafica(x, y, s) {
    const passi = [10, 20, 25, 50, 100, 200, 250, 500, 1000], m = passi.find(p => p * 1000 / s >= 8) || 1000, mm = m * 1000 / s;
    let o = `<g font-family="Arial" font-size="2.2">`;
    for (let i = 0; i < 4; i++) o += `<rect x="${x + i * mm}" y="${y}" width="${mm}" height="1.6" fill="${i % 2 ? '#fff' : '#222'}" stroke="#222" stroke-width=".2"/><text x="${x + i * mm}" y="${y + 4.6}" text-anchor="middle">${i * m}</text>`;
    return o + `<text x="${x + 4 * mm}" y="${y + 4.6}" text-anchor="middle">${4 * m} m</text><text x="${x}" y="${y - 1.5}" font-weight="700">Scala 1:${s}</text></g>`;
  }
  const nord = (x, y, h = 12) => `<g><path d="M${x} ${y} L${x + h * .28} ${y + h} L${x} ${y + h * .78} L${x - h * .28} ${y + h} Z" fill="#222"/><text x="${x}" y="${y - 1.2}" font-size="3.4" font-weight="700" text-anchor="middle" font-family="Arial">N</text></g>`;

  function cartiglio(x, y, w, h, c) {
    const r = (yy, t, sz, b) => `<text x="${x + 3}" y="${yy}" font-size="${sz}" ${b ? 'font-weight="700"' : ''} font-family="Arial">${U.esc(t)}</text>`;
    let o = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="#222" stroke-width=".35"/>`;
    o += r(y + 5, c.ente || '', 3.2, true) + r(y + 10, c.opera || '', 2.6) + `<line x1="${x}" y1="${y + 13}" x2="${x + w}" y2="${y + 13}" stroke="#222" stroke-width=".25"/>`;
    o += r(y + 19, c.titolo || 'PIANO PARTICELLARE DI ESPROPRIO', 3.4, true) + r(y + 24, c.sotto || '', 2.6);
    o += `<line x1="${x}" y1="${y + h - 8}" x2="${x + w}" y2="${y + h - 8}" stroke="#222" stroke-width=".25"/>` + r(y + h - 3, `Scala 1:${c.scala}   ·   Data ${c.data || U.dataIt(U.oggi())}   ·   ${c.tecnico || ''}`, 2.4);
    return o;
  }

  // Quadro d'unione: tutta l'opera in piccolo con il riquadro della vista
  function keymap(pr, box, vista) {
    const bb = pr.geo.bbox, s = T.scalaAdatta(bb, box, 1) * 1.02;
    const { f } = trasf(bb, box, s);
    let o = `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="#fff" stroke="#222" stroke-width=".25"/>`;
    (pr.geo.pezzi || []).forEach(p => { o += `<path d="${pathMP(p.mp, f)}" fill="${T.STILI[p.tipo].col}" stroke="none"/>`; });
    const a = f(vista[0], vista[3]), b = f(vista[2], vista[1]);
    o += `<rect x="${a[0].toFixed(2)}" y="${a[1].toFixed(2)}" width="${(b[0] - a[0]).toFixed(2)}" height="${(b[1] - a[1]).toFixed(2)}" fill="none" stroke="#d62828" stroke-width=".4"/><text x="${box.x + 2}" y="${box.y + 4}" font-size="2.6" font-weight="700" font-family="Arial">QUADRO D'UNIONE</text>`;
    return o;
  }

  // Finestra da disegnare: tutte le aree d'intervento (o quelle della ditta), con margine
  T.finestra = (pr, dittaId, margine = 0.15) => {
    const geo = pr.geo; if (!geo) return null;
    let L = geo.pezzi || [];
    if (dittaId) {
      const kd = new Set((pr.particelle || []).filter(p => p.ditta === dittaId).flatMap(p => [ES.analisi.chiave(p.fg, p.map, p.sub), ES.analisi.chiave(p.fg, p.map, '')]));
      L = L.filter(p => kd.has(p.k));
      if (!L.length) { const parts = (geo.part || []).filter(p => kd.has(p.k)); if (parts.length) L = parts; }
    }
    if (!L.length) L = geo.part || [];
    if (!L.length) return geo.bbox;
    const bb = [Infinity, Infinity, -Infinity, -Infinity]; L.forEach(p => G.bboxMP(p.mp, bb));
    const dx = Math.max(10, (bb[2] - bb[0]) * margine), dy = Math.max(10, (bb[3] - bb[1]) * margine);
    return [bb[0] - dx, bb[1] - dy, bb[2] + dx, bb[3] + dy];
  };

  // Tavola completa su un foglio. opt: {formato:'A3', orient:'L'|'P', scala (0 = adatta), ditta, titolo, sotto}
  T.foglio = (pr, calc, opt = {}) => {
    const [a, b] = T.FORMATI[opt.formato || 'A3'] || T.FORMATI.A3;
    const L = (opt.orient || 'L') === 'L', W = L ? b : a, H = L ? a : b, m = 10;
    const latoW = Math.min(85, W * 0.3);
    const box = { x: m, y: m, w: W - 2 * m - latoW - 4, h: H - 2 * m };
    const fin = T.finestra(pr, opt.ditta);
    if (!fin) return '';
    const s = opt.scala || T.scalaAdatta(fin, box);
    const cx = (fin[0] + fin[2]) / 2, cy = (fin[1] + fin[3]) / 2, hw = box.w / 2 * s / 1000, hh = box.h / 2 * s / 1000;
    const tipi = ES.analisi.TIPI.filter(t => (pr.geo.pezzi || []).some(p => p.tipo === t));
    const xl = W - m - latoW;
    let o = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="Arial">${defs()}<rect width="${W}" height="${H}" fill="#fff"/>`;
    o += mappa(pr, calc, box, fin, s, opt) + `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="none" stroke="#222" stroke-width=".5"/>`;
    o += nord(box.x + box.w - 10, box.y + 6);
    const kmH = Math.min(70, H * 0.28);
    o += keymap(pr, { x: xl, y: m, w: latoW, h: kmH }, [cx - hw, cy - hh, cx + hw, cy + hh]);
    o += legenda(xl, m + kmH + 4, latoW, tipi);
    o += scalaGrafica(xl + 4, m + kmH + 4 + 8 + (tipi.length + 1) * 6 + 14, s);
    const ch = 48;
    o += cartiglio(xl, H - m - ch, latoW, ch, { ente: pr.ente && pr.ente.nome, opera: pr.nome, titolo: opt.titolo, sotto: opt.sotto, scala: s, tecnico: pr.ente && pr.ente.tecnico });
    return o + '</svg>';
  };

  // Estratto di mappa per una ditta (allegato alle lettere e allo stato di consistenza): riquadro di 170×200 mm
  T.estratto = (pr, calc, dittaId, scala = 1000, mm = [170, 200]) => {
    const fin = T.finestra(pr, dittaId, 0.25); if (!fin) return '';
    const box = { x: 0, y: 0, w: mm[0], h: mm[1] - 30 };
    let s = scala; const need = T.scalaAdatta(fin, box, 1); if (need > s) s = need;
    const tipi = ES.analisi.TIPI.filter(t => (pr.geo.pezzi || []).some(p => p.tipo === t));
    let o = `<svg xmlns="http://www.w3.org/2000/svg" width="${mm[0]}mm" height="${mm[1]}mm" viewBox="0 0 ${mm[0]} ${mm[1]}" font-family="Arial">${defs()}<rect width="${mm[0]}" height="${mm[1]}" fill="#fff"/>`;
    o += mappa(pr, calc, box, fin, s, { ditta: dittaId }) + `<rect x="0.3" y="0.3" width="${box.w - .6}" height="${box.h - .6}" fill="none" stroke="#222" stroke-width=".4"/>`;
    o += nord(box.w - 8, 5, 10) + `<text x="3" y="5" font-size="3.2" font-weight="700">Estratto mappa catastale – scala 1:${s}</text>`;
    tipi.forEach((t, i) => { const st = T.STILI[t], x = 3, y = box.h + 3 + i * 6.5; o += `<rect x="${x}" y="${y}" width="9" height="4.2" fill="url(#${st.pat})" stroke="${st.col}" stroke-width=".3"/><text x="${x + 11}" y="${y + 3.3}" font-size="2.8">${st.nome}</text>`; });
    o += scalaGrafica(box.w - 64, box.h + 10, s);
    return o + '</svg>';
  };

  // Vista a schermo: tutta la geometria, in coordinate mondo invertite (per pan e zoom nel programma)
  T.schermo = (pr, calc, opt = {}) => {
    const geo = pr.geo; if (!geo) return '';
    const bb = geo.bbox, W = 1000, H = Math.max(200, W * (bb[3] - bb[1]) / Math.max(1, bb[2] - bb[0]));
    const s = Math.max(bb[2] - bb[0], 1) * 1000 / W; // 1 unità = 1 mm a scala s
    const box = { x: 0, y: 0, w: W, h: H };
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Arial">${defs()}${mappa(pr, calc, box, bb, s, { ditta: opt.ditta, seg: Math.max(1, W / 450) })}</svg>`, W, H, s };
  };
})(ES);
