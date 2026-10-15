// Lettura dei file DXF (testo ASCII, qualsiasi versione AutoCAD R12–2018).
// Entità lette: LWPOLYLINE, POLYLINE/VERTEX, LINE, ARC, CIRCLE, TEXT, MTEXT, INSERT con ATTRIB; anche dentro i blocchi inseriti.
// Risultato: {layers:{nome:{n}}, poli:[{layer, pts:[[x,y]…], chiusa}], testi:[{layer, x, y, t, h, rot}], unita}
(function (ES) {
  'use strict';
  const D = ES.dxf = {};

  // Gli archi (bulge delle polilinee, ARC, CIRCLE) diventano spezzate con passo massimo di 5°
  function arco(cx, cy, r, a0, a1, out) {
    let da = a1 - a0; while (da <= 0) da += 2 * Math.PI;
    const n = Math.max(2, Math.ceil(da / (Math.PI / 36)));
    for (let i = 1; i <= n; i++) { const a = a0 + da * i / n; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  }
  // Segmento con bulge (tangente di 1/4 dell'angolo al centro; positivo = antiorario)
  function bulgeTo(p0, p1, b, out) {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], c = Math.hypot(dx, dy);
    if (!b || Math.abs(b) < 1e-9 || c < 1e-12) { out.push(p1); return; }
    const th = 4 * Math.atan(b), d = (c / 2) / Math.tan(th / 2);
    const cx = (p0[0] + p1[0]) / 2 - d * dy / c, cy = (p0[1] + p1[1]) / 2 + d * dx / c;
    const r = Math.hypot(p0[0] - cx, p0[1] - cy), a0 = Math.atan2(p0[1] - cy, p0[0] - cx);
    const n = Math.max(2, Math.ceil(Math.abs(th) / (Math.PI / 36)));
    for (let i = 1; i < n; i++) { const a = a0 + th * i / n; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    out.push(p1);
  }

  // Testo MTEXT senza codici di formattazione ({\fArial;…}, \P a capo, \~ spazio)
  D.pulisciMtext = s => String(s)
    .replace(/\\U\+([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\P/g, ' ').replace(/\\~/g, ' ')
    .replace(/\\[ACFHQTWfhqtwacp][^;\\{}]*;/g, '').replace(/\\[LlOoKk]/g, '')
    .replace(/\\S([^;]*)[\^#\/]([^;]*);/g, '$1/$2')
    .replace(/[{}]/g, '').replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/\s+/g, ' ').trim();

  D.decodifica = function (buf) {
    if (typeof buf === 'string') return buf;
    const b = new Uint8Array(buf);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch (e) { return new TextDecoder('windows-1252').decode(b); }
  };

  D.leggi = function (input) {
    const txt = D.decodifica(input);
    if (/^AutoCAD Binary DXF/.test(txt.slice(0, 22))) throw new Error('DXF binario non supportato: salvalo come DXF ASCII');
    const L = txt.split(/\r\n|\r|\n/);
    const cp = [];
    for (let i = 0; i + 1 < L.length; i += 2) cp.push([parseInt(L[i].trim(), 10), L[i + 1]]);
    const out = { layers: {}, poli: [], testi: [], unita: 0, blocchi: {} };
    let i = 0;
    const seg = () => cp[i] && cp[i][0] === 0 ? cp[i][1].trim() : null;

    // Legge le coppie di un'entità fino al prossimo codice 0
    function entita() {
      const tipo = cp[i][1].trim(), g = []; i++;
      while (i < cp.length && cp[i][0] !== 0) { g.push(cp[i]); i++; }
      return { tipo, g };
    }
    const val = (g, c, d) => { const x = g.find(p => p[0] === c); return x ? x[1] : d; };
    const fl = (g, c, d = 0) => { const x = val(g, c); return x == null ? d : parseFloat(x); };

    function converti(e, dest, ctx) {
      const g = e.g, layer = (val(g, 8, '0') || '0').trim();
      const add = (pts, chiusa) => { if (pts.length >= 2) dest.poli.push({ layer, pts, chiusa }); };
      switch (e.tipo) {
        case 'LWPOLYLINE': {
          const chiusa = (fl(g, 70) & 1) === 1, V = [];
          let cur = null;
          for (const [c, v] of g) {
            if (c === 10) { cur = { x: parseFloat(v), y: 0, b: 0 }; V.push(cur); }
            else if (c === 20 && cur) cur.y = parseFloat(v);
            else if (c === 42 && cur) cur.b = parseFloat(v);
          }
          const pts = [];
          V.forEach((p, k) => {
            if (k === 0) pts.push([p.x, p.y]);
            else bulgeTo([V[k - 1].x, V[k - 1].y], [p.x, p.y], V[k - 1].b, pts);
          });
          if (chiusa && V.length >= 2 && V[V.length - 1].b) bulgeTo([V[V.length - 1].x, V[V.length - 1].y], [V[0].x, V[0].y], V[V.length - 1].b, pts);
          add(pts, chiusa); break;
        }
        case 'LINE': add([[fl(g, 10), fl(g, 20)], [fl(g, 11), fl(g, 21)]], false); break;
        case 'CIRCLE': { const pts = []; const cx = fl(g, 10), cy = fl(g, 20), r = fl(g, 40); arco(cx, cy, r, 0, 2 * Math.PI, pts); add(pts, true); break; }
        case 'ARC': {
          const cx = fl(g, 10), cy = fl(g, 20), r = fl(g, 40), a0 = fl(g, 50) * Math.PI / 180, a1 = fl(g, 51) * Math.PI / 180;
          const pts = [[cx + r * Math.cos(a0), cy + r * Math.sin(a0)]]; arco(cx, cy, r, a0, a1, pts); add(pts, false); break;
        }
        case 'TEXT': case 'ATTRIB': {
          let t = val(g, 1, ''); t = D.pulisciMtext(t);
          // Con l'allineamento diverso da «sinistra» il punto vero è il secondo (11/21)
          const al = fl(g, 72) || fl(g, 74);
          const x = al ? fl(g, 11, fl(g, 10)) : fl(g, 10), y = al ? fl(g, 21, fl(g, 20)) : fl(g, 20);
          if (t) dest.testi.push({ layer, x, y, t, h: fl(g, 40, 1), rot: fl(g, 50) });
          break;
        }
        case 'MTEXT': {
          let t = ''; for (const [c, v] of g) if (c === 3) t += v; t += val(g, 1, '');
          t = D.pulisciMtext(t);
          if (t) dest.testi.push({ layer, x: fl(g, 10), y: fl(g, 20), t, h: fl(g, 40, 1), rot: fl(g, 50) });
          break;
        }
        case 'INSERT': {
          const b = ctx && ctx.blocchi[val(g, 2, '')];
          if (!b) break;
          const ix = fl(g, 10), iy = fl(g, 20), sx = fl(g, 41, 1) || 1, sy = fl(g, 42, 1) || 1, rot = fl(g, 50) * Math.PI / 180;
          const bx = b.base[0], by = b.base[1], cs = Math.cos(rot), sn = Math.sin(rot);
          const tr = p => { const x = (p[0] - bx) * sx, y = (p[1] - by) * sy; return [ix + x * cs - y * sn, iy + x * sn + y * cs]; };
          b.poli.forEach(p => dest.poli.push({ layer: p.layer === '0' ? layer : p.layer, pts: p.pts.map(tr), chiusa: p.chiusa }));
          b.testi.forEach(t => { const q = tr([t.x, t.y]); dest.testi.push({ ...t, layer: t.layer === '0' ? layer : t.layer, x: q[0], y: q[1], h: t.h * Math.abs(sy) }); });
          break;
        }
      }
    }

    // POLYLINE è seguita da VERTEX… e SEQEND
    function polyline(e, dest, ctx) {
      const g = e.g, layer = (val(g, 8, '0') || '0').trim(), flag = fl(g, 70);
      const V = [];
      while (i < cp.length && seg() === 'VERTEX') { const v = entita(); if ((fl(v.g, 70) & 16) === 0) V.push({ x: fl(v.g, 10), y: fl(v.g, 20), b: fl(v.g, 42) }); }
      if (seg() === 'SEQEND') entita();
      if (flag & (16 | 64)) return; // mesh e polyface: non sono confini
      const pts = [];
      V.forEach((p, k) => { if (k === 0) pts.push([p.x, p.y]); else bulgeTo([V[k - 1].x, V[k - 1].y], [p.x, p.y], V[k - 1].b, pts); });
      const chiusa = (flag & 1) === 1;
      if (chiusa && V.length >= 2 && V[V.length - 1].b) bulgeTo([V[V.length - 1].x, V[V.length - 1].y], [V[0].x, V[0].y], V[V.length - 1].b, pts);
      if (pts.length >= 2) dest.poli.push({ layer, pts, chiusa });
    }

    const ctx = { blocchi: out.blocchi };
    while (i < cp.length) {
      if (!(cp[i][0] === 0 && cp[i][1].trim() === 'SECTION')) { i++; continue; }
      i++;
      const nome = cp[i] && cp[i][0] === 2 ? cp[i][1].trim() : ''; i++;
      while (i < cp.length && !(cp[i][0] === 0 && cp[i][1].trim() === 'ENDSEC')) {
        if (nome === 'HEADER' && cp[i][0] === 9 && cp[i][1].trim() === '$INSUNITS') { out.unita = parseInt(cp[i + 1][1], 10) || 0; i += 2; continue; }
        if (nome === 'BLOCKS' && seg() === 'BLOCK') {
          const b = entita(), bn = val(b.g, 2, ''), blk = { base: [fl(b.g, 10), fl(b.g, 20)], poli: [], testi: [] };
          while (i < cp.length && seg() !== 'ENDBLK') {
            if (seg() == null) { i++; continue; }
            const e = entita();
            if (e.tipo === 'POLYLINE') polyline(e, blk, ctx); else converti(e, blk, ctx);
          }
          if (seg() === 'ENDBLK') entita();
          out.blocchi[bn] = blk; continue;
        }
        if (nome === 'ENTITIES' && seg() != null) {
          const e = entita();
          if (e.tipo === 'POLYLINE') polyline(e, out, ctx); else converti(e, out, ctx);
          continue;
        }
        i++;
      }
      i++;
    }
    out.poli.forEach(p => { (out.layers[p.layer] = out.layers[p.layer] || { poli: 0, chiuse: 0, testi: 0 }).poli++; if (p.chiusa) out.layers[p.layer].chiuse++; });
    out.testi.forEach(t => { (out.layers[t.layer] = out.layers[t.layer] || { poli: 0, chiuse: 0, testi: 0 }).testi++; });
    delete out.blocchi;
    return out;
  };

  // Scrittura DXF R12 minimale (per riportare in CAD le aree calcolate con le etichette)
  D.scrivi = function (poli, testi) {
    const o = ['0', 'SECTION', '2', 'ENTITIES'];
    const f = n => (Math.round(n * 1000) / 1000).toString();
    poli.forEach(p => {
      o.push('0', 'POLYLINE', '8', p.layer, '66', '1', '70', p.chiusa ? '1' : '0');
      p.pts.forEach(q => o.push('0', 'VERTEX', '8', p.layer, '10', f(q[0]), '20', f(q[1]), '30', '0'));
      o.push('0', 'SEQEND', '8', p.layer);
    });
    testi.forEach(t => o.push('0', 'TEXT', '8', t.layer, '10', f(t.x), '20', f(t.y), '30', '0', '40', f(t.h || 1), '1', String(t.t)));
    o.push('0', 'ENDSEC', '0', 'EOF');
    return o.join('\r\n') + '\r\n';
  };
})(ES);
