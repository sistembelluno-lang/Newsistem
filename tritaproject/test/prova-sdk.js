// Prova del collegamento con Claude senza Internet: un finto server Anthropic locale risponde in streaming
// (testo + uso di uno strumento) e accetta il caricamento di un file. Serve soprattutto a verificare che la
// libreria funzioni anche su Electron 22 / Node 16 (versione per Windows 7):
//   node test/prova-sdk.js
//   ELECTRON_RUN_AS_NODE=1 <electron 22> test/prova-sdk.js
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const sse = (eventi) => eventi.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
const messaggio = (blocchi, stop) => {
  const ev = [{ type: 'message_start', message: { id: 'msg_prova', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } }];
  blocchi.forEach((b, i) => {
    if (b.type === 'text') {
      ev.push({ type: 'content_block_start', index: i, content_block: { type: 'text', text: '' } });
      for (const pezzo of b.text.match(/.{1,6}/g)) ev.push({ type: 'content_block_delta', index: i, delta: { type: 'text_delta', text: pezzo } });
    } else {
      ev.push({ type: 'content_block_start', index: i, content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} } });
      const j = JSON.stringify(b.input);
      ev.push({ type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: j.slice(0, 5) } });
      ev.push({ type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: j.slice(5) } });
    }
    ev.push({ type: 'content_block_stop', index: i });
  });
  ev.push({ type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 20 } }, { type: 'message_stop' });
  return sse(ev);
};

const richieste = [];
const server = http.createServer((req, res) => {
  let corpo = [];
  req.on('data', (c) => corpo.push(c));
  req.on('end', () => {
    corpo = Buffer.concat(corpo);
    richieste.push({ url: req.url, tipo: req.headers['content-type'], beta: req.headers['anthropic-beta'] || '', corpo });
    if (req.url.startsWith('/v1/files')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ id: 'file_prova', type: 'file', filename: 'x.pdf', mime_type: 'application/pdf', size_bytes: corpo.length, created_at: new Date().toISOString() }));
    }
    // come l'API vera: un blocco di ragionamento di una conversazione diversa viene rifiutato (errore 400)
    if (corpo.includes('"type":"thinking"')) {
      res.writeHead(400, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'messages.1.content.0: Invalid `signature` in `thinking` block. The block is bound to a different conversation. Remove the block, or set `thinking.block_binding.prefix_mismatch_behavior` to "drop_block".' } }));
    }
    const n = richieste.filter((r) => r.url.startsWith('/v1/messages') && !r.corpo.includes('"type":"thinking"')).length;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(n === 1
      ? messaggio([{ type: 'text', text: 'Annoto il dato. ' }, { type: 'tool_use', id: 'tu_1', name: 'annota_progetto', input: { nota: 'Muro sp. 40 cm (D01)' } }], 'tool_use')
      : messaggio([{ type: 'text', text: 'Fatto: il muro è spesso 40 cm.' }], 'end_turn'));
  });
});

server.listen(0, '127.0.0.1', async () => {
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  const ai = require('../ai');
  try {
    const cl = ai.client('chiave-di-prova');
    // caricamento di un file (Files API)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-sdk-'));
    fs.writeFileSync(path.join(dir, 'tavola.pdf'), '%PDF-1.4 prova');
    const doc = { id: 'D01', nome: 'tavola.pdf', file: 'tavola.pdf', tipo: 'application/pdf', parti: [{ da: 1, a: 1, file_id: '' }] };
    await ai.caricaDocumento(cl, 'k', dir, doc);
    assert.strictEqual(doc.parti[0].file_id, 'file_prova');
    assert.ok(richieste[0].tipo.startsWith('multipart/form-data') && richieste[0].corpo.includes('%PDF-1.4 prova'));
    // conversazione in streaming con uno strumento
    // conversazione salvata con una versione precedente: contiene un ragionamento che l'API non accetta più
    const p = { nome: 'Prova', note: '', documenti: [doc], messaggi: [{ role: 'user', content: 'Ciao' }, { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'vecchia' }, { type: 'text', text: 'Ciao!' }] }] };
    let testo = '';
    const eseguiti = [];
    await ai.conversa({
      cl, cfg: { modello: 'claude-opus-5-5', impegno: 'high' }, progetto: p, testo: 'Quanto è spesso il muro?', segnale: {}, salva() {},
      evento: (e) => { if (e.tipo === 'testo') testo += e.testo; },
      esegui: async (nome, inp) => { eseguiti.push([nome, inp]); return 'Nota salvata.'; },
    });
    assert.deepStrictEqual(eseguiti, [['annota_progetto', { nota: 'Muro sp. 40 cm (D01)' }]]);
    assert.ok(testo.includes('Annoto il dato.') && testo.includes('40 cm'));
    assert.deepStrictEqual(p.messaggi.map((m) => m.role), ['user', 'assistant', 'user', 'assistant', 'user', 'assistant']);
    // riparazione: il ragionamento vecchio è stato tolto, il resto della cronologia è intatto
    assert.deepStrictEqual(p.messaggi[1].content, [{ type: 'text', text: 'Ciao!' }]);
    const msg = richieste.filter((r) => r.url.startsWith('/v1/messages'));
    assert.strictEqual(msg.length, 3); // rifiutata, ripetuta dopo la riparazione, seconda dopo lo strumento
    const [r1, r2] = msg.slice(1).map((r) => JSON.parse(r.corpo));
    // istruzioni di sistema identiche fra le richieste, contesto del progetto nel messaggio dell'utente
    assert.deepStrictEqual(r1.system, r2.system);
    assert.ok(!JSON.stringify(r1.system).includes('Prova') && JSON.stringify(r1.messages[2].content[0]).includes('<contesto_progetto>'));
    assert.deepStrictEqual(r1.thinking, { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } });
    assert.ok(msg[1].beta.includes('thinking-binding-controls-2026-08-01'));
    assert.strictEqual(r2.messages[4].content[0].type, 'tool_result');
    // la cronologia della seconda richiesta comincia esattamente come la prima (si aggiunge solo in coda)
    assert.deepStrictEqual(r2.messages.slice(0, r1.messages.length), r1.messages);
    console.log(`sdk: tutto ok (Node ${process.versions.node}${process.versions.electron ? `, Electron ${process.versions.electron}` : ''})`);
  } catch (e) {
    console.error('sdk: PROVA FALLITA', e);
    process.exitCode = 1;
  }
  server.close();
});
