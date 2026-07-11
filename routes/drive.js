const express = require('express');
const multer = require('multer');
const settings = require('../settings');
const drive = require('../googleDrive');
const scheduler = require('../driveScheduler');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1 * 1024 * 1024 } });

router.get('/estado', (req, res) => {
  const cfg = settings.getAll();
  res.json({
    habilitado: cfg.drive_habilitado === '1',
    configurado: !!cfg.drive_service_account,
    email_cuenta_servicio: cfg.drive_service_account_email || '',
    folder_id: cfg.drive_folder_id || '',
    intervalo_horas: parseFloat(cfg.drive_intervalo_horas || '12') || 12,
    mantener_cantidad: parseInt(cfg.drive_mantener_cantidad || '14', 10) || 14,
    ultimo_backup: cfg.drive_ultimo_backup || null,
    ultimo_estado: cfg.drive_ultimo_estado || '',
    ultimo_error: cfg.drive_ultimo_error || ''
  });
});

router.post('/credenciales', upload.single('credenciales'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Subí el archivo JSON de la cuenta de servicio' });
  try {
    const jsonStr = req.file.buffer.toString('utf-8');
    const sa = drive.parseServiceAccount(jsonStr);
    settings.set('drive_service_account', jsonStr);
    settings.set('drive_service_account_email', sa.client_email);
    res.json({ ok: true, email_cuenta_servicio: sa.client_email });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/config', (req, res) => {
  const { habilitado, folder_id, intervalo_horas, mantener_cantidad } = req.body;
  const cambios = {};
  if (habilitado !== undefined) cambios.drive_habilitado = habilitado ? '1' : '0';
  if (folder_id !== undefined) cambios.drive_folder_id = String(folder_id).trim();
  if (intervalo_horas !== undefined) cambios.drive_intervalo_horas = String(parseFloat(intervalo_horas) || 12);
  if (mantener_cantidad !== undefined) cambios.drive_mantener_cantidad = String(parseInt(mantener_cantidad, 10) || 14);
  settings.setMany(cambios);
  res.json({ ok: true });
});

router.post('/probar', async (req, res) => {
  try {
    const jsonStr = settings.get('drive_service_account');
    const folderId = (settings.get('drive_folder_id') || '').trim();
    if (!jsonStr) return res.status(400).json({ error: 'Primero subí el archivo de credenciales (JSON de la cuenta de servicio)' });
    if (!folderId) return res.status(400).json({ error: 'Falta el ID de la carpeta de Google Drive' });
    const sa = drive.parseServiceAccount(jsonStr);
    const carpeta = await drive.verificarCarpeta(sa, folderId);
    res.json({ ok: true, carpeta: carpeta.name });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/backup-ahora', async (req, res) => {
  const r = await scheduler.ejecutarBackupADrive();
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ ok: true, filename: r.filename });
});

module.exports = router;
