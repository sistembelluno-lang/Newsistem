// Identificativi delle registrazioni: ordinabili nel tempo e diversi tra
// dispositivi (un telefono e un PC che lavorano sullo stesso cantiere non
// generano mai lo stesso identificativo).

let ultimo = '';
let contatore = 0;

export function nuovoId(adesso = new Date()) {
  const t = adesso.getTime().toString(36).padStart(9, '0');
  contatore = t === ultimo ? contatore + 1 : 0;
  ultimo = t;
  const caso = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
  return `${t}${contatore.toString(36)}${caso}`;
}
