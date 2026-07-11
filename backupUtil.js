const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const db = require('./db');

const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');

// Orden de restauración: primero las tablas "independientes", después las que referencian a otras.
const TABLAS = ['clientes', 'productos', 'mano_obra', 'stock_movimientos', 'documentos', 'turnos', 'cuentas_cobro', 'settings'];

function construirBackupBuffer() {
  const data = { version: 1, exportado: new Date().toISOString() };
  for (const t of TABLAS) {
    data[t] = db.prepare(`SELECT * FROM ${t}`).all();
  }

  const zip = new AdmZip();
  zip.addFile('data.json', Buffer.from(JSON.stringify(data, null, 2), 'utf-8'));
  if (fs.existsSync(UPLOAD_ROOT)) {
    zip.addLocalFolder(UPLOAD_ROOT, 'uploads');
  }

  const fecha = new Date().toISOString().slice(0, 10);
  const hora = new Date().toISOString().slice(11, 16).replace(':', '');
  const filename = `facturapp-backup-${fecha}-${hora}.zip`;
  return { buffer: zip.toBuffer(), filename };
}

module.exports = { construirBackupBuffer, TABLAS, UPLOAD_ROOT };
