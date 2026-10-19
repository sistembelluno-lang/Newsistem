// ESPROPRI_SISTEM · MOTHER FILE SYSTEM: un Excel con tutti i dati della pratica (ente, atti, ditte, intestatari,
// particelle con superfici di progetto, iter) da esportare, correggere in Excel e reimportare.
// Ogni riga ha il suo codice (ID) e l'ordine è quello del programma: all'importazione si controllano formato, pratica,
// fogli, intestazioni, numero e ordine delle righe e i valori. Se qualcosa non torna il file si rifiuta per intero;
// altrimenti si restituisce l'elenco delle modifiche, che si applicano solo dopo la conferma dell'operatore.
(function (ES) {
  'use strict';
  const U = ES.U, MF = ES.mother = {};
  MF.FORMATO = 'ESPROPRI_SISTEM · MOTHER FILE SYSTEM';
  MF.VERSIONE = 'MFS-1';
  const TIPI = ['espr', 'servop', 'serv', 'occ'];
  const NOMI_T = { espr: 'ESPROPRIO MQ', servop: 'SERVITU OPERE MQ', serv: 'SERVITU FASCIA MQ', occ: 'OCCUPAZIONE MQ' };

  // ---- valori: dal programma alla cella e dalla cella al programma ----
  const vuoto = v => v == null || String(v).trim() === '';
  const dataCella = s => (s ? U.dataIt(s) : '');
  // data dalla cella: testo gg/mm/aaaa (o aaaa-mm-gg) oppure numero di serie di Excel
  const leggiData = v => {
    if (vuoto(v)) return { v: '' };
    if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return { v: d.toISOString().slice(0, 10) }; }
    const s = String(v).trim(); let m;
    if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(s))) { const d = +m[1], mo = +m[2], y = +m[3]; if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return { v: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` }; }
    if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return { v: m[0].slice(0, 10) };
    return { err: 'data non valida (scrivi gg/mm/aaaa)' };
  };
  const leggiNum = v => {
    if (vuoto(v)) return { v: '' };
    if (typeof v === 'number') return { v };
    const s = String(v).trim().replace(/\s|€/g, '');
    if (!/^-?[\d.,]+$/.test(s)) return { err: 'numero non valido' };
    return { v: U.num(s) };
  };
  const leggiSi = v => { if (vuoto(v)) return { v: false }; const s = U.norm(v); if (/^(si|s|x|vero|true|1)$/.test(s)) return { v: true }; if (/^(no|n|falso|false|0)$/.test(s)) return { v: false }; return { err: 'scrivi SI o NO' }; };
  const leggiLista = L => v => { const s = vuoto(v) ? '' : String(v).trim(); const k = L.find(x => x.toLowerCase() === s.toLowerCase()); return k != null ? { v: k } : { err: 'valore ammesso: ' + L.filter(Boolean).join(', ') + (L.includes('') ? ' (o vuoto)' : '') }; };
  const leggiTesto = v => ({ v: vuoto(v) ? '' : (typeof v === 'number' ? String(v) : String(v).trim()) });
  const PARSER = { txt: leggiTesto, num: leggiNum, data: leggiData, si: leggiSi };
  const uguali = (a, b, tipo) => tipo === 'num' ? (vuoto(a) && vuoto(b)) || (!vuoto(a) && !vuoto(b) && Math.abs(U.num(a) - U.num(b)) < 0.005) : tipo === 'si' ? !!a === !!b : String(a ?? '') === String(b ?? '');
  const mostra = (v, tipo) => tipo === 'si' ? (v ? 'SI' : 'NO') : tipo === 'data' ? dataCella(v) : vuoto(v) ? '—' : String(v);

  const percorso = (o, k) => k.split('.').reduce((x, q) => (x == null ? x : x[q]), o);
  const imposta = (o, k, v) => { const q = k.split('.'); let x = o; q.slice(0, -1).forEach(s => { x = x[s] = x[s] && typeof x[s] === 'object' ? x[s] : {}; }); x[q[q.length - 1]] = v; };

  // ---- struttura del file ----
  // colonna: {t: intestazione, get(riga, ctx), set(riga, v, ctx) (assente = sola lettura), tipo, lista, w}
  const C = (t, get, set, tipo = 'txt', w = 14, extra = {}) => ({ t, get, set, tipo, w, ...extra });
  const RO = (t, get, tipo = 'txt', w = 14) => ({ t, get, tipo, w, ro: true });

  const campiPratica = p => {
    const L = [['nome', 'Oggetto dei lavori'], ['cup', 'CUP'], ['codice', 'Codice / commessa'], ['descrizione', 'Descrizione dell\'opera'], ['urgenza', 'Ragioni di urgenza'],
      ['ente.nome', 'Ente / Autorità espropriante'], ['ente.comune', 'Comune'], ['ente.provincia', 'Provincia'], ['ente.luogo', 'Luogo per la data degli atti'], ['ente.indirizzo', 'Indirizzo dell\'ente'], ['ente.cf', 'C.F. / P.IVA dell\'ente'],
      ['ente.pec', 'PEC dell\'ente'], ['ente.email', 'E-mail'], ['ente.telefono', 'Telefono'], ['ente.ufficio', 'Ufficio'], ['ente.responsabile', 'Firmatario'], ['ente.ruolo', 'Qualifica del firmatario'],
      ['ente.rup', 'Responsabile del procedimento (RUP)'], ['ente.tecnico', 'Tecnico incaricato'], ['ente.studio', 'Studio incaricato'], ['ente.sedeStudio', 'Sede dello studio'],
      ['ente.beneficiario', 'Beneficiario dell\'esproprio'], ['ente.cfBeneficiario', 'C.F. beneficiario'], ['ente.sedeBeneficiario', 'Sede beneficiario'], ['ente.tribunale', 'Tribunale civile di'], ['ente.tar', 'T.A.R.'], ['ente.bur', 'Bollettino per gli estratti'], ['ente.link', 'Link alla documentazione progettuale']];
    (ES.modelli.DATI || []).forEach(c => L.push(['dati.' + c.k, c.nome]));
    (p.campi || []).forEach(c => L.push(['dati.' + c.k, c.nome]));
    return L.map(([k, nome]) => ({ id: k, k, nome }));
  };

  MF.struttura = p => {
    const calc = ES.stima.calcola(p), proc = Object.keys(ES.stima.PROCEDURE);
    const dittaN = id => { const d = p.ditte.find(x => x.id === id); return d ? d.n : ''; };
    const intest = []; p.ditte.forEach(d => (d.intest || []).forEach(o => intest.push({ id: o.id, o, d })));
    const iter = []; p.ditte.forEach(d => ES.iter.passi(d.procedura || p.impost.procedura).forEach(ps => iter.push({ id: d.id + '|' + ps.k, d, ps })));
    const ev = (r, f) => ((r.d.ev || {})[r.ps.k] || {})[f] || '';
    const setEv = f => (r, v) => { r.d.ev = r.d.ev || {}; const e = r.d.ev[r.ps.k] = r.d.ev[r.ps.k] || {}; if (v === '' || v == null) delete e[f]; else e[f] = v; if (!Object.keys(e).length) delete r.d.ev[r.ps.k]; };
    const aree = x => (calc.perP.get(x.id) || { aree: {} }).aree;
    return [
      { nome: 'PRATICA', id: 'CAMPO', righe: campiPratica(p), cols: [
        RO('DESCRIZIONE', r => r.nome, 'txt', 40),
        C('VALORE', r => percorso(p, r.k) || '', (r, v) => imposta(p, r.k, v), 'txt', 70)] },
      { nome: 'ATTI', id: 'FASE', righe: ES.iter.FASI.map(f => ({ id: f.k, f })), cols: [
        RO('ATTO', r => r.f.nome, 'txt', 40), RO('ARTICOLO', r => r.f.art, 'txt', 14),
        C('DATA', r => (p.iter[r.f.k] || {}).data || '', (r, v) => { const x = p.iter[r.f.k] = p.iter[r.f.k] || {}; x.data = v; }, 'data', 13),
        C('ESTREMI', r => (p.iter[r.f.k] || {}).estremi || '', (r, v) => { const x = p.iter[r.f.k] = p.iter[r.f.k] || {}; x.estremi = v; }, 'txt', 40)] },
      { nome: 'DITTE', id: 'ID_DITTA', righe: p.ditte.map(d => ({ id: d.id, d })), cols: [
        C('N. DITTA', r => r.d.n, (r, v) => { r.d.n = v; }, 'txt', 9),
        C('PERCORSO (codice)', r => r.d.procedura || '', (r, v) => { r.d.procedura = v; }, 'lista', 16, { lista: [''].concat(proc) }),
        C('CESSIONE VOLONTARIA', r => !!r.d.cessione, (r, v) => { r.d.cessione = v; }, 'si', 12),
        C('CONDUTTORE DEL FONDO', r => (r.d.cond || {}).nome || '', (r, v) => { r.d.cond = r.d.cond || {}; r.d.cond.nome = v; }, 'txt', 24),
        C('OSSERVAZIONI', r => r.d.oss || '', (r, v) => { r.d.oss = v; }, 'txt', 30),
        C('NOTE', r => r.d.note || '', (r, v) => { r.d.note = v; }, 'txt', 40),
        RO('INTESTATARI', r => (r.d.intest || []).map(o => o.nome).join('; '), 'txt', 40),
        RO('INDENNITA TOTALE €', r => U.r2((calc.perD.get(r.d.id) || {}).tot || 0), 'num', 14)] },
      { nome: 'INTESTATARI', id: 'ID_INTESTATARIO', righe: intest, cols: [
        RO('N. DITTA', r => r.d.n, 'txt', 9),
        C('COGNOME E NOME / DENOMINAZIONE', r => r.o.nome || '', (r, v) => { r.o.nome = v; }, 'txt', 32),
        C('NATO A / SEDE', r => r.o.natoA || r.o.sede || '', (r, v) => { r.o.natoA = v; if (ES.cat.giuridica(r.o)) r.o.sede = v; }, 'txt', 20),
        C('NATO IL', r => r.o.natoIl || '', (r, v) => { r.o.natoIl = v; }, 'data', 12),
        C('CODICE FISCALE / P.IVA', r => r.o.cf || '', (r, v) => { r.o.cf = v.toUpperCase(); }, 'txt', 19),
        C('DIRITTO', r => r.o.titolo || '', (r, v) => { r.o.titolo = v; }, 'txt', 16),
        C('QUOTA', r => r.o.quota || '', (r, v) => { r.o.quota = v; }, 'txt', 9),
        C('COLTIVATORE DIRETTO / IAP', r => !!r.o.cd, (r, v) => { r.o.cd = v; }, 'si', 12),
        C('VIA E NUMERO CIVICO', r => r.o.via || '', (r, v) => { r.o.via = v; }, 'txt', 30),
        C('CAP', r => r.o.cap || '', (r, v) => { r.o.cap = v; }, 'txt', 8),
        C('COMUNE DI RESIDENZA', r => r.o.citta || '', (r, v) => { r.o.citta = v; }, 'txt', 20),
        C('PROV.', r => r.o.prov || '', (r, v) => { r.o.prov = v.toUpperCase(); }, 'txt', 7),
        C('PEC / E-MAIL', r => r.o.pec || '', (r, v) => { r.o.pec = v; }, 'txt', 26),
        C('INVIO CON', r => r.o.mezzo || '', (r, v) => { r.o.mezzo = v; }, 'txt', 18)] },
      { nome: 'PARTICELLE', id: 'ID_PARTICELLA', righe: p.particelle.map(x => ({ id: x.id, x })), cols: [
        RO('N. DITTA', r => dittaN(r.x.ditta), 'txt', 9),
        C('CATASTO (T/F)', r => r.x.ct || 'T', (r, v) => { r.x.ct = v; }, 'lista', 9, { lista: ['T', 'F'] }),
        C('COMUNE', r => r.x.comune || '', (r, v) => { r.x.comune = v; }, 'txt', 16),
        C('SEZIONE', r => r.x.sez || '', (r, v) => { r.x.sez = v; }, 'txt', 8),
        C('FOGLIO', r => r.x.fg || '', (r, v) => { r.x.fg = v; }, 'txt', 8),
        C('MAPPALE', r => r.x.map || '', (r, v) => { r.x.map = v; }, 'txt', 10),
        C('SUB', r => r.x.sub || '', (r, v) => { r.x.sub = v; }, 'txt', 6),
        C('QUALITA', r => r.x.qual || '', (r, v) => { r.x.qual = v; }, 'txt', 14),
        C('CLASSE', r => r.x.cls || '', (r, v) => { r.x.cls = v; }, 'txt', 7),
        C('SUPERFICIE CATASTALE MQ', r => r.x.sup || '', (r, v) => { r.x.sup = v === '' ? 0 : v; }, 'num', 12),
        C('REDDITO DOMINICALE €', r => r.x.rd || '', (r, v) => { r.x.rd = v; }, 'txt', 11),
        C('REDDITO AGRARIO €', r => r.x.ra || '', (r, v) => { r.x.ra = v; }, 'txt', 11),
        C('DESTINAZIONE URBANISTICA', r => r.x.zona || '', (r, v) => { r.x.zona = v; }, 'txt', 12),
        C('CONFINI', r => r.x.confini || '', (r, v) => { r.x.confini = v; }, 'txt', 30),
        // superfici di progetto: il valore che usa il programma; se lo cambi diventa un valore inserito a mano,
        // se svuoti la cella si torna al valore dal disegno
        ...TIPI.map(t => C(NOMI_T[t], r => { const a = aree(r.x); return a[t] ? a[t] : ''; }, (r, v) => { r.x.man = r.x.man || {}; if (v === '') delete r.x.man[t]; else r.x.man[t] = v; }, 'num', 12, { superficie: t })),
        C('SE SUPERA LA SUP. CATASTALE', r => r.x.limite || '', (r, v) => { r.x.limite = v; }, 'lista', 14, { lista: ['', 'catasto', 'disegno'] }),
        C('MAPPALE DERIVATO (ESPROPRIO)', r => (r.x.nuovo || {}).espr || '', (r, v) => { r.x.nuovo = r.x.nuovo || {}; if (v) r.x.nuovo.espr = v; else delete r.x.nuovo.espr; }, 'txt', 12),
        C('AREA EDIFICABILE', r => !!r.x.edif, (r, v) => { r.x.edif = v ? '1' : ''; }, 'si', 10),
        C('VALORE €/MQ (se diverso)', r => r.x.vu || '', (r, v) => { r.x.vu = v; }, 'num', 11),
        C('SOPRASSUOLI €', r => r.x.sopr || '', (r, v) => { r.x.sopr = v; }, 'num', 11),
        C('DEPREZZAMENTO €', r => r.x.depr || '', (r, v) => { r.x.depr = v; }, 'num', 11),
        C('NOTE', r => r.x.note || '', (r, v) => { r.x.note = v; }, 'txt', 30),
        RO('SUP. DAL DISEGNO MQ', r => { const a = aree(r.x); return a.disegno ? Math.round(a.graf) : ''; }, 'num', 11),
        RO('INDENNITA €', r => U.r2((calc.perP.get(r.x.id) || {}).tot || 0), 'num', 12)] },
      { nome: 'ITER', id: 'ID_PASSO', righe: iter, cols: [
        RO('N. DITTA', r => r.d.n, 'txt', 9), RO('PASSO', r => r.ps.nome, 'txt', 36), RO('ARTICOLO', r => r.ps.art, 'txt', 12),
        C('DATA', r => ev(r, 'data'), setEv('data'), 'data', 12),
        C('NOTIFICA / RICEVIMENTO', r => ev(r, 'notifica'), setEv('notifica'), 'data', 12),
        C('PROTOCOLLO', r => ev(r, 'prot'), setEv('prot'), 'txt', 14),
        C('MEZZO', r => ev(r, 'mezzo'), setEv('mezzo'), 'txt', 18),
        C('NOTE', r => ev(r, 'note'), setEv('note'), 'txt', 30)] }
    ];
  };

  // ---- esportazione: fogli per ES.office.xlsx (celle gialle modificabili, grigie bloccate, fogli protetti) ----
  MF.esporta = p => {
    const S = MF.struttura(p), oggi = U.oggi();
    const leggimi = [
      [MF.FORMATO], ['FORMATO', MF.VERSIONE], ['PRATICA', p.nome || ''], ['CODICE PRATICA', p.id], ['ESPORTATO IL', U.dataIt(oggi)], [],
      ['COME SI USA'],
      ['1. Correggi solo le celle GIALLE. Le celle grigie (codici ID e valori calcolati) e le intestazioni non si toccano.'],
      ['2. Non aggiungere, togliere, spostare o ordinare righe e colonne, e non rinominare i fogli: il programma rifiuterebbe il file.'],
      ['3. Date come gg/mm/aaaa; SI / NO dove richiesto; numeri senza unità di misura.'],
      ['4. Superfici di progetto: il valore che cambi diventa un valore inserito a mano; se svuoti la cella si torna al valore dal disegno.'],
      ['5. Salva sempre come .xlsx e ricaricalo dal programma con «Mother File › Importa»: vedrai l\'elenco delle modifiche prima di applicarle.'],
      ['6. Se nel frattempo nel programma hai aggiunto o tolto ditte, intestatari o particelle, esporta un nuovo Mother File.']
    ];
    return [{ nome: 'LEGGIMI', righe: leggimi, larghezze: [30, 60], stile: 'leggimi' }].concat(S.map(f => ({
      nome: f.nome,
      righe: [[f.id].concat(f.cols.map(c => c.t))].concat(f.righe.map(r => [r.id].concat(f.cols.map(c => {
        const v = c.get(r);
        return c.tipo === 'data' ? dataCella(v) : c.tipo === 'si' ? (v ? 'SI' : 'NO') : c.tipo === 'num' ? (vuoto(v) ? '' : U.num(v)) : (v ?? '');
      })))),
      larghezze: [18].concat(f.cols.map(c => c.w)),
      // tipo di ogni colonna per gli stili: id, ro (sola lettura), testo o numero modificabile
      colonne: ['id'].concat(f.cols.map(c => (c.ro ? 'ro' : c.tipo === 'num' ? 'num' : 'txt'))),
      liste: f.cols.map((c, i) => (c.lista ? { col: i + 1, valori: c.lista.filter(Boolean) } : c.tipo === 'si' ? { col: i + 1, valori: ['SI', 'NO'] } : null)).filter(Boolean),
      proteggi: true
    })));
  };

  // ---- importazione: controlli e modifiche (non applicate) ----
  // fogli: {fogli:[{nome, righe}]} da ES.tab.xlsx. Restituisce {ok, errori:[testo], modifiche:[{foglio, riga, campo, prima, dopo, applica}]}
  MF.leggi = (p, file) => {
    const errori = [], modifiche = [], F = {};
    (file.fogli || []).forEach(f => { F[f.nome.trim().toUpperCase()] = f; });
    const L = F.LEGGIMI;
    if (!L) return { ok: false, errori: ['Manca il foglio LEGGIMI: non è un Mother File System di ESPROPRI_SISTEM.'] };
    const val = k => { const r = L.righe.find(x => String(x[0] || '').trim().toUpperCase() === k); return r ? String(r[1] ?? '').trim() : ''; };
    if (String((L.righe[0] || [])[0] || '').trim() !== MF.FORMATO || val('FORMATO') !== MF.VERSIONE) return { ok: false, errori: ['Il file non è un Mother File System riconosciuto (formato ' + (val('FORMATO') || 'sconosciuto') + ').'] };
    if (val('CODICE PRATICA') !== p.id) return { ok: false, errori: [`Il file è della pratica «${val('PRATICA')}», non di quella aperta («${p.nome}»): apri la pratica giusta prima di importarlo.`] };
    for (const f of MF.struttura(p)) {
      const X = F[f.nome];
      if (!X) { errori.push(`Manca il foglio ${f.nome} (o è stato rinominato).`); continue; }
      const att = [f.id].concat(f.cols.map(c => c.t)), int = (X.righe[0] || []).map(v => String(v ?? '').trim());
      while (int.length > att.length && !int[int.length - 1]) int.pop();
      if (int.length !== att.length || att.some((t, i) => int[i] !== t)) { errori.push(`Foglio ${f.nome}: le intestazioni delle colonne sono state cambiate, spostate o aggiunte (attese: ${att.join(' | ')}).`); continue; }
      const dati = X.righe.slice(1);
      if (dati.length !== f.righe.length) { errori.push(`Foglio ${f.nome}: ${dati.length} righe invece di ${f.righe.length}. Non si possono aggiungere o togliere righe${dati.length < f.righe.length ? ' (o nel programma sono state aggiunte voci dopo l\'esportazione: esporta un nuovo Mother File)' : ''}.`); continue; }
      let bad = 0;
      f.righe.forEach((r, i) => { if (String(dati[i][0] ?? '').trim() !== String(r.id)) bad++; });
      if (bad) { errori.push(`Foglio ${f.nome}: ${bad} righe hanno un codice ID diverso o sono state spostate/ordinate. L'ordine delle righe non si cambia${bad === f.righe.length ? ' (oppure la pratica è cambiata dopo l\'esportazione: esporta un nuovo Mother File)' : ''}.`); continue; }
      f.righe.forEach((r, i) => {
        const riga = dati[i], etich = f.nome === 'PRATICA' ? r.nome : f.nome === 'ATTI' ? r.f.nome : f.nome === 'DITTE' ? 'Ditta ' + r.d.n : f.nome === 'INTESTATARI' ? (r.o.nome || 'intestatario') + ' (ditta ' + r.d.n + ')' : f.nome === 'PARTICELLE' ? 'Fg. ' + r.x.fg + ' mapp. ' + r.x.map : 'Ditta ' + r.d.n + ' – ' + r.ps.nome;
        f.cols.forEach((c, j) => {
          const cella = riga[j + 1];
          if (c.ro) return;
          const pr = c.tipo === 'lista' ? leggiLista(c.lista)(cella) : PARSER[c.tipo](cella);
          if (pr.err) { errori.push(`Foglio ${f.nome}, riga ${i + 2} (${etich}), colonna «${c.t}»: ${pr.err} («${cella}»).`); return; }
          const prima = c.get(r);
          if (uguali(prima, pr.v, c.tipo)) return;
          modifiche.push({ foglio: f.nome, riga: etich, campo: c.t, prima: mostra(prima, c.tipo), dopo: mostra(pr.v, c.tipo), applica: () => c.set(r, pr.v) });
        });
      });
    }
    if (errori.length) return { ok: false, errori };
    return { ok: true, errori: [], modifiche };
  };
})(ES);
