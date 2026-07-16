const express = require('express');
const db = require('../db');
const router = express.Router();

function nextNumeroOrden() {
  const row = db.prepare('SELECT MAX(numero) as m FROM ordenes_compra').get();
  return (row.m || 0) + 1;
}

function conProveedor(row) {
  if (!row) return row;
  const proveedor = db.prepare('SELECT id, nombre, telefono, email FROM proveedores WHERE id = ?').get(row.proveedor_id);
  return { ...row, items: JSON.parse(row.items || '[]'), proveedor: proveedor || null };
}

function validarItems(items) {
  if (!Array.isArray(items) || !items.length) return 'La orden necesita al menos un ítem';
  for (const it of items) {
    if (!it.nombre || !Number(it.cantidad) || Number(it.cantidad) <= 0) {
      return 'Cada ítem necesita nombre y una cantidad mayor a cero';
    }
  }
  return null;
}

function calcularTotal(items) {
  return Math.round(items.reduce((acc, it) => acc + Number(it.cantidad) * Number(it.precio_usd || 0), 0) * 100) / 100;
}

router.get('/', (req, res) => {
  const estado = (req.query.estado || '').trim();
  const rows = estado
    ? db.prepare('SELECT * FROM ordenes_compra WHERE estado = ? ORDER BY numero DESC').all(estado)
    : db.prepare('SELECT * FROM ordenes_compra ORDER BY numero DESC').all();
  res.json(rows.map(conProveedor));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'No encontrada' });
  res.json(conProveedor(row));
});

router.post('/', (req, res) => {
  const { proveedor_id, items, notas } = req.body;
  if (!proveedor_id) return res.status(400).json({ error: 'Elegí un proveedor' });
  if (!db.prepare('SELECT 1 FROM proveedores WHERE id = ?').get(proveedor_id)) {
    return res.status(400).json({ error: 'El proveedor seleccionado no existe' });
  }
  const errorItems = validarItems(items);
  if (errorItems) return res.status(400).json({ error: errorItems });

  const total = calcularTotal(items);
  const numero = nextNumeroOrden();
  const info = db.prepare(`
    INSERT INTO ordenes_compra (numero, proveedor_id, estado, items, notas, total_usd)
    VALUES (?, ?, 'pendiente', ?, ?, ?)
  `).run(numero, Number(proveedor_id), JSON.stringify(items), notas || null, total);
  const row = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(conProveedor(row));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'No encontrada' });
  if (existing.estado !== 'pendiente') return res.status(409).json({ error: 'Solo se pueden editar órdenes pendientes' });

  const { proveedor_id, items, notas } = req.body;
  const provId = proveedor_id !== undefined ? Number(proveedor_id) : existing.proveedor_id;
  if (proveedor_id !== undefined && !db.prepare('SELECT 1 FROM proveedores WHERE id = ?').get(provId)) {
    return res.status(400).json({ error: 'El proveedor seleccionado no existe' });
  }
  const itemsFinales = items !== undefined ? items : JSON.parse(existing.items);
  const errorItems = validarItems(itemsFinales);
  if (errorItems) return res.status(400).json({ error: errorItems });
  const total = calcularTotal(itemsFinales);

  db.prepare(`
    UPDATE ordenes_compra SET proveedor_id=?, items=?, notas=?, total_usd=?, actualizado=datetime('now') WHERE id=?
  `).run(provId, JSON.stringify(itemsFinales), notas !== undefined ? notas : existing.notas, total, req.params.id);
  const row = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id);
  res.json(conProveedor(row));
});

// marca la orden como recibida y da entrada al stock de cada ítem que tenga un producto asociado
router.post('/:id/recibir', (req, res) => {
  const existing = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'No encontrada' });
  if (existing.estado !== 'pendiente') return res.status(409).json({ error: 'Esta orden ya fue recibida o está cancelada' });

  const items = JSON.parse(existing.items);
  const insertMov = db.prepare(`INSERT INTO stock_movimientos (producto_id, tipo, cantidad, motivo) VALUES (?, 'entrada', ?, ?)`);
  for (const it of items) {
    if (!it.producto_id) continue;
    const prod = db.prepare('SELECT id FROM productos WHERE id = ?').get(it.producto_id);
    if (!prod) continue;
    db.prepare('UPDATE productos SET stock_actual = stock_actual + ? WHERE id = ?').run(Number(it.cantidad), it.producto_id);
    insertMov.run(it.producto_id, Number(it.cantidad), `Orden de compra #${existing.numero}`);
  }
  db.prepare(`UPDATE ordenes_compra SET estado='recibida', actualizado=datetime('now') WHERE id=?`).run(req.params.id);
  const row = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id);
  res.json(conProveedor(row));
});

router.post('/:id/cancelar', (req, res) => {
  const existing = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'No encontrada' });
  if (existing.estado !== 'pendiente') return res.status(409).json({ error: 'Solo se pueden cancelar órdenes pendientes' });
  db.prepare(`UPDATE ordenes_compra SET estado='cancelada', actualizado=datetime('now') WHERE id=?`).run(req.params.id);
  const row = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id);
  res.json(conProveedor(row));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'No encontrada' });
  if (existing.estado === 'recibida') {
    return res.status(409).json({ error: 'No se puede eliminar una orden ya recibida (afectaría el historial de stock).' });
  }
  db.prepare('DELETE FROM ordenes_compra WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
