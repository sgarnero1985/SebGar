const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  const anio = String(req.query.anio || new Date().getFullYear());
  const mes = req.query.mes ? String(req.query.mes).padStart(2, '0') : null;

  let rows;
  if (mes) {
    rows = db.prepare(`
      SELECT * FROM documentos WHERE tipo = 'factura' AND strftime('%Y', creado) = ? AND strftime('%m', creado) = ?
    `).all(anio, mes);
  } else {
    rows = db.prepare(`
      SELECT * FROM documentos WHERE tipo = 'factura' AND strftime('%Y', creado) = ?
    `).all(anio);
  }

  let totalFacturado = 0, totalProductos = 0, totalManoObra = 0;
  const porFormaPago = {};
  const porMes = {}; // '01'..'12' -> total (útil para la vista anual)

  for (const r of rows) {
    totalFacturado += r.total;
    const fp = r.forma_pago || 'sin especificar';
    porFormaPago[fp] = (porFormaPago[fp] || 0) + r.total;

    const items = JSON.parse(r.items);
    for (const it of items) {
      const sub = Number(it.cantidad || 1) * Number(it.precio_unit || 0);
      if (it.tipo === 'producto') totalProductos += sub;
      else totalManoObra += sub;
    }

    const m = String(r.creado).substring(5, 7);
    porMes[m] = (porMes[m] || 0) + r.total;
  }

  // años disponibles (para el selector del frontend)
  const aniosRow = db.prepare(`
    SELECT DISTINCT strftime('%Y', creado) as anio FROM documentos WHERE tipo = 'factura' ORDER BY anio DESC
  `).all();
  const aniosDisponibles = aniosRow.map(r => r.anio);

  res.json({
    anio, mes,
    cantidadFacturas: rows.length,
    totalFacturado: Math.round(totalFacturado * 100) / 100,
    totalProductos: Math.round(totalProductos * 100) / 100,
    totalManoObra: Math.round(totalManoObra * 100) / 100,
    promedioPorFactura: rows.length ? Math.round((totalFacturado / rows.length) * 100) / 100 : 0,
    porFormaPago,
    porMes,
    aniosDisponibles: aniosDisponibles.length ? aniosDisponibles : [String(new Date().getFullYear())]
  });
});

module.exports = router;
