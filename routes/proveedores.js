const express = require('express');
const multer = require('multer');
const db = require('../db');
const { parseCSV, pick, toCSV } = require('../utils/csv');
const router = express.Router();

const uploadCsv = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  let rows;
  if (q) {
    const like = `%${q}%`;
    rows = db.prepare(`
      SELECT * FROM proveedores
      WHERE nombre LIKE ? OR contacto LIKE ? OR cuit LIKE ?
      ORDER BY nombre
    `).all(like, like, like);
  } else {
    rows = db.prepare('SELECT * FROM proveedores ORDER BY nombre').all();
  }
  res.json(rows);
});

router.get('/export', (req, res) => {
  const rows = db.prepare('SELECT * FROM proveedores ORDER BY nombre').all();
  const csv = toCSV([
    { header: 'nombre', value: r => r.nombre },
    { header: 'contacto', value: r => r.contacto },
    { header: 'telefono', value: r => r.telefono },
    { header: 'email', value: r => r.email },
    { header: 'direccion', value: r => r.direccion },
    { header: 'cuit', value: r => r.cuit },
    { header: 'notas', value: r => r.notas }
  ], rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="proveedores.csv"');
  res.send(csv);
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM proveedores WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  res.json(row);
});

router.post('/', (req, res) => {
  const { nombre, contacto, telefono, email, direccion, cuit, notas } = req.body;
  if (!nombre) return res.status(400).json({ error: 'El nombre del proveedor es obligatorio' });
  const info = db.prepare(`
    INSERT INTO proveedores (nombre, contacto, telefono, email, direccion, cuit, notas)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(nombre, contacto || null, telefono || null, email || null, direccion || null, cuit || null, notas || null);
  const row = db.prepare('SELECT * FROM proveedores WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM proveedores WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'No encontrado' });
  const { nombre, contacto, telefono, email, direccion, cuit, notas } = req.body;
  if (nombre !== undefined && !nombre) return res.status(400).json({ error: 'El nombre del proveedor es obligatorio' });
  db.prepare(`
    UPDATE proveedores SET nombre=?, contacto=?, telefono=?, email=?, direccion=?, cuit=?, notas=?
    WHERE id=?
  `).run(
    nombre ?? existing.nombre,
    contacto ?? existing.contacto,
    telefono ?? existing.telefono,
    email ?? existing.email,
    direccion ?? existing.direccion,
    cuit ?? existing.cuit,
    notas ?? existing.notas,
    req.params.id
  );
  const row = db.prepare('SELECT * FROM proveedores WHERE id = ?').get(req.params.id);
  res.json(row);
});

router.delete('/:id', (req, res) => {
  try {
    // los productos que tenían asignado este proveedor quedan sin proveedor (no se borran)
    db.prepare('UPDATE productos SET proveedor_id = NULL WHERE proveedor_id = ?').run(req.params.id);
    db.prepare('DELETE FROM proveedores WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    if (String(e.message).includes('FOREIGN KEY')) {
      return res.status(409).json({ error: 'No se puede eliminar: este proveedor tiene órdenes de compra registradas.' });
    }
    res.status(500).json({ error: e.message });
  }
});

// importación masiva desde CSV
// columnas admitidas (alias): nombre*, contacto, telefono/tel, email, direccion, cuit, notas
// si el nombre ya existe (igual, sin importar mayúsculas) actualiza ese proveedor en vez de duplicarlo
router.post('/import', uploadCsv.single('csv'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Subí un archivo CSV' });

  let filas;
  try {
    filas = parseCSV(req.file.buffer.toString('utf8'));
  } catch (e) {
    return res.status(400).json({ error: 'No se pudo leer el CSV: ' + e.message });
  }
  if (!filas.length) return res.status(400).json({ error: 'El CSV no tiene filas de datos' });

  const findByNombre = db.prepare('SELECT id FROM proveedores WHERE LOWER(nombre) = LOWER(?)');
  const insert = db.prepare(`
    INSERT INTO proveedores (nombre, contacto, telefono, email, direccion, cuit, notas)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const update = db.prepare(`
    UPDATE proveedores SET contacto=?, telefono=?, email=?, direccion=?, cuit=?, notas=? WHERE id=?
  `);

  let creados = 0, actualizados = 0;
  const errores = [];

  for (const fila of filas) {
    const nombre = pick(fila, ['nombre']);
    if (!nombre) {
      errores.push({ fila: fila.__fila, motivo: 'Falta el nombre' });
      continue;
    }
    const contacto = pick(fila, ['contacto']) || null;
    const telefono = pick(fila, ['telefono', 'tel']) || null;
    const email = pick(fila, ['email']) || null;
    const direccion = pick(fila, ['direccion']) || null;
    const cuit = pick(fila, ['cuit']) || null;
    const notas = pick(fila, ['notas']) || null;

    try {
      const existente = findByNombre.get(nombre);
      if (existente) {
        update.run(contacto, telefono, email, direccion, cuit, notas, existente.id);
        actualizados++;
      } else {
        insert.run(nombre, contacto, telefono, email, direccion, cuit, notas);
        creados++;
      }
    } catch (e) {
      errores.push({ fila: fila.__fila, motivo: e.message });
    }
  }

  res.json({ ok: true, creados, actualizados, errores });
});

module.exports = router;
