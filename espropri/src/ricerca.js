// ESPROPRI_SISTEM · Ricerca sul web: una domanda dell'operatore, risposta di sintesi con norme e sentenze trovate in rete.
// Usa l'API di Claude (SDK ufficiale Anthropic incluso nella pagina) con lo strumento di ricerca web lato server:
// la risposta cita le pagine da cui viene, che si elencano come prova. Serve una chiave API (console.anthropic.com).
(function () {
  'use strict';
  const U = ES.U, E = U.esc, APP = window.APP;
  const MODELLO = 'claude-opus-5-5';
  const CHIAVE = 'espropri-chiave-api';
  // fonti istituzionali (opzione «solo fonti istituzionali»)
  const ISTITUZIONALI = ['normattiva.it', 'gazzettaufficiale.it', 'giustizia-amministrativa.it', 'cortecostituzionale.it', 'cortedicassazione.it', 'italgiure.giustizia.it', 'giustizia.it', 'eur-lex.europa.eu', 'mit.gov.it', 'agenziaentrate.gov.it', 'regione.veneto.it', 'camera.it', 'senato.it'];
  const SISTEMA = `Sei un consulente esperto di espropriazioni per pubblica utilità in Italia (D.P.R. 8 giugno 2001 n. 327, Testo unico espropri, e norme collegate: leggi regionali, codice dei contratti pubblici, codice civile, giurisprudenza). Rispondi in italiano a un tecnico dell'ufficio espropri che sta seguendo una pratica.
Cerca sul web le fonti aggiornate: articoli di legge (testo vigente), sentenze della Corte costituzionale, della Cassazione e dei giudici amministrativi (TAR, Consiglio di Stato), circolari e prassi. Preferisci le fonti ufficiali (Normattiva, Gazzetta Ufficiale, giustizia-amministrativa.it, cortecostituzionale.it, Cassazione) e cita sempre gli estremi (articolo e comma; organo, sezione, numero e data della sentenza).
Struttura la risposta così: 1) risposta breve (3-5 righe); 2) spiegazione con i riferimenti normativi; 3) giurisprudenza rilevante, una riga per sentenza con quello che ha deciso; 4) cosa fare in pratica nella procedura; 5) cautele (punti incerti, orientamenti contrastanti, norme regionali da verificare). Se le fonti non bastano o sono in conflitto, dillo chiaramente: non inventare sentenze né numeri. Scrivi in testo semplice con titoletti e elenchi puntati, senza tabelle.`;

  const chiave = () => { try { return localStorage.getItem(CHIAVE) || ''; } catch (e) { return ''; } };
  const salvaChiave = k => { try { if (k) localStorage.setItem(CHIAVE, k); else localStorage.removeItem(CHIAVE); } catch (e) { /* senza memoria locale la chiave vale per la sessione */ } APP._chiave = k; };

  // Testo della risposta (markdown semplice) → HTML, con i rimandi [n] alle fonti
  const md = t => {
    const inl = x => E(x).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[(\d+)\]/g, '<sup><a href="#fonte-$1">[$1]</a></sup>');
    let out = '', lista = null;
    String(t).split('\n').forEach(r => {
      const m = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(r);
      if (m) { if (!lista) { out += '<ul>'; lista = true; } out += `<li>${inl(m[1])}</li>`; return; }
      if (lista) { out += '</ul>'; lista = null; }
      const h = /^\s*#{1,4}\s+(.*)$/.exec(r);
      if (h) out += `<h3>${inl(h[1])}</h3>`;
      else if (r.trim()) out += `<p>${inl(r)}</p>`;
    });
    return out + (lista ? '</ul>' : '');
  };

  // Risposta: testo con i rimandi alle fonti citate + elenco delle fonti (citate prima, poi le altre pagine trovate)
  const componi = contenuti => {
    const fonti = [], indice = new Map(), trovate = [];
    const numero = c => { if (!indice.has(c.url)) { fonti.push({ url: c.url, titolo: c.title || c.url, estratti: [] }); indice.set(c.url, fonti.length); } return indice.get(c.url); };
    let testo = '';
    contenuti.forEach(b => {
      if (b.type === 'text') {
        const rif = [...new Set((b.citations || []).filter(c => c.url).map(c => { const n = numero(c); const f = fonti[n - 1]; if (c.cited_text && !f.estratti.includes(c.cited_text) && f.estratti.length < 3) f.estratti.push(c.cited_text); return n; }))];
        testo += b.text + (rif.length ? ' ' + rif.map(n => '[' + n + ']').join('') : '');
      } else if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) b.content.forEach(r => { if (r.type === 'web_search_result') trovate.push({ url: r.url, titolo: r.title || r.url, data: r.page_age || '' }); });
    });
    const altre = trovate.filter((r, i) => !indice.has(r.url) && trovate.findIndex(q => q.url === r.url) === i);
    return { testo: testo.trim(), fonti, altre };
  };

  // Domanda → risposta. Gestisce la pausa del giro di ricerca lato server (pause_turn) e la mostra man mano.
  async function chiedi(domanda, opt, suTesto) {
    const SDK = window.AnthropicSDK; if (!SDK) throw new Error('libreria Anthropic non presente in questa versione');
    const client = new SDK({ apiKey: opt.chiave, dangerouslyAllowBrowser: true });
    const strumento = { type: 'web_search_20260209', name: 'web_search', max_uses: 8, user_location: { type: 'approximate', country: 'IT' } };
    if (opt.istituzionali) strumento.allowed_domains = ISTITUZIONALI;
    const messaggi = [{ role: 'user', content: domanda + (opt.contesto ? '\n\nContesto della pratica (senza dati personali): ' + opt.contesto : '') }];
    const tutti = []; let msg = null, giri = 0, parziale = '';
    do {
      const stream = client.beta.messages.stream({
        model: MODELLO, max_tokens: 32000,
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
        thinking: { type: 'adaptive' }, output_config: { effort: 'high' },
        system: SISTEMA, tools: [strumento], messages: messaggi
      });
      stream.on('text', d => { parziale += d; if (suTesto) suTesto(parziale); });
      msg = await stream.finalMessage();
      tutti.push(...msg.content);
      if (msg.stop_reason === 'pause_turn') messaggi.push({ role: 'assistant', content: msg.content });
    } while (msg.stop_reason === 'pause_turn' && ++giri < 5);
    if (msg.stop_reason === 'refusal') throw new Error('la domanda non ha avuto risposta (rifiutata dal servizio): riformulala');
    return { ...componi(tutti), troncata: msg.stop_reason === 'max_tokens' || msg.stop_reason === 'pause_turn', modello: msg.model };
  }

  const contestoPratica = p => p ? [p.nome && 'opera: ' + p.nome, p.impost && ES.stima.PROCEDURE[p.impost.procedura] && 'procedura: ' + ES.stima.PROCEDURE[p.impost.procedura].nome, p.ente && p.ente.comune && 'comune: ' + p.ente.comune, p.ente && p.ente.regione && 'regione: ' + p.ente.regione].filter(Boolean).join('; ') : '';

  const htmlRisposta = r => `<div class="ric-r">${md(r.testo)}</div>${r.troncata ? '<div class="ban">La risposta è stata interrotta prima della fine: riprova con una domanda più precisa.</div>' : ''}
${r.fonti.length ? `<h3>Fonti citate</h3><ol class="ric-f">${r.fonti.map((f, i) => `<li id="fonte-${i + 1}"><a href="${E(f.url)}" target="_blank" rel="noopener">${E(f.titolo)}</a> <span class="mu">${E(f.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0])}</span>${f.estratti.map(x => `<blockquote>${E(x)}</blockquote>`).join('')}</li>`).join('')}</ol>` : '<p class="mu">Nessuna fonte citata.</p>'}
${r.altre.length ? `<details><summary class="mu">Altre pagine consultate (${r.altre.length})</summary><ul>${r.altre.map(f => `<li><a href="${E(f.url)}" target="_blank" rel="noopener">${E(f.titolo)}</a>${f.data ? ' <span class="mu">' + E(f.data) + '</span>' : ''}</li>`).join('')}</ul></details>` : ''}`;

  APP.viste.ricerca = (m, p) => {
    const st = APP.ricSt = APP.ricSt || { istituzionali: false, contesto: true, domanda: '' };
    const k = APP._chiave || chiave();
    const storia = (p && p.ricerche) || APP.DB.ricerche || (APP.DB.ricerche = []);
    m.innerHTML = `<h2>🔎 Ricerca sul web: norme e sentenze</h2>
<p class="mu">Fai una domanda su un caso della procedura (es. «cosa succede se la particella da espropriare è edificabile?»): il programma cerca in rete norme, sentenze e prassi e ti dà una risposta di sintesi con l'elenco delle fonti, da aprire e verificare. È un aiuto per i casi difficili, non sostituisce il parere legale.</p>
<div class="card"><h3 style="margin-top:0">Collegamento</h3>
<p class="mu">La ricerca usa il servizio di intelligenza artificiale Claude di Anthropic, che fa le ricerche web e scrive la sintesi. Serve una <b>chiave API</b> (si crea su console.anthropic.com, con fatturazione a consumo: ogni domanda costa pochi centesimi più le ricerche web). La chiave resta su questo computer. Alla ricerca non si mandano nomi, codici fiscali o altri dati delle ditte.</p>
<div class="row"><label class="fl grow">Chiave API<input id="rk" type="password" value="${E(k)}" placeholder="sk-ant-…" autocomplete="off"></label><button id="rks">${k ? 'Aggiorna' : 'Salva'}</button>${k ? '<button id="rkx" class="d">Togli</button>' : ''}</div></div>
<div class="card"><h3 style="margin-top:0">Domanda</h3>
<textarea id="rq" rows="4" style="width:100%" placeholder="Es.: Indennità di esproprio per un'area edificabile: come si calcola dopo la sentenza della Corte costituzionale 181/2011? Spetta la maggiorazione del 10% se il proprietario cede volontariamente?">${E(st.domanda)}</textarea>
<div class="row" style="margin-top:8px"><label class="chk"><input type="checkbox" id="ri" ${st.istituzionali ? 'checked' : ''}> Solo fonti istituzionali (Normattiva, Gazzetta Ufficiale, giustizia amministrativa, Corte costituzionale, Cassazione…)</label>
${p ? `<label class="chk"><input type="checkbox" id="rc" ${st.contesto ? 'checked' : ''}> Tieni conto della pratica aperta (${E(contestoPratica(p) || 'dati generali')})</label>` : ''}</div>
<div class="row" style="margin-top:8px"><button class="p" id="rgo">Cerca e rispondi</button><span class="mu" id="rst"></span></div></div>
<div id="rres"></div>
${storia.length ? `<div class="card"><h3 style="margin-top:0">Ricerche precedenti${p ? ' della pratica' : ''}</h3><div class="tw" style="max-height:none"><table class="t"><tbody>${storia.slice().reverse().map((r, i) => `<tr class="clic" data-rs="${storia.length - 1 - i}"><td class="mu">${U.dataIt(r.data)}</td><td>${E(r.domanda.slice(0, 160))}</td><td class="mu">${r.fonti.length} fonti</td><td><button class="s d" data-rx="${storia.length - 1 - i}">✕</button></td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
    const res = m.querySelector('#rres'), stato = t => { m.querySelector('#rst').textContent = t; };
    m.querySelector('#rks').onclick = () => { salvaChiave(m.querySelector('#rk').value.trim()); APP.toast('Chiave salvata su questo computer'); APP.render(); };
    const rx = m.querySelector('#rkx'); if (rx) rx.onclick = () => { salvaChiave(''); APP.render(); };
    m.querySelector('#rq').oninput = e => { st.domanda = e.target.value; };
    m.querySelector('#ri').onchange = e => { st.istituzionali = e.target.checked; };
    const rc = m.querySelector('#rc'); if (rc) rc.onchange = e => { st.contesto = e.target.checked; };
    const mostra = r => { res.innerHTML = `<div class="card"><div class="row"><h3 style="margin:0" class="grow">Risposta</h3><button class="s" id="rcp">Copia testo e fonti</button></div><p class="mu"><b>Domanda:</b> ${E(r.domanda)}</p>${htmlRisposta(r)}</div>`;
      res.querySelector('#rcp').onclick = () => { const t = r.domanda + '\n\n' + r.testo + '\n\nFonti:\n' + r.fonti.map((f, i) => `[${i + 1}] ${f.titolo} – ${f.url}`).join('\n'); navigator.clipboard.writeText(t).then(() => APP.toast('Copiato')).catch(() => APP.toast('Copia non riuscita')); }; };
    m.querySelectorAll('[data-rs]').forEach(tr => tr.onclick = e => { if (e.target.dataset.rx) return; mostra(storia[+tr.dataset.rs]); window.scrollTo(0, res.offsetTop - 70); });
    m.querySelectorAll('[data-rx]').forEach(b => b.onclick = e => { e.stopPropagation(); storia.splice(+b.dataset.rx, 1); APP.salva(); APP.render(); });
    m.querySelector('#rgo').onclick = async () => {
      const domanda = m.querySelector('#rq').value.trim(), ch = APP._chiave || chiave();
      if (!domanda) { APP.toast('Scrivi la domanda'); return; }
      if (!ch) { APP.toast('Inserisci prima la chiave API'); m.querySelector('#rk').focus(); return; }
      const btn = m.querySelector('#rgo'); btn.disabled = true; stato('Ricerca delle fonti e sintesi in corso (di solito uno o due minuti)…');
      res.innerHTML = '<div class="card"><h3 style="margin-top:0">Risposta in preparazione…</h3><div class="ric-r mu" id="rlive"></div></div>';
      try {
        const r = await chiedi(domanda, { chiave: ch, istituzionali: st.istituzionali, contesto: p && st.contesto ? contestoPratica(p) : '' }, t => { const el = document.getElementById('rlive'); if (el) el.innerHTML = md(t); });
        const voce = { data: U.oggi(), domanda, testo: r.testo, fonti: r.fonti, altre: r.altre, troncata: r.troncata };
        if (p) (p.ricerche = p.ricerche || []).push(voce); else storia.push(voce);
        APP.salva(); stato(''); btn.disabled = false; mostra(voce);
      } catch (e) {
        const SDK = window.AnthropicSDK, msg = SDK && e instanceof SDK.AuthenticationError ? 'chiave API non valida' : SDK && e instanceof SDK.PermissionDeniedError ? 'la chiave non ha accesso a questo servizio (o la ricerca web non è attiva per l\'organizzazione)' : SDK && e instanceof SDK.RateLimitError ? 'troppe richieste: riprova tra poco' : SDK && e instanceof SDK.APIConnectionError ? 'collegamento a internet non disponibile' : SDK && e instanceof SDK.APIError ? 'errore del servizio (' + (e.status || '') + '): ' + e.message : e.message;
        res.innerHTML = `<div class="ban err">Ricerca non riuscita: ${E(msg)}</div>`; stato(''); btn.disabled = false;
      }
    };
  };
})();
