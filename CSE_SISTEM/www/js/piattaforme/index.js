// Sceglie il "disco" e i servizi del dispositivo su cui gira il programma.

import { discoInMemoria } from './memoria.js';
import { discoElectron, serviziElectron } from './electron.js';
import { discoCapacitor, serviziCapacitor } from './capacitor.js';

export function rileva(g = globalThis) {
  if (g.cseNative) return 'windows';
  if (g.Capacitor?.isNativePlatform?.()) return 'android';
  return 'prova';
}

export function piattaforma(g = globalThis) {
  const tipo = rileva(g);
  if (tipo === 'windows') return { tipo, disco: discoElectron(g.cseNative), servizi: serviziElectron(g.cseNative) };
  if (tipo === 'android') return { tipo, disco: discoCapacitor(g.Capacitor), servizi: serviziCapacitor(g.Capacitor) };
  return { tipo, disco: discoInMemoria(), servizi: {} };
}
