// Lettura «intuitiva» delle tavole in PDF vettoriale (esportate da AutoCAD, BricsCAD, ecc.).
// Il PDF diventa la stessa struttura del DXF ({layers, poli, testi}) così passa per la stessa analisi:
// un «layer» per ogni layer CAD (livelli OCG del PDF) + tipo (area riempita / linee) + colore.
// Coordinate convertite in metri con la scala del disegno (trovata nel testo «1:200» o indicata dall'utente).
// I risultati sono una proposta: le superfici vanno verificate e si correggono nel piano particellare.
(function (ES) {
  'use strict';
  const P = ES.pdfv = {};
  const PT_MM = 25.4 / 72;

  const hex = a => {
    if (a == null) return '#000000';
    if (typeof a === 'string') return a.length === 7 ? a.toLowerCase() : a;
    const v = [a[0], a[1], a[2]].map(x => Math.max(0, Math.min(255, Math.round(+x || 0))));
    return '#' + v.map(x => x.toString(16).padStart(2, '0')).join('');
  };
  const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  const ap = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

  // Curva di Bézier cubica approssimata con 4 tratti (archi, cerchi dei richiami, confini curvi)
  const bez = (cur, c1, c2, e) => {
    const p0 = cur.pts[cur.pts.length - 1];
    for (const t of [0.25, 0.5, 0.75]) { const u = 1 - t; cur.pts.push([u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * e[0], u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * e[1]]); }
    cur.pts.push(e);
  };

  // Nome di colore leggibile per i layer proposti
  P.nomeColore = c => {
    const n = parseInt(String(c).slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn < 25) return mx > 200 ? 'bianco/grigio chiaro' : mx > 90 ? 'grigio' : 'nero';
    const h = (() => { const d = mx - mn; let x = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; x *= 60; return x < 0 ? x + 360 : x; })();
    return h < 15 || h >= 340 ? 'rosso' : h < 45 ? 'arancio' : h < 70 ? 'giallo' : h < 160 ? 'verde' : h < 200 ? 'azzurro' : h < 255 ? 'blu' : h < 290 ? 'viola' : 'magenta';
  };

  // Scala del disegno dai testi («SCALA 1:200», «1:1000»): la più frequente
  P.scalaDaTesti = testi => {
    const c = {};
    testi.forEach(t => { const m = /\b1\s*:\s*(\d{2,6})\b/.exec(t.t); if (m) c[m[1]] = (c[m[1]] || 0) + 1; });
    const k = Object.keys(c).sort((a, b) => c[b] - c[a])[0];
    return k ? +k : 0;
  };

  // pdfjs: libreria pdf.js; dati: Uint8Array. Restituisce {pagine:[{n, w, h, poli, testi, layers}], scala}
  P.leggi = async (pdfjs, dati, opt = {}) => {
    const doc = await pdfjs.getDocument({ data: dati, disableFontFace: true, isEvalSupported: false }).promise;
    const nomiOC = {};
    try { const oc = await doc.getOptionalContentConfig(); const G = (oc && oc.getGroups && oc.getGroups()) || {}; Object.keys(G).forEach(id => { nomiOC[id] = G[id].name; }); } catch (e) { /* senza livelli */ }
    const O = pdfjs.OPS, pagine = [];
    const FILL = new Set([O.fill, O.eoFill, O.fillStroke, O.eoFillStroke, O.closeFillStroke, O.closeEOFillStroke]);
    const STROKE = new Set([O.stroke, O.closeStroke]);
    for (let n = 1; n <= Math.min(doc.numPages, opt.maxPagine || 20); n++) {
      const pg = await doc.getPage(n), ops = await pg.getOperatorList();
      // Coordinate «come si vede la pagina»: si applica la rotazione della pagina (/Rotate) e si tiene l'asse y verso l'alto
      const vp = pg.getViewport({ scale: 1 }), M0 = mul([1, 0, 0, -1, 0, vp.height], vp.transform);
      let ctm = M0, fill = '#000000', strk = '#000000', alfaF = 1;
      const stack = [], oc = [], poli = [], clip = [], immagini = [];
      let corrente = []; // sottopercorsi del percorso in costruzione: [{pts, chiusa}]
      const layer = () => oc.length ? oc[oc.length - 1] : '0';
      for (let i = 0; i < ops.fnArray.length; i++) {
        const f = ops.fnArray[i], a = ops.argsArray[i];
        if (f === O.save) stack.push([ctm, fill, strk, alfaF]);
        else if (f === O.restore) { const s = stack.pop(); if (s) [ctm, fill, strk, alfaF] = s; }
        else if (f === O.transform) ctm = mul(ctm, a);
        else if (f === O.setFillRGBColor) fill = hex(a.length === 1 ? a[0] : a);
        else if (f === O.setStrokeRGBColor) strk = hex(a.length === 1 ? a[0] : a);
        else if (f === O.setFillGray) fill = hex([a[0] * 255, a[0] * 255, a[0] * 255]);
        else if (f === O.setStrokeGray) strk = hex([a[0] * 255, a[0] * 255, a[0] * 255]);
        else if (f === O.setGState) { (a[0] || []).forEach(([k, v]) => { if (k === 'ca') alfaF = +v; }); }
        else if (f === O.beginMarkedContentProps) oc.push(a[1] && a[1].id && nomiOC[a[1].id] ? nomiOC[a[1].id] : (a[1] && a[1].name) || (a[0] === 'OC' ? 'livello' : layer()));
        else if (f === O.beginMarkedContent) oc.push(layer());
        else if (f === O.endMarkedContent) oc.pop();
        else if (f === O.constructPath) {
          const [cmd, c] = a; let k = 0, cur = null;
          for (const op of cmd) {
            if (op === O.moveTo) { cur = { pts: [ap(ctm, c[k], c[k + 1])], chiusa: false }; corrente.push(cur); k += 2; }
            else if (op === O.lineTo) { if (cur) cur.pts.push(ap(ctm, c[k], c[k + 1])); k += 2; }
            else if (op === O.curveTo) { if (cur) bez(cur, ap(ctm, c[k], c[k + 1]), ap(ctm, c[k + 2], c[k + 3]), ap(ctm, c[k + 4], c[k + 5])); k += 6; }
            else if (op === O.curveTo2) { if (cur) bez(cur, cur.pts[cur.pts.length - 1], ap(ctm, c[k], c[k + 1]), ap(ctm, c[k + 2], c[k + 3])); k += 4; }
            else if (op === O.curveTo3) { if (cur) { const e = ap(ctm, c[k + 2], c[k + 3]); bez(cur, ap(ctm, c[k], c[k + 1]), e, e); } k += 4; }
            else if (op === O.closePath) { if (cur) cur.chiusa = true; }
            else if (op === O.rectangle) {
              const [x, y, w, h] = [c[k], c[k + 1], c[k + 2], c[k + 3]]; k += 4;
              corrente.push(cur = { pts: [ap(ctm, x, y), ap(ctm, x + w, y), ap(ctm, x + w, y + h), ap(ctm, x, y + h)], chiusa: true });
            }
          }
        } else if (FILL.has(f) || STROKE.has(f)) {
          const area = FILL.has(f), chiudi = area || f === O.closeStroke;
          const lay = layer() + (area ? ' · area ' : ' · linee ') + (area ? fill : strk);
          corrente.forEach(sp => { if (sp.pts.length >= 2) poli.push({ layer: lay, pts: sp.pts, chiusa: chiudi || sp.chiusa, colore: area ? fill : strk, area, alfa: area ? alfaF : 1, oc: layer() }); });
          corrente = [];
        } else if (f === O.clip || f === O.eoClip) {
          // Finestra di ritaglio (la vista del disegno): serve a chiudere le particelle tagliate dal bordo
          corrente.forEach(sp => { if (sp.pts.length >= 3) clip.push({ pts: sp.pts, oc: layer() }); });
        } else if (f === O.endPath) corrente = [];
        else if (f === O.paintImageXObject || f === O.paintInlineImageXObject || f === O.paintImageMaskXObject) {
          // Immagini (mappa catastale raster sotto il disegno, loghi): ne serve solo l'ingombro
          const q = [ap(ctm, 0, 0), ap(ctm, 1, 0), ap(ctm, 1, 1), ap(ctm, 0, 1)];
          immagini.push({ b: [Math.min(...q.map(v => v[0])), Math.min(...q.map(v => v[1])), Math.max(...q.map(v => v[0])), Math.max(...q.map(v => v[1]))] });
        }
      }
      const tc = await pg.getTextContent();
      const testi = [];
      tc.items.forEach(t => {
        const s = String(t.str || '').trim(); if (!s) return;
        const m = mul(M0, t.transform), nx = Math.hypot(m[0], m[1]) || 1, ny = Math.hypot(m[2], m[3]) || 1;
        const w = t.width || 0, h = t.height || ny;
        // centro del testo: inizio della riga + metà larghezza lungo la direzione + un terzo dell'altezza verso l'alto
        const x = m[4] + m[0] / nx * w / 2 + m[2] / ny * h * 0.35, y = m[5] + m[1] / nx * w / 2 + m[3] / ny * h * 0.35;
        testi.push({ layer: 'testi', x, y, t: s, h, w, rot: Math.atan2(m[1], m[0]) * 180 / Math.PI });
      });
      pagine.push({ n, w: vp.width, h: vp.height, poli, testi, clip, immagini });
    }
    const tutti = pagine.flatMap(p => p.testi);
    return { pagine, scala: P.scalaDaTesti(tutti), livelli: Object.values(nomiOC) };
  };

  // Pagina del PDF → struttura del DXF in metri alla scala indicata
  P.comeDxf = (pagina, scala) => {
    const k = PT_MM * (scala || 1000) / 1000; // metri per punto PDF
    const out = { layers: {}, poli: [], testi: [], unita: 6, colori: {} };
    pagina.poli.forEach(p => {
      out.poli.push({ layer: p.layer, pts: p.pts.map(q => [q[0] * k, q[1] * k]), chiusa: p.chiusa });
      out.colori[p.layer] = p.colore;
    });
    pagina.testi.forEach(t => out.testi.push({ ...t, x: t.x * k, y: t.y * k, h: t.h * k }));
    // Senza confini di particella, un'etichetta messa a cavallo del bordo di un'area (riquadro sul margine) vale per l'area più vicina
    if (raster) {
      const aree = out.poli.filter(p => p.chiusa && /^Legenda /.test(p.layer));
      const dSeg = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2)) : 0; return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); };
      out.testi.forEach(t => {
        if (!ES.analisi.etichetta(t.t) || aree.some(p => G.inAnello(t.x, t.y, p.pts))) return;
        let best = null;
        aree.forEach(p => { let d = Infinity; for (let i = 0; i < p.pts.length; i++) d = Math.min(d, dSeg(t.x, t.y, p.pts[i], p.pts[(i + 1) % p.pts.length])); if (!best || d < best.d) best = { d, p }; });
        if (best && best.d <= Math.max(t.h, (t.w || 0) / 2)) { const q = G.puntoEtichetta([best.p.pts]); if (q) { t.x = q[0]; t.y = q[1]; t.spostato = true; } }
      });
    }
    out.poli.forEach(p => { (out.layers[p.layer] = out.layers[p.layer] || { poli: 0, chiuse: 0, testi: 0 }).poli++; if (p.chiusa) out.layers[p.layer].chiuse++; });
    out.testi.forEach(t => { (out.layers[t.layer] = out.layers[t.layer] || { poli: 0, chiuse: 0, testi: 0 }).testi++; });
    return out;
  };

  // ---- Lettura «da persona»: legenda → simboli → aree del disegno con lo stesso aspetto ----
  const bbox = pts => { const b = [Infinity, Infinity, -Infinity, -Infinity]; pts.forEach(q => { if (q[0] < b[0]) b[0] = q[0]; if (q[1] < b[1]) b[1] = q[1]; if (q[0] > b[2]) b[2] = q[0]; if (q[1] > b[3]) b[3] = q[1]; }); return b; };
  const dentro = (b, z) => b[0] >= z[0] && b[2] <= z[2] && b[1] >= z[1] && b[3] <= z[3];
  // Tipo d'area dalla descrizione della voce di legenda («… variata in esproprio» vale per quello che è diventata;
  // le voci «non più interessate» e gli elementi esistenti non sono aree d'intervento)
  P.ruoloTesto = s => {
    let n = ES.U.norm(s);
    if (/non piu interessat|fascia di rispetto strad|corsi d acqua|strade pubbl|^ferrovi/.test(n)) return null;
    const v = /variat[ao] in (.*)$/.exec(n);
    if (v) { const r = P.ruoloTesto(v[1]); if (r) return r; n = n.slice(0, v.index); }
    if (/esprop|acquisiz|reliquat|occupazione permanente|sede strad|mitigazion/.test(n)) return 'espr';
    if (/tubaz|condott|ingombro opere|ingombro manufatt|manufatt|sedime|pozzett|cabin|sostegn|tralicc|plinti|basament/.test(n)) return 'servop';
    if (/asserv|servit|fascia di rispetto della condotta|convenzion|tirant/.test(n)) return 'serv';
    if (/occupaz|temporane|cantier|pista/.test(n)) return 'occ';
    return null;
  };

  // Tratteggi: tra i segmenti di due punti, quelli che fanno parte di una serie di linee parallele a passo regolare.
  // segm: [[x1,y1],[x2,y2]]; restituisce un Set con gli indici dei segmenti di tratteggio.
  // colori: colore di ciascun segmento (un tratteggio è di un colore solo: un confine nero non fa parte di un tratteggio arancio)
  P.tratteggi = (segm, passoMax = 14, colori) => {
    const gruppi = {}, out = new Set();
    segm.forEach((s, i) => { const dx = s[1][0] - s[0][0], dy = s[1][1] - s[0][1]; if (Math.hypot(dx, dy) < 1e-6) return; let a = Math.round(Math.atan2(dy, dx) * 180 / Math.PI); a = ((a % 180) + 180) % 180; const c = colori ? colori[i] : ''; (gruppi[c] = gruppi[c] || {}); (gruppi[c][a] = gruppi[c][a] || []).push(i); });
    Object.keys(gruppi).forEach(col => Object.keys(gruppi[col]).forEach(a0 => {
      const a = +a0, L = [].concat(...[a - 1, a, a + 1].map(x => gruppi[col][((x % 180) + 180) % 180] || []));
      if (L.length < 3) return;
      const th = a * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th);
      const R = L.map(i => { const s = segm[i], u = q => [q[0] * c + q[1] * sn, -q[0] * sn + q[1] * c], p = u(s[0]), q = u(s[1]); return { i, y: (p[1] + q[1]) / 2, x1: Math.min(p[0], q[0]), x2: Math.max(p[0], q[0]) }; }).sort((p, q) => p.y - q.y);
      // per ogni linea la più vicina «sopra» che le si sovrappone
      const su = R.map((r, j) => { for (let m = j + 1; m < R.length && R[m].y - r.y <= passoMax; m++) { const o = R[m]; if (o.y - r.y > 1e-6 && o.x1 < r.x2 && r.x1 < o.x2) return { m, d: o.y - r.y }; } return null; });
      R.forEach((r, j) => { const s1 = su[j]; if (!s1) return; const s2 = su[s1.m]; if (s2 && Math.abs(s2.d - s1.d) <= Math.max(0.2 * s1.d, 0.05)) { out.add(r.i); out.add(R[s1.m].i); out.add(R[s2.m].i); } });
    }));
    return out;
  };
  const scuro = c => /nero|grigio/.test(P.nomeColore(c));

  // Voci di legenda: righe di testo con subito a sinistra un piccolo simbolo, letto come un riempimento di un colore,
  // un tratteggio di linee parallele, o entrambi (riempimento con tratteggio sopra). Le descrizioni su due righe
  // accanto allo stesso simbolo si uniscono in una voce sola.
  P.legenda = pagina => {
    const T = pagina.testi, poli = pagina.poli.map(p => ({ p, b: bbox(p.pts) }));
    const ancora = T.find(t => /^\s*legend[ae]?\s*:?\s*$/i.test(t.t));
    const vicino = t => !ancora || (t.y <= ancora.y + ancora.h * 2 && ancora.y - t.y < pagina.h * 0.75 && Math.abs(t.x - ancora.x) < pagina.w * 0.25);
    let cand = T.filter(t => t.t.length >= 3 && /[a-z]{3}/i.test(t.t) && vicino(t));
    if (!ancora) {
      // senza la scritta LEGENDA: le righe con una parola chiave e quelle allineate subito sopra o sotto
      const chiave = cand.filter(t => P.ruoloTesto(t.t));
      cand = cand.filter(t => chiave.some(c => c === t || (Math.abs(c.y - t.y) < c.h * 2.5 && Math.abs((c.x - (c.w || 0) / 2) - (t.x - (t.w || 0) / 2)) < c.h * 2)));
    }
    const grezze = [];
    cand.forEach(t => {
      const h = Math.max(t.h, 2), larg = t.w || t.t.length * h * 0.55, xTesto = t.x - larg / 2;
      const zona = [xTesto - h * 14, t.y - h * 1.9, xTesto + h * 0.3, t.y + h * 1.9];
      const vic = poli.filter(o => dentro(o.b, zona) && (o.b[2] - o.b[0]) < h * 14);
      if (!vic.length) return;
      // riempimento: il colore con più superficie (esclusi nero e bianco, che sono testo e sfondo)
      const sup = {};
      vic.forEach(o => { if (o.p.area && !/^#(0{6}|f{6}|fafafa)$/.test(o.p.colore)) sup[o.p.colore] = (sup[o.p.colore] || 0) + (o.b[2] - o.b[0]) * (o.b[3] - o.b[1]); });
      const fill = Object.keys(sup).sort((x, y) => sup[y] - sup[x])[0] || null;
      const fb = fill ? vic.filter(o => o.p.area && o.p.colore === fill).reduce((z, o) => [Math.min(z[0], o.b[0]), Math.min(z[1], o.b[1]), Math.max(z[2], o.b[2]), Math.max(z[3], o.b[3])], [Infinity, Infinity, -Infinity, -Infinity]) : null;
      // tratteggio: linee di due punti parallele a passo regolare (dentro il riempimento, se c'è)
      const s2 = vic.filter(o => !o.p.area && o.p.pts.length === 2 && (!fb || dentro(o.b, [fb[0] - 1, fb[1] - 1, fb[2] + 1, fb[3] + 1])));
      const tr = P.tratteggi(s2.map(o => o.p.pts), h * 1.5, s2.map(o => o.p.colore)), sT = s2.filter((o, i) => tr.has(i));
      const piu = L => { const c = {}; L.forEach(o => { c[o.p.colore] = (c[o.p.colore] || 0) + 1; }); return Object.keys(c).sort((x, y) => c[y] - c[x])[0]; };
      const tratt = sT.length >= 3 ? piu(sT) : null;
      if (!fill && !tratt) return;
      const oc = (fill ? vic.find(o => o.p.area && o.p.colore === fill) : sT.find(o => o.p.colore === tratt)).p.oc;
      const simbolo = fill ? { tipo: 'area', colore: fill, tratt, oc } : { tipo: 'tratteggio', colore: tratt, tratt: null, oc };
      const sb = fb || sT.reduce((z, o) => [Math.min(z[0], o.b[0]), Math.min(z[1], o.b[1]), Math.max(z[2], o.b[2]), Math.max(z[3], o.b[3])], [Infinity, Infinity, -Infinity, -Infinity]);
      grezze.push({ t, simbolo, sb, zona: [sb[0], Math.min(sb[1], t.y - h / 2), Math.max(sb[2], t.x + larg / 2), Math.max(sb[3], t.y + h / 2)] });
    });
    // stesso simbolo (stesso riquadro) → stessa voce, testi dall'alto in basso
    const voci = [];
    grezze.sort((a, b) => b.t.y - a.t.y).forEach(g => {
      const v = voci.find(x => x.simbolo.colore === g.simbolo.colore && x.simbolo.tratt === g.simbolo.tratt && Math.abs(x.sb[0] - g.sb[0]) < 1 && Math.abs(x.sb[1] - g.sb[1]) < 1 && Math.abs(x.sb[3] - g.sb[3]) < 1);
      if (v) { v.righe.push(g.t.t); v.zona = [Math.min(v.zona[0], g.zona[0]), Math.min(v.zona[1], g.zona[1]), Math.max(v.zona[2], g.zona[2]), Math.max(v.zona[3], g.zona[3])]; }
      else voci.push({ righe: [g.t.t], simbolo: g.simbolo, sb: g.sb, zona: g.zona, y: g.t.y });
    });
    voci.forEach(v => { v.testo = v.righe.join(' ').replace(/\s+/g, ' ').trim(); v.ruolo = P.ruoloTesto(v.testo); delete v.righe; });
    // I simboli di una legenda stanno in colonna: si scartano le «voci» lontane dalla colonna (scritte del disegno sopra un'area colorata)
    const xs = voci.filter(v => v.ruolo).map(v => v.sb[0]).sort((a, b) => a - b);
    if (xs.length >= 2) { const xm = xs[Math.floor(xs.length / 2)], hm = Math.max(...voci.map(v => v.sb[3] - v.sb[1])); for (let i = voci.length - 1; i >= 0; i--) if (Math.abs(voci[i].sb[0] - xm) > Math.max(hm, 4)) voci.splice(i, 1); }
    // Zona occupata dalla legenda (da escludere quando si cercano le aree nel disegno)
    const zl = voci.length ? voci.reduce((z, v) => [Math.min(z[0], v.zona[0]), Math.min(z[1], v.zona[1]), Math.max(z[2], v.zona[2]), Math.max(z[3], v.zona[3])], [Infinity, Infinity, -Infinity, -Infinity]) : null;
    return { voci, zona: zl, ancora: !!ancora };
  };

  // Superficie di un tratteggio ricostruita dalle sue linee: ogni linea diventa una striscia larga quanto il passo
  // del tratteggio; le strisce si uniscono in aree. segm: [[x1,y1],[x2,y2]]
  P.areeTratteggio = segm => {
    const G = ES.geo, gruppi = {};
    segm.forEach(s => { const dx = s[1][0] - s[0][0], dy = s[1][1] - s[0][1], L = Math.hypot(dx, dy); if (L < 1e-9) return; let a = Math.round(Math.atan2(dy, dx) * 180 / Math.PI); a = ((a % 180) + 180) % 180; (gruppi[a] = gruppi[a] || []).push(s); });
    // angoli vicini (±2°) nello stesso gruppo
    const ang = Object.keys(gruppi).map(Number).sort((x, y) => gruppi[y].length - gruppi[x].length), usati = new Set(), out = [];
    ang.forEach(a0 => {
      if (usati.has(a0)) return;
      const L = []; ang.forEach(a => { const d = Math.min(Math.abs(a - a0), 180 - Math.abs(a - a0)); if (d <= 2 && !usati.has(a)) { usati.add(a); L.push(...gruppi[a]); } });
      if (L.length < 4) return;
      const th = a0 * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th);
      const R = L.map(s => { const u = q => [q[0] * c + q[1] * sn, -q[0] * sn + q[1] * c]; const p = u(s[0]), q = u(s[1]); return { y: (p[1] + q[1]) / 2, x1: Math.min(p[0], q[0]), x2: Math.max(p[0], q[0]) }; }).sort((p, q) => p.y - q.y);
      // passo del tratteggio: mediana delle distanze tra linee consecutive che si sovrappongono
      const d = []; for (let i = 1; i < R.length; i++) { const dy = R[i].y - R[i - 1].y; if (dy > 1e-6 && R[i].x1 < R[i - 1].x2 && R[i - 1].x1 < R[i].x2) d.push(dy); }
      if (!d.length) return;
      d.sort((p, q) => p - q); const passo = d[Math.floor(d.length / 2)];
      const ruota = (x, y) => [x * c - y * sn, x * sn + y * c];
      // ogni linea vale una striscia larga un passo: nei tratteggi CAD la prima e l'ultima linea cadono in media
      // a mezzo passo dal contorno, quindi le strisce ricompongono la figura senza errore sistematico
      const strisce = R.map(r => [[ruota(r.x1, r.y - passo / 2), ruota(r.x2, r.y - passo / 2), ruota(r.x2, r.y + passo / 2), ruota(r.x1, r.y + passo / 2)]]);
      // unione a blocchi per non appesantire la libreria
      let acc = [];
      for (let i = 0; i < strisce.length; i += 150) acc = G.unione([acc, ...strisce.slice(i, i + 150).map(p => [p])].filter(x => x.length));
      acc.forEach(P2 => out.push({ poly: P2, passo }));
    });
    return out;
  };

  // Poligono con buchi → pezzi senza buchi (il formato «DXF» interno ha solo anelli): si taglia in verticale sui buchi
  const senzaBuchi = (Pol, prof = 0) => {
    if (Pol.length <= 1 || prof > 12) return [Pol[0]];
    const G = ES.geo, h = Pol[1], hb = bbox(h), xc = (hb[0] + hb[2]) / 2, b = bbox(Pol[0]);
    const sx = [[[b[0] - 1, b[1] - 1], [xc, b[1] - 1], [xc, b[3] + 1], [b[0] - 1, b[3] + 1]]], dx = [[[xc, b[1] - 1], [b[2] + 1, b[1] - 1], [b[2] + 1, b[3] + 1], [xc, b[3] + 1]]];
    return [sx, dx].flatMap(r => G.intersezione([Pol], [r]).flatMap(q => senzaBuchi(q, prof + 1)));
  };
  // (se la libreria non regge — geometrie degeneri — si tengono i pezzi come sono: le sovrapposizioni le toglie poi l'analisi)
  const unisci = polys => {
    const G = ES.geo; let acc = [];
    const r3 = v => Math.round(v * 100) / 100;
    const pulite = polys.map(p => p.map(q => [r3(q[0]), r3(q[1])])).filter(p => Math.abs(G.areaAnello(p)) > 0.01);
    try {
      for (let i = 0; i < pulite.length; i += 200) acc = G.unione([acc, ...pulite.slice(i, i + 200).map(p => [[p]])].filter(x => x.length));
      // fessure tra i triangoli di un riempimento: buchi minuscoli che si tolgono
      return acc.map(P2 => [P2[0], ...P2.slice(1).filter(h => Math.abs(G.areaAnello(h)) > 2)]).filter(P2 => Math.abs(G.areaAnello(P2[0])) > 0.5);
    }
    catch (e) { return polys.map(p => [p]); }
  };

  // Vista del disegno (la cornice della mappa, senza cartiglio e tabelle): tra le finestre di ritaglio e i rettangoli
  // disegnati abbastanza grandi, il più piccolo che contiene quasi tutte le linee che contiene il più grande.
  P.vista = pagina => {
    const A = pagina.w * pagina.h, area = b => (b[2] - b[0]) * (b[3] - b[1]);
    const rett = pagina.poli.filter(p => !p.area && p.pts.length >= 4 && p.pts.length <= 5).map(p => ({ c: p, b: bbox(p.pts) }))
      .filter(o => { const a = Math.abs(ES.geo.areaAnello(o.c.pts)); return area(o.b) > 0 && a / area(o.b) > 0.98; });
    const cand = (pagina.clip || []).map(c => ({ c, b: bbox(c.pts) })).concat(rett)
      .filter(o => area(o.b) > A * 0.12 && ((o.b[2] - o.b[0]) < pagina.w * 0.995 || (o.b[3] - o.b[1]) < pagina.h * 0.995));
    if (!cand.length) return null;
    // si contano le linee «da mappa»: le tabelle e i cartigli sono fatti di righe orizzontali e verticali
    const obliqua = p => p.pts.some((q, i) => i && Math.abs(q[0] - p.pts[i - 1][0]) > 0.5 && Math.abs(q[1] - p.pts[i - 1][1]) > 0.5);
    // (pesate per lunghezza: le scritte disegnate a tratti sono tante ma corte), più le campiture colorate (pesate per superficie)
    const lun = p => p.pts.reduce((s, q, i) => i ? s + Math.hypot(q[0] - p.pts[i - 1][0], q[1] - p.pts[i - 1][1]) : 0, 0);
    const linee = pagina.poli.filter(p => (!p.area && obliqua(p)) || (p.area && !scuro(p.colore))).map(p => { const b = bbox(p.pts); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2, p.area ? Math.sqrt(area(b)) * 2 : lun(p)]; });
    const conta = b => linee.reduce((s, q) => q[0] > b[0] && q[0] < b[2] && q[1] > b[1] && q[1] < b[3] ? s + q[2] : s, 0);
    cand.forEach(o => { o.n = conta(o.b); });
    const nMax = Math.max(...cand.map(o => o.n));
    return cand.filter(o => o.n >= nMax * 0.55).sort((p, q) => area(p.b) - area(q.b))[0];
  };

  // Interpretazione completa di una pagina: restituisce una struttura «come DXF» con layer per tipo d'area già decisi
  // dalla legenda, le linee delle particelle e i testi; più il resoconto.
  // opt.voci: voci di legenda corrette dall'utente (ruolo) al posto di quelle lette.
  P.interpreta = (pagina, scala, opt = {}) => {
    const G = ES.geo, k = PT_MM * (scala || 1000) / 1000;
    const leg = P.legenda(pagina), avvisi = [];
    // opt.colori: {colore: ruolo} per le aree colorate che la legenda non spiega (scelte dall'utente)
    const voci = (opt.voci || leg.voci).concat(Object.keys(opt.colori || {}).filter(c => opt.colori[c]).map(c => ({ testo: 'Aree ' + P.nomeColore(c) + ' ' + c, ruolo: opt.colori[c], simbolo: { tipo: 'area', colore: c, tratt: null } })));
    const fuoriLegenda = p => !leg.zona || !dentro(bbox(p.pts), [leg.zona[0] - 2, leg.zona[1] - 2, leg.zona[2] + 2, leg.zona[3] + 2]);
    // Vista del disegno: la finestra di ritaglio più grande che non sia la pagina intera
    const fin = P.vista(pagina);
    const inVista = p => { if (!fin) return true; const b = bbox(p.pts), x = (b[0] + b[2]) / 2, y = (b[1] + b[3]) / 2; return x >= fin.b[0] && x <= fin.b[2] && y >= fin.b[1] && y <= fin.b[3]; };
    const nelDisegno = p => fuoriLegenda(p) && inVista(p);
    // Quello che sta fuori dalla vista nel PDF non si vede (è ritagliato): non si conta
    const taglia = M => { if (!fin || !M.length) return M; try { return G.intersezione(M, [[fin.c.pts]]); } catch (e) { return M; } };
    const out = { layers: {}, poli: [], testi: [], unita: 6, colori: {} };
    const metti = (layer, pts, chiusa) => { if (chiusa && (pts.length < 3 || Math.abs(ES.geo.areaAnello(pts)) < 0.05)) return; out.poli.push({ layer, pts: pts.map(q => [q[0] * k, q[1] * k]), chiusa }); };
    const NOMI = { espr: 'Esproprio', servop: 'Servitù – ingombro opere', serv: 'Servitù – fascia', occ: 'Occupazione temporanea' };
    const ruoli = {};
    let raster = false;
    const assenti = [];
    // Segmenti di due punti del disegno e quali sono tratteggi
    const seg2 = pagina.poli.filter(p => !p.area && p.pts.length === 2 && nelDisegno(p));
    const trSet = P.tratteggi(seg2.map(p => p.pts), 14, seg2.map(p => p.colore));
    const trattDi = col => seg2.filter((p, i) => trSet.has(i) && p.colore === col);
    // Aree per colore di riempimento, unite (molti CAD esportano i riempimenti a triangoli)
    const cacheAree = {};
    // I buchi con dentro una scritta sono il riquadro bianco dell'etichetta («p.lla 62»): fanno parte dell'area
    const conScritta = h => { const b = bbox(h); return pagina.testi.some(t => t.x > b[0] && t.x < b[2] && t.y > b[1] && t.y < b[3] && G.inAnello(t.x, t.y, h)); };
    const areeColore = col => cacheAree[col] || (cacheAree[col] = unisci(pagina.poli.filter(p => p.area && p.colore === col && p.pts.length >= 3 && nelDisegno(p)).map(p => p.pts))
      .map(Pol => [Pol[0], ...Pol.slice(1).filter(h => !conScritta(h))]));
    voci.forEach((v, i) => {
      if (!v.ruolo) return;
      const nome = 'Legenda ' + (i + 1) + ': ' + v.testo;
      ruoli[nome] = v.ruolo;
      out.colori[nome] = v.simbolo.colore;
      if (v.simbolo.tipo === 'area') {
        let M = areeColore(v.simbolo.colore);
        // Stesso riempimento usato da più voci: decide il tratteggio sopra (c'è / non c'è / di che colore)
        const gemelle = voci.filter(w => w !== v && w.simbolo.tipo === 'area' && w.simbolo.colore === v.simbolo.colore && w.simbolo.tratt !== v.simbolo.tratt);
        if (gemelle.length) {
          const colT = [...new Set([v.simbolo.tratt, ...gemelle.map(w => w.simbolo.tratt)].filter(Boolean))];
          const mid = {}; colT.forEach(c => { mid[c] = trattDi(c).map(p => [(p.pts[0][0] + p.pts[1][0]) / 2, (p.pts[0][1] + p.pts[1][1]) / 2]); });
          const trattDentro = Pol => { const b = bbox(Pol[0]); let best = null, nb = 2; colT.forEach(c => { const n = mid[c].filter(q => q[0] >= b[0] && q[0] <= b[2] && q[1] >= b[1] && q[1] <= b[3] && G.inPoly(q[0], q[1], Pol)).length; if (n > nb) { nb = n; best = c; } }); return best; };
          M = M.filter(Pol => trattDentro(Pol) === (v.simbolo.tratt || null));
        }
        M = taglia(M);
        M.forEach(Pol => senzaBuchi(Pol).forEach(r => metti(nome, r, true)));
        if (!M.length) assenti.push(v.testo);
      } else {
        const segm = [];
        pagina.poli.filter(p => !p.area && p.colore === v.simbolo.colore && (!v.simbolo.oc || p.oc === v.simbolo.oc) && nelDisegno(p))
          .forEach(p => { for (let j = 0; j + 1 < p.pts.length; j++) segm.push([p.pts[j], p.pts[j + 1]]); });
        const A = P.areeTratteggio(segm);
        A.forEach(x => taglia([x.poly]).forEach(Pol => senzaBuchi(Pol).forEach(r => metti(nome, r, true))));
        if (!A.length) avvisi.push(`«${v.testo}»: tratteggio non trovato nel disegno`);
      }
    });
    // Particelle: livelli CAD con nome da particelle/confini/strade; se il PDF non ha livelli utili, le linee scure
    // del disegno che non sono tratteggi né contorni di simboli della legenda
    const perLivello = pagina.poli.filter(p => !p.area && /partic|confin|strad|limite|mappa/i.test(p.oc) && !/tratteg|fabbric|scritt|testi|^z_/i.test(p.oc) && nelDisegno(p));
    if (perLivello.length) perLivello.forEach(p => metti('Particelle: ' + p.oc, p.pts, p.chiusa));
    else {
      const colLeg = new Set(voci.map(v => v.simbolo.colore));
      const tr = new Set(seg2.filter((p, i) => trSet.has(i)));
      const lin = pagina.poli.filter(p => !p.area && scuro(p.colore) && !colLeg.has(p.colore) && !tr.has(p) && nelDisegno(p));
      // Poche linee oblique = la mappa catastale è un'immagine sotto le aree colorate: niente confini da ricostruire,
      // ogni area prende il numero di particella scritto al suo interno
      const obl = lin.filter(p => p.pts.some((q, i) => i && Math.abs(q[0] - p.pts[i - 1][0]) > 0.5 && Math.abs(q[1] - p.pts[i - 1][1]) > 0.5)).length;
      const vb = fin ? fin.b : [0, 0, pagina.w, pagina.h], va = (vb[2] - vb[0]) * (vb[3] - vb[1]);
      const sotto = (pagina.immagini || []).some(im => { const b = im.b, w = Math.min(b[2], vb[2]) - Math.max(b[0], vb[0]), h = Math.min(b[3], vb[3]) - Math.max(b[1], vb[1]); return w > 0 && h > 0 && w * h > va * 0.3; });
      if (obl < 60 && sotto) { raster = true; avvisi.push('Confini delle particelle non disegnati a vettori (mappa come immagine): ogni area prende il numero di particella scritto al suo interno'); }
      else {
        lin.forEach(p => metti('Particelle: linee del disegno', p.pts, p.chiusa));
        avvisi.push('Il PDF non ha i livelli CAD: i confini delle particelle sono ricavati dalle linee scure del disegno');
      }
    }
    // Le particelle tagliate dal bordo della vista si chiudono con la cornice della vista
    if (fin && out.poli.some(p => /^Particelle: /.test(p.layer))) {
      // I confini spesso si fermano poco prima della cornice: si prolungano i capi liberi fino al bordo
      const lato = Math.min(fin.b[2] - fin.b[0], fin.b[3] - fin.b[1]), max = Math.max(lato * 0.03, 6) * k;
      const C = fin.c.pts.map(q => [q[0] * k, q[1] * k]);
      const raggio = (A, B) => {
        const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy); if (L < 1e-9) return null;
        let best = null;
        for (let i = 0; i < C.length; i++) {
          const P1 = C[i], P2 = C[(i + 1) % C.length], ex = P2[0] - P1[0], ey = P2[1] - P1[1], d = dx * ey - dy * ex;
          if (Math.abs(d) < 1e-12) continue;
          const t = ((P1[0] - B[0]) * ey - (P1[1] - B[1]) * ex) / d, u = ((P1[0] - B[0]) * dy - (P1[1] - B[1]) * dx) / d;
          if (t >= -1e-9 && u >= -1e-9 && u <= 1 + 1e-9 && t * L <= max && (best == null || t < best)) best = t;
        }
        return best == null ? null : [B[0] + best * dx, B[1] + best * dy];
      };
      out.poli.filter(p => /^Particelle: /.test(p.layer) && !p.chiusa && p.pts.length >= 2).forEach(p => {
        const n = p.pts.length, f = raggio(p.pts[n - 2], p.pts[n - 1]), i = raggio(p.pts[1], p.pts[0]);
        if (f) p.pts.push(f); if (i) p.pts.unshift(i);
      });
      out.poli.push({ layer: 'Particelle: bordo della vista', pts: C.concat([C[0]]), chiusa: false });
    }
    // Testi: tutti, tranne quelli della legenda. Le scritte «FOGLIO n» danno il foglio alle particelle vicine.
    const fogli = [];
    // Numeri dentro un cerchio (richiami di ditta, numeri di tavola…): non sono numeri di particella
    const cerchi = pagina.poli.filter(p => !p.area && p.pts.length >= 8).map(p => bbox(p.pts)).filter(b => { const w = b[2] - b[0], h = b[3] - b[1]; return w > 0 && h > 0 && w / h > 0.8 && w / h < 1.25; });
    const inCerchio = t => t.t.length <= 4 && cerchi.some(b => { const w = b[2] - b[0]; return w >= t.h * 1.2 && w <= Math.max(t.h, (t.w || 0)) * 5 && t.x > b[0] && t.x < b[2] && t.y > b[1] && t.y < b[3] && Math.hypot(t.x - (b[0] + b[2]) / 2, t.y - (b[1] + b[3]) / 2) < w * 0.3; });
    let nCerchi = 0;
    pagina.testi.forEach(t => {
      if (fin && !(t.x >= fin.b[0] && t.x <= fin.b[2] && t.y >= fin.b[1] && t.y <= fin.b[3])) return; // cartiglio, tabelle, note
      if (inCerchio(t)) { nCerchi++; out.testi.push({ ...t, layer: 'richiami cerchiati', x: t.x * k, y: t.y * k, h: t.h * k }); return; }
      if (leg.zona && t.x >= leg.zona[0] && t.x <= leg.zona[2] && t.y >= leg.zona[1] && t.y <= leg.zona[3]) return;
      const m = /^\s*f(?:oglio|g)\.?\s*(?:n\.?\s*)?(\d+)\s*(?:(?:sez(?:ione)?\.?|sez\.)\s*([a-z]))?\s*$/i.exec(t.t);
      if (m && (!fin || (t.x >= fin.b[0] && t.x <= fin.b[2] && t.y >= fin.b[1] && t.y <= fin.b[3]))) fogli.push({ x: t.x * k, y: t.y * k, fg: m[1], sez: (m[2] || '').toUpperCase() });
      else out.testi.push({ ...t, layer: 'testi', x: t.x * k, y: t.y * k, h: t.h * k, w: (t.w || 0) * k });
    });
    // Senza confini di particella, un'etichetta messa a cavallo del bordo di un'area (riquadro sul margine) vale per l'area più vicina
    if (raster) {
      const aree = out.poli.filter(p => p.chiusa && /^Legenda /.test(p.layer));
      const dSeg = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2)) : 0; return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); };
      out.testi.forEach(t => {
        if (!ES.analisi.etichetta(t.t) || aree.some(p => G.inAnello(t.x, t.y, p.pts))) return;
        let best = null;
        aree.forEach(p => { let d = Infinity; for (let i = 0; i < p.pts.length; i++) d = Math.min(d, dSeg(t.x, t.y, p.pts[i], p.pts[(i + 1) % p.pts.length])); if (!best || d < best.d) best = { d, p }; });
        if (best && best.d <= Math.max(t.h, (t.w || 0) / 2)) { const q = G.puntoEtichetta([best.p.pts]); if (q) { t.x = q[0]; t.y = q[1]; t.spostato = true; } }
      });
    }
    out.poli.forEach(p => { (out.layers[p.layer] = out.layers[p.layer] || { poli: 0, chiuse: 0, testi: 0 }).poli++; if (p.chiusa) out.layers[p.layer].chiuse++; if (/^Particelle: /.test(p.layer)) ruoli[p.layer] = 'part'; });
    out.layers.testi = { poli: 0, chiuse: 0, testi: out.testi.length - nCerchi }; ruoli.testi = 'testi';
    if (nCerchi) { out.layers['richiami cerchiati'] = { poli: 0, chiuse: 0, testi: nCerchi }; ruoli['richiami cerchiati'] = 'ignora'; }
    if (assenti.length) avvisi.push(`Voci di legenda senza aree in questa tavola (normale se non usate qui): ${assenti.map(t => '«' + t + '»').join(', ')}`);
    if (!leg.voci.length) avvisi.push('Legenda non trovata: indica a mano il tipo di ciascun gruppo di aree');
    if (!scala) avvisi.push('Scala non trovata nel PDF: indicala (o falla stimare dalle superfici catastali delle ditte)');
    const fgSet = [...new Set(fogli.map(f => f.fg + (f.sez ? ' sez. ' + f.sez : '')))];
    if (fgSet.length > 1) avvisi.push(`Più fogli nella tavola (${fgSet.join(', ')}): a ogni particella è dato il foglio della scritta più vicina, da verificare`);
    // Foglio della scritta più vicina (solo se le scritte ci sono)
    const fgDa = fogli.length ? (x, y) => (f => f.fg + (f.sez ? ' sez. ' + f.sez : ''))(fogli.reduce((b, f) => { const d = Math.hypot(f.x - x, f.y - y); return !b || d < b.d ? { d, f } : b; }, null).f) : null;
    // Aree colorate del disegno che la legenda non spiega (es. colore per ditta): l'utente può dire cosa sono
    const spiegati = new Set(voci.map(v => v.simbolo.colore));
    const sconosciuti = {};
    pagina.poli.forEach(p => { if (p.area && !scuro(p.colore) && !/^#(f{6}|fafafa)$/.test(p.colore) && !spiegati.has(p.colore) && nelDisegno(p)) { const b = bbox(p.pts); sconosciuti[p.colore] = (sconosciuti[p.colore] || 0) + (b[2] - b[0]) * (b[3] - b[1]); } });
    const altri = Object.keys(sconosciuti).filter(c => sconosciuti[c] * k * k > 1).sort((a, b) => sconosciuti[b] - sconosciuti[a]);
    return { dxf: out, ruoli, legenda: leg, avvisi, nomi: NOMI, fogli, fgDa, altri };
  };

  // Scala dalle superfici: confronta l'area grafica delle particelle lette a scala 1:1000 con la superficie catastale
  // nota (dal file delle ditte). coppie: [[grafica a 1:1000, catastale]] → scala (arrotondata ai valori usuali)
  P.scalaDaSuperfici = coppie => {
    const r = coppie.filter(c => c[0] > 0 && c[1] > 0).map(c => 1000 * Math.sqrt(c[1] / c[0])).sort((a, b) => a - b);
    if (!r.length) return 0;
    const m = r[Math.floor(r.length / 2)];
    const usuali = [100, 200, 250, 500, 1000, 1500, 2000, 2500, 4000, 5000, 10000];
    const u = usuali.find(x => Math.abs(x - m) / x < 0.06);
    return u || Math.round(m);
  };

  // Ruolo proposto per un layer del PDF (se la legenda non decide)
  P.ruoloAuto = l => {
    const base = l.replace(/ · (area|linee) #[0-9a-f]{6}$/, '');
    const r = ES.analisi.ruoloAuto(base);
    if (/partic|confin/i.test(base) && / · linee /.test(l)) return 'part';
    if (/testi|scritt/i.test(base)) return 'testi';
    if (/cartigl|tratteg|ferrov|nord|pali|idrant|enel|telefon|saracin|fincat|manufatti/i.test(base)) return 'ignora';
    if (/ · linee /.test(l) && r !== 'part') return 'sfondo';
    return r;
  };
})(ES);
