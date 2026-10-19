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
    const id = ctx.img(b.png), wmm = Math.min(b.mm || 170, ctx.tw ? ctx.tw / 56.7 : 170), emuW = Math.round(wmm * 36000), emuH = Math.round(emuW * (b.h / b.w));
    const n = ctx.nImg = (ctx.nImg || 0) + 1;
    return `<w:p><w:pPr><w:jc w:val="${b.align || 'center'}"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${emuW}" cy="${emuH}"/><wp:docPr id="${n}" name="Immagine ${n}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="img${n}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emuW}" cy="${emuH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  }
  function tabXml(b, ctx) {
    const cols = b.cols || b.rows[0].cells.map(() => 100 / b.rows[0].cells.length), tot = cols.reduce((s, x) => s + x, 0);
    const TWc = ctx.tw || TW, tw = cols.map(c => Math.round(TWc * c / tot)), size = b.size || Math.max(14, (ctx.size || 21) - 4);
    const bd = b.border === false ? '' : '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`).join('') + '</w:tblBorders>';
    let x = `<w:tbl><w:tblPr><w:tblW w:w="${TWc}" w:type="dxa"/>${bd}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="57" w:type="dxa"/><w:right w:w="57" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${tw.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
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
    // larghezza utile della pagina: quella della carta intestata, se c'è (pagina meno i margini)
    const twCarta = (() => { const c = opt.carta && opt.carta.sect; if (!c) return 0; const w = /<w:pgSz[^>]*w:w="(\d+)"/.exec(c), l = /<w:pgMar[^>]*w:left="(\d+)"/.exec(c), r = /<w:pgMar[^>]*w:right="(\d+)"/.exec(c); return w && l && r ? +w[1] - +l[1] - +r[1] : 0; })();
    const media = [], ctx = { font: opt.font || 'Arial', size: opt.size || 21, tw: twCarta > 3000 ? twCarta : 0, img: png => { media.push(png); return 'rIdImg' + media.length; } };
    const body = blocchi.map(b => blocco(b, ctx)).join('');
    const carta = opt.carta && opt.carta.sect ? opt.carta : null;
    const hdr = !carta && opt.intestazione && opt.intestazione.length;
    const ftr = !carta && !!opt.piede;
    const sect = carta ? carta.sect : `<w:sectPr>${hdr ? '<w:headerReference w:type="default" r:id="rIdH"/>' : ''}${ftr ? '<w:footerReference w:type="default" r:id="rIdF"/>' : ''}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>`;
    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}${sect}</w:body></w:document>`;
    const rels = ['<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>']
      .concat(media.map((m, i) => `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/img${i + 1}.png"/>`))
      .concat(hdr ? ['<Relationship Id="rIdH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>'] : [])
      .concat(ftr ? ['<Relationship Id="rIdF" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'] : [])
      .concat(carta ? carta.rels : []);
    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>${carta ? '<Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Default Extension="bmp" ContentType="image/bmp"/><Default Extension="emf" ContentType="image/x-emf"/><Default Extension="wmf" ContentType="image/x-wmf"/><Default Extension="tif" ContentType="image/tiff"/><Default Extension="svg" ContentType="image/svg+xml"/>' + carta.ct.join('') : ''}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>${hdr ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : ''}${ftr ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : ''}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
      { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xe(opt.titolo || '')}</dc:title><dc:creator>ESPROPRI_SISTEM</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>` },
      { name: 'word/_rels/document.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>` },
      { name: 'word/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${ctx.font}" w:hAnsi="${ctx.font}" w:cs="${ctx.font}" w:eastAsia="${ctx.font}"/><w:sz w:val="${ctx.size}"/><w:szCs w:val="${ctx.size}"/><w:lang w:val="it-IT"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>` },
      { name: 'word/document.xml', data: doc }
    ];
    if (hdr) files.push({ name: 'word/header1.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${NS}>${opt.intestazione.map((r, i) => parXml({ runs: [{ text: r, b: i === 0 }], align: 'center', after: 0, size: i === 0 ? ctx.size + 3 : ctx.size - 3 }, ctx)).join('')}</w:hdr>` });
    if (ftr) files.push({ name: 'word/footer1.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}>${parXml({ runs: [{ text: opt.piede }], align: 'center', size: 15, after: 0 }, ctx)}</w:ftr>` });
    media.forEach((m, i) => files.push({ name: `word/media/img${i + 1}.png`, data: m }));
    if (carta) carta.parti.forEach(q => files.push(q));
    return O.zip(files);
  };

  // ---- Carta intestata dell'ente: «taglio alto» (intestazione) e «taglio basso» (piè di pagina) ----
  // Si scrivono nel programma come HTML modificabile (testi, loghi, tabelle); un .docx dell'ente può fare da punto di partenza.

  // Word .docx → {testa, piede} in HTML modificabile (paragrafi con grassetto, corsivo, dimensioni, colori, immagini, tabelle)
  O.cartaDaDocx = async buf => {
    const z = await ES.tab.unzipTutto(buf), td = new TextDecoder();
    const doc = z['word/document.xml'] ? td.decode(z['word/document.xml']) : '';
    if (!doc) throw new Error('il file non è un documento Word .docx');
    const relsDoc = z['word/_rels/document.xml.rels'] ? td.decode(z['word/_rels/document.xml.rels']) : '';
    const rel = (rels, id) => { const t = new RegExp('<Relationship\\b[^>]*Id="' + id + '"[^>]*>').exec(rels); const g = t && /Target="([^"]+)"/.exec(t[0]); return g ? g[1] : null; };
    const sp = doc.lastIndexOf('<w:sectPr'), sect = sp >= 0 ? doc.slice(sp, doc.indexOf('</w:sectPr>', sp) + 11) : '';
    const mime = f => (/\.png$/i.test(f) ? 'image/png' : /\.jpe?g$/i.test(f) ? 'image/jpeg' : /\.gif$/i.test(f) ? 'image/gif' : /\.bmp$/i.test(f) ? 'image/bmp' : null);
    const b64 = u8 => { let s2 = ''; for (let i = 0; i < u8.length; i += 0x8000) s2 += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s2); };
    const dex = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    const he = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const parte = (nome, rels) => {
      const xml = td.decode(z[nome]);
      const par = p => {
        const al = /<w:jc w:val="(\w+)"/.exec(p), a = al ? ({ both: 'justify', center: 'center', right: 'right', end: 'right' }[al[1]] || 'left') : 'left';
        let h = '';
        for (const r of p.match(/<w:r[ >][\s\S]*?<\/w:r>/g) || []) {
          const pr = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(r), rp = pr ? pr[1] : '';
          for (const e of r.matchAll(/r:embed="([^"]+)"/g)) {
            const tg = rel(rels, e[1]), f = tg && z['word/' + tg.replace(/^\/?word\//, '')], mt = tg && mime(tg);
            const ext = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(r), w = ext ? Math.round(+ext[1] / 9525) : 120, hh = ext ? Math.round(+ext[2] / 9525) : 60;
            if (f && mt) h += `<img src="data:${mt};base64,${b64(f)}" width="${w}" height="${hh}">`;
          }
          let t = '';
          for (const m of r.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:(tab|br|cr)\b[^>]*\/>/g)) t += m[1] != null ? he(dex(m[1])) : m[2] === 'tab' ? ' &nbsp; ' : '<br>';
          if (!t) continue;
          const st = [];
          if (/<w:b(?: w:val="(?:1|true|on)")?\/>/.test(rp)) st.push('font-weight:bold');
          if (/<w:i(?: w:val="(?:1|true|on)")?\/>/.test(rp)) st.push('font-style:italic');
          if (/<w:u w:val="(?!none)/.test(rp)) st.push('text-decoration:underline');
          const sz = /<w:sz w:val="(\d+)"/.exec(rp); if (sz) st.push('font-size:' + (+sz[1] / 2) + 'pt');
          const co = /<w:color w:val="([0-9A-Fa-f]{6})"/.exec(rp); if (co && co[1] !== '000000') st.push('color:#' + co[1]);
          h += st.length ? `<span style="${st.join(';')}">${t}</span>` : t;
        }
        return `<div style="text-align:${a}">${h || '<br>'}</div>`;
      };
      const tab = t => {
        const righe = t.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || [];
        const grid = [...t.matchAll(/<w:gridCol w:w="(\d+)"/g)].map(m => +m[1]), tot = grid.reduce((a, b) => a + b, 0);
        return `<table style="width:100%;border-collapse:collapse">${righe.map(r => `<tr>${(r.match(/<w:tc[ >][\s\S]*?<\/w:tc>/g) || []).map((c, i) => `<td style="vertical-align:middle${tot && grid[i] ? ';width:' + Math.round(grid[i] / tot * 100) + '%' : ''}">${(c.match(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g) || []).map(par).join('')}</td>`).join('')}</tr>`).join('')}</table>`;
      };
      let h = '';
      for (const m of xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g)) h += m[0].startsWith('<w:tbl') ? tab(m[0]) : par(m[0]);
      return h.replace(/(<div style="text-align:left"><br><\/div>)+$/, '');
    };
    const out = { testa: '', piede: '' };
    for (const m of sect.matchAll(/<w:(header|footer)Reference\b[^>]*\/>/g)) {
      const id = /r:id="([^"]+)"/.exec(m[0]), tipo = /w:type="(\w+)"/.exec(m[0]);
      if (tipo && tipo[1] !== 'default' && out[m[1] === 'header' ? 'testa' : 'piede']) continue;
      const tg = id && rel(relsDoc, id[1]); if (!tg) continue;
      const nome = 'word/' + tg.replace(/^\/?word\//, ''); if (!z[nome]) continue;
      const nr = 'word/_rels/' + nome.split('/').pop() + '.rels';
      out[m[1] === 'header' ? 'testa' : 'piede'] = parte(nome, z[nr] ? td.decode(z[nr]) : '');
    }
    if (!out.testa && !out.piede) throw new Error('nel documento non ci sono intestazione né piè di pagina');
    return out;
  };

  // {testa, piede} HTML → parti Word (intestazione, piè di pagina, immagini, impostazioni di sezione) per O.docx
  // opt: {font, size (mezzi punti), margini mm {alto, basso, sx, dx}}
  O.cartaDaHtml = (testa, piede, opt = {}) => {
    const font = opt.font || 'Arial', mg = Object.assign({ alto: 20, basso: 20, sx: 20, dx: 20 }, opt.margini || {});
    const mm = v => Math.round(v * 56.7), TW = 11906 - mm(mg.sx) - mm(mg.dx);
    const parti = [], rels = [], ct = [];
    const DIM = { 1: 7.5, 2: 10, 3: 12, 4: 13.5, 5: 18, 6: 24, 7: 36 };
    const colore = v => { if (!v) return null; v = v.trim(); let m = /^#([0-9a-f]{6})$/i.exec(v); if (m) return m[1].toUpperCase(); m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v); if (m) return (m[1] + m[1] + m[2] + m[2] + m[3] + m[3]).toUpperCase(); m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v); return m ? [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, '0')).join('').toUpperCase() : null; };
    const pt = v => { const m = /([\d.]+)\s*(pt|px|em|rem)?/.exec(v || ''); if (!m) return null; const n = +m[1]; return m[2] === 'px' ? n * 0.75 : m[2] === 'em' || m[2] === 'rem' ? n * 11 : n; };
    const costruisci = (html, tipo, n) => {
      const media = [];
      const dom = new DOMParser().parseFromString('<!doctype html><body>' + (html || '') + '</body>', 'text/html');
      const stile = (el, s) => {
        const t = el.tagName, cs = el.style || {}, x = { ...s };
        if (t === 'B' || t === 'STRONG' || /bold|[6-9]00/.test(cs.fontWeight || '')) x.b = true;
        if (/^(normal|[1-4]00)$/.test(cs.fontWeight || '')) x.b = false;
        if (t === 'I' || t === 'EM' || cs.fontStyle === 'italic') x.i = true;
        if (t === 'U' || /underline/.test(cs.textDecoration || cs.textDecorationLine || '')) x.u = true;
        if (/^H[1-3]$/.test(t)) { x.b = true; x.sz = { H1: 16, H2: 14, H3: 12 }[t]; }
        if (t === 'FONT') { if (el.getAttribute('size')) x.sz = DIM[el.getAttribute('size')] || x.sz; if (el.getAttribute('color')) x.co = colore(el.getAttribute('color')) || x.co; if (el.getAttribute('face')) x.f = el.getAttribute('face').split(',')[0].replace(/['"]/g, '').trim(); }
        if (cs.fontSize) x.sz = pt(cs.fontSize) || x.sz;
        if (cs.color) x.co = colore(cs.color) || x.co;
        if (cs.fontFamily) x.f = cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
        return x;
      };
      const allinea = el => { const a = (el.style && el.style.textAlign) || el.getAttribute('align') || (el.tagName === 'CENTER' ? 'center' : ''); return { center: 'center', right: 'right', justify: 'both', left: 'left', start: 'left', end: 'right' }[a] || null; };
      const run = (t, s) => `<w:r><w:rPr><w:rFonts w:ascii="${xe(s.f || font)}" w:hAnsi="${xe(s.f || font)}" w:cs="${xe(s.f || font)}"/>${s.b ? '<w:b/>' : ''}${s.i ? '<w:i/>' : ''}${s.u ? '<w:u w:val="single"/>' : ''}${s.co ? `<w:color w:val="${s.co}"/>` : ''}<w:sz w:val="${Math.round((s.sz || 9) * 2)}"/><w:szCs w:val="${Math.round((s.sz || 9) * 2)}"/></w:rPr><w:t xml:space="preserve">${xe(t)}</w:t></w:r>`;
      const img = el => {
        const m = /^data:(image\/(png|jpe?g|gif|bmp));base64,(.*)$/i.exec(el.getAttribute('src') || ''); if (!m) return '';
        const bin = atob(m[3]), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const ext = m[2].toLowerCase().replace('jpeg', 'jpg');
        const w = +el.getAttribute('width') || pt(el.style.width) / 0.75 || 120, h = +el.getAttribute('height') || pt(el.style.height) / 0.75 || (el.dataset && +el.dataset.r ? w * +el.dataset.r : w / 2);
        media.push({ u8, ext }); const k = media.length, id = 'rIdM' + k, did = 7000 + n * 100 + k;
        const cx = Math.round(w * 9525), cy = Math.round(h * 9525);
        return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${did}" name="Logo ${did}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${did}" name="logo${k}.${ext}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
      };
      const BLK = /^(P|DIV|H[1-6]|LI|UL|OL|BLOCKQUOTE|SECTION|HEADER|FOOTER|CENTER|ARTICLE)$/;
      const BR = '<w:r><w:br/></w:r>';
      // Contenuto di un contenitore (corpo, cella) → paragrafi e tabelle Word
      const blocchi = (root, s0, larg) => {
        const out = []; let runs = [], al = null;
        const par = (R, a) => `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/>${a ? `<w:jc w:val="${a}"/>` : ''}<w:rPr><w:sz w:val="${Math.round((s0.sz || 9) * 2)}"/></w:rPr></w:pPr>${R.join('')}</w:p>`;
        const flush = () => { while (runs.length && runs[runs.length - 1] === BR) runs.pop(); if (runs.length) out.push(par(runs, al)); runs = []; };
        const metti = (x, a) => { if (!runs.length) al = a; runs.push(x); };
        const walk = (node, s, a) => {
          for (const c of node.childNodes) {
            if (c.nodeType === 3) { let t = c.nodeValue.replace(/[\s ]+/g, m => (/ /.test(m) ? ' '.repeat(m.length) : ' ')); if (!runs.length) t = t.replace(/^ +/, ''); if (t) metti(run(t, s), a); continue; }
            if (c.nodeType !== 1) continue;
            const tg = c.tagName;
            if (/^(STYLE|SCRIPT|META|TITLE|HEAD|LINK|O:P|XML)$/.test(tg)) continue;
            if (tg === 'BR') { metti(BR, a); continue; }
            if (tg === 'IMG') { const x = img(c); if (x) metti(x, a); continue; }
            if (tg === 'HR') { flush(); out.push(`<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="808080"/></w:pBdr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>`); continue; }
            if (tg === 'TABLE') { flush(); out.push(tabella(c, s, larg)); continue; }
            const s2 = stile(c, s), a2 = allinea(c) || a;
            if (BLK.test(tg)) {
              flush();
              if (!c.textContent.trim() && !c.querySelector('img,table')) { out.push(par([], a2)); continue; }
              walk(c, s2, a2); flush();
            } else walk(c, s2, a);
          }
        };
        walk(root, s0, null); flush();
        return out;
      };
      const tabella = (t, s, larg) => {
        const righe = [...t.querySelectorAll('tr')].filter(r => r.closest('table') === t);
        const nc = Math.max(1, ...righe.map(r => [...r.children].filter(c => /^T[DH]$/.test(c.tagName)).reduce((a, c) => a + (+c.getAttribute('colspan') || 1), 0)));
        const r0 = righe[0] ? [...righe[0].children].filter(c => /^T[DH]$/.test(c.tagName)) : [];
        let pc = r0.length === nc ? r0.map(c => { const w = (c.style && c.style.width) || c.getAttribute('width') || ''; return /%/.test(w) ? parseFloat(w) : 0; }) : [];
        if (!pc.length || pc.some(x => !x)) { const fiss = pc.reduce((a, b) => a + (b || 0), 0), liberi = pc.length ? pc.filter(x => !x).length : nc; pc = (pc.length ? pc : Array(nc).fill(0)).map(x => x || Math.max(5, (100 - fiss) / liberi)); }
        const tot = pc.reduce((a, b) => a + b, 0), cols = pc.map(x => Math.round(larg * x / tot));
        const bordi = /solid|\d+px/.test(t.getAttribute('style') || '') && !/border\s*:\s*(0|none)/.test(t.getAttribute('style') || '') || +t.getAttribute('border') > 0;
        const b = v => ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(x => `<w:${x} w:val="${v ? 'single' : 'nil'}" w:sz="4" w:space="0" w:color="808080"/>`).join('');
        return `<w:tbl><w:tblPr><w:tblW w:w="${larg}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${b(bordi)}</w:tblBorders><w:tblCellMar><w:left w:w="57" w:type="dxa"/><w:right w:w="57" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${cols.map(c => `<w:gridCol w:w="${c}"/>`).join('')}</w:tblGrid>${righe.map(r => {
          let i = 0;
          return `<w:tr>${[...r.children].filter(c => /^T[DH]$/.test(c.tagName)).map(c => {
            const span = Math.min(+c.getAttribute('colspan') || 1, nc - i), w = cols.slice(i, i + span).reduce((a, x) => a + x, 0); i += span;
            const va = (c.style && c.style.verticalAlign) || c.getAttribute('valign') || 'middle';
            const dentro = blocchi(c, stile(c, s), w - 114);
            return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}<w:vAlign w:val="${va === 'top' ? 'top' : va === 'bottom' ? 'bottom' : 'center'}"/></w:tcPr>${dentro.length && !dentro[dentro.length - 1].startsWith('<w:tbl') ? dentro.join('') : dentro.join('') + '<w:p/>'}</w:tc>`;
          }).join('')}</w:tr>`;
        }).join('')}</w:tbl>`;
      };
      const corpo = blocchi(dom.body, { sz: 9 }, TW);
      if (!corpo.length || corpo[corpo.length - 1].startsWith('<w:tbl')) corpo.push('<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>');
      const tag = tipo === 'header' ? 'hdr' : 'ftr', nome = 'carta' + (tipo === 'header' ? 'Testa' : 'Piede') + '.xml';
      const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:${tag} xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">${corpo.join('')}</w:${tag}>`;
      parti.push({ name: 'word/' + nome, data: new TextEncoder().encode(xml) });
      if (media.length) {
        media.forEach((m, i) => parti.push({ name: `word/media/carta${n}_${i + 1}.${m.ext}`, data: m.u8 }));
        parti.push({ name: `word/_rels/${nome}.rels`, data: new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${media.map((m, i) => `<Relationship Id="rIdM${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/carta${n}_${i + 1}.${m.ext}"/>`).join('')}</Relationships>`) });
      }
      rels.push(`<Relationship Id="rIdCarta${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${tipo}" Target="${nome}"/>`);
      ct.push(`<Override PartName="/word/${nome}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${tipo}+xml"/>`);
      return `<w:${tipo}Reference w:type="default" r:id="rIdCarta${n}"/>`;
    };
    const vuoto = h => !String(h || '').replace(/<(?!img|table)[^>]*>|&nbsp;|\s/gi, '');
    let refs = '';
    if (!vuoto(testa)) refs += costruisci(testa, 'header', 1);
    if (!vuoto(piede)) refs += costruisci(piede, 'footer', 2);
    if (!refs) return null;
    const sect = `<w:sectPr>${refs}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${mm(mg.alto)}" w:right="${mm(mg.dx)}" w:bottom="${mm(mg.basso)}" w:left="${mm(mg.sx)}" w:header="425" w:footer="425" w:gutter="0"/></w:sectPr>`;
    return { parti, rels, ct, sect, html: { testa: vuoto(testa) ? '' : testa, piede: vuoto(piede) ? '' : piede } };
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
          // una o più immagini (es. estratti di mappa caricati per la ditta)
          for (const im of [].concat(await f(contesti[i]) || [])) if (im && im.png) {
            nImg++; const id = 'rIdEs' + nImg; extra[`word/media/es${nImg}.png`] = im.png;
            rels = rels.replace('</Relationships>', `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/es${nImg}.png"/></Relationships>`);
            const emuW = Math.round((im.mm || 160) * 36000), emuH = Math.round(emuW * im.h / im.w);
            rep += `</w:t></w:r><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${emuW}" cy="${emuH}"/><wp:docPr id="${9000 + nImg}" name="Planimetria ${nImg}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${9000 + nImg}" name="es${nImg}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emuW}" cy="${emuH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r><w:r><w:t xml:space="preserve">`;
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
