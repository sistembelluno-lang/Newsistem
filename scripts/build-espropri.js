// Costruisce Espropri.html (file unico e autonomo, funziona anche senza rete) da espropri/index.html ed espropri/src/.
// Uso: node scripts/build-espropri.js            → Espropri.html
//      node scripts/build-espropri.js --demo F   → F con una pratica d'esempio già caricata (dati fittizi di espropri/esempi)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), src = path.join(root, 'espropri', 'src');
const leggi = p => fs.readFileSync(p, 'utf8');
// Nel testo degli script: niente «</script», niente «<!--», e il carattere U+FFFD della libreria PDF scritto come escape
const script = s => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--').replace(/\uFFFD/g, '\\ufffd');
let html = leggi(path.join(root, 'espropri', 'index.html'));
const put = (a, b, body) => {
  const i = html.indexOf(a), j = b ? html.indexOf(b, i) : i + a.length;
  if (i < 0 || j < i) throw new Error('marcatore ' + a + ' non trovato');
  html = html.slice(0, i + a.length) + '\n' + body + '\n' + html.slice(j);
};
put('/*STILE*/', null, leggi(path.join(src, 'stile.css')));
put('/*REPORT-CSS-INIZIO (da src/report.css)*/', '/*REPORT-CSS-FINE*/', leggi(path.join(root, 'src', 'report.css')).trim());
put('/*TEMA-INIZIO (da src/tema.css)*/', '/*TEMA-FINE*/', leggi(path.join(root, 'src', 'tema.css')).trim());
// Il tema rende la barra alta 62 px: la colonna di sinistra resta sotto la barra
put('/*STILE-DOPO*/', null, '.nav{top:62px}');
const lib = f => leggi(path.join(root, 'node_modules', f));
const librerie = ['/* polygon-clipping 0.15.7 – MIT – Mike Fogel */', lib('polygon-clipping/dist/polygon-clipping.umd.min.js'),
  '/* pdf-lib 1.17.1 – MIT – Andrew Dillon */', lib('pdf-lib/dist/pdf-lib.min.js')].join('\n');
const ordine = JSON.parse(leggi(path.join(src, 'ordine.json')));
let moduli = ordine.concat(['normativa.js', 'app.js', 'app2.js']).map(f => '/* ---- ' + f + ' ---- */\n' + leggi(path.join(src, f))).join('\n')
  .replace(/^if \(typeof module !== 'undefined'\) module\.exports = ES;$/m, '');
const demo = process.argv.indexOf('--demo');
if (demo > 0) {
  const es = path.join(root, 'espropri', 'esempi');
  moduli += '\nwindow.__DEMO=' + JSON.stringify({ dxf: leggi(path.join(es, 'esempio.dxf')), csv: leggi(path.join(es, 'ditte.csv')) }) + ';';
}
moduli += '\nAPP.avvia();';
html = html.replace('<script>/*LIBRERIE*/</script>', () => '<script>\n' + script(librerie) + '\n</script>').replace('<script>/*MODULI*/</script>', () => '<script>\n' + script(moduli) + '\n</script>');
const out = demo > 0 ? path.resolve(process.argv[demo + 1]) : path.join(root, 'Espropri.html');
if (demo > 0) html = html.replace('<title>ESPROPRI_SISTEM</title>', '<title>ESPROPRI_SISTEM prova</title>');
fs.writeFileSync(out, html);
console.log('scritto', out, Math.round(html.length / 1024), 'KB');
