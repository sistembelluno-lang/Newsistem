// Copia src/condiviso.js, src/report.css e src/tema.css dentro i due HTML (che devono restare file unici e autonomi);
// il tema va anche in calc/Calc_Sistem.html.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'src/condiviso.js'), 'utf8').trim();
const css = fs.readFileSync(path.join(root, 'src/report.css'), 'utf8').trim();
const tema = fs.readFileSync(path.join(root, 'src/tema.css'), 'utf8').trim();
for (const f of ['Controllo_Lavori.html', 'Ore_Dipendenti.html']) {
  const p = path.join(root, f);
  let s = fs.readFileSync(p, 'utf8');
  const put = (a, b, body) => {
    const i = s.indexOf(a), j = s.indexOf(b);
    if (i < 0 || j < i) throw new Error(`${f}: marcatori ${a} non trovati`);
    s = s.slice(0, i + a.length) + '\n' + body + '\n' + s.slice(j);
  };
  put('/*CONDIVISO-INIZIO (da src/condiviso.js: non modificare qui)*/', '/*CONDIVISO-FINE*/', js);
  put('/*REPORT-CSS-INIZIO (da src/report.css)*/', '/*REPORT-CSS-FINE*/', css);
  put('/*TEMA-INIZIO (da src/tema.css)*/', '/*TEMA-FINE*/', tema);
  fs.writeFileSync(p, s);
  console.log('aggiornato', f);
}
// CALC_SISTEM usa solo il tema grafico
{
  const p = path.join(root, 'calc/Calc_Sistem.html');
  let s = fs.readFileSync(p, 'utf8');
  const a = '/*TEMA-INIZIO (da src/tema.css)*/', b = '/*TEMA-FINE*/', i = s.indexOf(a), j = s.indexOf(b);
  if (i < 0 || j < i) throw new Error('Calc_Sistem.html: marcatori del tema non trovati');
  fs.writeFileSync(p, s.slice(0, i + a.length) + '\n' + tema + '\n' + s.slice(j));
  console.log('aggiornato', 'calc/Calc_Sistem.html');
}
