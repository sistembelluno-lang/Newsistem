// ESPROPRI_SISTEM · galleria di immagini della ditta (foto dello stato di consistenza, estratti di mappa caricati):
// trascina e rilascia o incolla, anteprime grandi, per ogni immagine foglio e mappale (dalle particelle della ditta o
// scritti a mano) e la didascalia che compare sotto l'immagine nei documenti e nel PDF.
(function () {
  'use strict';
  const U = ES.U, E = U.esc, C = ES.cat, APP = window.APP;

  // Foglio e mappale di un'immagine: dalla particella collegata o scritti a mano
  APP.fgMapImg = (p, o) => {
    const x = o.part && p.particelle.find(q => q.id === o.part);
    if (x) return { fg: x.fg, map: C.mappale(x) };
    return o.fg || o.map ? { fg: o.fg || '', map: o.map || '' } : null;
  };
  APP.didascaliaImg = (p, o, n, pre) => {
    const fm = APP.fgMapImg(p, o);
    return [pre ? pre + (n ? ' ' + n : '') : '', fm ? 'Fg. ' + (fm.fg || '?') + ' mapp. ' + (fm.map || '?') : '', o.did || ''].filter(Boolean).join(' – ');
  };

  // Scelta della particella: le particelle della ditta, oppure foglio e mappale scritti a mano
  const scelta = (parts, o, k) => `<select data-${k}p class="gal-p"><option value="">(foglio e mappale)</option>${parts.map(x => `<option value="${x.id}" ${o.part === x.id ? 'selected' : ''}>Fg. ${E(x.fg)} mapp. ${E(C.mappale(x))}</option>`).join('')}<option value="*" ${!o.part && (o.fg || o.map) ? 'selected' : ''}>altra: scrivo foglio e mappale…</option></select>
<span class="gal-fm" ${!o.part && (o.fg || o.map) ? '' : 'hidden'}><input data-${k}fg placeholder="Fg." value="${E(o.fg || '')}"><input data-${k}map placeholder="Mapp." value="${E(o.map || '')}"></span>`;

  // opt: {lista, parts, nome ('foto'|'estratto'), aggiungi(files) → [nuovi oggetti], src(o) → url, salva(), dopo()}
  APP.galleria = (box, p, opt) => {
    const L = opt.lista, parts = opt.parts, plur = opt.nome === 'foto' ? 'foto' : 'estratti di mappa';
    const disegna = async () => {
      box.innerHTML = `<div class="gal-drop" tabindex="0">📥 <b>Trascina qui ${plur}</b>, incollale con Ctrl+V oppure <button type="button" class="s p" data-gsc>scegli i file…</button><span class="mu"> · png, jpg, anche più di una alla volta</span></div>
${L.length ? `<div class="row gal-bar"><span class="mu grow">${L.length} ${L.length === 1 ? (opt.nome === 'foto' ? 'foto' : 'estratto') : plur}${(n => n ? ` · <b class="wa">${n} senza foglio e mappale</b>` : '')(L.filter(o => !APP.fgMapImg(p, o)).length)}</span>${parts.length > 1 && L.length > 1 ? '<button type="button" class="s" data-gord>Ordina per particella</button>' : ''}</div>` : ''}
<div class="gal">${L.map((o, i) => `<figure class="gc"><div class="gi"><img data-gi="${i}" alt="" title="Clic per ingrandire"><span class="gn">${i + 1}</span></div>
${scelta(parts, o, 'g')}
<textarea data-gd="${i}" rows="2" placeholder="Didascalia (compare sotto ${opt.nome === 'foto' ? 'la foto' : 'l\'immagine'})">${E(o.did || '')}</textarea>
<div class="row"><button type="button" class="s" data-gu="${i}" title="Sposta prima">↑</button><button type="button" class="s" data-gdn="${i}" title="Sposta dopo">↓</button><span class="grow mu" style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${E(o.nome || '')}">${E(o.nome || '')}</span><button type="button" class="s d" data-gx="${i}" title="Togli">✕</button></div></figure>`).join('')}</div>`;
      // anteprime (dal fascicolo o incorporate)
      for (const [i, o] of L.entries()) { const im = box.querySelector(`[data-gi="${i}"]`); if (im) im.src = await opt.src(o); }
      box.querySelectorAll('.gc').forEach((fc, i) => {
        const o = L[i], sel = fc.querySelector('[data-gp]'), fm = fc.querySelector('.gal-fm');
        sel.onchange = () => { if (sel.value === '*') { o.part = ''; fm.hidden = false; fm.querySelector('input').focus(); } else { o.part = sel.value; delete o.fg; delete o.map; fm.hidden = true; } opt.salva(); };
        fc.querySelector('[data-gfg]').onchange = e => { o.fg = e.target.value.trim(); opt.salva(); };
        fc.querySelector('[data-gmap]').onchange = e => { o.map = e.target.value.trim(); opt.salva(); };
        fc.querySelector('[data-gd]').onchange = e => { o.did = e.target.value.trim(); opt.salva(); };
        fc.querySelector('[data-gi]').onclick = e => APP.dlg(APP.didascaliaImg(p, o, i + 1, opt.nome === 'foto' ? 'Foto' : 'Estratto') || o.nome, `<div style="text-align:center"><img src="${e.target.src}" style="max-width:100%;max-height:75vh"></div>`, [{ t: 'Chiudi', v: '', p: true }]);
      });
      const sp = (i, j) => { [L[i], L[j]] = [L[j], L[i]]; opt.salva(); disegna(); };
      box.querySelectorAll('[data-gx]').forEach(b => b.onclick = async () => { if (await APP.conferma('Togliere questa immagine?', 'Togli')) { L.splice(+b.dataset.gx, 1); opt.salva(); disegna(); if (opt.dopo) opt.dopo(); } });
      box.querySelectorAll('[data-gu]').forEach(b => b.onclick = () => { const i = +b.dataset.gu; if (i) sp(i - 1, i); });
      box.querySelectorAll('[data-gdn]').forEach(b => b.onclick = () => { const i = +b.dataset.gdn; if (i < L.length - 1) sp(i, i + 1); });
      const ord = box.querySelector('[data-gord]'); if (ord) ord.onclick = () => { const k = o => { const fm = APP.fgMapImg(p, o); return fm ? String(fm.fg).padStart(6, '0') + '|' + String(fm.map).padStart(8, '0') : '~'; }; L.sort((a, b) => U.cmp(k(a), k(b))); opt.salva(); disegna(); };
      // caricamento: pulsante, trascina e rilascia, incolla
      const drop = box.querySelector('.gal-drop');
      box.querySelector('[data-gsc]').onclick = async () => carica(await APP.scegliFile('image/*,.png,.jpg,.jpeg,.gif,.bmp,.webp', true));
      drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('su'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('su'));
      drop.addEventListener('drop', async e => { e.preventDefault(); drop.classList.remove('su'); carica(await daFile([...e.dataTransfer.files])); });
      drop.addEventListener('paste', async e => { const F = [...(e.clipboardData.files || [])]; if (F.length) { e.preventDefault(); carica(await daFile(F)); } });
    };
    const daFile = async F => { const out = []; for (const f of F.filter(x => /^image\//.test(x.type))) out.push({ nome: f.name || 'immagine.png', buf: await f.arrayBuffer(), tipo: f.type }); return out; };
    // dopo la scelta dei file: a quale particella si riferiscono (per tutte le immagini caricate insieme) e didascalia comune
    const carica = async F => {
      if (!F || !F.length) return;
      const o0 = { part: parts.length === 1 ? parts[0].id : '' };
      const r = await APP.dlg(F.length === 1 ? '1 immagine' : F.length + ' immagini', `<p class="mu">${F.slice(0, 8).map(f => E(f.nome)).join(', ')}${F.length > 8 ? '…' : ''}</p>
<div class="g"><label class="f">Foglio e mappale ${opt.nome === 'foto' ? 'delle foto' : 'degli estratti'} (si possono cambiare poi una per una)<span class="row">${scelta(parts, o0, 'n')}</span></label>
<label class="f">Didascalia comune (facoltativa)<input id="gndid" placeholder="${opt.nome === 'foto' ? 'es. vista da nord, recinzione in rete metallica' : 'es. stralcio di mappa con l\'area di esproprio'}"></label></div>`, [{ t: 'Annulla', v: '' }, { t: 'Carica', v: 'ok', p: true }], b => {
        const s = b.querySelector('[data-np]'), fm = b.querySelector('.gal-fm'); s.onchange = () => { fm.hidden = s.value !== '*'; };
      });
      if (r !== 'ok') return;
      const sel = $('[data-np]').value, comune = { part: sel === '*' ? '' : sel, fg: sel === '*' ? $('[data-nfg]').value.trim() : '', map: sel === '*' ? $('[data-nmap]').value.trim() : '', did: $('#gndid').value.trim() };
      APP.toast('Caricamento di ' + F.length + (F.length === 1 ? ' immagine…' : ' immagini…'));
      const nuovi = await opt.aggiungi(F);
      nuovi.forEach(o => { o.part = comune.part; if (comune.fg) o.fg = comune.fg; if (comune.map) o.map = comune.map; if (comune.did) o.did = comune.did; L.push(o); });
      opt.salva(); disegna(); if (opt.dopo) opt.dopo();
      APP.toast(nuovi.length + (nuovi.length === 1 ? ' immagine caricata' : ' immagini caricate'));
    };
    const $ = s => document.querySelector(s);
    disegna();
  };
})();
