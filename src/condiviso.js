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
// Report mensile di un dipendente: o={nome, mese:'AAAA-MM', voci, pers}
function repMonth(o){
  const N=v=>parseFloat(v)||0,X=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const F=v=>v?v.toLocaleString('it-IT',{maximumFractionDigits:2}):'',FE=v=>v?v.toLocaleString('it-IT',{style:'currency',currency:'EUR'}):'';
  const S=(L,k)=>L.reduce((s,x)=>s+N(x[k]),0);
  const [Y,M]=o.mese.split('-').map(Number),nd=new Date(Y,M,0).getDate();
  const V=(o.voci||[]).filter(v=>!v.del&&String(v.d||'').startsWith(o.mese));
  const P=(o.pers||[]).filter(p=>!p.del&&String(p.d||'').startsWith(o.mese));
  const T={h:0,tr:0,fe:0,pe:0,ma:0,km:0,sp:0,gg:0},byL={};let rows='';
  for(let i=1;i<=nd;i++){const ds=o.mese+'-'+String(i).padStart(2,'0'),dw=new Date(Y,M-1,i).getDay();
    const vv=V.filter(v=>v.d===ds),pp=P.filter(p=>p.d===ds),pt=t=>S(pp.filter(p=>p.tipo===t),'h');
    const h=S(vv,'h'),tr=S(vv.filter(v=>v.tr),'h'),km=S(vv,'km'),sp=S(vv,'sp'),fe=pt('ferie'),pe=pt('permesso'),ma=pt('malattia');
    if(h>0)T.gg++;T.h+=h;T.tr+=tr;T.km+=km;T.sp+=sp;T.fe+=fe;T.pe+=pe;T.ma+=ma;
    vv.forEach(v=>{const k=(v.cod||'')+'|'+(v.nome||''),L=byL[k]=byL[k]||{cod:v.cod,nome:v.nome,cl:v.cliente,h:0,tr:0,km:0,sp:0};L.h+=N(v.h);if(v.tr)L.tr+=N(v.h);L.km+=N(v.km);L.sp+=N(v.sp)});
    const lav=vv.map(v=>`${X(v.cod)} ${X(v.nome)}: <b>${F(N(v.h))||0} h</b>${v.tr?' (trasf.)':''}`).join('<br>');
    const note=[...vv.filter(v=>v.note).map(v=>X(v.cod)+': '+X(v.note)),...pp.filter(p=>p.note||p.tipo==='nota').map(p=>(p.tipo==='nota'?'':TIPI[p.tipo]+': ')+X(p.note))].join('<br>');
    rows+=`<tr class="${dw===0||dw===6?'we':''}"><td>${GGS[dw]} ${i}</td><td>${lav}</td><td class="n">${F(h)}</td><td class="n">${F(tr)}</td><td class="n">${F(fe)}</td><td class="n">${F(pe)}</td><td class="n">${F(ma)}</td><td class="n">${F(km)}</td><td class="n">${FE(sp)}</td><td>${note}</td></tr>`}
  const LL=Object.values(byL).sort((a,b)=>String(a.cod).localeCompare(String(b.cod),'it',{numeric:true}));
  return`<section class="rep"><div class="rh"><h2>Report ore · ${X(o.nome)}</h2><b>${MESI[M-1]} ${Y}</b></div>
<table><thead><tr><th>Giorno</th><th>Lavori</th><th class="n">Ore lavoro</th><th class="n">di cui trasf.</th><th class="n">Ferie h</th><th class="n">Permessi h</th><th class="n">Malattia h</th><th class="n">Km</th><th class="n">Spese</th><th>Note</th></tr></thead><tbody>${rows}</tbody>
<tfoot><tr><td colspan="2">Totale mese · ${T.gg} ${T.gg===1?'giorno lavorato':'giorni lavorati'}</td><td class="n">${F(T.h)||0}</td><td class="n">${F(T.tr)}</td><td class="n">${F(T.fe)}</td><td class="n">${F(T.pe)}</td><td class="n">${F(T.ma)}</td><td class="n">${F(T.km)}</td><td class="n">${FE(T.sp)}</td><td></td></tr></tfoot></table>
<h3>Riepilogo per lavoro</h3><table><thead><tr><th>Codice</th><th>Lavoro</th><th>Cliente</th><th class="n">Ore</th><th class="n">di cui trasf.</th><th class="n">Km</th><th class="n">Spese</th></tr></thead><tbody>${LL.length?LL.map(l=>`<tr><td>${X(l.cod)}</td><td>${X(l.nome)}</td><td>${X(l.cl)}</td><td class="n">${F(l.h)}</td><td class="n">${F(l.tr)}</td><td class="n">${F(l.km)}</td><td class="n">${FE(l.sp)}</td></tr>`).join(''):'<tr><td colspan="7">Nessuna ora su lavori nel mese.</td></tr>'}</tbody></table>
<p class="rn">Generato il ${new Date().toLocaleString('it-IT',{dateStyle:'short',timeStyle:'short'})}.</p>
<div class="firme"><div>Firma dipendente</div><div>Firma responsabile</div></div></section>`}
// Elenco piatto per Excel (una riga per registrazione), adatto a tabelle pivot
function repCsv(list){const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"',num=v=>v===''||v==null?'':String(Math.round((parseFloat(v)||0)*100)/100).replace('.',',');
  const R=[];list.forEach(o=>{
    (o.voci||[]).filter(v=>!v.del&&String(v.d||'').startsWith(o.mese)).forEach(v=>R.push([o.nome,v.d,TIPI.lavoro,v.cod,v.nome,num(v.h),v.tr?'sì':'',num(v.km),num(v.sp),v.note]));
    (o.pers||[]).filter(p=>!p.del&&String(p.d||'').startsWith(o.mese)).forEach(p=>R.push([o.nome,p.d,TIPI[p.tipo]||p.tipo,'','',num(p.h),'','','',p.note]))});
  R.sort((a,b)=>(a[0]+a[1]).localeCompare(b[0]+b[1]));
  return'﻿'+[['Dipendente','Data','Tipo','Codice','Lavoro','Ore','Trasferta','Km','Spese €','Note'],...R].map(r=>r.map(q).join(';')).join('\r\n')}
