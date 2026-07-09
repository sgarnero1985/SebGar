const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const db = require('../db');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');

// Orden de restauración: primero las tablas "independientes", después las que referencian a otras.
const TABLAS = ['clientes', 'productos', 'mano_obra', 'stock_movimientos', 'documentos', 'turnos', 'settings'];

router.get('/exportar', (req, res) => {
  try {
    const data = { version: 1, exportado: new Date().toISOString() };
    for (const t of TABLAS) {
      data[t] = db.prepare(`SELECT * FROM ${t}`).all();
    }

    const zip = new AdmZip();
    zip.addFile('data.json', Buffer.from(JSON.stringify(data, null, 2), 'utf-8'));
    if (fs.existsSync(UPLOAD_ROOT)) {
      zip.addLocalFolder(UPLOAD_ROOT, 'uploads');
    }

    const buffer = zip.toBuffer();
    const fecha = new Date().toISOString().slice(0, 10);
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="facturapp-backup-${fecha}.zip"`);
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/importar', upload.single('backup'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });

  let zip;
  try {
    zip = new AdmZip(req.file.buffer);
  } catch (e) {
    return res.status(400).json({ error: 'El archivo no es un backup válido (.zip)' });
  }

  const dataEntry = zip.getEntry('data.json');
  if (!dataEntry) return res.status(400).json({ error: 'El archivo no contiene data.json — no es un backup válido de FacturApp' });

  let data;
  try {
    data = JSON.parse(zip.readAsText(dataEntry));
  } catch (e) {
    return res.status(400).json({ error: 'No se pudo leer data.json del backup' });
  }

  const resumen = {};
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN');
    for (const t of TABLAS) {
      if (!Array.isArray(data[t])) continue;
      db.exec(`DELETE FROM ${t}`);
      for (const row of data[t]) {
        const cols = Object.keys(row);
        if (!cols.length) continue;
        const placeholders = cols.map(() => '?').join(', ');
        db.prepare(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${placeholders})`).run(...cols.map(c => row[c]));
      }
      // reajusta el autoincrement para que las próximas altas no choquen con IDs restaurados
      if (data[t].length && Object.prototype.hasOwnProperty.call(data[t][0], 'id')) {
        const maxId = Math.max(...data[t].map(r => Number(r.id) || 0));
        db.exec(`DELETE FROM sqlite_sequence WHERE name='${t}'`);
        if (maxId > 0) {
          db.prepare(`INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)`).run(t, maxId);
        }
      }
      resumen[t] = data[t].length;
    }
    db.exec('COMMIT');
    db.exec('PRAGMA foreign_keys = ON');
  } catch (e) {
    db.exec('ROLLBACK');
    db.exec('PRAGMA foreign_keys = ON');
    return res.status(500).json({ error: 'Error restaurando la base de datos: ' + e.message });
  }

  // restaurar imágenes (logo, fondo, productos)
  try {
    const uploadEntries = zip.getEntries().filter(e => e.entryName.startsWith('uploads/') && !e.isDirectory);
    if (uploadEntries.length) {
      for (const sub of ['products', 'logo']) {
        const dir = path.join(UPLOAD_ROOT, sub);
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true });
      }
      for (const entry of uploadEntries) {
        const rel = entry.entryName.replace(/^uploads\//, '');
        const dest = path.join(UPLOAD_ROOT, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, entry.getData());
      }
    }
  } catch (e) {
    return res.json({ ok: true, resumen, avisoImagenes: 'Se restauraron los datos, pero hubo un problema restaurando las imágenes: ' + e.message });
  }

  res.json({ ok: true, resumen });
});

module.exports = router;
