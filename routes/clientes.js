const express = require('express');
const multer = require('multer');
const db = require('../db');
const { parseCSV, pick } = require('../utils/csv');
const router = express.Router();

const uploadCsv = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function nextNumeroCliente() {
  const row = db.prepare('SELECT MAX(numero_cliente) as m FROM clientes').get();
  return (row.m || 0) + 1;
}

router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  let rows;
  if (q) {
    const like = `%${q}%`;
    rows = db.prepare(`
      SELECT * FROM clientes
      WHERE nombre LIKE ? OR apellido LIKE ? OR doc_numero LIKE ? OR numero_cliente = ?
      ORDER BY numero_cliente DESC
    `).all(like, like, like, isNaN(q) ? -1 : Number(q));
  } else {
    rows = db.prepare('SELECT * FROM clientes ORDER BY numero_cliente DESC').all();
  }
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  res.json(row);
});

router.post('/', (req, res) => {
  const { nombre, apellido, doc_tipo, doc_numero, direccion, telefono, localidad, provincia, pais } = req.body;
  if (!nombre || !apellido) return res.status(400).json({ error: 'Nombre y apellido son obligatorios' });
  const numero_cliente = nextNumeroCliente();
  const info = db.prepare(`
    INSERT INTO clientes (numero_cliente, nombre, apellido, doc_tipo, doc_numero, direccion, telefono, localidad, provincia, pais)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(numero_cliente, nombre, apellido, doc_tipo || null, doc_numero || null, direccion || null, telefono || null, localidad || null, provincia || null, pais || 'Argentina');
  const row = db.prepare('SELECT * FROM clientes WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'No encontrado' });
  const { nombre, apellido, doc_tipo, doc_numero, direccion, telefono, localidad, provincia, pais } = req.body;
  db.prepare(`
    UPDATE clientes SET nombre=?, apellido=?, doc_tipo=?, doc_numero=?, direccion=?, telefono=?, localidad=?, provincia=?, pais=?
    WHERE id=?
  `).run(
    nombre ?? existing.nombre,
    apellido ?? existing.apellido,
    doc_tipo ?? existing.doc_tipo,
    doc_numero ?? existing.doc_numero,
    direccion ?? existing.direccion,
    telefono ?? existing.telefono,
    localidad ?? existing.localidad,
    provincia ?? existing.provincia,
    pais ?? existing.pais,
    req.params.id
  );
  const row = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  res.json(row);
});

router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM clientes WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    if (String(e.message).includes('FOREIGN KEY')) {
      return res.status(409).json({ error: 'No se puede eliminar: este cliente tiene facturas, presupuestos o turnos asociados.' });
    }
    res.status(500).json({ error: e.message });
  }
});

// importación masiva desde CSV
// columnas admitidas (alias, sin distinguir mayúsculas/acentos): nombre*, apellido*,
// doc_tipo/tipo_documento, doc_numero/numero_documento/documento/dni/cuit/cuil,
// telefono, direccion, localidad/ciudad, provincia, pais
// si el doc_numero ya existe en la base, actualiza ese cliente en vez de duplicarlo
router.post('/import', uploadCsv.single('csv'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Subí un archivo CSV' });

  let filas;
  try {
    filas = parseCSV(req.file.buffer.toString('utf8'));
  } catch (e) {
    return res.status(400).json({ error: 'No se pudo leer el CSV: ' + e.message });
  }
  if (!filas.length) return res.status(400).json({ error: 'El CSV no tiene filas de datos' });

  const findByDoc = db.prepare(`SELECT id FROM clientes WHERE doc_numero = ? AND doc_numero IS NOT NULL AND doc_numero != ''`);
  const insert = db.prepare(`
    INSERT INTO clientes (numero_cliente, nombre, apellido, doc_tipo, doc_numero, direccion, telefono, localidad, provincia, pais)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const update = db.prepare(`
    UPDATE clientes SET nombre=?, apellido=?, doc_tipo=?, doc_numero=?, direccion=?, telefono=?, localidad=?, provincia=?, pais=?
    WHERE id=?
  `);

  let creados = 0, actualizados = 0;
  const errores = [];

  for (const fila of filas) {
    const nombre = pick(fila, ['nombre']);
    const apellido = pick(fila, ['apellido']);
    if (!nombre || !apellido) {
      errores.push({ fila: fila.__fila, motivo: 'Falta nombre o apellido' });
      continue;
    }
    const doc_tipo = pick(fila, ['doc_tipo', 'tipo_documento', 'tipo_doc']) || null;
    const doc_numero = pick(fila, ['doc_numero', 'numero_documento', 'documento', 'dni', 'cuit', 'cuil']) || null;
    const direccion = pick(fila, ['direccion']) || null;
    const telefono = pick(fila, ['telefono', 'tel']) || null;
    const localidad = pick(fila, ['localidad', 'ciudad']) || null;
    const provincia = pick(fila, ['provincia']) || null;
    const pais = pick(fila, ['pais']) || 'Argentina';

    try {
      const existing = doc_numero ? findByDoc.get(doc_numero) : null;
      if (existing) {
        update.run(nombre, apellido, doc_tipo, doc_numero, direccion, telefono, localidad, provincia, pais, existing.id);
        actualizados++;
      } else {
        insert.run(nextNumeroCliente(), nombre, apellido, doc_tipo, doc_numero, direccion, telefono, localidad, provincia, pais);
        creados++;
      }
    } catch (e) {
      errores.push({ fila: fila.__fila, motivo: e.message });
    }
  }

  res.json({ ok: true, creados, actualizados, errores });
});

module.exports = router;
