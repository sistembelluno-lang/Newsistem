// Elaborati generati da TRITAPROJECT: tavole (DXF + SVG/PDF), relazioni (HTML), schemi (SVG), tabelle (CSV),
// conversione dei vettori di una tavola PDF in DXF. Qui solo funzioni pure, senza Electron: la stampa la fa main.js.

const FOGLI = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594], A0: [1189, 841] }; // mm, orizzontale
const SCALE = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];
const MM = { mm: 1, cm: 10, m: 1000 }; // millimetri per unità di disegno
const INSUNITS = { mm: 4, cm: 5, m: 6 };
const PT_MM = 25.4 / 72;
// Colori AutoCAD (ACI) più comuni, per layer e anteprima
const ACI = { 1: '#e00000', 2: '#c8b400', 3: '#00a000', 4: '#00a0c0', 5: '#0030e0', 6: '#c000c0', 7: '#000000', 8: '#808080', 9: '#b0b0b0', 30: '#ff7f00', 140: '#0080c0', 250: '#333333' };
// Tipi di linea: trattini sulla carta in mm (positivo = tratto, negativo = vuoto)
const LINEE = { tratteggiata: { dxf: 'DASHED', mm: [4, -2] }, nascosta: { dxf: 'HIDDEN', mm: [2, -1.2] }, asse: { dxf: 'CENTER', mm: [10, -2, 2, -2] } };
// Campiture: angolo e passo sulla carta (mm); «pieno» è un riempimento
const CAMPITURE = { cls: [[45, 1.6]], diagonale: [[45, 2.5]], incrociata: [[45, 3], [135, 3]], terreno: [[45, 4], [135, 8]], muratura: [[45, 1.2]], isolante: [[0, 1.5]], pieno: [[45, 0.35]] };

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const pt = (p) => Array.isArray(p) && p.length >= 2 && num(p[0]) && num(p[1]);
const r3 = (v) => +v.toFixed(3);

function nomeFile(s, est) {
  const base = String(s || 'elaborato').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[^\w\- àèéìòùÀÈÉÌÒÙ]+/g, '_').trim().slice(0, 80) || 'elaborato';
  return est ? `${base}.${est}` : base;
}

// ---------- Tavole ----------

// Una tavola ha una o più viste (pianta, sezioni, dettagli), ognuna con la sua scala.
function viste(t) {
  if (Array.isArray(t.viste) && t.viste.length) return t.viste.map((v) => ({ titolo: v.titolo || '', scala: v.scala, entita: v.entita || [] }));
  return [{ titolo: t.titolo_vista || '', scala: t.scala, entita: t.entita || [] }];
}

// Controlla le entità e restituisce l'elenco dei problemi (vuoto se va tutto bene).
function controllaTavola(t) {
  const err = [];
  if (!t || (!Array.isArray(t.entita) && !Array.isArray(t.viste))) return ['servono «entita» (una vista) oppure «viste» (più viste, ognuna con le sue entita)'];
  viste(t).forEach((v, iv) => {
    const pre = Array.isArray(t.viste) ? `viste[${iv}].` : '';
    if (!v.entita.length) err.push(`${pre}entita è vuoto`);
    v.entita.forEach((e, i) => {
      const k = `${pre}entita[${i}] (${e && e.tipo})`;
      switch (e && e.tipo) {
        case 'linea': case 'polilinea':
          if (!Array.isArray(e.punti) || e.punti.length < 2 || !e.punti.every(pt)) err.push(`${k}: servono almeno 2 punti [x,y]`);
          break;
        case 'campitura':
          if (!Array.isArray(e.punti) || e.punti.length < 3 || !e.punti.every(pt)) err.push(`${k}: serve un contorno di almeno 3 punti`);
          else if (e.motivo && !CAMPITURE[e.motivo]) err.push(`${k}: motivo sconosciuto (ammessi: ${Object.keys(CAMPITURE).join(', ')})`);
          break;
        case 'cerchio':
          if (!pt(e.centro) || !num(e.raggio) || e.raggio <= 0) err.push(`${k}: servono centro [x,y] e raggio > 0`);
          break;
        case 'arco':
          if (!pt(e.centro) || !num(e.raggio) || !num(e.inizio) || !num(e.fine)) err.push(`${k}: servono centro, raggio, inizio e fine (gradi)`);
          break;
        case 'testo':
          if (!pt(e.pos) || !e.testo) err.push(`${k}: servono pos [x,y] e testo`);
          break;
        case 'quota':
          if (!pt(e.da) || !pt(e.a)) err.push(`${k}: servono da [x,y] e a [x,y]`);
          break;
        case 'immagine':
          if (!pt(e.pos) || !num(e.larghezza) || !num(e.altezza) || !e.dati) err.push(`${k}: servono pos, larghezza, altezza e dati`);
          break;
        default:
          err.push(`${pre}entita[${i}]: tipo sconosciuto «${e && e.tipo}» (ammessi: linea, polilinea, campitura, cerchio, arco, testo, quota)`);
      }
    });
  });
  return err;
}

function estensione(entita) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const e of entita) {
    if (e.punti) e.punti.forEach((p) => add(p[0], p[1]));
    if (e.centro) { add(e.centro[0] - e.raggio, e.centro[1] - e.raggio); add(e.centro[0] + e.raggio, e.centro[1] + e.raggio); }
    if (e.pos) add(e.pos[0], e.pos[1]);
    if (e.tipo === 'immagine') add(e.pos[0] + e.larghezza, e.pos[1] + e.altezza);
    if (e.da) {
      add(e.da[0], e.da[1]); add(e.a[0], e.a[1]);
      if (num(e.offset)) { const q = geoQuota(e, 'm'); add(q.p1[0], q.p1[1]); add(q.p2[0], q.p2[1]); }
    }
  }
  if (!Number.isFinite(x0)) return [0, 0, 1, 1];
  if (x1 === x0) x1 = x0 + 1;
  if (y1 === y0) y1 = y0 + 1;
  return [x0, y0, x1, y1];
}

// Geometria della quota: linea di quota spostata di «offset» a sinistra del verso da→a, e testo con la misura.
function geoQuota(e, unita) {
  const [ax, ay] = e.da, [bx, by] = e.a;
  const L = Math.hypot(bx - ax, by - ay) || 1;
  const nx = -(by - ay) / L, ny = (bx - ax) / L;
  const off = num(e.offset) ? e.offset : 0;
  const p1 = [ax + nx * off, ay + ny * off], p2 = [bx + nx * off, by + ny * off];
  const dec = unita === 'm' ? 2 : unita === 'cm' ? 1 : 0;
  const testo = e.testo || L.toFixed(dec).replace('.', ',');
  return { p1, p2, L, nx, ny, testo, ang: (Math.atan2(by - ay, bx - ax) * 180) / Math.PI };
}

// Linee di campitura dentro un poligono: fasci di parallele tagliati sul contorno (regola pari/dispari).
function tratteggio(punti, angolo, passo) {
  const a = (angolo * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  // ruoto il poligono di -angolo: le linee diventano orizzontali
  const P = punti.map(([x, y]) => [x * c + y * s, -x * s + y * c]);
  const ys = P.map((p) => p[1]);
  const ymin = Math.min(...ys), ymax = Math.max(...ys);
  if (!(passo > 0) || (ymax - ymin) / passo > 4000) passo = (ymax - ymin) / 4000 || 1;
  const seg = [];
  for (let y = Math.ceil(ymin / passo) * passo; y <= ymax; y += passo) {
    const xs = [];
    for (let i = 0; i < P.length; i++) {
      const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
    }
    xs.sort((m, n) => m - n);
    for (let i = 0; i + 1 < xs.length; i += 2) seg.push([[xs[i] * c - y * s, xs[i] * s + y * c], [xs[i + 1] * c - y * s, xs[i + 1] * s + y * c]]);
  }
  return seg;
}
const lineeCampitura = (e, kCarta) => (CAMPITURE[e.motivo] || CAMPITURE.diagonale).flatMap(([ang, passo]) => tratteggio(e.punti, ang, (e.passo_mm || passo) / kCarta));

// Impaginazione: sceglie le scale e dispone le viste sul foglio a righe, lasciando libero il cartiglio.
function impaginazione(t) {
  const unita = MM[t.unita] ? t.unita : 'm';
  let [W, H] = FOGLI[t.formato] || FOGLI.A3;
  if (t.orientamento === 'verticale') [W, H] = [H, W];
  const margine = 10, cart = { w: 180, h: 42 }, gap = 14, hTit = 9;
  const area = { x: margine + 10 + 6, y: margine + 6, w: W - 2 * margine - 10 - 12, h: H - 2 * margine - 12 };
  const vv = viste(t).map((v) => { const ext = estensione(v.entita); return { ...v, ext, dim: [(ext[2] - ext[0]) * MM[unita], (ext[3] - ext[1]) * MM[unita]] }; });

  // dispone le viste con le scale date; restituisce null se non entrano
  const disponi = (scale) => {
    const box = vv.map((v, i) => ({ w: v.dim[0] / scale[i], h: v.dim[1] / scale[i] + (v.titolo || vv.length > 1 ? hTit : 0) }));
    const righe = [];
    let riga = { el: [], w: 0, h: 0 };
    box.forEach((b, i) => {
      if (riga.el.length && riga.w + gap + b.w > area.w) { righe.push(riga); riga = { el: [], w: 0, h: 0 }; }
      riga.w += (riga.el.length ? gap : 0) + b.w; riga.h = Math.max(riga.h, b.h); riga.el.push(i);
    });
    righe.push(riga);
    const htot = righe.reduce((s, r) => s + r.h, 0) + gap * (righe.length - 1);
    if (righe.some((r) => r.w > area.w) || htot > area.h) return null;
    // l'ultima riga non deve finire sotto il cartiglio
    const yUltima = area.y + htot - righe[righe.length - 1].h;
    const ultima = righe[righe.length - 1];
    if (yUltima + ultima.h > H - margine - cart.h - 4 && area.x + ultima.w > W - margine - cart.w - 4) return null;
    // blocco centrato in verticale, se così non tocca il cartiglio
    const libero = area.h - htot;
    const giu = libero / 2;
    const ultimaY = area.y + giu + htot - ultima.h;
    const tocca = ultimaY + ultima.h > H - margine - cart.h - 4 && area.x + ultima.w > W - margine - cart.w - 4;
    const pos = [];
    let y = area.y + (tocca ? 0 : giu);
    for (const r of righe) {
      let x = area.x;
      for (const i of r.el) { pos[i] = { x, y: y + (r.h - box[i].h) / 2, w: box[i].w, h: box[i].h }; x += box[i].w + gap; }
      y += r.h + gap;
    }
    return pos;
  };

  const richieste = vv.map((v) => (num(v.scala) && v.scala > 0 ? v.scala : 0));
  let scale = richieste.map((s) => s || SCALE[0]);
  let pos = null, nota = '';
  if (richieste.every(Boolean)) pos = disponi(scale);
  if (!pos) {
    // scala comune più piccola che fa entrare le viste libere; quelle con scala chiesta la tengono se possibile
    for (const s of SCALE) {
      scale = richieste.map((r) => r || s);
      if ((pos = disponi(scale))) break;
    }
    if (!pos) {
      for (const s of SCALE) { scale = richieste.map((r) => Math.max(r, s)); if ((pos = disponi(scale))) break; }
      if (richieste.some(Boolean)) nota = `con le scale chieste le viste non entrano nel foglio ${t.formato || 'A3'}: scale portate a ${[...new Set(scale)].map((s) => '1:' + s).join(', ')}`;
    }
    if (!pos) { // nemmeno 1:10000: scala fuori serie
      const s = Math.ceil(Math.max(...vv.map((v) => Math.max(v.dim[0] / (area.w / vv.length), v.dim[1] / (area.h - hTit)))) * 1.2);
      scale = vv.map(() => s); pos = disponi(scale) || vv.map((v, i) => ({ x: area.x, y: area.y, w: v.dim[0] / s, h: v.dim[1] / s }));
      nota = `scala fuori serie 1:${s}`;
    }
  }
  const out = vv.map((v, i) => {
    const s = scale[i], k = MM[unita] / s; // mm di carta per unità di disegno
    const [x0, y0] = v.ext, p = pos[i];
    const hDis = v.dim[1] / s;
    const ox = p.x, oy = p.y + hDis; // l'asse y del disegno va verso l'alto
    return { ...v, scala: s, k, box: p, X: (x) => r3(ox + (x - x0) * k), Y: (y) => r3(oy - (y - y0) * k), yTitolo: p.y + hDis + 7 };
  });
  return { W, H, unita, viste: out, scala: out[0].scala, margine, cart, nota };
}

const SW = { muri: 0.5, sezion: 0.5, contorn: 0.5, cls: 0.5, quote: 0.18, testi: 0.18, campit: 0.13, asse: 0.18 };
function spessore(e) {
  if (e.spessore_mm) return e.spessore_mm;
  const l = String(e.layer || '').toLowerCase();
  for (const k in SW) if (l.includes(k)) return SW[k];
  return 0.25;
}

// Anteprima e stampa: SVG in millimetri del foglio, con squadratura, titoli delle viste e cartiglio.
function svgTavola(t, info = {}) {
  const g = impaginazione(t);
  const { W, H, unita, margine: m, cart } = g;
  const colori = {};
  (t.layer || []).forEach((l) => { colori[l.nome] = ACI[l.colore] || '#000'; });
  const col = (e) => (e.colore ? ACI[e.colore] || '#000' : colori[e.layer] || '#000');
  const dash = (e) => (LINEE[e.tipo_linea] ? ` stroke-dasharray="${LINEE[e.tipo_linea].mm.map(Math.abs).join(' ')}"` : '');
  const out = [];
  for (const v of g.viste) {
    const { X, Y, k } = v;
    // prima le campiture, sotto a tutto il resto
    for (const e of v.entita.filter((x) => x.tipo === 'campitura')) {
      const c = e.colore || colori[e.layer] ? col(e) : '#777';
      if (e.motivo === 'pieno') { out.push(`<polygon points="${e.punti.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')}" fill="${c}" stroke="none"/>`); continue; }
      const d = lineeCampitura(e, k).map(([a, b]) => `M${X(a[0])},${Y(a[1])}L${X(b[0])},${Y(b[1])}`).join('');
      out.push(`<path d="${d}" stroke="${c}" stroke-width="${e.spessore_mm || 0.13}" fill="none"/>`);
      if (e.contorno !== false) out.push(`<polygon points="${e.punti.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')}" fill="none" stroke="${c}" stroke-width="0.18"/>`);
    }
    for (const e of v.entita.filter((x) => x.tipo === 'immagine')) {
      out.push(`<image href="data:image/jpeg;base64,${e.dati}" x="${X(e.pos[0])}" y="${Y(e.pos[1] + e.altezza)}" width="${r3(e.larghezza * k)}" height="${r3(e.altezza * k)}" preserveAspectRatio="none"/>`);
    }
    for (const e of v.entita) {
      const s = `stroke="${col(e)}" stroke-width="${spessore(e)}" fill="none"${dash(e)}`;
      if (e.tipo === 'linea' || e.tipo === 'polilinea') {
        const pts = e.punti.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ');
        if (e.riempimento) out.push(`<polygon points="${pts}" fill="${e.riempimento}" stroke="none"/>`);
        else out.push(e.chiusa ? `<polygon points="${pts}" ${s}/>` : `<polyline points="${pts}" ${s}/>`);
      } else if (e.tipo === 'cerchio') {
        out.push(`<circle cx="${X(e.centro[0])}" cy="${Y(e.centro[1])}" r="${r3(e.raggio * k)}" ${s}/>`);
      } else if (e.tipo === 'arco') {
        const r = e.raggio, a0 = (e.inizio * Math.PI) / 180, a1 = (e.fine * Math.PI) / 180;
        const sweep = (((e.fine - e.inizio) % 360) + 360) % 360;
        const p0 = [e.centro[0] + r * Math.cos(a0), e.centro[1] + r * Math.sin(a0)];
        const p1 = [e.centro[0] + r * Math.cos(a1), e.centro[1] + r * Math.sin(a1)];
        // archi in senso antiorario come in DXF; in SVG l'asse y è capovolto, quindi sweep-flag 0
        out.push(`<path d="M${X(p0[0])},${Y(p0[1])} A${r3(r * k)},${r3(r * k)} 0 ${sweep > 180 ? 1 : 0} 0 ${X(p1[0])},${Y(p1[1])}" ${s}/>`);
      } else if (e.tipo === 'testo') {
        const h = num(e.altezza) ? e.altezza * k : e.altezza_mm || 2.5, rot = -(e.rotazione || 0);
        const anc = { centro: 'middle', destra: 'end' }[e.allinea] || 'start';
        out.push(`<text x="${X(e.pos[0])}" y="${Y(e.pos[1])}" font-size="${r3(h * 1.4)}" text-anchor="${anc}" fill="${col(e)}" font-family="Arial" transform="rotate(${rot} ${X(e.pos[0])} ${Y(e.pos[1])})">${esc(e.testo)}</text>`);
      } else if (e.tipo === 'quota') {
        const q = geoQuota(e, unita);
        const c = e.colore || colori[e.layer] ? col(e) : '#000';
        const [p1, p2] = [q.p1, q.p2];
        const mx = (X(p1[0]) + X(p2[0])) / 2, my = (Y(p1[1]) + Y(p2[1])) / 2;
        let rot = -q.ang;
        if (rot > 90 || rot <= -90) rot += 180;
        const tick = (p) => { const x = X(p[0]), y = Y(p[1]); return `<line x1="${r3(x - 1.2)}" y1="${r3(y + 1.2)}" x2="${r3(x + 1.2)}" y2="${r3(y - 1.2)}" stroke="${c}" stroke-width="0.35"/>`; };
        out.push(`<g stroke="${c}" stroke-width="0.18"><line x1="${X(e.da[0])}" y1="${Y(e.da[1])}" x2="${X(p1[0])}" y2="${Y(p1[1])}"/><line x1="${X(e.a[0])}" y1="${Y(e.a[1])}" x2="${X(p2[0])}" y2="${Y(p2[1])}"/><line x1="${X(p1[0])}" y1="${Y(p1[1])}" x2="${X(p2[0])}" y2="${Y(p2[1])}"/></g>${tick(p1)}${tick(p2)}`);
        out.push(`<text x="${r3(mx)}" y="${r3(my)}" dy="-1" font-size="2.6" text-anchor="middle" fill="${c}" font-family="Arial" transform="rotate(${r3(rot)} ${r3(mx)} ${r3(my)})">${esc(q.testo)}</text>`);
      }
    }
    if (v.titolo || g.viste.length > 1) {
      const cx = r3(v.box.x + v.box.w / 2);
      out.push(`<text x="${cx}" y="${r3(v.yTitolo)}" font-size="4.2" font-weight="bold" text-anchor="middle" font-family="Arial" text-decoration="underline">${esc((v.titolo || 'VISTA').toUpperCase())}</text><text x="${cx}" y="${r3(v.yTitolo + 4.5)}" font-size="3" text-anchor="middle" font-family="Arial">scala 1:${v.scala}</text>`);
    }
  }
  const c = t.cartiglio || {};
  const scale = [...new Set(g.viste.map((v) => v.scala))];
  const cx = W - m - cart.w, cy = H - m - cart.h;
  const riga = (y, et, val, x = cx) => `<text x="${x + 2}" y="${y}" font-size="2.2" fill="#555">${esc(et)}</text><text x="${x + 2}" y="${y + 5}" font-size="3.6" font-weight="bold">${esc(val)}</text>`;
  const cartiglio = `<g font-family="Arial" fill="#000">
<rect x="${cx}" y="${cy}" width="${cart.w}" height="${cart.h}" fill="#fff" stroke="#000" stroke-width="0.5"/>
<line x1="${cx}" y1="${cy + 14}" x2="${cx + cart.w}" y2="${cy + 14}" stroke="#000" stroke-width="0.25"/>
<line x1="${cx}" y1="${cy + 28}" x2="${cx + cart.w}" y2="${cy + 28}" stroke="#000" stroke-width="0.25"/>
<line x1="${cx + 120}" y1="${cy + 14}" x2="${cx + 120}" y2="${cy + 42}" stroke="#000" stroke-width="0.25"/>
${riga(cy + 4, 'PROGETTO', c.progetto || info.progetto || '')}
${riga(cy + 18, 'TITOLO', t.titolo || '')}
${riga(cy + 18, 'TAVOLA', c.numero || '', cx + 120)}
${riga(cy + 32, c.redatto ? 'REDATTO DA' : 'NOTE', c.redatto || c.note || 'Elaborato generato con TRITAPROJECT – da verificare')}
${riga(cy + 32, 'SCALA · DATA', `${scale.length > 1 ? 'varie' : '1:' + scale[0]} · ${c.data || info.data || ''}`, cx + 120)}
</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#fff"/>
<rect x="${m + 10}" y="${m}" width="${W - 2 * m - 10}" height="${H - 2 * m}" fill="none" stroke="#000" stroke-width="0.7"/>
<g stroke-linecap="round" stroke-linejoin="round">
${out.join('\n')}
</g>
${cartiglio}
</svg>`;
}

// Disegno senza squadratura (anteprime dei DXF caricati), con griglia di riferimento a richiesta.
function svgSemplice(entita, { lato = 2000, griglia = false } = {}) {
  const [x0, y0, x1, y1] = estensione(entita);
  const k = (lato * 0.96) / Math.max(x1 - x0, y1 - y0);
  const W = Math.round((x1 - x0) * k + lato * 0.04), H = Math.round((y1 - y0) * k + lato * 0.04), m = lato * 0.02;
  const X = (x) => r3(m + (x - x0) * k), Y = (y) => r3(H - m - (y - y0) * k);
  const out = [];
  for (const e of entita) {
    const c = e.riempimento || ACI[e.colore] || '#000';
    if (e.punti) out.push(`<polyline points="${e.punti.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')}" fill="${e.riempimento || 'none'}" stroke="${e.riempimento ? 'none' : c}" stroke-width="1"/>`);
    else if (e.tipo === 'testo') out.push(`<text x="${X(e.pos[0])}" y="${Y(e.pos[1])}" font-size="${r3(Math.max(1, (e.altezza || 1) * k * 1.4))}" font-family="Arial" fill="${c}" transform="rotate(${-(e.rotazione || 0)} ${X(e.pos[0])} ${Y(e.pos[1])})">${esc(e.testo)}</text>`);
  }
  if (griglia) for (let i = 1; i < 10; i++) {
    const gx = r3((W * i) / 10), gy = r3((H * i) / 10), f = Math.max(11, Math.round(Math.min(W, H) / 70));
    out.push(`<path d="M${gx},0V${H}M0,${gy}H${W}" stroke="rgba(220,0,120,.45)" stroke-width="1"/><text x="${gx + 3}" y="${f + 2}" font-size="${f}" font-weight="bold" fill="rgba(220,0,120,.9)" font-family="Arial">${(i / 10).toFixed(1)}</text><text x="3" y="${gy - 3}" font-size="${f}" font-weight="bold" fill="rgba(220,0,120,.9)" font-family="Arial">${(i / 10).toFixed(1)}</text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/><g stroke-linecap="round" stroke-linejoin="round">${out.join('')}</g></svg>`;
}

// ---------- DXF ----------

// Scrittore DXF R12 (ASCII): si apre in AutoCAD, BricsCAD, LibreCAD, DraftSight, QCAD…
function scrittoreDxf(unita, ltscale) {
  const L = [];
  const g = (code, val) => L.push(String(code), String(val));
  const f = (v) => { const s = (+v).toFixed(6).replace(/\.?0+$/, ''); return s === '-0' || s === '' ? '0' : s; };
  const layer = new Map([['0', 7]]);
  const nomeLayer = (n) => { const k = String(n || '0').replace(/[<>/\\":;?*|=`]/g, '_').slice(0, 64) || '0'; if (!layer.has(k)) layer.set(k, 7); return k; };
  const ent = [];
  const w = {
    layer: (n, colore) => { const k = nomeLayer(n); if (colore) layer.set(k, colore); return k; },
    comune: (tipo, lay, e = {}) => { ent.push(['0', tipo], ['8', nomeLayer(lay)]); if (e.colore) ent.push(['62', e.colore]); if (LINEE[e.tipo_linea]) ent.push(['6', LINEE[e.tipo_linea].dxf]); },
    linea: (a, b, lay, e) => { w.comune('LINE', lay, e); ent.push(['10', f(a[0])], ['20', f(a[1])], ['30', 0], ['11', f(b[0])], ['21', f(b[1])], ['31', 0]); },
    polilinea: (punti, chiusa, lay, e) => {
      if (punti.length === 2 && !chiusa) return w.linea(punti[0], punti[1], lay, e);
      w.comune('POLYLINE', lay, e); ent.push(['66', 1], ['10', 0], ['20', 0], ['30', 0], ['70', chiusa ? 1 : 0]);
      for (const p of punti) ent.push(['0', 'VERTEX'], ['8', nomeLayer(lay)], ['10', f(p[0])], ['20', f(p[1])], ['30', 0]);
      ent.push(['0', 'SEQEND'], ['8', nomeLayer(lay)]);
    },
    cerchio: (c, r, lay, e) => { w.comune('CIRCLE', lay, e); ent.push(['10', f(c[0])], ['20', f(c[1])], ['30', 0], ['40', f(r)]); },
    arco: (c, r, a0, a1, lay, e) => { w.comune('ARC', lay, e); ent.push(['10', f(c[0])], ['20', f(c[1])], ['30', 0], ['40', f(r)], ['50', f(a0)], ['51', f(a1)]); },
    testo: (x, y, h, s, rot, lay, all, e) => {
      w.comune('TEXT', lay, e);
      ent.push(['10', f(x)], ['20', f(y)], ['30', 0], ['40', f(h)], ['1', String(s).replace(/[\r\n]+/g, ' ')]);
      if (rot) ent.push(['50', f(rot)]);
      const h72 = { centro: 1, destra: 2 }[all];
      if (h72) ent.push(['72', h72], ['11', f(x)], ['21', f(y)], ['31', 0]);
    },
    fine: () => {
      g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$DWGCODEPAGE'); g(3, 'ANSI_1252'); g(9, '$INSUNITS'); g(70, INSUNITS[unita] || 0); g(9, '$LTSCALE'); g(40, f(ltscale || 1)); g(0, 'ENDSEC');
      g(0, 'SECTION'); g(2, 'TABLES');
      g(0, 'TABLE'); g(2, 'LTYPE'); g(70, Object.keys(LINEE).length + 1);
      g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0);
      for (const k in LINEE) {
        const d = LINEE[k];
        g(0, 'LTYPE'); g(2, d.dxf); g(70, 0); g(3, k); g(72, 65); g(73, d.mm.length); g(40, f(d.mm.reduce((s, x) => s + Math.abs(x), 0)));
        d.mm.forEach((x) => g(49, f(x)));
      }
      g(0, 'ENDTAB');
      g(0, 'TABLE'); g(2, 'LAYER'); g(70, layer.size);
      for (const [n, c] of layer) { g(0, 'LAYER'); g(2, n); g(70, 0); g(62, c); g(6, 'CONTINUOUS'); }
      g(0, 'ENDTAB'); g(0, 'ENDSEC');
      g(0, 'SECTION'); g(2, 'ENTITIES');
      for (const [c, v] of ent) g(c, v);
      g(0, 'ENDSEC'); g(0, 'EOF');
      // R12 usa la codifica di Windows: i caratteri che non ci stanno diventano \U+XXXX, che i CAD riconoscono
      const testo = (L.join('\r\n') + '\r\n').replace(/[^\x00-\x7f\xa0-\xff]/g, (ch) => `\\U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
      return Buffer.from(testo, 'latin1');
    },
  };
  return w;
}

// Le viste vanno in coordinate reali 1:1, affiancate da sinistra a destra con un po' di spazio fra l'una e l'altra.
// Scrive un'entità di tavola nel DXF; T trasforma le coordinate, hDis porta le altezze dei testi da mm di carta a unità di disegno.
function scriviEntita(w, e, { T, hDis, unita, k }) {
  const lay = e.layer || '0';
  if (e.tipo === 'linea' || e.tipo === 'polilinea') w.polilinea(e.punti.map(T), !!e.chiusa, lay, e);
  else if (e.tipo === 'campitura') {
    const layC = e.layer || 'CAMPITURE';
    w.layer(layC, e.colore || 8);
    for (const [a, b] of lineeCampitura(e, k)) w.linea(T(a), T(b), layC, { colore: e.colore });
    if (e.contorno !== false) w.polilinea(e.punti.map(T), true, layC, { colore: e.colore });
  } else if (e.tipo === 'cerchio') w.cerchio(T(e.centro), e.raggio, lay, e);
  else if (e.tipo === 'arco') w.arco(T(e.centro), e.raggio, e.inizio, e.fine, lay, e);
  else if (e.tipo === 'testo') { const p = T(e.pos); w.testo(p[0], p[1], num(e.altezza) ? e.altezza : hDis(e.altezza_mm), e.testo, e.rotazione || 0, lay, e.allinea, e); }
  else if (e.tipo === 'quota') {
    // quota «esplosa» (linee + testo): si legge ovunque, anche dove le quote associative non sono supportate
    const q = geoQuota(e, unita);
    const ec = { colore: e.colore };
    w.linea(T(e.da), T(q.p1), lay, ec); w.linea(T(e.a), T(q.p2), lay, ec); w.linea(T(q.p1), T(q.p2), lay, ec);
    let rot = q.ang; if (rot > 90 || rot <= -90) rot += 180;
    // testo sopra la linea di quota, nel verso di lettura
    const h = hDis(2.6), ar = (rot * Math.PI) / 180;
    const m = T([(q.p1[0] + q.p2[0]) / 2 - Math.sin(ar) * h * 0.4, (q.p1[1] + q.p2[1]) / 2 + Math.cos(ar) * h * 0.4]);
    w.testo(m[0], m[1], h, q.testo, rot, lay, 'centro', ec);
  }
}

function dxfTavola(t) {
  const g = impaginazione(t);
  const unita = g.unita;
  // i trattini dei tipi di linea sono in mm di carta: $LTSCALE li porta alla scala della prima vista
  const w = scrittoreDxf(unita, g.viste[0].scala / MM[unita]);
  (t.layer || []).forEach((l) => w.layer(l.nome, l.colore || 7));
  let dx = 0;
  for (const v of g.viste) {
    const [x0, y0, x1, y1] = v.ext;
    const T = (p) => [p[0] - x0 + dx, p[1] - y0];
    const hDis = (mm) => ((mm || 2.5) * v.scala) / MM[unita];
    for (const e of v.entita) scriviEntita(w, e, { T, hDis, unita, k: v.k });
    if (v.titolo || g.viste.length > 1) {
      const h = hDis(4.2), xm = dx + (x1 - x0) / 2;
      w.testo(xm, -h * 2.2, h, (v.titolo || 'VISTA').toUpperCase(), 0, 'TITOLI', 'centro');
      w.testo(xm, -h * 3.6, hDis(3), `scala 1:${v.scala}`, 0, 'TITOLI', 'centro');
    }
    dx += (x1 - x0) + Math.max(x1 - x0, y1 - y0) * 0.25;
  }
  return w.fine();
}

// DXF di un disegno modificato: le coordinate restano quelle originali (niente impaginazione).
function dxfEntita(entita, { unita = 'm', scala = 100, layer = [] } = {}) {
  const u = MM[unita] ? unita : 'mm';
  const w = scrittoreDxf(u, scala / MM[u]);
  layer.forEach((l) => w.layer(l.nome, l.colore || 7));
  const hDis = (mm) => ((mm || 2.5) * scala) / MM[u];
  for (const e of entita) scriviEntita(w, e, { T: (p) => p, hDis, unita: u, k: MM[u] / scala });
  return w.fine();
}

// Vettori estratti da una pagina PDF (in punti tipografici, y verso l'alto) → DXF in scala reale.
// Con la scala del disegno originale le misure tornano quelle vere (es. 1:50 → 1 mm di carta = 50 mm reali).
const ACI_RGB = { 1: [255, 0, 0], 2: [255, 255, 0], 3: [0, 255, 0], 4: [0, 255, 255], 5: [0, 0, 255], 6: [255, 0, 255], 7: [0, 0, 0], 8: [128, 128, 128], 9: [192, 192, 192], 30: [255, 127, 0], 140: [0, 127, 191], 250: [51, 51, 51] };
function aciVicino(hex) {
  const n = parseInt(String(hex || '#000000').slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  if (Math.max(...c) > 230 && Math.min(...c) > 230) return 7; // bianco sul foglio = nero nel CAD
  let best = 7, d0 = Infinity;
  for (const k in ACI_RGB) { const d = ACI_RGB[k].reduce((s, v, i) => s + (v - c[i]) ** 2, 0); if (d < d0) { d0 = d; best = +k; } }
  return best;
}
// Gli stessi vettori come entità di tavola, in unità reali: servono per ritagliare e ristampare in un'altra scala.
function entitaDaVettori(v, { scala = 1, unita = 'm' } = {}) {
  const u = MM[unita] ? unita : 'm';
  const k = (PT_MM * scala) / MM[u];
  const E = [];
  for (const l of v.linee) {
    const punti = [];
    for (let i = 0; i + 1 < l.p.length; i += 2) punti.push([l.p[i] * k, l.p[i + 1] * k]);
    if (punti.length < 2) continue;
    const e = { tipo: 'polilinea', punti, layer: l.l || 'COLORE_' + String(l.c || '#000000').slice(1).toUpperCase(), colore: aciVicino(l.c), spessore_mm: 0.18 };
    if (l.r) { e.riempimento = l.c; e.layer += '_RIEMPIMENTI'; if (punti.length < 3) continue; }
    E.push(e);
  }
  for (const t of v.testi) E.push({ tipo: 'testo', pos: [t.x * k, t.y * k], testo: t.s, altezza: t.h * k * 0.7, rotazione: t.r || 0, layer: t.l || 'TESTI' });
  return E;
}

function dxfDaVettori(v, { scala = 1, unita = 'mm' } = {}) {
  const u = MM[unita] ? unita : 'mm';
  const k = (PT_MM * scala) / MM[u];
  const w = scrittoreDxf(u, scala / MM[u]);
  const P = (x, y) => [x * k, y * k];
  for (const l of v.linee) {
    const lay = l.l || 'COLORE_' + String(l.c || '#000000').slice(1).toUpperCase();
    w.layer(lay, aciVicino(l.c));
    const punti = [];
    for (let i = 0; i + 1 < l.p.length; i += 2) punti.push(P(l.p[i], l.p[i + 1]));
    if (punti.length >= 2) w.polilinea(punti, false, l.r ? lay + '_RIEMPIMENTI' : lay);
  }
  for (const t of v.testi) {
    const lay = t.l || 'TESTI';
    w.layer(lay, 7);
    const p = P(t.x, t.y);
    w.testo(p[0], p[1], Math.max(t.h * k, 1e-6), t.s, t.r || 0, lay);
  }
  return w.fine();
}

// ---------- Relazioni, schemi, tabelle ----------

function htmlRelazione({ titolo, html, progetto, data }) {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(titolo)}</title>
<style>
@page { size: A4; margin: 22mm 18mm 20mm; }
body { font-family: "Segoe UI", Arial, sans-serif; font-size: 10.5pt; line-height: 1.5; color: #1b2430; margin: 0 auto; max-width: 180mm; }
header { border-bottom: 2px solid #1f4e79; padding-bottom: 6px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: end; gap: 12px; }
header .p { font-size: 9pt; color: #555; text-transform: uppercase; letter-spacing: .04em; }
h1 { font-size: 19pt; color: #1f4e79; margin: 0 0 4px; }
h2 { font-size: 13.5pt; color: #1f4e79; margin: 20px 0 6px; border-bottom: 1px solid #c9d6e6; padding-bottom: 2px; }
h3 { font-size: 11.5pt; margin: 14px 0 4px; }
table { border-collapse: collapse; width: 100%; margin: 8px 0 12px; font-size: 9.5pt; }
th, td { border: 1px solid #9fb3c8; padding: 4px 6px; text-align: left; vertical-align: top; }
th { background: #e6eef7; }
svg { max-width: 100%; height: auto; }
figure { margin: 10px 0; text-align: center; } figcaption { font-size: 9pt; color: #555; }
.nota { font-size: 8.5pt; color: #777; border-top: 1px solid #ddd; margin-top: 24px; padding-top: 6px; }
</style></head><body>
<header><div><div class="p">${esc(progetto || '')}</div><h1>${esc(titolo)}</h1></div><div class="p">${esc(data || '')}</div></header>
${html}
<div class="nota">Documento redatto con TRITAPROJECT sulla base degli allegati di progetto: va verificato e firmato da un tecnico abilitato.</div>
</body></html>`;
}

function svgSchema(svg) {
  const s = String(svg || '').trim();
  const i = s.indexOf('<svg');
  if (i < 0) throw new Error('il campo «svg» deve contenere un elemento <svg>…</svg>');
  let out = s.slice(i, s.lastIndexOf('</svg>') + 6);
  if (!/xmlns=/.test(out.slice(0, 200))) out = out.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  // niente script o collegamenti esterni dentro le immagini generate
  return out.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '');
}

function csvTabella({ colonne, righe }) {
  const cella = (v) => {
    let s = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '');
    if (/[;"\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return '﻿' + [colonne, ...righe].map((r) => (r || []).map(cella).join(';')).join('\r\n') + '\r\n';
}

function htmlTabella({ titolo, colonne, righe }) {
  const td = (v) => `<td${typeof v === 'number' ? ' style="text-align:right"' : ''}>${esc(typeof v === 'number' ? v.toLocaleString('it-IT') : v)}</td>`;
  return `<table><thead><tr>${colonne.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${righe.map((r) => `<tr>${r.map(td).join('')}</tr>`).join('')}</tbody></table>`;
}

module.exports = { svgSemplice, FOGLI, CAMPITURE, MM, PT_MM, aciVicino, nomeFile, controllaTavola, impaginazione, svgTavola, dxfTavola, dxfEntita, dxfDaVettori, entitaDaVettori, tratteggio, htmlRelazione, svgSchema, csvTabella, htmlTabella, esc };
