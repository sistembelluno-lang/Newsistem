// Markdown essenziale per le risposte di Claude: titoli, grassetto, corsivo, codice, elenchi, tabelle, collegamenti.
function md(src) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inl = (s) => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
    .replace(/(^|[\s(])_([^_\s][^_]*)_(?=[\s.,;:)!?]|$)/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
  const righe = String(src || '').replace(/\r/g, '').split('\n');
  const out = [];
  let lista = null, para = [];
  const chiudiPara = () => { if (para.length) { out.push('<p>' + para.map(inl).join('<br>') + '</p>'); para = []; } };
  const chiudiLista = () => { if (lista) { out.push(`</${lista}>`); lista = null; } };
  for (let i = 0; i < righe.length; i++) {
    const r = righe[i];
    if (/^```/.test(r)) {
      chiudiPara(); chiudiLista();
      const cod = [];
      while (++i < righe.length && !/^```/.test(righe[i])) cod.push(righe[i]);
      out.push('<pre><code>' + esc(cod.join('\n')) + '</code></pre>');
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(r) && /^\s*\|?\s*:?-{2,}/.test(righe[i + 1] || '')) {
      chiudiPara(); chiudiLista();
      const celle = (x) => x.trim().replace(/^\||\|$/g, '').split('|').map((c) => inl(c.trim()));
      let t = '<table><thead><tr>' + celle(r).map((c) => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
      i++;
      while (i + 1 < righe.length && /^\s*\|.*\|\s*$/.test(righe[i + 1])) t += '<tr>' + celle(righe[++i]).map((c) => `<td>${c}</td>`).join('') + '</tr>';
      out.push(t + '</tbody></table>');
      continue;
    }
    const h = r.match(/^(#{1,4})\s+(.*)/);
    if (h) { chiudiPara(); chiudiLista(); out.push(`<h${Math.min(3, h[1].length)}>${inl(h[2])}</h${Math.min(3, h[1].length)}>`); continue; }
    const li = r.match(/^\s*([-*•]|\d+[.)])\s+(.*)/);
    if (li) {
      chiudiPara();
      const tipo = /\d/.test(li[1]) ? 'ol' : 'ul';
      if (lista !== tipo) { chiudiLista(); out.push(`<${tipo}>`); lista = tipo; }
      out.push(`<li>${inl(li[2])}</li>`);
      continue;
    }
    if (!r.trim()) { chiudiPara(); chiudiLista(); continue; }
    if (/^---+$/.test(r.trim())) { chiudiPara(); chiudiLista(); out.push('<hr>'); continue; }
    chiudiLista();
    para.push(r);
  }
  chiudiPara(); chiudiLista();
  return out.join('\n');
}
