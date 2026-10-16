// ESPROPRI_SISTEM · interfaccia (parte 2): ditte e iter, stato di consistenza (foto e PDF firmato), tavola, indennità,
// documenti (modelli integrati e modelli Word), scadenze, normativa.
(function () {
  'use strict';
  const U = ES.U, A = ES.analisi, C = ES.cat, S = ES.stima, I = ES.iter, M = ES.modelli, T = ES.tavola;
  const $ = s => document.querySelector(s), E = U.esc, APP = window.APP;
  const san = s => String(s || '').replace(/[\u2010-\u2015]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\\/:*?"<>|«»\u201c\u201d]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  // Byte → base64 a blocchi (gli array grandi non si possono passare tutti insieme a fromCharCode)
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };

  // ---------- Immagini: SVG → PNG (per Word e per i PDF) ----------
  APP.svgPng = (svg, larghezzaPx = 2000) => new Promise((res, rej) => {
    const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg), w = m ? +m[1] : 170, h = m ? +m[2] : 200;
    const img = new Image(), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = larghezzaPx; cv.height = Math.round(larghezzaPx * h / w);
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      cv.toBlob(async b => res({ png: new Uint8Array(await b.arrayBuffer()), w: cv.width, h: cv.height, mm: w }), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Immagine non generata')); };
    img.src = url;
  });
  const svgData = svg => 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));

  // ---------- Documenti: modelli e generazione ----------
  // Libreria dei modelli dell'utente (vale per tutte le pratiche): testi base modificati e modelli nuovi
  APP.lib = () => ({ base: APP.DB.modelliBase || (APP.DB.modelliBase = {}), custom: APP.DB.modelliCustom || (APP.DB.modelliCustom = []) });
  APP.modello = k => M.catalogo(APP.lib())[k];
  APP.testoModello = (p, k) => M.testo(k, p, APP.lib());
  // [{ctx, blocchi}] per ogni documento del modello (testo: per l'anteprima di un testo non ancora salvato)
  APP.componi = (p, k, ditteSel, testo) => {
    const m = APP.modello(k), calc = S.calcola(p);
    return M.contesti(p, calc, m.ambito, ditteSel).map(ctx => ({ ctx, blocchi: M.blocchi(M.mustache(testo ?? APP.testoModello(p, k), ctx), ctx) }));
  };
  async function immaginiBlocchi(p, docs, perWord) {
    const calc = S.calcola(p);
    for (const d of docs) for (const b of d.blocchi) if (b.t === 'img' && b.ref === 'planimetria' && p.geo) {
      const svg = b.ditta ? T.estratto(p, calc, b.ditta, +(b.opt.scala || 1000)) : T.foglio(p, calc, { formato: 'A4', orient: 'P' });
      if (perWord) { try { Object.assign(b, await APP.svgPng(svg, 1800), { mm: 165 }); } catch (e) { /* senza immagine */ } }
      else { b.src = svgData(svg); b.mm = 170; }
    }
  }
  const titoloDoc = m => san(m.nome.slice(0, 70));
  const unisci = L => { const B = []; L.forEach((d, i) => { if (i) B.push({ t: 'pb' }); B.push(...d.blocchi); }); return B; };
  const perDitta = docs => { const per = new Map(); docs.forEach(d => { const k = d.ctx._dittaId; (per.get(k) || per.set(k, []).get(k)).push(d); }); return per; };
  const AMBITI = { intestatario: 'una lettera per ogni intestatario', ditta: 'un documento per ditta', pratica: 'un documento per la pratica' };
  // Salva una serie di file del fascicolo: nel programma installato nelle cartelle, nel browser un solo download (ZIP se più file)
  APP.salvaFile = async (p, files, nomeZip) => {
    if (!files.length) return;
    if (APP.FS.ok) {
      for (const f of files) await window.desktop.fsScrivi(f.rel, f.dati);
      APP.toast(files.length === 1 ? 'Salvato: ' + files[0].rel.split('/').slice(1).join(' › ') : files.length + ' file salvati nel fascicolo (generale e cartelle delle ditte)', 5000);
      return;
    }
    if (files.length === 1) { APP.scarica(files[0].rel.split('/').pop(), files[0].dati); return; }
    const base = APP.FS.dirPratica(p) + '/';
    APP.scarica(san(nomeZip) + '.zip', ES.office.zip(files.map(f => ({ name: f.rel.startsWith(base) ? f.rel.slice(base.length) : f.rel, data: f.dati }))), 'application/zip');
  };
  // Registro dei documenti prodotti: per ogni file la ditta a cui appartiene (null = file generale o della pratica)
  function logDoc(p, files, k, nome, opt) {
    const ora = new Date().toISOString();
    files.forEach(f => p.docs.push({ id: U.id(), data: U.oggi(), ora, modello: k, nome, rel: f.rel, file: f.rel.split('/').pop(), ditta: f.ditta || null, ditte: f.ditta ? null : (opt.ditte || null), formato: f.rel.split('.').pop() }));
  }
  // Registra la data del passo per le ditte coinvolte (solo dove non c'è già)
  function registra(p, opt) {
    if (!opt.registra || !opt.registra.passo) return 0;
    let n = 0;
    p.ditte.filter(d => !opt.ditte || opt.ditte.includes(d.id)).forEach(d => { const e = d.ev[opt.registra.passo] = d.ev[opt.registra.passo] || {}; if (!e.data) { e.data = opt.registra.data || U.oggi(); n++; } });
    return n;
  }
  // Genera un modello per tutte le ditte selezionate: file generale (tutte le lettere unite) in «00 GENERALE»
  // e il documento di ogni ditta nella sua cartella. opt: {ditte, generale, perDitta, registra:{passo, data}}
  APP.generaTutti = async (p, k, opt = {}) => {
    if (k.startsWith('w:')) return generaWordUtente(p, APP.DB.modelliWord.find(w => 'w:' + w.id === k), opt);
    const m = APP.modello(k); if (!m) return;
    const docs = APP.componi(p, k, opt.ditte); if (!docs.length) { APP.toast('Nessuna ditta selezionata'); return; }
    APP.toast('Preparazione dei documenti…');
    await immaginiBlocchi(p, docs, true);
    const oggi = U.oggi(), files = [], titolo = titoloDoc(m);
    const optW = ctx => ({ intestazione: M.intestazione(ctx), titolo: m.nome });
    if (m.ambito === 'pratica') files.push({ rel: APP.FS.dirGenerale(p) + '/' + titolo + ' (' + oggi + ').docx', dati: ES.office.docx(unisci(docs), optW(docs[0].ctx)) });
    else {
      if (opt.generale !== false) files.push({ rel: APP.FS.dirGenerale(p) + '/' + titolo + ' - TUTTE LE DITTE (' + oggi + ').docx', dati: ES.office.docx(unisci(docs), optW(docs[0].ctx)) });
      if (opt.perDitta !== false) perDitta(docs).forEach((L, id) => { const d = p.ditte.find(x => x.id === id); files.push({ rel: APP.FS.dirDitta(p, d) + '/' + titolo + ' - Ditta ' + d.n + ' (' + oggi + ').docx', dati: ES.office.docx(unisci(L), optW(L[0].ctx)), ditta: id }); });
    }
    await APP.salvaFile(p, files, APP.FS.dirPratica(p) + ' - ' + titolo);
    const n = registra(p, opt);
    logDoc(p, files, k, m.nome, opt);
    APP.salva(); if (n) APP.render();
  };
  async function generaWordUtente(p, w, opt) {
    const buf = Uint8Array.from(atob(w.dati), ch => ch.charCodeAt(0)).buffer, calc = S.calcola(p);
    const ctxs = M.contesti(p, calc, w.ambito, opt.ditte).map(c => ({ ...c, _unione: M.unione(c) }));
    if (!ctxs.length) return;
    const img = { planimetria: async ctx => (p.geo ? APP.svgPng(ctx._dittaId ? T.estratto(p, calc, ctx._dittaId, 1000) : T.foglio(p, calc, { formato: 'A4', orient: 'P' }), 1800).then(r => ({ ...r, mm: 160 })) : null) };
    const oggi = U.oggi(), files = [], titolo = san(w.nome);
    if (w.ambito === 'pratica' || opt.generale !== false) files.push({ rel: APP.FS.dirGenerale(p) + '/' + titolo + (w.ambito === 'pratica' ? '' : ' - TUTTE LE DITTE') + ' (' + oggi + ').docx', dati: await ES.office.compila(buf, ctxs, img) });
    if (w.ambito !== 'pratica' && opt.perDitta !== false) {
      const per = new Map(); ctxs.forEach(c => { (per.get(c._dittaId) || per.set(c._dittaId, []).get(c._dittaId)).push(c); });
      for (const [id, L] of per) { const d = p.ditte.find(x => x.id === id); files.push({ rel: APP.FS.dirDitta(p, d) + '/' + titolo + ' - Ditta ' + d.n + ' (' + oggi + ').docx', dati: await ES.office.compila(buf, L, img), ditta: id }); }
    }
    await APP.salvaFile(p, files, APP.FS.dirPratica(p) + ' - ' + titolo);
    logDoc(p, files, 'w:' + w.id, w.nome, opt);
    if (registra(p, opt)) APP.render();
    APP.salva();
  }
  // Anteprima HTML
  APP.anteprima = async (p, k, ditteSel, testo) => {
    const docs = APP.componi(p, k, ditteSel, testo); await immaginiBlocchi(p, docs, false);
    return docs.map(d => `<div class="doc-prev">${M.html(d.blocchi)}</div>`).join('<div style="height:14px"></div>');
  };
  const CSS_STAMPA = '<style>@media print{.doc-print{font:10.5pt/1.35 Arial,sans-serif;color:#000;break-after:page}.doc-print:last-child{break-after:auto}.doc-print p{margin:0 0 5pt}.doc-print .doc-pb{break-after:page}.doc-t{border-collapse:collapse;width:100%}.doc-t th,.doc-t td{border:1px solid #777;padding:1.5pt 3pt}.doc-t th{background:#e8edf5;-webkit-print-color-adjust:exact;print-color-adjust:exact}img{max-width:100%}@page{size:A4;margin:18mm 16mm}}</style>';
  // PDF: generale (stampa o fascicolo) e, nel programma installato, anche uno per ditta
  APP.pdfTutti = async (p, k, opt = {}) => {
    const m = APP.modello(k); const docs = APP.componi(p, k, opt.ditte); if (!docs.length) return;
    await immaginiBlocchi(p, docs, false);
    const html = L => CSS_STAMPA + L.map(d => `<section class="doc-print">${M.html(d.blocchi)}</section>`).join('');
    const titolo = titoloDoc(m), oggi = U.oggi();
    if (!(window.desktop && window.desktop.pdfDati && APP.FS.ok)) { $('#print').innerHTML = html(docs); window.print(); return; }
    const files = [];
    $('#print').innerHTML = html(docs);
    files.push({ rel: APP.FS.dirGenerale(p) + '/' + titolo + (m.ambito === 'pratica' ? '' : ' - TUTTE LE DITTE') + ' (' + oggi + ').pdf', dati: await window.desktop.pdfDati({}) });
    if (m.ambito !== 'pratica' && opt.perDitta !== false) for (const [id, L] of perDitta(docs)) {
      const d = p.ditte.find(x => x.id === id); $('#print').innerHTML = html(L);
      files.push({ rel: APP.FS.dirDitta(p, d) + '/' + titolo + ' - Ditta ' + d.n + ' (' + oggi + ').pdf', dati: await window.desktop.pdfDati({}), ditta: id });
    }
    await APP.salvaFile(p, files, titolo);
    logDoc(p, files, k, m.nome, opt);
    if (registra(p, opt)) APP.render();
    APP.salva();
  };
  // Compatibilità: stampa di un modello (es. elenco ditte dal piano particellare)
  APP.stampaModello = (k, ambito, ditteSel, nelFascicolo) => APP.pdfTutti(APP.pr(), k, { ditte: ditteSel, perDitta: false, _fasc: nelFascicolo });

  // ---------- Vista: Ditte ----------
  APP.viste.ditte = (m, p) => {
    if (APP.arg) return dettaglioDitta(m, p, p.ditte.find(d => d.id === APP.arg));
    const c = APP.calc(), proc0 = p.impost.procedura, oggi = U.oggi();
    const sc = I.scadenze(p).filter(s => s.ditta && !s.fatto && !s.min);
    const ctrl = new Map(p.ditte.map(d => [d.id, C.controlli(d, p.particelle.filter(x => x.ditta === d.id)).filter(x => x.livello !== 'info')]));
    const daCompl = p.ditte.filter(d => ctrl.get(d.id).length);
    m.innerHTML = `<h2>👥 Ditte e iter</h2>${daCompl.length ? `<div class="ban">⚠ ${daCompl.length} ditte da completare: ${[...new Set(daCompl.flatMap(d => ctrl.get(d.id).map(x => x.campo === 'cf' ? (x.livello === 'manca' ? 'codici fiscali mancanti' : 'codici fiscali da verificare') : 'quote o intestatari da verificare')))].join(', ')}. Apri la ditta per inserirli a mano.</div>` : ''}<div class="row" style="margin-bottom:10px"><input id="dq" placeholder="Cerca per nome, C.F., mappale…" style="min-width:280px"><label class="chk"><input type="checkbox" id="dsolo"> Solo ditte da completare</label><span class="grow"></span><span class="mu">Percorso principale: <b>${E(S.PROCEDURE[proc0].nome)}</b></span></div>
<div class="ditte">${p.ditte.map(d => {
      const D = c.perD.get(d.id) || { tot: 0, aree: {} }, av = I.avanzamento(d, proc0), parts = p.particelle.filter(x => x.ditta === d.id);
      const prox = sc.filter(s => s.ditta === d).sort((a, b) => (a.data < b.data ? -1 : 1))[0];
      const st = prox ? I.statoScad(prox, oggi) : '';
      return `<div class="dc" data-d="${d.id}" data-ko="${ctrl.get(d.id).length ? 1 : 0}" data-q="${E(U.norm(d.intest.map(o => o.nome + ' ' + o.cf).join(' ') + ' ' + parts.map(x => x.fg + ' ' + x.map).join(' ')))}"><h4><span class="np">${E(d.n)}</span>${E(d.intest.map(o => o.nome).join(', ').slice(0, 90) || '(senza intestatari)')}</h4>
<div class="mu" style="margin-top:6px">${parts.map(x => 'Fg.' + E(x.fg) + ' ' + E(C.mappale(x))).join(' · ')}</div>${ctrl.get(d.id).length ? `<div style="margin-top:6px">${ctrl.get(d.id).map(x => `<span class="tag ${x.livello === 'errore' ? 't-ko' : 't-wa'}">⚠ ${E(x.msg)}</span>`).join(' ')}</div>` : ''}
<div class="row" style="margin-top:6px">${D.aree.espr ? `<span class="tag t-es">esproprio ${U.mq(D.aree.espr)} mq</span>` : ''}${D.aree.servop + D.aree.serv ? `<span class="tag t-sv">servitù ${U.mq(D.aree.servop + D.aree.serv)} mq</span>` : ''}${D.aree.occ ? `<span class="tag t-oc">occupazione ${U.mq(D.aree.occ)} mq</span>` : ''}<span class="grow"></span><b>${U.eur(D.tot)}</b></div>
<div class="bar"><i style="width:${Math.round(100 * av.fatti / av.totale)}%"></i></div>${(() => { const n = p.docs.filter(x => x.ditta === d.id).length, ni = d.intest.filter(o => !o.via && !o.pec).length; return (n ? `<span class="tag t-sv">📄 ${n} documenti</span> ` : '') + (ni ? `<span class="tag t-wa">📮 ${ni} indirizzi da inserire</span>` : ''); })()}
<div class="mu">${av.ultimo ? '✓ ' + E(av.ultimo.nome) : 'Iter non avviato'}${av.prossimo ? ' · prossimo: ' + E(av.prossimo.nome) : ''}${d.procedura ? ' · <b>' + E(S.PROCEDURE[d.procedura].breve) + '</b>' : ''}</div>
${prox ? `<div class="${st === 'scaduta' ? 'ko' : st === 'prossima' ? 'wa' : 'mu'}" style="font-size:12px;margin-top:3px">⏰ ${U.dataIt(prox.data)} – ${E(prox.cosa)}</div>` : ''}</div>`;
    }).join('') || '<div class="card vuoto">Nessuna ditta: importa l\'elenco ditte.</div>'}</div>`;
    m.querySelectorAll('[data-d]').forEach(x => x.onclick = () => APP.vai('ditte', x.dataset.d));
    const filtra = () => { const q = U.norm(m.querySelector('#dq').value), solo = m.querySelector('#dsolo').checked; m.querySelectorAll('[data-d]').forEach(x => { x.hidden = (q && !x.dataset.q.includes(q)) || (solo && x.dataset.ko !== '1'); }); };
    m.querySelector('#dq').oninput = filtra; m.querySelector('#dsolo').onchange = filtra;
  };

  function dettaglioDitta(m, p, d) {
    if (!d) { APP.vai('ditte'); return; }
    d.ev = d.ev || {}; d.foto = d.foto || []; d.intest = d.intest || [];
    const c = APP.calc(), D = c.perD.get(d.id) || { tot: 0, aree: {} }, proc = d.procedura || p.impost.procedura;
    const parts = p.particelle.filter(x => x.ditta === d.id);
    const passi = I.passi(proc);
    const scad = I.scadenze(p).filter(s => s.ditta === d);
    const MEZZI = ['Raccomandata A/R', 'PEC', 'Notifica (messo / ufficiale giudiziario)', 'A mano'];
    const intestCard = (o, i) => {
      const cfKo = !o.cf || !C.cfValido(o.cf), giur = C.giuridica(o);
      const v = (c, ph, st) => `<input data-o="${i}" data-c="${c}" value="${E(c === 'natoA' ? (o.natoA || o.sede || '') : o[c] || '')}"${ph ? ` placeholder="${E(ph)}"` : ''}${st ? ` style="${st}"` : ''}>`;
      const dest = [C.saluto(o), o.nome, o.via, [o.cap, o.citta, o.prov ? '(' + o.prov + ')' : ''].filter(Boolean).join(' '), o.pec ? 'PEC: ' + o.pec : ''].filter(Boolean);
      return `<div class="ic"><div class="row"><b class="grow">${E(o.nome || 'Nuovo intestatario')}</b><span class="tag">${E(C.diritto(o) || 'diritto da indicare')}</span><button class="s d" data-odel="${i}" title="Togli intestatario">✕</button></div>
<div class="g ic-g"><label class="f2">Cognome e nome / denominazione${v('nome')}</label><label>${giur ? 'Sede' : 'Nato/a a'}${v('natoA')}</label>${giur ? '' : `<label>il<input type="date" data-o="${i}" data-c="natoIl" value="${E(o.natoIl || '')}"></label>`}
<label class="f2">Codice fiscale / P.IVA${v('cf', 'da inserire', cfKo ? 'border-color:var(--ko);background:rgba(192,57,43,.08)' : '')}</label><label>Diritto${v('titolo', "Proprieta'")}</label><label>Quota${v('quota', '1/1')}</label>
<label class="chk"><input type="checkbox" data-o="${i}" data-c="cd" ${o.cd ? 'checked' : ''}> Coltivatore diretto / IAP</label></div>
<div class="res"><div class="mu">📮 <b>Indirizzo di residenza per le comunicazioni</b></div><div class="g ic-g"><label class="f2">Via e numero civico${v('via', 'Via Roma, 1')}</label><label>CAP${v('cap')}</label><label>Comune${v('citta')}</label><label>Prov.${v('prov', 'BL')}</label>
<label class="f2">PEC / e-mail${v('pec')}</label><label>Invio con<select data-o="${i}" data-c="mezzo"><option value="">${o.pec ? 'PEC (automatico)' : 'Raccomandata A/R (automatico)'}</option>${MEZZI.map(x => `<option ${o.mezzo === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label></div>
<div class="dest-prev" title="Come compare nelle lettere">${dest.map(E).join('<br>')}${o.via ? '' : '<br><span class="ko">indirizzo mancante</span>'}</div></div></div>`;
    };
    m.innerHTML = `<div class="row"><button id="dback">‹ Tutte le ditte</button><h2 style="margin:0" class="grow">Ditta ${E(d.n)} <span class="mu">${E(S.PROCEDURE[proc].nome)}</span></h2>${APP.FS.ok ? '<button id="dfold">📁 Cartella della ditta</button>' : ''}</div>
<div class="kpi" style="margin-top:10px"><div><small>Esproprio</small><b>${U.mq(D.aree.espr || 0)} mq</b></div><div><small>Servitù</small><b>${U.mq((D.aree.servop || 0) + (D.aree.serv || 0))} mq</b></div><div><small>Occupazione</small><b>${U.mq(D.aree.occ || 0)} mq</b></div><div><small>Indennità</small><b>${U.eur(D.tot)}</b></div>${D.ritenuta ? `<div><small>Ritenuta art. 35 (stima)</small><b>${U.eur(D.ritenuta)}</b></div>` : ''}</div>
${docDitta(p, d)}
${(() => { const L = C.controlli(d, parts); return L.length ? `<div class="ban ${L.some(x => x.livello === 'errore') ? 'err' : ''}">${L.map(x => (x.livello === 'info' ? 'ℹ ' : '⚠ ') + E(x.msg)).join('<br>')}</div>` : ''; })()}
<div class="card"><div class="row"><h3 style="margin:0" class="grow">Intestatari e indirizzi di residenza</h3><button id="dind">📮 Tutti gli indirizzi della pratica</button></div><div class="ics">${d.intest.map(intestCard).join('')}</div>
<div class="row" style="margin-top:8px"><button id="dadd">＋ Intestatario</button><span class="grow"></span><span class="mu">Attenzione: cambiare intestatari o quote cambia la composizione della ditta (stessi nomi e quote = stessa ditta).</span></div>
<div class="g" style="margin-top:10px"><label>N. ditta (piano)<input data-f="n"></label><label>Percorso per questa ditta<select data-f="procedura"><option value="">(quello della pratica)</option>${Object.entries(S.PROCEDURE).map(([k, v]) => `<option value="${k}">${v.nome}</option>`).join('')}</select></label>
<label class="chk"><input type="checkbox" data-f="cessione"> Indennità condivisa / cessione volontaria</label>
<label>Conduttore del fondo (fittavolo, mezzadro…)<input data-f="cond.nome"></label>
<label class="f">Osservazioni pervenute (compaiono negli atti)<input data-f="oss"></label><label class="f">Note interne<input data-f="note"></label></div></div>
<div class="card"><h3 style="margin-top:0">Particelle</h3><div class="tw" style="max-height:none"><table class="t"><thead><tr><th>Fg.</th><th>Mapp.</th><th>Qualità</th><th class="n">Sup.</th><th class="n">Esproprio</th><th class="n">Servitù</th><th class="n">Occupazione</th><th>Confini</th><th class="n">Indennità</th></tr></thead><tbody>
${parts.map(x => { const v = c.perP.get(x.id); return `<tr data-px="${x.id}"><td>${E(x.fg)}</td><td>${E(C.mappale(x))}</td><td>${E([x.qual, x.cls].filter(Boolean).join('/'))}</td><td class="n">${U.mq(x.sup)}</td><td class="n">${v.aree.espr ? U.mq(v.aree.espr) : ''}</td><td class="n">${v.aree.servop + v.aree.serv ? U.mq(v.aree.servop + v.aree.serv) : ''}</td><td class="n">${v.aree.occ ? U.mq(v.aree.occ) : ''}</td><td class="mu" style="white-space:normal;min-width:200px">${E(x.confini || '')}</td><td class="n">${U.eur(v.tot)}</td></tr>`; }).join('')}</tbody></table></div></div>
<div class="card"><h3 style="margin-top:0">Iter della ditta</h3><p class="mu">Per ogni passo registra date (invio e notifica/ricevimento), protocollo e mezzo; i documenti si generano nella cartella della ditta.</p><div class="passi">
${passi.map((ps, i) => { const e = d.ev[ps.k] || {}; const imm = /immissione|restituzione/.test(ps.k) || ps.k === 'avviso_imm'; return `<div class="passo ${e.data ? 'fatto' : ''}"><span class="nr">${i + 1}</span><div><div class="row"><b>${E(ps.nome)}</b><span class="mu">${E(ps.art)}</span><span class="grow"></span>${ps.modelli.filter(k => APP.modello(k)).map(k => `<button class="s" data-genp="${k}" title="Anteprima">👁</button><button class="s" data-gen="${k}" title="Crea il Word di questa ditta: ${E(APP.modello(k).nome)}">📄 ${E(APP.modello(k).nome.split(' ').slice(0, 4).join(' '))}…</button>`).join('')}</div>
<div class="g" style="margin-top:6px"><label>Data<input type="date" data-f="ev.${ps.k}.data"></label><label>Notifica / ricevimento<input type="date" data-f="ev.${ps.k}.notifica"></label><label>Protocollo<input data-f="ev.${ps.k}.prot"></label><label>Mezzo<select data-f="ev.${ps.k}.mezzo"><option value=""></option><option>Raccomandata A/R</option><option>PEC</option><option>Messo notificatore</option><option>Ufficiale giudiziario</option><option>A mano</option></select></label>${ps.k === 'immissione' || ps.k === 'restituzione' ? `<label>Ora<input data-f="ev.${ps.k}.ora" placeholder="10.30"></label><label>Luogo di ritrovo<input data-f="ev.${ps.k}.luogo"></label>` : ''}<label class="f2">Note<input data-f="ev.${ps.k}.note"></label></div>
${(ps.t || []).map(t => { const s = scad.find(x => x.cosa === t.nome && x.fase === ps.nome); return s ? `<div class="mu">⏰ ${E(t.nome)}: <b class="${I.statoScad(s) === 'scaduta' ? 'ko' : ''}">${U.dataIt(s.data)}</b></div>` : ''; }).join('')}${imm ? '' : ''}</div></div>`; }).join('')}
</div></div>
<div class="card"><h3 style="margin-top:0">Stato di consistenza: foto e verbale firmato</h3>
<p class="mu">1) Genera il verbale (passo «Stato di consistenza»), stampalo e fallo firmare in sito. 2) Carica le foto con la didascalia. 3) Carica la scansione PDF del verbale firmato. 4) Crea il PDF finale (verbale firmato + documentazione fotografica) nella cartella della ditta.</p>
<div class="row"><button id="dfoto">＋ Carica foto</button><button id="dscan">Carica verbale firmato (PDF)</button><span class="mu" id="dscann">${d.scan ? '📎 ' + E(d.scan.nome) : ''}</span><span class="grow"></span><button class="p" id="dpdf" ${d.foto.length || d.scan ? '' : 'disabled'}>Crea PDF finale</button></div>
<div class="foto" id="dft" style="margin-top:10px"></div></div>
<div class="card"><h3 style="margin-top:0">Documenti nel fascicolo</h3><div id="dfiles" class="files mu">${APP.FS.ok ? 'Lettura…' : 'Nel browser i documenti vengono scaricati; il fascicolo con le cartelle è disponibile nel programma installato.'}</div></div>`;
    APP.lega(m, d, el => { if (/^ev\.|procedura|cessione|^n$/.test(el.dataset.f)) APP.render(); });
    m.querySelector('#dback').onclick = () => APP.vai('ditte');
    const fo = m.querySelector('#dfold'); if (fo) fo.onclick = () => APP.FS.apri(APP.FS.dirDitta(p, d));
    m.querySelectorAll('[data-o]').forEach(el => el.onchange = () => {
      const o = d.intest[+el.dataset.o], c = el.dataset.c;
      o[c] = el.type === 'checkbox' ? el.checked : c === 'cf' ? el.value.trim().toUpperCase() : c === 'prov' ? el.value.trim().toUpperCase() : el.value.trim();
      if (c === 'natoA' && C.giuridica(o)) o.sede = o.natoA;
      if (INDIRIZZO.includes(c)) { const n = APP.propagaIndirizzo(p, o); if (n) APP.toast('Indirizzo aggiornato anche in ' + n + (n === 1 ? ' altra ditta' : ' altre ditte') + ' (stessa persona)'); }
      APP.salva(); if (['cf', 'quota', 'titolo', 'nome', 'via', 'cap', 'citta', 'prov', 'pec'].includes(c)) APP.render();
    });
    const di = m.querySelector('#dind'); if (di) di.onclick = () => APP.vai('indirizzi');
    attivaDocDitta(m, p, d);
    m.querySelectorAll('[data-odel]').forEach(b => b.onclick = async () => { if (await APP.conferma('Togliere l\'intestatario?', 'Togli')) { d.intest.splice(+b.dataset.odel, 1); APP.salva(); APP.render(); } });
    m.querySelector('#dadd').onclick = () => { d.intest.push({ id: U.id(), nome: '', titolo: "Proprieta'", quota: '1/1' }); APP.salva(); APP.render(); };
    m.querySelectorAll('[data-px]').forEach(r => r.onclick = () => APP.editParticella(p.particelle.find(x => x.id === r.dataset.px)));
    m.querySelectorAll('[data-gen]').forEach(b => b.onclick = async () => { try { await APP.generaTutti(p, b.dataset.gen, { ditte: [d.id], generale: false, perDitta: true }); APP.render(); } catch (e) { APP.toast('Errore: ' + e.message, 6000); } });
    m.querySelectorAll('[data-genp]').forEach(b => b.onclick = () => APP.vai('documenti', { ditte: [d.id], prev: b.dataset.genp }));
    fotoUI(m, p, d);
    if (APP.FS.ok) elencoFile(m.querySelector('#dfiles'), APP.FS.dirDitta(p, d));
  }
  const INDIRIZZO = ['via', 'cap', 'citta', 'prov', 'pec', 'mezzo'];
  // Stessa persona (stesso C.F.) in più ditte: l'indirizzo si scrive una volta sola
  APP.propagaIndirizzo = (p, o) => {
    if (!o.cf) return 0; let n = 0;
    p.ditte.forEach(d => d.intest.forEach(x => { if (x !== o && x.cf && x.cf.toUpperCase() === o.cf.toUpperCase()) { INDIRIZZO.forEach(k => { x[k] = o[k]; }); n++; } }));
    return n;
  };
  // Documenti prodotti per la ditta (registro), con apertura, anteprima e nuova generazione
  function docDitta(p, d) {
    const cat = M.catalogo(APP.lib());
    const propri = p.docs.filter(x => x.ditta === d.id).slice().reverse();
    const gen = p.docs.filter(x => !x.ditta && (!x.ditte || x.ditte.includes(d.id))).slice().reverse();
    const nomeM = x => x.nome || (cat[x.modello] || {}).nome || x.modello;
    const riga = (x, generale) => `<tr><td>${U.dataIt(x.data)}</td><td style="white-space:normal"><b>${E(nomeM(x))}</b>${generale ? ' <span class="tag">file generale</span>' : ''}<div class="mu">${E(x.file || '')}</div></td><td class="n" style="white-space:nowrap">${APP.FS.ok && x.rel ? `<button class="s" data-dapri="${x.id}">Apri</button>` : ''}${cat[x.modello] ? `<button class="s" data-dprev="${E(x.modello)}">👁 Anteprima</button><button class="s" data-drig="${E(x.modello)}">⟳ Rigenera</button>` : ''}</td></tr>`;
    return `<div class="card"><div class="row"><h3 style="margin:0" class="grow">📄 Documenti della ditta</h3>${APP.FS.ok ? '<button id="dfold2">📁 Apri la cartella</button>' : ''}</div>
${propri.length || gen.length ? `<div class="tw" style="max-height:40vh;margin-top:8px"><table class="t"><thead><tr><th>Data</th><th>Documento</th><th></th></tr></thead><tbody>${propri.map(x => riga(x)).join('')}${gen.map(x => riga(x, true)).join('')}</tbody></table></div>` : '<p class="mu">Nessun documento ancora: si creano dai passi dell\'iter qui sotto o da Documenti › «Genera per tutte le ditte».</p>'}</div>`;
  }
  function attivaDocDitta(m, p, d) {
    const f2 = m.querySelector('#dfold2'); if (f2) f2.onclick = () => APP.FS.apri(APP.FS.dirDitta(p, d));
    m.querySelectorAll('[data-dapri]').forEach(b => b.onclick = async () => { const x = p.docs.find(y => y.id === b.dataset.dapri); const r = await window.desktop.fsApriFile(x.rel); if (r && r.ok === false) APP.toast('File non trovato nel fascicolo: forse è stato spostato o rinominato', 6000); });
    m.querySelectorAll('[data-dprev]').forEach(b => b.onclick = async () => { const k = b.dataset.dprev; APP.dlg('Anteprima: ' + APP.modello(k).nome + ' – Ditta ' + d.n, await APP.anteprima(p, k, [d.id])); });
    m.querySelectorAll('[data-drig]').forEach(b => b.onclick = async () => { try { await APP.generaTutti(p, b.dataset.drig, { ditte: [d.id], generale: false, perDitta: true }); APP.render(); } catch (e) { APP.toast('Errore: ' + e.message, 6000); } });
  }

  // ---------- Vista: Indirizzi di residenza (tutti gli intestatari della pratica) ----------
  APP.viste.indirizzi = (m, p) => {
    // Una riga per persona: stessa persona (C.F., o nome se manca) in più ditte = una riga sola
    const per = new Map();
    p.ditte.forEach(d => d.intest.forEach(o => { const k = o.cf ? 'cf:' + o.cf.toUpperCase() : 'n:' + U.norm(o.nome) + ':' + d.id; const g = per.get(k) || per.set(k, { o, tutti: [], ditte: [] }).get(k); g.tutti.push(o); if (!g.ditte.includes(d.n)) g.ditte.push(d.n); }));
    const R = [...per.values()].sort((a, b) => U.cmp(a.ditte[0], b.ditte[0]) || U.cmp(a.o.nome, b.o.nome));
    const manc = R.filter(r => !r.o.via && !r.o.pec).length;
    m.innerHTML = `<div class="row"><button id="iback">‹ Ditte</button><h2 style="margin:0" class="grow">📮 Indirizzi di residenza</h2><button id="iexp">Esporta Excel da completare</button><button id="iimp">Importa indirizzi da Excel…</button></div>
<p class="mu">Indirizzo a cui inviare le comunicazioni per ogni intestatario. La stessa persona presente in più ditte compare una volta sola. ${manc ? `<b class="wa">${manc} indirizzi da inserire.</b>` : '<b class="ok">Tutti gli indirizzi sono inseriti.</b>'}</p>
<div class="row" style="margin-bottom:8px"><label class="chk"><input type="checkbox" id="isolo" ${APP._isolo ? 'checked' : ''}> Solo quelli da completare</label></div>
<div class="tw"><table class="t"><thead><tr><th>Ditta</th><th>Intestatario</th><th>C.F.</th><th>Via e civico</th><th>CAP</th><th>Comune</th><th>Prov.</th><th>PEC</th><th>Invio con</th></tr></thead><tbody>
${R.map((r, i) => (APP._isolo && (r.o.via || r.o.pec)) ? '' : `<tr><td>${r.ditte.map(E).join(', ')}</td><td>${E(r.o.nome)}<div class="mu">${E(C.diritto(r.o))}</div></td><td class="${!r.o.cf || !C.cfValido(r.o.cf) ? 'ko' : ''}">${E(r.o.cf || 'manca')}</td>${['via', 'cap', 'citta', 'prov', 'pec'].map(c => `<td><input data-ir="${i}" data-c="${c}" value="${E(r.o[c] || '')}" style="min-width:${c === 'via' ? 200 : c === 'cap' || c === 'prov' ? 60 : 130}px"></td>`).join('')}<td><select data-ir="${i}" data-c="mezzo"><option value="">automatico</option>${['Raccomandata A/R', 'PEC', 'Notifica (messo / ufficiale giudiziario)', 'A mano'].map(x => `<option ${r.o.mezzo === x ? 'selected' : ''}>${x}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>`;
    m.querySelector('#iback').onclick = () => APP.vai('ditte');
    m.querySelector('#isolo').onchange = e => { APP._isolo = e.target.checked; APP.render(); };
    m.querySelectorAll('[data-ir]').forEach(el => el.onchange = () => { const r = R[+el.dataset.ir], c = el.dataset.c, v = c === 'prov' ? el.value.trim().toUpperCase() : el.value.trim(); r.tutti.forEach(o => { o[c] = v; }); APP.salva(); });
    m.querySelector('#iexp').onclick = () => APP.scarica(san(p.nome) + ' - indirizzi.xlsx', ES.office.xlsx([{ nome: 'Indirizzi', righe: [['Ditte', 'Intestatario', 'Codice fiscale', 'Indirizzo', 'CAP', 'Comune', 'Provincia', 'PEC']].concat(R.map(r => [r.ditte.join(', '), r.o.nome, r.o.cf || '', r.o.via || '', r.o.cap || '', r.o.citta || '', r.o.prov || '', r.o.pec || ''])), larghezze: [8, 34, 18, 34, 8, 22, 9, 28] }]));
    m.querySelector('#iimp').onclick = async () => {
      const [f] = await APP.scegliFile('.xlsx,.csv'); if (!f) return;
      try {
        const t = await ES.tab.leggi(f.nome, f.buf), righe = t.fogli[0].righe;
        const mp = ES.tab.mappa(righe, { cf: C.CAMPI.cf, nome: C.CAMPI.intest.concat(['intestatario', 'nominativo']), via: C.CAMPI.via, cap: C.CAMPI.cap, citta: C.CAMPI.citta, prov: C.CAMPI.prov, pec: C.CAMPI.pec });
        if (mp.map.via == null || (mp.map.cf == null && mp.map.nome == null)) throw new Error('servono le colonne del codice fiscale (o del nome) e dell\'indirizzo');
        let n = 0, nt = 0;
        righe.slice(mp.riga + 1).forEach(rr => {
          const g = k => (mp.map[k] != null ? String(rr[mp.map[k]] ?? '').trim() : '');
          const cf = g('cf').toUpperCase(), nome = U.norm(g('nome'));
          const r = R.find(x => (cf && x.o.cf && x.o.cf.toUpperCase() === cf) || (!cf && nome && U.norm(x.o.nome) === nome));
          if (!r) { if (cf || nome) nt++; return; }
          ['via', 'cap', 'citta', 'prov', 'pec'].forEach(k => { const v = g(k); if (v) r.tutti.forEach(o => { o[k] = k === 'prov' ? v.toUpperCase() : v; }); });
          n++;
        });
        APP.salva(); APP.render(); APP.toast(n + ' indirizzi importati' + (nt ? ', ' + nt + ' righe senza corrispondenza' : ''), 6000);
      } catch (e) { APP.toast('Importazione non riuscita: ' + e.message, 6000); }
    };
  };

  async function elencoFile(el, rel) {
    const giro = async (r, liv) => { const L = await APP.FS.elenco(r); let o = ''; for (const f of L.sort((a, b) => U.cmp(a.nome, b.nome))) { o += `<div style="padding-left:${liv * 16}px">${f.dir ? '📁 ' + E(f.nome) : `<a data-open="${E(r + '/' + f.nome)}">📄 ${E(f.nome)}</a> <span class="mu">${new Date(f.mtime).toLocaleDateString('it-IT')}</span>`}</div>`; if (f.dir && liv < 2) o += await giro(r + '/' + f.nome, liv + 1); } return o; };
    el.innerHTML = (await giro(rel, 0)) || 'Nessun documento ancora.';
    el.querySelectorAll('[data-open]').forEach(a => a.onclick = () => window.desktop.fsMostra(a.dataset.open));
  }

  // Foto: ridotte a 1600 px; nel programma installato vanno nella cartella della ditta, nel browser restano nella pratica
  function fotoUI(m, p, d) {
    const box = m.querySelector('#dft'), parts = p.particelle.filter(x => x.ditta === d.id);
    const disegna = async () => {
      box.innerHTML = d.foto.map((f, i) => `<figure><img data-fi="${i}" alt=""><select data-fp="${i}"><option value="">(particella)</option>${parts.map(x => `<option value="${x.id}" ${f.part === x.id ? 'selected' : ''}>Fg.${E(x.fg)} Mapp.${E(C.mappale(x))}</option>`).join('')}</select><input data-fd="${i}" value="${E(f.did || '')}" placeholder="Didascalia"><div class="row" style="margin-top:4px"><button class="s" data-fu="${i}">↑</button><button class="s" data-fdn="${i}">↓</button><span class="grow"></span><button class="s d" data-fx="${i}">✕</button></div></figure>`).join('');
      for (const [i, f] of d.foto.entries()) { const im = box.querySelector(`[data-fi="${i}"]`); im.src = f.data || (f.file ? URL.createObjectURL(new Blob([await APP.FS.leggi(f.file) || new Uint8Array()], { type: 'image/jpeg' })) : ''); }
      box.querySelectorAll('[data-fp]').forEach(s => s.onchange = () => { d.foto[+s.dataset.fp].part = s.value; APP.salva(); });
      box.querySelectorAll('[data-fd]').forEach(s => s.onchange = () => { d.foto[+s.dataset.fd].did = s.value; APP.salva(); });
      box.querySelectorAll('[data-fx]').forEach(b => b.onclick = () => { d.foto.splice(+b.dataset.fx, 1); APP.salva(); disegna(); });
      box.querySelectorAll('[data-fu]').forEach(b => b.onclick = () => { const i = +b.dataset.fu; if (i) { [d.foto[i - 1], d.foto[i]] = [d.foto[i], d.foto[i - 1]]; APP.salva(); disegna(); } });
      box.querySelectorAll('[data-fdn]').forEach(b => b.onclick = () => { const i = +b.dataset.fdn; if (i < d.foto.length - 1) { [d.foto[i + 1], d.foto[i]] = [d.foto[i], d.foto[i + 1]]; APP.salva(); disegna(); } });
    };
    disegna();
    m.querySelector('#dfoto').onclick = async () => {
      const L = await APP.scegliFile('image/*', true);
      for (const f of L) {
        const jpg = await riduci(f.buf, f.tipo);
        const o = { id: U.id(), nome: f.nome, did: '', part: parts.length === 1 ? parts[0].id : '' };
        if (APP.FS.ok) { o.file = APP.FS.dirDitta(p, d) + '/Stato di consistenza/Foto/' + san(f.nome.replace(/\.\w+$/, '')) + '-' + o.id + '.jpg'; await window.desktop.fsScrivi(o.file, jpg); }
        else o.data = 'data:image/jpeg;base64,' + b64(jpg);
        d.foto.push(o);
      }
      APP.salva(); APP.render();
    };
    m.querySelector('#dscan').onclick = async () => {
      const [f] = await APP.scegliFile('.pdf'); if (!f) return;
      d.scan = { nome: f.nome };
      if (APP.FS.ok) { d.scan.file = APP.FS.dirDitta(p, d) + '/Stato di consistenza/Verbale firmato (scansione).pdf'; await window.desktop.fsScrivi(d.scan.file, new Uint8Array(f.buf)); }
      else APP._scan = new Uint8Array(f.buf);
      APP.salva(); APP.render();
    };
    m.querySelector('#dpdf').onclick = () => pdfFinale(p, d);
  }
  const riduci = (buf, tipo) => new Promise(res => {
    const url = URL.createObjectURL(new Blob([buf], { type: tipo || 'image/jpeg' })), img = new Image();
    img.onload = () => { const k = Math.min(1, 1600 / Math.max(img.width, img.height)), cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url); cv.toBlob(async b => res(new Uint8Array(await b.arrayBuffer())), 'image/jpeg', 0.85); };
    img.onerror = () => { URL.revokeObjectURL(url); res(new Uint8Array(buf)); };
    img.src = url;
  });
  // PDF finale: scansione firmata + documentazione fotografica (2 foto per pagina con didascalia «Figura N_Fg. x Mapp. y»)
  async function pdfFinale(p, d) {
    const L = window.PDFLib; if (!L) { APP.toast('Libreria PDF non disponibile'); return; }
    const out = await L.PDFDocument.create(), font = await out.embedFont(L.StandardFonts.Helvetica), bold = await out.embedFont(L.StandardFonts.HelveticaBold);
    let scan = d.scan ? (d.scan.file ? await APP.FS.leggi(d.scan.file) : APP._scan) : null;
    if (scan) { try { const src = await L.PDFDocument.load(scan, { ignoreEncryption: true }); (await out.copyPages(src, src.getPageIndices())).forEach(pg => out.addPage(pg)); } catch (e) { APP.toast('Scansione non leggibile: ' + e.message); } }
    else APP.toast('Nessuna scansione firmata: il PDF conterrà solo la documentazione fotografica');
    const parts = new Map(p.particelle.map(x => [x.id, x]));
    const W = 595.28, H = 841.89, mg = 42;
    let pg = null, y = 0, n = 0;
    for (const f of d.foto) {
      const dati = f.data ? Uint8Array.from(atob(f.data.split(',')[1]), ch => ch.charCodeAt(0)) : await APP.FS.leggi(f.file);
      if (!dati) continue;
      let im; try { im = await out.embedJpg(dati); } catch (e) { try { im = await out.embedPng(dati); } catch (e2) { continue; } }
      if (!pg || y < mg + 330) {
        pg = out.addPage([W, H]); y = H - mg;
        pg.drawText('DOCUMENTAZIONE FOTOGRAFICA – ' + (p.ente.nome || '') + ' – Ditta ' + d.n, { x: mg, y: y - 10, size: 10, font: bold }); y -= 30;
      }
      const maxW = W - 2 * mg, maxH = 330, k = Math.min(maxW / im.width, maxH / im.height), w = im.width * k, h = im.height * k;
      pg.drawImage(im, { x: mg + (maxW - w) / 2, y: y - h, width: w, height: h });
      const x = parts.get(f.part); n++;
      const did = 'Figura ' + n + (x ? '_Fg. ' + x.fg + ' Mapp.' + C.mappale(x) : '') + (f.did ? ' – ' + f.did : '');
      pg.drawText(did.replace(/[^\x20-\x7E -ÿ]/g, '-').slice(0, 110), { x: mg + (maxW - w) / 2, y: y - h - 12, size: 8.5, font });
      y -= h + 30;
    }
    const bytes = await out.save();
    await APP.FS.salva(APP.FS.dirDitta(p, d) + '/Stato di consistenza/Stato di consistenza - Ditta ' + d.n + ' (completo).pdf', bytes);
    d.ev.immissione = d.ev.immissione || {}; APP.salva(); APP.render();
  }

  // ---------- Vista: Tavola ----------
  let vb = null;
  APP.viste.tavola = (m, p) => {
    if (!p.geo) { m.innerHTML = '<h2>🗺️ Tavola grafica</h2><div class="card vuoto">Importa prima il disegno DXF.</div>'; return; }
    const c = APP.calc(), sch = T.schermo(p, c);
    const o = APP.tavOpt = APP.tavOpt || { formato: 'A3', orient: 'L', scala: 0, ditta: '' };
    m.innerHTML = `<h2>🗺️ Tavola grafica</h2>
<div class="leg2">${Object.entries(T.STILI).map(([k, s]) => `<span><i style="background:${s.fill};border:1px solid ${s.col}"></i>${s.nome}</span>`).join('')}<span><i style="border:2px solid #d62828;border-radius:99px;width:12px"></i>Numero di piano</span></div>
<div class="tav" id="tv">${sch.svg}<div class="zm"><button id="zin">＋</button><button id="zout">－</button><button id="zfit">⤢</button></div><div class="info" id="tinfo">Rotellina o pulsanti per lo zoom, trascina per spostarti, clic su un'area per i dati.</div></div>
<div class="card" style="margin-top:10px"><h3 style="margin-top:0">Stampa della tavola</h3><div class="g">
<label>Formato<select id="tf">${Object.keys(T.FORMATI).map(f => `<option ${o.formato === f ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
<label>Orientamento<select id="to"><option value="L" ${o.orient === 'L' ? 'selected' : ''}>Orizzontale</option><option value="P" ${o.orient === 'P' ? 'selected' : ''}>Verticale</option></select></label>
<label>Scala<select id="ts"><option value="0">Adatta al foglio</option>${T.SCALE.map(s => `<option value="${s}" ${+o.scala === s ? 'selected' : ''}>1:${s}</option>`).join('')}</select></label>
<label>Ditta (estratto)<select id="td"><option value="">Tutta l'opera</option>${p.ditte.map(d => `<option value="${d.id}" ${o.ditta === d.id ? 'selected' : ''}>Ditta ${E(d.n)} – ${E((d.intest[0] || {}).nome || '')}</option>`).join('')}</select></label></div>
<div class="row" style="margin-top:10px"><button class="p" id="tpdf">Stampa / PDF</button><button id="tsvg">Scarica SVG</button><button id="tdxf">Esporta DXF delle aree</button></div></div>`;
    const box = m.querySelector('#tv'), svg = box.querySelector('svg');
    vb = vb && vb.W === sch.W ? vb : { x: 0, y: 0, w: sch.W, h: sch.H, W: sch.W };
    const app = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); app();
    const zoom = (f, cx, cy) => { cx = cx ?? vb.x + vb.w / 2; cy = cy ?? vb.y + vb.h / 2; vb.x = cx - (cx - vb.x) * f; vb.y = cy - (cy - vb.y) * f; vb.w *= f; vb.h *= f; app(); };
    const pt = e => { const r = svg.getBoundingClientRect(), k = Math.max(vb.w / r.width, vb.h / r.height); return [vb.x + (e.clientX - r.left - (r.width - vb.w / k) / 2) * k, vb.y + (e.clientY - r.top - (r.height - vb.h / k) / 2) * k]; };
    svg.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = pt(e); zoom(e.deltaY > 0 ? 1.2 : 1 / 1.2, x, y); }, { passive: false });
    let drag = null, mosso = false;
    svg.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y }; mosso = false; svg.setPointerCapture(e.pointerId); });
    svg.addEventListener('pointermove', e => { if (!drag) return; const r = svg.getBoundingClientRect(), k = Math.max(vb.w / r.width, vb.h / r.height); if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) mosso = true; vb.x = drag.vx - (e.clientX - drag.x) * k; vb.y = drag.vy - (e.clientY - drag.y) * k; app(); });
    svg.addEventListener('pointerup', e => {
      drag = null; if (mosso) return;
      const t = document.elementsFromPoint(e.clientX, e.clientY).find(x => x.dataset && (x.dataset.pezzo || x.dataset.k));
      if (!t) return;
      const k = t.dataset.k, x = p.particelle.find(q => A.chiave(q.fg, q.map, q.sub) === k || A.chiave(q.fg, q.map, '') === k);
      const pz = t.dataset.pezzo && p.geo.pezzi.find(z => z.id === t.dataset.pezzo);
      const d = x && p.ditte.find(dd => dd.id === x.ditta);
      m.querySelector('#tinfo').innerHTML = (pz ? `<b>${E(A.RUOLI[pz.tipo])}</b> ${U.fmt(pz.a, 1)} mq · ` : '') + (k ? `Fg.${E(k.split('|')[0])} Mapp.${E(k.split('|')[1])}` : 'particella non assegnata') + (d ? ` · <b>Ditta ${E(d.n)}</b> ${E(d.intest.map(o => o.nome).join(', '))} <button class="s" id="tgo">Apri ditta</button>` : '');
      const go = m.querySelector('#tgo'); if (go) go.onclick = () => APP.vai('ditte', d.id);
    });
    m.querySelector('#zin').onclick = () => zoom(1 / 1.4); m.querySelector('#zout').onclick = () => zoom(1.4); m.querySelector('#zfit').onclick = () => { vb = { x: 0, y: 0, w: sch.W, h: sch.H, W: sch.W }; app(); };
    const leggi = () => { o.formato = m.querySelector('#tf').value; o.orient = m.querySelector('#to').value; o.scala = +m.querySelector('#ts').value; o.ditta = m.querySelector('#td').value; };
    const foglio = () => { leggi(); return o.ditta && o.formato === 'A4' && o.orient === 'P' ? T.estratto(p, c, o.ditta, o.scala || 1000, [190, 277]) : T.foglio(p, c, { ...o, ditta: o.ditta || null, sotto: o.ditta ? 'Estratto – Ditta ' + (p.ditte.find(d => d.id === o.ditta) || {}).n : '' }); };
    m.querySelector('#tpdf').onclick = async () => {
      const s = foglio(), [a, b] = T.FORMATI[o.formato], W = o.orient === 'L' ? b : a, H = o.orient === 'L' ? a : b;
      $('#print').innerHTML = `<style>@media print{@page{size:${W}mm ${H}mm;margin:0}#print svg{display:block;width:${W}mm;height:${H}mm}}</style>${s}`;
      if (window.desktop && window.desktop.pdfDati && APP.FS.ok) { const dati = await window.desktop.pdfDati({ formato: { width: W / 25.4, height: H / 25.4 } }); await APP.FS.salva(APP.FS.dirGenerale(p) + '/Tavola ' + o.formato + (o.ditta ? ' ditta ' + (p.ditte.find(d => d.id === o.ditta) || {}).n : '') + ' (' + U.oggi() + ').pdf', dati); }
      else window.print();
    };
    m.querySelector('#tsvg').onclick = () => APP.scarica(san(p.nome) + ' - tavola.svg', foglio(), 'image/svg+xml');
    m.querySelector('#tdxf').onclick = () => {
      const poli = [], testi = [];
      p.geo.pezzi.forEach(z => { z.mp.forEach(P => P.forEach(r => poli.push({ layer: 'ESPR_' + z.tipo.toUpperCase(), pts: r, chiusa: true }))); const lp = ES.geo.puntoEtichettaMP(z.mp); if (lp && z.k) testi.push({ layer: 'ESPR_TESTI', x: lp[0], y: lp[1], h: 1, t: z.map + ' ' + A.RUOLI[z.tipo] + ' ' + Math.round(z.a) + ' mq' }); });
      APP.scarica(san(p.nome) + ' - aree.dxf', ES.dxf.scrivi(poli, testi), 'application/dxf');
    };
  };

  // ---------- Vista: Indennità ----------
  APP.viste.stima = (m, p) => {
    const c = APP.calc(), T0 = c.T, I0 = p.impost;
    m.innerHTML = `<h2>💶 Indennità</h2>
<div class="ban">Il programma applica le formule del D.P.R. 327/2001 con i valori qui sotto: i valori unitari e le percentuali vanno stabiliti dal tecnico estimatore (relazione di stima). Dopo la sentenza della Corte costituzionale n. 181/2011 anche per le aree non edificabili si usa il valore venale; il VAM resta per le indennità aggiuntive (artt. 40 c.4 e 42).</div>
<div class="card"><h3 style="margin-top:0">Valori unitari per categoria</h3><p class="mu">La categoria si assegna in automatico dalla qualità catastale della visura (es. «PRATO» → Prato, «BOSCHI/6» → Bosco, «ALPI/6» → Pascolo / Alpe) tramite gli inizi di parola della colonna «Riconosce nella qualità», oppure a mano nella particella.</p>
<div class="tw" style="max-height:none"><table class="t"><thead><tr><th>Categoria</th><th>Riconosce nella qualità</th><th>Edificabile</th><th>Valore venale €/mq</th><th>VAM €/ha (aggiuntive)</th><th class="n">Particelle</th><th></th></tr></thead><tbody>
${p.valori.map((v, i) => `<tr><td><input data-v="${i}" data-c="nome" value="${E(v.nome)}"></td><td><input data-v="${i}" data-c="chiavi" value="${E(v.chiavi || '')}" placeholder="es. bosc cast" title="Inizi di parola separati da spazio"></td><td><input type="checkbox" data-v="${i}" data-c="edif" ${v.edif ? 'checked' : ''}></td><td><input data-v="${i}" data-c="vu" value="${v.vu || ''}"></td><td><input data-v="${i}" data-c="vam" value="${v.vam || ''}"></td><td class="n">${p.particelle.filter(x => (S.categoria(x, p.valori) || {}).id === v.id).length}</td><td><button class="s d" data-vx="${i}">✕</button></td></tr>`).join('')}
</tbody></table></div><div class="row" style="margin-top:8px"><button id="vadd">＋ Categoria</button><span class="mu">Particelle senza categoria: ${p.particelle.filter(x => !S.categoria(x, p.valori)).map(x => 'Fg.' + E(x.fg) + ' ' + E(x.map) + (x.qual ? ' (' + E(x.qual) + ')' : '')).join(', ') || 'nessuna'}</span></div></div>
<div class="card"><h3 style="margin-top:0">Criteri</h3><div class="g">
<label>Servitù ingombro opere (% del valore)<input data-f="impost.coeffServop" data-t="pct"></label><label>Servitù fascia (% del valore, art. 44)<input data-f="impost.coeffServ" data-t="pct"></label>
<label>Mesi di occupazione temporanea (art. 50)<input data-f="impost.mesiOcc" data-t="num"></label><label>Mesi di occupazione d'urgenza (art. 22-bis c.5, se non da date)<input data-f="impost.mesiUrg" data-t="num"></label>
<label>Maggiorazione aree edificabili con condivisione (art. 37 c.2) %<input data-f="impost.maggEdif" data-t="num"></label><label>Maggiorazione aree non edificabili con cessione %<input data-f="impost.maggNonEdif" data-t="num"></label>
<label class="chk"><input type="checkbox" data-f="impost.riforma"> Riforma economico-sociale (−25% art. 37 c.1)</label><label class="chk"><input type="checkbox" data-f="impost.triploVam"> Cessione con CD/IAP: triplo VAM se maggiore (art. 45 c.2 lett. d)</label>
<label>Art. 42-bis: pregiudizio non patrimoniale %<input data-f="impost.nonPatr42bis" data-t="num"></label><label>Art. 42-bis: interesse annuo occupazione senza titolo %<input data-f="impost.interessi42bis" data-t="num"></label>
<label>Ritenuta art. 35 %<input data-f="impost.ritenuta" data-t="num"></label></div></div>
<div class="card"><h3 style="margin-top:0">Quadro riepilogativo</h3><div class="tw" style="max-height:none"><table class="t"><tbody>
${Object.entries(S.VOCI).map(([k, n]) => T0[k] ? `<tr><td>${E(n)}</td><td class="n">${U.eur(T0[k])}</td></tr>` : '').join('')}
<tr><td><b>Totale indennità alle proprietà</b></td><td class="n"><b>${U.eur(T0.tot)}</b></td></tr>${T0.aggCond ? `<tr><td>Indennità aggiuntive ai conduttori</td><td class="n">${U.eur(T0.aggCond)}</td></tr>` : ''}${T0.ritenuta ? `<tr><td class="mu">di cui ritenute art. 35 stimate</td><td class="n mu">${U.eur(T0.ritenuta)}</td></tr>` : ''}</tbody></table></div></div>
<div class="card"><h3 style="margin-top:0">Per ditta</h3><div class="tw"><table class="t"><thead><tr><th>Ditta</th><th>Intestatari</th><th class="n">Esproprio</th><th class="n">Servitù</th><th class="n">Occupazione</th><th class="n">Altre voci</th><th class="n">Totale</th><th class="n">Acconto 80%</th></tr></thead><tbody>
${p.ditte.map(d => { const D = c.perD.get(d.id) || {}; return `<tr data-d="${d.id}"><td><b>${E(d.n)}</b></td><td>${E(d.intest.map(o => o.nome).join(', ').slice(0, 60))}</td><td class="n">${U.eur(D.espr || 0)}</td><td class="n">${U.eur((D.servop || 0) + (D.serv || 0))}</td><td class="n">${U.eur((D.occ || 0) + (D.urg || 0))}</td><td class="n">${U.eur((D.aggCD || 0) + (D.sopr || 0) + (D.depr || 0) + (D.np42 || 0) + (D.ris42 || 0))}</td><td class="n"><b>${U.eur(D.tot || 0)}</b></td><td class="n">${U.eur(D.acconto80 || 0)}</td></tr>`; }).join('')}</tbody></table></div></div>`;
    APP.lega(m, p, () => APP.render());
    m.querySelectorAll('[data-v]').forEach(el => el.onchange = () => { const v = p.valori[+el.dataset.v]; v[el.dataset.c] = el.type === 'checkbox' ? el.checked : el.dataset.c === 'nome' || el.dataset.c === 'chiavi' ? el.value : U.num(el.value); APP.salva(); APP.render(); });
    m.querySelectorAll('[data-vx]').forEach(b => b.onclick = () => { p.valori.splice(+b.dataset.vx, 1); APP.salva(); APP.render(); });
    m.querySelector('#vadd').onclick = () => { p.valori.push({ id: U.id(), nome: 'Nuova categoria', edif: false, vu: 0, vam: 0 }); APP.salva(); APP.render(); };
    m.querySelectorAll('[data-d]').forEach(r => r.onclick = () => APP.vai('ditte', r.dataset.d));
  };

  // ---------- Vista: Documenti ----------
  // Organizzata per passi del percorso: ogni modello si genera per tutte le ditte (file generale + file per ditta).
  const LIVELLI = { originale: '', base: '<span class="tag t-wa">testo base modificato</span>', pratica: '<span class="tag t-sv">testo di questa pratica</span>', nuovo: '<span class="tag t-ok">modello vostro</span>' };
  APP.viste.documenti = async (m, p) => {
    const st = APP.docSt = Object.assign(APP.docSt || { ditte: null, registra: true, data: U.oggi(), generale: true, perDitta: true, prev: '' }, APP.arg && typeof APP.arg === 'object' ? APP.arg : {}); APP.arg = null;
    const cat = M.catalogo(APP.lib()), lib = APP.lib(), proc = p.impost.procedura, passi = I.passi(proc);
    const usati = new Set();
    const nd = st.ditte ? st.ditte.length : p.ditte.length;
    const riga = (k, passo) => {
      const md = cat[k]; if (!md) return '';
      usati.add(k);
      const tutti = md.ambito !== 'pratica';
      return `<div class="mr"><div class="grow" style="min-width:0"><b>${E(md.nome)}</b> ${LIVELLI[M.livello(k, p, lib)]}<div class="mu">${E(md.art || '')} · ${AMBITI[md.ambito]}</div></div>
<div class="row"><button class="s" data-a="prev" data-k="${k}">👁 Anteprima</button><button class="s" data-a="edit" data-k="${k}">✏️ Testo</button><button class="s" data-a="pdf" data-k="${k}" ${passo ? `data-passo="${passo}"` : ''}>PDF</button><button class="s p" data-a="word" data-k="${k}" ${passo ? `data-passo="${passo}"` : ''}>${tutti ? '⬇ Genera per ' + (nd === p.ditte.length ? 'tutte le ditte' : nd + ' ditte') : '⬇ Genera'}</button></div></div>`;
    };
    const fatti = ps => p.ditte.filter(d => d.ev[ps.k] && d.ev[ps.k].data).length;
    const sezPercorso = passi.map((ps, i) => `<div class="mp2"><div class="row"><span class="nr2">${i + 1}</span><b>${E(ps.nome)}</b><span class="mu">${E(ps.art)}</span><span class="grow"></span><span class="tag ${fatti(ps) === p.ditte.length && p.ditte.length ? 't-ok' : ''}">${fatti(ps)}/${p.ditte.length} ditte</span></div>${ps.modelli.filter(k => cat[k]).map(k => riga(k, ps.k)).join('') || '<div class="mu">Nessun modello collegato: usa «Altri modelli».</div>'}</div>`).join('');
    const generali = Object.keys(cat).filter(k => cat[k].ambito === 'pratica' && !usati.has(k));
    const sezGen = generali.map(k => riga(k)).join('');
    const altri = Object.keys(cat).filter(k => !usati.has(k)).map(k => riga(k)).join('');
    const word = (APP.DB.modelliWord || []).map(w => `<div class="mr"><div class="grow"><b>${E(w.nome)}</b> <span class="tag t-ok">Word</span><div class="mu">${AMBITI[w.ambito]} · ${(w.campi || []).length} campi</div></div><div class="row"><button class="s d" data-a="wdel" data-k="w:${w.id}">✕</button><button class="s p" data-a="word" data-k="w:${w.id}">⬇ Genera</button></div></div>`).join('');
    m.innerHTML = `<h2>📄 Documenti</h2>
<div class="card"><div class="g">
<label class="f2">Ditte<select id="dd" multiple size="4">${p.ditte.map(d => `<option value="${d.id}" ${!st.ditte || st.ditte.includes(d.id) ? 'selected' : ''}>Ditta ${E(d.n)} – ${E(d.intest.map(o => o.nome).join(', ').slice(0, 80))}</option>`).join('')}</select></label>
<div class="f2 opz"><span class="mu">File da creare</span><label class="chk"><input type="checkbox" id="ogen" ${st.generale ? 'checked' : ''}> File generale con tutte le ditte (in «00 GENERALE»)</label><label class="chk"><input type="checkbox" id="oper" ${st.perDitta ? 'checked' : ''}> Documento nella cartella di ogni ditta</label>
<div class="row"><label class="chk"><input type="checkbox" id="oreg" ${st.registra ? 'checked' : ''}> Segna il passo come inviato alle ditte in data</label><input type="date" id="odat" value="${E(st.data)}"></div></div></div>
<div class="row" style="margin-top:8px"><button id="dtutte">Seleziona tutte</button><span class="mu grow">${APP.FS.ok ? 'I file vanno nel fascicolo: generale in «00 GENERALE», specifici in «DITTA n …».' : 'Nel browser i file arrivano in un unico ZIP con le stesse cartelle del fascicolo.'}</span>
<button id="mnew">＋ Nuovo modello</button><button id="wcar">Carica modello Word…</button><button id="mexp">Esporta modelli</button><button id="mimp">Importa modelli</button><button id="wcampi">Campi disponibili</button></div></div>
<div class="card"><h3 style="margin-top:0">Percorso: ${E(S.PROCEDURE[proc].nome)}</h3><p class="mu">Il percorso si cambia nella scheda Pratica (o per singola ditta). I dati del progetto approvato, i visti e le premesse si scrivono una volta in Pratica › «Dati specifici per i documenti».</p>${sezPercorso}</div>
${sezGen ? `<div class="card"><h3 style="margin-top:0">Atti generali della pratica</h3>${sezGen}</div>` : ''}
<div class="card"><h3 style="margin-top:0">Altri modelli</h3>${altri || '<div class="mu">—</div>'}</div>
${word ? `<div class="card"><h3 style="margin-top:0">Vostri modelli Word</h3>${word}</div>` : ''}
<div id="dprev"></div>`;
    const sel = () => { const v = [...m.querySelector('#dd').selectedOptions].map(o => o.value); st.ditte = v.length === p.ditte.length ? null : v; return st.ditte; };
    const opt = passo => ({ ditte: sel(), generale: st.generale, perDitta: st.perDitta, registra: st.registra && passo ? { passo, data: st.data } : null });
    m.querySelector('#dd').onchange = () => { sel(); APP.render(); };
    m.querySelector('#dtutte').onclick = () => { st.ditte = null; APP.render(); };
    m.querySelector('#ogen').onchange = e => { st.generale = e.target.checked; };
    m.querySelector('#oper').onchange = e => { st.perDitta = e.target.checked; };
    m.querySelector('#oreg').onchange = e => { st.registra = e.target.checked; };
    m.querySelector('#odat').onchange = e => { st.data = e.target.value; };
    m.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
      const k = b.dataset.k, a = b.dataset.a;
      try {
        if (a === 'word') await APP.generaTutti(p, k, opt(b.dataset.passo));
        if (a === 'pdf') await APP.pdfTutti(p, k, opt(b.dataset.passo));
        if (a === 'edit') await APP.editorModello(p, k);
        if (a === 'wdel' && await APP.conferma('Togliere questo modello Word?', 'Togli')) { APP.DB.modelliWord = APP.DB.modelliWord.filter(w => 'w:' + w.id !== k); APP.salva(); APP.render(); }
        if (a === 'prev') {
          st.prev = k; const box = m.querySelector('#dprev');
          box.innerHTML = `<div class="card row"><b class="grow">Anteprima: ${E(cat[k].nome)}</b><span class="mu">prime ditte selezionate</span></div>` + await APP.anteprima(p, k, (sel() || p.ditte.map(d => d.id)).slice(0, cat[k].ambito === 'intestatario' ? 2 : 3));
          box.scrollIntoView({ behavior: 'smooth' });
        }
      } catch (e) { APP.toast('Errore: ' + e.message, 6000); console.error(e); }
    });
    m.querySelector('#mnew').onclick = () => nuovoModello(p);
    m.querySelector('#wcar').onclick = () => caricaWord();
    m.querySelector('#wcampi').onclick = () => campiDisponibili();
    m.querySelector('#mexp').onclick = () => APP.scarica('Modelli ESPROPRI_SISTEM (' + U.oggi() + ').json', JSON.stringify({ tipo: 'ESPROPRI_SISTEM-modelli', v: 1, base: APP.lib().base, custom: APP.lib().custom, word: APP.DB.modelliWord || [] }, null, 1), 'application/json');
    m.querySelector('#mimp').onclick = async () => {
      const [f] = await APP.scegliFile('.json'); if (!f) return;
      try {
        const o = JSON.parse(new TextDecoder().decode(f.buf)); if (o.tipo !== 'ESPROPRI_SISTEM-modelli') throw new Error('non è un file di modelli');
        Object.assign(APP.lib().base, o.base || {});
        (o.custom || []).forEach(c => { const L = APP.lib().custom, i = L.findIndex(x => x.k === c.k); if (i >= 0) L[i] = c; else L.push(c); });
        (o.word || []).forEach(w => { APP.DB.modelliWord = APP.DB.modelliWord || []; if (!APP.DB.modelliWord.some(x => x.id === w.id)) APP.DB.modelliWord.push(w); });
        APP.salva(); APP.render(); APP.toast('Modelli importati');
      } catch (e) { APP.toast('File non valido: ' + e.message, 6000); }
    };
    if (st.prev && cat[st.prev]) { const b = m.querySelector(`[data-a="prev"][data-k="${st.prev}"]`); if (b) b.click(); }
  };

  // Editor del testo: livello «base» (tutte le pratiche) o «questa pratica», campi da inserire e anteprima
  const GRUPPI_CAMPI = p => [
    ['Destinatario', ['dest.saluto', 'dest.gentile', 'dest.nome', 'dest.anagrafica', 'dest.nascita', 'dest.cf', 'dest.diritto', 'dest.via', 'dest.cittaCap', 'dest.pec', 'dest.mezzo']],
    ['Ditta', ['ditta.n', 'ditta.np', 'ditta.nome', 'ditta.tot', 'ditta.totLettere', 'ditta.indEspr', 'ditta.indServ', 'ditta.indOcc', 'ditta.supEspr', 'ditta.supServ', 'ditta.supOcc', 'ditta.acconto80', 'ditta.osservazioni', 'ditta.ev.immissione.data', 'ditta.ev.immissione.ora', 'ditta.ev.immissione.luogo']],
    ['Opera ed ente', ['pratica.oggetto', 'pratica.cup', 'pratica.urgenza', 'ente.nome', 'ente.ufficio', 'ente.indirizzo', 'ente.pec', 'ente.ruolo', 'ente.responsabile', 'ente.rup', 'ente.tecnico', 'ente.beneficiario', 'ente.tar', 'ente.tribunale', 'ente.bur', 'ente.link', 'luogo', 'oggi', 'mesiOcc']],
    ['Atti (estremi e data)', ES.iter.FASI.map(f => 'atti.' + f.k + '.testo')],
    ['Dati specifici della pratica', M.DATI.map(c => 'dati.' + c.k).concat(['premesse', 'visti'].map(k => 'dati.' + k + 'Elenco')).concat((p.campi || []).map(c => 'dati.' + c.k))],
    ['Tabelle e comandi', ['[[tabella particelle colonne=comune,fg,map,haareca,rd,ra,espr,servtot,occ]]', '[[tabella intestatari]]', '[[tabella indennita]]', '[[tabella consistenza]]', '[[tabella piano colonne=np,fg,map,qual,sup,espr,servtot,occ,ind]]', '[[planimetria scala=1000]]', '[[firma {{ente.ruolo}}|{{ente.responsabile}}]]', '[[salto]]', '{{#ditta.intestatari}} … {{/ditta.intestatari}}', '{{#ditta.particelle}} … {{/ditta.particelle}}', '{{#dati.premesse}} … {{/dati.premesse}}']]
  ];
  APP.editorModello = async (p, k) => {
    const lib = APP.lib(), md = APP.modello(k), propria = !!md.propria;
    const orig = propria ? md.testo : M.INTEGRATI[k].testo;
    let liv = p.modelli[k] ? 'pratica' : 'base';
    const testoLiv = l => (l === 'pratica' ? (p.modelli[k] || M.testo(k, null, lib)) : (propria ? md.testo : (lib.base[k] || orig)));
    const campi = GRUPPI_CAMPI(p).map(([g, L]) => `<details ${g === 'Dati specifici della pratica' ? 'open' : ''}><summary>${E(g)}</summary>${L.map(c => `<button type="button" class="s cmp" data-ins="${E(c.startsWith('[[') || c.startsWith('{{') ? c : '{{' + c + '}}')}">${E(c.replace(/^(dest|ditta|ente|pratica|atti|dati)\./, ''))}</button>`).join('')}</details>`).join('');
    const html = `${propria ? `<div class="g"><label class="f2">Nome del modello<input id="mnome" value="${E(md.nome)}"></label><label>Articolo<input id="mart" value="${E(md.art || '')}"></label><label>Fase<input id="mfase" value="${E(md.fase || '')}"></label><label>Un documento per<select id="mamb">${Object.entries(AMBITI).map(([a, t]) => `<option value="${a}" ${md.ambito === a ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>` : ''}
<div class="row" style="margin:6px 0"><label class="fl">Modifica<select id="mliv"><option value="base">${propria ? 'Testo del modello (tutte le pratiche)' : 'Testo base – vale per tutte le pratiche'}</option><option value="pratica">Solo per questa pratica</option></select></label><span class="mu grow" id="mstato"></span></div>
<div class="ed"><textarea id="mt" rows="26" spellcheck="true"></textarea><div class="ed-side"><div class="mu" style="margin-bottom:4px">Clic per inserire nel punto del cursore</div>${campi}</div></div>
<p class="mu">Righe: <b># titolo</b>, <b>## sottotitolo</b>, <b>&gt;&gt; testo a destra</b> (indirizzo), <b>- punto elenco</b>, <b>**grassetto**</b>, <b>++sottolineato++</b>. Una riga = un paragrafo. Le sezioni <b>{{#campo}}…{{/campo}}</b> compaiono solo se il campo è compilato.</p>
<div class="row"><button type="button" id="mprev">Anteprima con la prima ditta</button></div><div id="mpv" style="margin-top:8px"></div>`;
    const stato = l => ({ base: propria ? 'Modello vostro: il testo vale per tutte le pratiche.' : lib.base[k] ? 'Testo base modificato da voi (vale per tutte le pratiche).' : 'Testo originale del programma.', pratica: p.modelli[k] ? 'Questa pratica usa un testo proprio.' : 'Questa pratica usa il testo base: salvando qui crei una versione solo per questa pratica.' })[l];
    const r = await APP.dlg('Testo: ' + md.nome, html, [{ t: 'Ripristina', v: 'reset', d: true }].concat(propria ? [{ t: 'Elimina modello', v: 'del', d: true }] : []).concat([{ t: 'Annulla', v: '' }, { t: 'Salva', v: 'ok', p: true }]), b => {
      const ta = b.querySelector('#mt'), sl = b.querySelector('#mliv');
      const carica = () => { ta.value = testoLiv(liv); b.querySelector('#mstato').textContent = stato(liv); };
      sl.value = liv; carica();
      sl.onchange = () => { liv = sl.value; carica(); };
      b.querySelectorAll('[data-ins]').forEach(x => x.onclick = () => { const t = x.dataset.ins, i = ta.selectionStart, j = ta.selectionEnd; ta.value = ta.value.slice(0, i) + t + ta.value.slice(j); ta.focus(); ta.selectionStart = ta.selectionEnd = i + t.length; });
      b.querySelector('#mprev').onclick = async () => { try { b.querySelector('#mpv').innerHTML = await APP.anteprima(p, k, p.ditte.slice(0, 1).map(d => d.id), ta.value); } catch (e) { b.querySelector('#mpv').innerHTML = `<div class="ban err">${E(e.message)}</div>`; } };
    });
    const testo = $('#mt').value;
    if (r === 'ok') {
      if (propria) { const c = lib.custom.find(x => x.k === k); Object.assign(c, { nome: $('#mnome').value || c.nome, art: $('#mart').value, fase: $('#mfase').value, ambito: $('#mamb').value }); if (liv === 'base') c.testo = testo; }
      if (liv === 'pratica') p.modelli[k] = testo;
      else if (!propria) { if (testo === orig) delete lib.base[k]; else lib.base[k] = testo; }
      APP.toast(liv === 'pratica' ? 'Testo salvato per questa pratica' : 'Testo base salvato: vale per tutte le pratiche');
    }
    if (r === 'reset') {
      if (liv === 'pratica') delete p.modelli[k];
      else if (!propria && await APP.conferma('Tornare al testo originale del programma per tutte le pratiche?', 'Ripristina')) delete lib.base[k];
    }
    if (r === 'del' && await APP.conferma('Eliminare il modello «' + E(md.nome) + '» da tutte le pratiche?', 'Elimina')) { lib.custom.splice(lib.custom.findIndex(x => x.k === k), 1); Object.values(APP.DB.pratiche).forEach(x => { if (x.modelli) delete x.modelli[k]; }); }
    if (r) { APP.salva(); APP.render(); }
  };
  async function nuovoModello(p) {
    const cat = M.catalogo(APP.lib());
    const r = await APP.dlg('Nuovo modello', `<div class="g"><label class="f">Nome<input id="nn" placeholder="es. Richiesta di nulla osta allo svincolo"></label><label>Articolo<input id="na" placeholder="art. 28"></label><label>Fase<input id="nf" placeholder="Indennità"></label>
<label>Un documento per<select id="nb">${Object.entries(AMBITI).map(([a, t]) => `<option value="${a}">${t}</option>`).join('')}</select></label>
<label class="f">Parti dal testo di<select id="nc"><option value="">(foglio bianco con intestazione)</option>${Object.entries(cat).map(([k, v]) => `<option value="${k}">${E(v.nome)}</option>`).join('')}</select></label></div>`, [{ t: 'Annulla', v: '' }, { t: 'Crea e modifica', v: 'ok', p: true }]);
    if (r !== 'ok') return;
    const da = $('#nc').value, amb = $('#nb').value;
    const vuoto = amb === 'pratica' ? '# TITOLO\n## {{pratica.oggetto}}\n\nTesto…\n\n{{luogo}}, {{oggi}}\n[[firma {{ente.ruolo}}|{{ente.responsabile}}]]'
      : 'Prot. n. ________\t{{luogo}}, {{oggi}}\n**Ditta {{ditta.n}}**\n>> {{dest.saluto}}\n>> **{{dest.nome}}**\n>> {{dest.via}}\n>> {{dest.cittaCap}}\n\n**Oggetto: {{pratica.oggetto}}**\n\n{{dest.gentile}},\nTesto…\n[[tabella particelle colonne=fg,map,sup,espr,servtot,occ]]\n\nDistinti saluti.\n[[firma {{ente.ruolo}}|{{ente.responsabile}}]]';
    const c = { k: 'u_' + U.id(), nome: $('#nn').value || 'Nuovo modello', art: $('#na').value, fase: $('#nf').value || 'Modelli vostri', ambito: (da && cat[da].ambito) || amb, testo: da ? APP.testoModello(p, da) : vuoto };
    APP.lib().custom.push(c); APP.salva(); APP.render();
    return APP.editorModello(p, c.k);
  }
  async function caricaWord() {
    const [f] = await APP.scegliFile('.docx'); if (!f) return;
    let campi = [];
    try { campi = await ES.office.campiModello(f.buf); } catch (e) { APP.toast('File Word non leggibile: ' + e.message); return; }
    const amb = campi.some(x => /^dest\.|Nome_e_Cognome$|^via$/.test(x)) ? 'intestatario' : campi.some(x => /^#?ditte|^#?unEspr/.test(x)) ? 'pratica' : 'ditta';
    const r = await APP.dlg('Nuovo modello Word', `<div class="g"><label class="f">Nome<input id="wn" value="${E(f.nome.replace(/\.docx$/i, ''))}"></label><label>Un documento per<select id="wa"><option value="intestatario">ogni intestatario</option><option value="ditta">ogni ditta</option><option value="pratica">l'intera pratica</option></select></label></div><p class="mu">Campi trovati: ${campi.map(x => '<span class="tag">' + E(x) + '</span>').join(' ') || 'nessuno – inserisci nel Word i segnaposto {{campo}} o usa i campi di stampa unione'}</p>`, [{ t: 'Annulla', v: '' }, { t: 'Aggiungi', v: 'ok', p: true }], b => { b.querySelector('#wa').value = amb; });
    if (r !== 'ok') return;
    APP.DB.modelliWord = APP.DB.modelliWord || [];
    APP.DB.modelliWord.push({ id: U.id(), nome: $('#wn').value || f.nome, ambito: $('#wa').value, campi, dati: b64(new Uint8Array(f.buf)) });
    APP.salva(); APP.render();
  }
  function campiDisponibili() {
    const R = (a, b) => `<tr><td><code>${E(a)}</code></td><td>${E(b)}</td></tr>`;
    APP.dlg('Campi disponibili nei modelli', `<p class="mu">Nei modelli Word scrivi i segnaposto tra doppie graffe, es. <code>{{dest.nome}}</code>. Per ripetere una riga di tabella per ogni particella metti <code>{{#ditta.particelle}}</code> nella prima cella e <code>{{/ditta.particelle}}</code> nell'ultima. L'estratto di mappa: <code>{{%planimetria}}</code>. I campi di stampa unione già presenti (es. «Nome_e_Cognome1», «Foglio1», «Particella1», «haareca1», «Reddito_Domenicale1», «Sup1») sono riconosciuti.</p>
<table class="t"><tbody>${R('{{dest.saluto}} {{dest.nome}}', 'Destinatario (Egr. Sig. / Gent.ma Sig.ra / Spett.le e nome)')}${R('{{dest.via}} {{dest.cittaCap}} {{dest.pec}}', 'Indirizzo del destinatario')}${R('{{dest.anagrafica}}', 'ROSSI MARIO nato a … il … - CF: …')}${R('{{dest.diritto}}', "Proprieta' 1/2")}
${R('{{ditta.n}} {{ditta.np}}', 'Numero di ditta / NP1')}${R('{{ditta.tot}} {{ditta.totLettere}}', 'Indennità totale in cifre e in lettere')}${R('{{ditta.indEspr}} {{ditta.indServ}} {{ditta.indOcc}}', 'Indennità per tipo')}${R('{{ditta.supEspr}} {{ditta.supServ}} {{ditta.supOcc}}', 'Superfici per tipo')}
${R('{{#ditta.intestatari}} {{nome}} {{nascita}} {{cf}} {{diritto}} {{/ditta.intestatari}}', 'Elenco intestatari')}${R('{{#ditta.particelle}} {{comune}} {{fg}} {{mappale}} {{qualcls}} {{sup}} {{haareca}} {{rd}} {{ra}} {{espr}} {{servop}} {{serv}} {{occ}} {{confini}} {{ind}} {{/ditta.particelle}}', 'Righe delle particelle')}
${R('{{ditta.ev.immissione.data}} {{ditta.ev.immissione.ora}} {{ditta.ev.immissione.luogo}}', 'Data, ora e luogo dell\'immissione in possesso')}
${R('{{ente.nome}} {{ente.ruolo}} {{ente.responsabile}} {{ente.rup}} {{ente.pec}} {{ente.tecnico}}', 'Ente e firmatari')}${R('{{pratica.oggetto}} {{pratica.cup}}', 'Opera')}${R('{{atti.dpu.testo}} {{atti.vincolo.testo}} {{atti.com17.testo}} {{atti.decreto.testo}}', 'Estremi degli atti («Delibera G.C. n. 62 del 20/05/2024»)')}${R('{{luogo}} {{oggi}}', 'Luogo e data')}${R('{{#ditte}} … {{/ditte}} · {{#unEspr}} {{un}} {{np}} … {{/unEspr}}', 'Solo modelli per l\'intera pratica: ditte e unità negoziali')}</tbody></table>`);
  }

  // ---------- Vista: Scadenze ----------
  APP.viste.scadenze = (m, p) => {
    const L = I.scadenze(p), oggi = U.oggi();
    const cls = { scaduta: 't-ko', prossima: 't-wa', futura: '', fatto: 't-ok', attesa: '', ok: 't-ok' }, nomi = { scaduta: 'scaduta', prossima: 'entro 15 giorni', futura: 'in corso', fatto: 'superata', attesa: 'non prima del', ok: 'termine minimo rispettato' };
    m.innerHTML = `<h2>⏰ Scadenze</h2><p class="mu">Termini calcolati dalle date degli atti (scheda Pratica) e dei passi delle ditte. Sono promemoria: verificare sempre il testo vigente.</p>
<div class="tw"><table class="t"><thead><tr><th>Data</th><th>Stato</th><th>Termine</th><th>Fase</th><th>Art.</th><th>Ditta</th></tr></thead><tbody>
${L.map(s => { const st = I.statoScad(s, oggi); return `<tr ${s.ditta ? `data-d="${s.ditta.id}"` : ''}><td><b>${U.dataIt(s.data)}</b></td><td><span class="tag ${cls[st]}">${nomi[st]}</span></td><td style="white-space:normal">${E(s.cosa)}</td><td style="white-space:normal" class="mu">${E(s.fase)}</td><td class="mu">${E(s.art)}</td><td>${s.ditta ? 'Ditta ' + E(s.ditta.n) : ''}</td></tr>`; }).join('') || '<tr><td colspan="6" class="vuoto">Nessuna scadenza: inserisci le date degli atti nella scheda Pratica e dei passi nelle ditte.</td></tr>'}</tbody></table></div>`;
    m.querySelectorAll('[data-d]').forEach(r => r.onclick = () => APP.vai('ditte', r.dataset.d));
  };

  // ---------- Vista: Normativa ----------
  APP.viste.normativa = m => { m.innerHTML = `<div class="card norm">${ES.NORMATIVA || ''}</div>`; };
})();
