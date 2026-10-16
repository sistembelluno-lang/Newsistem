// ESPROPRI_SISTEM · interfaccia (parte 1): archivio, navigazione, pratica, importazione, piano particellare.
(function () {
  'use strict';
  const U = ES.U, A = ES.analisi, C = ES.cat, S = ES.stima, I = ES.iter;
  const $ = s => document.querySelector(s), E = U.esc;
  const APP = window.APP = {};

  // ---------- Archivio: tutte le pratiche in un file (app desktop) o nel browser ----------
  const DB = APP.DB = { v: 1, pratiche: [], attiva: null, modelliWord: [] };
  const DESK = !!(window.desktop && window.desktop.save);
  const FASC = !!(window.desktop && window.desktop.fsScrivi);
  async function carica() {
    let txt = null;
    if (DESK) { try { const r = await window.desktop.init(); if (r && r.exists) txt = r.data; } catch (e) { toast('Lettura dati non riuscita: ' + e.message); } }
    if (!txt) { try { txt = localStorage.getItem('espropri:dati'); } catch (e) { /* storage non disponibile */ } }
    if (txt) { try { Object.assign(DB, JSON.parse(String(txt).replace(/^﻿/, ''))); } catch (e) { toast('File dati illeggibile: ' + e.message); } }
    DB.pratiche.forEach(normalizza);
    DB.modelliBase = DB.modelliBase || {}; DB.modelliCustom = DB.modelliCustom || []; DB.modelliWord = DB.modelliWord || [];
  }
  let tS = null, salvato = true;
  APP.salva = () => { salvato = false; clearTimeout(tS); tS = setTimeout(scrivi, 500); hdr(); };
  async function scrivi() {
    const json = JSON.stringify(DB);
    if (DESK) { const r = await window.desktop.save(json); if (!r || !r.ok) toast('Salvataggio non riuscito' + (r && r.error ? ': ' + r.error : '')); else salvato = true; }
    else { try { localStorage.setItem('espropri:dati', json); salvato = true; } catch (e) { toast('Spazio del browser esaurito: usa «Salva su file»'); } }
    hdr();
  }
  window.addEventListener('beforeunload', () => { if (!salvato) scrivi(); });

  function nuovaPratica(nome) {
    return normalizza({ id: U.id(), nome: nome || 'Nuova pratica di esproprio', cup: '', codice: '', descrizione: '', urgenza: '', creata: U.oggi(),
      ente: { nome: '', comune: '', provincia: '', luogo: '', indirizzo: '', cf: '', pec: '', email: '', telefono: '', ufficio: 'Ufficio Espropriazioni', responsabile: '', ruolo: 'Il Responsabile del procedimento', rup: '', tecnico: '', studio: 'SISTEM srl stp', beneficiario: '', cfBeneficiario: '', sedeBeneficiario: '', tribunale: '', tar: '', bur: '', link: '' },
      impost: U.clone(S.IMPOST), valori: U.clone(S.VALORI), particelle: [], ditte: [], geo: null, iter: {}, modelli: {}, docs: [] });
  }
  function normalizza(p) {
    p.impost = Object.assign(U.clone(S.IMPOST), p.impost || {});
    ['particelle', 'ditte', 'valori', 'docs'].forEach(k => { p[k] = p[k] || []; });
    p.iter = p.iter || {}; p.modelli = p.modelli || {}; p.ente = p.ente || {}; p.dati = p.dati || {}; p.campi = p.campi || [];
    p.ditte.forEach(d => { d.ev = d.ev || {}; d.intest = d.intest || []; d.foto = d.foto || []; });
    p.particelle.forEach(x => { x.man = x.man || {}; x.nuovo = x.nuovo || {}; });
    return p;
  }
  APP.pr = () => DB.pratiche.find(p => p.id === DB.attiva) || null;
  APP.calc = () => { const p = APP.pr(); return p ? S.calcola(p) : null; };

  // ---------- Utilità dell'interfaccia ----------
  let tT = null;
  const toast = APP.toast = (m, ms = 3500) => { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(tT); tT = setTimeout(() => { t.style.display = 'none'; }, ms); };
  // Finestra: bottoni [{t:'Testo', v:'valore', p:true}] → Promise(valore)
  APP.dlg = (titolo, html, bottoni = [{ t: 'Chiudi', v: '' }], onOpen) => new Promise(res => {
    const d = $('#dlg');
    $('#dlgt').textContent = titolo; $('#dlgb').innerHTML = html;
    $('#dlgft').innerHTML = bottoni.map(b => `<button value="${E(b.v)}" class="${b.p ? 'p' : b.d ? 'd' : ''}">${E(b.t)}</button>`).join('');
    d.onclose = () => res(d.returnValue);
    d.returnValue = '';
    d.showModal();
    if (onOpen) onOpen($('#dlgb'));
  });
  APP.conferma = async (m, ok = 'Conferma') => (await APP.dlg('Conferma', `<p>${m}</p>`, [{ t: 'Annulla', v: '' }, { t: ok, v: 'ok', p: true }])) === 'ok';
  // Scelta di file: Promise([{nome, buf}])
  APP.scegliFile = (accept, multi) => new Promise(res => {
    const f = $('#fin'); f.value = ''; f.accept = accept || ''; f.multiple = !!multi;
    f.onchange = async () => { const L = []; for (const x of f.files) L.push({ nome: x.name, buf: await x.arrayBuffer(), tipo: x.type }); res(L); };
    f.click();
  });
  APP.scarica = (nome, dati, mime) => {
    const b = dati instanceof Blob ? dati : new Blob([dati], { type: mime || 'application/octet-stream' });
    // Nei download del browser il nome resta in caratteri semplici (alcuni browser rifiutano gli accenti)
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = String(nome).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '_'); document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  };
  // Lega gli input con data-f="percorso" all'oggetto; data-t: num, bool, date
  APP.lega = (root, obj, dopo) => {
    root.querySelectorAll('[data-f]').forEach(el => {
      const path = el.dataset.f.split('.'), t = el.dataset.t;
      let o = obj; for (let i = 0; i < path.length - 1; i++) o = o[path[i]] = o[path[i]] || {};
      const k = path[path.length - 1], v = o[k];
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v ?? '';
      el.addEventListener('change', () => {
        let nv = el.type === 'checkbox' ? el.checked : el.value;
        if (t === 'num') nv = el.value === '' ? '' : U.num(el.value);
        if (t === 'pct') nv = U.num(el.value) / 100;
        o[k] = nv; APP.salva(); if (dopo) dopo(el, nv);
      });
      if (t === 'pct') el.value = v === '' || v == null ? '' : Math.round(v * 10000) / 100;
    });
  };
  const san = s => String(s || '').replace(/[\u2010-\u2015]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\\/:*?"<>|«»\u201c\u201d]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

  // ---------- Fascicolo su disco ----------
  const FS = APP.FS = {
    ok: FASC,
    dirPratica: p => san((p.codice ? p.codice + ' ' : '') + (p.nome || 'Pratica')),
    dirDitta: (p, d) => FS.dirPratica(p) + '/DITTA ' + d.n + ' ' + san((d.intest[0] && d.intest[0].nome) || ''),
    dirGenerale: p => FS.dirPratica(p) + '/00 GENERALE',
    async salva(rel, dati) {
      if (FASC) { const r = await window.desktop.fsScrivi(rel, dati); toast('Salvato nel fascicolo: ' + rel.split('/').slice(1).join(' › ')); return r; }
      APP.scarica(rel.split('/').pop(), dati); return { ok: true };
    },
    apri: rel => (FASC ? window.desktop.fsApri(rel) : toast('Le cartelle del fascicolo si usano nel programma installato sul PC')),
    elenco: rel => (FASC ? window.desktop.fsElenco(rel) : Promise.resolve([])),
    leggi: rel => (FASC ? window.desktop.fsLeggi(rel) : Promise.resolve(null))
  };

  // ---------- Navigazione ----------
  const VISTE = [
    ['pratica', '🗂️', 'Pratica'], ['importa', '📥', 'Importa DXF / Excel'], ['piano', '📋', 'Piano particellare'], ['ditte', '👥', 'Ditte e iter'], ['indirizzi', '📮', 'Indirizzi'],
    ['tavola', '🗺️', 'Tavola grafica'], ['stima', '💶', 'Indennità'], ['documenti', '📄', 'Documenti'], ['scadenze', '⏰', 'Scadenze'], ['normativa', '⚖️', 'Normativa']
  ];
  let vista = 'pratica';
  APP.vai = (v, arg) => { vista = v; APP.arg = arg; render(); window.scrollTo(0, 0); };
  function nav() {
    const p = APP.pr();
    $('#nav').innerHTML = (p ? `<div class="pr"><b>${E(p.nome)}</b><br>${p.ditte.length} ditte · ${p.particelle.length} particelle</div>` : '') +
      VISTE.map(([k, ic, t], i) => (i === 5 || i === 8 ? '<div class="sep"></div>' : '') + `<button data-v="${k}" class="${k === vista ? 'on' : ''}" ${!p && k !== 'pratica' && k !== 'normativa' ? 'disabled' : ''}>${ic} ${t}</button>`).join('');
  }
  function hdr() {
    const p = APP.pr();
    $('#hdr').innerHTML = `<select id="selp" title="Pratica aperta">${DB.pratiche.map(x => `<option value="${x.id}" ${p && x.id === p.id ? 'selected' : ''}>${E(x.nome)}</option>`).join('')}${DB.pratiche.length ? '' : '<option>Nessuna pratica</option>'}</select>
<button id="hnew">＋ Nuova pratica</button><button id="hopen" title="Apri una pratica salvata su file (.json)">Apri file</button><button id="hsave" ${p ? '' : 'disabled'} title="Salva la pratica in un file da conservare o inviare">Salva su file</button>
${FASC && p ? '<button id="hfasc" title="Apri la cartella del fascicolo">📁 Fascicolo</button>' : ''}<span class="mu" style="color:#fff;opacity:.8">${salvato ? '✓ salvato' : '… salvataggio'}</span>`;
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest('button,[data-v]'); if (!b) return;
    if (b.dataset.v) { APP.vai(b.dataset.v); return; }
    if (b.id === 'hnew') { const p = nuovaPratica(); DB.pratiche.push(p); DB.attiva = p.id; APP.salva(); APP.vai('pratica'); }
    if (b.id === 'hopen') {
      const [f] = await APP.scegliFile('.json'); if (!f) return;
      try {
        const o = JSON.parse(new TextDecoder().decode(f.buf).replace(/^﻿/, ''));
        const p = normalizza(o.pratica || o);
        if (DB.pratiche.some(x => x.id === p.id)) { if (!await APP.conferma('Questa pratica è già presente: aggiungerla come copia?', 'Aggiungi copia')) return; p.id = U.id(); p.nome += ' (copia)'; }
        DB.pratiche.push(p); DB.attiva = p.id; APP.salva(); APP.vai('pratica'); toast('Pratica aperta');
      } catch (err) { toast('File non valido: ' + err.message); }
    }
    if (b.id === 'hsave') { const p = APP.pr(); APP.scarica(san(p.nome) + '.esproprio.json', JSON.stringify({ tipo: 'ESPROPRI_SISTEM', v: 1, pratica: p }, null, 1), 'application/json'); }
    if (b.id === 'hfasc') FS.apri(FS.dirPratica(APP.pr()));
  });
  document.addEventListener('change', e => { if (e.target.id === 'selp') { DB.attiva = e.target.value; APP.salva(); render(); } });

  function render() {
    nav(); hdr();
    const m = $('#main'), p = APP.pr();
    if (!p && vista !== 'normativa') { m.innerHTML = `<div class="card vuoto"><h2>Benvenuto in ESPROPRI_SISTEM</h2><p>Gestione delle procedure di esproprio, asservimento e occupazione temporanea (D.P.R. 327/2001).</p><button class="p" id="hnew">＋ Crea la prima pratica</button></div>`; return; }
    (APP.viste[vista] || APP.viste.pratica)(m, p);
  }
  APP.render = render;
  APP.viste = {};

  // ---------- Vista: Pratica ----------
  APP.viste.pratica = (m, p) => {
    const proc = Object.entries(S.PROCEDURE).map(([k, v]) => `<option value="${k}">${v.nome}</option>`).join('');
    m.innerHTML = `<h2>🗂️ Pratica</h2>
<div class="card"><h3 style="margin-top:0">Opera</h3><div class="g">
<label class="f">Oggetto dei lavori<input data-f="nome"></label>
<label>CUP<input data-f="cup"></label><label>Codice / commessa<input data-f="codice"></label>
<label>Percorso procedurale principale<select data-f="impost.procedura">${proc}</select></label>
<label class="f">Ragioni di urgenza (per i decreti artt. 22 / 22-bis)<input data-f="urgenza"></label>
<label class="f">Descrizione dell'opera<textarea data-f="descrizione" rows="2"></textarea></label></div></div>
<div class="card"><h3 style="margin-top:0">Autorità espropriante e beneficiario</h3><div class="g">
<label class="f2">Ente / Autorità espropriante<input data-f="ente.nome" placeholder="Comune di …"></label><label>Provincia<input data-f="ente.provincia"></label><label>Luogo per la data degli atti<input data-f="ente.luogo"></label>
<label class="f2">Indirizzo<input data-f="ente.indirizzo"></label><label>C.F. / P.IVA<input data-f="ente.cf"></label><label>PEC<input data-f="ente.pec"></label>
<label>E-mail<input data-f="ente.email"></label><label>Telefono<input data-f="ente.telefono"></label><label>Ufficio<input data-f="ente.ufficio"></label>
<label class="f2">Firmatario (nome)<input data-f="ente.responsabile" placeholder="ing. Mario Bianchi"></label><label class="f2">Qualifica del firmatario<input data-f="ente.ruolo" placeholder="Il Responsabile dell'Area Tecnica"></label>
<label class="f2">Responsabile del procedimento (RUP)<input data-f="ente.rup"></label><label class="f2">Tecnico incaricato (stati di consistenza)<input data-f="ente.tecnico" placeholder="geom. …"></label><label>Studio incaricato<input data-f="ente.studio"></label><label>Sede dello studio<input data-f="ente.sedeStudio" placeholder="Belluno (BL)"></label>
<label class="f2">Beneficiario dell'esproprio (se diverso)<input data-f="ente.beneficiario"></label><label>C.F. beneficiario<input data-f="ente.cfBeneficiario"></label><label class="f2">Sede beneficiario<input data-f="ente.sedeBeneficiario"></label>
<label>Tribunale civile di<input data-f="ente.tribunale"></label><label>T.A.R.<input data-f="ente.tar" placeholder="Veneto"></label><label class="f2">Bollettino per gli estratti<input data-f="ente.bur" placeholder="BUR Veneto"></label>
<label class="f">Link alla documentazione progettuale<input data-f="ente.link"></label></div></div>
<div class="card"><h3 style="margin-top:0">Dati specifici per i documenti</h3><p class="mu">Si scrivono una volta e compaiono in tutti i documenti di questa pratica (il testo base dei modelli resta uguale per tutte le pratiche). Nei modelli si richiamano con il segnaposto indicato.</p>
<div class="g">${ES.modelli.DATI.map(c => `<label class="f">${E(c.nome)} <span class="mu">{{dati.${c.k}}} – ${E(c.aiuto)}</span>${c.righe > 1 ? `<textarea data-f="dati.${c.k}" rows="${c.righe}" style="font-family:inherit;font-size:13px"></textarea>` : `<input data-f="dati.${c.k}">`}</label>`).join('')}
${p.campi.map((c, i) => `<label class="f">${E(c.nome)} <span class="mu">{{dati.${E(c.k)}}} <button type="button" class="s d" data-cdel="${i}">togli campo</button></span><textarea data-f="dati.${E(c.k)}" rows="2" style="font-family:inherit;font-size:13px"></textarea></label>`).join('')}</div>
<div class="row" style="margin-top:8px"><button id="cadd">＋ Campo personalizzato</button><span class="mu">Es. «Parere della Soprintendenza», «Estremi del finanziamento regionale»: poi inseriscilo nel testo dei modelli (Documenti › ✏️ Testo).</span></div></div>
<div class="card"><h3 style="margin-top:0">Atti della procedura</h3><p class="mu">Data ed estremi degli atti: compaiono nelle premesse dei documenti e fanno partire le scadenze.</p>
<div class="tw" style="max-height:none"><table class="t"><thead><tr><th>Fase</th><th>Art.</th><th>Data</th><th>Estremi (es. «Delibera G.C. n. 62»)</th><th>Scadenze</th></tr></thead><tbody>
${I.FASI.map(f => { const x = p.iter[f.k] || {}; return `<tr><td>${E(f.nome)}</td><td class="mu">${E(f.art)}</td><td><input type="date" data-f="iter.${f.k}.data"></td><td><input data-f="iter.${f.k}.estremi" style="min-width:220px"></td><td class="mu">${x.data ? f.t.map(t => E(t.nome.split('(')[0]) + ': <b>' + U.dataIt(t.f(x.data)) + '</b>').join('<br>') : ''}</td></tr>`; }).join('')}
</tbody></table></div></div>
<div class="card row"><span class="grow mu">Pratica creata il ${U.dataIt(p.creata)}. ${FASC ? 'Fascicolo: <b>' + E(FS.dirPratica(p)) + '</b>' : ''}</span>${FASC ? '<button id="pcart">Cartella dei fascicoli…</button>' : ''}<button class="d" id="pdel">Elimina pratica</button></div>`;
    APP.lega(m, p, (el) => { if (/^iter\.|^nome/.test(el.dataset.f)) APP.render(); });
    m.querySelector('#pdel').onclick = async () => { if (!await APP.conferma(`Eliminare definitivamente la pratica «${E(p.nome)}»? I file del fascicolo su disco restano.`, 'Elimina')) return; DB.pratiche = DB.pratiche.filter(x => x !== p); DB.attiva = DB.pratiche[0] ? DB.pratiche[0].id : null; APP.salva(); render(); };
    m.querySelector('#cadd').onclick = async () => {
      const r = await APP.dlg('Nuovo campo', '<label class="fl">Nome del campo<input id="cn" placeholder="es. Parere della Soprintendenza"></label>', [{ t: 'Annulla', v: '' }, { t: 'Aggiungi', v: 'ok', p: true }]);
      const nome = r === 'ok' && $('#cn').value.trim(); if (!nome) return;
      let k = U.norm(nome).replace(/ (\w)/g, (x, c) => c.toUpperCase()).replace(/[^a-zA-Z0-9]/g, '') || 'campo';
      if (/^\d/.test(k)) k = 'c' + k;
      while (p.campi.some(c => c.k === k) || ES.modelli.DATI.some(c => c.k === k)) k += '2';
      p.campi.push({ k, nome }); APP.salva(); APP.render(); toast('Campo aggiunto: {{dati.' + k + '}}');
    };
    m.querySelectorAll('[data-cdel]').forEach(b => b.onclick = async () => { const c = p.campi[+b.dataset.cdel]; if (await APP.conferma('Togliere il campo «' + E(c.nome) + '»? Il segnaposto nei modelli resterà vuoto.', 'Togli')) { p.campi.splice(+b.dataset.cdel, 1); delete p.dati[c.k]; APP.salva(); APP.render(); } });
    const pc = m.querySelector('#pcart'); if (pc) pc.onclick = async () => { const r = await window.desktop.fsScegli(); if (r) toast('Fascicoli in ' + r.dir); };
  };

  // ---------- Vista: Importa ----------
  let impDxf = null, impGeo = null, impTab = null;
  APP.viste.importa = (m, p) => {
    m.innerHTML = `<h2>📥 Importa</h2>
<div class="card"><h3 style="margin-top:0">1 · Disegno DXF / DWG</h3>
<p class="mu">Il disegno può contenere le <b>aree d'intervento già tagliate</b> sui limiti di particella con dentro il numero della particella originaria (es. «100», «Fg.1 100»), oppure il <b>layer delle particelle catastali</b> con i numeri e le aree d'intervento intere: il programma divide da solo per particella. Le sovrapposizioni si tolgono per priorità: esproprio, servitù ingombro opere, servitù fascia, occupazione.</p>
<div class="row"><button class="p" id="idxf">Scegli DXF o DWG…</button><span class="mu" id="idxfn">${impDxf ? E(impDxf.nome) : ''}</span></div>
<div id="ilay"></div></div>
<div class="card"><h3 style="margin-top:0">2 · Elenco ditte (Excel .xlsx o CSV)</h3>
<p class="mu">Una riga per particella (foglio, mappale, qualità, superficie, redditi…) con gli intestatari: in colonne separate (nome, nato a, il, C.F., diritto, quota, indirizzo) oppure tutti in una cella come nelle visure («ROSSI MARIO nato a … CF … Proprieta' 1/2; …»). Va bene anche il <b>formato a blocchi del riepilogo visure</b> (numero «N.» sulla prima riga della ditta, sotto gli intestatari riga per riga: nome, «CF:…», «Proprieta': 1/1»; particelle nelle colonne a destra). La ditta è formata dalle particelle con <b>gli stessi intestatari e le stesse quote</b>. Il mappale «1706 ex 1367» è letto come particella derivata da frazionamento.</p>
<div class="row"><button class="p" id="itab">Scegli Excel o CSV…</button><span class="mu" id="itabn">${impTab ? E(impTab.nome) : ''}</span></div>
<div id="itabv"></div></div>
<div class="card"><h3 style="margin-top:0">Situazione della pratica</h3>${riepilogoImport(p)}</div>`;
    m.querySelector('#idxf').onclick = async () => {
      const [f] = await APP.scegliFile('.dxf,.dwg'); if (!f) return;
      let buf = f.buf;
      if (/\.dwg$/i.test(f.nome)) {
        if (!(window.desktop && window.desktop.dwg)) { toast('Il DWG si legge nel programma installato (con ODA File Converter); qui salva il disegno come DXF', 6000); return; }
        toast('Conversione del DWG in corso…');
        const r = await window.desktop.dwg(f.nome, new Uint8Array(buf)); if (!r.ok) { APP.dlg('DWG', `<p>${E(r.error)}</p>`); return; }
        buf = r.dati.buffer;
      }
      try { impDxf = { nome: f.nome, dxf: ES.dxf.leggi(buf), ruoli: {} }; impGeo = null; }
      catch (err) { toast('DXF non leggibile: ' + err.message, 6000); return; }
      Object.keys(impDxf.dxf.layers).forEach(l => { impDxf.ruoli[l] = A.ruoloAuto(l); });
      APP.render();
    };
    m.querySelector('#itab').onclick = async () => {
      const [f] = await APP.scegliFile('.xlsx,.csv,.txt'); if (!f) return;
      try { impTab = { nome: f.nome, dati: await ES.tab.leggi(f.nome, f.buf), foglio: 0 }; } catch (err) { toast(err.message, 6000); return; }
      APP.render();
    };
    if (impDxf) vistaLayer(m.querySelector('#ilay'), p);
    if (impTab) vistaTabella(m.querySelector('#itabv'), p);
  };
  function riepilogoImport(p) {
    const Sup = A.superfici(p.geo), chiavi = new Set(p.particelle.map(x => A.chiave(x.fg, x.map, x.sub)));
    const pz = p.geo ? p.geo.pezzi : [];
    const orfani = pz.filter(z => z.k && !chiavi.has(z.k) && !chiavi.has(z.k.split('|').slice(0, 2).join('|')));
    const senza = pz.filter(z => !z.k);
    const nonDis = p.particelle.filter(x => !Sup[A.chiave(x.fg, x.map, x.sub)] && !Object.values(x.man || {}).some(v => v !== '' && v != null));
    return `<div class="kpi"><div><small>Aree d'intervento nel disegno</small><b>${pz.length}</b></div><div><small>Particelle catastali nel disegno</small><b>${p.geo ? p.geo.part.length : 0}</b></div><div><small>Particelle nel piano</small><b>${p.particelle.length}</b></div><div><small>Ditte</small><b>${p.ditte.length}</b></div></div>
${senza.length ? `<div class="ban">${senza.length} aree del disegno senza particella: assegnale nella tabella qui sotto.</div>` : ''}
${orfani.length ? `<div class="ban">Aree del disegno su particelle che non sono nell'elenco ditte: ${[...new Set(orfani.map(z => 'Fg.' + (z.fg || '?') + ' ' + z.map))].slice(0, 30).map(E).join(', ')}. <button class="s" id="iorf">Aggiungi al piano come ditte da completare</button></div>` : ''}
${nonDis.length ? `<div class="ban">Particelle dell'elenco senza aree nel disegno né superfici manuali: ${nonDis.slice(0, 30).map(x => 'Fg.' + x.fg + ' ' + x.map).map(E).join(', ')}.</div>` : ''}
${senza.length ? tabSenza(senza) : ''}`;
  }
  function tabSenza(L) {
    return `<div class="tw"><table class="t"><thead><tr><th>Tipo</th><th>Layer</th><th class="n">Superficie</th><th>Foglio</th><th>Mappale</th></tr></thead><tbody>${L.map(z => `<tr><td><span class="tag ${tagTipo(z.tipo)}">${A.RUOLI[z.tipo]}</span></td><td>${E(z.layer)}</td><td class="n">${U.fmt(z.a, 1)} mq</td><td><input data-pz="${z.id}" data-c="fg" value="${E(z.fg)}"></td><td><input data-pz="${z.id}" data-c="map" value="${E(z.map)}"></td></tr>`).join('')}</tbody></table></div>`;
  }
  const tagTipo = APP.tagTipo = t => ({ espr: 't-es', serv: 't-sv', servop: 't-so', occ: 't-oc' }[t] || '');
  document.addEventListener('change', e => {
    const el = e.target; if (!el.dataset || !el.dataset.pz) return;
    const p = APP.pr(), z = p.geo.pezzi.find(x => x.id === el.dataset.pz) || (impGeo && impGeo.pezzi.find(x => x.id === el.dataset.pz)); if (!z) return;
    z[el.dataset.c] = el.value.trim(); z.k = z.map ? A.chiave(z.fg, z.map, z.sub) : null; APP.salva();
  });
  document.addEventListener('click', e => {
    if (e.target.id !== 'iorf') return;
    const p = APP.pr(), chiavi = new Set(p.particelle.map(x => A.chiave(x.fg, x.map, x.sub)));
    const nuovi = new Map();
    p.geo.pezzi.filter(z => z.k && !chiavi.has(z.k)).forEach(z => { if (!nuovi.has(z.k)) nuovi.set(z.k, { id: U.id(), ct: 'T', comune: p.geo.comune || p.ente.comune || '', fg: z.fg, map: z.map, sub: z.sub || '', nuovo: {}, man: {}, qual: '', cls: '', sup: 0, intest: [] }); });
    const P = [...nuovi.values()];
    P.forEach(x => { const d = { id: U.id(), n: '', intest: [{ id: U.id(), nome: 'DA COMPLETARE (Fg.' + x.fg + ' mapp.' + x.map + ')' }], ev: {}, foto: [] }; x.ditta = d.id; p.ditte.push(d); delete x.intest; p.particelle.push(x); });
    let n = Math.max(0, ...p.ditte.map(d => +d.n || 0)); p.ditte.filter(d => !d.n).forEach(d => { d.n = String(++n); });
    normalizza(p); APP.salva(); toast(P.length + ' particelle aggiunte: completa gli intestatari nella scheda Ditte'); APP.render();
  });

  function vistaLayer(el, p) {
    const L = Object.keys(impDxf.dxf.layers).sort(U.cmp);
    const opt = impDxf.opt = impDxf.opt || { fg: '', comune: p.ente.comune || '', fgMap: false, sottrai: true, scheggia: 0.5, sostituisci: !p.geo };
    el.innerHTML = `<h3>Layer del disegno</h3><div class="tw" style="max-height:40vh"><table class="t"><thead><tr><th>Layer</th><th class="n">Linee</th><th class="n">Chiuse</th><th class="n">Testi</th><th>Uso nel programma</th></tr></thead><tbody>
${L.map(l => { const x = impDxf.dxf.layers[l]; return `<tr><td>${E(l)}</td><td class="n">${x.poli}</td><td class="n">${x.chiuse}</td><td class="n">${x.testi}</td><td><select data-ly="${E(l)}">${Object.entries(A.RUOLI).map(([k, v]) => `<option value="${k}" ${impDxf.ruoli[l] === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td></tr>`; }).join('')}
</tbody></table></div>
<div class="g" style="margin-top:10px"><label>Foglio (se le etichette non lo indicano)<input id="ifg" value="${E(opt.fg)}"></label><label>Comune catastale<input id="icom" value="${E(opt.comune)}"></label>
<label>Scarta schegge sotto (mq)<input id="isch" value="${opt.scheggia}"></label>
<label class="chk"><input type="checkbox" id="ifm" ${opt.fgMap ? 'checked' : ''}> Etichette «1/100» = foglio/mappale</label>
<label class="chk"><input type="checkbox" id="isot" ${opt.sottrai ? 'checked' : ''}> Togli le sovrapposizioni tra tipi</label>
<label class="chk"><input type="checkbox" id="isost" ${opt.sostituisci ? 'checked' : ''}> Sostituisci il disegno già importato</label></div>
<div class="row" style="margin-top:10px"><button class="p" id="ian">Analizza il disegno</button></div><div id="ires"></div>`;
    el.querySelectorAll('[data-ly]').forEach(s => s.onchange = () => { impDxf.ruoli[s.dataset.ly] = s.value; });
    const leggiOpt = () => { opt.fg = el.querySelector('#ifg').value.trim(); opt.comune = el.querySelector('#icom').value.trim(); opt.scheggia = U.num(el.querySelector('#isch').value); opt.fgMap = el.querySelector('#ifm').checked; opt.sottrai = el.querySelector('#isot').checked; opt.sostituisci = el.querySelector('#isost').checked; };
    el.querySelector('#ian').onclick = () => {
      leggiOpt();
      try { impGeo = A.importaDxf(impDxf.dxf, { ...opt, ruoli: impDxf.ruoli }); } catch (err) { toast('Analisi non riuscita: ' + err.message, 6000); console.error(err); return; }
      risultatoDxf(el.querySelector('#ires'), p);
    };
    if (impGeo) risultatoDxf(el.querySelector('#ires'), p);
  }
  function risultatoDxf(el, p) {
    const g = impGeo, per = {};
    g.pezzi.forEach(z => { const k = z.k || '—'; const o = per[k] = per[k] || { fg: z.fg, map: z.map, espr: 0, servop: 0, serv: 0, occ: 0, n: 0, da: new Set() }; o[z.tipo] += z.a; o.n++; if (z.da) o.da.add(z.da); });
    const R = Object.values(per).sort((a, b) => U.cmp(a.fg, b.fg) || U.cmp(a.map, b.map));
    el.innerHTML = `<h3>Risultato</h3>${g.avvisi.map(a => `<div class="ban">${E(a)}</div>`).join('')}
<div class="kpi"><div><small>Particelle catastali lette</small><b>${g.part.length}</b></div><div><small>Aree d'intervento</small><b>${g.pezzi.length}</b></div><div><small>Particelle interessate</small><b>${R.filter(r => r.map).length}</b></div></div>
<div class="tw" style="max-height:45vh"><table class="t"><thead><tr><th>Foglio</th><th>Mappale</th><th class="n">Esproprio</th><th class="n">Servitù ingombro</th><th class="n">Servitù fascia</th><th class="n">Occupazione</th><th>Origine</th></tr></thead><tbody>
${R.map(r => `<tr><td>${E(r.fg || '?')}</td><td>${E(r.map || 'da assegnare')}</td>${['espr', 'servop', 'serv', 'occ'].map(t => `<td class="n">${r[t] ? U.fmt(r[t], 1) : ''}</td>`).join('')}<td class="mu">${[...r.da].map(x => x === 'catasto' ? 'intersezione con particelle' : 'etichetta nel disegno').join(', ')}</td></tr>`).join('')}</tbody></table></div>
${g.pezzi.some(z => !z.k) ? '<h3>Aree senza particella</h3>' + tabSenza(g.pezzi.filter(z => !z.k)) : ''}
<div class="row" style="margin-top:10px"><button class="p" id="iapp">Usa questo disegno nella pratica</button><span class="mu">Le superfici si collegano alle particelle dell'elenco ditte per foglio e mappale.</span></div>`;
    el.querySelector('#iapp').onclick = () => {
      p.geo = A.unisciGeo(p.geo, impGeo, impDxf.opt.sostituisci);
      if (impDxf.opt.comune && !p.ente.comune) p.ente.comune = impDxf.opt.comune;
      // Confini automatici per le particelle già presenti
      p.particelle.forEach(x => { if (!x.confini) x.confini = A.confini(p.geo, A.chiave(x.fg, x.map, x.sub)); });
      impGeo = null; impDxf = null; APP.salva(); toast('Disegno collegato alla pratica'); APP.render();
    };
  }

  function vistaTabella(el, p) {
    const fogli = impTab.dati.fogli;
    const fo = fogli[impTab.foglio] || fogli[0];
    let res = null, err = '';
    try { res = C.importaTabella(fo.righe, { fg: impTab.fg || '', comune: p.ente.comune || '' }); } catch (e) { err = e.message; }
    const nomiCampi = { nditta: 'N. ditta', comune: 'Comune', sez: 'Sezione', fg: 'Foglio', map: 'Mappale', nuovo: 'Mappale derivato', ex: 'Ex mappale', sub: 'Sub', qual: 'Qualità', cls: 'Classe', sup: 'Superficie', ha: 'Ha', are: 'Are', ca: 'Ca', rd: 'R.D.', ra: 'R.A.', zona: 'Destinazione', espr: 'Sup. esproprio', servop: 'Sup. servitù opere', serv: 'Sup. servitù', occ: 'Sup. occupazione', intest: 'Intestatari', cognome: 'Cognome', nome: 'Nome', natoA: 'Nato a', natoIl: 'Nato il', natoAIl: 'Nato a… il…', cf: 'C.F.', titolo: 'Diritto', quota: 'Quota', via: 'Indirizzo', cap: 'CAP', citta: 'Città', prov: 'Prov.', pec: 'PEC', note: 'Note', ct: 'Catasto' };
    const head = fo.righe[res ? res.rigaIntestazione : 0] || [];
    el.innerHTML = `${fogli.length > 1 ? `<label class="fl" style="max-width:280px">Foglio di lavoro<select id="ifo">${fogli.map((f, i) => `<option value="${i}" ${i === impTab.foglio ? 'selected' : ''}>${E(f.nome)} (${f.righe.length} righe)</option>`).join('')}</select></label>` : ''}
${err ? `<div class="ban err">${E(err)}</div>` : `
<p class="mu">Colonne riconosciute: ${Object.entries(res.colonne).map(([k, i]) => `<span class="tag">${E(head[i])} → ${nomiCampi[k] || k}</span>`).join(' ')}</p>
${res.avvisi.slice(0, 15).map(a => `<div class="ban">${E(a)}</div>`).join('')}${res.avvisi.length > 15 ? `<p class="mu">… e altri ${res.avvisi.length - 15} avvisi</p>` : ''}
<div class="kpi"><div><small>Particelle</small><b>${res.particelle.length}</b></div><div><small>Ditte</small><b>${res.ditte.length}</b></div><div><small>Intestatari</small><b>${res.ditte.reduce((s, d) => s + d.intest.length, 0)}</b></div></div>
${(() => { const L = res.ditte.flatMap(d => d.intest.filter(o => !o.cf || !C.cfValido(o.cf)).map(o => ({ d, o }))); return L.length ? `<div class="ban">⚠ ${L.length} intestatari senza codice fiscale o con codice da verificare: le ditte vengono create lo stesso, il codice va inserito a mano nella scheda della ditta.<br><span class="mu">${L.slice(0, 20).map(x => 'Ditta ' + E(x.d.n) + ': ' + E(x.o.nome) + (x.o.cf ? ' (' + E(x.o.cf) + ')' : '')).join(' · ')}${L.length > 20 ? ' …' : ''}</span></div>` : ''; })()}
<div class="tw" style="max-height:40vh"><table class="t"><thead><tr><th>Ditta</th><th>Intestatari</th><th>Particelle</th></tr></thead><tbody>${res.ditte.map(d => `<tr><td><b>${E(d.n)}</b></td><td>${d.intest.map(o => E(o.nome) + ' <span class="mu">' + E(C.diritto(o)) + '</span>' + (!o.cf ? ' <span class="tag t-wa">C.F. mancante</span>' : !C.cfValido(o.cf) ? ' <span class="tag t-ko">C.F. da verificare</span>' : '')).join('<br>')}</td><td>${res.particelle.filter(x => x.ditta === d.id).map(x => 'Fg.' + E(x.fg) + ' ' + E(C.mappale(x))).join(', ')}</td></tr>`).join('')}</tbody></table></div>
<div class="g" style="margin-top:10px"><label>Foglio per le righe senza foglio<input id="itfg" value="${E(impTab.fg || '')}"></label>
<label class="chk"><input type="checkbox" id="itsost" ${p.particelle.length ? '' : 'checked'}> Sostituisci elenco e ditte esistenti</label></div>
<div class="row" style="margin-top:10px"><button class="p" id="itapp">Importa nel piano particellare</button></div>`}`;
    const fsel = el.querySelector('#ifo'); if (fsel) fsel.onchange = () => { impTab.foglio = +fsel.value; APP.render(); };
    const tfg = el.querySelector('#itfg'); if (tfg) tfg.onchange = () => { impTab.fg = tfg.value.trim(); APP.render(); };
    const ap = el.querySelector('#itapp'); if (ap) ap.onclick = async () => {
      const sost = el.querySelector('#itsost').checked;
      if (sost && p.particelle.length && !await APP.conferma('Sostituire particelle e ditte esistenti? Le date dell\'iter registrate sulle ditte andranno perse.', 'Sostituisci')) return;
      if (sost) { p.particelle = res.particelle; p.ditte = res.ditte; }
      else {
        // Aggiunta: le particelle già presenti (stesso foglio/mappale/sub) si aggiornano, le ditte si ricalcolano su tutte
        const idx = new Map(p.particelle.map(x => [A.chiave(x.fg, x.map, x.sub), x]));
        const intestDi = new Map(); p.particelle.forEach(x => { const d = p.ditte.find(dd => dd.id === x.ditta); intestDi.set(x.id, d ? d.intest : []); });
        res.particelle.forEach(x => { const d = res.ditte.find(dd => dd.id === x.ditta); intestDi.set(x.id, d ? d.intest : []); const v = idx.get(A.chiave(x.fg, x.map, x.sub)); if (v) { Object.keys(x).forEach(k => { if (k !== 'id' && x[k] && !(typeof x[k] === 'object' && !Object.keys(x[k]).length)) v[k] = x[k]; }); intestDi.set(v.id, intestDi.get(x.id)); } else p.particelle.push(x); });
        const vecchie = p.ditte;
        p.particelle.forEach(x => { x.intest = intestDi.get(x.id) || []; x.nd = (vecchie.find(d => d.id === x.ditta) || {}).n || x.nd; });
        p.ditte = C.raggruppa(p.particelle);
        // Le ditte invariate conservano iter, foto e note
        p.ditte.forEach(d => { const v = vecchie.find(o => C.firma(o.intest) === C.firma(d.intest)); if (v) Object.assign(d, { ev: v.ev, foto: v.foto, note: v.note, procedura: v.procedura, cessione: v.cessione, cond: v.cond, oss: v.oss, intest: v.intest.length >= d.intest.length ? v.intest : d.intest }); });
        p.particelle.forEach(x => { delete x.intest; });
      }
      p.particelle.forEach(x => { if (!x.confini && p.geo) x.confini = A.confini(p.geo, A.chiave(x.fg, x.map, x.sub)); });
      normalizza(p); impTab = null; APP.salva(); toast('Elenco ditte importato'); APP.render();
    };
  }

  // ---------- Vista: Piano particellare ----------
  APP.viste.piano = (m, p) => {
    const c = APP.calc(), I0 = p.impost;
    const dit = new Map(p.ditte.map(d => [d.id, d]));
    const P = p.particelle.slice().sort((a, b) => U.cmp((dit.get(a.ditta) || {}).n, (dit.get(b.ditta) || {}).n) || U.cmp(a.fg, b.fg) || U.cmp(a.map, b.map));
    let prev = null;
    const righe = P.map(x => {
      const v = c.perP.get(x.id), d = dit.get(x.ditta) || { n: '?', intest: [] }, nuova = d !== prev; prev = d;
      const ar = t => { const man = x.man && x.man[t] !== '' && x.man[t] != null; return `<td class="n${man ? ' wa' : ''}" title="${man ? 'valore inserito a mano' : v.aree.disegno ? 'dal disegno' + (v.aree.fatt !== 1 ? ' (ragguagliato)' : '') : ''}">${v.aree[t] ? U.mq(v.aree[t]) : ''}</td>`; };
      return `<tr data-px="${x.id}" class="${nuova ? 'sep' : ''}"><td><b>${nuova ? E(d.n) : ''}</b></td><td>${nuova ? d.intest.map(o => E(o.nome) + ' <span class="mu">' + E(C.diritto(o)) + '</span>').join('<br>') : ''}</td><td>${E(x.comune)}</td><td>${E(x.fg)}</td><td>${E(C.mappale(x))}${x.sub ? ' sub ' + E(x.sub) : ''}</td><td>${E([x.qual, x.cls].filter(Boolean).join('/'))}</td><td class="n">${x.sup ? U.mq(x.sup) : ''}</td><td class="n">${E(x.rd)}</td><td class="n">${E(x.ra)}</td>${ar('espr')}${ar('servop')}${ar('serv')}${ar('occ')}<td>${E(v.cat)}</td><td class="n">${v.vu ? U.fmt(v.vu) : ''}</td><td class="n"><b>${U.eur(v.tot)}</b></td></tr>`;
    }).join('');
    const T = c.T;
    m.innerHTML = `<h2>📋 Piano particellare</h2>
<div class="kpi"><div><small>Ditte</small><b>${p.ditte.length}</b></div><div><small>Particelle</small><b>${p.particelle.length}</b></div><div><small>Esproprio</small><b>${U.mq(T.aree.espr)} mq</b></div><div><small>Servitù</small><b>${U.mq(T.aree.servop + T.aree.serv)} mq</b></div><div><small>Occupazione temp.</small><b>${U.mq(T.aree.occ)} mq</b></div><div><small>Indennità totali</small><b>${U.eur(T.tot)}</b></div></div>
<div class="row" style="margin-bottom:8px"><button id="ppx">Esporta Excel</button><button id="ppsu" title="Dati per i modelli Word a stampa unione (un foglio per intestatario)">Excel per stampa unione</button><button id="ppst">Stampa / PDF elenco ditte</button><button id="ppadd">＋ Particella</button><button id="pprin" title="Rinumera le ditte 1, 2, 3… in ordine di foglio e mappale">Rinumera ditte</button><span class="grow"></span><label class="chk"><input type="checkbox" id="pprag" ${I0.ragguaglio ? 'checked' : ''}> Ragguaglia alla superficie catastale</label></div>
<div class="tw"><table class="t"><thead><tr><th>N.P.</th><th>Ditta</th><th>Comune</th><th>Fg.</th><th>Mapp.</th><th>Qualità/cl.</th><th class="n">Sup. cat.</th><th class="n">R.D.</th><th class="n">R.A.</th><th class="n">Esproprio</th><th class="n">Serv. opere</th><th class="n">Serv. fascia</th><th class="n">Occ. temp.</th><th>Categoria stima</th><th class="n">€/mq</th><th class="n">Indennità</th></tr></thead>
<tbody>${righe || '<tr><td colspan="16" class="vuoto">Nessuna particella: importa il disegno e l\'elenco ditte.</td></tr>'}</tbody>
<tfoot><tr><td colspan="9">Totali</td><td class="n">${U.mq(T.aree.espr)}</td><td class="n">${U.mq(T.aree.servop)}</td><td class="n">${U.mq(T.aree.serv)}</td><td class="n">${U.mq(T.aree.occ)}</td><td colspan="2"></td><td class="n">${U.eur(T.tot)}</td></tr></tfoot></table></div>
<p class="mu">In arancione le superfici inserite a mano. Clic su una riga per modificare la particella.</p>`;
    m.querySelector('#pprag').onchange = e => { I0.ragguaglio = e.target.checked; APP.salva(); APP.render(); };
    m.querySelectorAll('[data-px]').forEach(r => r.onclick = () => APP.editParticella(p.particelle.find(x => x.id === r.dataset.px)));
    m.querySelector('#ppadd').onclick = () => { const x = { id: U.id(), ct: 'T', comune: p.ente.comune || '', fg: '', map: '', sub: '', nuovo: {}, man: {}, qual: '', cls: '', sup: 0, ditta: p.ditte[0] ? p.ditte[0].id : '' }; p.particelle.push(x); APP.editParticella(x, true); };
    m.querySelector('#pprin').onclick = async () => { if (!await APP.conferma('Rinumerare tutte le ditte in ordine di foglio e mappale?', 'Rinumera')) return; C.rinumera(p.particelle, p.ditte); APP.salva(); APP.render(); };
    m.querySelector('#ppx').onclick = () => esportaExcel(p, c);
    m.querySelector('#ppsu').onclick = () => esportaUnione(p, c);
    m.querySelector('#ppst').onclick = () => APP.stampaModello('elenco_ditte', 'pratica');
  };

  APP.editParticella = async (x, nuova) => {
    const p = APP.pr(), c = APP.calc(), v = c.perP.get(x.id);
    const dop = p.ditte.map(d => `<option value="${d.id}">${E(d.n)} – ${E(d.intest.map(o => o.nome).join(', ').slice(0, 70))}</option>`).join('');
    const cat = p.valori.map(o => `<option value="${o.id}">${E(o.nome)}</option>`).join('');
    const tipi = ['espr', 'servop', 'serv', 'occ'];
    const html = `<div class="g">
<label class="f">Ditta<select data-f="ditta">${dop}</select></label>
<label>Catasto<select data-f="ct"><option value="T">Terreni</option><option value="F">Fabbricati</option></select></label><label>Comune<input data-f="comune"></label><label>Sezione<input data-f="sez"></label>
<label>Foglio<input data-f="fg"></label><label>Mappale (originario)<input data-f="map"></label><label>Sub<input data-f="sub"></label>
<label>Qualità<input data-f="qual"></label><label>Classe<input data-f="cls"></label><label>Superficie catastale (mq)<input data-f="sup" data-t="num"></label>
<label>Reddito dominicale €<input data-f="rd"></label><label>Reddito agrario €<input data-f="ra"></label><label>Destinazione urbanistica (zona)<input data-f="zona" placeholder="es. E2, B1…"></label>
<label class="f">Confini (N-E-S-O) <input data-f="confini"></label></div>
<h3>Superfici d'intervento (mq)</h3><p class="mu">Vuoto = dal disegno${v.aree.disegno ? ' (superficie grafica della particella ' + U.fmt(v.aree.graf, 1) + ' mq)' : ''}. Il mappale derivato è quello del frazionamento (es. 1706 ex ${E(x.map)}); superficie e redditi della particella derivata compaiono nel decreto (se vuoti: superficie espropriata e «–»).</p>
<div class="tw" style="max-height:none"><table class="t"><thead><tr><th>Tipo</th><th class="n">Dal disegno</th><th>Valore manuale</th><th>Mappale derivato</th><th>Sup. particella derivata</th><th>R.D. derivata</th><th>R.A. derivata</th></tr></thead><tbody>
${tipi.map(t => `<tr><td><span class="tag ${tagTipo(t)}">${A.RUOLI[t]}</span></td><td class="n">${v.aree.disegno ? U.mq(Math.round((A.superfici(p.geo)[A.chiave(x.fg, x.map, x.sub)] || {})[t] || 0)) : '—'}</td><td><input data-f="man.${t}" data-t="num"></td><td><input data-f="nuovo.${t}"></td><td><input data-f="fraz.${t}.sup" placeholder="mq"></td><td><input data-f="fraz.${t}.rd"></td><td><input data-f="fraz.${t}.ra"></td></tr>`).join('')}</tbody></table></div>
<h3>Stima</h3><div class="g"><label>Categoria di stima<select data-f="val"><option value="">(automatica dalla qualità)</option>${cat}</select></label><label>Valore €/mq (se diverso)<input data-f="vu" data-t="num"></label>
<label>Area edificabile<select data-f="edif"><option value="">(dalla categoria)</option><option value="1">Sì</option><option value="">No</option></select></label>
<label>Mesi di occupazione (se diversi)<input data-f="mesiOcc" data-t="num"></label><label>Coeff. servitù fascia (se diverso)<input data-f="coeffServ" data-t="num" placeholder="es. 0,25"></label>
<label>Soprassuoli / frutti pendenti €<input data-f="sopr" data-t="num"></label><label>Deprezzamento parte residua € (art. 33)<input data-f="depr" data-t="num"></label>
<label class="f">Note<input data-f="note"></label></div>`;
    const r = await APP.dlg((nuova ? 'Nuova particella' : 'Particella Fg.' + x.fg + ' mapp.' + x.map), html, [{ t: 'Elimina', v: 'del', d: true }, { t: 'Calcola confini dal disegno', v: 'conf' }, { t: 'Fatto', v: 'ok', p: true }], b => APP.lega(b, x));
    if (r === 'del' && await APP.conferma('Eliminare la particella dal piano?', 'Elimina')) { p.particelle = p.particelle.filter(y => y !== x); }
    if (r === 'conf') { x.confini = A.confini(p.geo, A.chiave(x.fg, x.map, x.sub)) || x.confini; APP.salva(); APP.render(); return APP.editParticella(x); }
    // Ditte rimaste senza particelle
    p.ditte = p.ditte.filter(d => p.particelle.some(y => y.ditta === d.id) || (d.ev && Object.keys(d.ev).length));
    APP.salva(); APP.render();
  };

  function esportaExcel(p, c) {
    const dit = new Map(p.ditte.map(d => [d.id, d]));
    const H = ['N. ditta', 'Intestatario', 'Nato a / sede', 'Nato il', 'C.F.', 'Diritto', 'Quota', 'Indirizzo', 'Comune', 'Foglio', 'Mappale', 'Mappale derivato', 'Sub', 'Qualità', 'Classe', 'Superficie mq', 'R.D.', 'R.A.', 'Zona', 'Esproprio mq', 'Servitù opere mq', 'Servitù fascia mq', 'Occupazione mq', 'Categoria', '€/mq', 'Ind. esproprio', 'Ind. servitù', 'Ind. occupazione', 'Altre voci', 'Totale'];
    const R = [H];
    p.particelle.slice().sort((a, b) => U.cmp((dit.get(a.ditta) || {}).n, (dit.get(b.ditta) || {}).n) || U.cmp(a.fg, b.fg) || U.cmp(a.map, b.map)).forEach(x => {
      const d = dit.get(x.ditta) || { n: '', intest: [] }, v = c.perP.get(x.id), vo = v.voci;
      (d.intest.length ? d.intest : [{}]).forEach((o, i) => R.push([+d.n || d.n, o.nome || '', o.natoA || o.sede || '', U.dataIt(o.natoIl), o.cf || '', o.titolo || '', o.quota || '', C.indirizzo(o), x.comune, x.fg, x.map, Object.values(x.nuovo || {}).filter(Boolean).join(', '), x.sub, x.qual, x.cls, x.sup || '', x.rd, x.ra, x.zona || '',
        ...(i ? ['', '', '', '', '', '', '', '', '', '', ''] : [v.aree.espr || '', v.aree.servop || '', v.aree.serv || '', v.aree.occ || '', v.cat, v.vu || '', vo.espr, U.r2(vo.servop + vo.serv), vo.occ, U.r2(vo.aggCD + vo.urg + vo.np42 + vo.ris42 + vo.sopr + vo.depr), v.tot])]));
    });
    APP.scarica(san(p.nome) + ' - piano particellare.xlsx', ES.office.xlsx([{ nome: 'Piano particellare', righe: R, larghezze: [8, 30, 22, 11, 18, 14, 8, 30, 14, 6, 9, 10, 5, 14, 6, 10, 8, 8, 8, 10, 10, 10, 10, 16, 7, 12, 12, 12, 12, 12] }]));
  }
  // Un foglio con una riga per intestatario e i campi numerati come nei modelli a stampa unione (Comune1, Foglio1, Particella1…)
  function esportaUnione(p, c) {
    const N = Math.max(1, ...p.ditte.map(d => p.particelle.filter(x => x.ditta === d.id).length)), NI = Math.max(1, ...p.ditte.map(d => d.intest.length));
    const H = ['Ditta', 'Nome_e_Cognome', 'via', 'cap', 'citta', 'nato_a_il', 'Cf', 'proprietà', 'quota'];
    for (let i = 1; i <= NI; i++) H.push('Nome_e_Cognome' + i, 'via' + i, 'cap' + i, 'citta' + i, 'nato_a_il' + i, 'Cf' + i, 'proprietà' + i, 'quota' + i);
    for (let i = 1; i <= N; i++) H.push('Comune' + i, 'Foglio' + i, 'Particella' + i, 'haareca' + i, 'Superficie' + i, 'Reddito_Domenicale' + i, 'Reddito_agrario' + i, 'Sup' + i, 'Servitu' + i, 'Occupazione' + i);
    H.push('Indennita');
    const R = [H];
    p.ditte.forEach(d => {
      const ctx = ES.modelli.ditta(p, d, c);
      ctx.intestatari.forEach(o => {
        const r = [d.n, o.nome, o.via, o.cap, o.citta, o.nascita, o.cf, o.titolo, o.quota];
        for (let i = 0; i < NI; i++) { const q = ctx.intestatari[i] || {}; r.push(q.nome || '', q.via || '', q.cap || '', q.citta || '', q.nascita || '', q.cf || '', q.titolo || '', q.quota || ''); }
        for (let i = 0; i < N; i++) { const x = ctx.particelle[i] || {}; r.push(x.comune || '', x.fg || '', x.mappale || '', x.haareca || '', x.sup || '', x.rd || '', x.ra || '', x.espr || '', x.servTot || '', x.occ || ''); }
        r.push(ctx.tot); R.push(r);
      });
    });
    APP.scarica(san(p.nome) + ' - stampa unione.xlsx', ES.office.xlsx([{ nome: 'Stampa unione', righe: R }]));
  }

  // ---------- Avvio ----------
  // Pratica d'esempio (versione di prova): disegno e ditte fittizi già importati
  function demo(D) {
    const p = nuovaPratica('Lavori di prova – sistemazione strada comunale');
    Object.assign(p.ente, { nome: 'Comune di Prova', comune: 'Comune di Prova', provincia: 'Belluno', luogo: 'Prova', indirizzo: 'Piazza Municipio 1', pec: 'comune.prova@pec.it', responsabile: 'ing. Maria Esempio', ruolo: 'Il Responsabile dell\'Area Tecnica', rup: 'ing. Maria Esempio', tecnico: 'geom. Luca Rilievi', tribunale: 'Belluno', tar: 'Veneto', bur: 'BUR Veneto' });
    p.cup = 'D00E00000000000'; p.urgenza = 'necessità di avviare i lavori entro i termini del finanziamento';
    p.iter = { avvio16: { data: '2026-03-02', estremi: 'nota prot. 1234' }, vincolo: { data: '2026-04-20', estremi: 'Delibera C.C. n. 15' }, dpu: { data: '2026-05-20', estremi: 'Delibera G.C. n. 62' }, com17: { data: '2026-06-05', estremi: 'nota prot. 2345' } };
    p.valori = [{ id: 'sem', nome: 'Seminativo', edif: false, vu: 4, vam: 30000 }, { id: 'pra', nome: 'Prato', edif: false, vu: 3, vam: 20000 }, { id: 'bos', nome: 'Bosco', edif: false, vu: 1.5, vam: 8000 }, { id: 'edB', nome: 'Area edificabile (zona B)', edif: true, vu: 60, vam: 0 }];
    p.impost.mesiOcc = 10;
    p.geo = A.importaDxf(ES.dxf.leggi(D.dxf), { fg: '1', comune: 'Comune di Prova' });
    const imp = C.importaTabella(ES.tab.csv(D.csv).fogli[0].righe, { fg: '1' });
    p.particelle = imp.particelle; p.ditte = imp.ditte;
    p.particelle.forEach(x => { x.confini = A.confini(p.geo, A.chiave(x.fg, x.map, x.sub)); });
    normalizza(p);
    return p;
  }
  APP.avvia = async () => {
    await carica();
    if (!DB.pratiche.length && window.__DEMO) { const p = demo(window.__DEMO); DB.pratiche.push(p); DB.attiva = p.id; }
    if (!DB.attiva && DB.pratiche[0]) DB.attiva = DB.pratiche[0].id;
    render();
  };
})();
