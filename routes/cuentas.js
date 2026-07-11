const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM cuentas_cobro ORDER BY orden ASC, id ASC').all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { empresa, tipo, cbu, alias, titular, notas } = req.body;
  if (!empresa || !empresa.trim()) return res.status(400).json({ error: 'La empresa / banco / billetera es obligatoria' });
  if (!cbu && !alias) return res.status(400).json({ error: 'Cargá al menos un CBU/CVU o un alias' });
  const maxOrden = db.prepare('SELECT COALESCE(MAX(orden), -1) AS m FROM cuentas_cobro').get().m;
  const info = db.prepare(`
    INSERT INTO cuentas_cobro (empresa, tipo, cbu, alias, titular, notas, orden)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(empresa.trim(), tipo || 'CBU', cbu || null, alias || null, titular || null, notas || null, maxOrden + 1);
  res.status(201).json(db.prepare('SELECT * FROM cuentas_cobro WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM cuentas_cobro WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'No encontrado' });
  const { empresa, tipo, cbu, alias, titular, notas } = req.body;
  const nuevaEmpresa = empresa !== undefined ? empresa.trim() : existing.empresa;
  if (!nuevaEmpresa) return res.status(400).json({ error: 'La empresa / banco / billetera es obligatoria' });
  db.prepare(`
    UPDATE cuentas_cobro SET empresa=?, tipo=?, cbu=?, alias=?, titular=?, notas=? WHERE id=?
  `).run(
    nuevaEmpresa,
    tipo !== undefined ? tipo : existing.tipo,
    cbu !== undefined ? (cbu || null) : existing.cbu,
    alias !== undefined ? (alias || null) : existing.alias,
    titular !== undefined ? (titular || null) : existing.titular,
    notas !== undefined ? (notas || null) : existing.notas,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM cuentas_cobro WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM cuentas_cobro WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
