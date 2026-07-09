const express = require('express');
const multer = require('multer');
const db = require('../db');
const currency = require('../currency');
const { parseCSV, pick } = require('../utils/csv');
const router = express.Router();

const uploadCsv = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  let rows;
  if (q) {
    rows = db.prepare('SELECT * FROM mano_obra WHERE descripcion LIKE ? ORDER BY id DESC').all(`%${q}%`);
  } else {
    rows = db.prepare('SELECT * FROM mano_obra ORDER BY id DESC').all();
  }
  res.json(rows);
});

router.post('/', async (req, res) => {
  try {
    const { descripcion, precio_usd } = req.body;
    if (!descripcion || precio_usd === undefined) return res.status(400).json({ error: 'Descripción y precio en USD son obligatorios' });
    const precio_ars = await currency.convertirUsdArs(precio_usd);
    const info = db.prepare('INSERT INTO mano_obra (descripcion, precio_usd, precio_ars) VALUES (?, ?, ?)')
      .run(descripcion, Number(precio_usd), precio_ars);
    res.status(201).json(db.prepare('SELECT * FROM mano_obra WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  const existing = db.prepare('SELECT * FROM mano_obra WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'No encontrado' });
  const { descripcion, precio_usd } = req.body;
  const usd = precio_usd !== undefined ? Number(precio_usd) : existing.precio_usd;
  const precio_ars = await currency.convertirUsdArs(usd);
  db.prepare('UPDATE mano_obra SET descripcion=?, precio_usd=?, precio_ars=? WHERE id=?')
    .run(descripcion ?? existing.descripcion, usd, precio_ars, req.params.id);
  res.json(db.prepare('SELECT * FROM mano_obra WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM mano_obra WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/recalcular-todos', async (req, res) => {
  const rows = db.prepare('SELECT * FROM mano_obra').all();
  for (const m of rows) {
    const ars = await currency.convertirUsdArs(m.precio_usd, true);
    db.prepare('UPDATE mano_obra SET precio_ars=? WHERE id=?').run(ars, m.id);
  }
  res.json({ ok: true, actualizados: rows.length });
});

// importación masiva desde CSV
// columnas admitidas (alias): descripcion/detalle/item*, precio_usd/precio*
// si la descripción ya existe (igual, sin importar mayúsculas) actualiza el precio en vez de duplicarlo
router.post('/import', uploadCsv.single('csv'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Subí un archivo CSV' });

  let filas;
  try {
    filas = parseCSV(req.file.buffer.toString('utf8'));
  } catch (e) {
    return res.status(400).json({ error: 'No se pudo leer el CSV: ' + e.message });
  }
  if (!filas.length) return res.status(400).json({ error: 'El CSV no tiene filas de datos' });

  const { tasa } = await currency.getTasaCambio();

  const findByDescripcion = db.prepare('SELECT id FROM mano_obra WHERE LOWER(descripcion) = LOWER(?)');
  const insert = db.prepare('INSERT INTO mano_obra (descripcion, precio_usd, precio_ars) VALUES (?, ?, ?)');
  const update = db.prepare('UPDATE mano_obra SET precio_usd=?, precio_ars=? WHERE id=?');

  let creados = 0, actualizados = 0;
  const errores = [];

  for (const fila of filas) {
    const descripcion = pick(fila, ['descripcion', 'detalle', 'item']);
    const precioStr = pick(fila, ['precio_usd', 'precio']).replace(',', '.');
    const precio_usd = Number(precioStr);
    if (!descripcion || !precioStr || isNaN(precio_usd)) {
      errores.push({ fila: fila.__fila, motivo: 'Falta descripción o precio_usd válido' });
      continue;
    }
    const precio_ars = Math.round(precio_usd * tasa * 100) / 100;

    try {
      const existing = findByDescripcion.get(descripcion);
      if (existing) {
        update.run(precio_usd, precio_ars, existing.id);
        actualizados++;
      } else {
        insert.run(descripcion, precio_usd, precio_ars);
        creados++;
      }
    } catch (e) {
      errores.push({ fila: fila.__fila, motivo: e.message });
    }
  }

  res.json({ ok: true, creados, actualizados, errores });
});

module.exports = router;
