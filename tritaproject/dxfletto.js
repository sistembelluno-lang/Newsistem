// Lettura dei DXF caricati nel progetto (qualsiasi versione, da AutoCAD, BricsCAD, Revit, ArchiCAD…):
// tutto diventa entità semplici (polilinee e testi) in coordinate reali, con layer e colori.
// I blocchi e le quote vengono esplosi; archi, ellissi e spline diventano spezzate fitte.
const DxfParser = require('dxf-parser');

const UNITA = { 1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm', 14: 'dm' };
const SEG = 48; // segmenti per un cerchio intero

function leggi(testo) {
  const d = new DxfParser().parseSync(testo);
  const layer = (d.tables && d.tables.layer && d.tables.layer.layers) || {};
  const blocchi = d.blocks || {};
  const linee = [], testi = [];
  const hex = (n) => { const h = '#' + (n >>> 0 & 0xffffff).toString(16).padStart(6, '0'); return h === '#ffffff' ? '#000000' : h; };
  const colore = (e, padre) => {
    if (e.color != null && e.colorIndex !== 256 && e.colorIndex !== 0) return hex(e.color);
    const l = layer[e.layer] || layer[padre && padre.layer];
    return l && l.color != null ? hex(l.color) : '#000000';
  };

  // trasformazione affine 2D [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f
  const mul = (m, q) => [m[0] * q[0] + m[2] * q[1], m[1] * q[0] + m[3] * q[1], m[0] * q[2] + m[2] * q[3], m[1] * q[2] + m[3] * q[3], m[0] * q[4] + m[2] * q[5] + m[4], m[1] * q[4] + m[3] * q[5] + m[5]];
  const ap = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const scalaDi = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
  const rotDi = (m) => (Math.atan2(m[1], m[0]) * 180) / Math.PI;

  const arco = (cx, cy, r, a0, a1) => {
    let da = a1 - a0;
    while (da <= 0) da += 2 * Math.PI;
    const n = Math.max(4, Math.ceil((SEG * da) / (2 * Math.PI)));
    const p = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (da * i) / n; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return p;
  };
  // vertici con «bulge» (archi nelle polilinee)
  const conBulge = (v, chiusa) => {
    const p = [];
    const n = v.length;
    for (let i = 0; i < n; i++) {
      const a = v[i], b = v[(i + 1) % n];
      p.push([a.x, a.y]);
      if ((i < n - 1 || chiusa) && a.bulge) {
        const th = 4 * Math.atan(a.bulge), dx = b.x - a.x, dy = b.y - a.y, c = Math.hypot(dx, dy);
        if (c > 0) {
          const r = c / (2 * Math.sin(th / 2));
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, h = r * Math.cos(th / 2);
          const cx = mx - (h * dy) / c, cy = my + (h * dx) / c;
          const a0 = Math.atan2(a.y - cy, a.x - cx);
          const k = Math.max(2, Math.ceil((SEG * Math.abs(th)) / (2 * Math.PI)));
          for (let j = 1; j < k; j++) { const t = a0 + (th * j) / k; p.push([cx + Math.abs(r) * Math.cos(t), cy + Math.abs(r) * Math.sin(t)]); }
        }
      }
    }
    if (chiusa && n) p.push([v[0].x, v[0].y]);
    return p;
  };
  // spline: per punti di passaggio (Catmull-Rom) o B-spline dai punti di controllo (de Boor)
  const spline = (e) => {
    if (e.controlPoints && e.controlPoints.length && e.knotValues && e.knotValues.length) {
      const P = e.controlPoints, U = e.knotValues, k = e.degreeOfSplineCurve || 3, out = [];
      const t0 = U[k], t1 = U[U.length - k - 1], N = Math.max(16, P.length * 8);
      for (let s = 0; s <= N; s++) {
        const t = Math.min(t0 + ((t1 - t0) * s) / N, t1 - 1e-9);
        let i = k; while (i < U.length - k - 2 && t >= U[i + 1]) i++;
        const d = []; for (let j = 0; j <= k; j++) { const q = P[Math.min(Math.max(i - k + j, 0), P.length - 1)]; d.push([q.x, q.y]); }
        for (let r = 1; r <= k; r++) for (let j = k; j >= r; j--) {
          const ii = i - k + j, den = U[ii + k - r + 1] - U[ii];
          const a = den ? (t - U[ii]) / den : 0;
          d[j] = [(1 - a) * d[j - 1][0] + a * d[j][0], (1 - a) * d[j - 1][1] + a * d[j][1]];
        }
        out.push(d[k]);
      }
      return out;
    }
    const F = (e.fitPoints && e.fitPoints.length ? e.fitPoints : e.controlPoints || []).map((q) => [q.x, q.y]);
    if (F.length < 3) return F;
    const out = [];
    for (let i = 0; i < F.length - 1; i++) {
      const p0 = F[Math.max(0, i - 1)], p1 = F[i], p2 = F[i + 1], p3 = F[Math.min(F.length - 1, i + 2)];
      for (let s = 0; s < 8; s++) {
        const t = s / 8, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
      }
    }
    out.push(F[F.length - 1]);
    return out;
  };
  const pulisciMtext = (s) => String(s || '').replace(/\\P/g, '\n').replace(/\\[ACcFfHhQTWp][^;]*;/g, '').replace(/\\[LlOoKk]/g, '').replace(/[{}]/g, '').replace(/\\U\+([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±');

  const aggiungi = (pts, e, m, padre) => {
    if (pts.length < 2) return;
    const p = [];
    for (const [x, y] of pts) { const q = ap(m, x, y); p.push(q[0], q[1]); }
    linee.push({ p, l: (e.layer === '0' && padre ? padre.layer : e.layer) || '0', c: colore(e, padre) });
  };
  const visita = (ents, m, padre, prof) => {
    for (const e of ents || []) {
      try {
        const lay = layer[e.layer];
        if (lay && (lay.frozen || lay.visible === false)) continue;
        switch (e.type) {
          case 'LINE': aggiungi(e.vertices.map((v) => [v.x, v.y]), e, m, padre); break;
          case 'LWPOLYLINE': case 'POLYLINE': aggiungi(conBulge(e.vertices || [], !!e.shape), e, m, padre); break;
          case 'CIRCLE': aggiungi(arco(e.center.x, e.center.y, e.radius, 0, 2 * Math.PI), e, m, padre); break;
          case 'ARC': aggiungi(arco(e.center.x, e.center.y, e.radius, e.startAngle, e.endAngle), e, m, padre); break;
          case 'ELLIPSE': {
            const { center: c, majorAxisEndPoint: a } = e;
            const R = Math.hypot(a.x, a.y), r = R * e.axisRatio, rot = Math.atan2(a.y, a.x);
            const pts = arco(0, 0, 1, e.startAngle || 0, e.endAngle || 2 * Math.PI).map(([x, y]) => [c.x + R * x * Math.cos(rot) - r * y * Math.sin(rot), c.y + R * x * Math.sin(rot) + r * y * Math.cos(rot)]);
            aggiungi(pts, e, m, padre); break;
          }
          case 'SPLINE': aggiungi(spline(e), e, m, padre); break;
          case 'SOLID': case '3DFACE': case 'TRACE': {
            const v = e.points || e.vertices || [];
            const pts = v.length === 4 && e.type !== '3DFACE' ? [v[0], v[1], v[3], v[2]] : v; // SOLID: vertici 3 e 4 invertiti
            aggiungi([...pts, pts[0]].filter(Boolean).map((q) => [q.x, q.y]), e, m, padre); break;
          }
          case 'TEXT': case 'ATTRIB': {
            const pos = e.halign || e.valign ? e.endPoint || e.startPoint : e.startPoint;
            if (!pos || !e.text) break;
            const q = ap(m, pos.x, pos.y);
            testi.push({ s: pulisciMtext(e.text), x: q[0], y: q[1], h: (e.textHeight || 1) * scalaDi(m), r: (e.rotation || 0) + rotDi(m), l: (e.layer === '0' && padre ? padre.layer : e.layer) || '0' });
            break;
          }
          case 'MTEXT': {
            if (!e.position || !e.text) break;
            const q = ap(m, e.position.x, e.position.y);
            const righe = pulisciMtext(e.text).split('\n');
            const h = (e.height || 1) * scalaDi(m);
            righe.forEach((s, i) => { if (s.trim()) testi.push({ s, x: q[0], y: q[1] - h - i * h * 1.6, h, r: (e.rotation || 0) + rotDi(m), l: (e.layer === '0' && padre ? padre.layer : e.layer) || '0' }); });
            break;
          }
          case 'INSERT': case 'DIMENSION': {
            const nome = e.type === 'INSERT' ? e.name : e.block;
            const b = blocchi[nome];
            if (!b || prof > 8) break;
            let t = m;
            if (e.type === 'INSERT') {
              const a = ((e.rotation || 0) * Math.PI) / 180, sx = e.xScale ?? 1, sy = e.yScale ?? 1;
              const base = b.position || { x: 0, y: 0 };
              const cols = Math.max(1, e.columnCount || 1), rows = Math.max(1, e.rowCount || 1);
              for (let ci = 0; ci < cols; ci++) for (let ri = 0; ri < rows; ri++) {
                const ox = e.position.x + ci * (e.columnSpacing || 0), oy = e.position.y + ri * (e.rowSpacing || 0);
                t = mul(m, [Math.cos(a) * sx, Math.sin(a) * sx, -Math.sin(a) * sy, Math.cos(a) * sy, ox, oy]);
                t = mul(t, [1, 0, 0, 1, -base.x, -base.y]);
                visita(b.entities, t, e, prof + 1);
              }
            } else visita(b.entities, t, e, prof + 1);
            break;
          }
          default: break;
        }
      } catch (err) { /* entità malformata: si salta */ }
    }
  };
  visita(d.entities, [1, 0, 0, 1, 0, 0], null, 0);

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of linee) for (let i = 0; i < l.p.length; i += 2) { x0 = Math.min(x0, l.p[i]); x1 = Math.max(x1, l.p[i]); y0 = Math.min(y0, l.p[i + 1]); y1 = Math.max(y1, l.p[i + 1]); }
  for (const t of testi) { x0 = Math.min(x0, t.x); x1 = Math.max(x1, t.x); y0 = Math.min(y0, t.y); y1 = Math.max(y1, t.y); }
  if (!Number.isFinite(x0)) [x0, y0, x1, y1] = [0, 0, 1, 1];
  const usati = [...new Set([...linee.map((l) => l.l), ...testi.map((t) => t.l)])];
  return { linee, testi, estensione: [x0, y0, x1, y1], unita: UNITA[d.header && d.header.$INSUNITS] || '', versione: (d.header && d.header.$ACADVER) || '', layer: usati, blocchi: Object.keys(blocchi).filter((b) => !b.startsWith('*')).length };
}

// Ritaglio a una zona in frazioni dell'ingombro (0 = sinistra/alto, 1 = destra/basso, come per i PDF).
function zona(v, z) {
  if (!z) return v;
  const [x0, y0, x1, y1] = v.estensione, W = x1 - x0, H = y1 - y0;
  const zx0 = x0 + Math.min(z.x0, z.x1) * W, zx1 = x0 + Math.max(z.x0, z.x1) * W, zy1 = y1 - Math.min(z.y0, z.y1) * H, zy0 = y1 - Math.max(z.y0, z.y1) * H;
  const dentro = (x, y) => x >= zx0 && x <= zx1 && y >= zy0 && y <= zy1;
  const linee = v.linee.filter((l) => { for (let i = 0; i < l.p.length; i += 2) if (dentro(l.p[i], l.p[i + 1])) return true; return false; });
  return { ...v, linee, testi: v.testi.filter((t) => dentro(t.x, t.y)), estensione: [zx0, zy0, zx1, zy1] };
}

// Entità di tavola (stesse unità del DXF) per anteprime, ristampe in scala e modifiche.
function entita(v, aciVicino) {
  const E = v.linee.map((l) => {
    const punti = [];
    for (let i = 0; i + 1 < l.p.length; i += 2) punti.push([l.p[i], l.p[i + 1]]);
    return { tipo: 'polilinea', punti, layer: l.l, colore: aciVicino(l.c), spessore_mm: 0.18 };
  });
  for (const t of v.testi) E.push({ tipo: 'testo', pos: [t.x, t.y], testo: t.s, altezza: t.h, rotazione: t.r || 0, layer: t.l });
  return E;
}

function riepilogo(v, nomeFile) {
  const [x0, y0, x1, y1] = v.estensione;
  const u = v.unita || 'unità di disegno';
  const testi = [...new Set(v.testi.map((t) => t.s.trim()).filter(Boolean))];
  return `DXF ${nomeFile}${v.versione ? ` (${v.versione})` : ''}: ${v.linee.length} linee/curve, ${v.testi.length} testi, ${v.blocchi} blocchi (esplosi).
Unità: ${u}. Ingombro: ${(x1 - x0).toFixed(2)} × ${(y1 - y0).toFixed(2)} ${u}, da [${x0.toFixed(2)}, ${y0.toFixed(2)}] a [${x1.toFixed(2)}, ${y1.toFixed(2)}].
Layer (${v.layer.length}): ${v.layer.slice(0, 80).join(', ')}${v.layer.length > 80 ? '…' : ''}
Testi presenti (${testi.length}): ${testi.slice(0, 400).join(' | ')}${testi.length > 400 ? ' …' : ''}`;
}

module.exports = { leggi, zona, entita, riepilogo };
