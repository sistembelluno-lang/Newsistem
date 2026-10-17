// Geometria piana per le particelle: aree, punto nel poligono, ricostruzione dei poligoni da linee sciolte,
// intersezioni e differenze (polygon-clipping, incluso nella pagina). Coordinate in metri (Gauss-Boaga, UTM, locali).
// Formati: anello = [[x,y],…]; poligono = [anelloEsterno, buchi…]; multipoligono = [poligono…]
(function (ES) {
  'use strict';
  const G = ES.geo = {};
  const PC = () => (typeof polygonClipping !== 'undefined' ? polygonClipping : globalThis.polygonClipping);

  G.areaAnello = r => { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
  G.areaPoly = P => P.reduce((s, r, k) => s + (k ? -1 : 1) * Math.abs(G.areaAnello(r)), 0);
  G.areaMP = M => (M || []).reduce((s, P) => s + G.areaPoly(P), 0);

  G.bboxPts = (pts, b) => { b = b || [Infinity, Infinity, -Infinity, -Infinity]; for (const p of pts) { if (p[0] < b[0]) b[0] = p[0]; if (p[1] < b[1]) b[1] = p[1]; if (p[0] > b[2]) b[2] = p[0]; if (p[1] > b[3]) b[3] = p[1]; } return b; };
  G.bboxMP = (M, b) => { (M || []).forEach(P => G.bboxPts(P[0], b = b || [Infinity, Infinity, -Infinity, -Infinity])); return b || [0, 0, 0, 0]; };
  G.bboxOverlap = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

  G.inAnello = (x, y, r) => {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  G.inPoly = (x, y, P) => G.inAnello(x, y, P[0]) && !P.slice(1).some(h => G.inAnello(x, y, h));
  G.inMP = (x, y, M) => (M || []).some(P => G.inPoly(x, y, P));

  // Anello pulito: niente punti doppi consecutivi né chiusura ripetuta, almeno 3 vertici
  G.pulisci = (pts, tol = 1e-4) => {
    const o = [];
    for (const p of pts) { const q = o[o.length - 1]; if (!q || Math.abs(q[0] - p[0]) > tol || Math.abs(q[1] - p[1]) > tol) o.push([p[0], p[1]]); }
    while (o.length > 1 && Math.abs(o[0][0] - o[o.length - 1][0]) <= tol && Math.abs(o[0][1] - o[o.length - 1][1]) <= tol) o.pop();
    return o.length >= 3 ? o : null;
  };
  G.arrotonda = M => M.map(P => P.map(r => r.map(p => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000])));

  // Operazioni booleane robuste; con geometrie vuote non si chiama la libreria
  const vuoto = M => !M || !M.length;
  // Le operazioni della libreria possono fallire su geometrie degeneri (PDF con migliaia di pezzetti): si riprova con le
  // coordinate arrotondate al millimetro; se fallisce ancora si restituisce un risultato prudente invece di bloccarsi.
  const arr = M => M.map(P => P.map(r => r.map(q => [Math.round(q[0] * 1000) / 1000, Math.round(q[1] * 1000) / 1000])));
  const sicuro = (f, args, ripiego) => { try { return f(...args); } catch (e) { try { return f(...args.map(arr)); } catch (e2) { return ripiego(); } } };
  G.unione = list => { list = list.filter(m => !vuoto(m)); if (!list.length) return []; if (list.length === 1) return list[0]; return sicuro((...L) => PC().union(...L), list, () => [].concat(...list)); };
  G.intersezione = (a, b) => (vuoto(a) || vuoto(b) ? [] : sicuro((x, y) => PC().intersection(x, y), [a, b], () => []));
  G.differenza = (a, ...b) => { b = b.filter(m => !vuoto(m)); if (vuoto(a)) return []; if (!b.length) return a; return sicuro((x, ...y) => PC().difference(x, ...y), [a, ...b], () => a); };

  // Punto interno dove scrivere l'etichetta: il baricentro se cade dentro, altrimenti il centro del tratto interno più largo
  G.puntoEtichetta = P => {
    const r = P[0]; let A = 0, cx = 0, cy = 0;
    for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n], f = p[0] * q[1] - q[0] * p[1]; A += f; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f; }
    if (Math.abs(A) > 1e-9) { cx /= 3 * A; cy /= 3 * A; if (G.inPoly(cx, cy, P)) return [cx, cy]; }
    const b = G.bboxPts(r); let best = null;
    for (let k = 1; k < 12; k++) {
      const y = b[1] + (b[3] - b[1]) * k / 12, xs = [];
      P.forEach(rr => { for (let i = 0, j = rr.length - 1; i < rr.length; j = i++) { const a = rr[i], c = rr[j]; if ((a[1] > y) !== (c[1] > y)) xs.push(a[0] + (y - a[1]) * (c[0] - a[0]) / (c[1] - a[1])); } });
      xs.sort((u, v) => u - v);
      for (let i = 0; i + 1 < xs.length; i += 2) { const w = xs[i + 1] - xs[i]; if (!best || w > best.w) best = { w, x: (xs[i] + xs[i + 1]) / 2, y }; }
    }
    return best ? [best.x, best.y] : r[0];
  };
  // Per un multipoligono: il punto nel pezzo più grande
  G.puntoEtichettaMP = M => { let big = null, ab = -1; (M || []).forEach(P => { const a = G.areaPoly(P); if (a > ab) { ab = a; big = P; } }); return big ? G.puntoEtichetta(big) : null; };

  // ---- Ricostruzione dei poligoni da linee sciolte (confini catastali disegnati come LINE o polilinee aperte) ----
  // Le estremità vicine meno di tol vengono unite, i tratti spezzati dove un'estremità cade sopra un altro tratto,
  // poi si percorrono le facce del grafo planare tenendo sempre la faccia a sinistra.
  G.poligonizza = function (linee, tol = 0.01) {
    const P = [], key = new Map(), cella = tol * 4;
    const vid = (x, y) => {
      const gx = Math.round(x / cella), gy = Math.round(y / cella);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const L = key.get((gx + dx) + ',' + (gy + dy)); if (!L) continue;
        for (const id of L) if (Math.abs(P[id][0] - x) <= tol && Math.abs(P[id][1] - y) <= tol) return id;
      }
      const id = P.length; P.push([x, y]); const k = gx + ',' + gy; (key.get(k) || key.set(k, []).get(k)).push(id); return id;
    };
    let seg = [];
    linee.forEach(l => { const pts = l.chiusa ? [...l.pts, l.pts[0]] : l.pts; for (let i = 0; i + 1 < pts.length; i++) { const a = vid(pts[i][0], pts[i][1]), b = vid(pts[i + 1][0], pts[i + 1][1]); if (a !== b) seg.push([a, b]); } });
    // Incroci a metà tratto (linee che si attraversano senza vertice comune): si aggiunge il punto d'incrocio come vertice
    {
      const b0 = G.bboxPts(P), gsz = Math.max(1, Math.max(b0[2] - b0[0], b0[3] - b0[1]) / 300), cel = new Map(), nuoviP = [];
      seg.forEach((sg, i) => { const A = P[sg[0]], B = P[sg[1]]; for (let gx = Math.floor(Math.min(A[0], B[0]) / gsz); gx <= Math.floor(Math.max(A[0], B[0]) / gsz); gx++) for (let gy = Math.floor(Math.min(A[1], B[1]) / gsz); gy <= Math.floor(Math.max(A[1], B[1]) / gsz); gy++) { const k = gx + ',' + gy; (cel.get(k) || cel.set(k, []).get(k)).push(i); } });
      const visti = new Set();
      cel.forEach(L => { for (let a = 0; a < L.length; a++) for (let b = a + 1; b < L.length; b++) {
        const i = L[a], j = L[b], kk = i < j ? i + '_' + j : j + '_' + i; if (visti.has(kk)) continue; visti.add(kk);
        const [p1, p2] = seg[i], [p3, p4] = seg[j]; if (p1 === p3 || p1 === p4 || p2 === p3 || p2 === p4) continue;
        const A = P[p1], B = P[p2], C = P[p3], D = P[p4], d = (B[0] - A[0]) * (D[1] - C[1]) - (B[1] - A[1]) * (D[0] - C[0]);
        if (Math.abs(d) < 1e-12) continue;
        const t = ((C[0] - A[0]) * (D[1] - C[1]) - (C[1] - A[1]) * (D[0] - C[0])) / d, u = ((C[0] - A[0]) * (B[1] - A[1]) - (C[1] - A[1]) * (B[0] - A[0])) / d;
        if (t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9) nuoviP.push([A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])]);
      } });
      nuoviP.forEach(q => vid(q[0], q[1]));
    }
    // Spezza i tratti nei vertici che ci cadono sopra (giunzioni a T e incroci appena aggiunti)
    const grid = new Map(), gs = Math.max(1, (() => { const b = G.bboxPts(P); return Math.max(b[2] - b[0], b[3] - b[1]) / 200; })());
    P.forEach((p, id) => { const k = Math.floor(p[0] / gs) + ',' + Math.floor(p[1] / gs); (grid.get(k) || grid.set(k, []).get(k)).push(id); });
    const nuovi = [];
    seg.forEach(([a, b]) => {
      const A = P[a], B = P[b], dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy, sul = [];
      const x0 = Math.floor((Math.min(A[0], B[0]) - tol) / gs), x1 = Math.floor((Math.max(A[0], B[0]) + tol) / gs);
      const y0 = Math.floor((Math.min(A[1], B[1]) - tol) / gs), y1 = Math.floor((Math.max(A[1], B[1]) + tol) / gs);
      for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) (grid.get(gx + ',' + gy) || []).forEach(id => {
        if (id === a || id === b) return;
        const t = ((P[id][0] - A[0]) * dx + (P[id][1] - A[1]) * dy) / L2;
        if (t <= 1e-9 || t >= 1 - 1e-9) return;
        const ex = A[0] + t * dx - P[id][0], ey = A[1] + t * dy - P[id][1];
        if (ex * ex + ey * ey <= tol * tol) sul.push([t, id]);
      });
      if (!sul.length) { nuovi.push([a, b]); return; }
      sul.sort((u, v) => u[0] - v[0]); let prev = a;
      sul.forEach(([, id]) => { if (id !== prev) nuovi.push([prev, id]); prev = id; }); if (prev !== b) nuovi.push([prev, b]);
    });
    // Tratti doppi (confine comune disegnato due volte) contano una volta sola
    const visto = new Set(); seg = nuovi.filter(([a, b]) => { const k = a < b ? a + '_' + b : b + '_' + a; if (visto.has(k)) return false; visto.add(k); return true; });
    const adj = new Map();
    seg.forEach(([a, b]) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); });
    // Rami morti (tratti che non chiudono nulla) eliminati a cascata
    let cambiato = true;
    while (cambiato) { cambiato = false; for (const [v, L] of adj) if (L.length === 1) { const w = L[0]; adj.delete(v); const M = adj.get(w); if (M) M.splice(M.indexOf(v), 1); cambiato = true; } else if (!L.length) adj.delete(v); }
    const ang = (a, b) => Math.atan2(P[b][1] - P[a][1], P[b][0] - P[a][0]);
    adj.forEach((L, v) => L.sort((x, y) => ang(v, x) - ang(v, y)));
    const usato = new Set(), facce = [];
    adj.forEach((L, s) => L.forEach(t0 => {
      if (usato.has(s + '>' + t0)) return;
      const ring = []; let u = s, v = t0, guard = 0;
      while (!usato.has(u + '>' + v) && guard++ < 1e6) {
        usato.add(u + '>' + v); ring.push(P[u]);
        const Lv = adj.get(v), i = Lv.indexOf(u);
        const w = Lv[(i - 1 + Lv.length) % Lv.length];
        u = v; v = w;
      }
      if (ring.length >= 3) facce.push(ring);
    }));
    const pos = [], neg = [];
    facce.forEach(r => { const a = G.areaAnello(r); if (a > 1e-6) pos.push({ r, a }); else if (a < -1e-6) neg.push({ r, a: -a }); });
    // Le facce in senso orario sono il contorno esterno di un gruppo: dentro a un'altra particella diventano buchi
    const polys = pos.map(f => ({ P: [f.r], a: f.a, b: G.bboxPts(f.r) }));
    neg.forEach(h => {
      const q = h.r[0]; let best = null;
      // Punto di prova appena dentro la faccia esterna rispetto al lato
      const q2 = h.r[1], mx = (q[0] + q2[0]) / 2, my = (q[1] + q2[1]) / 2, nx = -(q2[1] - q[1]), ny = q2[0] - q[0], nl = Math.hypot(nx, ny) || 1;
      const tx = mx - nx / nl * tol * 2, ty = my - ny / nl * tol * 2;
      polys.forEach(p => { if (p.a > h.a + 1e-6 && G.inAnello(tx, ty, p.P[0]) && (!best || p.a < best.a)) best = p; });
      if (best) best.P.push(h.r);
    });
    return polys.map(p => p.P);
  };
})(ES);
