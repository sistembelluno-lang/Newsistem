// Lettura di tabelle: CSV (separatore ; , o tabulazione) ed Excel .xlsx, senza librerie esterne.
// Il risultato è sempre {fogli:[{nome, righe:[[...celle]]}]}.
(function (ES) {
  'use strict';
  const T = ES.tab = {};

  T.csv = function (testo) {
    const s = String(testo).replace(/^﻿/, '');
    const prima = s.split(/\r?\n/).find(l => l.trim()) || '';
    const cont = c => (prima.match(new RegExp('\\' + c, 'g')) || []).length;
    const sep = ['\t', ';', ','].sort((a, b) => cont(b) - cont(a))[0];
    const righe = []; let riga = [], cella = '', q = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) {
        if (c === '"') { if (s[i + 1] === '"') { cella += '"'; i++; } else q = false; }
        else cella += c;
      } else if (c === '"' && cella === '') q = true;
      else if (c === sep) { riga.push(cella); cella = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; riga.push(cella); righe.push(riga); riga = []; cella = ''; }
      else cella += c;
    }
    if (cella !== '' || riga.length) { riga.push(cella); righe.push(riga); }
    return { fogli: [{ nome: 'CSV', righe: righe.filter(r => r.some(x => String(x).trim())) }] };
  };

  // ---- XLSX: è un archivio ZIP di file XML ----
  async function inflate(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
    return new Uint8Array(await out.arrayBuffer());
  }
  async function unzip(buf) {
    const b = new Uint8Array(buf), v = new DataView(b.buffer, b.byteOffset, b.byteLength), files = {};
    let e = b.length - 22;
    while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('Il file non è un archivio .xlsx valido');
    const n = v.getUint16(e + 10, true); let p = v.getUint32(e + 16, true);
    const dec = new TextDecoder('utf-8');
    for (let i = 0; i < n; i++) {
      if (v.getUint32(p, true) !== 0x02014b50) break;
      const metodo = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true);
      const ln = v.getUint16(p + 28, true), lx = v.getUint16(p + 30, true), lc = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
      const nome = dec.decode(b.subarray(p + 46, p + 46 + ln));
      const start = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true);
      files[nome] = { metodo, dati: b.subarray(start, start + csize) };
      p += 46 + ln + lx + lc;
    }
    return {
      nomi: () => Object.keys(files),
      async byte(nome) { const f = files[nome]; return f.metodo === 8 ? await inflate(f.dati) : f.dati.slice(); },
      async testo(nome) {
        const f = files[nome] || files[Object.keys(files).find(k => k.toLowerCase() === nome.toLowerCase())];
        if (!f) return null;
        const raw = f.metodo === 8 ? await inflate(f.dati) : f.dati;
        return dec.decode(raw);
      }
    };
  }
  const ent = s => s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, x) => ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[x.toLowerCase()] ??
    String.fromCodePoint(x[1] === 'x' || x[1] === 'X' ? parseInt(x.slice(2), 16) : parseInt(x.slice(1), 10))));
  // Excel scrive i caratteri di controllo come «_x000D_» (es. un a capo nell'intestazione «Superficie_x000d_(mq)»)
  const ctrl = s => s.replace(/_x([0-9a-fA-F]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
  const testoNodi = xml => { let s = ''; xml.replace(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, (m, t) => { s += ctrl(ent(t)); }); return s; };
  const colIdx = ref => { const m = /^([A-Z]+)/.exec(ref); let n = 0; for (const c of m[1]) n = n * 26 + c.charCodeAt(0) - 64; return n - 1; };

  // Tutti i file di un archivio: {nome: Uint8Array} (per compilare i modelli Word)
  T.unzipTutto = async function (buf) {
    const z = await unzip(buf), out = {};
    for (const n of z.nomi()) out[n] = await z.byte(n);
    return out;
  };

  T.xlsx = async function (buf) {
    const z = await unzip(buf);
    const ss = [];
    const sst = await z.testo('xl/sharedStrings.xml');
    if (sst) sst.replace(/<si>([\s\S]*?)<\/si>/g, (m, x) => { ss.push(testoNodi(x)); });
    const wb = await z.testo('xl/workbook.xml') || '';
    const rels = await z.testo('xl/_rels/workbook.xml.rels') || '';
    const target = {};
    rels.replace(/<Relationship\b[^>]*>/g, r => { const id = /Id="([^"]+)"/.exec(r), t = /Target="([^"]+)"/.exec(r); if (id && t) target[id[1]] = t[1]; });
    const fogli = [];
    const sheets = []; wb.replace(/<sheet\b[^>]*>/g, s => { const nm = /name="([^"]*)"/.exec(s), rid = /r:id="([^"]+)"/.exec(s); sheets.push({ nome: nm ? ent(nm[1]) : 'Foglio', rid: rid && rid[1] }); });
    if (!sheets.length) sheets.push({ nome: 'Foglio1', path: 'xl/worksheets/sheet1.xml' });
    for (const sh of sheets) {
      let p = sh.path || target[sh.rid] || '';
      p = p.replace(/^\//, ''); if (!p.startsWith('xl/')) p = 'xl/' + p;
      const xml = await z.testo(p); if (!xml) continue;
      const righe = [];
      xml.replace(/<row\b[^>]*>([\s\S]*?)<\/row>/g, (m, rx) => {
        const r = [];
        rx.replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (mm, at, inner) => {
          const ref = /r="([A-Z]+\d+)"/.exec(at), t = (/t="(\w+)"/.exec(at) || [])[1];
          const vv = inner && /<v>([\s\S]*?)<\/v>/.exec(inner);
          let val = '';
          if (t === 's') val = vv ? ss[+vv[1]] ?? '' : '';
          else if (t === 'inlineStr') val = inner ? testoNodi(inner) : '';
          else if (t === 'str' || t === 'e') val = vv ? ent(vv[1]) : '';
          else if (t === 'b') val = vv ? (vv[1] === '1' ? 'VERO' : 'FALSO') : '';
          else val = vv ? +vv[1] : '';
          const i = ref ? colIdx(ref[1]) : r.length;
          while (r.length < i) r.push('');
          r[i] = val;
        });
        righe.push(r);
      });
      fogli.push({ nome: sh.nome, righe: righe.filter(r => r.some(x => String(x).trim())) });
    }
    return { fogli };
  };

  T.leggi = async function (nome, buf) {
    if (/\.xlsx$/i.test(nome)) return T.xlsx(buf);
    if (/\.xls$/i.test(nome)) throw new Error('Il vecchio formato .xls non è supportato: in Excel usa «Salva con nome» → .xlsx oppure CSV');
    let txt;
    try { txt = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { txt = new TextDecoder('windows-1252').decode(buf); }
    return T.csv(txt);
  };

  // Trova la riga di intestazione (la prima con almeno 2 celle riconosciute) e associa le colonne ai campi.
  // campi: {chiave: [sinonimi normalizzati]} — un sinonimo vale se l'intestazione è uguale o inizia con esso;
  // con «~» davanti basta che l'intestazione lo contenga. Vince la prima chiave che corrisponde (mettere prima le più specifiche).
  T.mappa = function (righe, campi) {
    let best = { riga: 0, map: {}, n: 0 };
    for (let i = 0; i < Math.min(righe.length, 15); i++) {
      const map = {}; let n = 0;
      righe[i].forEach((h, j) => {
        const nh = ES.U.norm(h); if (!nh) return;
        for (const k in campi) {
          if (map[k] != null) continue;
          if (campi[k].some(s => s[0] === '~' ? nh.includes(s.slice(1)) : nh === s || nh.startsWith(s + ' ') || (s.length > 3 && nh.startsWith(s)))) { map[k] = j; n++; break; }
        }
      });
      if (n > best.n) best = { riga: i, map, n };
    }
    return best;
  };
})(ES);
