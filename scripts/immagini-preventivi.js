// Inserisce logo e timbro (assets/*.png) dentro Preventivi.html, che deve restare un file unico e autonomo.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), f = path.join(root, 'Preventivi.html');
const b64 = (n) => 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'assets', n)).toString('base64');
let s = fs.readFileSync(f, 'utf8');
const a = '/*IMMAGINI-INIZIO (da assets/: node scripts/immagini-preventivi.js)*/', b = '/*IMMAGINI-FINE*/';
const i = s.indexOf(a), j = s.indexOf(b);
if (i < 0 || j < i) throw new Error('marcatori non trovati');
s = s.slice(0, i + a.length) + '\nconst IMG={logo:' + JSON.stringify(b64('logo.png')) + ',\ntimbro:' + JSON.stringify(b64('timbro.png')) + '};\n' + s.slice(j);
fs.writeFileSync(f, s);
console.log('aggiornato Preventivi.html');
