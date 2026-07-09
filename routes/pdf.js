const express = require('express');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const db = require('../db');
const settings = require('../settings');

const router = express.Router();

const FORMAS_PAGO = {
  contado: 'Contado',
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  billetera_virtual: 'Billetera virtual'
};

function fmtMoneda(n, moneda) {
  const num = Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return moneda === 'USD' ? `US$ ${num}` : `$ ${num}`;
}

router.get('/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM documentos WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'No encontrado' });
  doc.items = JSON.parse(doc.items);
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(doc.cliente_id);
  const cfg = settings.getAll();

  const pdf = new PDFDocument({ size: 'A4', margin: 40 });
  const titulo = doc.tipo === 'factura' ? 'FACTURA' : 'PRESUPUESTO';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${doc.tipo}-${doc.numero}.pdf"`);
  pdf.pipe(res);

  const pageW = pdf.page.width;
  const pageH = pdf.page.height;

  // --- Fondo (marca de agua) ---
  if (cfg.negocio_fondo) {
    const fondoPath = path.join(__dirname, '..', cfg.negocio_fondo.replace(/^\//, ''));
    if (fs.existsSync(fondoPath)) {
      pdf.save();
      pdf.opacity(0.08);
      try {
        const imgW = pageW * 0.7;
        pdf.image(fondoPath, (pageW - imgW) / 2, (pageH - imgW) / 2, { width: imgW });
      } catch (e) { /* ignorar imagen inválida */ }
      pdf.opacity(1);
      pdf.restore();
    }
  }

  // --- Encabezado: logo + datos del negocio ---
  let headerBottom = 40;
  if (cfg.negocio_logo) {
    const logoPath = path.join(__dirname, '..', cfg.negocio_logo.replace(/^\//, ''));
    if (fs.existsSync(logoPath)) {
      try {
        pdf.image(logoPath, 40, 40, { fit: [110, 70] });
      } catch (e) { /* ignorar */ }
    }
  }

  pdf.fontSize(10).fillColor('#333');
  const infoX = 170;
  let y = 40;
  pdf.font('Helvetica-Bold').fontSize(13).text(cfg.negocio_nombre || 'Mi Negocio', infoX, y);
  y += 18;
  pdf.font('Helvetica').fontSize(9);
  if (cfg.negocio_cuit) { pdf.text(`CUIT: ${cfg.negocio_cuit}`, infoX, y); y += 12; }
  if (cfg.negocio_direccion) { pdf.text(cfg.negocio_direccion, infoX, y); y += 12; }
  if (cfg.negocio_telefono) { pdf.text(`Tel: ${cfg.negocio_telefono}`, infoX, y); y += 12; }
  if (cfg.negocio_email) { pdf.text(cfg.negocio_email, infoX, y); y += 12; }

  headerBottom = Math.max(120, y + 10);

  // --- Título y número ---
  pdf.moveTo(40, headerBottom).lineTo(pageW - 40, headerBottom).strokeColor('#ccc').stroke();
  let cursorY = headerBottom + 15;
  pdf.font('Helvetica-Bold').fontSize(18).fillColor('#000')
    .text(`${titulo} N° ${String(doc.numero).padStart(6, '0')}`, 40, cursorY);
  pdf.font('Helvetica').fontSize(9).fillColor('#555')
    .text(`Fecha: ${new Date(doc.creado).toLocaleDateString('es-AR')}`, 40, cursorY + 24);
  if (doc.tipo === 'presupuesto' && doc.validez_dias) {
    pdf.text(`Validez: ${doc.validez_dias} días`, 40, cursorY + 38);
  }

  // --- Datos del cliente ---
  cursorY += 60;
  pdf.font('Helvetica-Bold').fontSize(11).fillColor('#000').text('Cliente', 40, cursorY);
  cursorY += 15;
  pdf.font('Helvetica').fontSize(9).fillColor('#333');
  if (cliente) {
    pdf.text(`${cliente.nombre} ${cliente.apellido}  (N° ${cliente.numero_cliente})`, 40, cursorY); cursorY += 12;
    if (cliente.doc_tipo && cliente.doc_numero) { pdf.text(`${cliente.doc_tipo}: ${cliente.doc_numero}`, 40, cursorY); cursorY += 12; }
    if (cliente.direccion) { pdf.text(cliente.direccion, 40, cursorY); cursorY += 12; }
    const loc = [cliente.localidad, cliente.provincia, cliente.pais].filter(Boolean).join(', ');
    if (loc) { pdf.text(loc, 40, cursorY); cursorY += 12; }
    if (cliente.telefono) { pdf.text(`Tel: ${cliente.telefono}`, 40, cursorY); cursorY += 12; }
  } else {
    pdf.text('Cliente no encontrado', 40, cursorY); cursorY += 12;
  }

  // --- Tabla de ítems ---
  cursorY += 15;
  const colX = { desc: 40, cant: 300, punit: 360, total: 460 };
  pdf.font('Helvetica-Bold').fontSize(9).fillColor('#fff');
  pdf.rect(40, cursorY, pageW - 80, 18).fill('#333');
  pdf.fillColor('#fff').text('Descripción', colX.desc + 5, cursorY + 5)
    .text('Cant.', colX.cant, cursorY + 5)
    .text('P. Unit.', colX.punit, cursorY + 5)
    .text('Total', colX.total, cursorY + 5);
  cursorY += 18;

  pdf.font('Helvetica').fontSize(9).fillColor('#000');
  const moneda = doc.moneda || 'ARS';
  for (const it of doc.items) {
    const cant = Number(it.cantidad || 1);
    const punit = Number(it.precio_unit || 0);
    const totalItem = cant * punit;
    const rowH = 18;
    pdf.text(`${it.descripcion}${it.tipo ? ` (${it.tipo})` : ''}`, colX.desc + 5, cursorY + 4, { width: 250 });
    pdf.text(String(cant), colX.cant, cursorY + 4);
    pdf.text(fmtMoneda(punit, moneda), colX.punit, cursorY + 4);
    pdf.text(fmtMoneda(totalItem, moneda), colX.total, cursorY + 4);
    pdf.moveTo(40, cursorY + rowH).lineTo(pageW - 40, cursorY + rowH).strokeColor('#eee').stroke();
    cursorY += rowH;
  }

  // --- Totales ---
  cursorY += 15;
  const totalsX = 350;
  pdf.font('Helvetica').fontSize(10);
  pdf.text('Subtotal:', totalsX, cursorY);
  pdf.text(fmtMoneda(doc.subtotal, moneda), colX.total, cursorY);
  cursorY += 15;
  if (doc.iva_pct) {
    pdf.text(`IVA (${doc.iva_pct}%):`, totalsX, cursorY);
    pdf.text(fmtMoneda(doc.subtotal * (doc.iva_pct / 100), moneda), colX.total, cursorY);
    cursorY += 15;
  }
  if (doc.descuento_contado) {
    pdf.fillColor('#c0392b').text('Descuento pago contado (10%):', totalsX, cursorY);
    pdf.text('- 10%', colX.total, cursorY);
    pdf.fillColor('#000');
    cursorY += 15;
  }
  pdf.font('Helvetica-Bold').fontSize(13);
  pdf.text('TOTAL:', totalsX, cursorY + 5);
  pdf.text(fmtMoneda(doc.total, moneda), colX.total, cursorY + 5);
  cursorY += 30;

  // --- Forma de pago ---
  if (doc.forma_pago) {
    pdf.font('Helvetica').fontSize(10).fillColor('#333')
      .text(`Forma de pago: ${FORMAS_PAGO[doc.forma_pago] || doc.forma_pago}`, 40, cursorY);
    cursorY += 18;
  }

  if (doc.notas) {
    cursorY += 10;
    pdf.font('Helvetica-Oblique').fontSize(9).fillColor('#555').text(doc.notas, 40, cursorY, { width: pageW - 80 });
  }

  pdf.end();
});

module.exports = router;
