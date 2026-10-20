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
  // Carta intestata della pratica (o quella predefinita per tutte le pratiche): taglio alto e taglio basso in HTML,
  // con i dati dell'ente richiamabili come {{ente.nome}}; convertita in parti Word una volta e tenuta in memoria
  const cacheCarta = new Map();
  APP.cartaSorgente = p => { const c = (p && p.carta) || DB.carta; return c && (c.testa || c.piede) ? c : null; };
  APP.carta = async p => {
    const c = APP.cartaSorgente(p); if (!c) return null;
    const base = ES.modelli.base(p, ES.stima.calcola(p));
    const sost = h => String(h || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (x, k) => E(k.split('.').reduce((o, q) => (o == null ? o : o[q]), base) ?? ''));
    const testa = sost(c.testa), piede = sost(c.piede), k = JSON.stringify(c.margini || {}) + testa.length + ':' + piede.length + ':' + U.hash(testa + '|' + piede);
    if (!cacheCarta.has(k)) { try { cacheCarta.set(k, ES.office.cartaDaHtml(testa, piede, { margini: c.margini })); } catch (e) { console.error(e); cacheCarta.set(k, null); } }
    return cacheCarta.get(k);
  };
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
    // Con la cartella di lavoro della pratica: <cartella>/ESPROPRI_SISTEM/…; altrimenti <base dei fascicoli>/<nome pratica>/…
    dirPratica: p => (p.cartella ? String(p.cartella).replace(/[\\/]+$/, '') + '/ESPROPRI_SISTEM' : san((p.codice ? p.codice + ' ' : '') + (p.nome || 'Pratica'))),
    dirDitta: (p, d) => FS.dirPratica(p) + '/DITTA ' + d.n + ' ' + san((d.intest[0] && d.intest[0].nome) || ''),
    dirGenerale: p => FS.dirPratica(p) + '/00 GENERALE',
    // Prima di scrivere: se la pratica non ha ancora la cartella di lavoro, si chiede all'operatore
    async pronto(p) {
      if (!FASC) return true;
      if (p.cartella) { await window.desktop.fsAmmetti(p.cartella); return true; }
      const r = await APP.dlg('Cartella di lavoro della pratica', `<p>Dove salvo i documenti di questa pratica? Scegli la cartella di lavoro sul server (es. <b>L:\\260514-esproprio roma\\05-Espropri</b>): dentro verrà creata la cartella <b>ESPROPRI_SISTEM</b> con «00 GENERALE» e una cartella per ogni ditta.</p>`, [{ t: 'Usa la cartella predefinita', v: 'def' }, { t: 'Scegli la cartella…', v: 'sc', p: true }]);
      if (r === 'sc') { const x = await window.desktop.fsScegliPratica(); if (!x) return false; p.cartella = x.dir; APP.salva(); return true; }
      return r === 'def';
    },
    async salva(rel, dati) {
      if (FASC) { const r = await window.desktop.fsScrivi(rel, dati); toast('Salvato nel fascicolo: ' + rel.split('/').slice(1).join(' › ')); return r; }
      APP.scarica(rel.split('/').pop(), dati); return { ok: true };
    },
    apri: rel => (FASC ? window.desktop.fsApri(rel) : toast('Le cartelle del fascicolo si usano nel programma installato sul PC')),
    elenco: rel => (FASC ? window.desktop.fsElenco(rel) : Promise.resolve([])),
    leggi: rel => (FASC ? window.desktop.fsLeggi(rel) : Promise.resolve(null))
  };

  // ---------- Mother File System: Excel con tutti i dati, da esportare, correggere e ricaricare ----------
  APP.mfsEsporta = async p => {
    const dati = ES.office.xlsx(ES.mother.esporta(p)), nome = san(p.nome) + ' - MOTHER FILE SYSTEM (' + U.oggi() + ').xlsx';
    if (FS.ok) await APP.salvaFile(p, [{ rel: FS.dirGenerale(p) + '/' + nome, dati }], nome);
    else APP.scarica(nome, dati, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    APP.dlg('Mother File System esportato', `<p>Excel con tutti i dati della pratica: <b>PRATICA</b> (ente e dati per i documenti), <b>ATTI</b>, <b>DITTE</b>, <b>INTESTATARI</b> (nomi, C.F., nascita, indirizzi), <b>PARTICELLE</b> (dati catastali e superfici di progetto) e <b>ITER</b> (date dei passi per ditta).</p>
<ul style="margin:6px 0 10px 18px"><li>Correggi solo le <b style="background:#fff5cc;color:#000;padding:0 4px">celle gialle</b>; quelle grigie (codici e valori calcolati) sono bloccate.</li><li>Non aggiungere, togliere o spostare righe e colonne: il foglio è protetto apposta.</li><li>Salva in .xlsx e ricaricalo con <b>MOTHER FILE › ⬆ Import</b>: vedrai le modifiche prima di applicarle.</li></ul>
<p class="mu">Se nel frattempo aggiungi o togli ditte, intestatari o particelle nel programma, esporta un nuovo Mother File: quello vecchio verrebbe rifiutato.</p>`, [{ t: 'OK', v: 'ok', p: true }]);
  };
  APP.mfsImporta = async p => {
    const [f] = await APP.scegliFile('.xlsx'); if (!f) return;
    let file; try { file = await ES.tab.leggi(f.nome, f.buf); } catch (e) { APP.dlg('File rifiutato', `<p>Non riesco a leggere «${E(f.nome)}»: ${E(e.message)}</p>`, [{ t: 'OK', v: 'ok', p: true }]); return; }
    const r = ES.mother.leggi(p, file);
    if (!r.ok) {
      APP.dlg('⛔ Mother File rifiutato', `<p>Il file <b>${E(f.nome)}</b> non è stato importato e <b>la pratica non è cambiata</b>. Motivi:</p><ul class="mfs-err">${r.errori.slice(0, 60).map(x => `<li>${E(x)}</li>`).join('')}${r.errori.length > 60 ? `<li>… e altri ${r.errori.length - 60}</li>` : ''}</ul><p class="mu">Correggi il file (o esporta un nuovo Mother File) e riprova.</p>`, [{ t: 'OK', v: 'ok', p: true }]);
      return;
    }
    if (!r.modifiche.length) { toast('Mother File letto: nessuna modifica rispetto ai dati del programma'); return; }
    const per = {}; r.modifiche.forEach(m => { per[m.foglio] = (per[m.foglio] || 0) + 1; });
    const ok = await APP.dlg('Mother File: ' + r.modifiche.length + (r.modifiche.length === 1 ? ' modifica' : ' modifiche'), `<p>Il file è valido. Modifiche trovate: ${Object.entries(per).map(([k, n]) => `<span class="tag">${k}: ${n}</span>`).join(' ')}</p>
<div class="tw" style="max-height:52vh"><table class="t mfs-tab"><thead><tr><th>Foglio</th><th>Riga</th><th>Campo</th><th>Prima → Dopo</th></tr></thead><tbody>${r.modifiche.slice(0, 400).map(m => `<tr><td>${E(m.foglio)}</td><td>${E(m.riga)}</td><td>${E(m.campo)}</td><td class="v"><del>${E(m.prima)}</del> → <ins>${E(m.dopo)}</ins></td></tr>`).join('')}</tbody></table></div>
${r.modifiche.length > 400 ? `<p class="mu">… e altre ${r.modifiche.length - 400}</p>` : ''}<p class="mu">Prima di applicare si tiene una copia della pratica: con ↶ accanto a «MOTHER FILE» si torna indietro.</p>`, [{ t: 'Annulla', v: '' }, { t: 'Applica le modifiche', v: 'ok', p: true }]);
    if (ok !== 'ok') return;
    DB.mfsPrima = { id: p.id, quando: new Date().toISOString(), json: JSON.stringify(p) };
    r.modifiche.forEach(m => m.applica());
    (p.mfsLog = p.mfsLog || []).push({ data: U.oggi(), file: f.nome, n: r.modifiche.length });
    APP.salva(); APP.render(); toast(r.modifiche.length + ' modifiche applicate dal Mother File', 5000);
  };
  APP.mfsAnnulla = async p => {
    const b = DB.mfsPrima; if (!b || b.id !== p.id) return;
    if (!await APP.conferma('Tornare ai dati com\'erano prima dell\'ultima importazione del Mother File (' + new Date(b.quando).toLocaleString('it-IT') + ')? Le modifiche fatte dopo nel programma andrebbero perse.', 'Torna indietro')) return;
    const vecchia = normalizza(JSON.parse(b.json)), i = DB.pratiche.findIndex(x => x.id === p.id);
    if (i >= 0) DB.pratiche[i] = vecchia;
    delete DB.mfsPrima; APP.salva(); APP.render(); toast('Importazione annullata');
  };

  // ---------- Navigazione ----------
  const VISTE = [
    ['pratica', '🗂️', 'Pratica'], ['problemi', '⚠️', 'Problemi da risolvere'], ['importa', '📥', 'Importa DXF / Excel'], ['piano', '📋', 'Piano particellare'], ['ditte', '👥', 'Ditte e iter'], ['indirizzi', '📮', 'Indirizzi'],
    ['tavola', '🗺️', 'Tavola grafica'], ['stima', '💶', 'Indennità'], ['documenti', '📄', 'Documenti'], ['scadenze', '⏰', 'Scadenze'], ['normativa', '⚖️', 'Normativa'], ['ricerca', '🔎', 'Ricerca sul web']
  ];
  const GRUPPI = { pratica: 'Pratica', importa: 'Dati', tavola: 'Elaborati', scadenze: 'Strumenti' };
  let vista = 'pratica';
  APP.vai = (v, arg) => { vista = v; APP.arg = arg; render(); window.scrollTo(0, 0); };
  function nav() {
    const p = APP.pr();
    $('#nav').innerHTML = (p ? `<div class="pr"><b>${E(p.nome)}</b><br>${p.ditte.length} ditte · ${p.particelle.length} particelle</div>` : '') +
      VISTE.map(([k, ic, t]) => (GRUPPI[k] ? `<div class="grp">${GRUPPI[k]}</div>` : '') + `<button data-v="${k}" class="${k === vista ? 'on' : ''}" ${!p && k !== 'pratica' && k !== 'normativa' && k !== 'ricerca' ? 'disabled' : ''}><span class="ic">${ic}</span>${t}${k === 'problemi' && p ? (n => n ? ` <span class="tag t-wa">${n}</span>` : '')(APP.problemi(p).filter(x => x.livello !== 'info').length) : ''}</button>`).join('');
  }
  function hdr() {
    const p = APP.pr();
    $('#hdr').innerHTML = `<select id="selp" title="Pratica aperta">${DB.pratiche.map(x => `<option value="${x.id}" ${p && x.id === p.id ? 'selected' : ''}>${E(x.nome)}</option>`).join('')}${DB.pratiche.length ? '' : '<option>Nessuna pratica</option>'}</select>
<button id="hnew">＋ Nuova pratica</button><button id="hopen" title="Apri una pratica salvata su file (.json)">Apri file</button><button id="hsave" ${p ? '' : 'disabled'} title="Salva la pratica in un file da conservare o inviare">Salva su file</button>
${FASC && p ? '<button id="hfasc" title="Apri la cartella del fascicolo">📁 Fascicolo</button>' : ''}
${p ? `<span class="mfs" title="Mother File System: l'Excel con tutti i dati della pratica"><span>MOTHER FILE</span><button id="hmfe" title="Esporta il Mother File System (Excel con tutti i dati, da correggere e ricaricare)">⬇ Export</button><button id="hmfi" title="Ricarica il Mother File System corretto in Excel">⬆ Import</button>${DB.mfsPrima && DB.mfsPrima.id === p.id ? '<button id="hmfu" title="Annulla l\'ultima importazione del Mother File">↶</button>' : ''}</span>` : ''}<span class="mu" style="color:#fff;opacity:.8">${salvato ? '✓ salvato' : '… salvataggio'}</span>`;
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
    if (b.id === 'hmfe') APP.mfsEsporta(APP.pr());
    if (b.id === 'hmfi') APP.mfsImporta(APP.pr());
    if (b.id === 'hmfu') APP.mfsAnnulla(APP.pr());
  });
  document.addEventListener('change', e => { if (e.target.id === 'selp') { DB.attiva = e.target.value; APP.salva(); render(); } });

  function render() {
    nav(); hdr();
    const m = $('#main'), p = APP.pr();
    // La cartella di lavoro della pratica (anche se scelta su un altro PC) deve essere tra i percorsi ammessi
    if (FASC && p && p.cartella && APP._amm !== p.cartella) { APP._amm = p.cartella; window.desktop.fsAmmetti(p.cartella); }
    if (!p && vista !== 'normativa' && vista !== 'ricerca') { m.innerHTML = `<div class="card vuoto"><h2>Benvenuto in ESPROPRI_SISTEM</h2><p>Gestione delle procedure di esproprio, asservimento e occupazione temporanea (D.P.R. 327/2001).</p><button class="p" id="hnew">＋ Crea la prima pratica</button></div>`; return; }
    (APP.viste[vista] || APP.viste.pratica)(m, p);
  }
  APP.render = render;
  APP.viste = {};

  // Percorso guidato: i passi del lavoro con lo stato di ognuno; un clic porta alla schermata dove si fa
  function percorsoGuidato(p) {
    const prob = APP.problemi ? APP.problemi(p).filter(x => x.livello !== 'info').length : 0, c = APP.calc ? APP.calc() : null;
    const tot = c ? [...c.perD.values()].reduce((a, d) => a + (d.tot || 0), 0) : 0;
    const scad = ES.iter.scadenze(p).filter(x => !x.fatto && ES.iter.statoScad(x) === 'scaduta').length;
    const P = [
      { t: 'Dati dell\'ente', ok: !!(p.ente.nome && p.ente.responsabile), info: p.ente.nome || 'ente, firmatario, RUP', v: '#cEnte' },
      { t: 'Carta intestata', ok: !!APP.cartaSorgente(p), info: APP.cartaSorgente(p) ? 'impostata' : 'logo e dati dell\'ente', v: '#cartaCard', facolt: true },
      { t: 'Planimetria', ok: !!p.geo, info: p.geo ? (p.geo.part || []).length + ' particelle nel disegno' : 'DXF, DWG o PDF (facoltativa)', v: 'importa', facolt: true },
      { t: 'Elenco ditte', ok: p.ditte.length > 0, info: p.ditte.length ? p.ditte.length + ' ditte · ' + p.particelle.length + ' particelle' : 'Excel delle visure', v: 'importa' },
      { t: 'Problemi', ok: p.ditte.length > 0 && !prob, att: prob > 0, info: prob ? prob + ' da risolvere' : 'nessuno', v: 'problemi' },
      { t: 'Indennità', ok: tot > 0, info: tot ? U.eur(tot) : 'valori e categorie di stima', v: 'stima' },
      { t: 'Documenti', ok: p.docs.length > 0, info: p.docs.length ? p.docs.length + ' prodotti' : 'lettere, avvisi, decreti', v: 'documenti' },
      { t: 'Scadenze', ok: p.ditte.length > 0 && !scad, att: scad > 0, info: scad ? scad + ' termini scaduti' : 'sotto controllo', v: 'scadenze' }
    ];
    const ora = P.findIndex(x => !x.ok && !x.facolt);
    return `<div class="guida">${P.map((x, i) => `<button type="button" class="st ${x.ok ? 'fatto' : x.att ? 'att' : i === ora ? 'ora' : ''}" data-guida="${x.v}"><span class="n">${x.ok ? '✓' : i + 1}</span><b>${E(x.t)}</b><small>${E(x.info)}</small>${i === ora ? '<span class="fr">→</span>' : ''}</button>`).join('')}</div>`;
  }

  // ---------- Vista: Pratica ----------
  APP.viste.pratica = (m, p) => {
    const proc = Object.entries(S.PROCEDURE).map(([k, v]) => `<option value="${k}">${v.nome}</option>`).join('');
    m.innerHTML = `<h2>🗂️ Pratica</h2>
${percorsoGuidato(p)}
<div class="card"><h3 style="margin-top:0">Opera</h3><div class="g">
<label class="f">Oggetto dei lavori<input data-f="nome"></label>
<label>CUP<input data-f="cup"></label><label>Codice / commessa<input data-f="codice"></label>
<label>Percorso procedurale principale<select data-f="impost.procedura">${proc}</select></label>
<label class="f">Ragioni di urgenza (per i decreti artt. 22 / 22-bis)<input data-f="urgenza"></label>
<label class="f">Descrizione dell'opera<textarea data-f="descrizione" rows="2"></textarea></label></div></div>
<div class="card" id="cEnte"><h3 style="margin-top:0">Autorità espropriante e beneficiario</h3><div class="g">
<label class="f2">Ente / Autorità espropriante<input data-f="ente.nome" placeholder="Comune di …"></label><label>Provincia<input data-f="ente.provincia"></label><label>Luogo per la data degli atti<input data-f="ente.luogo"></label>
<label class="f2">Indirizzo<input data-f="ente.indirizzo"></label><label>C.F. / P.IVA<input data-f="ente.cf"></label><label>PEC<input data-f="ente.pec"></label>
<label>E-mail<input data-f="ente.email"></label><label>Telefono<input data-f="ente.telefono"></label><label>Ufficio<input data-f="ente.ufficio"></label>
<label class="f2">Firmatario (nome)<input data-f="ente.responsabile" placeholder="ing. Mario Bianchi"></label><label class="f2">Qualifica del firmatario<input data-f="ente.ruolo" placeholder="Il Responsabile dell'Area Tecnica"></label>
<label class="f2">Responsabile del procedimento (RUP)<input data-f="ente.rup"></label><label class="f2">Tecnico incaricato (stati di consistenza)<input data-f="ente.tecnico" placeholder="geom. …"></label><label>Studio incaricato<input data-f="ente.studio"></label><label>Sede dello studio<input data-f="ente.sedeStudio" placeholder="Belluno (BL)"></label>
<label class="f2">Beneficiario dell'esproprio (se diverso)<input data-f="ente.beneficiario"></label><label>C.F. beneficiario<input data-f="ente.cfBeneficiario"></label><label class="f2">Sede beneficiario<input data-f="ente.sedeBeneficiario"></label>
<label>Tribunale civile di<input data-f="ente.tribunale"></label><label>T.A.R.<input data-f="ente.tar" placeholder="Veneto"></label><label class="f2">Bollettino per gli estratti<input data-f="ente.bur" placeholder="BUR Veneto"></label>
<label class="f">Link alla documentazione progettuale<input data-f="ente.link"></label></div></div>
<div class="card" id="cartaCard"></div>
<div class="card"><h3 style="margin-top:0">Dati specifici per i documenti</h3><p class="mu">Si scrivono una volta e compaiono in tutti i documenti di questa pratica (il testo base dei modelli resta uguale per tutte le pratiche). Nei modelli si richiamano con il segnaposto indicato.</p>
<div class="g">${ES.modelli.DATI.map(c => `<label class="f">${E(c.nome)} <span class="mu">{{dati.${c.k}}} – ${E(c.aiuto)}</span>${c.righe > 1 ? `<textarea data-f="dati.${c.k}" rows="${c.righe}" style="font-family:inherit;font-size:13px"></textarea>` : `<input data-f="dati.${c.k}">`}</label>`).join('')}
${p.campi.map((c, i) => `<label class="f">${E(c.nome)} <span class="mu">{{dati.${E(c.k)}}} <button type="button" class="s d" data-cdel="${i}">togli campo</button></span><textarea data-f="dati.${E(c.k)}" rows="2" style="font-family:inherit;font-size:13px"></textarea></label>`).join('')}</div>
<div class="row" style="margin-top:8px"><button id="cadd">＋ Campo personalizzato</button><span class="mu">Es. «Parere della Soprintendenza», «Estremi del finanziamento regionale»: poi inseriscilo nel testo dei modelli (Documenti › ✏️ Testo).</span></div></div>
<div class="card"><h3 style="margin-top:0">Atti della procedura</h3><p class="mu">Data ed estremi degli atti: compaiono nelle premesse dei documenti e fanno partire le scadenze.</p>
<div class="tw" style="max-height:none"><table class="t"><thead><tr><th>Fase</th><th>Art.</th><th>Data</th><th>Estremi (es. «Delibera G.C. n. 62»)</th><th>Scadenze</th></tr></thead><tbody>
${I.FASI.map(f => { const x = p.iter[f.k] || {}; return `<tr><td>${E(f.nome)}</td><td class="mu">${E(f.art)}</td><td><input type="date" data-f="iter.${f.k}.data"></td><td><input data-f="iter.${f.k}.estremi" style="min-width:220px"></td><td class="mu">${x.data ? f.t.map(t => E(t.nome.split('(')[0]) + ': <b>' + U.dataIt(t.f(x.data)) + '</b>').join('<br>') : ''}</td></tr>`; }).join('')}
</tbody></table></div></div>
<div class="card"><h3 style="margin-top:0">📁 Cartella di lavoro della pratica</h3>
<p class="mu">Scegli la cartella di lavoro sul server (es. <b>L:\\260514-esproprio roma\\05-Espropri</b>): dentro il programma crea <b>ESPROPRI_SISTEM</b> con «00 GENERALE» (file per tutte le ditte, decreti, tavole) e una cartella per ogni ditta («DITTA 1 COGNOME NOME»), dove si salvano man mano i Word, i PDF, le foto e le scansioni.</p>
<div class="row"><b class="grow" style="word-break:break-all">${FASC ? E(p.cartella ? p.cartella.replace(/[\\/]+$/, '') + '\\ESPROPRI_SISTEM' : 'non scelta – si usa ' + FS.dirPratica(p) + ' nella cartella predefinita') : 'Disponibile nel programma installato sul PC (nel browser i file arrivano come download o ZIP).'}</b>${FASC ? '<button id="pcsel" class="p">Scegli cartella di lavoro…</button>' + (p.cartella ? '<button id="pcopen">Apri</button>' : '') : ''}</div></div>
<div class="card row"><span class="grow mu">Pratica creata il ${U.dataIt(p.creata)}.</span>${FASC ? '<button id="pcart" title="Cartella usata per le pratiche senza cartella di lavoro">Cartella predefinita…</button>' : ''}<button class="d" id="pdel">Elimina pratica</button></div>`;
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
    const pcs = m.querySelector('#pcsel'); if (pcs) pcs.onclick = async () => {
      const x = await window.desktop.fsScegliPratica(p.cartella); if (!x) return;
      if (p.cartella && p.cartella !== x.dir && !await APP.conferma('Cambiare la cartella di lavoro? I documenti già salvati restano nella cartella precedente.', 'Cambia')) return;
      p.cartella = x.dir; APP.salva(); APP.render(); toast('I documenti si salveranno in ' + x.dir + '\\ESPROPRI_SISTEM');
    };
    const pco = m.querySelector('#pcopen'); if (pco) pco.onclick = async () => { await window.desktop.fsAmmetti(p.cartella); FS.apri(FS.dirPratica(p)); };
    APP.cartaUI(m.querySelector('#cartaCard'), p);
    m.querySelectorAll('[data-guida]').forEach(b => b.onclick = () => { const g = b.dataset.guida; if (g.startsWith('#')) m.querySelector(g).scrollIntoView({ behavior: 'smooth', block: 'start' }); else APP.vai(g); });
    const pc = m.querySelector('#pcart'); if (pc) pc.onclick = async () => { const r = await window.desktop.fsScegli(); if (r) toast('Fascicoli in ' + r.dir); };
  };

  // ---------- Vista: Importa ----------
  let impDxf = null, impGeo = null, impTab = null, impPdf = null;
  APP.viste.importa = (m, p) => {
    m.innerHTML = `<h2>📥 Importa</h2>
<div class="card"><h3 style="margin-top:0">1 · Disegno DXF / DWG / PDF</h3>
<p class="mu">Il disegno può contenere le <b>aree d'intervento già tagliate</b> sui limiti di particella con dentro il numero della particella originaria (es. «100», «Fg.1 100»), oppure il <b>layer delle particelle catastali</b> con i numeri e le aree d'intervento intere: il programma divide da solo per particella. Le sovrapposizioni si tolgono per priorità: esproprio, servitù ingombro opere, servitù fascia, occupazione.</p>
<p class="mu">Se la tavola c'è solo in <b>PDF</b> (esportato dal CAD, non scansionato) il programma la legge «a occhio»: cerca la legenda e i suoi simboli (colori, tratteggi), riconosce le aree con lo stesso aspetto, i confini e i numeri delle particelle, la scala e i fogli. È una <b>proposta da verificare</b>: le superfici dedotte si correggono poi nel piano particellare con quelle misurate.</p>
<div class="row"><button class="p" id="idxf">Scegli DXF, DWG o PDF…</button><span class="mu" id="idxfn">${impPdf ? E(impPdf.nome) : impDxf ? E(impDxf.nome) : ''}</span></div>
<div id="ilay"></div></div>
<div class="card"><h3 style="margin-top:0">2 · Elenco ditte (Excel .xlsx o CSV)</h3>
<p class="mu">Una riga per particella (foglio, mappale, qualità, superficie, redditi…) con gli intestatari: in colonne separate (nome, nato a, il, C.F., diritto, quota, indirizzo) oppure tutti in una cella come nelle visure («ROSSI MARIO nato a … CF … Proprieta' 1/2; …»). Va bene anche il <b>formato a blocchi del riepilogo visure</b> (numero «N.» sulla prima riga della ditta, sotto gli intestatari riga per riga: nome, «CF:…», «Proprieta': 1/1»; particelle nelle colonne a destra). La ditta è formata dalle particelle con <b>gli stessi intestatari e le stesse quote</b>. Il mappale «1706 ex 1367» è letto come particella derivata da frazionamento.</p>
<div class="row"><button class="p" id="itab">Scegli Excel o CSV…</button><span class="mu" id="itabn">${impTab ? E(impTab.nome) : ''}</span></div>
<div id="itabv"></div></div>
<div class="card"><h3 style="margin-top:0">Situazione della pratica</h3>${riepilogoImport(p)}</div>`;
    m.querySelector('#idxf').onclick = async () => {
      const [f] = await APP.scegliFile('.dxf,.dwg,.pdf'); if (!f) return;
      if (/\.pdf$/i.test(f.nome)) { await apriPdf(f); return; }
      impPdf = null;
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
    if (impPdf) vistaPdf(m.querySelector('#ilay'), p);
    else if (impDxf) vistaLayer(m.querySelector('#ilay'), p);
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
  // Foglio, mappale e sub di una particella ricostruita (o di un'area): tutti i poligoni con lo stesso numero e le aree
  // d'intervento che ci cadono sopra prendono la correzione. sel: {part, pezzo}
  const rinumera = (geo, k0, nuovo, sel, tutti) => {
    const kN = nuovo.map ? A.chiave(nuovo.fg, nuovo.map, nuovo.sub) : null, metti = o => { o.fg = nuovo.fg; o.map = nuovo.map; o.sub = nuovo.sub; o.k = kN; };
    const parti = sel.part ? (tutti && k0 ? geo.part.filter(q => q.k === k0) : [sel.part]) : [];
    let pezzi = [];
    if (k0 && (tutti || !sel.part)) pezzi = tutti ? (geo.pezzi || []).filter(z => z.k === k0) : [sel.pezzo];
    else if (sel.part) pezzi = (geo.pezzi || []).filter(z => { if (z.k && z.k !== k0) return false; const b = ES.geo.bboxMP(z.mp), x = (b[0] + b[2]) / 2, y = (b[1] + b[3]) / 2; return sel.part.mp.some(P => ES.geo.inPoly(x, y, P)); });
    else if (sel.pezzo) pezzi = [sel.pezzo];
    parti.forEach(metti); pezzi.filter(Boolean).forEach(z => { metti(z); if (z.da !== 'catasto') z.da = 'a mano'; });
    return parti.length + pezzi.length;
  };
  // La particella dell'elenco ditte con quel foglio, mappale (e sub): {x, d} o null
  APP.particellaDiChiave = (p, fg, map, sub) => {
    if (!map) return null;
    const k = A.chiave(fg, map, sub), k0 = A.chiave(fg, map, '');
    const x = p.particelle.find(q => A.chiave(q.fg, q.map, q.sub) === k) || p.particelle.find(q => A.chiave(q.fg, q.map, '') === k0) || (!fg ? p.particelle.find(q => A.chiave('', q.map, q.sub) === A.chiave('', map, sub)) : null);
    return x ? { x, d: p.ditte.find(dd => dd.id === x.ditta) } : null;
  };
  APP.correggiParticella = async (p, geo, sel, dopo) => {
    const o = sel.part || sel.pezzo, k0 = o.k || null;
    const n = k0 ? geo.part.filter(q => q.k === k0).length : 0, np = k0 ? (geo.pezzi || []).filter(z => z.k === k0).length : 0;
    const fogli = [...new Set(p.particelle.map(x => x.fg).filter(Boolean))].sort(U.cmp);
    const r = await APP.dlg(k0 ? 'Particella Fg. ' + (o.fg || '?') + ' mapp. ' + o.map : 'Particella senza numero', `<p class="mu">Correggi il foglio catastale (ad es. particelle vicine su fogli diversi: Fg. 10 e Fg. 22) e il numero letto dal disegno.</p>
<div class="g"><label>Foglio<input id="cfg" value="${E(o.fg || '')}" list="cfgl"><datalist id="cfgl">${fogli.map(f => `<option value="${E(f)}">`).join('')}</datalist></label><label>Mappale<input id="cmap" list="cmapl" value="${E(o.map || '')}"></label><label>Sub<input id="csub" value="${E(o.sub || '')}"></label></div>
<datalist id="cmapl">${[...new Set(p.particelle.map(x => String(x.map)))].sort(U.cmp).map(v => `<option value="${E(v)}">`).join('')}</datalist>
<div id="cdit" class="ban" style="margin-top:8px"></div>
${k0 && (n > 1 || np) ? `<label class="chk"><input type="checkbox" id="ctut" checked> Applica a tutto il mappale (${n} poligon${n === 1 ? 'o' : 'i'} di particella, ${np} aree d'intervento)</label>` : ''}`, [{ t: 'Annulla', v: '' }, { t: 'Applica', v: 'ok', p: true }], b => {
      // riscontro immediato con l'elenco ditte mentre si scrive
      const mostra = () => {
        const fg = b.querySelector('#cfg').value.trim(), map = b.querySelector('#cmap').value.trim(), sub = b.querySelector('#csub').value.trim(), el = b.querySelector('#cdit');
        const m = APP.particellaDiChiave(p, fg, map, sub);
        if (!map) { el.className = 'ban'; el.innerHTML = 'Scrivi il mappale: il programma cerca la ditta che ha questa particella nell\'elenco.'; return; }
        if (m && m.d) { el.className = 'ban ok-ban'; el.innerHTML = `✅ <b>Ditta ${E(m.d.n)}</b> – ${E(m.d.intest.map(q => q.nome).join(', '))}<br><span class="mu">Fg. ${E(m.x.fg)} mapp. ${E(C.mappale(m.x))}${m.x.sup ? ' · sup. catastale ' + U.mq(m.x.sup) + ' mq' : ''}: le superfici disegnate passano a questa ditta.</span>`; return; }
        const stessi = p.particelle.filter(q => String(q.map).replace(/^0+/, '') === map.replace(/^0+/, ''));
        el.className = 'ban err'; el.innerHTML = `⚠ Nessuna ditta dell'elenco ha Fg. ${E(fg || '?')} mapp. ${E(map)}.` + (stessi.length ? ` Il mappale ${E(map)} c'è sul foglio ${stessi.map(q => '<b>' + E(q.fg) + '</b>').join(', ')}: controlla il foglio.` : ' Puoi applicarlo lo stesso (resta fra i «problemi da risolvere») o correggere il numero.');
      };
      ['#cfg', '#cmap', '#csub'].forEach(id => b.querySelector(id).addEventListener('input', mostra)); mostra();
    });
    if (r !== 'ok') return;
    const tut = $('#ctut'), nuovo = { fg: $('#cfg').value.trim(), map: $('#cmap').value.trim(), sub: $('#csub').value.trim() };
    const c = rinumera(geo, k0, nuovo, sel, tut ? tut.checked : true);
    // il numero corretto si collega alla ditta che ha la particella: confini ricalcolati se mancano
    const m = APP.particellaDiChiave(p, nuovo.fg, nuovo.map, nuovo.sub);
    if (m && geo === p.geo && !m.x.confini) m.x.confini = A.confini(p.geo, A.chiave(m.x.fg, m.x.map, m.x.sub)) || '';
    APP.salva();
    toast(nuovo.map ? `Fg. ${nuovo.fg || '?'} mapp. ${nuovo.map}: ` + (m && m.d ? `collegata alla Ditta ${m.d.n} (${m.d.intest.map(q => q.nome).join(', ').slice(0, 60)})` : 'non presente nell\'elenco ditte') + ` · ${c} elementi aggiornati` : c + ' elementi aggiornati', 6000);
    if (dopo) dopo();
  };
  // Tabella delle particelle ricostruite dal disegno: foglio e mappale sempre modificabili
  function tabParticelle(g) {
    const per = new Map(), senza = [];
    g.part.forEach((q, i) => { if (!q.k) { senza.push(i); return; } const o = per.get(q.k) || per.set(q.k, { q, i, n: 0, a: 0 }).get(q.k); o.n++; o.a += q.a; });
    const R = [...per.values()].sort((a, b) => U.cmp(a.q.fg, b.q.fg) || U.cmp(a.q.map, b.q.map));
    const inter = new Set(g.pezzi.map(z => z.k).filter(Boolean));
    const riga = (q, i, n, a) => `<tr><td><input data-rpi="${i}" data-c="fg" value="${E(q.fg || '')}" style="width:70px"></td><td><input data-rpi="${i}" data-c="map" value="${E(q.map || '')}" style="width:90px" placeholder="—"></td><td><input data-rpi="${i}" data-c="sub" value="${E(q.sub || '')}" style="width:56px"></td><td class="n">${U.fmt(a, 0)} mq</td><td class="n">${n > 1 ? n : ''}</td><td>${q.k && inter.has(q.k) ? '<span class="tag t-es">interessata</span>' : ''}</td></tr>`;
    return `<details${R.length < 60 ? ' open' : ''}><summary><b>Particelle ricostruite (${R.length} numerate${senza.length ? ', ' + senza.length + ' senza numero' : ''})</b> <span class="mu">– correggi qui foglio, mappale e sub: vale per tutti i poligoni con lo stesso numero e per le aree che ci cadono sopra</span></summary>
<div class="tw" style="max-height:40vh"><table class="t"><thead><tr><th>Foglio</th><th>Mappale</th><th>Sub</th><th class="n">Superficie disegnata</th><th class="n">Poligoni</th><th></th></tr></thead><tbody>${R.map(o => riga(o.q, o.i, o.n, o.a)).join('')}${senza.slice(0, 150).map(i => riga(g.part[i], i, 1, g.part[i].a)).join('')}</tbody></table></div></details>`;
  }
  document.addEventListener('change', e => {
    const el = e.target; if (!el.dataset || el.dataset.rpi == null || !impGeo) return;
    const q = impGeo.part[+el.dataset.rpi]; if (!q) return;
    const nuovo = { fg: q.fg || '', map: q.map || '', sub: q.sub || '' }; nuovo[el.dataset.c] = el.value.trim();
    const n = rinumera(impGeo, q.k || null, nuovo, { part: q }, true);
    toast(n + ' elementi aggiornati'); if (APP._risultato) APP._risultato();
  });
  // DXF della planimetria ricostruita (dal PDF o dal DXF), da correggere in CAD e reimportare allineato
  APP.esportaDxf = (p, geo, nome) => {
    const r = A.esportaDxf(geo);
    APP.scarica((String(nome || 'planimetria').replace(/\.(pdf|dxf|dwg)$/i, '').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'planimetria') + ' - planimetria ricostruita.dxf', r.dxf, 'application/dxf');
    APP.dlg('DXF esportato', `<p>${r.n.part} particelle e ${r.n.aree} aree d'intervento, coordinate in <b>metri</b>, layer del programma:</p>
<ul class="mu" style="margin:4px 0 8px 18px"><li><b>PARTICELLE</b> – confini (polilinee chiuse)</li><li><b>PARTICELLE_NUMERI</b> – «Fg.10 mapp.100» dentro ogni particella: correggi qui foglio e numero</li><li><b>ESPROPRIO</b>, <b>SERVITU_INGOMBRO_OPERE</b>, <b>SERVITU_FASCIA</b>, <b>OCCUPAZIONE_TEMPORANEA</b> – aree d'intervento (polilinee chiuse)</li><li><b>SFONDO_CARTOGRAFIA</b> – linee di contorno</li></ul>
<p class="mu">Modifica in CAD (aggiungi o correggi confini, numeri, aree; disegna sempre polilinee chiuse sui layer giusti), salva come DXF e reimportalo da <b>Importa › Disegno</b> con unità «metri»: i layer si riconoscono da soli e il disegno resta allineato.${r.buchi ? ` <b class="wa">Attenzione: ${r.buchi} fori interni alle aree sono esportati solo come contorno esterno: controllali in CAD.</b>` : ''}</p>`, [{ t: 'OK', v: 'ok', p: true }]);
  };
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

  // ---- Tavola in PDF: lettura «da persona» (legenda → simboli → aree), poi stessa analisi del DXF ----
  const NOMI_PDF = { espr: 'Esproprio', servop: 'Servitù – ingombro opere', serv: 'Servitù – fascia', occ: 'Occupazione temporanea' };
  APP.pdfjs = () => {
    const L = window.pdfjsLib; if (!L) return null;
    if (!L.GlobalWorkerOptions.workerSrc) { const t = document.getElementById('pdfjs-worker'); if (t && t.textContent.length > 1000) L.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([t.textContent], { type: 'text/javascript' })); }
    return L;
  };
  // ---- OCR (tesseract.js incluso nella pagina): numeri di particella disegnati, non scritti come testo ----
  APP.ocr = async () => {
    if (APP._ocr) return APP._ocr;
    const T = window.Tesseract, el = id => document.getElementById(id);
    if (!T || !el('ocr-core') || el('ocr-core').textContent.length < 1000) throw new Error('riconoscimento dei caratteri non disponibile in questa versione');
    // un solo script per il worker: prima il nucleo (definisce TesseractCore, così il worker non deve caricarlo da fuori)
    // e i dati della lingua serviti dentro il worker al posto dello scaricamento (niente rete)
    const lingua = `self.__ENG=${JSON.stringify(el('ocr-eng').textContent.trim())};(function(){var f=self.fetch;self.fetch=function(u,o){if(/eng\\.traineddata/.test(String(u))){var b=atob(self.__ENG),a=new Uint8Array(b.length);for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return Promise.resolve(new Response(a));}return f(u,o);};})();`;
    const url = URL.createObjectURL(new Blob([lingua, '\n;\n', el('ocr-core').textContent, '\n;\n', el('ocr-worker').textContent], { type: 'text/javascript' }));
    const w = await T.createWorker('eng', 1, { workerPath: url, corePath: 'incluso.js', langPath: 'https://dati-inclusi/lingua', workerBlobURL: false, cacheMethod: 'none' });
    await w.setParameters({ tessedit_char_whitelist: '0123456789/', tessedit_pageseg_mode: '11' });
    return (APP._ocr = w);
  };
  // Numeri in un'immagine (canvas), a riquadri; aPagina(x, y) converte i pixel in punti PDF. avanzamento(0..1)
  // rot: 0, 90 (scritte ruotate in senso orario) o -90: la lettura si fa sull'immagine girata e si riporta indietro
  APP.ocrNumeri = async (src, aPagina, avanzamento, rot = 0) => {
    let cv = src, inv = (x, y) => [x, y];
    if (rot) {
      cv = document.createElement('canvas'); cv.width = src.height; cv.height = src.width;
      const g = cv.getContext('2d');
      if (rot === 90) { g.translate(src.height, 0); g.rotate(Math.PI / 2); inv = (x, y) => [y, src.height - x]; }
      else { g.translate(0, src.width); g.rotate(-Math.PI / 2); inv = (x, y) => [src.width - y, x]; }
      g.drawImage(src, 0, 0);
    }
    const w = await APP.ocr(), S = 1000, O = 150, out = [];
    const passi = Math.ceil(cv.height / (S - O)) * Math.ceil(cv.width / (S - O)); let n = 0;
    for (let y = 0; y < cv.height; y += S - O) for (let x = 0; x < cv.width; x += S - O) {
      const r = await w.recognize(cv, { rectangle: { left: x, top: y, width: Math.min(S, cv.width - x), height: Math.min(S, cv.height - y) } }, { blocks: true });
      (r.data.blocks || []).forEach(b => b.paragraphs.forEach(pp => pp.lines.forEach(l => l.words.forEach(q => {
        const t = q.text.trim(); if (q.confidence < 70 || !/^\d{1,5}(\/\d{1,5})?$/.test(t)) return;
        const v = [[q.bbox.x0, q.bbox.y0], [q.bbox.x1, q.bbox.y0], [q.bbox.x1, q.bbox.y1], [q.bbox.x0, q.bbox.y1]].map(([x, y]) => aPagina(...inv(x, y)));
        const xs = v.map(z => z[0]), ys = v.map(z => z[1]), lw = Math.max(...xs) - Math.min(...xs), lh = Math.max(...ys) - Math.min(...ys);
        out.push({ t, c: Math.round(q.confidence), x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2, w: lw, h: lh, rot });
      }))));
      if (avanzamento) avanzamento(++n / passi);
    }
    return out;
  };
  // Numeri della mappa a pixel letti uno per uno: le parole trovate da ES.pdfv.paroleRaster (gruppi di cifre staccati
  // dalle linee) si ritagliano e si mettono in fila su un foglio pulito, che l'OCR legge in una volta sola.
  APP.ocrParole = async (mr, parole, avanzamento) => {
    const { W, H, mask, px, x0, y0 } = mr, out = [], PAD = 10, LARGH = 2400;
    // celle: ogni parola ingrandita ad almeno 32 pixel di altezza (l'OCR legge meglio)
    const celle = []; let x = 0, y = 0, hRiga = 0;
    parole.forEach(w => {
      // tutte le parole alla stessa altezza (circa 36 pixel), ben distanziate: l'OCR non le unisce
      const k = Math.max(0.3, Math.min(3, 36 / (w.r1 - w.r0 + 1))), pad = Math.ceil(10 / k), cw = Math.ceil((w.c1 - w.c0 + 1 + pad * 2) * k), ch = Math.ceil((w.r1 - w.r0 + 1 + pad * 2) * k);
      if (x + cw > LARGH) { x = 0; y += hRiga + 24; hRiga = 0; }
      celle.push({ w, k, pad, x, y, cw, ch }); x += cw + 60; hRiga = Math.max(hRiga, ch);
    });
    const blocco = 1800; // fogli di al massimo 1800 pixel di altezza
    for (let b0 = 0; b0 <= y; b0 += blocco) {
      const C = celle.filter(c => c.y >= b0 && c.y < b0 + blocco); if (!C.length) continue;
      const hh = Math.max(...C.map(c => c.y - b0 + c.ch)) + 20, cv = document.createElement('canvas'); cv.width = LARGH + 40; cv.height = hh;
      const g = cv.getContext('2d'), im = g.createImageData(cv.width, cv.height); im.data.fill(255);
      C.forEach(c => {
        const { w, k } = c;
        for (let yy = 0; yy < c.ch; yy++) for (let xx = 0; xx < c.cw; xx++) {
          const sc = Math.floor(xx / k - c.pad), sr = Math.floor(w.r1 - w.r0 + c.pad - yy / k), ww = w.c1 - w.c0 + 1; // righe dal basso
          if (sc < 0 || sr < 0 || sc >= ww || sr > w.r1 - w.r0 || !(w.bits ? w.bits[sr * ww + sc] : mask[(w.r0 + sr) * W + w.c0 + sc])) continue;
          const o = ((c.y - b0 + 10 + yy) * cv.width + (c.x + 20 + xx)) * 4; im.data[o] = im.data[o + 1] = im.data[o + 2] = 0;
        }
      });
      g.putImageData(im, 0, 0);
      const ocr = await APP.ocr(), r = await ocr.recognize(cv, {}, { blocks: true }), trovati = new Map();
      (r.data.blocks || []).forEach(bl => bl.paragraphs.forEach(pp => pp.lines.forEach(l => l.words.forEach(q => {
        const cx = (q.bbox.x0 + q.bbox.x1) / 2 - 20, cy = (q.bbox.y0 + q.bbox.y1) / 2 - 10 + b0;
        const c = C.find(c2 => cx >= c2.x && cx <= c2.x + c2.cw && cy >= c2.y && cy <= c2.y + c2.ch); if (!c) return;
        (trovati.get(c) || trovati.set(c, []).get(c)).push(q);
      }))));
      trovati.forEach((Q, c) => { Q.sort((a2, b2) => a2.bbox.x0 - b2.bbox.x0); c.l = { t: Q.map(q => q.text.trim()).join(''), c: Math.round(Math.min(...Q.map(q => q.confidence))) }; });
      if (avanzamento) avanzamento(Math.min(1, (b0 + blocco) / (y + 1)));
    }
    // confronto con i modelli di cifra imparati dalle letture sicure
    const fin = ES.pdfv.leggiConModelli(parole, celle.map(c => c.l || null));
    celle.forEach((c, i) => {
      const l = fin[i]; if (!l || !/^\d{1,5}(\/\d{1,5})?$/.test(l.t)) return;
      const w = c.w;
      // parole di caratteri disegnati: posizione sulla tavola già nota (cx, cy), anche se lette ruotate
      if (w.cx != null) out.push({ t: l.t, c: l.c, da: l.da, x: w.cx, y: w.cy, w: w.pw, h: w.ph, rot: w.rot || 0, gruppo: w.gruppo });
      else out.push({ t: l.t, c: l.c, da: l.da, x: x0 + (w.c0 + w.c1 + 1) / 2 * px, y: y0 + (w.r0 + w.r1 + 1) / 2 * px, w: (w.c1 - w.c0 + 1) * px, h: (w.r1 - w.r0 + 1) * px, rot: 0 });
    });
    // della stessa parola letta nei due versi si tiene la lettura più sicura
    const meglio = new Map(); out.forEach(o => { if (o.gruppo == null) return; const m = meglio.get(o.gruppo); if (!m || o.c > m.c) meglio.set(o.gruppo, o); });
    return out.filter(o => o.gruppo == null || meglio.get(o.gruppo) === o);
  };
  // Lettura dei numeri della mappa a immagine: dalla mappa senza i colori sopra (se il PDF la contiene a righe di pixel)
  // e dalla pagina disegnata; i doppioni si tolgono, i numeri che coincidono con testi del PDF pure.
  async function ocrPdf(el) {
    const pagina = impPdf.r.pagine[impPdf.pag], P = ES.pdfv, stato = t => { const s2 = document.getElementById('pocrst'); if (s2) s2.textContent = t; };
    try {
      let tutti = [];
      const mr = pagina._mr === undefined ? (pagina._mr = P.mappaRaster(pagina)) : pagina._mr;
      // numeri scritti come disegno (testi CAD esplosi in trattini): si leggono parola per parola, anche ruotati
      const gl = P.glifi(pagina);
      if (gl.comp.length >= 10) {
        stato('Lettura dei numeri disegnati a tratti…');
        await new Promise(r => setTimeout(r, 30));
        const vv = P.vista(pagina), lz = P.legenda(pagina).zona, fuori = b => lz && b[0] >= lz[0] - 2 && b[2] <= lz[2] + 2 && b[1] >= lz[1] - 2 && b[3] <= lz[3] + 2;
        const pv = P.paroleVettoriali(gl, 0.08, b => (!vv || (b[0] >= vv.b[0] && b[2] <= vv.b[2] && b[1] >= vv.b[1] && b[3] <= vv.b[3])) && !fuori(b));
        tutti = tutti.concat(await APP.ocrParole(pv, pv.parole, f => stato('Lettura dei numeri disegnati a tratti… ' + Math.round(f * 100) + '%')));
      }
      if (mr) {
        // come un tecnico: si cercano i gruppi di cifre staccati dalle linee e si leggono uno per uno
        stato('Ricerca dei numeri nella mappa catastale…');
        await new Promise(r => setTimeout(r, 30));
        const parole = ES.pdfv.paroleRaster(mr);
        tutti = tutti.concat(await APP.ocrParole(mr, parole, f => stato('Lettura dei numeri dalla mappa catastale… ' + Math.round(f * 100) + '%')));
      }
      // la pagina disegnata (numeri visibili nella tavola): serve se la mappa non è a pixel o se lì si è letto poco
      if ((!mr && gl.comp.length < 10) || tutti.length < 20) {
        const v = P.vista(pagina), z = v ? v.b : [0, 0, pagina.w, pagina.h];
        const pg = await impPdf.r.doc.getPage(pagina.n), base = pg.getViewport({ scale: 1 });
        const sc = Math.min(300 / 72, Math.sqrt(36e6 / Math.max(1, (z[2] - z[0]) * (z[3] - z[1]))));
        const cv = document.createElement('canvas'); cv.width = Math.ceil((z[2] - z[0]) * sc); cv.height = Math.ceil((z[3] - z[1]) * sc);
        const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.translate(-z[0] * sc, -(base.height - z[3]) * sc);
        stato('Disegno della pagina per la lettura…');
        await pg.render({ canvasContext: cx, viewport: pg.getViewport({ scale: sc }) }).promise;
        // solo i segni scuri (nero e grigio scuro): i numeri di particella; via colori, retini e numeri di piano colorati
        const W = cv.width, H = cv.height, im = cx.getImageData(0, 0, W, H), d = im.data, mask = new Uint8Array(W * H);
        for (let i = 0, j = 0; i < d.length; i += 4, j++) { const R = d[i], G2 = d[i + 1], B = d[i + 2], scuro = R < 120 && G2 < 120 && B < 120 && Math.max(R, G2, B) - Math.min(R, G2, B) < 45; d[i] = d[i + 1] = d[i + 2] = scuro ? 0 : 255; d[i + 3] = 255; if (scuro) mask[(H - (j / W | 0) - 1) * W + (j % W)] = 1; }
        const bn = document.createElement('canvas'); bn.width = W; bn.height = H; bn.getContext('2d').putImageData(im, 0, 0);
        // confini dalla pagina disegnata solo se il PDF non ha già le linee vettoriali delle particelle
        const lineeVett = pagina.poli.filter(q => !q.area && /nero|grigio/.test(P.nomeColore(q.colore)) && q.pts.some((v2, i) => i && Math.abs(v2[0] - q.pts[i - 1][0]) > 0.5 && Math.abs(v2[1] - q.pts[i - 1][1]) > 0.5)).length;
        if (!mr && lineeVett < 300) pagina._mr = { px: 1 / sc, x0: z[0], y0: z[1], W, H, mask };
        const aP = (x, y) => [z[0] + x / sc, z[3] - y / sc];
        // mappa a immagine (non a righe di pixel): stessa lettura parola per parola sulla pagina disegnata
        if (!mr && pagina._mr) { stato('Ricerca dei numeri nella mappa…'); tutti = tutti.concat(await APP.ocrParole(pagina._mr, ES.pdfv.paroleRaster(pagina._mr), f => stato('Lettura dei numeri dalla mappa… ' + Math.round(f * 100) + '%'))); }
        for (const [rot, nome] of [[0, 'diritti'], [90, 'ruotati'], [-90, 'ruotati']]) tutti = tutti.concat(await APP.ocrNumeri(bn, aP, f => stato(`Lettura dei numeri ${nome} dalla tavola… ` + Math.round(f * 100) + '%'), rot));
      }
      const testo = pagina.testi;
      // con l'elenco ditte già importato, i numeri che non sono mappali del piano si tengono solo se letti con sicurezza
      const p = APP.pr(), attesi = new Set((p && p.particelle || []).map(x => String(x.map).replace(/^0+/, '')));
      const u = [];
      tutti.sort((a, b) => b.c - a.c).forEach(o => {
        if (attesi.size && !attesi.has(o.t.replace(/^0+/, '')) && o.c < 90) return;
        if (u.some(q => q.t === o.t && Math.hypot(q.x - o.x, q.y - o.y) < Math.max(o.h, 3) * 2)) return;
        if (testo.some(t => Math.abs(t.x - o.x) < Math.max(o.w, (t.w || 0)) / 2 + 2 && Math.abs(t.y - o.y) < Math.max(o.h, t.h) / 2 + 2)) return;
        u.push(o);
      });
      impPdf.numeri = u; impPdf.ocrFatto = true;
      stato(`Letti ${u.length} numeri dalla mappa. Ora «Leggi la tavola».`);
      toast(`OCR: ${u.length} numeri di particella letti dalla mappa`);
    } catch (e) { console.error(e); stato('Lettura non riuscita: ' + e.message); impPdf.ocrFatto = true; }
  }
  async function apriPdf(f) {
    const L = APP.pdfjs(); if (!L) { toast('Lettore PDF non disponibile in questa versione', 5000); return; }
    toast('Lettura del PDF in corso…', 20000);
    let r;
    try { r = await ES.pdfv.leggi(L, new Uint8Array(f.buf)); } catch (err) { toast('PDF non leggibile: ' + err.message, 6000); console.error(err); return; }
    const pag = r.pagine.map((x, i) => [x.poli.length, i]).sort((a, b) => b[0] - a[0])[0];
    if (!pag || pag[0] < 30) { toast('', 1); APP.dlg('PDF senza disegno vettoriale', '<p>Il PDF sembra una <b>scansione</b> (un\'immagine): non contiene linee né aree da leggere. Serve il PDF esportato dal CAD, oppure il DXF/DWG della tavola.</p>'); return; }
    impPdf = { nome: f.nome, r, pag: pag[1], scala: r.scala || 0, colori: {} }; impDxf = null; impGeo = null;
    toast('PDF letto: controlla legenda e scala, poi «Leggi la tavola»');
    APP.render();
  }
  const campione = s => {
    const c = s.colore, tr = s.tratt || (s.tipo === 'tratteggio' ? c : null);
    const bg = s.tipo === 'area' ? c : '#fff', hatch = tr ? `background-image:repeating-linear-gradient(45deg,${tr} 0 1.5px,transparent 1.5px 5px);` : '';
    return `<span style="display:inline-block;width:34px;height:16px;vertical-align:middle;border:1px solid #888;background-color:${bg};${hatch}"></span>`;
  };
  const selRuolo = (attr, v) => `<select ${attr}><option value="">— non è un'area d'intervento —</option>${Object.entries(NOMI_PDF).map(([k, n]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
  function vistaPdf(el, p) {
    const P = ES.pdfv, pg = impPdf.r.pagine[impPdf.pag];
    if (impPdf.mappaImg === undefined) {
      // mappa catastale come immagine (righe di pixel nel PDF, o immagine sotto il disegno con pochi numeri scritti)
      const numTesti = pg.testi.filter(t => ES.analisi.etichetta(t.t)).length;
      impPdf.mappaImg = !!(pg._mr === undefined ? (pg._mr = P.mappaRaster(pg)) : pg._mr) || numTesti < 15 || P.glifi(pg).comp.length >= 30;
    }
    if (!impPdf.leg) {
      impPdf.leg = P.legenda(pg); impPdf.voci = impPdf.leg.voci.map(v => ({ ...v }));
      const I0 = P.interpreta(pg, impPdf.scala || 1000);
      impPdf.altri = I0.altri; impPdf.livelliAltri = I0.livelli || {}; Object.entries(I0.proposte || {}).forEach(([c, r]) => { if (impPdf.colori[c] === undefined) impPdf.colori[c] = r; }); impPdf.fogli = [...new Set(I0.fogli.map(f => f.fg + (f.sez ? ' sez. ' + f.sez : '')))];
    }
    const opt = impPdf.opt = impPdf.opt || { fg: '', comune: p.ente.comune || '', fgMap: false, sottrai: true, scheggia: 0.5, sostituisci: !p.geo };
    const pagine = impPdf.r.pagine;
    el.innerHTML = `<h3>Lettura della tavola PDF</h3>
<div class="ban">Lettura intuitiva: i valori sono <b>dedotti dal disegno</b> e vanno verificati. Le superfici si correggono poi nel piano particellare (campi manuali della particella).</div>
<div class="g">${pagine.length > 1 ? `<label>Pagina<select id="ppag">${pagine.map((x, i) => `<option value="${i}" ${i === impPdf.pag ? 'selected' : ''}>Pagina ${x.n} (${x.poli.length} elementi)</option>`).join('')}</select></label>` : ''}
<label>Scala del disegno 1:<input id="psc" value="${impPdf.scala || ''}" placeholder="es. 1000"></label>
<label>Foglio (se il disegno non lo scrive)<input id="pfg" value="${E(opt.fg)}" placeholder="${E(impPdf.fogli.join(', '))}"></label>
<label>Comune catastale<input id="pcom" value="${E(opt.comune)}"></label></div>
<p class="mu">${impPdf.r.scala ? 'Scala letta nel cartiglio: 1:' + impPdf.r.scala + '.' : 'Scala non scritta nel PDF: indicala, oppure stimala dalle superfici catastali delle ditte già importate.'} ${impPdf.fogli.length ? 'Fogli scritti nel disegno: ' + E(impPdf.fogli.join(', ')) + '.' : ''}
${p.particelle.some(x => U.num(x.sup) > 0) ? ' <button class="s" id="pstima">Stima la scala dalle superfici catastali</button>' : ''}</p>
<h3>Legenda ${impPdf.leg.ancora ? '' : '<span class="mu">(scritta «Legenda» non trovata: voci riconosciute dalle parole chiave)</span>'}</h3>
${impPdf.voci.length ? `<div class="tw" style="max-height:40vh"><table class="t"><thead><tr><th>Simbolo</th><th>Voce di legenda</th><th>Nel programma</th></tr></thead><tbody>
${impPdf.voci.map((v, i) => `<tr><td>${campione(v.simbolo)}</td><td>${E(v.testo)}</td><td>${selRuolo(`data-pv="${i}"`, v.ruolo)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="ban">Nessuna legenda trovata nel PDF: indica qui sotto cosa rappresentano i colori del disegno.</div>'}
${impPdf.altri.length ? `<h3>Altri colori nel disegno</h3><p class="mu">Aree colorate che la legenda non spiega (per esempio un colore per ogni ditta): indica se sono aree d'intervento.</p>
<p class="mu">Attenzione: una campitura che copre tutta la particella spesso indica solo che la particella è interessata, e l'area vera è la fascia (tratteggiata, a puntini…) che ci passa dentro.</p>
<div class="tw"><table class="t"><thead><tr><th>Colore</th><th>Livello CAD</th><th>Nel programma</th></tr></thead><tbody>${impPdf.altri.map(c => { const t = /^t:/.test(c), col = t ? c.slice(2) : c; return `<tr><td>${campione(t ? { tipo: 'tratteggio', colore: col } : { tipo: 'area', colore: col })} <span class="mu">${t ? 'tratteggio' : 'campitura'} ${E(P.nomeColore(col))} ${col}</span></td><td class="mu">${E((impPdf.livelliAltri || {})[c] || '')}</td><td>${selRuolo(`data-pc="${c}"`, impPdf.colori[c] || '')}</td></tr>`; }).join('')}</tbody></table></div>` : ''}
<div class="g" style="margin-top:10px"><label>Scarta schegge sotto (mq)<input id="psch" value="${opt.scheggia}"></label>
<label class="chk"><input type="checkbox" id="psot" ${opt.sottrai ? 'checked' : ''}> Togli le sovrapposizioni tra tipi</label>
<label class="chk"><input type="checkbox" id="psost" ${opt.sostituisci ? 'checked' : ''}> Sostituisci il disegno già importato</label></div>
${impPdf.mappaImg ? `<div class="ban" style="margin-top:10px">🔎 <b>Numeri delle particelle non scritti come testo</b> (mappa a immagine o scritte trasformate in disegno). Il programma li legge «a occhio» (riconoscimento dei caratteri) e da ogni numero ricostruisce la particella seguendo le linee della mappa, anche sotto le aree colorate. <span id="pocrst">${impPdf.ocrFatto ? (impPdf.numeri || []).length + ' numeri letti.' : 'Lettura in corso…'}</span> <button class="s" id="pocr">Rileggi i numeri</button></div>` : ''}
<div class="row" style="margin-top:10px"><button class="p" id="pleggi">Leggi la tavola</button></div><div id="ires"></div>`;
    const pp = el.querySelector('#ppag'); if (pp) pp.onchange = () => { impPdf.pag = +pp.value; impPdf.leg = null; impGeo = null; impPdf.numeri = null; impPdf.ocrFatto = false; impPdf.mappaImg = undefined; APP.render(); };
    const po = el.querySelector('#pocr'); if (po) po.onclick = () => { impPdf.ocrFatto = false; impPdf.ocrCorso = ocrPdf(el); };
    if (impPdf.mappaImg && !impPdf.ocrFatto && !impPdf.ocrCorso) impPdf.ocrCorso = ocrPdf(el).finally(() => { impPdf.ocrCorso = null; });
    el.querySelectorAll('[data-pv]').forEach(s => s.onchange = () => { impPdf.voci[+s.dataset.pv].ruolo = s.value || null; });
    el.querySelectorAll('[data-pc]').forEach(s => s.onchange = () => { impPdf.colori[s.dataset.pc] = s.value; });
    const leggiOpt = () => { impPdf.scala = U.num(el.querySelector('#psc').value) || 0; opt.fg = el.querySelector('#pfg').value.trim(); opt.comune = el.querySelector('#pcom').value.trim(); opt.scheggia = U.num(el.querySelector('#psch').value); opt.sottrai = el.querySelector('#psot').checked; opt.sostituisci = el.querySelector('#psost').checked; };
    const st = el.querySelector('#pstima'); if (st) st.onclick = () => {
      leggiOpt();
      const I = P.interpreta(pg, 1000, { voci: impPdf.voci, colori: impPdf.colori });
      const g = A.importaDxf(I.dxf, { ruoli: I.ruoli, fg: opt.fg, fgDa: I.fgDa, sottrai: false });
      const perK = new Map(), perMap = new Map();
      p.particelle.forEach(x => { const s = U.num(x.sup); if (!s) return; perK.set(A.chiave(x.fg, x.map, x.sub), s); perMap.set(String(x.map), perMap.has(String(x.map)) ? -1 : s); });
      const coppie = g.part.filter(q => q.k).map(q => [q.a, perK.get(q.k) || (perMap.get(String(q.map)) > 0 ? perMap.get(String(q.map)) : 0)]).filter(c => c[1]);
      const sc = P.scalaDaSuperfici(coppie);
      if (!sc) { APP.dlg('Stima della scala', '<p>Nessuna particella del disegno corrisponde a quelle dell\'elenco ditte (o il PDF non ha i confini delle particelle in vettoriale). Indica la scala a mano.</p>'); return; }
      impPdf.scala = sc; APP.render(); toast(`Scala stimata 1:${sc} confrontando ${coppie.length} particelle con le superfici catastali`, 6000);
    };
    el.querySelector('#pleggi').onclick = async () => {
      leggiOpt();
      if (impPdf.ocrCorso) { toast('Attendo la lettura dei numeri della mappa…', 4000); await impPdf.ocrCorso; }
      if (!impPdf.scala) { toast('Indica la scala del disegno (es. 1000)', 5000); el.querySelector('#psc').focus(); return; }
      if (![...impPdf.voci.map(v => v.ruolo), ...Object.values(impPdf.colori)].some(Boolean)) { toast('Indica almeno un tipo d\'area (legenda o colori)', 5000); return; }
      try {
        const I = P.interpreta(pg, impPdf.scala, { voci: impPdf.voci, colori: impPdf.colori, numeri: impPdf.numeri || [] });
        impDxf = { nome: impPdf.nome, dxf: I.dxf, ruoli: I.ruoli, opt: { ...opt }, pdf: true };
        impGeo = A.importaDxf(I.dxf, { ...opt, ruoli: I.ruoli, fgDa: I.fgDa });
        impGeo.origine = 'pdf'; impGeo.scala = impPdf.scala;
        const nf = A.fogliDalPiano(impGeo, p.particelle); if (nf) impGeo.avvisi.unshift(`${nf} aree o particelle hanno preso il foglio dall'elenco ditte (mappale presente una sola volta, su un altro foglio)`);
        impPdf.avvisi = [`Scala usata: 1:${impPdf.scala}${impPdf.r.scala && impPdf.r.scala !== impPdf.scala ? ' (nel cartiglio è scritto 1:' + impPdf.r.scala + ')' : impPdf.r.scala ? ' (letta nel cartiglio)' : ' (indicata a mano)'}. Se le superfici non tornano correggi la scala qui sopra e rileggi; dopo l'importazione si corregge anche dalla Tavola grafica.`].concat(I.avvisi);
      } catch (err) { toast('Lettura non riuscita: ' + err.message, 6000); console.error(err); return; }
      risultatoDxf(el.querySelector('#ires'), p);
    };
    if (impGeo) risultatoDxf(el.querySelector('#ires'), p);
  }
  // La pagina del PDF disegnata (pdf.js) con sopra i contorni delle aree lette, nella zona dell'intervento
  async function sovrapponiPdf(el, g) {
    if (!el || !impPdf || !impPdf.r.doc || !g.pezzi.length) { if (el) el.remove(); return; }
    const pagina = impPdf.r.pagine[impPdf.pag], k = ES.pdfv.metriPerPunto(impPdf.scala);
    const b = [Infinity, Infinity, -Infinity, -Infinity]; g.pezzi.forEach(z => ES.geo.bboxMP(z.mp, b));
    const bp = b.map(v => v / k), mg = Math.max(bp[2] - bp[0], bp[3] - bp[1]) * 0.12 + 20;
    const z = [Math.max(0, bp[0] - mg), Math.max(0, bp[1] - mg), Math.min(pagina.w, bp[2] + mg), Math.min(pagina.h, bp[3] + mg)];
    const pg = await impPdf.r.doc.getPage(pagina.n), base = pg.getViewport({ scale: 1 });
    const sc = Math.min(6, 2200 / Math.max(1, z[2] - z[0])), vp = pg.getViewport({ scale: sc });
    const cv = document.createElement('canvas'); cv.width = Math.ceil((z[2] - z[0]) * sc); cv.height = Math.ceil((z[3] - z[1]) * sc);
    const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
    // la pagina intera alla scala sc, spostata per mostrare solo la zona (coordinate «come si vede», y verso l'alto)
    cx.translate(-z[0] * sc, -(base.height - z[3]) * sc);
    await pg.render({ canvasContext: cx, viewport: vp }).promise;
    const X = x => (x / k - z[0]) * sc, Y = y => (z[3] - y / k) * sc, col = { espr: '#d62828', servop: '#7b2cbf', serv: '#1d70b8', occ: '#e07a00' };
    const path = M => M.map(P => P.map(r => 'M' + r.map(q => X(q[0]).toFixed(1) + ' ' + Y(q[1]).toFixed(1)).join('L') + 'Z').join('')).join('');
    let s = `<svg viewBox="0 0 ${cv.width} ${cv.height}" style="position:absolute;inset:0;width:100%;height:100%">`;
    // particelle ricostruite: contorno sottile e numero (verde se collegato a una ditta, rosso se no); clic per correggerle
    const pr = APP.pr(), visti = new Set();
    (g.part || []).forEach((q, i) => { const bb = ES.geo.bboxMP(q.mp); if (bb[2] < b[0] - mg * k || bb[0] > b[2] + mg * k || bb[3] < b[1] - mg * k || bb[1] > b[3] + mg * k) return; s += `<path data-opp="${i}" style="cursor:pointer" d="${path(q.mp)}" fill="#000" fill-opacity="0" pointer-events="all" stroke="#0a8a3a" stroke-width="${Math.max(1, cv.width / 1400)}"><title>${q.k ? 'Fg. ' + E(q.fg || '?') + ' mapp. ' + E(q.map) : 'particella senza numero'} – clic per correggere</title></path>`; });
    (g.part || []).forEach(q => { if (!q.k || visti.has(q.k)) return; visti.add(q.k); const lp = ES.geo.puntoEtichettaMP(q.mp); if (!lp || X(lp[0]) < 0 || X(lp[0]) > cv.width || Y(lp[1]) < 0 || Y(lp[1]) > cv.height) return; const ok = pr && APP.particellaDiChiave(pr, q.fg, q.map, q.sub); s += `<text x="${X(lp[0]).toFixed(1)}" y="${Y(lp[1]).toFixed(1)}" font-size="${Math.max(11, cv.width / 130)}" text-anchor="middle" fill="${ok ? '#0a7a34' : '#c1121f'}" stroke="#fff" stroke-width="3" paint-order="stroke" font-weight="700" pointer-events="none">${E(q.map)}</text>`; });
    g.pezzi.forEach(p => { s += `<path data-opz="${p.id}" style="cursor:pointer" d="${path(p.mp)}" fill="${p.k ? col[p.tipo] : '#ff0000'}" fill-opacity="${p.k ? .12 : .3}" stroke="${col[p.tipo]}" stroke-width="${Math.max(1.5, cv.width / 900)}"><title>${E(A.RUOLI[p.tipo])} ${U.fmt(p.a, 1)} mq${p.map ? ' – mapp. ' + E(p.map) : ' – senza particella'}</title></path>`; });
    g.pezzi.forEach(p => { const lp = ES.geo.puntoEtichettaMP(p.mp); if (!lp) return; const t = (p.map || '?') + ' · ' + U.fmt(p.a, 0); s += `<text x="${X(lp[0]).toFixed(1)}" y="${Y(lp[1]).toFixed(1)}" font-size="${Math.max(12, cv.width / 110)}" text-anchor="middle" font-family="Arial" font-weight="700" fill="${col[p.tipo]}" stroke="#fff" stroke-width="3" paint-order="stroke">${E(t)}</text>`; });
    s += '</svg>';
    cv.style.cssText = 'width:100%;height:auto;display:block';
    el.innerHTML = ''; el.appendChild(cv); el.insertAdjacentHTML('beforeend', s);
    // clic su un'area: foglio e mappale a mano (le aree senza particella sono in rosso pieno)
    const rifai = () => { const ir = document.querySelector('#ires'); if (ir) risultatoDxf(ir, APP.pr()); };
    el.querySelectorAll('[data-opz]').forEach(q => q.addEventListener('click', e => {
      e.stopPropagation();
      const z = g.pezzi.find(x => x.id === q.dataset.opz); if (!z) return;
      // l'area cade su una particella ricostruita? si corregge la particella (e le aree con lei), altrimenti solo l'area
      const lp = ES.geo.puntoEtichettaMP(z.mp), pc = lp && (g.part || []).find(pp => pp.mp.some(P => ES.geo.inPoly(lp[0], lp[1], P)));
      APP.correggiParticella(APP.pr(), g, pc ? { part: pc, pezzo: z } : { pezzo: z }, rifai);
    }));
    el.querySelectorAll('[data-opp]').forEach(q => q.addEventListener('click', () => { const pc = g.part[+q.dataset.opp]; if (pc) APP.correggiParticella(APP.pr(), g, { part: pc }, rifai); }));
  }
  // Anteprima della lettura: solo la zona delle aree d'intervento
  function anteprimaPdf(g, p) {
    if (!g.pezzi.length || !ES.tavola) return '';
    const b = [Infinity, Infinity, -Infinity, -Infinity]; g.pezzi.forEach(z => ES.geo.bboxMP(z.mp, b));
    const m = Math.max(b[2] - b[0], b[3] - b[1]) * 0.15 + 5;
    const geo = { ...g, bbox: [b[0] - m, b[1] - m, b[2] + m, b[3] + m] };
    try { const v = ES.tavola.schermo({ geo, particelle: p.particelle, ditte: p.ditte }, null); return `<h3>Anteprima della lettura</h3><div style="max-width:900px;border:1px solid #ccd;background:#fff">${v.svg.replace('<svg ', '<svg style="width:100%;height:auto;display:block" ')}</div>`; } catch (e) { return ''; }
  }

  function vistaLayer(el, p) {
    const L = Object.keys(impDxf.dxf.layers).sort(U.cmp);
    const opt = impDxf.opt = impDxf.opt || { fg: '', comune: p.ente.comune || '', fgMap: false, sottrai: true, scheggia: 0.5, sostituisci: !p.geo };
    el.innerHTML = `<h3>Layer del disegno</h3><div class="tw" style="max-height:40vh"><table class="t"><thead><tr><th>Layer</th><th class="n">Linee</th><th class="n">Chiuse</th><th class="n">Testi</th><th>Uso nel programma</th></tr></thead><tbody>
${L.map(l => { const x = impDxf.dxf.layers[l]; return `<tr><td>${E(l)}</td><td class="n">${x.poli}</td><td class="n">${x.chiuse}</td><td class="n">${x.testi}</td><td><select data-ly="${E(l)}">${Object.entries(A.RUOLI).map(([k, v]) => `<option value="${k}" ${impDxf.ruoli[l] === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td></tr>`; }).join('')}
</tbody></table></div>
<div class="g" style="margin-top:10px"><label>Foglio (se le etichette non lo indicano)<input id="ifg" value="${E(opt.fg)}"></label><label>Comune catastale<input id="icom" value="${E(opt.comune)}"></label>
<label>Scarta schegge sotto (mq)<input id="isch" value="${opt.scheggia}"></label>
<label>Unità del disegno<select id="iun">${[['1', 'metri (normale)'], ['0.001', 'millimetri'], ['0.01', 'centimetri'], ['0.1', 'decimetri']].map(([v, t]) => `<option value="${v}" ${String(opt.unita || 1) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
<label class="chk"><input type="checkbox" id="ifm" ${opt.fgMap ? 'checked' : ''}> Etichette «1/100» = foglio/mappale</label>
<label class="chk"><input type="checkbox" id="isot" ${opt.sottrai ? 'checked' : ''}> Togli le sovrapposizioni tra tipi</label>
<label class="chk"><input type="checkbox" id="isost" ${opt.sostituisci ? 'checked' : ''}> Sostituisci il disegno già importato</label></div>
<div class="row" style="margin-top:10px"><button class="p" id="ian">Analizza il disegno</button></div><div id="ires"></div>`;
    el.querySelectorAll('[data-ly]').forEach(s => s.onchange = () => { impDxf.ruoli[s.dataset.ly] = s.value; });
    const leggiOpt = () => { opt.fg = el.querySelector('#ifg').value.trim(); opt.comune = el.querySelector('#icom').value.trim(); opt.scheggia = U.num(el.querySelector('#isch').value); opt.fgMap = el.querySelector('#ifm').checked; opt.sottrai = el.querySelector('#isot').checked; opt.sostituisci = el.querySelector('#isost').checked; opt.unita = +el.querySelector('#iun').value || 1; };
    el.querySelector('#ian').onclick = () => {
      leggiOpt();
      try {
        // DXF in millimetri o centimetri: le coordinate si portano in metri prima dell'analisi (tolleranze in metri)
        const dxf = opt.unita !== 1 ? { ...impDxf.dxf, poli: impDxf.dxf.poli.map(q => ({ ...q, pts: q.pts.map(v => [v[0] * opt.unita, v[1] * opt.unita]) })), testi: impDxf.dxf.testi.map(t => ({ ...t, x: t.x * opt.unita, y: t.y * opt.unita, h: (t.h || 0) * opt.unita })) } : impDxf.dxf;
        impGeo = A.importaDxf(dxf, { ...opt, ruoli: impDxf.ruoli }); impGeo.origine = 'dxf';
        const nf = A.fogliDalPiano(impGeo, p.particelle); if (nf) impGeo.avvisi.unshift(`${nf} aree o particelle hanno preso il foglio dall'elenco ditte (mappale presente una sola volta, su un altro foglio)`);
      } catch (err) { toast('Analisi non riuscita: ' + err.message, 6000); console.error(err); return; }
      risultatoDxf(el.querySelector('#ires'), p);
    };
    if (impGeo) risultatoDxf(el.querySelector('#ires'), p);
  }
  function risultatoDxf(el, p) {
    const g = impGeo, per = {};
    g.pezzi.forEach(z => { const k = z.k || '—'; const o = per[k] = per[k] || { k, fg: z.fg, map: z.map, espr: 0, servop: 0, serv: 0, occ: 0, n: 0, da: new Set() }; o[z.tipo] += z.a; o.n++; if (z.da) o.da.add(z.da); });
    const R = Object.values(per).sort((a, b) => U.cmp(a.fg, b.fg) || U.cmp(a.map, b.map));
    const avv = (impPdf && impPdf.avvisi || []).concat(g.avvisi).map(a => `<div class="ban">${E(a)}</div>`);
    el.innerHTML = `<h3>Risultato</h3>${avv.length > 4 ? avv.slice(0, 2).join('') + `<details><summary class="mu">Altri ${avv.length - 2} avvisi</summary>${avv.slice(2).join('')}</details>` : avv.join('')}
<div class="kpi"><div><small>Particelle catastali lette</small><b>${g.part.length}</b></div><div><small>Aree d'intervento</small><b>${g.pezzi.length}</b></div><div><small>Particelle interessate</small><b>${R.filter(r => r.map).length}</b></div></div>
<div class="tw" style="max-height:45vh"><table class="t"><thead><tr><th>Foglio</th><th>Mappale</th><th class="n">Esproprio</th><th class="n">Servitù ingombro</th><th class="n">Servitù fascia</th><th class="n">Occupazione</th><th>Origine</th></tr></thead><tbody>
${R.map(r => `<tr><td>${r.map ? `<input data-rk="${E(r.k)}" data-c="fg" value="${E(r.fg || '')}" style="width:70px" placeholder="?">` : '?'}</td><td>${r.map ? `<input data-rk="${E(r.k)}" data-c="map" value="${E(r.map)}" style="width:90px">` : 'da assegnare'}</td>${['espr', 'servop', 'serv', 'occ'].map(t => `<td class="n">${r[t] ? U.fmt(r[t], 1) : ''}</td>`).join('')}<td class="mu">${[...r.da].map(x => x === 'catasto' ? 'intersezione con particelle' : x === 'a mano' ? 'assegnata a mano' : 'etichetta nel disegno').join(', ')}${impPdf ? ' <span class="tag t-wa">dal PDF – da verificare</span>' : ''}</td></tr>`).join('')}</tbody></table></div>
${impPdf ? '<h3>Confronto con il PDF originale</h3><p class="mu">Sotto c\'è la tavola PDF, sopra i contorni delle aree riconosciute (rosso esproprio, viola servitù opere, blu servitù, arancio occupazione) con il mappale assegnato: dove non coincidono, correggi la legenda o la scala e rileggi.</p><div id="povl" style="position:relative;max-width:1100px;border:1px solid #ccd;background:#fff;min-height:60px"><span class="mu" style="padding:8px;display:block">Disegno della pagina in corso…</span></div>' + anteprimaPdf(g, p) : ''}
${g.pezzi.some(z => !z.k) ? '<h3>Aree senza particella</h3>' + tabSenza(g.pezzi.filter(z => !z.k)) : ''}
${g.part.length ? tabParticelle(g) : ''}
<div class="row" style="margin-top:10px"><button class="p" id="iapp">Usa questo disegno nella pratica</button><button id="iexd" title="Esporta quello che il programma ha ricostruito, con i suoi layer: lo correggi in CAD e lo reimporti allineato">Esporta DXF da correggere in CAD</button><span class="mu">Le superfici si collegano alle particelle dell'elenco ditte per foglio e mappale.</span></div>`;
    APP._risultato = () => risultatoDxf(el, p);
    el.querySelector('#iexd').onclick = () => APP.esportaDxf(p, g, (impDxf && impDxf.nome) || p.nome);
    el.querySelectorAll('[data-rk]').forEach(i => i.onchange = () => {
      const k0 = i.dataset.rk, z = g.pezzi.find(x => x.k === k0); if (!z) return;
      const nuovo = { fg: z.fg || '', map: z.map || '', sub: z.sub || '' }; nuovo[i.dataset.c] = i.value.trim();
      const q = g.part.find(x => x.k === k0);
      const n = rinumera(g, k0, nuovo, q ? { part: q } : { pezzo: z }, true);
      toast(n + ' elementi aggiornati'); risultatoDxf(el, p);
    });
    if (impPdf) sovrapponiPdf(el.querySelector('#povl'), g).catch(e => { const o = el.querySelector('#povl'); if (o) o.innerHTML = '<span class="mu" style="padding:8px;display:block">Anteprima del PDF non disponibile: ' + E(e.message) + '</span>'; });
    el.querySelector('#iapp').onclick = () => {
      if (impPdf) impGeo.pezzi.forEach(z => { z.stima = 'pdf'; });
      p.geo = A.unisciGeo(p.geo, impGeo, impDxf.opt.sostituisci);
      if (impDxf.opt.comune && !p.ente.comune) p.ente.comune = impDxf.opt.comune;
      // Confini automatici per le particelle già presenti
      p.particelle.forEach(x => { if (!x.confini) x.confini = A.confini(p.geo, A.chiave(x.fg, x.map, x.sub)); });
      const daPdf = !!impPdf;
      impGeo = null; impDxf = null; impPdf = null; APP.salva(); toast(daPdf ? 'Tavola PDF collegata alla pratica: verifica e correggi le superfici nel piano particellare' : 'Disegno collegato alla pratica'); APP.render();
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
<div class="tw" style="max-height:40vh"><table class="t"><thead><tr><th>Ditta</th><th>Intestatari</th><th>Particelle</th></tr></thead><tbody>${res.ditte.map(d => `<tr><td><b>${E(d.n)}</b></td><td>${d.intest.map(o => E(o.nome) + (o.natoA || o.natoIl || o.sede ? ' <span class="mu">' + E(C.giuridica(o) ? 'sede ' + (o.sede || o.natoA || '') : [o.natoA ? 'nato/a a ' + o.natoA : '', o.natoIl ? 'il ' + U.dataIt(o.natoIl) : ''].filter(Boolean).join(' ')) + '</span>' : '') + ' <span class="mu">' + E(C.diritto(o)) + '</span>' + (!o.cf ? ' <span class="tag t-wa">C.F. mancante</span>' : !C.cfValido(o.cf) ? ' <span class="tag t-ko">C.F. da verificare</span>' : '')).join('<br>')}</td><td>${res.particelle.filter(x => x.ditta === d.id).map(x => 'Fg.' + E(x.fg) + ' ' + E(C.mappale(x))).join(', ')}</td></tr>`).join('')}</tbody></table></div>
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
<label class="f">Confini (N-E-S-O) <input data-f="confini"></label>
${v && v.aree.eccede || x.limite ? `<label class="f">Le aree d'intervento (${U.fmt((v.aree.ridotto || 0) || A.TIPI.reduce((s2, t) => s2 + v.aree[t], 0), 0)} mq) superano la superficie catastale (${U.fmt(x.sup, 0)} mq): <select data-f="limite"><option value="">da decidere</option><option value="catasto">usa la superficie catastale (riduci in proporzione)</option><option value="disegno">tieni la misura del disegno</option></select></label>` : ''}</div>
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
    const H = ['Ditta', 'Nome_e_Cognome', 'via', 'cap', 'citta', 'nato_a_il', 'nato_a', 'nato_il', 'Cf', 'proprietà', 'quota'];
    for (let i = 1; i <= NI; i++) H.push('Nome_e_Cognome' + i, 'via' + i, 'cap' + i, 'citta' + i, 'nato_a_il' + i, 'nato_a' + i, 'nato_il' + i, 'Cf' + i, 'proprietà' + i, 'quota' + i);
    for (let i = 1; i <= N; i++) H.push('Comune' + i, 'Foglio' + i, 'Particella' + i, 'haareca' + i, 'Superficie' + i, 'Reddito_Domenicale' + i, 'Reddito_agrario' + i, 'Sup' + i, 'Servitu' + i, 'Occupazione' + i);
    H.push('Indennita');
    const R = [H];
    p.ditte.forEach(d => {
      const ctx = ES.modelli.ditta(p, d, c);
      ctx.intestatari.forEach(o => {
        const r = [d.n, o.nome, o.via, o.cap, o.citta, o.nascita, o.natoA, o.natoIl, o.cf, o.titolo, o.quota];
        for (let i = 0; i < NI; i++) { const q = ctx.intestatari[i] || {}; r.push(q.nome || '', q.via || '', q.cap || '', q.citta || '', q.nascita || '', q.natoA || '', q.natoIl || '', q.cf || '', q.titolo || '', q.quota || ''); }
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
