// Prova delle funzioni pure degli elaborati: node test/prova-elaborati.js [cartella di uscita]
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const el = require('../elaborati');

const out = process.argv[2] || path.join(__dirname, 'uscita');
fs.mkdirSync(out, { recursive: true });
const t = JSON.parse(fs.readFileSync(path.join(__dirname, 'tavola-esempio.json'), 'utf8'));

assert.deepStrictEqual(el.controllaTavola(t), []);
assert.ok(el.controllaTavola({ entita: [{ tipo: 'linea', punti: [[0, 0]] }, { tipo: 'boh' }] }).length === 2);
const g = el.impaginazione(t);
assert.strictEqual(g.scala, 25);
assert.ok(/non entra/.test(el.impaginazione({ ...t, scala: 1 }).nota));
const dxf = el.dxfTavola(t);
const dxfTesto = dxf.toString('latin1');
assert.ok(dxfTesto.startsWith('0\r\nSECTION') && dxfTesto.trim().endsWith('EOF'));
// Ø e à stanno nella codifica di Windows, € no e diventa \U+20AC
assert.ok(el.dxfTavola({ entita: [{ tipo: 'testo', pos: [0, 0], testo: 'Ø10 à €' }] }).toString('latin1').includes('Ø10 à \\U+20AC'));
fs.writeFileSync(path.join(out, 'tavola-viste.dxf'), el.dxfTavola(JSON.parse(fs.readFileSync(path.join(__dirname, 'tavola-viste.json'), 'utf8'))));
fs.writeFileSync(path.join(out, 'tavola.dxf'), dxf);
fs.writeFileSync(path.join(out, 'tavola.svg'), el.svgTavola(t, { progetto: 'Prova', data: '20/10/2026' }));
assert.ok(el.csvTabella({ colonne: ['a', 'b'], righe: [[1.5, 'x;y']] }).includes('1,5;"x;y"'));
assert.ok(el.svgSchema('testo <svg viewBox="0 0 10 10" onclick="x()"><script>a</script></svg> coda').startsWith('<svg xmlns'));
assert.throws(() => el.svgSchema('niente'));
assert.strictEqual(el.nomeFile('Relazione: fasi/cantiere.pdf', 'pdf'), 'Relazione_ fasi_cantiere.pdf');
console.log('elaborati: tutto ok →', out);
