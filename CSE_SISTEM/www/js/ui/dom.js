// Piccoli aiuti per costruire l'interfaccia senza librerie.

/** h('div', { class: 'x', onclick: f }, 'testo', figlio, ...) */
export function h(tag, attributi = {}, ...figli) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attributi || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const f of figli.flat()) {
    if (f === undefined || f === null || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return el;
}

/** Modulo costruito da un elenco di campi (core/modelli.js CAMPI_*). */
export function modulo(campi, valori = {}, onSalva) {
  const form = h('form', { class: 'modulo' });
  for (const c of campi) {
    if (c.tipo === 'persona' || c.tipo === 'persone') continue; // editor dedicati (da fare con la grafica)
    const id = `campo-${c.chiave}`;
    const tipoInput = { data: 'date', numero: 'number', importo: 'number' }[c.tipo] || 'text';
    const valore = valori[c.chiave] ?? '';
    const input = c.tipo === 'testo_lungo'
      ? h('textarea', { id, name: c.chiave, rows: 3 }, valore)
      : h('input', { id, name: c.chiave, type: tipoInput, value: valore, required: c.obbligatorio, step: c.tipo === 'importo' ? '0.01' : undefined });
    form.append(h('label', { for: id }, c.etichetta, c.rif ? h('span', { class: 'rif' }, ` (${c.rif})`) : null), input);
  }
  form.append(h('button', { type: 'submit' }, 'Salva'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const dati = {};
    for (const c of campi) {
      const el = form.elements[c.chiave];
      if (!el) continue;
      dati[c.chiave] = ['numero', 'importo'].includes(c.tipo) ? (el.value === '' ? null : Number(el.value)) : el.value;
    }
    onSalva(dati);
  });
  return form;
}

export function avviso(testo, tipo = 'info') {
  const el = h('div', { class: `avviso ${tipo}` }, testo);
  document.body.append(el);
  setTimeout(() => el.remove(), 4000);
}
