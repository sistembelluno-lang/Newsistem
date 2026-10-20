// Modello 3D semplificato dell'opera, ricostruito da Claude leggendo piante, sezioni e prospetti.
// Da qui si ricavano in automatico prospetti, sezioni, piante, assonometrie, quantità e i file 3D (OBJ, DXF 3D, visore HTML).
// Unità: metri. Elementi:
//   muro      {da:[x,y], a:[x,y], spessore, z0, altezza|z1, aperture:[{da, larghezza, davanzale, altezza}], materiale}
//   solaio    {contorno:[[x,y]…], quota (estradosso), spessore, materiale}
//   pilastro  {centro:[x,y], lati:[bx,by], z0, z1, materiale}
//   blocco    {contorno:[[x,y]…], z0, z1, materiale}   (fondazioni, scale, volumi, terreno…)
//   falda     {punti:[[x,y,z]…], spessore, materiale}  (coperture e piani inclinati)
const pc = require('polygon-clipping');

const COLORI = { muro: '#d9cbb3', solaio: '#b8b8b8', pilastro: '#a8a8a8', blocco: '#c9c2b0', falda: '#b5674d' };
const CAMPITURA = { cls: 'cls', calcestruzzo: 'cls', muratura: 'muratura', laterizio: 'muratura', terreno: 'terreno', isolante: 'isolante', legno: 'diagonale', acciaio: 'pieno' };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };
const area2 = (p) => p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0) / 2;
function normale(p) { // Newell: funziona anche con poligoni non convessi
  const n = [0, 0, 0];
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return norm(n);
}

// Ogni elemento diventa uno o più prismi verticali (contorno 2D tra z0 e z1) o falde.
function prismi(m) {
  const out = [];
  (m.elementi || []).forEach((e, i) => {
    const mat = e.materiale || (e.tipo === 'muro' ? 'muratura' : e.tipo === 'falda' ? 'legno' : 'cls');
    const base = { el: i, tipo: e.tipo, materiale: mat, colore: e.colore || COLORI[e.tipo] || '#ccc' };
    if (e.tipo === 'muro') {
      const z0 = e.z0 || 0, z1 = e.z1 ?? z0 + (e.altezza || 3);
      const d = [e.a[0] - e.da[0], e.a[1] - e.da[1]], L = Math.hypot(d[0], d[1]);
      if (!L) return;
      const u = [d[0] / L, d[1] / L], n = [-u[1] * (e.spessore || 0.3) / 2, u[0] * (e.spessore || 0.3) / 2];
      const tratto = (s0, s1, za, zb) => {
        if (s1 - s0 < 1e-6 || zb - za < 1e-6) return;
        const p = (s, k) => [e.da[0] + u[0] * s + n[0] * k, e.da[1] + u[1] * s + n[1] * k];
        out.push({ ...base, contorno: [p(s0, -1), p(s1, -1), p(s1, 1), p(s0, 1)], z0: za, z1: zb });
      };
      // le aperture dividono il muro in fasce verticali; in ogni fascia restano piene le altezze non occupate
      // da aperture (anche più aperture una sopra l'altra: finestre di piani diversi)
      const ap = (e.aperture || []).map((a) => ({ s0: Math.max(0, a.da), s1: Math.min(L, a.da + a.larghezza), za: z0 + (a.davanzale || 0), zb: z0 + (a.davanzale || 0) + a.altezza })).filter((a) => a.s1 > a.s0);
      const tagli = [...new Set([0, L, ...ap.flatMap((a) => [a.s0, a.s1])])].sort((a, b) => a - b);
      for (let i = 0; i + 1 < tagli.length; i++) {
        const sa = tagli[i], sb = tagli[i + 1];
        const vuoti = ap.filter((a) => a.s0 <= sa + 1e-9 && a.s1 >= sb - 1e-9).map((a) => [a.za, a.zb]).sort((a, b) => a[0] - b[0]);
        let z = z0;
        for (const [za, zb] of vuoti) { tratto(sa, sb, z, Math.min(za, z1)); z = Math.max(z, zb); }
        tratto(sa, sb, z, z1);
      }
    } else if (e.tipo === 'solaio') {
      out.push({ ...base, contorno: e.contorno, z0: e.quota - (e.spessore || 0.25), z1: e.quota });
    } else if (e.tipo === 'pilastro') {
      const [cx, cy] = e.centro, [bx, by] = e.lati || [0.3, 0.3];
      out.push({ ...base, contorno: [[cx - bx / 2, cy - by / 2], [cx + bx / 2, cy - by / 2], [cx + bx / 2, cy + by / 2], [cx - bx / 2, cy + by / 2]], z0: e.z0 || 0, z1: e.z1 ?? 3 });
    } else if (e.tipo === 'blocco') {
      out.push({ ...base, contorno: e.contorno, z0: e.z0 || 0, z1: e.z1 });
    } else if (e.tipo === 'falda') {
      out.push({ ...base, falda: e.punti, spessore: e.spessore || 0.25 });
    }
  });
  for (const p of out) if (p.contorno && area2(p.contorno) < 0) p.contorno = p.contorno.slice().reverse(); // base antioraria
  return out;
}

// Facce piane con normale uscente.
function facce(m) {
  const F = [];
  for (const p of prismi(m)) {
    const info = { el: p.el, tipo: p.tipo, colore: p.colore, materiale: p.materiale };
    if (p.contorno) {
      const c = p.contorno;
      F.push({ ...info, p: c.map(([x, y]) => [x, y, p.z1]) });
      F.push({ ...info, p: c.slice().reverse().map(([x, y]) => [x, y, p.z0]) });
      c.forEach((a, i) => { const b = c[(i + 1) % c.length]; F.push({ ...info, p: [[a[0], a[1], p.z0], [b[0], b[1], p.z0], [b[0], b[1], p.z1], [a[0], a[1], p.z1]] }); });
    } else {
      let top = p.falda;
      if (normale(top)[2] < 0) top = top.slice().reverse();
      const bot = top.map(([x, y, z]) => [x, y, z - p.spessore]);
      F.push({ ...info, p: top }, { ...info, p: bot.slice().reverse() });
      top.forEach((a, i) => { const j = (i + 1) % top.length; F.push({ ...info, p: [bot[i], bot[j], top[j], top[i]] }); });
    }
  }
  for (const f of F) f.n = normale(f.p);
  return F;
}

function estensione3d(F) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const f of F) for (const q of f.p) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]); }
  return { lo, hi };
}

// Taglio di un poligono 3D con il semispazio dot(x, d) >= c (Sutherland-Hodgman).
function oltre(p, d, c) {
  const out = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const da = dot(a, d) - c, db = dot(b, d) - c;
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])]); }
  }
  return out;
}

// Viste: direzione di vista d, vettore «destra» r e «alto» s del foglio.
function camera(vista, m) {
  const lati = { sud: [0, 1, 0], nord: [0, -1, 0], est: [-1, 0, 0], ovest: [1, 0, 0] };
  if (vista.tipo === 'pianta') return { d: [0, 0, -1], r: [1, 0, 0], s: [0, 1, 0], taglio: vista.quota ?? 1.2 };
  if (vista.tipo === 'sezione') {
    const [ax, ay] = vista.da, [bx, by] = vista.a;
    const e = norm([bx - ax, by - ay, 0]);
    // si guarda verso sinistra della linea da→a
    return { d: [-e[1], e[0], 0], r: e, s: [0, 0, 1], piano: vista.da };
  }
  if (vista.tipo === 'assonometria') {
    const d = norm(vista.direzione || [1, 1.3, -0.9]);
    const r = norm([d[1], -d[0], 0]);
    return { d, r, s: cross(r, d) };
  }
  const d = lati[vista.lato] || norm([...(vista.direzione || [0, 1]), 0].slice(0, 3));
  return { d, r: [d[1], -d[0], 0], s: [0, 0, 1] };
}

const progetta = (cam, q) => [dot(q, cam.r), dot(q, cam.s)];

// Sezione dei prismi con il piano di taglio: rettangoli (sezione verticale) o contorni (pianta).
function sezioni(m, cam, vista) {
  const out = [];
  for (const p of prismi(m)) {
    if (vista.tipo === 'pianta') {
      if (p.contorno && p.z0 < cam.taglio && p.z1 > cam.taglio) out.push({ ...p, poli: p.contorno.map(([x, y]) => progetta(cam, [x, y, 0])) });
      continue;
    }
    const o = [vista.da[0], vista.da[1], 0];
    const e = cam.r;
    if (p.contorno) {
      // intersezioni del contorno con la retta di sezione → intervalli lungo la retta
      const nrm = [-e[1], e[0]];
      const ts = [];
      const c = p.contorno;
      for (let i = 0; i < c.length; i++) {
        const a = c[i], b = c[(i + 1) % c.length];
        const da = (a[0] - o[0]) * nrm[0] + (a[1] - o[1]) * nrm[1], db = (b[0] - o[0]) * nrm[0] + (b[1] - o[1]) * nrm[1];
        if ((da > 0) !== (db > 0)) { const t = da / (da - db); ts.push((a[0] + t * (b[0] - a[0]) - o[0]) * e[0] + (a[1] + t * (b[1] - a[1]) - o[1]) * e[1]); }
      }
      ts.sort((x, y) => x - y);
      const u0 = dot(o, e);
      for (let i = 0; i + 1 < ts.length; i += 2) out.push({ ...p, poli: [[u0 + ts[i], p.z0], [u0 + ts[i + 1], p.z0], [u0 + ts[i + 1], p.z1], [u0 + ts[i], p.z1]] });
    } else {
      // falda: il taglio è una striscia inclinata
      const piano = dot(o, cam.d);
      const seg = [];
      const f = p.falda;
      for (let i = 0; i < f.length; i++) {
        const a = f[i], b = f[(i + 1) % f.length];
        const da = dot(a, cam.d) - piano, db = dot(b, cam.d) - piano;
        if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); seg.push(progetta(cam, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])])); }
      }
      if (seg.length >= 2) out.push({ ...p, poli: [seg[0], seg[1], [seg[1][0], seg[1][1] - p.spessore], [seg[0][0], seg[0][1] - p.spessore]] });
    }
  }
  return out;
}

function dentroPoli(poly, x, y) {
  let ok = false;
  for (const ring of poly) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ok = !ok;
  }
  return ok;
}

// Ordina i gruppi di facce dal più vicino al più lontano: dove due gruppi si sovrappongono sul foglio si confronta
// la profondità vera dei due piani in un punto comune; i casi senza sovrapposizione restano in ordine di profondità media.
function ordina(gruppi, cam) {
  const n = gruppi.length;
  for (const g of gruppi) {
    const pts = g.poly.flatMap((p) => p[0]);
    g.bb = [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
    const nd = dot(g.f.n, cam.d), c = dot(g.f.n, g.f.p[0]), nr = dot(g.f.n, cam.r), ns = dot(g.f.n, cam.s);
    g.prof = (u, v) => (c - nr * u - ns * v) / nd; // profondità del piano nel punto (u, v) del foglio
  }
  const davanti = Array.from({ length: n }, () => []), entra = new Array(n).fill(0);
  const S = 7;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = gruppi[i], b = gruppi[j];
    const x0 = Math.max(a.bb[0], b.bb[0]), y0 = Math.max(a.bb[1], b.bb[1]), x1 = Math.min(a.bb[2], b.bb[2]), y1 = Math.min(a.bb[3], b.bb[3]);
    if (x1 - x0 < 1e-6 || y1 - y0 < 1e-6) continue;
    let diff = 0;
    for (let ix = 0; ix < S && !diff; ix++) for (let iy = 0; iy < S && !diff; iy++) {
      const u = x0 + ((ix + 0.5) / S) * (x1 - x0), v = y0 + ((iy + 0.5) / S) * (y1 - y0);
      if (!a.poly.some((p) => dentroPoli(p, u, v)) || !b.poly.some((p) => dentroPoli(p, u, v))) continue;
      const d = a.prof(u, v) - b.prof(u, v);
      if (Math.abs(d) > 1e-6) diff = d;
    }
    if (diff < 0) { davanti[i].push(j); entra[j]++; } else if (diff > 0) { davanti[j].push(i); entra[i]++; }
  }
  // ordinamento topologico; nei cicli (facce che si intrecciano) vince la profondità media
  const fatto = new Array(n).fill(false), out = [];
  while (out.length < n) {
    let k = -1;
    for (let i = 0; i < n; i++) if (!fatto[i] && entra[i] === 0 && (k < 0 || gruppi[i].z < gruppi[k].z)) k = i;
    if (k < 0) for (let i = 0; i < n; i++) if (!fatto[i] && (k < 0 || gruppi[i].z < gruppi[k].z)) k = i;
    fatto[k] = true; out.push(gruppi[k]);
    for (const j of davanti[k]) entra[j]--;
  }
  return out;
}

// Vista con linee nascoste eliminate: le facce si proiettano dalla più vicina alla più lontana
// e di ognuna si tiene solo la parte non coperta da quelle già disegnate.
function vista2d(m, vista) {
  const F = facce(m);
  const cam = camera(vista, m);
  const tagliate = vista.tipo === 'sezione' || vista.tipo === 'pianta' ? sezioni(m, cam, vista) : [];
  let soglia = null;
  if (vista.tipo === 'sezione') soglia = dot([vista.da[0], vista.da[1], 0], cam.d);
  if (vista.tipo === 'pianta') soglia = -cam.taglio; // d = (0,0,-1): si tiene ciò che sta sotto il piano
  const vis = [];
  for (const f of F) {
    if (dot(f.n, cam.d) >= -1e-9) continue; // faccia girata dall'altra parte
    const p = soglia == null ? f.p : oltre(f.p, cam.d, soglia + 1e-7);
    if (p.length < 3) continue;
    const q = p.map((x) => progetta(cam, x));
    if (Math.abs(area2(q)) < 1e-8) continue;
    vis.push({ f, q, z: p.reduce((s, x) => s + dot(x, cam.d), 0) / p.length });
  }
  // facce sullo stesso piano (pezzi dello stesso muro, muri allineati) si uniscono: niente giunzioni finte
  const piani = new Map();
  for (const v of vis) {
    const k = [...v.f.n.map((x) => x.toFixed(3)), dot(v.f.n, v.f.p[0]).toFixed(3)].join('|');
    if (!piani.has(k)) piani.set(k, { f: v.f, q: [], z: 0, n: 0 });
    const g = piani.get(k);
    g.q.push(area2(v.q) < 0 ? v.q.slice().reverse() : v.q); g.z += v.z; g.n++;
  }
  const gruppi = ordina([...piani.values()].map((g) => ({ f: g.f, z: g.z / g.n, poly: g.q.length > 1 ? pc.union(...g.q.map((q) => [q])) : [[g.q[0]]] })), cam);
  // le parti tagliate dello stesso materiale si uniscono in un'unica campitura
  const perMat = {};
  for (const t of tagliate) (perMat[t.materiale] = perMat[t.materiale] || []).push([t.poli]);
  const tagliUniti = Object.entries(perMat).flatMap(([materiale, polys]) => pc.union(...polys).map((poly) => ({ materiale, poli: poly[0], buchi: poly.slice(1) })));
  let coperto = tagliate.length ? pc.union(...tagliate.map((t) => [t.poli])) : [];
  const linee = [], regioni = [];
  for (const g of gruppi) {
    let visibile;
    try { visibile = coperto.length ? pc.difference(g.poly, coperto) : g.poly; coperto = coperto.length ? pc.union(coperto, g.poly) : g.poly; } catch (e) { continue; }
    for (const poly of visibile) { regioni.push({ poly, f: g.f }); for (const ring of poly) linee.push({ p: ring, f: g.f, z: g.z }); }
  }
  return { linee, regioni, tagliate: tagliUniti, cam, vis };
}

// Entità per crea_tavola (unità di disegno = m) con terreno e quote di livello.
function entitaVista(m, vista) {
  const { linee, tagliate, cam } = vista2d(m, vista);
  const E = [];
  for (const t of tagliate) {
    E.push({ tipo: 'campitura', motivo: CAMPITURA[t.materiale] || 'diagonale', layer: 'CAMPITURE', punti: t.poli, contorno: false });
    for (const anello of [t.poli, ...t.buchi]) E.push({ tipo: 'polilinea', layer: 'SEZIONE', chiusa: true, spessore_mm: 0.5, punti: anello });
  }
  for (const l of linee) E.push({ tipo: 'polilinea', layer: vista.tipo === 'assonometria' ? 'ASSONOMETRIA' : 'VISTA', chiusa: true, spessore_mm: 0.25, punti: l.p });
  const tutti = [...linee.map((l) => l.p), ...tagliate.map((t) => t.poli)].flat();
  if (!tutti.length) return E;
  const xs = tutti.map((q) => q[0]), ys = tutti.map((q) => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (vista.tipo === 'prospetto' || vista.tipo === 'sezione') {
    const quota0 = vista.quota_terreno ?? 0;
    E.push({ tipo: 'linea', layer: 'TERRENO', spessore_mm: 0.5, punti: [[x0 - 1.5, quota0], [x1 + 1.5, quota0]] });
    // quote di livello: estradossi dei solai, piano terra e colmo
    const livelli = new Set([quota0, +y1.toFixed(2)]);
    (m.elementi || []).filter((e) => e.tipo === 'solaio').forEach((e) => livelli.add(+e.quota.toFixed(2)));
    const xq = x0 - 1.2;
    for (const z of [...livelli].sort((a, b) => a - b)) {
      E.push({ tipo: 'polilinea', layer: 'QUOTE', chiusa: true, punti: [[xq, z], [xq - 0.18, z + 0.25], [xq + 0.18, z + 0.25]] });
      E.push({ tipo: 'linea', layer: 'QUOTE', punti: [[xq - 0.6, z], [xq + 0.3, z]] });
      E.push({ tipo: 'testo', layer: 'QUOTE', pos: [xq - 0.6, z + 0.12], testo: (z >= 0 ? '+' : '') + z.toFixed(2).replace('.', ','), altezza_mm: 2.5, allinea: 'destra' });
    }
    E.push({ tipo: 'quota', layer: 'QUOTE', da: [x0, y0], a: [x1, y0], offset: -1.2 });
  }
  if (vista.tipo === 'pianta') {
    E.push({ tipo: 'quota', layer: 'QUOTE', da: [x0, y0], a: [x1, y0], offset: -1.2 });
    E.push({ tipo: 'quota', layer: 'QUOTE', da: [x1, y0], a: [x1, y1], offset: -1.2 });
  }
  return E;
}

// Quantità per computi: volumi per materiale e tipo, superfici dei solai, lunghezze dei muri.
function quantita(m) {
  const per = {};
  const add = (k, campo, v) => { per[k] = per[k] || { volume_m3: 0, superficie_m2: 0, lunghezza_m: 0, n: 0 }; per[k][campo] += v; };
  for (const p of prismi(m)) {
    const k = `${p.tipo} – ${p.materiale}`;
    if (p.contorno) { const A = Math.abs(area2(p.contorno)); add(k, 'volume_m3', A * (p.z1 - p.z0)); if (p.tipo === 'solaio') add(k, 'superficie_m2', A); }
    else { const n = normale(p.falda); const proj = Math.abs(area2(p.falda.map((q) => [q[0], q[1]]))); const A = proj / Math.max(Math.abs(n[2]), 1e-6); add(k, 'superficie_m2', A); add(k, 'volume_m3', A * p.spessore); }
  }
  (m.elementi || []).forEach((e) => { if (e.tipo === 'muro') add(`muro – ${e.materiale || 'muratura'}`, 'lunghezza_m', Math.hypot(e.a[0] - e.da[0], e.a[1] - e.da[1])); add(`${e.tipo} – ${e.materiale || (e.tipo === 'muro' ? 'muratura' : e.tipo === 'falda' ? 'legno' : 'cls')}`, 'n', 1); });
  return Object.entries(per).map(([voce, q]) => ({ voce, ...Object.fromEntries(Object.entries(q).map(([k, v]) => [k, +v.toFixed(3)])) }));
}

// ---------- Esportazioni ----------

function obj(m) {
  const F = facce(m);
  const righe = [`# ${m.nome || 'Modello'} – TRITAPROJECT (unità: metri, asse Z verso l'alto)`];
  let n = 1;
  for (const f of F) {
    righe.push(`g ${f.tipo}_${f.el}`);
    for (const q of f.p) righe.push(`v ${q[0].toFixed(4)} ${q[1].toFixed(4)} ${q[2].toFixed(4)}`);
    righe.push('f ' + f.p.map((_, i) => n + i).join(' '));
    n += f.p.length;
  }
  return righe.join('\n') + '\n';
}

// Triangolazione «ear clipping» sul piano dominante della faccia (per le 3DFACE del DXF).
function triangoli(p) {
  if (p.length <= 4) return [p];
  const n = normale(p), k = n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs)));
  const P = p.map((q) => (k === 0 ? [q[1], q[2]] : k === 1 ? [q[2], q[0]] : [q[0], q[1]]));
  let idx = P.map((_, i) => i);
  if (area2(P) < 0) idx.reverse();
  const out = [];
  const dentro = (a, b, c, q) => { const s = (u, v, w) => (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]); return s(a, b, q) >= 0 && s(b, c, q) >= 0 && s(c, a, q) >= 0; };
  let guardia = 0;
  while (idx.length > 3 && guardia++ < 10000) {
    let fatto = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      const a = P[ia], b = P[ib], c = P[ic];
      if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) <= 0) continue;
      if (idx.some((j) => j !== ia && j !== ib && j !== ic && dentro(a, b, c, P[j]))) continue;
      out.push([p[ia], p[ib], p[ic]]); idx.splice(i, 1); fatto = true; break;
    }
    if (!fatto) break;
  }
  if (idx.length === 3) out.push(idx.map((i) => p[i]));
  return out;
}

function dxf3d(m) {
  const L = [];
  const g = (c, v) => L.push(String(c), String(v));
  const f = (v) => (+v).toFixed(5).replace(/\.?0+$/, '') || '0';
  const colore = { muro: 8, solaio: 9, pilastro: 250, blocco: 30, falda: 1 };
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$INSUNITS'); g(70, 6); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES'); g(0, 'TABLE'); g(2, 'LAYER'); g(70, 6);
  for (const n of ['0', 'MURI', 'SOLAI', 'PILASTRI', 'BLOCCHI', 'COPERTURE']) { g(0, 'LAYER'); g(2, n); g(70, 0); g(62, { MURI: 8, SOLAI: 9, PILASTRI: 250, BLOCCHI: 30, COPERTURE: 1 }[n] || 7); g(6, 'CONTINUOUS'); }
  g(0, 'ENDTAB'); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');
  const layer = { muro: 'MURI', solaio: 'SOLAI', pilastro: 'PILASTRI', blocco: 'BLOCCHI', falda: 'COPERTURE' };
  for (const fa of facce(m)) {
    for (const t of triangoli(fa.p)) {
      const q = t.length === 3 ? [...t, t[2]] : t;
      g(0, '3DFACE'); g(8, layer[fa.tipo] || '0'); g(62, colore[fa.tipo] || 7);
      q.forEach((v, i) => { g(10 + i, f(v[0])); g(20 + i, f(v[1])); g(30 + i, f(v[2])); });
    }
  }
  g(0, 'ENDSEC'); g(0, 'EOF');
  return L.join('\r\n') + '\r\n';
}

// Assonometria ombreggiata in SVG (anteprime e immagini per le relazioni), con le parti nascoste tolte esattamente.
function svgAssonometria(m, { larghezza = 1600, direzione } = {}) {
  const { regioni } = vista2d(m, { tipo: 'assonometria', direzione });
  const luce = norm([-0.4, -0.7, 0.9]);
  const pts = regioni.flatMap((r) => r.poly.flat());
  if (!pts.length) return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>';
  const x0 = Math.min(...pts.map((p) => p[0])), x1 = Math.max(...pts.map((p) => p[0])), y0 = Math.min(...pts.map((p) => p[1])), y1 = Math.max(...pts.map((p) => p[1]));
  const k = (larghezza * 0.9) / Math.max(x1 - x0, 1e-6);
  const W = larghezza, H = Math.round((y1 - y0) * k + larghezza * 0.1);
  const X = (x) => ((x - x0) * k + larghezza * 0.05).toFixed(1), Y = (y) => ((y1 - y) * k + larghezza * 0.05).toFixed(1);
  const tinta = (hex, l) => { const n = parseInt(hex.slice(1), 16); return '#' + [16, 8, 0].map((s) => Math.round(((n >> s) & 255) * (0.55 + 0.45 * l)).toString(16).padStart(2, '0')).join(''); };
  const forme = regioni.map((r) => `<path fill-rule="evenodd" d="${r.poly.map((ring) => 'M' + ring.map((p) => `${X(p[0])},${Y(p[1])}`).join('L') + 'Z').join('')}" fill="${tinta(r.f.colore, Math.max(0, dot(r.f.n, luce)))}" stroke="#333" stroke-width="0.8" stroke-linejoin="round"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${forme}</svg>`;
}

// Visore 3D autonomo (un solo file HTML, WebGL, si apre in qualsiasi browser):
// ruota trascinando, zoom con la rotellina, sposta con il tasto destro, strati accendibili.
function htmlVisore(m) {
  const F = facce(m);
  const luce = norm([-0.4, -0.7, 0.9]);
  // spigoli: si tolgono quelli fra due facce complanari (giunzioni fra pezzi dello stesso muro)
  const chiave = (a) => a.map((v) => v.toFixed(3)).join(',');
  const spigoli = new Map();
  F.forEach((f, fi) => f.p.forEach((a, i) => {
    const b = f.p[(i + 1) % f.p.length];
    const k = [chiave(a), chiave(b)].sort().join('|');
    if (!spigoli.has(k)) spigoli.set(k, { a, b, n: [], t: f.tipo });
    spigoli.get(k).n.push(f.n);
  }));
  const tipi = [...new Set(F.map((f) => f.tipo))];
  const dati = tipi.map((t) => {
    const tri = [], col = [], lin = [];
    for (const f of F.filter((x) => x.tipo === t)) {
      const l = 0.55 + 0.45 * Math.max(0, dot(f.n, luce));
      const n = parseInt(f.colore.slice(1), 16), c = [16, 8, 0].map((s) => +((((n >> s) & 255) / 255) * l).toFixed(3));
      for (const tr of triangoli(f.p)) for (const q of (tr.length === 4 ? [tr[0], tr[1], tr[2], tr[0], tr[2], tr[3]] : tr)) { tri.push(...q.map((v) => +v.toFixed(3))); col.push(...c); }
    }
    for (const s of spigoli.values()) {
      if (s.t !== t) continue;
      if (s.n.length === 2 && dot(s.n[0], s.n[1]) > 0.999) continue;
      lin.push(...s.a.map((v) => +v.toFixed(3)), ...s.b.map((v) => +v.toFixed(3)));
    }
    return { t, tri, col, lin };
  });
  const titolo = String(m.nome || 'Modello 3D').replace(/[<>&]/g, '');
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${titolo} – TRITAPROJECT</title>
<style>html,body{margin:0;height:100%;background:#eef1f5;font:13px Arial,sans-serif;overflow:hidden}canvas{display:block;width:100%;height:100%;cursor:grab}
.p{position:fixed;top:10px;background:#fffd;padding:6px 10px;border-radius:6px}#info{left:12px}#info b{font-size:15px}#strati{right:12px}</style></head><body>
<div id="info" class="p"><b>${titolo}</b><br>Trascina per ruotare · rotellina per lo zoom · tasto destro per spostare · doppio clic per ricentrare</div>
<div id="strati" class="p"></div><canvas id="c"></canvas>
<script>
const D=${JSON.stringify(dati)};
const c=document.getElementById('c'),gl=c.getContext('webgl',{antialias:true});
const sh=(t,s)=>{const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);return o};
const pr=gl.createProgram();
gl.attachShader(pr,sh(gl.VERTEX_SHADER,'attribute vec3 p;attribute vec3 c;uniform mat4 m;varying vec3 v;void main(){gl_Position=m*vec4(p,1.);v=c;}'));
gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,'precision mediump float;varying vec3 v;uniform float k;void main(){gl_FragColor=vec4(v*k,1.);}'));
gl.linkProgram(pr);gl.useProgram(pr);
const ap=gl.getAttribLocation(pr,'p'),ac=gl.getAttribLocation(pr,'c'),um=gl.getUniformLocation(pr,'m'),uk=gl.getUniformLocation(pr,'k');
const buf=a=>{const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(a),gl.STATIC_DRAW);return b};
const nero=n=>new Array(n).fill(0.15);
D.forEach(d=>{d.bt=buf(d.tri);d.bc=buf(d.col);d.bl=buf(d.lin);d.blc=buf(nero(d.lin.length));d.on=true});
document.getElementById('strati').innerHTML=D.map((d,i)=>'<label><input type="checkbox" checked data-i="'+i+'"> '+d.t+'</label>').join('<br>');
document.getElementById('strati').onchange=e=>{D[e.target.dataset.i].on=e.target.checked;draw()};
let lo=[1e9,1e9,1e9],hi=[-1e9,-1e9,-1e9];D.forEach(d=>{for(let i=0;i<d.tri.length;i+=3)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],d.tri[i+k]);hi[k]=Math.max(hi[k],d.tri[i+k])}});
const ctr=lo.map((v,k)=>(v+hi[k])/2),R=Math.hypot(hi[0]-lo[0],hi[1]-lo[1],hi[2]-lo[2])/2||1;
let az=-0.7,el=0.55,zoom=1,pan=[0,0];
function mat(W,H){const ca=Math.cos(az),sa=Math.sin(az),ce=Math.cos(el),se=Math.sin(el);
const d=[ce*sa,ce*ca,-se],r=[ca,-sa,0],u=[r[1]*d[2]-r[2]*d[1],r[2]*d[0]-r[0]*d[2],r[0]*d[1]-r[1]*d[0]];
const s=zoom/(1.15*R),ax=s*Math.min(1,H/W),ay=s*Math.min(1,W/H),z=1/(3*R);
const t=v=>-(v[0]*ctr[0]+v[1]*ctr[1]+v[2]*ctr[2]);
return [r[0]*ax,u[0]*ay,d[0]*z,0, r[1]*ax,u[1]*ay,d[1]*z,0, r[2]*ax,u[2]*ay,d[2]*z,0, t(r)*ax+pan[0],t(u)*ay+pan[1],t(d)*z,1]}
function draw(){const W=c.width=innerWidth*devicePixelRatio,H=c.height=innerHeight*devicePixelRatio;gl.viewport(0,0,W,H);
gl.clearColor(.933,.945,.961,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);
gl.uniformMatrix4fv(um,false,mat(W,H));
const giro=(b,cb,n,modo)=>{gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.enableVertexAttribArray(ap);gl.vertexAttribPointer(ap,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,cb);gl.enableVertexAttribArray(ac);gl.vertexAttribPointer(ac,3,gl.FLOAT,false,0,0);gl.drawArrays(modo,0,n)};
gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1,1);gl.uniform1f(uk,1);
D.forEach(d=>d.on&&giro(d.bt,d.bc,d.tri.length/3,gl.TRIANGLES));
D.forEach(d=>d.on&&giro(d.bl,d.blc,d.lin.length/3,gl.LINES))}
let drag=null;c.onmousedown=e=>{drag={x:e.clientX,y:e.clientY,b:e.button,az,el,pan:pan.slice()};c.style.cursor='grabbing'};
onmouseup=()=>{drag=null;c.style.cursor='grab'};c.oncontextmenu=e=>e.preventDefault();
onmousemove=e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
if(drag.b===2)pan=[drag.pan[0]+2*dx/innerWidth,drag.pan[1]-2*dy/innerHeight];else{az=drag.az+dx*0.008;el=Math.max(-1.5,Math.min(1.5,drag.el+dy*0.008))}draw()};
c.onwheel=e=>{e.preventDefault();zoom*=e.deltaY<0?1.12:1/1.12;draw()};c.ondblclick=()=>{zoom=1;pan=[0,0];draw()};onresize=draw;draw();
</script></body></html>`;
}

// Controllo dei dati del modello: elenco dei problemi (vuoto se va bene).
function controlla(m) {
  const err = [];
  const pt = (p, n = 2) => Array.isArray(p) && p.length >= n && p.slice(0, n).every((v) => typeof v === 'number' && Number.isFinite(v));
  if (!m || !Array.isArray(m.elementi) || !m.elementi.length) return ['«elementi» deve essere un elenco non vuoto'];
  m.elementi.forEach((e, i) => {
    const k = `elementi[${i}] (${e && e.tipo})`;
    if (!e) return err.push(`${k}: vuoto`);
    if (e.tipo === 'muro') { if (!pt(e.da) || !pt(e.a)) err.push(`${k}: servono da e a [x,y]`); }
    else if (e.tipo === 'solaio') { if (!Array.isArray(e.contorno) || e.contorno.length < 3 || !e.contorno.every((p) => pt(p)) || typeof e.quota !== 'number') err.push(`${k}: servono contorno (≥3 punti) e quota`); }
    else if (e.tipo === 'pilastro') { if (!pt(e.centro)) err.push(`${k}: serve centro [x,y]`); }
    else if (e.tipo === 'blocco') { if (!Array.isArray(e.contorno) || e.contorno.length < 3 || !e.contorno.every((p) => pt(p)) || typeof e.z1 !== 'number') err.push(`${k}: servono contorno (≥3 punti), z0 e z1`); }
    else if (e.tipo === 'falda') { if (!Array.isArray(e.punti) || e.punti.length < 3 || !e.punti.every((p) => pt(p, 3))) err.push(`${k}: servono almeno 3 punti [x,y,z]`); }
    else err.push(`${k}: tipo sconosciuto (ammessi: muro, solaio, pilastro, blocco, falda)`);
  });
  return err;
}

module.exports = { prismi, facce, estensione3d, vista2d, entitaVista, quantita, obj, dxf3d, svgAssonometria, htmlVisore, controlla, triangoli };
