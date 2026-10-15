// File Office senza librerie: archivio ZIP, documenti Word (.docx) da blocchi, compilazione di modelli Word dell'utente
// (segnaposto {{campo}}, ripetizioni {{#lista}}…{{/lista}}, campi di stampa unione «Campo» esistenti) e fogli Excel (.xlsx).
(function (ES) {
  'use strict';
  const O = ES.office = {}, U = ES.U;
  const enc = s => new TextEncoder().encode(s);
  const xe = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

  // ---- ZIP (metodo «stored»: niente compressione, sempre valido per Office) ----
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  O.zip = files => {
    const parti = [], centrale = []; let off = 0;
    files.forEach(f => {
      const nome = enc(f.name), dati = typeof f.data === 'string' ? enc(f.data) : f.data, crc = crc32(dati);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, dati.length, true); h.setUint32(22, dati.length, true);
      h.setUint16(26, nome.length, true); h.setUint16(28, 0, true);
      parti.push(new Uint8Array(h.buffer), nome, dati);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, dati.length, true); c.setUint32(24, dati.length, true);
      c.setUint16(28, nome.length, true); c.setUint32(42, off, true);
      centrale.push(new Uint8Array(c.buffer), nome);
      off += 30 + nome.length + dati.length;
    });
    const lc = centrale.reduce((s, x) => s + x.length, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, lc, true); e.setUint32(16, off, true);
    const tutto = [...parti, ...centrale, new Uint8Array(e.buffer)], out = new Uint8Array(tutto.reduce((s, x) => s + x.length, 0));
    let p = 0; tutto.forEach(x => { out.set(x, p); p += x.length; });
    return out;
  };

  // ---- Word da blocchi ----
  // Blocchi: {t:'p', runs:[{text,b,i,u}], align, size, ind, bullet, after, keep}, {t:'table', cols:[%], rows:[{h, cells:[{runs|blocks, align, shade, span, b}]}], size},
  // {t:'pb'} salto pagina, {t:'img', png:Uint8Array, w, h (px), mm (larghezza), align}
  const TW = 9638; // larghezza utile A4 con margini di 2 cm, in twip
  function runXml(r, size, font) {
    if (r.br) return '<w:r><w:br/></w:r>';
    const pr = (r.b ? '<w:b/>' : '') + (r.i ? '<w:i/>' : '') + (r.u ? '<w:u w:val="single"/>' : '') + (r.size || size ? `<w:sz w:val="${r.size || size}"/><w:szCs w:val="${r.size || size}"/>` : '') + (font ? `<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/>` : '');
    return String(r.text ?? '').split('\n').map((t, i) => (i ? '<w:r><w:br/></w:r>' : '') + `<w:r>${pr ? '<w:rPr>' + pr + '</w:rPr>' : ''}<w:t xml:space="preserve">${xe(t.replace(/\t/g, '    '))}</w:t></w:r>`).join('');
  }
  function parXml(b, ctx) {
    const al = { center: 'center', right: 'right', both: 'both', justify: 'both' }[b.align] || 'left';
    let ppr = `<w:jc w:val="${al}"/><w:spacing w:before="${b.before || 0}" w:after="${b.after ?? 120}" w:line="${b.line || 264}" w:lineRule="auto"/>`;
    if (b.bullet) ppr += `<w:ind w:left="${360 + (b.ind || 0)}" w:hanging="300"/>`;
    else if (b.ind) ppr += `<w:ind w:left="${b.ind}"/>`;
    if (b.keep) ppr += '<w:keepNext/>';
    const runs = (b.bullet ? [{ text: '•\t'.replace('\t', ' ') }] : []).concat(b.runs || []);
    return `<w:p><w:pPr>${ppr}</w:pPr>${runs.map(r => runXml(r, b.size || ctx.size, ctx.font)).join('')}</w:p>`;
  }
  function imgXml(b, ctx) {
    const id = ctx.img(b.png), wmm = b.mm || 170, emuW = Math.round(wmm * 36000), emuH = Math.round(emuW * (b.h / b.w));
    const n = ctx.nImg = (ctx.nImg || 0) + 1;
    return `<w:p><w:pPr><w:jc w:val="${b.align || 'center'}"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${emuW}" cy="${emuH}"/><wp:docPr id="${n}" name="Immagine ${n}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="img${n}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emuW}" cy="${emuH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  }
  function tabXml(b, ctx) {
    const cols = b.cols || b.rows[0].cells.map(() => 100 / b.rows[0].cells.length), tot = cols.reduce((s, x) => s + x, 0);
    const tw = cols.map(c => Math.round(TW * c / tot)), size = b.size || Math.max(14, (ctx.size || 21) - 4);
    const bd = b.border === false ? '' : '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`).join('') + '</w:tblBorders>';
    let x = `<w:tbl><w:tblPr><w:tblW w:w="${TW}" w:type="dxa"/>${bd}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="57" w:type="dxa"/><w:right w:w="57" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${tw.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
    b.rows.forEach(r => {
      x += `<w:tr>${r.h ? '<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>' : '<w:trPr><w:cantSplit/></w:trPr>'}`;
      let ci = 0;
      r.cells.forEach(c => {
        const span = c.span || 1, w = tw.slice(ci, ci + span).reduce((s, v) => s + v, 0); ci += span;
        const shade = c.shade || (r.h ? 'E8EDF5' : '');
        const inner = (c.blocks || [{ t: 'p', runs: c.runs || [{ text: c.text ?? '' }], align: c.align }]).map(bb => bb.t === 'p' ? parXml({ ...bb, after: 0, line: 240, size: bb.size || size, runs: (bb.runs || []).map(rr => ({ ...rr, b: rr.b || r.h || c.b })) }, ctx) : blocco(bb, ctx)).join('');
        x += `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>` : ''}<w:vAlign w:val="center"/></w:tcPr>${inner || '<w:p/>'}</w:tc>`;
      });
      x += '</w:tr>';
    });
    return x + '</w:tbl><w:p><w:pPr><w:spacing w:after="60"/></w:pPr></w:p>';
  }
  function blocco(b, ctx) {
    if (b.t === 'p') return parXml(b, ctx);
    if (b.t === 'pb') return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    if (b.t === 'table') return tabXml(b, ctx);
    if (b.t === 'img') return b.png ? imgXml(b, ctx) : '';
    return '';
  }
  // opt: {font, size (mezzi punti, 21 = 10,5 pt), intestazione:[righe], piede:'testo'}
  O.docx = (blocchi, opt = {}) => {
    const media = [], ctx = { font: opt.font || 'Arial', size: opt.size || 21, img: png => { media.push(png); return 'rIdImg' + media.length; } };
    const body = blocchi.map(b => blocco(b, ctx)).join('');
    const hdr = opt.intestazione && opt.intestazione.length;
    const ftr = !!opt.piede;
    const sect = `<w:sectPr>${hdr ? '<w:headerReference w:type="default" r:id="rIdH"/>' : ''}${ftr ? '<w:footerReference w:type="default" r:id="rIdF"/>' : ''}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>`;
    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}${sect}</w:body></w:document>`;
    const rels = ['<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>']
      .concat(media.map((m, i) => `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/img${i + 1}.png"/>`))
      .concat(hdr ? ['<Relationship Id="rIdH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>'] : [])
      .concat(ftr ? ['<Relationship Id="rIdF" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'] : []);
    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>${hdr ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : ''}${ftr ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : ''}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
      { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xe(opt.titolo || '')}</dc:title><dc:creator>ESPROPRI_SISTEM</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>` },
      { name: 'word/_rels/document.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>` },
      { name: 'word/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${ctx.font}" w:hAnsi="${ctx.font}" w:cs="${ctx.font}" w:eastAsia="${ctx.font}"/><w:sz w:val="${ctx.size}"/><w:szCs w:val="${ctx.size}"/><w:lang w:val="it-IT"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>` },
      { name: 'word/document.xml', data: doc }
    ];
    if (hdr) files.push({ name: 'word/header1.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${NS}>${opt.intestazione.map((r, i) => parXml({ runs: [{ text: r, b: i === 0 }], align: 'center', after: 0, size: i === 0 ? ctx.size + 3 : ctx.size - 3 }, ctx)).join('')}</w:hdr>` });
    if (ftr) files.push({ name: 'word/footer1.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}>${parXml({ runs: [{ text: opt.piede }], align: 'center', size: 15, after: 0 }, ctx)}</w:ftr>` });
    media.forEach((m, i) => files.push({ name: `word/media/img${i + 1}.png`, data: m }));
    return O.zip(files);
  };

  // ---- Compilazione di un modello Word dell'utente ----
  // Nel modello: {{campo}} o {{ditta.n}}, ripetizioni {{#particelle}}…{{/particelle}} (in una riga di tabella o tra paragrafi),
  // condizioni {{#campo}}…{{/campo}} / {{^campo}}…{{/campo}}, immagine {{%planimetria}}. I campi di stampa unione («Foglio1»)
  // diventano segnaposto e si risolvono con ctx._unione. Un documento per ogni contesto, uniti con salto pagina.
  function campiUnione(xml) {
    // Campi complessi: begin … instrText MERGEFIELD Nome … separate … risultato … end
    xml = xml.replace(/<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*?<w:fldChar w:fldCharType="begin"[^>]*\/>[\s\S]*?<w:fldChar w:fldCharType="end"[^>]*\/>(?:(?!<w:r\b)[\s\S])*?<\/w:r>/g, m => {
      const ins = (m.match(/<w:instrText[^>]*>([\s\S]*?)<\/w:instrText>/g) || []).map(x => x.replace(/<[^>]+>/g, '')).join('');
      const mm = /MERGEFIELD\s+"?([^"\s\\]+)"?/i.exec(ins);
      if (!mm) return m;
      const rpr = (/<w:rPr>[\s\S]*?<\/w:rPr>/.exec(m) || [''])[0];
      return `<w:r>${rpr}<w:t xml:space="preserve">{{${mm[1]}}}</w:t></w:r>`;
    });
    xml = xml.replace(/<w:fldSimple\b[^>]*w:instr="\s*MERGEFIELD\s+&quot;?([^"&\s\\]+)[^"]*"[^>]*>([\s\S]*?)<\/w:fldSimple>/g, (m, n, inner) => {
      const rpr = (/<w:rPr>[\s\S]*?<\/w:rPr>/.exec(inner) || [''])[0];
      return `<w:r>${rpr}<w:t xml:space="preserve">{{${n}}}</w:t></w:r>`;
    });
    return xml;
  }
  // I segnaposto spezzati da Word in più «run» si ricompongono nel primo run del paragrafo
  function unisciRun(xml) {
    return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, p => {
      const testi = []; p.replace(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g, (m, t) => { testi.push(t); });
      const tutto = testi.join('');
      if (!/\{\{|«/.test(tutto) || !/\{\{[\s\S]*?\}\}/.test(tutto)) return p;
      let primo = true;
      return p.replace(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g, () => { if (primo) { primo = false; return `<w:t xml:space="preserve">${tutto}</w:t>`; } return '<w:t></w:t>'; });
    });
  }
  const val = (ctx, path) => {
    if (path === '.') return ctx._this;
    let v = ctx; for (const k of path.split('.')) { if (v == null) return undefined; v = v[k]; }
    if (v === undefined && ctx._unione) v = ctx._unione(path);
    if (v === undefined && ctx._padre) return val(ctx._padre, path);
    return v;
  };
  const figlio = (ctx, item) => (item && typeof item === 'object' ? Object.assign(Object.create(null), item, { _padre: ctx, _this: item }) : { _padre: ctx, _this: item });
  function sezioni(xml, ctx, nodo) {
    // Ripetizioni a livello di riga di tabella o di paragrafo: si espande l'intero nodo che contiene apertura e chiusura
    const reApri = /\{\{([#^])([\w.]+)\}\}/;
    let guard = 0;
    while (guard++ < 500) {
      const m = reApri.exec(xml); if (!m) break;
      const [tag, tipo, nome] = m, chiudi = '{{/' + nome + '}}';
      const iA = m.index, iC = xml.indexOf(chiudi, iA);
      if (iC < 0) { xml = xml.slice(0, iA) + xml.slice(iA + tag.length); continue; }
      // Allarga ai confini del nodo (riga di tabella se apertura e chiusura sono nella stessa riga, altrimenti paragrafi)
      const tr0 = xml.lastIndexOf('<w:tr ', iA) > xml.lastIndexOf('<w:tr>', iA) ? xml.lastIndexOf('<w:tr ', iA) : xml.lastIndexOf('<w:tr>', iA);
      const trEnd0 = xml.indexOf('</w:tr>', iA);
      let a, b;
      if (tr0 >= 0 && trEnd0 > iC && xml.lastIndexOf('</w:tr>', iA) < tr0) { a = tr0; b = trEnd0 + 7; }
      else {
        const p0 = Math.max(xml.lastIndexOf('<w:p>', iA), xml.lastIndexOf('<w:p ', iA));
        const p1 = xml.indexOf('</w:p>', iC);
        const stessoP = p0 >= 0 && xml.indexOf('</w:p>', iA) >= iC;
        if (stessoP) { // dentro lo stesso paragrafo: si ripete solo il testo
          const dentro = xml.slice(iA + tag.length, iC);
          const v = val(ctx, nome);
          const lista = Array.isArray(v) ? v : (tipo === '^' ? (!v || (Array.isArray(v) && !v.length) ? [ctx] : []) : (v ? [v === true ? ctx : v] : []));
          const rep = (tipo === '^' ? lista : lista).map(it => sost(dentro, Array.isArray(v) ? figlio(ctx, it) : ctx)).join('');
          xml = xml.slice(0, iA) + rep + xml.slice(iC + chiudi.length);
          continue;
        }
        a = p0; b = p1 + 6;
      }
      const blocco = xml.slice(a, b);
      // Togli i marcatori dal blocco (se sono in paragrafi propri, quei paragrafi spariscono)
      let interno = blocco.replace(tag, '').replace(chiudi, '');
      interno = interno.replace(/<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g, p => (p.replace(/<[^>]+>/g, '').trim() === '' && /<w:t/.test(p) && !/<w:drawing|<w:tab|<w:br/.test(p) ? '' : p));
      const v = val(ctx, nome);
      let out = '';
      if (tipo === '^') out = (!v || (Array.isArray(v) && !v.length)) ? sezioni(interno, ctx) : '';
      else if (Array.isArray(v)) out = v.map(it => sezioni(interno, figlio(ctx, it))).join('');
      else if (v) out = sezioni(interno, typeof v === 'object' ? figlio(ctx, v) : ctx);
      xml = xml.slice(0, a) + out + xml.slice(b);
    }
    return sost(xml, ctx);
  }
  function sost(xml, ctx) {
    return xml.replace(/\{\{([%]?)([\w.]+)\}\}/g, (m, img, k) => {
      if (img) return m; // le immagini si gestiscono dopo
      const v = val(ctx, k);
      if (v == null) return '';
      return xe(String(v)).replace(/\n/g, '</w:t><w:br/><w:t xml:space="preserve">');
    });
  }

  // buf: ArrayBuffer del .docx; contesti: array di oggetti; immagini: {nome: async ctx => {png, w, h, mm}}
  O.compila = async (buf, contesti, immagini = {}) => {
    const z = await ES.tab.unzipTutto(buf);
    const nomeDoc = 'word/document.xml';
    let doc = new TextDecoder().decode(z[nomeDoc]);
    doc = unisciRun(campiUnione(doc));
    const i0 = doc.indexOf('<w:body>') + 8, sp = doc.lastIndexOf('<w:sectPr'), i1 = sp > i0 ? sp : doc.lastIndexOf('</w:body>');
    const corpo = doc.slice(i0, i1);
    let rels = new TextDecoder().decode(z['word/_rels/document.xml.rels']);
    let ct = new TextDecoder().decode(z['[Content_Types].xml']);
    const extra = {}; let nImg = 0;
    const parti = [];
    for (let i = 0; i < contesti.length; i++) {
      let x = sezioni(corpo, contesti[i]);
      // Immagini {{%nome}}: il paragrafo che le contiene diventa l'immagine
      const imgs = [...x.matchAll(/\{\{%([\w.]+)\}\}/g)];
      for (const m of imgs) {
        const f = immagini[m[1]]; let rep = '';
        if (f) {
          const im = await f(contesti[i]);
          if (im && im.png) {
            nImg++; const id = 'rIdEs' + nImg; extra[`word/media/es${nImg}.png`] = im.png;
            rels = rels.replace('</Relationships>', `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/es${nImg}.png"/></Relationships>`);
            const emuW = Math.round((im.mm || 160) * 36000), emuH = Math.round(emuW * im.h / im.w);
            rep = `</w:t></w:r><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${emuW}" cy="${emuH}"/><wp:docPr id="${9000 + nImg}" name="Planimetria ${nImg}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${9000 + nImg}" name="es${nImg}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emuW}" cy="${emuH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r><w:r><w:t xml:space="preserve">`;
          }
        }
        x = x.replace(m[0], rep);
      }
      parti.push(x);
    }
    if (nImg && !/Extension="png"/i.test(ct)) ct = ct.replace('<Default ', '<Default Extension="png" ContentType="image/png"/><Default ');
    const nuovo = doc.slice(0, i0) + parti.join('<w:p><w:r><w:br w:type="page"/></w:r></w:p>') + doc.slice(i1);
    const files = Object.keys(z).filter(n => !n.endsWith('/')).map(n => ({ name: n, data: n === nomeDoc ? enc(nuovo) : n === 'word/_rels/document.xml.rels' ? enc(rels) : n === '[Content_Types].xml' ? enc(ct) : z[n] }));
    Object.keys(extra).forEach(n => files.push({ name: n, data: extra[n] }));
    return O.zip(files);
  };
  // Campi trovati in un modello (per mostrare all'utente cosa verrà compilato)
  O.campiModello = async buf => {
    const z = await ES.tab.unzipTutto(buf);
    const doc = unisciRun(campiUnione(new TextDecoder().decode(z['word/document.xml'])));
    const t = doc.replace(/<[^>]+>/g, '');
    return [...new Set([...t.matchAll(/\{\{([#^/%]?[\w.]+)\}\}/g)].map(m => m[1]))];
  };

  // ---- Excel ----
  const colL = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  // fogli: [{nome, righe:[[valori]], larghezze:[caratteri]}] — la prima riga è l'intestazione (grassetto, bloccata)
  O.xlsx = fogli => {
    const files = [], sh = [];
    fogli.forEach((f, si) => {
      const rows = f.righe.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
        const ref = colL(ci) + (ri + 1), st = ri === 0 ? ' s="1"' : '';
        if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${st}><v>${v}</v></c>`;
        if (v == null || v === '') return '';
        return `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${xe(v)}</t></is></c>`;
      }).join('')}</row>`).join('');
      const cols = (f.larghezze || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
      files.push({ name: `xl/worksheets/sheet${si + 1}.xml`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols ? '<cols>' + cols + '</cols>' : ''}<sheetData>${rows}</sheetData></worksheet>` });
      sh.push(f.nome.replace(/[\\\/?*\[\]:]/g, ' ').slice(0, 31));
    });
    files.push({ name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sh.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` });
    files.push({ name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' });
    files.push({ name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sh.map((s, i) => `<sheet name="${xe(s)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` });
    files.push({ name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sh.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rIdSt" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` });
    files.push({ name: 'xl/styles.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>' });
    return O.zip(files);
  };
})(ES);
