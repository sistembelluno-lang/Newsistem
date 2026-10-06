// Accesso alla cartella condivisa sul server: nell'app desktop sono file veri, nel browser una simulazione in localStorage (solo per prova)
const VFS=window.desktop&&window.desktop.shRead?{sim:false,
  get:()=>window.desktop.shGet(),choose:()=>window.desktop.shChoose(),
  read:r=>window.desktop.shRead(r),write:(r,t)=>window.desktop.shWrite(r,t)}
 :{sim:true,get:async()=>({dir:'(cartella simulata nel browser)'}),choose:async()=>({dir:'(cartella simulata nel browser)'}),
  read:async r=>{try{return localStorage.getItem('vfs:'+r)}catch(e){return null}},write:async(r,t)=>{localStorage.setItem('vfs:'+r,t);return true}};
// Legge un JSON dalla cartella condivisa: def se il file non esiste, eccezione se il server non risponde
async function rj(rel,def){const t=await VFS.read(rel);if(!t)return def;return JSON.parse(String(t).replace(/^﻿/,''))}
// Il PIN non viene mai salvato in chiaro: nei file c'è solo l'impronta SHA-256
async function hpin(id,pin){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('CL|'+id+'|'+String(pin).trim()));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
const newId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const TIPI={lavoro:'Ore su lavoro',ferie:'Ferie',permesso:'Permesso',malattia:'Malattia',nota:'Nota del giorno'};
const MESI=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const GGS=['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
// Dove sono state lavorate le ore, auto usata per i km, tipologie di spesa
const LUOGHI={uff:'Ufficio',cant:'Cantiere',tr:'Trasferta'};
const AUTO={az:'Auto aziendale',pr:'Auto propria'};
const SPT={gen:'Spese generiche',pasti:'Pasti',hotel:'Hotel',min:'Minuteria'};
const luogoOf=v=>v.cant?'cant':v.tr?'tr':'uff';
// Spese di una registrazione: elenco per tipologia; le registrazioni vecchie (solo «sp») contano come spese generiche
const splOf=v=>Array.isArray(v.spl)&&v.spl.length?v.spl:((parseFloat(v.sp)||0)?[{t:'gen',i:parseFloat(v.sp)}]:[]);
// Festività nazionali italiane (sabati e domeniche a parte). Dal 2026 anche il 4 ottobre, San Francesco d'Assisi.
const FEST_CACHE={};
function festivi(Y){if(FEST_CACHE[Y])return FEST_CACHE[Y];const m=new Map(),a=(mm,dd,nm)=>m.set(Y+'-'+String(mm).padStart(2,'0')+'-'+String(dd).padStart(2,'0'),nm);
  a(1,1,'Capodanno');a(1,6,'Epifania');a(4,25,'Festa della Liberazione');a(5,1,'Festa dei Lavoratori');a(6,2,'Festa della Repubblica');a(8,15,'Ferragosto');
  a(11,1,'Ognissanti');a(12,8,'Immacolata Concezione');a(12,25,'Natale');a(12,26,'Santo Stefano');if(Y>=2026)a(10,4,"San Francesco d'Assisi");
  // Pasqua (algoritmo di Meeus/Jones/Butcher) e Lunedì dell'Angelo
  const A=Y%19,B=Math.floor(Y/100),C=Y%100,D=Math.floor(B/4),E=B%4,F=Math.floor((B+8)/25),G=Math.floor((B-F+1)/3),H=(19*A+B-D-G+15)%30,I=Math.floor(C/4),K=C%4,L=(32+2*E+2*I-H-K)%7,Q=Math.floor((A+11*H+22*L)/451),mo=Math.floor((H+L-7*Q+114)/31),dy=((H+L-7*Q+114)%31)+1;
  a(mo,dy,'Pasqua');const lu=new Date(Y,mo-1,dy+1);a(lu.getMonth()+1,lu.getDate(),"Lunedì dell'Angelo");
  return FEST_CACHE[Y]=m}
// Un giorno 'AAAA-MM-GG': giorno della settimana, se è festivo (rosso) e il nome della festività
function giorno(ds){const [y,m,d]=ds.split('-').map(Number),dw=new Date(y,m-1,d).getDay(),nome=festivi(y).get(ds)||'';return{dw,nome,fest:dw===0||dw===6||!!nome}}
// Ferie e permessi programmati di un dipendente: richieste fatte dal dipendente (con l'esito dato dall'amministratore)
// e giorni aggiunti direttamente dall'amministratore. stato: 'ok' approvata, 'att' in attesa, 'no' rifiutata.
function progOf(dipId,rich,fer){fer=fer||{};const E=fer.e||{};
  const R=(rich||[]).filter(r=>r&&!r.del&&r.d).map(r=>{const e=E[r.u];return{u:r.u,d:r.d,tipo:r.tipo,h:r.h,note:r.note,da:'dip',stato:e&&(+e.t||0)>=(+r.t||0)?e.s:'att',motivo:e&&e.m||''}});
  const P=(fer.prog||[]).filter(p=>p&&!p.del&&p.di===dipId).map(p=>({u:p.u,d:p.d,tipo:p.tipo,h:p.h,note:p.note,da:'adm',stato:'ok'}));
  return[...R,...P]}
// Colore del giorno: giallo malattia, blu ferie fatte, viola ferie programmate approvate, rosso festivi
function coloreGiorno(ds,pers,prog){const p=(pers||[]).filter(x=>!x.del&&x.d===ds),g=(prog||[]).filter(x=>x.d===ds);
  if(p.some(x=>x.tipo==='malattia'))return'g-ma';if(p.some(x=>x.tipo==='ferie'))return'g-fe';
  if(g.some(x=>x.tipo==='ferie'&&x.stato==='ok'))return'g-fp';if(giorno(ds).fest)return'g-fest';
  if(g.some(x=>x.tipo==='ferie'&&x.stato==='att'))return'g-att';return''}
const legendaHTML=()=>'<div class="leg"><span><i class="g-fest"></i>Festivi</span><span><i class="g-fp"></i>Ferie programmate</span><span><i class="g-fe"></i>Ferie fatte</span><span><i class="g-ma"></i>Malattia</span><span><i class="g-att"></i>Richiesta in attesa</span></div>';
// Report mensile di un dipendente: o={nome, mese:'AAAA-MM', voci, pers, prog}
function repMonth(o){
  const N=v=>parseFloat(v)||0,X=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const F=v=>v?v.toLocaleString('it-IT',{maximumFractionDigits:2}):'',FE=v=>v?v.toLocaleString('it-IT',{style:'currency',currency:'EUR'}):'';
  const S=(L,k)=>L.reduce((s,x)=>s+N(x[k]),0);
  const [Y,M]=o.mese.split('-').map(Number),nd=new Date(Y,M,0).getDate();
  const V=(o.voci||[]).filter(v=>!v.del&&String(v.d||'').startsWith(o.mese));
  const P=(o.pers||[]).filter(p=>!p.del&&String(p.d||'').startsWith(o.mese));
  const PG=(o.prog||[]).filter(p=>p.stato!=='no'&&String(p.d||'').startsWith(o.mese));
  const T={h:0,cant:0,tr:0,fe:0,pe:0,ma:0,km:0,kaz:0,kpr:0,kno:0,sp:0,gg:0,spt:{gen:0,pasti:0,hotel:0,min:0}},byL={};let rows='';
  for(let i=1;i<=nd;i++){const ds=o.mese+'-'+String(i).padStart(2,'0'),gi=giorno(ds);
    const vv=V.filter(v=>v.d===ds),pp=P.filter(p=>p.d===ds),pg=PG.filter(p=>p.d===ds),pt=t=>S(pp.filter(p=>p.tipo===t),'h');
    const h=S(vv,'h'),ca=S(vv.filter(v=>luogoOf(v)==='cant'),'h'),tr=S(vv.filter(v=>luogoOf(v)==='tr'),'h'),km=S(vv,'km'),fe=pt('ferie'),pe=pt('permesso'),ma=pt('malattia');
    let sp=0;vv.forEach(v=>splOf(v).forEach(s=>{sp+=N(s.i);T.spt[s.t in T.spt?s.t:'gen']+=N(s.i)}));
    vv.forEach(v=>{const k=N(v.km);if(!k)return;if(v.auto==='az')T.kaz+=k;else if(v.auto==='pr')T.kpr+=k;else T.kno+=k});
    if(h>0)T.gg++;T.h+=h;T.cant+=ca;T.tr+=tr;T.km+=km;T.sp+=sp;T.fe+=fe;T.pe+=pe;T.ma+=ma;
    vv.forEach(v=>{const k=(v.cod||'')+'|'+(v.nome||''),L=byL[k]=byL[k]||{cod:v.cod,nome:v.nome,cl:v.cliente,h:0,cant:0,tr:0,km:0,sp:0};const lu=luogoOf(v);L.h+=N(v.h);if(lu==='cant')L.cant+=N(v.h);if(lu==='tr')L.tr+=N(v.h);L.km+=N(v.km);L.sp+=splOf(v).reduce((s,x)=>s+N(x.i),0)});
    const lav=vv.map(v=>{const lu=luogoOf(v);return`${X(v.cod)} ${X(v.nome)}: <b>${F(N(v.h))||0} h</b>${lu!=='uff'?' ('+LUOGHI[lu].toLowerCase()+')':''}${N(v.km)?' · '+F(N(v.km))+' km'+(v.auto?' '+(v.auto==='az'?'az.':'propria'):''):''}`}).join('<br>');
    const note=[...pg.map(p=>(p.tipo==='ferie'?'Ferie programmate':'Permesso programmato'+(p.h?' '+F(N(p.h))+' h':''))+(p.stato==='att'?' (in attesa)':p.stato==='no'?' (rifiutata)':'')),
      ...(gi.nome?[gi.nome]:[]),...vv.flatMap(v=>splOf(v).map(s=>SPT[s.t]+' '+FE(N(s.i)))),
      ...vv.filter(v=>v.note).map(v=>X(v.cod)+': '+X(v.note)),...pp.filter(p=>p.note||p.tipo==='nota').map(p=>(p.tipo==='nota'?'':TIPI[p.tipo]+': ')+X(p.note))].join('<br>');
    rows+=`<tr class="${coloreGiorno(ds,pp,pg)}"><td>${GGS[gi.dw]} ${i}</td><td>${lav}</td><td class="n">${F(h)}</td><td class="n">${F(ca)}</td><td class="n">${F(tr)}</td><td class="n">${F(fe)}</td><td class="n">${F(pe)}</td><td class="n">${F(ma)}</td><td class="n">${F(km)}</td><td class="n">${FE(sp)}</td><td>${note}</td></tr>`}
  const LL=Object.values(byL).sort((a,b)=>String(a.cod).localeCompare(String(b.cod),'it',{numeric:true}));
  const fpg=PG.filter(p=>p.tipo==='ferie'&&p.stato==='ok').length;
  return`<section class="rep"><div class="rh"><div><span class="raz">SISTEM SRL STP</span><h2>Report ore · ${X(o.nome)}</h2></div><b>${MESI[M-1]} ${Y}</b></div>
<table><thead><tr><th>Giorno</th><th>Lavori</th><th class="n">Ore</th><th class="n">di cui cantiere</th><th class="n">di cui trasf.</th><th class="n">Ferie h</th><th class="n">Perm. h</th><th class="n">Mal. h</th><th class="n">Km</th><th class="n">Spese</th><th>Note</th></tr></thead><tbody>${rows}</tbody>
<tfoot><tr><td colspan="2">Totale mese · ${T.gg} ${T.gg===1?'giorno lavorato':'giorni lavorati'}</td><td class="n">${F(T.h)||0}</td><td class="n">${F(T.cant)}</td><td class="n">${F(T.tr)}</td><td class="n">${F(T.fe)}</td><td class="n">${F(T.pe)}</td><td class="n">${F(T.ma)}</td><td class="n">${F(T.km)}</td><td class="n">${FE(T.sp)}</td><td></td></tr></tfoot></table>
${legendaHTML()}
<h3>Riepilogo del mese</h3><div class="rs">
<table><tbody><tr><th colspan="2">Ore</th></tr><tr><td>In ufficio</td><td class="n">${F(T.h-T.cant-T.tr)||0} h</td></tr><tr><td>In cantiere</td><td class="n">${F(T.cant)||0} h</td></tr><tr><td>In trasferta</td><td class="n">${F(T.tr)||0} h</td></tr><tr><td><b>Totale ore lavorate</b></td><td class="n"><b>${F(T.h)||0} h</b></td></tr></tbody></table>
<table><tbody><tr><th colspan="2">Km</th></tr><tr><td>Auto propria</td><td class="n">${F(T.kpr)||0} km</td></tr><tr><td>Auto aziendale</td><td class="n">${F(T.kaz)||0} km</td></tr>${T.kno?`<tr><td>Auto non indicata</td><td class="n">${F(T.kno)} km</td></tr>`:''}<tr><td><b>Totale km</b></td><td class="n"><b>${F(T.km)||0} km</b></td></tr></tbody></table>
<table><tbody><tr><th colspan="2">Spese</th></tr>${Object.keys(SPT).map(k=>`<tr><td>${SPT[k]}</td><td class="n">${FE(T.spt[k])||'0,00 €'}</td></tr>`).join('')}<tr><td><b>Totale spese</b></td><td class="n"><b>${FE(T.sp)||'0,00 €'}</b></td></tr></tbody></table>
<table><tbody><tr><th colspan="2">Assenze</th></tr><tr><td>Ferie fatte</td><td class="n">${F(T.fe)||0} h</td></tr><tr><td>Permessi</td><td class="n">${F(T.pe)||0} h</td></tr><tr><td>Malattia</td><td class="n">${F(T.ma)||0} h</td></tr><tr><td>Ferie programmate</td><td class="n">${fpg} gg</td></tr></tbody></table></div>
<h3>Riepilogo per lavoro</h3><table><thead><tr><th>Codice</th><th>Lavoro</th><th>Cliente</th><th class="n">Ore</th><th class="n">di cui cantiere</th><th class="n">di cui trasf.</th><th class="n">Km</th><th class="n">Spese</th></tr></thead><tbody>${LL.length?LL.map(l=>`<tr><td>${X(l.cod)}</td><td>${X(l.nome)}</td><td>${X(l.cl)}</td><td class="n">${F(l.h)}</td><td class="n">${F(l.cant)}</td><td class="n">${F(l.tr)}</td><td class="n">${F(l.km)}</td><td class="n">${FE(l.sp)}</td></tr>`).join(''):'<tr><td colspan="8">Nessuna ora su lavori nel mese.</td></tr>'}</tbody></table>
<p class="rn">Generato il ${new Date().toLocaleString('it-IT',{dateStyle:'short',timeStyle:'short'})}.</p>
<div class="firme"><div>Firma dipendente</div><div>Firma responsabile</div></div></section>`}
// Elenco piatto per Excel (una riga per registrazione), adatto a tabelle pivot
function repCsv(list){const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"',num=v=>v===''||v==null?'':String(Math.round((parseFloat(v)||0)*100)/100).replace('.',',');
  const R=[];list.forEach(o=>{
    (o.voci||[]).filter(v=>!v.del&&String(v.d||'').startsWith(o.mese)).forEach(v=>{const s={gen:0,pasti:0,hotel:0,min:0};splOf(v).forEach(x=>s[x.t in s?x.t:'gen']+=parseFloat(x.i)||0);const tot=s.gen+s.pasti+s.hotel+s.min;
      R.push([o.nome,v.d,TIPI.lavoro,v.cod,v.nome,num(v.h),LUOGHI[luogoOf(v)],num(v.km),v.km?AUTO[v.auto]||'':'',num(s.gen||''),num(s.pasti||''),num(s.hotel||''),num(s.min||''),num(tot||''),v.note])});
    (o.pers||[]).filter(p=>!p.del&&String(p.d||'').startsWith(o.mese)).forEach(p=>R.push([o.nome,p.d,TIPI[p.tipo]||p.tipo,'','',num(p.h),'','','','','','','','',p.note]));
    (o.prog||[]).filter(p=>p.stato!=='no'&&String(p.d||'').startsWith(o.mese)).forEach(p=>R.push([o.nome,p.d,(p.tipo==='ferie'?'Ferie programmate':'Permesso programmato')+(p.stato==='att'?' (in attesa)':p.stato==='no'?' (rifiutata)':''),'','',num(p.h),'','','','','','','','',p.note]))});
  R.sort((a,b)=>(a[0]+a[1]).localeCompare(b[0]+b[1]));
  return'﻿'+[['Dipendente','Data','Tipo','Codice','Lavoro','Ore','Dove','Km','Auto','Spese generiche €','Pasti €','Hotel €','Minuteria €','Spese totali €','Note'],...R].map(r=>r.map(q).join(';')).join('\r\n')}
// Tabella stampabile generica (elenchi): titolo, sottotitolo, intestazioni e righe già in HTML sicuro
function repTable(titolo,sub,H,R,dopo){return`<section class="rep"><div class="rh"><div><span class="raz">SISTEM SRL STP</span><h2>${titolo}</h2></div><b>${sub||''}</b></div><table><thead><tr>${H.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${R.length?R.map(r=>`<tr>${r.map(c=>`<td>${c??''}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${H.length}">Nessun dato.</td></tr>`}</tbody></table>${dopo||''}<p class="rn">Generato il ${new Date().toLocaleString('it-IT',{dateStyle:'short',timeStyle:'short'})}.</p></section>`}
// Stampa o PDF di un report: nell'app desktop il PDF si salva con «Salva con nome», nel browser si usa la stampa (Salva come PDF)
async function outReport(html,modo,nomeFile,avviso){const pr=document.getElementById('print');pr.innerHTML=html;
  if(modo==='pdf'&&window.desktop&&window.desktop.savePdf){const r=await window.desktop.savePdf(nomeFile);if(avviso)avviso(r&&r.ok?'PDF salvato: '+r.file:r&&r.canceled?'Salvataggio annullato':'PDF non salvato'+(r&&r.error?': '+r.error:''));return r}
  if(modo==='pdf'&&avviso)avviso('Nella finestra di stampa scegli «Salva come PDF»');
  window.print()}
// ===== Attività settimanali: tabella aperta, la vedono e la compilano amministratore e dipendenti =====
// Attività {u,t,d,lav,cod,nome,chi,strum,auto,note,by,mod}. L'amministratore scrive in attivita.json, ogni dipendente nel suo
// ore/<id>.json (campo att): ogni file ha sempre un solo scrittore. Chiunque può correggere o cancellare una riga: la nuova
// versione (stesso u, t più recente; cancellata = del) va nel file di chi modifica e nell'elenco vince la più recente.
const sigla=nome=>String(nome||'').trim().split(/\s+/).filter(Boolean).map(p=>p[0].toUpperCase()).join('');
function attUnisci(...liste){const m=new Map();liste.forEach(L=>(L||[]).forEach(x=>{if(!x||!x.u)return;const y=m.get(x.u);if(!y||(+x.t||0)>(+y.t||0))m.set(x.u,x)}));return[...m.values()].filter(x=>!x.del)}
const dsOf=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
function lunediDi(ds){const d=new Date(ds+'T12:00');d.setDate(d.getDate()-(d.getDay()+6)%7);return dsOf(d)}
function giorniSett(lun){return[...Array(7)].map((_,i)=>{const d=new Date(lun+'T12:00');d.setDate(d.getDate()+i);return dsOf(d)})}
function nSett(ds){const d=new Date(ds+'T12:00');d.setDate(d.getDate()+3-(d.getDay()+6)%7);const w1=new Date(d.getFullYear(),0,4,12);return 1+Math.round(((d-w1)/864e5-3+(w1.getDay()+6)%7)/7)}
function settLabel(lun){const G=giorniSett(lun),a=G[0].split('-').map(Number),b=G[6].split('-').map(Number);
  return'Settimana '+nSett(lun)+' · '+a[2]+(a[1]!==b[1]?' '+MESI[a[1]-1].toLowerCase():'')+(a[0]!==b[0]?' '+a[0]:'')+' – '+b[2]+' '+MESI[b[1]-1].toLowerCase()+' '+b[0]}
const lavLbl=l=>(l.cod?l.cod+' · ':'')+(l.nome||'')+(l.cliente?' ('+l.cliente+')':'');
// Componente della tabella settimanale, uguale nei due programmi.
// cfg: {el, tutte()→attività, salva(x)→Promise<bool>, ricarica()→Promise, lavori()→[{id,cod,nome,cliente}], persone()→[{nome}], io:{nome}, toast, ask}
function attUI(cfg){const E=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const st=cfg.st=cfg.st||{lun:lunediDi(dsOf(new Date())),edit:null};const el=cfg.el,q=s=>el.querySelector(s);
  el.innerHTML=`<div class="att-card"><div class="att-h"><h2>📅 Attività della settimana</h2><span class="att-mu">Tabella aperta: la vedono e la compilano amministratore e dipendenti.</span></div>
<div class="att-f"><label>Data<input type="date" data-a="d"></label><label class="w2">Codice lavoro<input data-a="lav" list="att-lav" placeholder="Scrivi codice o nome…" autocomplete="off"></label>
<label>Chi<input data-a="chi" list="att-chi" placeholder="es. DV" autocomplete="off"></label><label class="w2">Strumentazione<input data-a="strum" list="att-str" placeholder="es. stazione totale" autocomplete="off"></label>
<label>Auto<select data-a="auto"><option value="">—</option><option value="az">Auto aziendale</option><option value="pr">Auto propria</option></select></label>
<label class="w2">Note<input data-a="note" maxlength="200"></label><div class="att-b"><button type="button" data-k="annulla" hidden>Annulla</button><button type="button" class="p" data-k="salva">Aggiungi</button></div></div>
<datalist id="att-lav"></datalist><datalist id="att-chi"></datalist><datalist id="att-str"></datalist></div>
<div class="att-nav"><button type="button" data-k="prev" title="Settimana precedente">‹</button><b data-k="lbl"></b><button type="button" data-k="next" title="Settimana successiva">›</button><button type="button" data-k="oggi">Questa settimana</button><span style="flex:1"></span><button type="button" data-k="agg">⟳ Aggiorna</button><button type="button" data-k="prt">Stampa</button><button type="button" data-k="pdf">Esporta PDF</button></div>
<div class="att-l"></div>`;
  const F=k=>q(`[data-a="${k}"]`),lavOf=v=>(cfg.lavori()||[]).find(l=>lavLbl(l)===v.trim()||String(l.cod??'')===v.trim());
  const reset=d=>{st.edit=null;F('d').value=d||F('d').value||dsOf(new Date());['lav','strum','note'].forEach(k=>F(k).value='');F('chi').value=cfg.io&&cfg.io.nome?sigla(cfg.io.nome):'';F('auto').value='';q('[data-k=salva]').textContent='Aggiungi';q('[data-k=annulla]').hidden=true};
  const liste=()=>{q('#att-lav').innerHTML=(cfg.lavori()||[]).map(l=>`<option value="${E(lavLbl(l))}">`).join('');
    q('#att-chi').innerHTML=(cfg.persone()||[]).map(p=>`<option value="${E(sigla(p.nome))}">${E(p.nome)}</option>`).join('');
    q('#att-str').innerHTML=[...new Set(cfg.tutte().map(x=>x.strum).filter(Boolean))].sort().map(s=>`<option value="${E(s)}">`).join('')};
  const chiTit=c=>String(c||'').split(/[,;/+]/).map(s=>s.trim()).filter(Boolean).map(s=>{const p=(cfg.persone()||[]).find(p=>sigla(p.nome)===s.toUpperCase()||p.nome.toLowerCase()===s.toLowerCase());return p?p.nome:s}).join(', ');
  const mia=x=>cfg.io&&cfg.io.nome&&String(x.chi||'').toUpperCase().split(/[^A-ZÀ-Ü]+/).includes(sigla(cfg.io.nome));
  const righe=()=>{const G=giorniSett(st.lun),A=cfg.tutte();return G.map(ds=>({ds,L:A.filter(x=>x.d===ds).sort((a,b)=>String(a.cod).localeCompare(String(b.cod),'it',{numeric:true})||(+a.t-+b.t))}))};
  function lista(){q('[data-k=lbl]').textContent=settLabel(st.lun);const oggi=dsOf(new Date());let h='',tot=0;
    righe().forEach(({ds,L})=>{const g=giorno(ds),[,m,d]=ds.split('-').map(Number),dl=`<b>${GGS[g.dw]} ${d}/${m}</b>${g.nome?`<small>${E(g.nome)}</small>`:''}${ds===oggi?'<small>oggi</small>':''}<button type="button" class="att-add" data-add="${ds}" title="Aggiungi un'attività in questo giorno">+</button>`;
      const cls=(g.fest?'g-fest ':'')+(ds===oggi?'att-oggi':'');tot+=L.length;
      if(!L.length){h+=`<tr class="${cls}"><td class="att-g">${dl}</td><td colspan="8" class="att-mu">—</td></tr>`;return}
      L.forEach((x,i)=>{h+=`<tr class="${cls} ${mia(x)?'att-mia':''}">${i?'':`<td class="att-g" rowspan="${L.length}">${dl}</td>`}<td><b>${E(x.cod)}</b></td><td>${E(x.nome)}</td><td title="${E(chiTit(x.chi))}"><b>${E(x.chi)}</b></td><td>${E(x.strum)}</td><td>${x.auto?AUTO[x.auto]:''}</td><td>${E(x.note)}</td><td class="att-mu">${E(x.by)}${x.mod&&x.mod!==x.by?'<br>mod. '+E(x.mod):''}</td><td class="att-ac"><button type="button" data-e="${E(x.u)}" title="Modifica">✎</button><button type="button" class="d" data-x="${E(x.u)}" title="Elimina">✕</button></td></tr>`})});
    q('.att-l').innerHTML=`<div class="att-tw"><table class="att-t"><thead><tr><th>Giorno</th><th>Codice</th><th>Lavoro</th><th>Chi</th><th>Strumentazione</th><th>Auto</th><th>Note</th><th>Inserita da</th><th></th></tr></thead><tbody>${h}</tbody></table></div><p class="att-mu">${tot?tot+(tot===1?' attività':' attività')+' in settimana.':'Nessuna attività programmata in questa settimana.'}${cfg.io&&cfg.io.nome?' Le righe evidenziate riguardano te.':''}</p>`;
    liste()}
  async function salva(){const d=F('d').value,l=lavOf(F('lav').value),chi=F('chi').value.trim().replace(/\s*,\s*/g,', ');
    if(!/^\d{4}-\d\d-\d\d$/.test(d)){cfg.toast('Inserisci la data');F('d').focus();return}
    if(!l){cfg.toast('Scegli il lavoro dall\'elenco');F('lav').focus();return}
    if(!chi){cfg.toast('Indica chi (es. DV)');F('chi').focus();return}
    const me=cfg.io&&cfg.io.nome||'Amministratore',old=st.edit&&cfg.tutte().find(x=>x.u===st.edit);
    const x={u:old?old.u:newId(),t:Date.now(),d,lav:l.id,cod:String(l.cod??''),nome:l.nome||'',chi,strum:F('strum').value.trim(),auto:F('auto').value,note:F('note').value.trim(),by:old?old.by:me};
    if(old)x.mod=me;const b=q('[data-k=salva]');b.disabled=true;const ok=await cfg.salva(x);b.disabled=false;
    if(ok===false)return;st.lun=lunediDi(d);reset(d);lista();cfg.toast(old?'Attività modificata':'Attività aggiunta')}
  el.onclick=async e=>{const t=e.target.closest('button');if(!t||!el.contains(t))return;const k=t.dataset.k;
    if(k==='prev'||k==='next'){const d=new Date(st.lun+'T12:00');d.setDate(d.getDate()+(k==='prev'?-7:7));st.lun=dsOf(d);lista()}
    else if(k==='oggi'){st.lun=lunediDi(dsOf(new Date()));lista()}
    else if(k==='agg'){await cfg.ricarica();lista();cfg.toast('Aggiornato')}
    else if(k==='salva')salva();
    else if(k==='annulla')reset();
    else if(k==='prt'||k==='pdf'){const R=[];righe().forEach(({ds,L})=>{const g=giorno(ds),gl=GGS[g.dw]+' '+ds.split('-').reverse().join('/')+(g.nome?' · '+E(g.nome):'');
        if(!L.length)R.push([gl,'','','','','','']);else L.forEach((x,i)=>R.push([i?'':gl,'<b>'+E(x.cod)+'</b>',E(x.nome),'<b>'+E(x.chi)+'</b>',E(x.strum),x.auto?AUTO[x.auto]:'',E(x.note)]))});
      outReport(repTable('Attività della settimana',settLabel(st.lun),['Giorno','Codice','Lavoro','Chi','Strumentazione','Auto','Note'],R),k,'Attivita_settimana_'+nSett(st.lun)+'_'+st.lun.slice(0,4)+'.pdf',cfg.toast)}
    else if(t.dataset.add){reset(t.dataset.add);F('lav').focus();q('.att-f').scrollIntoView({block:'nearest',behavior:'smooth'})}
    else if(t.dataset.e){const x=cfg.tutte().find(y=>y.u===t.dataset.e);if(!x)return;st.edit=x.u;F('d').value=x.d;const l=(cfg.lavori()||[]).find(y=>y.id==x.lav&&String(y.cod??'')===x.cod);
      F('lav').value=l?lavLbl(l):x.cod;F('chi').value=x.chi||'';F('strum').value=x.strum||'';F('auto').value=x.auto||'';F('note').value=x.note||'';
      q('[data-k=salva]').textContent='Salva modifica';q('[data-k=annulla]').hidden=false;q('.att-f').scrollIntoView({block:'nearest',behavior:'smooth'});F('lav').focus()}
    else if(t.dataset.x){const x=cfg.tutte().find(y=>y.u===t.dataset.x);if(!x||!await cfg.ask('Eliminare l\'attività '+x.cod+' del '+x.d.split('-').reverse().join('/')+' ('+x.chi+')? Sparisce per tutti.'))return;
      if(await cfg.salva({u:x.u,t:Date.now(),del:true,mod:cfg.io&&cfg.io.nome||'Amministratore'})!==false){if(st.edit===x.u)reset();lista();cfg.toast('Attività eliminata')}}};
  el.onkeydown=e=>{if(e.key==='Enter'&&e.target.closest('.att-f')&&e.target.tagName==='INPUT'){e.preventDefault();salva()}};
  reset();lista();
  return{lista,aggiorna:()=>{if(!el.isConnected)return;lista()}}}
