const express = require('express');
const db = require('../db');
const settings = require('../settings');
const router = express.Router();

function nextNumero(tipo) {
  const clave = tipo === 'factura' ? 'contador_factura' : 'contador_presupuesto';
  const actual = parseInt(settings.get(clave) || '0', 10);
  const nuevo = actual + 1;
  settings.set(clave, nuevo);
  return nuevo;
}

function calcularTotales({ items, iva_pct, descuento_contado }) {
  const subtotal = items.reduce((acc, it) => acc + (Number(it.precio_unit) * Number(it.cantidad || 1)), 0);
  let total = subtotal;
  if (iva_pct) total += subtotal * (Number(iva_pct) / 100);
  if (descuento_contado) total -= total * 0.10;
  return { subtotal: Math.round(subtotal * 100) / 100, total: Math.round(total * 100) / 100 };
}

// Descuenta (signo -1) o repone (signo +1) stock por cada ítem de tipo "producto" con ref_id,
// y deja registro en stock_movimientos.
function aplicarMovimientoStock(items, signo, motivo) {
  for (const it of items) {
    if (it.tipo !== 'producto' || !it.ref_id) continue;
    const cantidad = Number(it.cantidad) || 0;
    if (!cantidad) continue;
    const producto = db.prepare('SELECT * FROM productos WHERE id = ?').get(it.ref_id);
    if (!producto) continue;
    const delta = signo * cantidad;
    const nuevoStock = Math.max(0, producto.stock_actual + delta);
    db.prepare('UPDATE productos SET stock_actual = ? WHERE id = ?').run(nuevoStock, it.ref_id);
    db.prepare(`INSERT INTO stock_movimientos (producto_id, tipo, cantidad, motivo) VALUES (?, ?, ?, ?)`)
      .run(it.ref_id, signo < 0 ? 'venta' : 'devolucion', cantidad, motivo);
  }
}

router.get('/', (req, res) => {
  const { tipo } = req.query;
  let rows;
  if (tipo) {
    rows = db.prepare('SELECT * FROM documentos WHERE tipo = ? ORDER BY id DESC').all(tipo);
  } else {
    rows = db.prepare('SELECT * FROM documentos ORDER BY id DESC').all();
  }
  rows = rows.map(r => ({ ...r, items: JSON.parse(r.items) }));
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM documentos WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  row.items = JSON.parse(row.items);
  res.json(row);
});

router.post('/', (req, res) => {
  const { tipo, cliente_id, items, iva_pct, descuento_contado, forma_pago, validez_dias, notas, moneda, tasa_cambio } = req.body;
  if (!['factura', 'presupuesto'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });
  if (!cliente_id) return res.status(400).json({ error: 'Cliente obligatorio' });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Debe agregar al menos un ítem' });

  const numero = nextNumero(tipo);
  const { subtotal, total } = calcularTotales({ items, iva_pct, descuento_contado });

  const info = db.prepare(`
    INSERT INTO documentos (tipo, numero, cliente_id, validez_dias, items, iva_pct, descuento_contado, forma_pago, subtotal, total, moneda, tasa_cambio, notas)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    tipo, numero, cliente_id, tipo === 'presupuesto' ? (validez_dias || null) : null,
    JSON.stringify(items), iva_pct || 0, descuento_contado ? 1 : 0, forma_pago || null,
    subtotal, total, moneda || 'ARS', tasa_cambio || null, notas || null
  );
  const row = db.prepare('SELECT * FROM documentos WHERE id = ?').get(info.lastInsertRowid);
  row.items = JSON.parse(row.items);

  if (tipo === 'factura') {
    aplicarMovimientoStock(row.items, -1, `Venta - Factura #${numero}`);
  }

  res.status(201).json(row);
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM documentos WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'No encontrado' });

  const { cliente_id, items, iva_pct, descuento_contado, forma_pago, validez_dias, notas, moneda, tasa_cambio } = req.body;
  const finalItems = items !== undefined ? items : JSON.parse(existing.items);
  const finalIva = iva_pct !== undefined ? iva_pct : existing.iva_pct;
  const finalDesc = descuento_contado !== undefined ? (descuento_contado ? 1 : 0) : existing.descuento_contado;

  const { subtotal, total } = calcularTotales({ items: finalItems, iva_pct: finalIva, descuento_contado: finalDesc });

  if (existing.tipo === 'factura') {
    aplicarMovimientoStock(JSON.parse(existing.items), +1, `Edición factura #${existing.numero} (reversión)`);
  }

  db.prepare(`
    UPDATE documentos SET cliente_id=?, validez_dias=?, items=?, iva_pct=?, descuento_contado=?, forma_pago=?, subtotal=?, total=?, moneda=?, tasa_cambio=?, notas=?, actualizado=datetime('now')
    WHERE id=?
  `).run(
    cliente_id ?? existing.cliente_id,
    validez_dias !== undefined ? validez_dias : existing.validez_dias,
    JSON.stringify(finalItems),
    finalIva,
    finalDesc,
    forma_pago ?? existing.forma_pago,
    subtotal, total,
    moneda ?? existing.moneda,
    tasa_cambio !== undefined ? tasa_cambio : existing.tasa_cambio,
    notas !== undefined ? notas : existing.notas,
    req.params.id
  );
  const row = db.prepare('SELECT * FROM documentos WHERE id = ?').get(req.params.id);
  row.items = JSON.parse(row.items);

  if (existing.tipo === 'factura') {
    aplicarMovimientoStock(row.items, -1, `Edición factura #${existing.numero}`);
  }

  res.json(row);
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM documentos WHERE id = ?').get(req.params.id);
  if (existing && existing.tipo === 'factura') {
    aplicarMovimientoStock(JSON.parse(existing.items), +1, `Eliminación factura #${existing.numero}`);
  }
  db.prepare('DELETE FROM documentos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
