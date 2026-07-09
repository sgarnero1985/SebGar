const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  const { fecha, desde, hasta } = req.query;
  let rows;
  if (fecha) {
    rows = db.prepare('SELECT * FROM turnos WHERE fecha = ? ORDER BY hora ASC').all(fecha);
  } else if (desde && hasta) {
    rows = db.prepare('SELECT * FROM turnos WHERE fecha BETWEEN ? AND ? ORDER BY fecha ASC, hora ASC').all(desde, hasta);
  } else {
    rows = db.prepare('SELECT * FROM turnos ORDER BY fecha ASC, hora ASC').all();
  }
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM turnos WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  res.json(row);
});

router.post('/', (req, res) => {
  const { cliente_id, cliente_nombre, fecha, hora, duracion_min, motivo, notas } = req.body;
  if (!fecha || !hora) return res.status(400).json({ error: 'Fecha y hora son obligatorias' });
  if (!cliente_id && !cliente_nombre) return res.status(400).json({ error: 'Indicá un cliente o un nombre' });
  const info = db.prepare(`
    INSERT INTO turnos (cliente_id, cliente_nombre, fecha, hora, duracion_min, motivo, notas)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(cliente_id || null, cliente_nombre || null, fecha, hora, Number(duracion_min) || 30, motivo || null, notas || null);
  res.status(201).json(db.prepare('SELECT * FROM turnos WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM turnos WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'No encontrado' });
  const { cliente_id, cliente_nombre, fecha, hora, duracion_min, motivo, estado, notas } = req.body;
  db.prepare(`
    UPDATE turnos SET cliente_id=?, cliente_nombre=?, fecha=?, hora=?, duracion_min=?, motivo=?, estado=?, notas=?, actualizado=datetime('now')
    WHERE id=?
  `).run(
    cliente_id !== undefined ? cliente_id : existing.cliente_id,
    cliente_nombre !== undefined ? cliente_nombre : existing.cliente_nombre,
    fecha ?? existing.fecha,
    hora ?? existing.hora,
    duracion_min !== undefined ? Number(duracion_min) : existing.duracion_min,
    motivo !== undefined ? motivo : existing.motivo,
    estado ?? existing.estado,
    notas !== undefined ? notas : existing.notas,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM turnos WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM turnos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
