// ESPROPRI_SISTEM · funzioni di base comuni a tutti i moduli (numeri, date, testo, importi in lettere).
// Ogni modulo aggiunge le sue funzioni all'oggetto globale ES; in Node (test) ES sta su globalThis.
var ES = (typeof globalThis !== 'undefined' ? globalThis : window).ES = (typeof globalThis !== 'undefined' ? globalThis : window).ES || {};
(function (ES) {
  'use strict';
  const U = ES.U = {};

  U.id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  U.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  // Numeri scritti all'italiana o all'inglese: «1.234,56», «1234.56», «1 234», «12,5 mq»
  U.num = v => {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    let s = String(v ?? '').trim().replace(/[€\s]|mq|m²|m2|ha/gi, '');
    if (!s) return 0;
    if (/,/.test(s) && /\./.test(s)) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (/,/.test(s)) s = s.replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  };
  U.r2 = n => Math.round((+n || 0) * 100) / 100;
  U.fmt = (n, d = 2) => (+n || 0).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
  U.mq = n => (+n || 0).toLocaleString('it-IT', { maximumFractionDigits: 0 });
  U.eur = n => (+n || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
  // Superficie catastale in ettari, are e centiare: 12345 mq → «1.23.45»
  U.haAreCa = mq => { mq = Math.round(+mq || 0); const ha = Math.floor(mq / 10000), a = Math.floor(mq % 10000 / 100), ca = mq % 100; return ha + '.' + String(a).padStart(2, '0') + '.' + String(ca).padStart(2, '0'); };
  U.fromHaAreCa = (ha, a, ca) => U.num(ha) * 10000 + U.num(a) * 100 + U.num(ca);

  // Date in formato 'AAAA-MM-GG' (come <input type=date>)
  const pad = n => String(n).padStart(2, '0');
  U.ds = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  U.oggi = () => U.ds(new Date());
  U.d = s => { if (!s) return null; const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(s); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null; };
  U.dataIt = s => { const d = U.d(s); return d ? pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() : ''; };
  U.dataLunga = s => { const d = U.d(s); return d ? d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : ''; };
  // Data da testo italiano «15/10/2026», da numero seriale Excel o da ISO
  U.parseData = v => {
    if (v == null || v === '') return '';
    if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + v * 864e5); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
    const s = String(v).trim(); let m;
    if ((m = /^(\d{4})-(\d\d)-(\d\d)/.exec(s))) return m[1] + '-' + m[2] + '-' + m[3];
    if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(s))) { const y = m[3].length === 2 ? '19' + m[3] : m[3]; return y + '-' + pad(m[2]) + '-' + pad(m[1]); }
    return '';
  };
  U.addGiorni = (s, n) => { const d = U.d(s); if (!d) return ''; d.setDate(d.getDate() + n); return U.ds(d); };
  // Mesi e anni: il 31 gennaio + 1 mese è il 28/29 febbraio, non il 3 marzo
  U.addMesi = (s, n) => { const d = U.d(s); if (!d) return ''; const g = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(g, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return U.ds(d); };
  U.addAnni = (s, n) => U.addMesi(s, 12 * n);
  U.giorniTra = (a, b) => { const x = U.d(a), y = U.d(b); return x && y ? Math.round((y - x) / 864e5) : null; };

  // Quote di possesso: «1/2», «500/1000», «per 1/3», «100%»; testo vuoto = intero
  U.quota = q => {
    const s = String(q ?? '').trim(); if (!s) return 1;
    let m = /(\d+)\s*\/\s*(\d+)/.exec(s); if (m && +m[2]) return +m[1] / +m[2];
    m = /(\d+(?:[.,]\d+)?)\s*%/.exec(s); if (m) return U.num(m[1]) / 100;
    return 1;
  };

  // Importo in lettere per gli atti: 1230,45 → «milleduecentotrenta/45»
  const UN = ['', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove'];
  const DE = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'];
  function sotto1000(n) {
    let s = '';
    const c = Math.floor(n / 100), r = n % 100;
    // «centottanta», «centotto»: cento perde la o davanti a otto/ottanta
    if (c) s += (c > 1 ? UN[c] : '') + (r === 8 || (r >= 80 && r < 90) ? 'cent' : 'cento');
    if (r < 20) s += UN[r];
    else { let d = DE[Math.floor(r / 10)]; const u = r % 10; if (u === 1 || u === 8) d = d.slice(0, -1); s += d + UN[u]; }
    return s;
  }
  U.lettere = n => {
    n = Math.floor(Math.abs(+n || 0));
    if (n === 0) return 'zero';
    const gr = [['', ''], ['mille', 'mila'], ['unmilione', 'milioni'], ['unmiliardo', 'miliardi']];
    let s = '', i = 0;
    while (n > 0) {
      const k = n % 1000;
      if (k) s = (k === 1 && i > 0 ? gr[i][0] : sotto1000(k) + gr[i][1]) + s;
      n = Math.floor(n / 1000); i++;
    }
    return s;
  };
  U.euroLettere = v => { const c = Math.round((+v || 0) * 100); return U.lettere(Math.floor(c / 100)) + '/' + String(c % 100).padStart(2, '0'); };

  // Ordinamento naturale (foglio 2 prima di 10, mappale 9 prima di 100/a)
  U.cmp = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'it', { numeric: true, sensitivity: 'base' });
  U.clone = o => JSON.parse(JSON.stringify(o));
})(ES);
if (typeof module !== 'undefined') module.exports = ES;
