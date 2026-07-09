const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const settings = require('../settings');
const currency = require('../currency');

const router = express.Router();

const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const UPLOAD_DIR = path.join(UPLOAD_ROOT, 'logo');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${file.fieldname}_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Formato de imagen no soportado'), ok);
  }
});

router.get('/', (req, res) => {
  res.json(settings.getAll());
});

router.put('/', (req, res) => {
  const permitido = [
    'negocio_nombre', 'negocio_cuit', 'negocio_direccion', 'negocio_telefono', 'negocio_email',
    'tasa_cambio_modo', 'tasa_cambio_manual', 'iva_pct_default', 'recargo_pct_default',
    'tema_acento', 'tema_sidebar', 'tema_fondo', 'app_nombre'
  ];
  const cambios = {};
  for (const k of permitido) {
    if (req.body[k] !== undefined) cambios[k] = req.body[k];
  }
  settings.setMany(cambios);
  res.json(settings.getAll());
});

router.post('/logo', upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se envió archivo' });
  settings.set('negocio_logo', `/uploads/logo/${req.file.filename}`);
  res.json(settings.getAll());
});

router.post('/fondo', upload.single('fondo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se envió archivo' });
  settings.set('negocio_fondo', `/uploads/logo/${req.file.filename}`);
  res.json(settings.getAll());
});

router.post('/tema/restaurar', (req, res) => {
  settings.setMany({ tema_acento: '#C9713D', tema_sidebar: '#1B2733', tema_fondo: '#F7F5F1' });
  res.json(settings.getAll());
});

router.get('/tasa-cambio', async (req, res) => {
  const forzar = req.query.forzar === '1';
  const data = await currency.getTasaCambio(forzar);
  res.json(data);
});

module.exports = router;
