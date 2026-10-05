// Copia src/condiviso.js e src/report.css dentro i due HTML (che devono restare file unici e autonomi).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'src/condiviso.js'), 'utf8').trim();
const css = fs.readFileSync(path.join(root, 'src/report.css'), 'utf8').trim();
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
  fs.writeFileSync(p, s);
  console.log('aggiornato', f);
}
