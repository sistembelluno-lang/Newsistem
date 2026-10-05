// Crea la pagina di prova per claude.ai: Controllo Lavori con dentro il programma Ore Dipendenti,
// così la prova non dipende da un secondo file. Uso: node scripts/build-prova.js <file di uscita>
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'Controllo_Lavori.html'), 'utf8');
const ore = fs.readFileSync(path.join(root, 'Ore_Dipendenti.html'), 'utf8');
const inj = '<script>window.__ORE_HTML=' + JSON.stringify(ore).replace(/<\//g, '<\\/').replace(/<!--/g, '<\\!--') + ';</script>\n';
let out = main.replace('<title>Controllo Lavori</title>', '<title>Controllo Lavori prova</title>');
const i = out.indexOf('<script>');
out = out.slice(0, i) + inj + out.slice(i);
fs.writeFileSync(process.argv[2], out);
console.log('scritto', process.argv[2], out.length, 'byte');
