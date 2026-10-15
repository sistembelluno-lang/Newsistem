// Carica i moduli del programma in Node (come nella pagina, nello stesso ordine)
globalThis.polygonClipping = require('polygon-clipping');
const ORDINE = require('../src/ordine.json');
for (const f of ORDINE) require('../src/' + f);
module.exports = globalThis.ES;
