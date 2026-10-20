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
    // suddivisione adattiva: la curva si spezza finché i segmenti si discostano dalla curva meno di 0,05 punti
    // (circa 2 cm a 1:1000), così archi e curve stradali restano fedeli
    const piatta = (a, b, c, d) => { const ux = 3 * b[0] - 2 * a[0] - d[0], uy = 3 * b[1] - 2 * a[1] - d[1], vx = 3 * c[0] - a[0] - 2 * d[0], vy = 3 * c[1] - a[1] - 2 * d[1]; return Math.max(ux * ux, vx * vx) + Math.max(uy * uy, vy * vy) <= 16 * 0.05 * 0.05; };
    const div = (a, b, c, d, n) => {
      if (n > 12 || piatta(a, b, c, d)) { cur.pts.push(d); return; }
      const m = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], ab = m(a, b), bc = m(b, c), cd = m(c, d), abc = m(ab, bc), bcd = m(bc, cd), x = m(abc, bcd);
      div(a, ab, abc, x, n + 1); div(x, bcd, cd, d, n + 1);
    };
    div(p0, c1, c2, e, 0);
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
    // doc: il documento pdf.js aperto (per disegnare la pagina sotto la lettura, nell'anteprima)
    return { pagine, scala: P.scalaDaTesti(tutti), livelli: Object.values(nomiOC), doc };
  };

  // Metri del disegno per punto PDF alla scala 1:s
  P.metriPerPunto = s => PT_MM * (s || 1000) / 1000;

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
    if (/non piu interessat|fascia di rispetto strad|corsi d acqua|strade pubbl|^ferrovi|sede strad\w* (statal|provincial|comunal|esistent|pubblic|attual)|^(strad[ae]|viabilita) esistent/.test(n)) return null;
    // campitura dell'intera particella per dire che è interessata (la fascia d'intervento è un'altra voce)
    if (/^(particell[ae]|propriet[ae]|ditt[ae]|fond[io]|mappal[ei])\b.*\b(interessat|coinvolt|oggetto)/.test(n) && !/\b(fascia|area|aree|superfic)/.test(n)) return null;
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
    // Segmenti che fanno parte di una spezzata (cerchietti dei numeri di piano, contorni disegnati a segmenti):
    // entrambi i capi coincidono con il capo di un altro segmento dello stesso colore che va in un'altra direzione.
    // Le linee di un tratteggio hanno i capi liberi (o proseguono dritte, se spezzate da un incrocio).
    const capo = q => Math.round(q[0] * 20) + ',' + Math.round(q[1] * 20), dir = s => Math.atan2(s[1][1] - s[0][1], s[1][0] - s[0][0]);
    const capi = new Map();
    segm.forEach((s, i) => { const c = colori ? colori[i] : ''; [s[0], s[1]].forEach(q => { const k = c + '|' + capo(q); (capi.get(k) || capi.set(k, []).get(k)).push(i); }); });
    const piega = (i, q) => { const c = colori ? colori[i] : '', a = dir(segm[i]); return (capi.get(c + '|' + capo(q)) || []).some(j => { if (j === i) return false; let d = Math.abs(dir(segm[j]) - a) % Math.PI; d = Math.min(d, Math.PI - d); return d > 0.05; }); };
    const catena = new Set(); segm.forEach((s, i) => { if (piega(i, s[0]) && piega(i, s[1])) catena.add(i); });
    segm.forEach((s, i) => { if (catena.has(i)) return; const dx = s[1][0] - s[0][0], dy = s[1][1] - s[0][1]; if (Math.hypot(dx, dy) < 1e-6) return; let a = Math.round(Math.atan2(dy, dx) * 180 / Math.PI); a = ((a % 180) + 180) % 180; const c = colori ? colori[i] : ''; (gruppi[c] = gruppi[c] || {}); (gruppi[c][a] = gruppi[c][a] || []).push(i); });
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
    let cand = T.filter(t => t.t.length >= 3 && /[a-z]{3}/i.test(t.t) && vicino(t) && Math.abs(t.rot || 0) < 3);
    if (!ancora) {
      // senza la scritta LEGENDA: le righe con una parola chiave e quelle allineate subito sopra o sotto;
      // se non ce ne sono (es. legenda con i nomi delle ditte) si provano tutte le righe con un simbolo a sinistra
      const chiave = cand.filter(t => P.ruoloTesto(t.t));
      if (chiave.length) cand = cand.filter(t => chiave.some(c => c === t || (Math.abs(c.y - t.y) < c.h * 2.5 && Math.abs((c.x - (c.w || 0) / 2) - (t.x - (t.w || 0) / 2)) < c.h * 2)));
    }
    const grezze = [];
    cand.forEach(t => {
      const h = Math.max(t.h, 2), larg = t.w || t.t.length * h * 0.55, xTesto = t.x - larg / 2;
      const zona = [xTesto - h * 14, t.y - h * 1.9, xTesto + h * 0.3, t.y + h * 1.9];
      const vic = poli.filter(o => dentro(o.b, zona) && (o.b[2] - o.b[0]) < h * 14);
      if (!vic.length) return;
      // riempimento: il colore con più superficie (esclusi nero e bianco, che sono testo e sfondo)
      const sup = {};
      vic.forEach(o => { if (o.p.area && !/^#(f{6}|fafafa)$/.test(o.p.colore) && P.nomeColore(o.p.colore) !== 'nero') sup[o.p.colore] = (sup[o.p.colore] || 0) + (o.b[2] - o.b[0]) * (o.b[3] - o.b[1]); });
      const fill = Object.keys(sup).sort((x, y) => sup[y] - sup[x])[0] || null;
      const fb = fill ? vic.filter(o => o.p.area && o.p.colore === fill).reduce((z, o) => [Math.min(z[0], o.b[0]), Math.min(z[1], o.b[1]), Math.max(z[2], o.b[2]), Math.max(z[3], o.b[3])], [Infinity, Infinity, -Infinity, -Infinity]) : null;
      // tratteggio: linee di due punti parallele a passo regolare (dentro il riempimento, se c'è)
      const s2 = vic.filter(o => !o.p.area && o.p.pts.length === 2 && (!fb || dentro(o.b, [fb[0] - 1, fb[1] - 1, fb[2] + 1, fb[3] + 1])));
      const tr = P.tratteggi(s2.map(o => o.p.pts), h * 1.5, s2.map(o => o.p.colore)), sT = s2.filter((o, i) => tr.has(i));
      const piu = L => { const c = {}; L.forEach(o => { c[o.p.colore] = (c[o.p.colore] || 0) + 1; }); return Object.keys(c).sort((x, y) => c[y] - c[x])[0]; };
      const tratt = sT.length >= 3 ? piu(sT) : null;
      if (!fill && !tratt) return;
      // un simbolo di legenda è un riquadro pieno, non un pezzo di linea del disegno che passa vicino alla scritta
      if (fill && !tratt) {
        const pz = vic.filter(o => o.p.area && o.p.colore === fill), aTot = pz.reduce((s2, o) => s2 + Math.abs(ES.geo.areaAnello(o.p.pts)), 0), w = fb[2] - fb[0], hh = fb[3] - fb[1];
        if (w < h * 1.2 || hh < h * 0.5 || aTot < w * hh * 0.55) return;
      }
      const oc = (fill ? vic.find(o => o.p.area && o.p.colore === fill) : sT.find(o => o.p.colore === tratt)).p.oc;
      const simbolo = fill ? { tipo: 'area', colore: fill, tratt, oc } : { tipo: 'tratteggio', colore: tratt, tratt: null, oc };
      const sb = fb || sT.reduce((z, o) => [Math.min(z[0], o.b[0]), Math.min(z[1], o.b[1]), Math.max(z[2], o.b[2]), Math.max(z[3], o.b[3])], [Infinity, Infinity, -Infinity, -Infinity]);
      grezze.push({ t, simbolo, sb, zona: [sb[0], Math.min(sb[1], t.y - h / 2), Math.max(sb[2], t.x + larg / 2), Math.max(sb[3], t.y + h / 2)] });
    });
    // stesso simbolo (stesso riquadro) → stessa voce, testi dall'alto in basso
    const voci = [];
    grezze.sort((a, b) => b.t.y - a.t.y).forEach(g => {
      // stesso simbolo: stesso colore e riquadri che si toccano (il simbolo può essere fatto di più pezzi)
      const v = voci.find(x => x.simbolo.colore === g.simbolo.colore && x.simbolo.tratt === g.simbolo.tratt && Math.abs(x.sb[0] - g.sb[0]) < 2 && x.sb[1] <= g.sb[3] + 0.5 && g.sb[1] <= x.sb[3] + 0.5);
      if (v) { v.righe.push([g.t.y, g.t.t]); v.sb = [Math.min(v.sb[0], g.sb[0]), Math.min(v.sb[1], g.sb[1]), Math.max(v.sb[2], g.sb[2]), Math.max(v.sb[3], g.sb[3])]; v.zona = [Math.min(v.zona[0], g.zona[0]), Math.min(v.zona[1], g.zona[1]), Math.max(v.zona[2], g.zona[2]), Math.max(v.zona[3], g.zona[3])]; }
      else voci.push({ righe: [[g.t.y, g.t.t]], simbolo: g.simbolo, sb: g.sb, zona: g.zona, y: g.t.y });
    });
    // righe della descrizione senza simbolo proprio (es. secondo e terzo intestatario sotto il primo): alla voce
    // il cui simbolo sta alla loro altezza, con il testo allineato a sinistra
    const usate = new Set(grezze.map(g => g.t));
    cand.filter(t => !usate.has(t) && !P.ruoloTesto(t.t)).forEach(t => {
      const x0 = t.x - (t.w || t.t.length * t.h * 0.55) / 2;
      const v = voci.find(v2 => t.y >= v2.sb[1] - t.h * 0.8 && t.y <= v2.sb[3] + t.h * 0.8 && x0 > v2.sb[2] && x0 - v2.sb[2] < t.h * 6);
      if (v) v.righe.push([t.y, t.t]);
    });
    voci.forEach(v => { v.testo = v.righe.sort((a, b) => b[0] - a[0]).map(r => r[1]).join(' ').replace(/\s+/g, ' ').trim(); v.ruolo = P.ruoloTesto(v.testo); delete v.righe; });
    // I simboli di una legenda stanno in colonna: si scartano le «voci» lontane dalla colonna (scritte del disegno sopra un'area colorata)
    const xs = (voci.some(v => v.ruolo) ? voci.filter(v => v.ruolo) : voci).map(v => v.sb[0]).sort((a, b) => a - b);
    if (!voci.some(v => v.ruolo) && (voci.length < 2 || new Set(voci.map(v => v.testo)).size < voci.length)) voci.length = 0; // scritte del disegno, non una legenda
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
      const R0 = L.map(s => { const u = q => [q[0] * c + q[1] * sn, -q[0] * sn + q[1] * c]; const p = u(s[0]), q = u(s[1]); return { y: (p[1] + q[1]) / 2, x1: Math.min(p[0], q[0]), x2: Math.max(p[0], q[0]) }; }).sort((p, q) => p.y - q.y || p.x1 - q.x1);
      // Tratteggi a linee spezzate (trattini sfalsati): i trattini sulla stessa retta si ricompongono in una linea
      // intera, da contorno a contorno (le interruzioni del motivo non sono contorni)
      const lun = R0.map(r => r.x2 - r.x1).sort((a, b) => a - b), trat = lun[Math.floor(lun.length / 2)] || 0;
      const R = [];
      for (let i = 0; i < R0.length;) {
        let j = i; while (j + 1 < R0.length && R0[j + 1].y - R0[i].y < 0.2) j++;
        const riga = R0.slice(i, j + 1).sort((a, b) => a.x1 - b.x1);
        let cur = { ...riga[0] };
        for (let m = 1; m < riga.length; m++) { const o = riga[m]; if (o.x1 - cur.x2 <= Math.max(trat * 2.5, 1)) cur.x2 = Math.max(cur.x2, o.x2); else { R.push(cur); cur = { ...o }; } }
        R.push(cur); i = j + 1;
      }
      // passo del tratteggio: mediana delle distanze tra linee consecutive che si sovrappongono
      const d = []; for (let i = 1; i < R.length; i++) { const dy = R[i].y - R[i - 1].y; if (dy > 1e-6 && R[i].x1 < R[i - 1].x2 && R[i - 1].x1 < R[i].x2) d.push(dy); }
      if (!d.length) return;
      d.sort((p, q) => p - q); const passo = d[Math.floor(d.length / 2)];
      const ruota = (x, y) => [x * c - y * sn, x * sn + y * c];
      // I capi delle linee di un tratteggio stanno sul contorno vero dell'area: tra una linea e quella successiva
      // si prende il trapezio che unisce i loro capi, così i bordi obliqui e curvi seguono il disegno (non a scalini).
      // Solo oltre la prima e l'ultima linea (che cadono in media a mezzo passo dal contorno) si aggiunge mezzo passo.
      const mz = passo * 0.5, strisce = [];
      const sopra = R.map(() => false), sotto = R.map(() => false), su = R.map(() => -1), giu = R.map(() => -1);
      R.forEach((r, i) => {
        let best = -1, ov = 0;
        for (let j = i + 1; j < R.length && R[j].y - r.y <= passo * 1.6; j++) { const o = R[j]; if (o.y - r.y < passo * 0.4) continue; const v = Math.min(r.x2, o.x2) - Math.max(r.x1, o.x1); if (v > ov) { ov = v; best = j; } }
        if (best >= 0) { su[i] = best; if (giu[best] < 0) giu[best] = i; sopra[i] = true; sotto[best] = true; }
      });
      // Tratteggio a trattini: l'ultimo trattino di una riga può fermarsi prima del contorno. Le rientranze rispetto
      // alle due righe vicine (non più lunghe di un trattino con il suo intervallo) si riempiono, come ripassando il bordo.
      const spezzato = R.length < R0.length * 0.8, lim = spezzato ? Math.max(trat * 2.5, 1) : 0;
      if (lim) for (let it = 0; it < 2; it++) R.forEach((r, i) => {
        const a2 = su[i], b2 = giu[i]; if (a2 < 0 || b2 < 0) return;
        const t2 = (R[a2].x2 + R[b2].x2) / 2, t1 = (R[a2].x1 + R[b2].x1) / 2;
        if (t2 > r.x2 && t2 - r.x2 <= lim) r.x2 = t2;
        if (t1 < r.x1 && r.x1 - t1 <= lim) r.x1 = t1;
      });
      R.forEach((r, i) => { if (su[i] >= 0) { const o = R[su[i]]; strisce.push([[ruota(r.x1, r.y), ruota(r.x2, r.y), ruota(o.x2, o.y), ruota(o.x1, o.y)]]); } });
      R.forEach((r, i) => {
        if (!sopra[i]) strisce.push([[ruota(r.x1, r.y), ruota(r.x2, r.y), ruota(r.x2, r.y + mz), ruota(r.x1, r.y + mz)]]);
        if (!sotto[i]) strisce.push([[ruota(r.x1, r.y - mz), ruota(r.x2, r.y - mz), ruota(r.x2, r.y), ruota(r.x1, r.y)]]);
      });
      // unione a blocchi per non appesantire la libreria
      // (coordinate arrotondate e, se la libreria non regge una geometria degenere, unione a gruppi più piccoli)
      const r3 = v => Math.round(v * 1000) / 1000;
      const S2 = strisce.map(P2 => P2.map(r => r.map(q => [r3(q[0]), r3(q[1])])));
      let acc = [];
      const unisciA = (L, n) => { let a = acc; for (let i = 0; i < L.length; i += n) a = G.unione([a, ...L.slice(i, i + n).map(p => [p])].filter(x => x.length)); return a; };
      try { acc = unisciA(S2, 150); } catch (e) {
        acc = [];
        for (let i = 0; i < S2.length; i += 20) { const blocco = S2.slice(i, i + 20); try { acc = G.unione([acc, ...blocco.map(p => [p])].filter(x => x.length)); } catch (e2) { blocco.forEach(p => { try { acc = G.unione([acc, [p]].filter(x => x.length)); } catch (e3) { /* striscia scartata */ } }); } }
      }
      // fessure tra le strisce (buchi minuscoli): fanno parte dell'area
      acc.forEach(P2 => out.push({ poly: [P2[0], ...P2.slice(1).filter(h => Math.abs(G.areaAnello(h)) > passo * passo * 3)], passo }));
    });
    return out;
  };

  // Indice a griglia di segmenti, per trovare in fretta il segmento più vicino a un punto
  P.indiceSegmenti = (S, cella = 8) => {
    const g = new Map();
    S.forEach((s, i) => { const x0 = Math.floor(Math.min(s[0][0], s[1][0]) / cella), x1 = Math.floor(Math.max(s[0][0], s[1][0]) / cella), y0 = Math.floor(Math.min(s[0][1], s[1][1]) / cella), y1 = Math.floor(Math.max(s[0][1], s[1][1]) / cella); if ((x1 - x0 + 1) * (y1 - y0 + 1) > 2500) return; for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = x + ',' + y; (g.get(k) || g.set(k, []).get(k)).push(i); } });
    return { S, g, cella };
  };
  // Punto più vicino sui segmenti dell'indice entro tol, o null
  const vicino = (ix, q, tol) => {
    let best = null, bd = tol;
    const cx = Math.floor(q[0] / ix.cella), cy = Math.floor(q[1] / ix.cella), r = Math.ceil(tol / ix.cella), visti = new Set();
    for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++) (ix.g.get(x + ',' + y) || []).forEach(i => {
      if (visti.has(i)) return; visti.add(i);
      const [a, b] = ix.S[i], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1e-12, t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)), px = a[0] + t * dx, py = a[1] + t * dy, d = Math.hypot(q[0] - px, q[1] - py);
      if (d < bd) { bd = d; best = [px, py]; }
    });
    return best;
  };
  // Aggancio dei vertici di un poligono (anelli) alle linee vere: ogni vertice va sul punto più vicino entro tol
  P.aggancia = (Pol, ix, tol) => Pol.map(r => { const out = []; r.forEach(q => { const v = vicino(ix, q, tol) || q; const u = out[out.length - 1]; if (!u || Math.hypot(u[0] - v[0], u[1] - v[1]) > 1e-3) out.push(v); }); return out.length >= 3 ? out : r; });

  // ---- Mappa catastale «a pixel» (immagine scritta nel PDF come righe di rettangolini scuri) ----
  // Un tecnico legge i numeri e segue le linee: qui le righe di pixel diventano una bitmap, e da ogni numero di
  // particella si «riempie» la zona bianca fino alle linee che la chiudono (anche sotto le aree colorate, che nel PDF
  // sono disegnate sopra la mappa ma non la cancellano).
  P.mappaRaster = pagina => {
    const runs = pagina.poli.filter(p => p.area && p.pts.length >= 4 && p.pts.length <= 5 && scuro(p.colore)).map(p => bbox(p.pts))
      .filter(b => (b[3] - b[1]) > 0.01 && (b[3] - b[1]) < 0.8);
    if (runs.length < 3000) return null;
    const hs = runs.map(b => b[3] - b[1]).sort((a, b) => a - b), px = hs[Math.floor(hs.length / 2)];
    const bb = runs.reduce((z, b) => [Math.min(z[0], b[0]), Math.min(z[1], b[1]), Math.max(z[2], b[2]), Math.max(z[3], b[3])], [Infinity, Infinity, -Infinity, -Infinity]);
    const W = Math.ceil((bb[2] - bb[0]) / px) + 2, H = Math.ceil((bb[3] - bb[1]) / px) + 2;
    if (W * H > 60e6) return null;
    const mask = new Uint8Array(W * H);
    runs.forEach(b => {
      const c0 = Math.max(0, Math.round((b[0] - bb[0]) / px)), c1 = Math.min(W - 1, Math.round((b[2] - bb[0]) / px) - 1);
      const r0 = Math.max(0, Math.round((b[1] - bb[1]) / px)), r1 = Math.min(H - 1, Math.round((b[3] - bb[1]) / px) - 1);
      for (let r = r0; r <= Math.max(r0, r1); r++) mask.fill(1, r * W + c0, r * W + Math.max(c0, c1) + 1);
    });
    // le linee scure vere (vettoriali) contano come confini anch'esse
    pagina.poli.filter(p => !p.area && scuro(p.colore)).forEach(p => {
      for (let i = 0; i + 1 < p.pts.length; i++) {
        const a = p.pts[i], b = p.pts[i + 1], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / px) + 1;
        for (let j = 0; j <= n; j++) { const c = Math.round((a[0] + (b[0] - a[0]) * j / n - bb[0]) / px), r = Math.round((a[1] + (b[1] - a[1]) * j / n - bb[1]) / px); if (c >= 0 && c < W && r >= 0 && r < H) mask[r * W + c] = 1; }
      }
    });
    return { px, x0: bb[0], y0: bb[1], W, H, mask };
  };

  // Zona bianca che contiene il punto (x, y in punti PDF): contorno esterno in punti PDF, o null se «scappa»
  // (linee interrotte, zona più grande di maxFraz della mappa)
  // w, h: ingombro del numero (punti PDF): si parte appena fuori dal numero, non dentro gli occhielli di 0, 6, 8, 9
  P.regioneRaster = (mr, x, y, maxFraz = 0.12, w = 0, h = 0) => {
    const { px, W, H } = mr, prove = [];
    const mx = w / 2 + px * 3, my = h / 2 + px * 3;
    if (w || h) for (const [dx, dy] of [[0, my], [0, -my], [mx, 0], [-mx, 0], [mx, my], [-mx, -my], [mx, -my], [-mx, my]]) prove.push([x + dx, y + dy]);
    else prove.push([x, y]);
    const minPix = Math.max(30, ((w + h) / px) ** 2 * 1.5);
    for (const [px2, py2] of prove) { const r = regione1(mr, px2, py2, maxFraz); if (r && r.pixel >= minPix) return r; }
    return null;
  };
  // Maschera per i riempimenti: linee ispessite di un pixel, così le piccole interruzioni dei confini (1-2 pixel,
  // frequenti nelle mappe scansionate o convertite) non fanno «colare» una particella nella vicina
  const chiusa = mr => {
    if (mr._chiusa) return mr._chiusa;
    const { W, H, mask } = mr, m = new Uint8Array(mask);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { const i = r * W + c; if (!mask[i]) continue; if (c > 0) m[i - 1] = 1; if (c < W - 1) m[i + 1] = 1; if (r > 0) m[i - W] = 1; if (r < H - 1) m[i + W] = 1; }
    return (mr._chiusa = m);
  };
  const regione1 = (mr, x, y, maxFraz) => {
    const { px, x0, y0, W, H } = mr, mask = chiusa(mr);
    let c = Math.round((x - x0) / px), r = Math.round((y - y0) / px);
    if (c < 1 || r < 1 || c >= W - 1 || r >= H - 1) return null;
    // sopra una linea o una lettera: si parte dal pixel bianco più vicino
    if (mask[r * W + c]) {
      let trovato = false;
      for (let d = 1; d < 12 && !trovato; d++) for (let k = -d; k <= d && !trovato; k++) for (const [dc, dr] of [[k, -d], [k, d], [-d, k], [d, k]]) { const cc = c + dc, rr = r + dr; if (cc > 0 && rr > 0 && cc < W - 1 && rr < H - 1 && !mask[rr * W + cc]) { c = cc; r = rr; trovato = true; break; } }
      if (!trovato) return null;
    }
    const max = W * H * maxFraz, vis = new Uint8Array(W * H), st = new Int32Array(Math.min(W * H, 4e6));
    let sp = 0, n = 0, cm = c, cM = c, rm = r, rM = r;
    st[sp++] = r * W + c; vis[r * W + c] = 1;
    while (sp) {
      const i = st[--sp], rr = (i / W) | 0, cc = i - rr * W;
      if (++n > max) return null;
      if (cc < cm) cm = cc; if (cc > cM) cM = cc; if (rr < rm) rm = rr; if (rr > rM) rM = rr;
      if (cc <= 0 || rr <= 0 || cc >= W - 1 || rr >= H - 1) return null; // tocca il bordo della mappa: zona aperta
      for (const j of [i - 1, i + 1, i - W, i + W]) if (!vis[j] && !mask[j]) { vis[j] = 1; if (sp >= st.length) return null; st[sp++] = j; }
    }
    if (n < 30) return null;
    const z = allarga(mr, (cc, rr) => vis[rr * W + cc] === 1, cm, cM, rm, rM, 2), pts = contorno(z.f, z.cm, z.cM, z.rm, z.rM, mr);
    return pts ? { pts, pixel: n } : null;
  };
  // La zona bianca si ferma al bordo interno della linea di confine: la si allarga di n pixel dentro la linea (mai in
  // un'altra zona bianca), così il contorno passa per il centro della linea come nella mappa
  const allarga = (mr, dentro, cm, cM, rm, rM, n) => {
    const { W, H, mask } = mr, x0 = Math.max(0, cm - n), x1 = Math.min(W - 1, cM + n), y0 = Math.max(0, rm - n), y1 = Math.min(H - 1, rM + n), w = x1 - x0 + 1, h = y1 - y0 + 1;
    let b = new Uint8Array(w * h);
    for (let r = y0; r <= y1; r++) for (let c = x0; c <= x1; c++) if (dentro(c, r)) b[(r - y0) * w + c - x0] = 1;
    for (let it = 0; it < n; it++) {
      const nb = b.slice();
      for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) { const i = r * w + c; if (b[i] || !mask[(r + y0) * W + c + x0]) continue; if ((c > 0 && b[i - 1]) || (c < w - 1 && b[i + 1]) || (r > 0 && b[i - w]) || (r < h - 1 && b[i + w])) nb[i] = 1; }
      b = nb;
    }
    // ingombro effettivo della zona allargata (il contorno parte dalla sua riga più bassa)
    let a0 = w, a1 = -1, b0 = h, b1 = -1;
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (b[r * w + c]) { if (c < a0) a0 = c; if (c > a1) a1 = c; if (r < b0) b0 = r; if (r > b1) b1 = r; }
    return { f: (c, r) => c >= x0 && c <= x1 && r >= y0 && r <= y1 && b[(r - y0) * w + c - x0] === 1, cm: x0 + a0, cM: x0 + a1, rm: y0 + b0, rM: y0 + b1 };
  };
  // Contorno esterno di una zona di pixel (dentro(c, r)): lati dei pixel che confinano con l'esterno, concatenati
  // (zona a sinistra), semplificati e riportati in punti PDF
  const contorno = (dentro, cm, cM, rm, rM, mr) => {
    const { px, x0, y0 } = mr;
    // il pixel più in basso a sinistra della zona: il suo lato inferiore è sul contorno esterno
    let sr = rm, sc = -1; for (let cc = cm; cc <= cM; cc++) if (dentro(cc, sr)) { sc = cc; break; }
    if (sc < 0) return null;
    // si cammina sugli spigoli dei pixel: direzioni 0=est 1=nord 2=ovest 3=sud, con la zona a sinistra
    const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
    let vx = sc, vy = sr, dir = 0; const ring = [[vx, vy]];
    // pixel a sinistra e a destra del lato che parte da (vx,vy) in direzione d
    const sx = (x2, y2, d) => d === 0 ? [x2, y2] : d === 1 ? [x2 - 1, y2] : d === 2 ? [x2 - 1, y2 - 1] : [x2, y2 - 1];
    const dx2 = (x2, y2, d) => d === 0 ? [x2, y2 - 1] : d === 1 ? [x2, y2] : d === 2 ? [x2 - 1, y2] : [x2 - 1, y2 - 1];
    for (let guard = 0; guard < 4 * (cM - cm + rM - rm + 4) * 50; guard++) {
      vx += DX[dir]; vy += DY[dir];
      if (vx === sc && vy === sr) break;
      // prova a girare a destra, poi dritto, poi a sinistra, poi indietro
      for (const t of [3, 0, 1, 2]) {
        const d = (dir + t) % 4, L = sx(vx, vy, d), R = dx2(vx, vy, d);
        if (dentro(L[0], L[1]) && !dentro(R[0], R[1])) { if (d !== dir) ring.push([vx, vy]); dir = d; break; }
      }
    }
    // semplificazione (Douglas-Peucker, tolleranza 1,2 pixel) e ritorno in punti PDF
    const dp = (pts, tol) => {
      if (pts.length < 3) return pts;
      const a = pts[0], b = pts[pts.length - 1]; let im = 0, dm = 0;
      for (let i = 1; i < pts.length - 1; i++) { const q = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, d = Math.abs((b[0] - a[0]) * (a[1] - q[1]) - (a[0] - q[0]) * (b[1] - a[1])) / L; if (d > dm) { dm = d; im = i; } }
      return dm > tol ? dp(pts.slice(0, im + 1), tol).slice(0, -1).concat(dp(pts.slice(im), tol)) : [a, b];
    };
    const meta = Math.floor(ring.length / 2);
    const semp = dp(ring.slice(0, meta + 1), 0.9).slice(0, -1).concat(dp(ring.slice(meta).concat([ring[0]]), 0.9).slice(0, -1));
    if (semp.length < 3) return null;
    return semp.map(q => [x0 + q[0] * px, y0 + q[1] * px]);
  };

  // Tutte le zone bianche chiuse della mappa a pixel (anche quelle senza numero letto e quelle tagliate dal bordo
  // della mappa): come un tecnico che ripassa ogni contorno. minMm2: zona minima in mm² di carta (via occhielli dei
  // numeri, cortili minuscoli, retini); maxFraz: oltre questa frazione della mappa è lo sfondo, non una particella.
  P.regioniRaster = (mr, opt = {}) => {
    const { px, W, H } = mr, mask = chiusa(mr), mmPx = 72 / 25.4 / px;
    const min = Math.max(200, (opt.minMm2 || 9) * mmPx * mmPx), max = W * H * (opt.maxFraz || 0.12);
    const lab = new Int32Array(W * H), st = new Int32Array(Math.min(W * H, 8e6)), out = [];
    let id = 0;
    for (let i0 = 0; i0 < W * H; i0++) {
      if (mask[i0] || lab[i0]) continue;
      id++; let sp = 0, n = 0, cm = W, cM = 0, rm = H, rM = 0, bordo = false, troppo = false;
      st[sp++] = i0; lab[i0] = id;
      while (sp) {
        const i = st[--sp], rr = (i / W) | 0, cc = i - rr * W; n++;
        if (cc < cm) cm = cc; if (cc > cM) cM = cc; if (rr < rm) rm = rr; if (rr > rM) rM = rr;
        if (cc === 0 || rr === 0 || cc === W - 1 || rr === H - 1) bordo = true;
        if (cc > 0 && !mask[i - 1] && !lab[i - 1]) { lab[i - 1] = id; if (sp < st.length) st[sp++] = i - 1; else troppo = true; }
        if (cc < W - 1 && !mask[i + 1] && !lab[i + 1]) { lab[i + 1] = id; if (sp < st.length) st[sp++] = i + 1; else troppo = true; }
        if (rr > 0 && !mask[i - W] && !lab[i - W]) { lab[i - W] = id; if (sp < st.length) st[sp++] = i - W; else troppo = true; }
        if (rr < H - 1 && !mask[i + W] && !lab[i + W]) { lab[i + W] = id; if (sp < st.length) st[sp++] = i + W; else troppo = true; }
      }
      if (troppo || n < min || n > max) continue;
      const me = id, z = allarga(mr, (cc, rr) => lab[rr * W + cc] === me, cm, cM, rm, rM, 2), pts = contorno(z.f, z.cm, z.cM, z.rm, z.rM, mr);
      if (!pts) continue;
      // zone troppo sottili (strade, fossi, spazi tra le scritte) restano: diventano particelle senza numero da verificare
      if (opt.escludi) { const lp = ES.geo.puntoEtichetta([pts]); if (lp && opt.escludi(lp[0], lp[1])) continue; }
      out.push({ pts, pixel: n, bordo, a: Math.abs(ES.geo.areaAnello(pts)) });
    }
    return out;
  };

  // Numeri scritti nella mappa a pixel, cercati come li cerca un tecnico: gruppi di segni piccoli e staccati dalle linee
  // (le cifre), della stessa altezza e allineati. Restituisce i riquadri delle parole in pixel della mappa
  // {c0, r0, c1, r1, n} (righe dal basso, come la mappa): poi l'OCR legge ogni parola da sola.
  P.paroleRaster = (mr, opt = {}) => {
    const { px, W, H, mask } = mr, mmPx = 72 / 25.4 / px;
    const hMin = Math.max(6, (opt.hMinMm || 0.9) * mmPx), hMax = (opt.hMaxMm || 4.5) * mmPx;
    const lab = new Int32Array(W * H), st = new Int32Array(1 << 16), blob = [];
    let id = 0;
    for (let i0 = 0; i0 < W * H; i0++) {
      if (!mask[i0] || lab[i0]) continue;
      id++; let sp = 0, n = 0, cm = W, cM = 0, rm = H, rM = 0, grande = false;
      st[sp++] = i0; lab[i0] = id;
      while (sp) {
        const i = st[--sp], rr = (i / W) | 0, cc = i - rr * W; n++;
        if (cc < cm) cm = cc; if (cc > cM) cM = cc; if (rr < rm) rm = rr; if (rr > rM) rM = rr;
        if (cM - cm > hMax * 1.2 || rM - rm > hMax * 1.2) grande = true;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const c2 = cc + dc, r2 = rr + dr; if (c2 < 0 || r2 < 0 || c2 >= W || r2 >= H) continue;
          const j = r2 * W + c2; if (mask[j] && !lab[j]) { lab[j] = id; if (sp < st.length) st[sp++] = j; else grande = true; }
        }
      }
      const w = cM - cm + 1, h = rM - rm + 1;
      if (grande || h < hMin || h > hMax || w > h * 1.3 || n < 8) continue;
      blob.push({ id, c0: cm, c1: cM, r0: rm, r1: rM, h, cy: (rm + rM) / 2 });
    }
    // parole: segni vicini in orizzontale, di altezza simile e con il centro alla stessa quota
    blob.sort((a, b) => a.c0 - b.c0);
    const usato = new Uint8Array(blob.length), parole = [];
    for (let i = 0; i < blob.length; i++) {
      if (usato[i]) continue;
      const w0 = { c0: blob[i].c0, c1: blob[i].c1, r0: blob[i].r0, r1: blob[i].r1, h: blob[i].h, n: 1, ids: [blob[i].id], segni: [blob[i]] }; usato[i] = 1;
      let ultimo = blob[i];
      for (let j = i + 1; j < blob.length && blob[j].c0 - w0.c1 <= w0.h * 1.4; j++) {
        const b = blob[j]; if (usato[j]) continue;
        if (b.c0 - ultimo.c1 > w0.h * 1.3 || Math.abs(b.cy - ultimo.cy) > w0.h * 0.35 || b.h > w0.h * 1.5 || b.h < w0.h / 1.5) continue;
        usato[j] = 1; w0.ids.push(b.id); w0.segni.push(b); w0.c1 = Math.max(w0.c1, b.c1); w0.r0 = Math.min(w0.r0, b.r0); w0.r1 = Math.max(w0.r1, b.r1); w0.n++; ultimo = b;
      }
      if (w0.n > 6) continue;
      // solo i pixel delle cifre (senza i pezzi di linee che passano vicino): bitmap della parola, righe dal basso
      const ww = w0.c1 - w0.c0 + 1, hh = w0.r1 - w0.r0 + 1, ids = new Set(w0.ids), bits = new Uint8Array(ww * hh);
      for (let rr = 0; rr < hh; rr++) for (let cc = 0; cc < ww; cc++) if (ids.has(lab[(w0.r0 + rr) * W + w0.c0 + cc])) bits[rr * ww + cc] = 1;
      // ogni segno (cifra) con la sua bitmap, per il confronto con i modelli di cifra
      w0.segni = w0.segni.map(b => { const sw = b.c1 - b.c0 + 1, sh = b.r1 - b.r0 + 1, sb = new Uint8Array(sw * sh); for (let rr = 0; rr < sh; rr++) for (let cc = 0; cc < sw; cc++) if (lab[(b.r0 + rr) * W + b.c0 + cc] === b.id) sb[rr * sw + cc] = 1; return { w: sw, h: sh, bits: sb }; });
      w0.bits = bits; delete w0.ids; parole.push(w0);
    }
    return parole;
  };

  // Cifre della mappa riconosciute per confronto: il carattere di una mappa è sempre lo stesso, quindi le parole lette
  // con sicurezza dall'OCR insegnano la forma di ogni cifra, e con quei modelli si rileggono tutte le parole.
  // parole: da P.paroleRaster; letture: [{t, c}] dell'OCR per ogni parola (o null). Restituisce [{t, c, da}] o null.
  const N = 20;
  P.normCifra = (bits, w, h) => {
    // in un riquadro N×N, altezza piena e larghezza in proporzione, centrata; poi sfumata di un pixel
    const k = (N - 2) / h, ww = Math.max(1, Math.round(w * k)), ox = Math.floor((N - ww) / 2), a = new Float32Array(N * N);
    for (let y = 0; y < N - 2; y++) for (let x = 0; x < ww; x++) {
      const sx = Math.min(w - 1, Math.floor(x / k)), sy = Math.min(h - 1, Math.floor((N - 3 - y) / k)); // righe dal basso
      if (bits[sy * w + sx] && x + ox >= 0 && x + ox < N) a[(y + 1) * N + x + ox] = 1;
    }
    const b = new Float32Array(N * N);
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) { let v = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) v += a[(y + dy) * N + x + dx] * (dx || dy ? 0.5 : 1); b[y * N + x] = v; }
    let m = 0; for (let i = 0; i < b.length; i++) m += b[i] * b[i]; m = Math.sqrt(m) || 1;
    for (let i = 0; i < b.length; i++) b[i] /= m;
    return { v: b, asp: w / h };
  };
  const somiglia = (a, b) => { let s2 = 0; for (let i = 0; i < a.v.length; i++) s2 += a.v[i] * b.v[i]; return s2 - Math.min(0.15, Math.abs(a.asp - b.asp) * 0.25); };
  P.leggiConModelli = (parole, letture, minConf = 80) => {
    const campioni = {};
    parole.forEach((w, i) => {
      const l = letture[i]; if (!l || l.c < minConf || !/^\d+$/.test(l.t) || l.t.length !== w.segni.length) return;
      w.segni.forEach((g, j) => (campioni[l.t[j]] = campioni[l.t[j]] || []).push(P.normCifra(g.bits, g.w, g.h)));
    });
    const cifre = Object.keys(campioni); if (cifre.length < 4) return letture.map(l => l && { ...l, da: 'ocr' });
    // per ogni cifra si tengono fino a 12 campioni (confronto con il più somigliante)
    cifre.forEach(d => { campioni[d] = campioni[d].slice(0, 12); });
    return parole.map((w, i) => {
      const l = letture[i];
      const sc = w.segni.map(g => { const n = P.normCifra(g.bits, g.w, g.h); let best = null, bv = -1, sec = -1; cifre.forEach(d => { const v = Math.max(...campioni[d].map(c => somiglia(n, c))); if (v > bv) { sec = bv; bv = v; best = d; } else if (v > sec) sec = v; }); return { d: best, v: bv, marg: bv - sec }; });
      const t = sc.map(x => x.d).join(''), minV = Math.min(...sc.map(x => x.v)), minM = Math.min(...sc.map(x => x.marg));
      const buono = minV > 0.82 && minM > 0.03;
      if (l && l.t === t) return { t, c: Math.max(l.c, Math.round(minV * 100)), da: 'ocr+modelli' };
      // una cifra sola letta solo per somiglianza può essere una lettera di un toponimo: fiducia bassa
      if (buono) return { t, c: Math.round(Math.min(t.length === 1 ? 70 : 95, minV * 100 - (l && /^\d/.test(l.t) ? 10 : 0))), da: 'modelli' };
      return l && /^\d{1,5}(\/\d{1,5})?$/.test(l.t) ? { ...l, da: 'ocr' } : null;
    });
  };

  // ---- Scritte disegnate a linee (testi CAD esplosi, font SHX): i numeri delle particelle come trattini ----
  // Un tecnico le riconosce subito: gruppi di trattini piccoli, staccati dalle linee della mappa. Una particella vera,
  // anche minuscola, è attaccata ai confini vicini (capi in comune o a «T» su un altro confine).
  // Restituisce l'insieme delle spezzate che sono lettere, da togliere dai confini e da leggere con l'OCR.
  P.glifi = pagina => {
    if (pagina._glifi) return pagina._glifi;
    // (si guarda tutta la pagina: un attacco a una linea qualsiasi basta a dire che non è una scritta)
    const L = pagina.poli.filter(p => !p.area && p.pts.length >= 2 && !/^#f{6}$/i.test(p.colore));
    const par = L.map((_, i) => i), trova = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
    const vert = new Map(), K = q => Math.round(q[0] * 4) + ',' + Math.round(q[1] * 4);
    L.forEach((p, i) => p.pts.forEach(q => { const k = K(q), j = vert.get(k); if (j == null) vert.set(k, i); else par[trova(i)] = trova(j); }));
    const comp = new Map(); L.forEach((p, i) => { const r = trova(i); const b = bbox(p.pts), c = comp.get(r); if (!c) comp.set(r, { b, ii: [i] }); else { c.b = [Math.min(c.b[0], b[0]), Math.min(c.b[1], b[1]), Math.max(c.b[2], b[2]), Math.max(c.b[3], b[3])]; c.ii.push(i); } });
    const MAXG = 12; // un carattere non supera ~4 mm
    const piccoli = [...comp.values()].filter(c => Math.max(c.b[2] - c.b[0], c.b[3] - c.b[1]) <= MAXG && Math.max(c.b[2] - c.b[0], c.b[3] - c.b[1]) >= 0.8);
    // segmenti delle componenti grandi (confini), su una griglia, per riconoscere gli attacchi a «T»
    const grandi = new Set(); comp.forEach(c => { if (!piccoli.includes(c)) c.ii.forEach(i => grandi.add(i)); });
    const G = new Map(), CELLA = 8, cella = (x, y) => Math.floor(x / CELLA) + ',' + Math.floor(y / CELLA);
    grandi.forEach(i => { const p = L[i]; for (let j = 0; j + 1 < p.pts.length; j++) { const a = p.pts[j], b = p.pts[j + 1]; const x0 = Math.floor(Math.min(a[0], b[0]) / CELLA), x1 = Math.floor(Math.max(a[0], b[0]) / CELLA), y0 = Math.floor(Math.min(a[1], b[1]) / CELLA), y1 = Math.floor(Math.max(a[1], b[1]) / CELLA); if ((x1 - x0 + 1) * (y1 - y0 + 1) > 400) continue; for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = x + ',' + y; (G.get(k) || G.set(k, []).get(k)).push([a, b]); } } });
    const dSeg = (q, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1e-12, t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)); return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy); };
    const attaccata = c => c.ii.some(i => { const p = L[i]; return [p.pts[0], p.pts[p.pts.length - 1]].some(q => (G.get(cella(q[0], q[1])) || []).some(([a, b]) => dSeg(q, a, b) < 0.3)); });
    let glifi = piccoli.filter(c => !attaccata(c));
    // Una particella minuscola (cabina, pozzetto) può essere un rettangolino chiuso isolato dentro un'altra particella:
    // è una scritta solo se fa parte di una parola (più caratteri vicini della stessa grandezza) oppure se la tavola non
    // ha numeri scritti come testo e la forma non è un semplice quadrilatero chiuso; con un numero di testo accanto è una particella
    const num = (pagina.testi || []).filter(t => /^\s*\.?\d+(\/\d+)?\s*$/.test(t.t));
    const dim = c => Math.max(c.b[2] - c.b[0], c.b[3] - c.b[1]), centro = c => [(c.b[0] + c.b[2]) / 2, (c.b[1] + c.b[3]) / 2];
    const quadrilatero = c => c.ii.length === 1 && (q => { const P2 = q.pts, chiusa = Math.hypot(P2[0][0] - P2[P2.length - 1][0], P2[0][1] - P2[P2.length - 1][1]) < 0.3; return chiusa && P2.length <= 6; })(L[c.ii[0]]);
    const conTesto = c => num.some(t => t.x >= c.b[0] - dim(c) && t.x <= c.b[2] + dim(c) && t.y >= c.b[1] - dim(c) && t.y <= c.b[3] + dim(c));
    const inParola = c => { const [x, y] = centro(c), s0 = dim(c); return glifi.some(o => o !== c && Math.max(dim(o), s0) <= Math.min(dim(o), s0) * 1.7 && Math.hypot(centro(o)[0] - x, centro(o)[1] - y) <= Math.max(dim(o), s0) * 1.15); };
    // la tavola scrive i numeri a tratti se le parole disegnate sono molte più dei numeri di testo
    const parola = new Set(glifi.filter(inParola)), senzaTesti = num.length < 15 || parola.size > num.length * 3;
    glifi = glifi.filter(c => !conTesto(c) && (parola.has(c) || (senzaTesti && !quadrilatero(c))));
    const set = new Set(); glifi.forEach(c => c.ii.forEach(i => set.add(L[i])));
    return (pagina._glifi = { set, comp: glifi.map(c => ({ b: c.b, poli: c.ii.map(i => L[i]) })) });
  };

  // Parole fatte di caratteri disegnati: caratteri vicini in orizzontale, della stessa altezza e alla stessa quota.
  // Ogni parola e ogni carattere diventano una piccola bitmap (px punti per pixel) per l'OCR (APP.ocrParole).
  P.paroleVettoriali = (gl, px = 0.08, zona) => {
    const bb = pts => pts.reduce((z, q) => [Math.min(z[0], q[0]), Math.min(z[1], q[1]), Math.max(z[2], q[0]), Math.max(z[3], q[1])], [Infinity, Infinity, -Infinity, -Infinity]);
    // solo dentro la mappa (zona: [x0, y0, x1, y1] in punti), fuori da legenda e cartiglio
    const comp0 = gl.comp.filter(c => (c.b[3] - c.b[1] >= 0.8 || c.b[2] - c.b[0] >= 0.8) && (!zona || zona(c.b)));
    // caratteri disegnati due volte (stessa scritta su due livelli, o ripassata): se ne tiene uno
    const visti = new Map(), comp = comp0.filter(c => { const s2 = Math.max(c.b[2] - c.b[0], c.b[3] - c.b[1]), k = Math.round((c.b[0] + c.b[2]) / 2 / Math.max(0.6, s2 * 0.3)) + ',' + Math.round((c.b[1] + c.b[3]) / 2 / Math.max(0.6, s2 * 0.3)) + ',' + Math.round(s2 * 2); if (visti.has(k)) return false; visti.set(k, 1); return true; });
    const disegna = (poli, f, b, spess) => {
      const ww = Math.ceil((b[2] - b[0]) / px) + 1, hh = Math.ceil((b[3] - b[1]) / px) + 1, bits = new Uint8Array(ww * hh), r = Math.max(1, Math.round(spess / px / 2));
      const pun = (x, y) => { for (let dy = -r + 1; dy < r; dy++) for (let dx = -r + 1; dx < r; dx++) { const c = x + dx, rr = y + dy; if (c >= 0 && rr >= 0 && c < ww && rr < hh) bits[rr * ww + c] = 1; } };
      poli.forEach(p => { const P2 = p.pts.map(f); for (let j = 0; j + 1 < P2.length; j++) { const a = P2[j], q = P2[j + 1], n = Math.ceil(Math.hypot(q[0] - a[0], q[1] - a[1]) / px) + 1; for (let k = 0; k <= n; k++) pun(Math.round((a[0] + (q[0] - a[0]) * k / n - b[0]) / px), Math.round((a[1] + (q[1] - a[1]) * k / n - b[1]) / px)); } });
      return { w: ww, h: hh, bits };
    };
    const parola = (g, f, gruppo, rot) => {
      const b = g.reduce((z, c) => [Math.min(z[0], c.b[0]), Math.min(z[1], c.b[1]), Math.max(z[2], c.b[2]), Math.max(z[3], c.b[3])], [Infinity, Infinity, -Infinity, -Infinity]);
      const spess = Math.max(0.25, (b[3] - b[1]) * 0.09), poli = g.flatMap(c => comp[c.i].poli), tutto = disegna(poli, f, b, spess);
      const o = bb(poli.flatMap(p => p.pts)); // ingombro sulla tavola
      return { c0: 0, c1: tutto.w - 1, r0: 0, r1: tutto.h - 1, h: tutto.h, n: g.length, bits: tutto.bits, segni: g.map(c => disegna(comp[c.i].poli, f, c.b, spess)), cx: (o[0] + o[2]) / 2, cy: (o[1] + o[3]) / 2, pw: o[2] - o[0], ph: o[3] - o[1], gruppo, rot };
    };
    // Caratteri vicini e della stessa grandezza formano una parola, a qualsiasi inclinazione (i numeri seguono spesso
    // l'orientamento della particella): l'inclinazione è la retta che passa per i centri dei caratteri
    const info = comp.map(c => { const w = c.b[2] - c.b[0], h = c.b[3] - c.b[1]; return { s: Math.max(w, h), x: (c.b[0] + c.b[2]) / 2, y: (c.b[1] + c.b[3]) / 2 }; });
    const par = comp.map((_, i) => i), trova = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
    const CEL = 12, gr = new Map(); info.forEach((o, i) => { const k = Math.floor(o.x / CEL) + ',' + Math.floor(o.y / CEL); (gr.get(k) || gr.set(k, []).get(k)).push(i); });
    info.forEach((o, i) => { if (o.s < 1 || o.s > 12) return; const cx = Math.floor(o.x / CEL), cy = Math.floor(o.y / CEL); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) (gr.get((cx + dx) + ',' + (cy + dy)) || []).forEach(j => { if (j <= i) return; const q = info[j]; if (q.s < 1 || q.s > 12 || Math.max(o.s, q.s) > Math.min(o.s, q.s) * 1.7) return; if (Math.hypot(o.x - q.x, o.y - q.y) <= Math.max(o.s, q.s) * 1.15) par[trova(i)] = trova(j); }); });
    const G = new Map(); comp.forEach((_, i) => { if (info[i].s < 1 || info[i].s > 12) return; const r = trova(i); (G.get(r) || G.set(r, []).get(r)).push(i); });
    const parole = []; let ng = 0;
    const gruppoA = (idx, ang) => { const cs = Math.cos(-ang), sn = Math.sin(-ang), f = q => [q[0] * cs - q[1] * sn, q[0] * sn + q[1] * cs]; return { f, g: idx.map(i => { const b = bb(comp[i].poli.flatMap(p => p.pts.map(f))); return { i, b, h: b[3] - b[1] }; }).sort((a, b) => a.b[0] - b.b[0]) }; };
    const sizes = [];
    G.forEach(idx => {
      if (idx.length < 2 || idx.length > 6) return;
      // retta dei centri (componente principale)
      const mx = idx.reduce((t, i) => t + info[i].x, 0) / idx.length, my = idx.reduce((t, i) => t + info[i].y, 0) / idx.length;
      let sxx = 0, syy = 0, sxy = 0; idx.forEach(i => { const dx = info[i].x - mx, dy = info[i].y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; });
      let ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
      const { f, g } = gruppoA(idx, ang);
      // una cifra è più alta che larga: se i caratteri raddrizzati sono larghi, la parola non è un numero
      if (g.some(c => c.b[2] - c.b[0] > c.h * 1.15)) return;
      const id = ng++, deg = ang * 180 / Math.PI;
      parole.push(parola(g, f, id, Math.round(deg)));
      g.forEach(c => sizes.push(c.h));
      // il verso: se il testo non è quasi dritto si prova anche capovolto
      if (Math.abs(deg) > 25) { const r2 = gruppoA(idx, ang + Math.PI); parole.push(parola(r2.g, r2.f, id, Math.round(deg + 180))); }
    });
    // caratteri soli (particelle con numero di una cifra): solo se alti come i numeri trovati, letti dritti
    sizes.sort((a, b) => a - b); const hMed = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0;
    if (hMed) G.forEach(idx => { if (idx.length !== 1) return; const { f, g } = gruppoA(idx, 0); const c = g[0]; if (Math.abs(c.h - hMed) <= hMed * 0.2 && c.b[2] - c.b[0] <= c.h * 1.05) parole.push(parola(g, f, ng++, 0)); });
    return { px, x0: 0, y0: 0, W: Infinity, H: Infinity, mask: null, parole };
  };

  // Particelle ricostruite dalla mappa a pixel: una per numero letto (testi del PDF o letti con l'OCR).
  // numeri: [{x, y, t}] in punti PDF. Restituisce [{pts, t}] senza sovrapposizioni (le particelle interne si tolgono).
  P.particelleRaster = (mr, numeri) => {
    const G = ES.geo, out = [];
    numeri.forEach(n => {
      if (out.some(o => G.inAnello(n.x, n.y, o.pts))) { const o = out.find(q => G.inAnello(n.x, n.y, q.pts)); if (o.t !== n.t) o.altri = (o.altri || []).concat(n.t); return; }
      const reg = P.regioneRaster(mr, n.x, n.y, 0.12, n.w || 0, n.h || 0); if (reg) out.push({ pts: reg.pts, t: n.t, a: Math.abs(G.areaAnello(reg.pts)) });
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
    const voci = (opt.voci || leg.voci).concat(Object.keys(opt.colori || {}).filter(c => opt.colori[c]).map(c => /^t:/.test(c)
      ? { testo: 'Tratteggio ' + P.nomeColore(c.slice(2)) + ' ' + c.slice(2), ruolo: opt.colori[c], simbolo: { tipo: 'tratteggio', colore: c.slice(2), tratt: null } }
      : { testo: 'Aree ' + P.nomeColore(c) + ' ' + c, ruolo: opt.colori[c], simbolo: { tipo: 'area', colore: c, tratt: null } }));
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
    const assenti = [], perVoce = [];
    // Segmenti di due punti del disegno e quali sono tratteggi
    const seg2 = pagina.poli.filter(p => !p.area && p.pts.length === 2 && nelDisegno(p));
    const trSet = P.tratteggi(seg2.map(p => p.pts), 14, seg2.map(p => p.colore));
    const trattDi = col => seg2.filter((p, i) => trSet.has(i) && p.colore === col);
    // Linee di contorno della tavola (spezzate e segmenti lunghi, non i trattini dei tratteggi), su una griglia
    let _cont = null;
    const contorni = () => {
      if (_cont) return _cont;
      const S = [];
      pagina.poli.forEach(p => { if (p.area || /^#f{6}$/i.test(p.colore) || !nelDisegno(p)) return; let L = 0; for (let j = 1; j < p.pts.length; j++) L += Math.hypot(p.pts[j][0] - p.pts[j - 1][0], p.pts[j][1] - p.pts[j - 1][1]); if (L < 12) return; for (let j = 1; j < p.pts.length; j++) S.push([p.pts[j - 1], p.pts[j]]); });
      return (_cont = P.indiceSegmenti(S));
    };
    // Aree per colore di riempimento, unite (molti CAD esportano i riempimenti a triangoli)
    const cacheAree = {};
    // I buchi con dentro una scritta sono il riquadro bianco dell'etichetta («p.lla 62»): fanno parte dell'area
    const conScritta = h => { const b = bbox(h); return pagina.testi.some(t => t.x > b[0] && t.x < b[2] && t.y > b[1] && t.y < b[3] && G.inAnello(t.x, t.y, h)); };
    const areeColore = col => cacheAree[col] || (cacheAree[col] = unisci((L => L.length > 60000 ? (avvisi.push(`Il colore ${col} è usato da ${L.length} elementi (la mappa stessa?): non è stato preso come area`), []) : L)(pagina.poli.filter(p => p.area && p.colore === col && p.pts.length >= 3 && nelDisegno(p))).map(p => p.pts))
      .map(Pol => [Pol[0], ...Pol.slice(1).filter(h => !conScritta(h))])
      // bordi delle campiture disegnati come rettangolini pieni (spessore di una linea): non sono aree
      .filter(Pol => { const A = Math.abs(G.areaPoly(Pol)), per = Pol.reduce((s2, r) => s2 + r.reduce((t, q, j) => t + Math.hypot(q[0] - r[(j + 1) % r.length][0], q[1] - r[(j + 1) % r.length][1]), 0), 0); return per > 0 && 2 * A / per >= 1.1; }));
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
        M = taglia(M); perVoce.push({ v, M });
        M.forEach(Pol => senzaBuchi(Pol).forEach(r => metti(nome, r, true)));
        if (!M.length) assenti.push(v.testo);
      } else {
        const segm = [];
        // il livello CAD del simbolo conta solo se è un livello vero e nella mappa ci sono linee su quel livello
        // (spesso la legenda è sul livello «0» e il tratteggio della mappa su «_Esproprio definitivo»)
        ((L0, oc) => (oc && !/^(0|defpoints|legend\w*)$/i.test(oc) && L0.filter(p => p.oc === oc).length >= 12 ? L0.filter(p => p.oc === oc) : L0))(pagina.poli.filter(p => !p.area && p.colore === v.simbolo.colore && nelDisegno(p)), v.simbolo.oc)
          // solo linee dritte (una spezzata che gira, come il cerchietto di un numero di piano, non è un tratteggio)
          .filter(p => { const a = p.pts[0], b = p.pts[p.pts.length - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); return L > 1e-6 && p.pts.every(q => Math.abs((b[0] - a[0]) * (a[1] - q[1]) - (a[0] - q[0]) * (b[1] - a[1])) / L < 0.3); })
          .forEach(p => segm.push([p.pts[0], p.pts[p.pts.length - 1]]));
        // e solo quelle che si ripetono parallele a passo regolare (via segmenti sparsi dello stesso colore)
        const reg = P.tratteggi(segm, 14); for (let j = segm.length - 1; j >= 0; j--) if (!reg.has(j)) segm.splice(j, 1);
        const A = P.areeTratteggio(segm);
        // i vertici dell'area si agganciano alla linea di contorno vera disegnata nella tavola (entro meno di un passo)
        if (A.length) { const cont = contorni(); A.forEach(x => { x.poly = P.aggancia(x.poly, cont, Math.min(x.passo * 0.8, 3)); }); }
        perVoce.push({ v, M: A.map(x => x.poly) });
        A.forEach(x => taglia([x.poly]).forEach(Pol => senzaBuchi(Pol).forEach(r => metti(nome, r, true))));
        if (!A.length) avvisi.push(`«${v.testo}»: tratteggio non trovato nel disegno`);
      }
    });
    // Particelle: livelli CAD con nome da particelle/confini/strade; se il PDF non ha livelli utili, le linee scure
    // del disegno che non sono tratteggi né contorni di simboli della legenda
    // scritte disegnate a linee (numeri delle particelle esplosi in trattini): non sono confini
    const gl = P.glifi(pagina);
    const perLivello = pagina.poli.filter(p => !p.area && /partic|confin|strad|limite|mappa/i.test(p.oc) && !/tratteg|fabbric|scritt|testi|^z_|esprop|asserv|occup|servit|vincol/i.test(p.oc) && nelDisegno(p) && !gl.set.has(p));
    // Mappa catastale «a pixel»: particelle ricostruite dai numeri (testi del PDF e numeri letti con l'OCR)
    const mr = pagina._mr === undefined ? (pagina._mr = P.mappaRaster(pagina)) : pagina._mr;
    const inLeg = t => leg.zona && t.x >= leg.zona[0] && t.x <= leg.zona[2] && t.y >= leg.zona[1] && t.y <= leg.zona[3];
    const inFin = t => !fin || (t.x >= fin.b[0] && t.x <= fin.b[2] && t.y >= fin.b[1] && t.y <= fin.b[3]);
    const ocr = (opt.numeri || []).filter(n => inFin(n) && !inLeg(n));
    if (mr && !perLivello.length) {
      const numeri = pagina.testi.filter(t => inFin(t) && !inLeg(t) && ES.analisi.etichetta(t.t) && !/^\s*f(oglio|g)/i.test(t.t)).map(t => ({ t: t.t, x: t.x, y: t.y, w: t.w || t.h * t.t.length * 0.55, h: t.h })).concat(ocr);
      const parti = P.particelleRaster(mr, numeri);
      // aree d'intervento che non cadono in una particella ricostruita: si riempie la zona da un punto dell'area;
      // se dentro c'è un numero (sfuggito al primo giro) quella è la sua particella
      out.poli.filter(q => q.chiusa && /^Legenda /.test(q.layer)).forEach(q => {
        const r = q.pts.map(v => [v[0] / k, v[1] / k]), lp = G.puntoEtichetta([r]); if (!lp || parti.some(o => G.inAnello(lp[0], lp[1], o.pts))) return;
        const reg = P.regioneRaster(mr, lp[0], lp[1], 0.12); if (!reg) return;
        const n = numeri.find(nn => G.inAnello(nn.x, nn.y, reg.pts)); if (n) parti.push({ pts: reg.pts, t: n.t, a: Math.abs(G.areaAnello(reg.pts)) });
      });
      // tutte le altre zone chiuse della mappa (numeri non letti, particelle tagliate dalla cornice): particelle senza
      // numero, che prendono il numero dai testi che cadono dentro o si numerano a mano
      const giaPresa = (x, y) => parti.some(o => G.inAnello(x, y, o.pts));
      const altre = P.regioniRaster(mr, { escludi: (x, y) => giaPresa(x, y) || inLeg({ x, y }) || !inFin({ x, y }) });
      // zone chiuse dentro un'altra zona (contorni dei fabbricati, cortili): fanno parte della particella che le contiene
      const tutte = parti.concat(altre), dentroAltra = q => { const lp = G.puntoEtichetta([q.pts]); return lp && tutte.some(o => o !== q && o.a > q.a && G.inAnello(q.pts[0][0], q.pts[0][1], o.pts) && G.inAnello(lp[0], lp[1], o.pts)); };
      for (let i = altre.length - 1; i >= 0; i--) if (dentroAltra(altre[i])) altre.splice(i, 1);
      altre.forEach(q => metti('Particelle: ricostruite dalla mappa', q.pts, true));
      if (altre.length) avvisi.push(`Mappa catastale a immagine: ${altre.length} zone chiuse senza numero letto (particelle tagliate dalla cornice, strade, numeri non riconosciuti): numerale con un clic dove serve`);
      parti.forEach(q => metti('Particelle: ricostruite dalla mappa', q.pts, true));
      avvisi.push(parti.length ? `Mappa catastale a immagine: ${parti.length} particelle ricostruite seguendo le linee della mappa da ogni numero${ocr.length ? ' (' + ocr.length + ' numeri letti con l\'OCR, da verificare)' : ''}`
        : 'Mappa catastale a immagine: i numeri delle particelle non sono testo. Usa «Leggi i numeri dalla mappa (OCR)» per farli riconoscere');
    } else if (perLivello.length) perLivello.forEach(p => metti('Particelle: ' + p.oc, p.pts, p.chiusa));
    else {
      const colLeg = new Set(voci.map(v => v.simbolo.colore));
      const tr = new Set(seg2.filter((p, i) => trSet.has(i)));
      const lin = pagina.poli.filter(p => !p.area && scuro(p.colore) && !colLeg.has(p.colore) && !tr.has(p) && nelDisegno(p) && !gl.set.has(p));
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
    // numeri letti con l'OCR: testi come gli altri (danno il numero alle particelle, ricostruite o dalle linee)
    ocr.forEach(n => out.testi.push({ layer: 'numeri letti (OCR)', t: n.t, x: n.x * k, y: n.y * k, h: (n.h || 2) * k, rot: 0 }));
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
      // «Foglio 12», «Fg. 12 sez. A», «FOGLIO DI MAPPA 12», «FDM LONGARONE 45A», «Comune di … – Foglio 12 All. B»
      const m = /(?:^|[\s\-–(])(?:foglio(?:\s+di\s+mappa)?|f\.?\s?d\.?\s?m\.?|fg)\.?\s*(?:n\.?\s*|n°\s*)?(?:(?:[a-zà-ù'’]{2,}\s+){1,3})?(\d{1,4})\s*([a-z])?(?:\s*(?:sez(?:ione)?|all(?:egato|\.)?)\.?\s*([a-z]))?\s*(?:$|[\s\-–)])/i.exec(t.t);
      if (m && !/mapp|p\.?\s?lla|partic|\bsub\b/i.test(t.t) && (!fin || (t.x >= fin.b[0] && t.x <= fin.b[2] && t.y >= fin.b[1] && t.y <= fin.b[3]))) fogli.push({ x: t.x * k, y: t.y * k, fg: m[1], sez: (m[3] || m[2] || '').toUpperCase() });
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
    const nOcr = out.testi.filter(t => t.layer === 'numeri letti (OCR)').length;
    out.layers.testi = { poli: 0, chiuse: 0, testi: out.testi.length - nCerchi - nOcr }; ruoli.testi = 'testi';
    if (nOcr) { out.layers['numeri letti (OCR)'] = { poli: 0, chiuse: 0, testi: nOcr }; ruoli['numeri letti (OCR)'] = 'testi'; }
    if (nCerchi) { out.layers['richiami cerchiati'] = { poli: 0, chiuse: 0, testi: nCerchi }; ruoli['richiami cerchiati'] = 'ignora'; }
    // Particella campita tutta e fascia d'intervento dentro: la campitura grande di solito dice solo «particella interessata»
    perVoce.forEach(a => perVoce.forEach(b => {
      if (a === b || !a.M.length || !b.M.length || a.v.ruolo === null) return;
      try {
        const Aa = G.areaMP(a.M), Ab = G.areaMP(b.M); if (Aa < Ab * 2.5) return;
        const dentro2 = G.areaMP(G.intersezione(b.M, a.M));
        if (dentro2 > Ab * 0.8) avvisi.push(`Le aree «${a.v.testo}» contengono quasi per intero le aree «${b.v.testo}»: se la prima campitura serve solo a indicare la particella interessata, impostala come «non è un'area d'intervento» e tieni la fascia come area`);
      } catch (e) { /* geometrie non confrontabili */ }
    }));
    if (assenti.length) avvisi.push(`Voci di legenda senza aree in questa tavola (normale se non usate qui): ${assenti.map(t => '«' + t + '»').join(', ')}`);
    if (!leg.voci.length) avvisi.push('Legenda non trovata: indica a mano il tipo di ciascun gruppo di aree');
    if (!scala) avvisi.push('Scala non trovata nel PDF: indicala (o falla stimare dalle superfici catastali delle ditte)');
    const fgSet = [...new Set(fogli.map(f => f.fg + (f.sez ? ' sez. ' + f.sez : '')))];
    if (fgSet.length > 1) avvisi.push(`Più fogli nella tavola (${fgSet.join(', ')}): a ogni particella è dato il foglio della scritta più vicina, da verificare`);
    // Foglio della scritta più vicina (solo se le scritte ci sono)
    const fgDa = fogli.length ? (x, y) => (f => f.fg + (f.sez ? ' sez. ' + f.sez : ''))(fogli.reduce((b, f) => { const d = Math.hypot(f.x - x, f.y - y); return !b || d < b.d ? { d, f } : b; }, null).f) : null;
    // Aree colorate del disegno che la legenda non spiega (es. colore per ditta): l'utente può dire cosa sono
    // Riempimenti e tratteggi colorati che la legenda non spiega: l'utente dice cosa sono (proposta dal nome del livello CAD)
    const spiegati = new Set(voci.map(v => (v.simbolo.tipo === 'tratteggio' ? 't:' : '') + v.simbolo.colore));
    const sconosciuti = {}, livello = {};
    pagina.poli.forEach(p => { if (p.area && !scuro(p.colore) && !/^#(f{6}|fafafa)$/.test(p.colore) && !spiegati.has(p.colore) && nelDisegno(p)) { const b = bbox(p.pts); sconosciuti[p.colore] = (sconosciuti[p.colore] || 0) + (b[2] - b[0]) * (b[3] - b[1]); livello[p.colore] = p.oc; } });
    const trConta = {}; seg2.forEach((p, i) => { if (trSet.has(i) && !scuro(p.colore)) { const c = 't:' + p.colore; if (!spiegati.has(c)) { trConta[c] = (trConta[c] || 0) + 1; livello[c] = p.oc; } } });
    const altri = Object.keys(sconosciuti).filter(c => sconosciuti[c] * k * k > 1).sort((a, b) => sconosciuti[b] - sconosciuti[a]).concat(Object.keys(trConta).filter(c => trConta[c] >= 12));
    const proposte = {}; altri.forEach(c => { const l = livello[c] || ''; const r = l && l !== '0' ? P.ruoloTesto(l.replace(/[_\-]+/g, ' ')) : null; if (r) proposte[c] = r; });
    return { dxf: out, ruoli, legenda: leg, avvisi, nomi: NOMI, fogli, fgDa, altri, livelli: livello, proposte };
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
