const db = require('./db');

function getAll() {
  const rows = db.prepare('SELECT clave, valor FROM settings').all();
  const obj = {};
  for (const r of rows) obj[r.clave] = r.valor;
  return obj;
}

function get(clave) {
  const row = db.prepare('SELECT valor FROM settings WHERE clave = ?').get(clave);
  return row ? row.valor : null;
}

function set(clave, valor) {
  const exists = db.prepare('SELECT 1 FROM settings WHERE clave = ?').get(clave);
  if (exists) {
    db.prepare('UPDATE settings SET valor = ? WHERE clave = ?').run(String(valor), clave);
  } else {
    db.prepare('INSERT INTO settings (clave, valor) VALUES (?, ?)').run(clave, String(valor));
  }
}

function setMany(obj) {
  for (const [k, v] of Object.entries(obj)) set(k, v);
}

module.exports = { getAll, get, set, setMany };
