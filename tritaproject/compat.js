// Compatibilità con Windows 7: la versione 32 bit usa Electron 22 (Node 16), che non ha ancora fetch, gli stream web
// e File come globali. La libreria di Claude li richiede: qui si aggiungono solo se mancano.
if (typeof globalThis.ReadableStream === 'undefined') {
  const w = require('stream/web');
  for (const k of ['ReadableStream', 'WritableStream', 'TransformStream', 'TextDecoderStream', 'TextEncoderStream']) if (w[k] && !globalThis[k]) globalThis[k] = w[k];
}
if (typeof globalThis.Blob === 'undefined') globalThis.Blob = require('buffer').Blob;
if (typeof globalThis.fetch === 'undefined') {
  const u = require('undici');
  for (const k of ['fetch', 'Headers', 'Request', 'Response', 'FormData', 'File']) if (!globalThis[k]) globalThis[k] = u[k];
}
if (typeof globalThis.File === 'undefined') globalThis.File = require('undici').File;
if (typeof globalThis.structuredClone === 'undefined') {
  const v8 = require('v8');
  globalThis.structuredClone = (v) => (v === undefined ? v : v8.deserialize(v8.serialize(v)));
}
