// Tavola grafica del piano particellare in SVG, come una tavola catastale: particelle con i numeri, aree d'intervento
// con retini, numero di piano (cerchietto della ditta) con i richiami alle sue particelle, quote dei lati e superfici,
// legenda, scala grafica, nord, quadro d'unione, elenco ditte e cartiglio. Tagli particella per particella per gli
// allegati dei documenti. Coordinate del disegno in metri; sulla carta si lavora in millimetri alla scala scelta,
// quindi la stampa al 100% è in scala vera.
(function (ES) {
  'use strict';
  const T = ES.tavola = {}, G = ES.geo, U = ES.U;
  const A = () => ES.analisi;

  T.STILI = {
    espr: { nome: 'Area da espropriare', col: '#d62828', fill: 'rgba(214,40,40,.28)', pat: 'p-espr' },
    servop: { nome: 'Servitù – ingombro opere', col: '#7b2cbf', fill: 'rgba(123,44,191,.28)', pat: 'p-servop' },
    serv: { nome: 'Area da asservire', col: '#1d70b8', fill: 'rgba(29,112,184,.22)', pat: 'p-serv' },
    occ: { nome: 'Area da occupare temporaneamente', col: '#e09f00', fill: 'rgba(240,180,0,.30)', pat: 'p-occ' }
  };
  T.FORMATI = { A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841], A0: [841, 1189] };
  T.SCALE = [100, 200, 250, 500, 1000, 1500, 2000, 2500, 4000, 5000, 10000];
  const ROSSO = '#c1121f';

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
  const n2 = v => v.toFixed(2);
  const pathMP = (M, f) => M.map(P => P.map(r => 'M' + r.map(p => { const q = f(p[0], p[1]); return n2(q[0]) + ' ' + n2(q[1]); }).join('L') + 'Z').join('')).join('');
  const pathPts = (pts, chiusa, f) => 'M' + pts.map(p => { const q = f(p[0], p[1]); return n2(q[0]) + ' ' + n2(q[1]); }).join('L') + (chiusa ? 'Z' : '');
  // Testo leggibile sopra i retini: alone bianco
  const testo = (x, y, t, sz, extra = '') => `<text x="${n2(x)}" y="${n2(y)}" font-size="${n2(sz)}" text-anchor="middle" dominant-baseline="central" font-family="Arial" stroke="#fff" stroke-width="${n2(sz * 0.28)}" paint-order="stroke" stroke-linejoin="round" ${extra}>${U.esc(t)}</text>`;

  // Scala standard che fa stare la finestra nel riquadro
  T.scalaAdatta = (bb, box, minima = 100) => {
    const w = Math.max(1, bb[2] - bb[0]), h = Math.max(1, bb[3] - bb[1]);
    const s = Math.max(w / box.w, h / box.h) * 1000 * 1.06;
    return T.SCALE.find(x => x >= s && x >= minima) || Math.ceil(s / 1000) * 1000;
  };

  // Ingombro dell'intervento: le aree d'intervento (o le particelle). Non usa l'ingombro di tutto il disegno, che
  // spesso comprende cartigli o elementi lontani e farebbe sparire le aree.
  T.ambito = geo => {
    if (!geo) return null;
    const L = (geo.pezzi || []).length ? geo.pezzi : (geo.part || []);
    if (!L.length) return geo.bbox;
    const bb = [Infinity, Infinity, -Infinity, -Infinity]; L.forEach(p => G.bboxMP(p.mp, bb));
    return bb;
  };

  // Particelle e ditte della pratica per chiave catastale
  const indice = pr => {
    const partDitta = new Map((pr.particelle || []).map(p => [A().chiave(p.fg, p.map, p.sub), p]));
    const part = k => partDitta.get(k) || partDitta.get(String(k).split('|').slice(0, 2).join('|'));
    const ditta = k => { const p = k ? part(k) : null; return p ? (pr.ditte || []).find(d => d.id === p.ditta) || null : null; };
    return { part, ditta };
  };

  // Il disegno della mappa (senza cornice) dentro un riquadro.
  // opt: ditta (evidenziata), particella (chiave evidenziata), seg (fattore grafico a schermo), quote, aree, cerchi (true)
  function mappa(pr, calc, box, fin, s, opt = {}) {
    const geo = pr.geo; if (!geo) return '';
    const { k, f } = trasf(fin, box, s);
    const cx = (fin[0] + fin[2]) / 2, cy = (fin[1] + fin[3]) / 2, hw = box.w / 2 / k, hh = box.h / 2 / k;
    const vista = [cx - hw, cy - hh, cx + hw, cy + hh];
    const vistaMP = [[[[vista[0], vista[1]], [vista[2], vista[1]], [vista[2], vista[3]], [vista[0], vista[3]]]]];
    const dentro = M => G.bboxOverlap(G.bboxMP(M), vista);
    const ix = indice(pr), g = opt.seg || 1;
    const scelto = p => opt.particella ? p.k === opt.particella : opt.ditta ? (ix.ditta(p.k) || {}).id === opt.ditta : true;
    const id = 'c' + Math.random().toString(36).slice(2, 7);
    let o = `<clipPath id="${id}"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"/></clipPath><g clip-path="url(#${id})">`;
    o += `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="#fff"/>`;
    // Sfondo
    (geo.sfondo || []).forEach(l => { if (G.bboxOverlap(G.bboxPts(l.pts), vista)) o += `<path d="${pathPts(l.pts, l.chiusa, f)}" fill="none" stroke="#9aa3ad" stroke-width="${.15 * g}"/>`; });
    const pezzi = (geo.pezzi || []).filter(p => dentro(p.mp));
    // Aree d'intervento (le non scelte tratteggiate, senza retino)
    ['occ', 'serv', 'servop', 'espr'].forEach(t => pezzi.filter(p => p.tipo === t).forEach(p => {
      const st = T.STILI[t], si = scelto(p);
      o += `<path d="${pathMP(p.mp, f)}" fill="${si ? 'url(#' + st.pat + ')' : 'none'}" fill-rule="evenodd" stroke="${st.col}" stroke-width="${(si ? .3 : .15) * g}" ${si ? '' : 'stroke-dasharray="1 .8"'} data-pezzo="${p.id}" data-k="${p.k || ''}"/>`;
    }));
    // Particelle catastali (la particella del taglio più marcata)
    const parti = (geo.part || []).filter(p => dentro(p.mp));
    parti.forEach(p => { const ev = opt.particella && p.k === opt.particella; o += `<path d="${pathMP(p.mp, f)}" fill="none" stroke="#111" stroke-width="${(ev ? .6 : .22) * g}" data-k="${p.k || ''}" class="tv-part"/>`; });
    // Numeri di particella: nella parte visibile del poligono (le particelle grandi tagliate dal bordo restano numerate)
    const hTxt = (opt.hTesto || 2.2) * g, scritti = new Set(), interessate = new Set(pezzi.map(p => p.k).filter(Boolean));
    parti.forEach(p => {
      if (!p.k || scritti.has(p.k)) return;
      let M = p.mp; const b = G.bboxMP(M);
      if (!(b[0] >= vista[0] && b[2] <= vista[2] && b[1] >= vista[1] && b[3] <= vista[3])) { try { M = G.intersezione(M, vistaMP); } catch (e) { /* tiene il poligono intero */ } }
      if (!M.length) return;
      const area = G.areaMP(M) * k * k; if (area < 5 * g * g && !interessate.has(p.k)) return;
      const lp = G.puntoEtichettaMP(M); if (!lp) return;
      scritti.add(p.k);
      const q = f(lp[0], lp[1]), forte = interessate.has(p.k);
      o += testo(q[0], q[1], p.map + (p.sub ? ' sub ' + p.sub : ''), forte ? hTxt * 1.12 : hTxt, `fill="#111" ${forte ? 'font-weight="700"' : ''}`);
    });
    if (!(geo.part || []).length) (geo.etich || []).forEach(t => { const q = f(t.x, t.y); if (q[0] > box.x && q[0] < box.x + box.w && q[1] > box.y && q[1] < box.y + box.h) o += testo(q[0], q[1], t.t, hTxt, 'fill="#111"'); });
    // Superfici delle aree scelte
    if (opt.aree) pezzi.filter(scelto).forEach(p => {
      const lp = G.puntoEtichettaMP(p.mp); if (!lp || G.areaMP(p.mp) * k * k < 30 * g * g) return;
      const q = f(lp[0], lp[1]);
      o += testo(q[0], q[1] + hTxt * 1.25, U.fmt(p.a, p.a < 10 ? 1 : 0) + ' mq', hTxt * 0.82, `fill="${T.STILI[p.tipo].col}" font-weight="700"`);
    });
    // Quote dei lati delle aree scelte (lunghezza in metri lungo il lato, fuori dall'area)
    if (opt.quote) {
      const fatti = new Set(), hq = hTxt * 0.72;
      pezzi.filter(scelto).forEach(p => p.mp.forEach(P => P.forEach(r => {
        const n = r.length, chiuso = n > 2 && r[0][0] === r[n - 1][0] && r[0][1] === r[n - 1][1], ccw = G.areaAnello(r) > 0;
        for (let i = 0; i < n - (chiuso ? 1 : 0); i++) {
          const a = r[i], b = r[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (L * k < 9 * g) continue;
          const key = [a, b].map(v => v[0].toFixed(2) + ',' + v[1].toFixed(2)).sort().join(';');
          if (fatti.has(key)) continue; fatti.add(key);
          const pa = f(a[0], a[1]), pb = f(b[0], b[1]);
          if (Math.max(pa[0], pb[0]) < box.x || Math.min(pa[0], pb[0]) > box.x + box.w || Math.max(pa[1], pb[1]) < box.y || Math.min(pa[1], pb[1]) > box.y + box.h) continue;
          let ang = Math.atan2(pb[1] - pa[1], pb[0] - pa[0]) * 180 / Math.PI;
          // normale verso l'esterno dell'anello (in carta l'asse y è invertito)
          const dx = (pb[0] - pa[0]) / (L * k), dy = (pb[1] - pa[1]) / (L * k), nx = ccw ? dy : -dy, ny = ccw ? -dx : dx;
          const mx = (pa[0] + pb[0]) / 2 + nx * hq * 0.9, my = (pa[1] + pb[1]) / 2 + ny * hq * 0.9;
          if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
          o += `<text x="${n2(mx)}" y="${n2(my)}" font-size="${n2(hq)}" text-anchor="middle" dominant-baseline="central" font-family="Arial" fill="#333" stroke="#fff" stroke-width="${n2(hq * .25)}" paint-order="stroke" transform="rotate(${ang.toFixed(1)} ${n2(mx)} ${n2(my)})">${U.fmt(L, 2)}</text>`;
        }
      })));
    }
    // Numero di piano: cerchietto della ditta fuori dalle aree, con un richiamo a ciascuna sua particella
    if (opt.cerchi !== false) {
      const perDitta = new Map();
      pezzi.forEach(p => { const d = ix.ditta(p.k); if (!d || (opt.ditta && d.id !== opt.ditta) || (opt.particella && p.k !== opt.particella)) return; const e = perDitta.get(d.id) || perDitta.set(d.id, { d, per: new Map() }).get(d.id); (e.per.get(p.k) || e.per.set(p.k, []).get(p.k)).push(p); });
      const posti = [], aree = pezzi.map(p => ({ p, b: G.bboxMP(p.mp) }));
      const sopraArea = (x, y) => aree.some(a => x >= a.b[0] && x <= a.b[2] && y >= a.b[1] && y <= a.b[3] && G.inMP(x, y, a.p.mp));
      perDitta.forEach(({ d, per }) => {
        // punto di richiamo di ogni particella: nell'area più grande della particella
        const punti = [...per.values()].map(L => { const gr = L.slice().sort((a, b) => b.a - a.a)[0]; const lp = G.puntoEtichettaMP(gr.mp); return lp ? f(lp[0], lp[1]) : null; }).filter(Boolean);
        if (!punti.length) return;
        const c = [punti.reduce((s, q) => s + q[0], 0) / punti.length, punti.reduce((s, q) => s + q[1], 0) / punti.length];
        const r = Math.max(2.6, String(d.n).length * 1.45) * g;
        let best = null;
        for (const dist of [3.2, 5, 8, 12]) for (let a = 0; a < 360; a += 30) {
          const x = c[0] + Math.cos(a * Math.PI / 180) * r * dist, y = c[1] + Math.sin(a * Math.PI / 180) * r * dist;
          // la posizione in mondo per sapere se cade sopra un'area
          const wx = cx + (x - box.x - box.w / 2) / k, wy = cy - (y - box.y - box.h / 2) / k;
          let sc = dist * 2;
          if (x - r < box.x + 1 || x + r > box.x + box.w - 1 || y - r < box.y + 1 || y + r > box.y + box.h - 1) sc += 1000;
          if (sopraArea(wx, wy)) sc += 60;
          posti.forEach(q => { const dd = Math.hypot(q[0] - x, q[1] - y); if (dd < (q[2] + r) * 1.3) sc += 200; });
          if (!best || sc < best.sc) best = { x, y, sc };
        }
        posti.push([best.x, best.y, r]);
        punti.forEach(q => {
          const L = Math.hypot(q[0] - best.x, q[1] - best.y); if (L < r) return;
          const ex = best.x + (q[0] - best.x) / L * r, ey = best.y + (q[1] - best.y) / L * r;
          o += `<line x1="${n2(ex)}" y1="${n2(ey)}" x2="${n2(q[0])}" y2="${n2(q[1])}" stroke="${ROSSO}" stroke-width="${n2(.22 * g)}"/><circle cx="${n2(q[0])}" cy="${n2(q[1])}" r="${n2(.45 * g)}" fill="${ROSSO}"/>`;
        });
        o += `<circle cx="${n2(best.x)}" cy="${n2(best.y)}" r="${n2(r)}" fill="#fff" stroke="${ROSSO}" stroke-width="${n2(.4 * g)}"/><text x="${n2(best.x)}" y="${n2(best.y)}" font-size="${n2(r * 1.05)}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="${ROSSO}" font-family="Arial" data-ditta="${d.id}">${U.esc(d.n)}</text>`;
      });
    }
    o += '</g>';
    return o;
  }

  function legenda(x, y, w, tipi) {
    const h = 8 + tipi.length * 6 + 6;
    let o = `<g font-family="Arial"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="#222" stroke-width=".25"/><text x="${x + 3}" y="${y + 5}" font-size="3" font-weight="700">LEGENDA</text>`;
    tipi.forEach((t, i) => { const st = T.STILI[t], yy = y + 8 + i * 6; o += `<rect x="${x + 3}" y="${yy}" width="9" height="4.2" fill="url(#${st.pat})" stroke="${st.col}" stroke-width=".3"/><text x="${x + 14}" y="${yy + 3.3}" font-size="2.6">${st.nome}</text>`; });
    const yy = y + 8 + tipi.length * 6;
    o += `<circle cx="${x + 7.5}" cy="${yy + 2.2}" r="2" fill="#fff" stroke="${ROSSO}" stroke-width=".35"/><text x="${x + 7.5}" y="${yy + 2.3}" font-size="2" font-weight="700" fill="${ROSSO}" text-anchor="middle" dominant-baseline="central">N</text><text x="${x + 14}" y="${yy + 3.2}" font-size="2.6">Numero di piano (ditta) e particelle</text></g>`;
    return { o, h };
  }
  function scalaGrafica(x, y, s, maxW = 60) {
    const passi = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000], m = passi.slice().reverse().find(p => p * 4000 / s <= maxW) || 1, mm = m * 1000 / s;
    let o = `<g font-family="Arial" font-size="2.2">`;
    for (let i = 0; i < 4; i++) o += `<rect x="${n2(x + i * mm)}" y="${y}" width="${n2(mm)}" height="1.6" fill="${i % 2 ? '#fff' : '#222'}" stroke="#222" stroke-width=".2"/><text x="${n2(x + i * mm)}" y="${y + 4.6}" text-anchor="middle">${i * m}</text>`;
    return o + `<text x="${n2(x + 4 * mm)}" y="${y + 4.6}" text-anchor="middle">${4 * m} m</text><text x="${x}" y="${y - 1.5}" font-weight="700">Scala 1:${s}</text></g>`;
  }
  const nord = (x, y, h = 12) => `<g><path d="M${x} ${y} L${x + h * .28} ${y + h} L${x} ${y + h * .78} L${x - h * .28} ${y + h} Z" fill="#222"/><text x="${x}" y="${y - 1.2}" font-size="3.4" font-weight="700" text-anchor="middle" font-family="Arial">N</text></g>`;

  function cartiglio(x, y, w, h, c) {
    const r = (yy, t, sz, b) => `<text x="${x + 3}" y="${yy}" font-size="${sz}" ${b ? 'font-weight="700"' : ''} font-family="Arial">${U.esc(String(t).slice(0, Math.floor(w / sz * 1.9)))}</text>`;
    let o = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="#222" stroke-width=".35"/>`;
    o += r(y + 5, c.ente || '', 3.2, true) + r(y + 10, c.opera || '', 2.6) + `<line x1="${x}" y1="${y + 13}" x2="${x + w}" y2="${y + 13}" stroke="#222" stroke-width=".25"/>`;
    o += r(y + 19, c.titolo || 'PIANO PARTICELLARE DI ESPROPRIO', 3.4, true) + r(y + 24, c.sotto || '', 2.6) + r(y + 29, c.catasto || '', 2.4);
    o += `<line x1="${x}" y1="${y + h - 8}" x2="${x + w}" y2="${y + h - 8}" stroke="#222" stroke-width=".25"/>` + r(y + h - 3, `Scala 1:${c.scala}   ·   Data ${c.data || U.dataIt(U.oggi())}   ·   ${c.tecnico || ''}`, 2.4);
    return o;
  }
  // Comuni e fogli interessati (per il cartiglio)
  const catasto = pr => {
    const per = {};
    (pr.geo.pezzi || []).forEach(z => { if (!z.k) return; const p = indice(pr).part(z.k); const com = (p && p.comune) || pr.geo.comune || ''; (per[com] = per[com] || new Set()).add(z.fg || (p && p.fg) || '?'); });
    return Object.keys(per).map(c => (c ? 'Comune di ' + c.replace(/^comune di /i, '') + ' – ' : '') + 'Fg. ' + [...per[c]].sort(U.cmp).join(', ')).join(' · ');
  };

  // Quadro d'unione: tutta l'opera in piccolo con il riquadro della vista
  function keymap(pr, box, vista) {
    const amb = T.ambito(pr.geo), m = Math.max(amb[2] - amb[0], amb[3] - amb[1]) * 0.08 + 5;
    const bb = [amb[0] - m, amb[1] - m, amb[2] + m, amb[3] + m];
    const s = Math.max((bb[2] - bb[0]) / box.w, (bb[3] - bb[1]) / box.h) * 1000;
    const { f } = trasf(bb, box, s);
    const id = 'k' + Math.random().toString(36).slice(2, 7);
    let o = `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="#fff" stroke="#222" stroke-width=".25"/><clipPath id="${id}"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"/></clipPath><g clip-path="url(#${id})">`;
    (pr.geo.part || []).forEach(p => { o += `<path d="${pathMP(p.mp, f)}" fill="none" stroke="#bbb" stroke-width=".08"/>`; });
    (pr.geo.pezzi || []).forEach(p => { o += `<path d="${pathMP(p.mp, f)}" fill="${T.STILI[p.tipo].col}" stroke="none"/>`; });
    const a = f(vista[0], vista[3]), b = f(vista[2], vista[1]);
    o += `<rect x="${n2(a[0])}" y="${n2(a[1])}" width="${n2(b[0] - a[0])}" height="${n2(b[1] - a[1])}" fill="none" stroke="${ROSSO}" stroke-width=".4"/></g><text x="${box.x + 2}" y="${box.y + 4}" font-size="2.6" font-weight="700" font-family="Arial">QUADRO D'UNIONE</text>`;
    return o;
  }

  // Elenco delle ditte della vista (numero di piano, intestatario, particelle)
  function elenco(pr, x, y, w, hMax, dittaId) {
    const ix = indice(pr), per = new Map();
    (pr.geo.pezzi || []).forEach(z => { const d = ix.ditta(z.k); if (!d || (dittaId && d.id !== dittaId)) return; (per.get(d.id) || per.set(d.id, { d, k: new Set() }).get(d.id)).k.add((z.fg ? z.fg + '/' : '') + z.map); });
    const L = [...per.values()].sort((a, b) => (+a.d.n || 0) - (+b.d.n || 0) || U.cmp(a.d.n, b.d.n));
    if (!L.length) return { o: '', h: 0 };
    const rh = 4.4, max = Math.max(1, Math.floor((hMax - 9) / rh));
    let o = `<g font-family="Arial"><text x="${x}" y="${y + 3}" font-size="3" font-weight="700">ELENCO DITTE</text>`;
    L.slice(0, max).forEach((e, i) => {
      const yy = y + 8 + i * rh, nome = (e.d.intest[0] || {}).nome || '', piu = e.d.intest.length > 1 ? ' e altri' : '';
      o += `<circle cx="${x + 2.2}" cy="${yy - .9}" r="1.9" fill="#fff" stroke="${ROSSO}" stroke-width=".3"/><text x="${x + 2.2}" y="${yy - .8}" font-size="1.9" font-weight="700" fill="${ROSSO}" text-anchor="middle" dominant-baseline="central">${U.esc(e.d.n)}</text>`;
      o += `<text x="${x + 5.5}" y="${yy}" font-size="2.3">${U.esc((nome + piu).slice(0, Math.floor((w - 6) / 1.25)))}</text><text x="${x + 5.5}" y="${yy + 2.1}" font-size="1.8" fill="#555">mapp. ${U.esc([...e.k].sort(U.cmp).join(', ').slice(0, Math.floor((w - 6) / 0.95)))}</text>`;
    });
    if (L.length > max) o += `<text x="${x}" y="${y + 8 + max * rh}" font-size="2.2" fill="#555">… altre ${L.length - max} ditte nel piano particellare</text>`;
    return { o: o + '</g>', h: 8 + Math.min(L.length, max + 1) * rh };
  }

  // Finestra da disegnare: le aree d'intervento (o quelle della ditta, o della particella), con margine
  T.finestra = (pr, dittaId, margine = 0.15, chiave) => {
    const geo = pr.geo; if (!geo) return null;
    let L = geo.pezzi || [];
    if (chiave) {
      const parts = (geo.part || []).filter(p => p.k === chiave);
      L = L.filter(p => p.k === chiave).concat(parts);
    } else if (dittaId) {
      const kd = new Set((pr.particelle || []).filter(p => p.ditta === dittaId).flatMap(p => [A().chiave(p.fg, p.map, p.sub), A().chiave(p.fg, p.map, '')]));
      L = L.filter(p => kd.has(p.k));
      if (!L.length) { const parts = (geo.part || []).filter(p => kd.has(p.k)); if (parts.length) L = parts; }
    }
    if (!L.length) { const amb = T.ambito(geo); if (!amb) return null; L = [{ mp: [[[[amb[0], amb[1]], [amb[2], amb[3]]]]] }]; }
    const bb = [Infinity, Infinity, -Infinity, -Infinity]; L.forEach(p => G.bboxMP(p.mp, bb));
    const dx = Math.max(5, (bb[2] - bb[0]) * margine), dy = Math.max(5, (bb[3] - bb[1]) * margine);
    return [bb[0] - dx, bb[1] - dy, bb[2] + dx, bb[3] + dy];
  };

  // Tavola completa su un foglio. opt: {formato:'A3', orient:'L'|'P', scala (0 = adatta), ditta, titolo, sotto,
  // quote, aree, elenco}. La scala è quella vera della stampa al 100%.
  T.foglio = (pr, calc, opt = {}) => {
    const [a, b] = T.FORMATI[opt.formato || 'A3'] || T.FORMATI.A3;
    const L = (opt.orient || 'L') === 'L', W = L ? b : a, H = L ? a : b, m = 10;
    const latoW = Math.min(85, W * 0.3);
    const box = { x: m, y: m, w: W - 2 * m - latoW - 4, h: H - 2 * m };
    const fin = T.finestra(pr, opt.ditta);
    if (!fin) return '';
    const s = opt.scala || T.scalaAdatta(fin, box);
    const cx = (fin[0] + fin[2]) / 2, cy = (fin[1] + fin[3]) / 2, hw = box.w / 2 * s / 1000, hh = box.h / 2 * s / 1000;
    const tipi = A().TIPI.filter(t => (pr.geo.pezzi || []).some(p => p.tipo === t));
    const xl = W - m - latoW;
    let o = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="Arial">${defs()}<rect width="${W}" height="${H}" fill="#fff"/>`;
    o += mappa(pr, calc, box, fin, s, { ditta: opt.ditta, quote: opt.quote, aree: opt.aree }) + `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="none" stroke="#222" stroke-width=".5"/>`;
    o += nord(box.x + box.w - 10, box.y + 6);
    const kmH = Math.min(62, H * 0.24);
    o += keymap(pr, { x: xl, y: m, w: latoW, h: kmH }, [cx - hw, cy - hh, cx + hw, cy + hh]);
    let y = m + kmH + 4;
    const lg = legenda(xl, y, latoW, tipi); o += lg.o; y += lg.h + 12;
    o += scalaGrafica(xl + 4, y, s, latoW - 16); y += 10;
    const ch = 48;
    if (opt.elenco !== false) { const el = elenco(pr, xl, y, latoW, H - m - ch - 4 - y, opt.ditta); o += el.o; }
    o += cartiglio(xl, H - m - ch, latoW, ch, { ente: pr.ente && pr.ente.nome, opera: pr.nome, titolo: opt.titolo, sotto: opt.sotto, catasto: catasto(pr), scala: s, tecnico: pr.ente && pr.ente.tecnico });
    return o + '</svg>';
  };

  // Estratto di mappa per una ditta (allegato alle lettere e allo stato di consistenza)
  T.estratto = (pr, calc, dittaId, scala = 1000, mm = [170, 200], opt = {}) => {
    const fin = T.finestra(pr, dittaId, 0.25); if (!fin) return '';
    const box = { x: 0, y: 0, w: mm[0], h: mm[1] - 30 };
    let s = scala; const need = T.scalaAdatta(fin, box, 1); if (need > s) s = need;
    const tipi = A().TIPI.filter(t => (pr.geo.pezzi || []).some(p => p.tipo === t));
    let o = `<svg xmlns="http://www.w3.org/2000/svg" width="${mm[0]}mm" height="${mm[1]}mm" viewBox="0 0 ${mm[0]} ${mm[1]}" font-family="Arial">${defs()}<rect width="${mm[0]}" height="${mm[1]}" fill="#fff"/>`;
    o += mappa(pr, calc, box, fin, s, { ditta: dittaId, aree: opt.aree, quote: opt.quote }) + `<rect x="0.3" y="0.3" width="${box.w - .6}" height="${box.h - .6}" fill="none" stroke="#222" stroke-width=".4"/>`;
    o += nord(box.w - 8, 5, 10) + `<text x="3" y="5" font-size="3.2" font-weight="700">Estratto mappa catastale – scala 1:${s}</text>`;
    tipi.forEach((t, i) => { const st = T.STILI[t], x = 3, y = box.h + 3 + i * 6.5; o += `<rect x="${x}" y="${y}" width="9" height="4.2" fill="url(#${st.pat})" stroke="${st.col}" stroke-width=".3"/><text x="${x + 11}" y="${y + 3.3}" font-size="2.8">${st.nome}</text>`; });
    o += scalaGrafica(box.w - 64, box.h + 10, s);
    return o + '</svg>';
  };

  // Taglio di una particella (mappale per mappale): la particella al centro con le sue aree, quote dei lati e superfici
  T.taglio = (pr, calc, chiave, mm = [170, 125]) => {
    const geo = pr.geo; if (!geo) return '';
    const fin = T.finestra(pr, null, 0.18, chiave); if (!fin) return '';
    const box = { x: 0, y: 9, w: mm[0], h: mm[1] - 9 - 16 };
    const s = T.scalaAdatta(fin, box, 100);
    const ix = indice(pr), part = ix.part(chiave), d = ix.ditta(chiave);
    const [fg, map, sub] = chiave.split('|');
    const pz = (geo.pezzi || []).filter(p => p.k === chiave);
    let o = `<svg xmlns="http://www.w3.org/2000/svg" width="${mm[0]}mm" height="${mm[1]}mm" viewBox="0 0 ${mm[0]} ${mm[1]}" font-family="Arial">${defs()}<rect width="${mm[0]}" height="${mm[1]}" fill="#fff"/>`;
    o += `<text x="2" y="5.5" font-size="3.4" font-weight="700">${U.esc((part && part.comune ? part.comune + ' – ' : '') + 'Foglio ' + fg + ' – Mappale ' + map + (sub ? ' sub ' + sub : ''))}${d ? ' – Ditta n. ' + U.esc(d.n) : ''}</text><text x="${mm[0] - 2}" y="5.5" font-size="2.6" text-anchor="end">scala 1:${s}</text>`;
    o += mappa(pr, calc, box, fin, s, { particella: chiave, quote: true, aree: true, cerchi: false }) + `<rect x="${box.x + .2}" y="${box.y}" width="${box.w - .4}" height="${box.h}" fill="none" stroke="#222" stroke-width=".35"/>`;
    o += nord(box.w - 6, box.y + 4, 8);
    // superfici per tipo della particella
    const yy = box.y + box.h + 5; let x = 2;
    const tot = {}; pz.forEach(p => { tot[p.tipo] = (tot[p.tipo] || 0) + p.a; });
    A().TIPI.filter(t => tot[t]).forEach(t => { const st = T.STILI[t]; o += `<rect x="${x}" y="${yy - 3}" width="7" height="3.6" fill="url(#${st.pat})" stroke="${st.col}" stroke-width=".3"/><text x="${x + 8.5}" y="${yy}" font-size="2.6">${st.nome}: <tspan font-weight="700">${U.fmt(tot[t], 0)} mq</tspan></text>`; x += 8.5 + (st.nome.length + 12) * 1.32; });
    const grafica = (geo.part || []).filter(p => p.k === chiave).reduce((s2, p) => s2 + p.a, 0);
    o += `<text x="2" y="${yy + 6}" font-size="2.3" fill="#555">Superfici grafiche dal disegno${part && part.sup ? ' · superficie catastale ' + U.fmt(part.sup, 0) + ' mq' : ''}${grafica ? ' · superficie grafica della particella ' + U.fmt(grafica, 0) + ' mq' : ''} · quote in metri</text>`;
    return o + '</svg>';
  };
  // Particelle interessate di una ditta (chiavi), nell'ordine del piano
  T.particelleDitta = (pr, dittaId) => {
    const ks = new Set((pr.geo && pr.geo.pezzi || []).map(z => z.k).filter(Boolean));
    return (pr.particelle || []).filter(p => p.ditta === dittaId).map(p => { const k = A().chiave(p.fg, p.map, p.sub); return ks.has(k) ? k : ks.has(A().chiave(p.fg, p.map, '')) ? A().chiave(p.fg, p.map, '') : null; }).filter((k, i, L) => k && L.indexOf(k) === i);
  };

  // Vista a schermo: la zona dell'intervento con intorno (per pan e zoom nel programma); vb0 = inquadratura iniziale
  T.schermo = (pr, calc, opt = {}) => {
    const geo = pr.geo; if (!geo) return '';
    const amb = T.finestra(pr, opt.ditta || null, 0.12) || geo.bbox;
    const w0 = Math.max(amb[2] - amb[0], 1), h0 = Math.max(amb[3] - amb[1], 1);
    // contesto: una volta l'ingombro per lato, senza uscire dal disegno
    const gb = geo.bbox, ctx = [Math.max(gb[0], amb[0] - w0), Math.max(gb[1], amb[1] - h0), Math.min(gb[2], amb[2] + w0), Math.min(gb[3], amb[3] + h0)];
    const bb = [Math.min(ctx[0], amb[0]), Math.min(ctx[1], amb[1]), Math.max(ctx[2], amb[2]), Math.max(ctx[3], amb[3])];
    const W = 1000, H = Math.max(200, W * (bb[3] - bb[1]) / Math.max(1, bb[2] - bb[0]));
    const s = Math.max(bb[2] - bb[0], 1) * 1000 / W; // 1 unità = 1 mm a scala s
    const box = { x: 0, y: 0, w: W, h: H }, k = W / (bb[2] - bb[0]);
    const vb0 = { x: (amb[0] - bb[0]) * k, y: (bb[3] - amb[3]) * k, w: w0 * k, h: h0 * k };
    const g = Math.max(0.6, Math.max(vb0.w, vb0.h) / 300);
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${n2(H)}" font-family="Arial">${defs()}${mappa(pr, calc, box, bb, s, { ditta: opt.ditta, seg: g, quote: opt.quote, aree: opt.aree })}</svg>`, W, H, s, vb0 };
  };
})(ES);
