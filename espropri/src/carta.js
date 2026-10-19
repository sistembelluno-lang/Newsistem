// ESPROPRI_SISTEM · Carta intestata dell'ente: «taglio alto» (intestazione) e «taglio basso» (piè di pagina) che
// l'operatore scrive e modifica nel programma (testi, loghi, tabelle, dati dell'ente). Compaiono in tutti i documenti:
// nei Word come intestazione e piè di pagina veri, nell'anteprima e nei PDF in testa e in fondo a ogni pagina.
(function () {
  'use strict';
  const U = ES.U, E = U.esc, APP = window.APP;
  const DATI = [['ente.nome', 'Nome dell\'ente'], ['ente.ufficio', 'Ufficio'], ['ente.indirizzo', 'Indirizzo'], ['ente.provincia', 'Provincia'], ['ente.cf', 'C.F. / P.IVA'], ['ente.pec', 'PEC'], ['ente.email', 'E-mail'], ['ente.telefono', 'Telefono'], ['ente.responsabile', 'Firmatario'], ['ente.rup', 'RUP'], ['pratica.nome', 'Oggetto dei lavori'], ['pratica.cup', 'CUP']];
  const DIM = [8, 9, 10, 11, 12, 14, 16, 18, 22];
  const FONT = ['Arial', 'Calibri', 'Times New Roman', 'Garamond', 'Verdana'];

  // Incollati da Word o dal web: via stili di classe, commenti e marcature di Office; restano testo, grassetti, immagini, tabelle
  const pulisci = html => {
    const d = new DOMParser().parseFromString(html, 'text/html');
    d.querySelectorAll('style,script,meta,link,title,xml,o\\:p').forEach(x => x.remove());
    d.querySelectorAll('*').forEach(x => { x.removeAttribute('class'); x.removeAttribute('id'); [...x.attributes].forEach(a => { if (/^on|^lang$|^xmlns/i.test(a.name)) x.removeAttribute(a.name); }); });
    return d.body.innerHTML.replace(/<!--[\s\S]*?-->/g, '');
  };

  APP.cartaUI = (box, p) => {
    const DB = APP.DB, propria = !!(p.carta && (p.carta.testa || p.carta.piede)), def = DB.carta && (DB.carta.testa || DB.carta.piede);
    const c = propria ? p.carta : def ? DB.carta : { testa: '', piede: '' };
    const mg = Object.assign({ alto: 20, basso: 20, sx: 20, dx: 20 }, c.margini || {});
    const btn = (cmd, t, tit, st) => `<button type="button" class="s" data-cmd="${cmd}" title="${tit}"${st ? ` style="${st}"` : ''}>${t}</button>`;
    box.innerHTML = `<div class="row"><h3 style="margin:0" class="grow">🏛️ Carta intestata dell'ente</h3><span class="tag">${propria ? 'di questa pratica' : def ? 'predefinita per tutte le pratiche' : 'non impostata'}</span></div>
<p class="mu">Scrivi qui il <b>taglio alto</b> (intestazione) e il <b>taglio basso</b> (piè di pagina) con tutto quello che l'ente chiede: loghi, nome e dati dell'ufficio, indirizzi, PEC, riferimenti. Compaiono in tutti i documenti (Word, anteprima e PDF). I dati dell'ente si possono inserire come campi che si aggiornano da soli. Puoi anche partire da un Word dell'ente (.docx) e poi correggerlo qui.</p>
<div class="carta-tb" id="ctb">
${btn('bold', '<b>G</b>', 'Grassetto')}${btn('italic', '<i>C</i>', 'Corsivo')}${btn('underline', '<u>S</u>', 'Sottolineato')}
<span class="sep"></span>${btn('justifyLeft', '⇤', 'Allinea a sinistra')}${btn('justifyCenter', '↔', 'Centra')}${btn('justifyRight', '⇥', 'Allinea a destra')}
<span class="sep"></span><select id="cfont" title="Carattere"><option value="">Carattere</option>${FONT.map(f => `<option>${f}</option>`).join('')}</select>
<select id="cdim" title="Dimensione"><option value="">Dim.</option>${DIM.map(d => `<option value="${d}">${d} pt</option>`).join('')}</select>
<label class="carta-col" title="Colore del testo">A<input type="color" id="ccol" value="#000000"></label>
<span class="sep"></span><button type="button" class="s" id="clogo" title="Inserisci un'immagine (logo, stemma) nel punto del cursore">🖼️ Logo</button>
<button type="button" class="s" id="ctab2" title="Tabella a 2 colonne: logo a sinistra, testo a destra">▦ 2 col.</button><button type="button" class="s" id="ctab3" title="Tabella a 3 colonne: logo, testo, logo">▦ 3 col.</button>
${btn('insertHorizontalRule', '―', 'Linea orizzontale')}${btn('removeFormat', '⌫', 'Togli la formattazione del testo selezionato')}
<select id="cdato" title="Inserisci un dato della pratica che si aggiorna da solo"><option value="">＋ Dato dell'ente…</option>${DATI.map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select>
<span id="cimgw" style="display:none" class="mu">Larghezza immagine <input type="number" id="cimgmm" min="5" max="180" step="1" style="width:64px"> mm <button type="button" class="s d" id="cimgx" title="Togli l'immagine">✕</button></span>
</div>
<div class="carta-pag">
<div class="carta-et">TAGLIO ALTO · intestazione</div><div class="carta-z" id="ctesta" contenteditable="true" spellcheck="false">${c.testa || ''}</div>
<div class="carta-mezzo">… testo del documento …</div>
<div class="carta-et">TAGLIO BASSO · piè di pagina</div><div class="carta-z" id="cpiede" contenteditable="true" spellcheck="false">${c.piede || ''}</div>
</div>
<div class="row" style="margin-top:8px;flex-wrap:wrap"><span class="mu">Margini pagina (mm):</span>${[['alto', 'alto'], ['basso', 'basso'], ['sx', 'sinistro'], ['dx', 'destro']].map(([k, t]) => `<label class="mu" style="display:inline-flex;gap:4px;align-items:center">${t}<input type="number" data-mg="${k}" value="${mg[k]}" min="5" max="60" style="width:58px"></label>`).join('')}
<span class="grow"></span><button id="cimp">Importa da Word (.docx)…</button>${propria ? '<button id="cdef" title="La stessa carta per tutte le pratiche che non ne hanno una propria">Usa per tutte le pratiche</button>' : ''}${propria && def ? '<button id="cpre">Torna alla predefinita</button>' : ''}<button id="csvu" class="d">Svuota</button></div>`;
    const zT = box.querySelector('#ctesta'), zP = box.querySelector('#cpiede');
    let zona = zT, range = null, img = null, timer = 0;
    // Salva come carta di questa pratica (modificare la predefinita qui la copia nella pratica)
    const salva = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const m = {}; box.querySelectorAll('[data-mg]').forEach(i => { m[i.dataset.mg] = Math.max(5, Math.min(60, +i.value || 20)); });
        const t = zT.innerHTML.trim(), pi = zP.innerHTML.trim(), vuota = h => !h.replace(/<(?!img|table)[^>]*>|&nbsp;|\s/gi, '');
        if (vuota(t) && vuota(pi)) delete p.carta; else p.carta = { testa: t, piede: pi, margini: m };
        APP.salva();
      }, 350);
    };
    const tieni = () => { const s = getSelection(); if (s.rangeCount && (zT.contains(s.anchorNode) || zP.contains(s.anchorNode))) { range = s.getRangeAt(0).cloneRange(); zona = zT.contains(s.anchorNode) ? zT : zP; } };
    const ripristina = () => { zona.focus(); if (range) { const s = getSelection(); s.removeAllRanges(); s.addRange(range); } };
    const inserisci = html => { ripristina(); document.execCommand('insertHTML', false, html); tieni(); salva(); };
    [zT, zP].forEach(z => {
      z.addEventListener('input', salva);
      z.addEventListener('keyup', tieni); z.addEventListener('mouseup', tieni); z.addEventListener('focus', () => { zona = z; });
      z.addEventListener('click', e => {
        box.querySelectorAll('.carta-z img.sel').forEach(x => x.classList.remove('sel'));
        img = e.target.tagName === 'IMG' ? e.target : null;
        box.querySelector('#cimgw').style.display = img ? '' : 'none';
        if (img) { img.classList.add('sel'); box.querySelector('#cimgmm').value = Math.round((+img.getAttribute('width') || img.width) / 3.7795); }
      });
      z.addEventListener('paste', async e => {
        const f = [...(e.clipboardData.files || [])].find(x => /^image\//.test(x.type));
        if (f) { e.preventDefault(); const im = await APP.inPng(await f.arrayBuffer(), f.type); logo(im); return; }
        const h = e.clipboardData.getData('text/html');
        if (h) { e.preventDefault(); document.execCommand('insertHTML', false, pulisci(h)); salva(); }
      });
    });
    box.querySelectorAll('[data-cmd]').forEach(b => {
      b.onmousedown = e => e.preventDefault();
      b.onclick = () => { ripristina(); document.execCommand(b.dataset.cmd, false, null); tieni(); salva(); };
    });
    // Dimensione e carattere: execCommand produce <font>; si convertono in stili espliciti (punti tipografici)
    box.querySelector('#cdim').onchange = e => {
      const v = e.target.value; e.target.value = ''; if (!v) return;
      ripristina(); document.execCommand('fontSize', false, '7');
      zona.querySelectorAll('font[size="7"]').forEach(f => { const s = document.createElement('span'); s.style.fontSize = v + 'pt'; s.innerHTML = f.innerHTML; f.replaceWith(s); });
      tieni(); salva();
    };
    box.querySelector('#cfont').onchange = e => { const v = e.target.value; e.target.value = ''; if (!v) return; ripristina(); document.execCommand('fontName', false, v); tieni(); salva(); };
    box.querySelector('#ccol').onchange = e => { ripristina(); document.execCommand('foreColor', false, e.target.value); tieni(); salva(); };
    box.querySelector('#cdato').onchange = e => { const v = e.target.value; e.target.value = ''; if (v) inserisci(E('{{' + v + '}}')); };
    const logo = im => {
      const w = Math.min(im.w, 170), h = Math.round(w * im.h / im.w);
      inserisci(`<img src="data:image/png;base64,${U.b64(im.png)}" width="${w}" height="${h}" data-r="${(im.h / im.w).toFixed(4)}">`);
    };
    box.querySelector('#clogo').onmousedown = e => e.preventDefault();
    box.querySelector('#clogo').onclick = async () => {
      const [f] = await APP.scegliFile('image/*,.png,.jpg,.jpeg,.gif,.bmp'); if (!f) return;
      try { logo(await APP.inPng(f.buf, f.tipo)); } catch (e) { APP.toast(e.message); }
    };
    const tab = n => `<table style="width:100%;border-collapse:collapse"><tr>${(n === 2 ? [[25, 'left', 'Logo'], [75, 'left', 'Nome dell\'ente<br>Ufficio · indirizzo']] : [[20, 'left', 'Logo'], [60, 'center', 'Nome dell\'ente<br>Ufficio · indirizzo'], [20, 'right', 'Logo']]).map(([w, a, t]) => `<td style="width:${w}%;vertical-align:middle;text-align:${a}">${t}</td>`).join('')}</tr></table><div><br></div>`;
    ['#ctab2', '#ctab3'].forEach((id, i) => { const b = box.querySelector(id); b.onmousedown = e => e.preventDefault(); b.onclick = () => inserisci(tab(i + 2)); });
    box.querySelector('#cimgmm').onchange = e => {
      if (!img) return;
      const r = +img.dataset.r || (img.naturalHeight / img.naturalWidth) || 0.5, w = Math.round(Math.max(5, Math.min(180, +e.target.value || 30)) * 3.7795);
      img.setAttribute('width', w); img.setAttribute('height', Math.round(w * r)); salva();
    };
    box.querySelector('#cimgx').onclick = () => { if (img) { img.remove(); img = null; box.querySelector('#cimgw').style.display = 'none'; salva(); } };
    box.querySelectorAll('[data-mg]').forEach(i => i.onchange = salva);
    box.querySelector('#cimp').onclick = async () => {
      const [f] = await APP.scegliFile('.docx,.doc'); if (!f) return;
      if (/\.doc$/i.test(f.nome)) { APP.toast('Apri il file in Word e salvalo come .docx, poi importalo di nuovo', 6000); return; }
      let x; try { x = await ES.office.cartaDaDocx(f.buf); } catch (e) { APP.toast('Non riesco a leggere la carta intestata: ' + e.message, 6000); return; }
      if ((zT.textContent.trim() || zP.textContent.trim()) && !await APP.conferma('Sostituire il taglio alto e il taglio basso attuali con quelli del Word «' + E(f.nome) + '»?', 'Sostituisci')) return;
      zT.innerHTML = x.testa; zP.innerHTML = x.piede; salva();
      APP.toast('Intestazione e piè di pagina importati: ora puoi modificarli qui', 5000);
    };
    const cd = box.querySelector('#cdef'); if (cd) cd.onclick = () => { clearTimeout(timer); DB.carta = JSON.parse(JSON.stringify(p.carta)); APP.salva(); APP.toast('Carta intestata predefinita per tutte le pratiche'); };
    const cp = box.querySelector('#cpre'); if (cp) cp.onclick = async () => { if (await APP.conferma('Togliere la carta di questa pratica e usare quella predefinita?', 'Usa la predefinita')) { delete p.carta; APP.salva(); APP.render(); } };
    box.querySelector('#csvu').onclick = async () => {
      if (!await APP.conferma(propria ? 'Svuotare la carta intestata di questa pratica?' : def ? 'Togliere la carta predefinita per tutte le pratiche?' : 'Svuotare?', 'Svuota')) return;
      clearTimeout(timer); if (propria) delete p.carta; else delete DB.carta; APP.salva(); APP.render();
    };
  };
})();
