const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const currency = require('../currency');
const { parseCSV, pick } = require('../utils/csv');

const router = express.Router();

// agrega precio_final_ars (precio_ars + recargo_pct) a cada producto sin guardarlo en la DB,
// así siempre queda consistente si cambia la cotización o el recargo.
function conPrecioFinal(row) {
  if (!row) return row;
  const final = row.precio_ars * (1 + (row.recargo_pct || 0) / 100);
  return { ...row, precio_final_ars: Math.round(final * 100) / 100 };
}
function conPrecioFinalLista(rows) { return rows.map(conPrecioFinal); }

const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const UPLOAD_DIR = path.join(UPLOAD_ROOT, 'products');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `prod_${Date.now()}_${Math.round(Math.random() * 1e6)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Formato de imagen no soportado'), ok);
  }
});
const uploadCsv = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  let rows;
  if (q) {
    rows = db.prepare('SELECT * FROM productos WHERE nombre LIKE ? ORDER BY id DESC').all(`%${q}%`);
  } else {
    rows = db.prepare('SELECT * FROM productos ORDER BY id DESC').all();
  }
  res.json(conPrecioFinalLista(rows));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  res.json(conPrecioFinal(row));
});

router.post('/', upload.single('imagen'), async (req, res) => {
  try {
    const { nombre, precio_usd, stock_actual, stock_minimo, recargo_pct } = req.body;
    if (!nombre || precio_usd === undefined) return res.status(400).json({ error: 'Nombre y precio en USD son obligatorios' });
    const precio_ars = await currency.convertirUsdArs(precio_usd);
    const imagen = req.file ? `/uploads/products/${req.file.filename}` : null;
    const stockInicial = Number(stock_actual) || 0;
    const stockMinimo = Number(stock_minimo) || 0;
    const recargo = Number(recargo_pct) || 0;
    const info = db.prepare(`
      INSERT INTO productos (nombre, imagen, precio_usd, precio_ars, stock_actual, stock_minimo, recargo_pct) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(nombre, imagen, Number(precio_usd), precio_ars, stockInicial, stockMinimo, recargo);
    if (stockInicial > 0) {
      db.prepare(`INSERT INTO stock_movimientos (producto_id, tipo, cantidad, motivo) VALUES (?, 'entrada', ?, 'Stock inicial')`)
        .run(info.lastInsertRowid, stockInicial);
    }
    const row = db.prepare('SELECT * FROM productos WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(conPrecioFinal(row));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', upload.single('imagen'), async (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'No encontrado' });
    const { nombre, precio_usd, stock_minimo, recargo_pct } = req.body;
    const usd = precio_usd !== undefined ? Number(precio_usd) : existing.precio_usd;
    const precio_ars = await currency.convertirUsdArs(usd);
    const stockMinimo = stock_minimo !== undefined ? Number(stock_minimo) : existing.stock_minimo;
    const recargo = recargo_pct !== undefined ? Number(recargo_pct) : existing.recargo_pct;
    let imagen = existing.imagen;
    if (req.file) {
      if (existing.imagen) {
        const oldPath = path.join(__dirname, '..', existing.imagen.replace(/^\//, ''));
        fs.unlink(oldPath, () => {});
      }
      imagen = `/uploads/products/${req.file.filename}`;
    }
    db.prepare('UPDATE productos SET nombre=?, imagen=?, precio_usd=?, precio_ars=?, stock_minimo=?, recargo_pct=? WHERE id=?')
      .run(nombre ?? existing.nombre, imagen, usd, precio_ars, stockMinimo, recargo, req.params.id);
    const row = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
    res.json(conPrecioFinal(row));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
  try {
    db.prepare('DELETE FROM productos WHERE id = ?').run(req.params.id);
    if (existing && existing.imagen) {
      const p = path.join(__dirname, '..', existing.imagen.replace(/^\//, ''));
      fs.unlink(p, () => {});
    }
    res.json({ ok: true });
  } catch (e) {
    if (String(e.message).includes('FOREIGN KEY')) {
      return res.status(409).json({ error: 'No se puede eliminar: este producto tiene movimientos de stock o ventas registradas.' });
    }
    res.status(500).json({ error: e.message });
  }
});

// recalcula todos los precios ARS con la tasa actual (botón "actualizar cotización")
router.post('/recalcular-todos', async (req, res) => {
  const rows = db.prepare('SELECT * FROM productos').all();
  for (const p of rows) {
    const ars = await currency.convertirUsdArs(p.precio_usd, true);
    db.prepare('UPDATE productos SET precio_ars=? WHERE id=?').run(ars, p.id);
  }
  res.json({ ok: true, actualizados: rows.length });
});

// entrada de mercadería (cuando el proveedor te entrega equipos)
router.post('/:id/stock/entrada', (req, res) => {
  const existing = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'No encontrado' });
  const cantidad = Math.abs(Number(req.body.cantidad) || 0);
  if (!cantidad) return res.status(400).json({ error: 'Ingresá una cantidad válida' });
  db.prepare('UPDATE productos SET stock_actual = stock_actual + ? WHERE id = ?').run(cantidad, req.params.id);
  db.prepare(`INSERT INTO stock_movimientos (producto_id, tipo, cantidad, motivo) VALUES (?, 'entrada', ?, ?)`)
    .run(req.params.id, cantidad, req.body.motivo || 'Entrada de mercadería');
  res.json(conPrecioFinal(db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id)));
});

// ajuste manual (correcciones de inventario, roturas, pérdidas, etc.)
router.post('/:id/stock/ajuste', (req, res) => {
  const existing = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'No encontrado' });
  const delta = Number(req.body.cantidad);
  if (!delta) return res.status(400).json({ error: 'Ingresá una cantidad válida (puede ser negativa)' });
  const nuevoStock = Math.max(0, existing.stock_actual + delta);
  db.prepare('UPDATE productos SET stock_actual = ? WHERE id = ?').run(nuevoStock, req.params.id);
  db.prepare(`INSERT INTO stock_movimientos (producto_id, tipo, cantidad, motivo) VALUES (?, 'ajuste', ?, ?)`)
    .run(req.params.id, delta, req.body.motivo || 'Ajuste manual');
  res.json(conPrecioFinal(db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id)));
});

// historial de movimientos de un producto
router.get('/:id/stock/movimientos', (req, res) => {
  const rows = db.prepare('SELECT * FROM stock_movimientos WHERE producto_id = ? ORDER BY id DESC LIMIT 50').all(req.params.id);
  res.json(rows);
});

// productos con stock igual o por debajo del mínimo configurado
router.get('/alertas/bajo-stock', (req, res) => {
  const rows = db.prepare('SELECT * FROM productos WHERE stock_actual <= stock_minimo AND stock_minimo > 0 ORDER BY stock_actual ASC').all();
  res.json(conPrecioFinalLista(rows));
});

// importación masiva desde CSV
// columnas admitidas (alias): nombre/producto*, precio_usd/precio/costo_usd*,
// stock_actual/stock, stock_minimo/stock_min, recargo_pct/recargo
// si el nombre ya existe (igual, sin importar mayúsculas) actualiza ese producto en vez de duplicarlo
// la imagen no se puede importar por CSV; se carga después editando el producto
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

  const findByNombre = db.prepare('SELECT * FROM productos WHERE LOWER(nombre) = LOWER(?)');
  const insert = db.prepare(`
    INSERT INTO productos (nombre, precio_usd, precio_ars, stock_actual, stock_minimo, recargo_pct)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const update = db.prepare(`
    UPDATE productos SET precio_usd=?, precio_ars=?, stock_minimo=?, recargo_pct=? WHERE id=?
  `);
  const insertMov = db.prepare(`INSERT INTO stock_movimientos (producto_id, tipo, cantidad, motivo) VALUES (?, 'entrada', ?, ?)`);

  let creados = 0, actualizados = 0;
  const errores = [];

  for (const fila of filas) {
    const nombre = pick(fila, ['nombre', 'producto']);
    const precioUsdStr = pick(fila, ['precio_usd', 'precio', 'costo_usd']).replace(',', '.');
    const precio_usd = Number(precioUsdStr);
    if (!nombre || !precioUsdStr || isNaN(precio_usd)) {
      errores.push({ fila: fila.__fila, motivo: 'Falta nombre o precio_usd válido' });
      continue;
    }
    const stock_actual = Number(pick(fila, ['stock_actual', 'stock']).replace(',', '.')) || 0;
    const stock_minimo = Number(pick(fila, ['stock_minimo', 'stock_min']).replace(',', '.')) || 0;
    const recargo_pct = Number(pick(fila, ['recargo_pct', 'recargo']).replace(',', '.')) || 0;
    const precio_ars = Math.round(precio_usd * tasa * 100) / 100;

    try {
      const existing = findByNombre.get(nombre);
      if (existing) {
        update.run(precio_usd, precio_ars, stock_minimo, recargo_pct, existing.id);
        if (stock_actual > 0) {
          db.prepare('UPDATE productos SET stock_actual = stock_actual + ? WHERE id = ?').run(stock_actual, existing.id);
          insertMov.run(existing.id, stock_actual, 'Importación CSV');
        }
        actualizados++;
      } else {
        const info = insert.run(nombre, precio_usd, precio_ars, stock_actual, stock_minimo, recargo_pct);
        if (stock_actual > 0) insertMov.run(info.lastInsertRowid, stock_actual, 'Stock inicial (importación CSV)');
        creados++;
      }
    } catch (e) {
      errores.push({ fila: fila.__fila, motivo: e.message });
    }
  }

  res.json({ ok: true, creados, actualizados, errores });
});

module.exports = router;
