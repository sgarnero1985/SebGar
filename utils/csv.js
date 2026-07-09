// Parser CSV liviano, sin dependencias externas.
// Soporta: separador coma o punto y coma (auto-detección), campos entre comillas
// (con comas/saltos de línea adentro), comillas escapadas ("") y BOM de Excel.

function normalizeHeader(h) {
  return (h || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function parseCSV(text) {
  if (!text) return [];
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // BOM

  const firstLine = text.split(/\r\n|\n/)[0] || '';
  const semis = (firstLine.match(/;/g) || []).length;
  const comas = (firstLine.match(/,/g) || []).length;
  const delim = semis > comas ? ';' : ',';

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field); field = '';
    } else if (c === '\r') {
      // se ignora, el \n siguiente cierra la fila
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  while (rows.length && rows[rows.length - 1].every(v => v.trim() === '')) rows.pop();
  if (!rows.length) return [];

  const header = rows[0].map(normalizeHeader);
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const rawRow = rows[r];
    if (rawRow.every(v => v.trim() === '')) continue;
    const obj = {};
    header.forEach((h, idx) => { if (h) obj[h] = (rawRow[idx] ?? '').trim(); });
    obj.__fila = r + 1; // número de línea real (1 = encabezado)
    out.push(obj);
  }
  return out;
}

// Devuelve el primer valor no vacío entre varios nombres de columna posibles (alias)
function pick(obj, keys) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== '') return String(obj[k]).trim();
  }
  return '';
}

function csvField(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",;\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// columns: [{ header: 'Nombre', value: row => row.nombre }, ...]
// devuelve el texto CSV (con BOM al inicio para que Excel abra bien los acentos)
function toCSV(columns, rows) {
  const header = columns.map(c => csvField(c.header)).join(',');
  const lines = rows.map(row => columns.map(c => csvField(c.value(row))).join(','));
  return '\uFEFF' + [header, ...lines].join('\r\n');
}

module.exports = { parseCSV, normalizeHeader, pick, toCSV };
