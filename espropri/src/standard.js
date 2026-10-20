// ESPROPRI_SISTEM · Standard DXF per i piani particellari: un modello base (layer, colori, tipi di linea, stile dei
// testi, cornice A3 1:1000, cartiglio, legenda e un esempio completo) su cui disegnare in CAD. Il programma lo legge
// senza ambiguità: ogni layer ha un solo significato. Coordinate in metri (1 unità = 1 m).
(function (ES) {
  'use strict';
  const S = ES.standard = {};
  // nome, colore ACI, tipo di linea, ruolo per il programma, descrizione
  S.LAYER = [
    ['PARTICELLE', 7, 'CONTINUOUS', 'confini', 'Confini delle particelle catastali: polilinee chiuse (o linee che si chiudono esattamente nei vertici)'],
    ['PARTICELLE_NUMERI', 7, 'CONTINUOUS', 'numeri', 'Numero di ogni particella, scritto DENTRO il suo poligono: «100», «100 sub 2», oppure «Fg.10 mapp.100» se il foglio cambia'],
    ['FOGLI', 2, 'DASHDOT', 'fogli', 'Limite tra fogli di mappa (linea) e scritta «FOGLIO 10» dentro ogni foglio: dà il foglio alle particelle vicine'],
    ['ESPROPRIO', 1, 'CONTINUOUS', 'esproprio', 'Aree da espropriare: polilinee chiuse (anche a cavallo di più particelle: il programma le divide)'],
    ['SERVITU_INGOMBRO_OPERE', 6, 'CONTINUOUS', 'servitù opere', 'Ingombro delle opere in servitù (pozzetti, manufatti, sostegni): polilinee chiuse'],
    ['SERVITU_FASCIA', 5, 'CONTINUOUS', 'servitù', 'Fascia di servitù / asservimento: polilinee chiuse'],
    ['OCCUPAZIONE_TEMPORANEA', 30, 'CONTINUOUS', 'occupazione', 'Aree di occupazione temporanea (cantiere, piste): polilinee chiuse'],
    ['OPERA_PROGETTO', 4, 'DASHED', 'sfondo', 'Tracciato dell\'opera (asse condotta, strada di progetto): solo disegno'],
    ['FABBRICATI', 8, 'CONTINUOUS', 'sfondo', 'Fabbricati della mappa: solo disegno'],
    ['STRADE_ACQUE', 8, 'CONTINUOUS', 'sfondo', 'Strade, fossi, corsi d\'acqua senza numero: solo disegno'],
    ['RETINI', 8, 'CONTINUOUS', 'sfondo', 'Retini e campiture facoltativi (il programma legge le aree dalle polilinee, non dai retini)'],
    ['RICHIAMI_DITTE', 1, 'CONTINUOUS', 'ignorato', 'Cerchietti con il numero di piano della ditta e linee di richiamo'],
    ['TOPONIMI', 8, 'CONTINUOUS', 'ignorato', 'Nomi di vie, località, opere e scritte varie'],
    ['QUOTE', 8, 'CONTINUOUS', 'ignorato', 'Quote e misure'],
    ['LEGENDA', 7, 'CONTINUOUS', 'ignorato', 'Legenda della tavola'],
    ['CARTIGLIO', 7, 'CONTINUOUS', 'ignorato', 'Cartiglio, note e cornice']
  ];
  // altezze dei testi in metri a 1:1000 (= millimetri sulla carta)
  S.TESTI = [['Numeri di particella', 2.0], ['Numeri di particelle piccole', 1.2], ['Scritta FOGLIO', 5.0], ['Numero di piano nel cerchietto (raggio 4 m)', 2.5], ['Toponimi', 2.5], ['Legenda', 2.0], ['Titolo del cartiglio', 4.0]];

  // Esempio: svincolo a rotatoria sulla strada statale esistente, con due rami nuovi in curva, particelle irregolari
  // su due fogli tagliate dalla strada, case, esproprio, occupazione temporanea attorno al cantiere e una condotta in
  // servitù con i pozzetti. Tutto in metri; le figure si calcolano con le stesse operazioni del programma.
  S.esempio = () => {
    const G = ES.geo, rett = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const X0 = 20, X1 = 290, Y0 = 20, Y1 = 280, quadro = [[rett(X0, Y0, X1, Y1)]];
    const bez = (a, b, c, n = 80) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]]; });
    // fascia larga w attorno a un asse (poligono: lato sinistro all'andata, destro al ritorno)
    const fascia = (asse, w) => { const L = [], R = []; asse.forEach((q, i) => { const a = asse[Math.max(0, i - 1)], b = asse[Math.min(asse.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * w / 2, ny = dx / l * w / 2; L.push([q[0] + nx, q[1] + ny]); R.push([q[0] - nx, q[1] - ny]); }); return [[L.concat(R.reverse())]]; };
    const disco = (c, r, n = 144) => [[Array.from({ length: n }, (_, i) => [c[0] + r * Math.cos(2 * Math.PI * i / n), c[1] + r * Math.sin(2 * Math.PI * i / n)])]];
    const tondo = M => M.map(P => P.map(r => r.map(q => [Math.round(q[0] * 1000) / 1000, Math.round(q[1] * 1000) / 1000])));
    // Strada esistente: asse curvo da ovest a est, larga 12 m
    const assePS = bez([X0 - 5, 150], [150, 45], [X1 + 5, 120]), strada = tondo(G.intersezione(fascia(assePS, 12), quadro));
    const C = assePS[40], R = 22;
    // Rami dello svincolo (10 m) e rotatoria; ingombro del cantiere (occupazione) più largo
    const ramoN = bez(C, [150, 190], [215, Y1 + 5]), ramoS = bez(C, [175, 45], [235, Y0 - 5]);
    const opera = tondo(G.intersezione(G.unione([disco(C, R), fascia(ramoN, 10), fascia(ramoS, 10)]), quadro));
    const cantiere = tondo(G.intersezione(G.unione([disco(C, R + 9), fascia(ramoN, 28), fascia(ramoS, 28)]), quadro));
    // Particelle: griglia irregolare (lati inclinati) su due fogli, tagliata dalla strada esistente
    const xF = 155, xs = [[X0, X0], [62, 70], [108, 112], [xF, xF], [198, 205], [246, 240], [X1, X1]], ys = [[Y0, Y0], [68, 78], [118, 112], [170, 176], [225, 218], [Y1, Y1]];
    const vx = (i, y) => xs[i][0] + (xs[i][1] - xs[i][0]) * (y - Y0) / (Y1 - Y0), vy = (j, x) => ys[j][0] + (ys[j][1] - ys[j][0]) * (x - X0) / (X1 - X0);
    const inc = (i, j) => { let x = xs[i][0], y = 0; for (let k = 0; k < 4; k++) { y = vy(j, x); x = vx(i, y); } return [x, y]; };
    const parti = [], num = { 10: 100, 11: 20 };
    for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < ys.length; j++) {
      const cella = [[[inc(i, j), inc(i + 1, j), inc(i + 1, j + 1), inc(i, j + 1)]]];
      G.differenza(cella, strada).forEach(P => {
        const pts = P[0], a = Math.abs(G.areaAnello(pts)); if (a < 40) return;
        const lp = G.puntoEtichetta(P), fg = lp[0] < xF ? 10 : 11;
        parti.push({ pts: pts.map(q => [Math.round(q[0] * 1000) / 1000, Math.round(q[1] * 1000) / 1000]), lp, a, fg, num: String(num[fg]++) });
      });
    }
    // Condotta in servitù: fascia di 6 m (fuori dall'opera) e pozzetti 3×3 lungo l'asse
    const asseC = bez([X0, 236], [150, 252], [X1, 206]);
    const fasciaC = tondo(G.differenza(G.intersezione(fascia(asseC, 6), quadro), opera, strada));
    const pozzetti = [0.12, 0.32, 0.72, 0.9].map(t => { const q = asseC[Math.round(t * 80)]; return rett(q[0] - 1.5, q[1] - 1.5, q[0] + 1.5, q[1] + 1.5); });
    // Case: rettangoli ruotati dentro le particelle, lontani dalle opere
    const casa = (c, w, h, a) => { const cs = Math.cos(a * Math.PI / 180), sn = Math.sin(a * Math.PI / 180); return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [Math.round((c[0] + x * cs - y * sn) * 100) / 100, Math.round((c[1] + x * sn + y * cs) * 100) / 100]); };
    const ostacoli = G.unione([cantiere, strada, G.intersezione(fascia(asseC, 14), quadro)]);
    const case_ = [[[40, 262], 16, 10, 8], [[88, 200], 14, 11, -12], [[40, 45], 15, 10, 20], [[265, 255], 13, 9, -5], [[262, 60], 18, 12, 15], [[95, 40], 12, 9, 0], [[265, 160], 14, 10, 30], [[45, 205], 10, 8, 0]]
      .map(([c, w, h, a]) => casa(c, w, h, a)).filter(r => !G.intersezione([[r]], ostacoli).length && parti.some(q => r.every(v => G.inAnello(v[0], v[1], q.pts))));
    // Aree d'intervento: esproprio = opera sulle proprietà private (la strada esistente è già pubblica);
    // occupazione = fascia di cantiere attorno; servitù = condotta; ingombro opere = pozzetti
    const espr = G.differenza(opera, strada), occ = G.differenza(cantiere, opera, strada, fasciaC); // senza sovrapposizioni
    // il DXF ha solo contorni chiusi: le figure con fori (l'occupazione attorno alla rotatoria) si tagliano in pezzi
    const anelli = M => M.flatMap(P => G.senzaBuchi(P)).filter(r => Math.abs(G.areaAnello(r)) > 0.05);
    // richiami: una ditta per ogni particella toccata dall'esproprio (fino a 6)
    const tocca = parti.filter(q => G.areaMP(G.intersezione([[q.pts]], espr)) > 5).slice(0, 6);
    const richiami = tocca.map((q, i) => [i + 1, [q.lp[0] + 9, q.lp[1] + 7], [q.lp[0] + 2, q.lp[1] + 2]]);
    const giro = Array.from({ length: 145 }, (_, i) => [C[0] + (R - 5) * Math.cos(2 * Math.PI * i / 144), C[1] + (R - 5) * Math.sin(2 * Math.PI * i / 144)]);
    const ang = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
    return {
      C, R, xFoglio: xF, strada: anelli(strada), parti, case: case_,
      espr: anelli(espr), occ: anelli(occ), serv: anelli(fasciaC), servop: pozzetti,
      assi: [giro, ramoN.filter(q => Math.hypot(q[0] - C[0], q[1] - C[1]) > R), ramoS.filter(q => Math.hypot(q[0] - C[0], q[1] - C[1]) > R), asseC],
      etStrada: [assePS[12][0], assePS[12][1] + 0.5, ang(assePS[11], assePS[13])], etRami: [[ramoN[40][0] - 11, ramoN[40][1], 'Ramo nord', ang(ramoN[39], ramoN[41])], [ramoS[42][0] + 11, ramoS[42][1], 'Ramo sud', ang(ramoS[41], ramoS[43])]],
      etCondotta: [asseC[45][0], asseC[45][1] + 4.5, ang(asseC[44], asseC[46])], richiami, opera
    };
  };

  S.dxf = (opt = {}) => {
    const f = n => (Math.round(n * 10000) / 10000).toString(), o = [];
    const L = new Set(S.LAYER.map(l => l[0]));
    const ent = [];
    // polilinea (con archi: b = bulge del lato che parte dal vertice), linea, cerchio, testo
    const poli = (layer, pts, chiusa = true, colore) => { ent.push('0', 'POLYLINE', '8', layer); if (colore) ent.push('62', String(colore)); ent.push('66', '1', '10', '0', '20', '0', '30', '0', '70', chiusa ? '1' : '0'); pts.forEach(q => { ent.push('0', 'VERTEX', '8', layer, '10', f(q[0]), '20', f(q[1]), '30', '0'); if (q[2]) ent.push('42', f(q[2])); }); ent.push('0', 'SEQEND', '8', layer); };
    const linea = (layer, a, b) => ent.push('0', 'LINE', '8', layer, '10', f(a[0]), '20', f(a[1]), '30', '0', '11', f(b[0]), '21', f(b[1]), '31', '0');
    const cerchio = (layer, c, r) => ent.push('0', 'CIRCLE', '8', layer, '10', f(c[0]), '20', f(c[1]), '30', '0', '40', f(r));
    const testo = (layer, x, y, t, h, centro = true, rot = 0) => { ent.push('0', 'TEXT', '8', layer, '10', f(x), '20', f(y), '30', '0', '40', f(h), '1', t, '7', 'ESPROPRI'); if (rot) ent.push('50', f(rot)); if (centro) ent.push('72', '1', '73', '2', '11', f(x), '21', f(y), '31', '0'); };
    const rett = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

    if (opt.esempio !== false) {
      const ex = S.esempio();
      // Fogli: limite e scritte
      poli('FOGLI', [[ex.xFoglio, 18], [ex.xFoglio, 282]], false);
      testo('FOGLI', 85, 272, 'FOGLIO 10', 5); testo('FOGLI', 262, 272, 'FOGLIO 11', 5);
      // Strada statale esistente (senza numero), con i bordi curvi
      ex.strada.forEach(r => poli('STRADE_ACQUE', r));
      testo('TOPONIMI', ex.etStrada[0], ex.etStrada[1], 'S.S. 51 – strada esistente', 2.5, true, ex.etStrada[2]);
      // Particelle con il numero dentro
      ex.parti.forEach(q => { poli('PARTICELLE', q.pts); testo('PARTICELLE_NUMERI', q.lp[0], q.lp[1], q.num, q.a < 250 ? 1.2 : 2); });
      // Case (fabbricati) con il retino facoltativo
      ex.case.forEach(r => { poli('FABBRICATI', r); poli('RETINI', r); });
      // Opera di progetto: assi dei rami e anello della rotatoria
      ex.assi.forEach(r => poli('OPERA_PROGETTO', r, false));
      testo('TOPONIMI', ex.C[0], ex.C[1], 'Rotatoria', 2.2); testo('TOPONIMI', ex.C[0], ex.C[1] - 3.5, 'di progetto', 1.8);
      ex.etRami.forEach(([x, y, t, rot]) => testo('TOPONIMI', x, y, t, 2, true, rot));
      testo('TOPONIMI', ex.etCondotta[0], ex.etCondotta[1], 'Condotta DN 400 di progetto', 1.8, true, ex.etCondotta[2]);
      // Aree d'intervento
      ex.espr.forEach(r => poli('ESPROPRIO', r));
      ex.occ.forEach(r => poli('OCCUPAZIONE_TEMPORANEA', r));
      ex.serv.forEach(r => poli('SERVITU_FASCIA', r));
      ex.servop.forEach(r => poli('SERVITU_INGOMBRO_OPERE', r));
      // Quote
      linea('QUOTE', ex.C, [ex.C[0] + ex.R, ex.C[1]]); testo('QUOTE', ex.C[0] + ex.R / 2, ex.C[1] + 1.6, 'R = ' + String(ex.R).replace('.', ',') + ',00', 1.5);
      // Richiami delle ditte (numero di piano) sulle particelle interessate
      ex.richiami.forEach(([n, c, a]) => { cerchio('RICHIAMI_DITTE', c, 4); testo('RICHIAMI_DITTE', c[0], c[1], String(n), 2.5); poli('RICHIAMI_DITTE', [[c[0] + (a[0] - c[0]) * 4 / Math.hypot(a[0] - c[0], a[1] - c[1]), c[1] + (a[1] - c[1]) * 4 / Math.hypot(a[0] - c[0], a[1] - c[1])], a], false); });
    }
    // Cornice A3 orizzontale in scala 1:1000 (420 × 297 m = mm sulla carta)
    poli('CARTIGLIO', rett(0, 0, 420, 297)); poli('CARTIGLIO', rett(10, 10, 410, 287));
    // Legenda: campioni colorati sul layer LEGENDA (colore forzato), così non sono aree
    poli('LEGENDA', rett(300, 120, 405, 282)); testo('LEGENDA', 352.5, 276, 'LEGENDA', 3.5);
    S.LAYER.slice(0, 11).forEach(([n, col, , , d], i) => {
      const y = 266 - i * 13;
      // campione pieno del colore del layer (SOLID) con il bordo
      ent.push('0', 'SOLID', '8', 'LEGENDA', '62', String(col), '10', f(304), '20', f(y - 3), '30', '0', '11', f(314), '21', f(y - 3), '31', '0', '12', f(304), '22', f(y + 3), '32', '0', '13', f(314), '23', f(y + 3), '33', '0');
      poli('LEGENDA', rett(304, y - 3, 314, y + 3), true, col);
      testo('LEGENDA', 318, y + 1.6, n, 1.9, false);
      testo('LEGENDA', 318, y - 2.4, d.length > 58 ? d.slice(0, 56) + '…' : d, 1.3, false);
    });
    // Cartiglio con i campi da compilare e le regole di disegno
    poli('CARTIGLIO', rett(300, 15, 405, 115));
    testo('CARTIGLIO', 352.5, 108, 'PIANO PARTICELLARE', 3.6); testo('CARTIGLIO', 352.5, 102.5, 'DI ESPROPRIO', 3.6);
    [['Comune', 'Comune di ____________'], ['Opera', '______________________'], ['Fogli di mappa', '10 - 11'], ['Scala', '1:1000 (unità di disegno: metri)'], ['Data / revisione', '__/__/____  rev. __'], ['Tavola', '__ di __']].forEach(([k, v], i) => { const y = 95 - i * 8; linea('CARTIGLIO', [303, y - 3], [402, y - 3]); testo('CARTIGLIO', 304, y, k + ':', 1.8, false); testo('CARTIGLIO', 335, y, v, 1.8, false); });
    ['REGOLE (lettura automatica in ESPROPRI_SISTEM):', '1. Aree e particelle: sempre polilinee CHIUSE sul layer giusto.', '2. Numero della particella dentro il suo poligono (PARTICELLE_NUMERI).', '3. Foglio: scritta «FOGLIO n» nel foglio o «Fg.n mapp.m».', '4. Disegno in metri, scala reale (1 unità = 1 m).'].forEach((t, i) => testo('CARTIGLIO', 304, 44 - i * 5.5, t, 1.5, false));
    // Intestazione e tabelle
    o.push('0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '6', '9', '$LUNITS', '70', '2', '9', '$LTSCALE', '40', '1.0', '9', '$TEXTSTYLE', '7', 'ESPROPRI', '9', '$EXTMIN', '10', '0', '20', '0', '30', '0', '9', '$EXTMAX', '10', '420', '20', '297', '30', '0', '0', 'ENDSEC');
    o.push('0', 'SECTION', '2', 'TABLES');
    const LT = [['CONTINUOUS', 'Solid line', []], ['DASHED', 'Tratteggiata __ __ __', [4, -2]], ['DASHDOT', 'Tratto punto __ . __ .', [6, -1.5, 0, -1.5]]];
    o.push('0', 'TABLE', '2', 'LTYPE', '70', String(LT.length));
    LT.forEach(([n, d, p]) => { o.push('0', 'LTYPE', '2', n, '70', '0', '3', d, '72', '65', '73', String(p.length), '40', f(p.reduce((a, b) => a + Math.abs(b), 0))); p.forEach(v => o.push('49', f(v))); });
    o.push('0', 'ENDTAB');
    o.push('0', 'TABLE', '2', 'LAYER', '70', String(L.size));
    S.LAYER.forEach(([n, c, lt]) => o.push('0', 'LAYER', '2', n, '70', '0', '62', String(c), '6', lt));
    o.push('0', 'ENDTAB');
    o.push('0', 'TABLE', '2', 'STYLE', '70', '1', '0', 'STYLE', '2', 'ESPROPRI', '70', '0', '40', '0', '41', '1', '50', '0', '71', '0', '42', '2', '3', 'arial.ttf', '4', '', '0', 'ENDTAB');
    o.push('0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', ...ent, '0', 'ENDSEC', '0', 'EOF');
    return o.join('\r\n') + '\r\n';
  };

  // Guida allo standard in HTML (stessa fonte dei layer del modello)
  S.guidaHtml = () => {
    const E = ES.U.esc;
    const aci = { 1: '#ff0000', 2: '#e6c700', 4: '#00b4c8', 5: '#0000ff', 6: '#ff00ff', 7: '#222222', 8: '#808080', 30: '#ff7f00' };
    return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Standard DXF piano particellare</title>
<style>body{font:14px/1.5 "Segoe UI",system-ui,sans-serif;max-width:900px;margin:24px auto;padding:0 16px;color:#1c2330}h1{font-size:22px}h2{font-size:17px;margin-top:22px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #ccd3dd;padding:5px 7px;text-align:left;vertical-align:top}th{background:#eef2f8}code{background:#f2f4f7;padding:1px 4px;border-radius:4px}.sw{display:inline-block;width:14px;height:14px;border:1px solid #555;vertical-align:middle;margin-right:6px}@media print{body{margin:0}}</style></head><body>
<h1>Standard DXF per i piani particellari</h1>
<p>Modello base <code>Standard_Piano_Particellare.dxf</code> (formato DXF R12, apribile con qualsiasi CAD): layer, colori, tipi di linea, stile dei testi, cornice A3 in scala 1:1000, cartiglio, legenda e un esempio completo di svincolo a rotatoria (strada statale esistente in curva, rotatoria e due rami nuovi in curva, 36 particelle irregolari su due fogli, case, esproprio, occupazione temporanea attorno al cantiere, condotta in servitù con i pozzetti, richiami delle ditte). Un piano disegnato con queste regole si legge in ESPROPRI_SISTEM senza correzioni.</p>
<h2>Regole di disegno</h2><ol>
<li><b>Unità: metri</b>, coordinate reali (1 unità = 1 m). Si può lavorare anche nelle coordinate catastali o Gauss-Boaga: contano solo le distanze.</li>
<li><b>Particelle e aree d'intervento: sempre polilinee chiuse</b> sul layer giusto. Le aree possono stare a cavallo di più particelle: il programma le divide particella per particella.</li>
<li><b>Il numero della particella si scrive dentro il suo poligono</b> sul layer <code>PARTICELLE_NUMERI</code>: <code>100</code>, <code>100 sub 2</code>, o <code>Fg.10 mapp.100</code>.</li>
<li><b>Foglio</b>: una scritta <code>FOGLIO 10</code> dentro l'area di ogni foglio (layer <code>FOGLI</code>), oppure il foglio nell'etichetta della particella.</li>
<li>Una superficie per tipo: esproprio, servitù-ingombro opere, servitù-fascia, occupazione temporanea. Se due aree si sovrappongono si conta una volta sola, nel tipo più importante (esproprio, poi ingombro opere, poi fascia, poi occupazione).</li>
<li>Retini e campiture sono facoltativi (layer <code>RETINI</code> o sul layer dell'area): il programma legge le aree dalle polilinee.</li>
<li>Cartiglio, legenda, quote, toponimi e richiami delle ditte stanno sui loro layer: il programma non li legge come particelle o numeri.</li></ol>
<h2>Layer</h2><table><thead><tr><th>Layer</th><th>Colore</th><th>Linea</th><th>Per il programma</th><th>Cosa contiene</th></tr></thead><tbody>
${S.LAYER.map(([n, c, lt, r, d]) => `<tr><td><code>${E(n)}</code></td><td><span class="sw" style="background:${aci[c] || '#000'}"></span>${c}</td><td>${E(lt)}</td><td>${E(r)}</td><td>${E(d)}</td></tr>`).join('')}</tbody></table>
<h2>Testi (stile ESPROPRI, Arial)</h2><table><thead><tr><th>Testo</th><th>Altezza (m a 1:1000 = mm sulla carta)</th></tr></thead><tbody>${S.TESTI.map(([t, h]) => `<tr><td>${E(t)}</td><td>${String(h).replace('.', ',')}</td></tr>`).join('')}</tbody></table>
<h2>Come si usa con ESPROPRI_SISTEM</h2><ol><li>Apri il modello in CAD, cancella l'esempio (tieni layer, cornice, cartiglio e legenda) e disegna il tuo piano.</li><li>Salva in DXF e importalo da <b>Importa › Disegno</b> con unità «metri»: i layer si riconoscono da soli.</li><li>La planimetria ricostruita da un PDF si esporta (Esporta DXF) con gli stessi layer: si corregge in CAD e si reimporta.</li></ol>
</body></html>`;
  };
})(ES);
