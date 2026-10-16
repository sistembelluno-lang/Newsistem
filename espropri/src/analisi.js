// Dal DXF alle superfici per particella.
// Due modi, anche insieme nello stesso disegno:
//  1) aree d'intervento già «tagliate» sui limiti di particella (polilinee chiuse sui layer esproprio/servitù/occupazione)
//     con dentro il numero della particella originaria (es. «100», «Fg.1 100», «100/a»);
//  2) layer delle particelle catastali + layer delle aree d'intervento: il programma interseca e divide da solo.
// Le sovrapposizioni tra tipi si tolgono per priorità: esproprio > servitù ingombro opere > servitù fascia > occupazione.
(function (ES) {
  'use strict';
  const A = ES.analisi = {}, G = ES.geo, U = ES.U;

  A.TIPI = ['espr', 'servop', 'serv', 'occ'];
  A.RUOLI = {
    part: 'Particelle catastali', espr: 'Esproprio', servop: 'Servitù – ingombro opere', serv: 'Servitù – fascia',
    occ: 'Occupazione temporanea', testi: 'Numeri di particella (solo testi)', sfondo: 'Sfondo (solo disegno)', ignora: 'Non usare'
  };
  // Ruolo proposto in base al nome del layer
  A.ruoloAuto = nome => {
    const n = U.norm(nome);
    if (/espr|esprop|acquisiz/.test(n)) return 'espr';
    if (/ingombr|sedime|manufatt|pozzett|ingombro/.test(n)) return 'servop';
    if (/serv|asserv/.test(n)) return 'serv';
    if (/occup|\bocc\b|tempor|cantier/.test(n)) return 'occ';
    if (/partic|catast|mappa|cxf|confin|fiduc|lotti/.test(n)) return 'part';
    if (/testi|text|numer|etich|label|codic/.test(n)) return 'testi';
    if (/^defpoints$/.test(n)) return 'ignora';
    return 'sfondo';
  };

  // Etichetta di particella → {fg, map, sub}. opt.fgMap: «1/100» si legge foglio 1 mappale 100.
  A.etichetta = (t, opt = {}) => {
    const s = String(t || '').trim().replace(/\s+/g, ' ');
    let m;
    if ((m = /^(?:f(?:g|oglio)?\.?)\s*(\d+)[\s,;\-–\/]*(?:(?:m(?:app(?:ale)?)?|p(?:\.?\s?lla|art(?:icella)?)?|n)\.?\s*)?(\.?\d+(?:\/\d+)?)\s*(?:[\/\-_]?\s*([a-z]{1,2}))?(?:\s*sub\.?\s*(\d+))?$/i.exec(s)))
      return { fg: m[1], map: m[2], sub: m[4] || '', fr: m[3] || '' };
    if (opt.fgMap && (m = /^(\d+)\s*[\/\-]\s*(\d+)$/.exec(s))) return { fg: m[1], map: m[2], sub: '', fr: '' };
    // Catasto di origine austriaca (es. Cortina d'Ampezzo): particelle con la barra «8611/16» o edificiali «.123»
    if (!opt.fgMap && (m = /^(?:(?:p\.?\s?(?:f|fond|ed|edif|lla)\.?|mapp?\.?|n\.?)\s*)?(\.?\d+\s*\/\s*\d+|\.\d+)$/i.exec(s))) return { fg: '', map: m[1].replace(/\s/g, ''), sub: '', fr: '' };
    if ((m = /^(?:(?:m(?:app(?:ale)?)?|p(?:\.?\s?lla|art(?:icella)?)?|n)\.?\s*)?(\d+)\s*(?:[\/\-_]?\s*([a-z]{1,2}))?(?:\s*sub\.?\s*(\d+))?$/i.exec(s)))
      return { fg: '', map: m[1], sub: m[3] || '', fr: m[2] || '' };
    return null;
  };
  const nk = v => String(v ?? '').trim().replace(/^0+(?=\d)/, '').toLowerCase();
  A.chiave = (fg, map, sub) => nk(fg) + '|' + nk(map) + (nk(sub) ? '|' + nk(sub) : '');

  // opt: {ruoli:{layer:ruolo}, fg (foglio predefinito), comune, fgMap, sottrai (true), scheggia (mq, 0.5), poligonizza (true)}
  A.importaDxf = function (dxf, opt) {
    opt = Object.assign({ sottrai: true, scheggia: 0.5, poligonizza: true, tol: 0.01 }, opt || {});
    const ruolo = l => (opt.ruoli && opt.ruoli[l]) || A.ruoloAuto(l);
    const avvisi = [];
    const chiusi = { part: [], espr: [], servop: [], serv: [], occ: [] }, aperte = [], sfondo = [];
    dxf.poli.forEach(p => {
      const r = ruolo(p.layer);
      if (r === 'ignora' || r === 'testi') return;
      if (r === 'sfondo') { sfondo.push({ layer: p.layer, pts: p.pts, chiusa: p.chiusa }); return; }
      if (r === 'part' && !p.chiusa) {
        // Polilinea aperta ma con estremi coincidenti: è chiusa di fatto
        const a = p.pts[0], b = p.pts[p.pts.length - 1];
        if (p.pts.length > 3 && Math.hypot(a[0] - b[0], a[1] - b[1]) <= opt.tol) { const q = G.pulisci(p.pts); if (q) chiusi.part.push({ layer: p.layer, poly: [q] }); }
        else aperte.push(p);
        return;
      }
      const q = p.chiusa || Math.hypot(p.pts[0][0] - p.pts[p.pts.length - 1][0], p.pts[0][1] - p.pts[p.pts.length - 1][1]) <= opt.tol ? G.pulisci(p.pts) : null;
      if (q) chiusi[r].push({ layer: p.layer, poly: [q] });
      else if (r !== 'part') { sfondo.push({ layer: p.layer, pts: p.pts, chiusa: false }); avvisi.push(`Layer «${p.layer}»: una linea non chiusa è stata disegnata ma non conteggiata`); }
    });
    // Confini catastali disegnati a tratti: si ricostruiscono i poligoni
    if (opt.poligonizza && aperte.length) {
      const facce = G.poligonizza(aperte, opt.tol);
      facce.forEach(P => chiusi.part.push({ layer: aperte[0].layer, poly: P }));
      if (facce.length) avvisi.push(`${facce.length} particelle ricostruite da linee sciolte`);
    }

    // Testi: a ogni testo il poligono più piccolo che lo contiene, per ciascun gruppo
    const testi = dxf.testi.filter(t => ruolo(t.layer) !== 'ignora');
    const assegna = (polys, filtro) => {
      polys.forEach(p => { p.b = G.bboxPts(p.poly[0]); p.a = G.areaPoly(p.poly); p.testi = []; });
      testi.forEach(t => {
        if (!filtro(t)) return;
        let best = null;
        polys.forEach(p => { if (t.x >= p.b[0] && t.x <= p.b[2] && t.y >= p.b[1] && t.y <= p.b[3] && G.inPoly(t.x, t.y, p.poly) && (!best || p.a < best.a)) best = p; });
        if (best) best.testi.push(t);
      });
    };
    const leggi = (p, pref) => {
      const L = p.testi.slice().sort((a, b) => (b.layer === pref) - (a.layer === pref) || b.h - a.h);
      for (const t of L) { const e = A.etichetta(t.t, opt); if (e) return { ...e, fg: e.fg || opt.fg || '', testo: t.t }; }
      return null;
    };

    // Particelle catastali
    assegna(chiusi.part, t => ['part', 'testi', 'sfondo'].includes(ruolo(t.layer)));
    const part = chiusi.part.map(p => {
      const e = leggi(p, p.layer);
      return { k: e ? A.chiave(e.fg, e.map, e.sub) : null, fg: e ? e.fg : '', map: e ? e.map : '', sub: e ? e.sub : '', mp: G.arrotonda([p.poly]), a: p.a, b: p.b };
    });
    const senzaNum = part.filter(p => !p.k).length;
    if (senzaNum) avvisi.push(`${senzaNum} poligoni di particella senza numero leggibile (strade, acque o testo mancante)`);
    const doppie = {}; part.forEach(p => { if (p.k) doppie[p.k] = (doppie[p.k] || 0) + 1; });
    Object.keys(doppie).filter(k => doppie[k] > 1).forEach(k => avvisi.push(`La particella ${k.replace(/\|/g, ' / ')} compare in ${doppie[k]} poligoni: le superfici si sommano`));

    // Aree d'intervento: etichette lette prima di togliere le sovrapposizioni
    const interv = [];
    A.TIPI.forEach(tipo => {
      assegna(chiusi[tipo], t => ruolo(t.layer) !== 'part' || !chiusi.part.length);
      chiusi[tipo].forEach(p => interv.push({ tipo, layer: p.layer, poly: p.poly, lab: leggi(p, p.layer) }));
    });
    const unioni = {};
    A.TIPI.forEach(t => { unioni[t] = G.unione(interv.filter(x => x.tipo === t).map(x => [x.poly])); });
    const pezzi = [];
    interv.forEach(x => {
      let mp = [x.poly];
      if (opt.sottrai) { const sopra = A.TIPI.slice(0, A.TIPI.indexOf(x.tipo)).map(t => unioni[t]); mp = G.differenza(mp, ...sopra); }
      if (!mp.length || G.areaMP(mp) < 1e-4) return;
      const bb = G.bboxMP(mp);
      const cand = part.filter(p => G.bboxOverlap(p.b, bb));
      if (cand.length) {
        let dentro = 0;
        cand.forEach(p => {
          const q = G.intersezione(mp, p.mp), a = G.areaMP(q);
          if (a < opt.scheggia) return;
          dentro += a;
          const lab = p.k ? { fg: p.fg, map: p.map, sub: p.sub } : x.lab;
          pezzi.push({ tipo: x.tipo, layer: x.layer, mp: G.arrotonda(q), a, fg: lab ? lab.fg : '', map: lab ? lab.map : '', sub: lab ? lab.sub : '', da: p.k ? 'catasto' : (x.lab ? 'etichetta' : '') });
        });
        const resto = G.areaMP(mp) - dentro;
        if (resto >= opt.scheggia) {
          const fuori = G.differenza(mp, ...cand.map(p => p.mp));
          if (G.areaMP(fuori) >= opt.scheggia) pezzi.push({ tipo: x.tipo, layer: x.layer, mp: G.arrotonda(fuori), a: G.areaMP(fuori), fg: x.lab ? x.lab.fg : '', map: x.lab ? x.lab.map : '', sub: x.lab ? x.lab.sub : '', da: x.lab ? 'etichetta' : '' });
        }
      } else {
        pezzi.push({ tipo: x.tipo, layer: x.layer, mp: G.arrotonda(mp), a: G.areaMP(mp), fg: x.lab ? x.lab.fg : '', map: x.lab ? x.lab.map : '', sub: x.lab ? x.lab.sub : '', da: x.lab ? 'etichetta' : '' });
      }
    });
    pezzi.forEach(p => { p.id = U.id(); p.k = p.map ? A.chiave(p.fg, p.map, p.sub) : null; });
    const na = pezzi.filter(p => !p.k).length;
    if (na) avvisi.push(`${na} aree d'intervento senza particella: assegnale a mano nella scheda «Importa»`);

    // Testi da riportare nella tavola: i numeri di particella
    const etich = testi.filter(t => ['part', 'testi'].includes(ruolo(t.layer)) && A.etichetta(t.t, opt)).map(t => ({ x: t.x, y: t.y, t: t.t, h: t.h, rot: t.rot }));
    const bbox = [Infinity, Infinity, -Infinity, -Infinity];
    part.forEach(p => G.bboxMP(p.mp, bbox)); pezzi.forEach(p => G.bboxMP(p.mp, bbox)); sfondo.forEach(l => G.bboxPts(l.pts, bbox));
    part.forEach(p => { delete p.b; });
    return { comune: opt.comune || '', part, pezzi, sfondo, etich, bbox: isFinite(bbox[0]) ? bbox : [0, 0, 1, 1], avvisi };
  };

  // Unisce un nuovo import alla geometria della pratica (più fogli o più file)
  A.unisciGeo = (geo, nuovo, sostituisci) => {
    if (!geo || sostituisci) return nuovo;
    const bbox = geo.bbox.slice();
    G.bboxPts([[nuovo.bbox[0], nuovo.bbox[1]], [nuovo.bbox[2], nuovo.bbox[3]]], bbox);
    return { part: geo.part.concat(nuovo.part), pezzi: geo.pezzi.concat(nuovo.pezzi), sfondo: geo.sfondo.concat(nuovo.sfondo), etich: geo.etich.concat(nuovo.etich), bbox, avvisi: nuovo.avvisi };
  };

  // Superfici per particella dai pezzi: {chiave: {espr, servop, serv, occ, graf}}
  A.superfici = geo => {
    const S = {};
    if (!geo) return S;
    (geo.part || []).forEach(p => { if (p.k) (S[p.k] = S[p.k] || { espr: 0, servop: 0, serv: 0, occ: 0, graf: 0 }).graf += p.a; });
    (geo.pezzi || []).forEach(p => { if (p.k) (S[p.k] = S[p.k] || { espr: 0, servop: 0, serv: 0, occ: 0, graf: 0 })[p.tipo] += p.a; });
    return S;
  };

  // Superfici d'intervento effettive di una particella: valore manuale se c'è, altrimenti dal disegno
  // (ragguagliato alla superficie catastale se richiesto), arrotondato al metro quadrato come in catasto.
  A.aree = (p, S, impost) => {
    const s = S[A.chiave(p.fg, p.map, p.sub)] || S[A.chiave(p.fg, p.map, '')] || null;
    const f = impost && impost.ragguaglio && s && s.graf > 0 && p.sup > 0 ? p.sup / s.graf : 1;
    const o = {};
    A.TIPI.forEach(t => {
      const m = p.man && p.man[t];
      o[t] = m != null && m !== '' ? U.num(m) : s ? Math.round(s[t] * f) : 0;
    });
    o.graf = s ? s.graf : 0; o.fatt = f; o.disegno = !!s;
    return o;
  };

  // Confini (N-E-S-O) dai poligoni catastali: particelle che toccano il contorno, per direzione dal baricentro
  A.confini = (geo, k, tol = 0.05) => {
    if (!geo) return '';
    const me = geo.part.filter(p => p.k === k); if (!me.length) return '';
    const mb = G.bboxMP(me.flatMap(p => p.mp)), c = [(mb[0] + mb[2]) / 2, (mb[1] + mb[3]) / 2];
    const lati = { N: new Set(), E: new Set(), S: new Set(), O: new Set() };
    const seg = []; me.forEach(p => p.mp.forEach(P => P.forEach(r => r.forEach((q, i) => seg.push([q, r[(i + 1) % r.length]])))));
    const vicino = (x, y) => seg.some(([a, b]) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L)); return Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y) <= tol; });
    geo.part.forEach(p => {
      if (p.k === k) return;
      const pb = G.bboxMP(p.mp); if (!G.bboxOverlap([mb[0] - tol, mb[1] - tol, mb[2] + tol, mb[3] + tol], pb)) return;
      const tocchi = []; p.mp.forEach(P => P.forEach(r => r.forEach(q => { if (vicino(q[0], q[1])) tocchi.push(q); })));
      if (tocchi.length < 2) return;
      const mx = tocchi.reduce((s, q) => s + q[0], 0) / tocchi.length, my = tocchi.reduce((s, q) => s + q[1], 0) / tocchi.length;
      const ang = Math.atan2(my - c[1], mx - c[0]) * 180 / Math.PI;
      const lato = ang > 45 && ang <= 135 ? 'N' : ang > -45 && ang <= 45 ? 'E' : ang > -135 && ang <= -45 ? 'S' : 'O';
      lati[lato].add(p.k ? (p.fg ? 'Fg.' + p.fg + ' ' : '') + 'Mapp.' + p.map : 'strada/acque');
    });
    return ['N', 'E', 'S', 'O'].filter(l => lati[l].size).map(l => l + ': ' + [...lati[l]].sort(U.cmp).join(', ')).join('; ');
  };
})(ES);
