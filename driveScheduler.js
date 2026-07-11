const settings = require('./settings');
const drive = require('./googleDrive');
const { construirBackupBuffer } = require('./backupUtil');

const CHEQUEO_MS = 15 * 60 * 1000; // revisa cada 15 min si corresponde correr el backup
let corriendo = false;

async function ejecutarBackupADrive() {
  if (corriendo) return { ok: false, error: 'Ya hay un backup en curso' };
  corriendo = true;
  try {
    const jsonStr = settings.get('drive_service_account');
    const folderId = (settings.get('drive_folder_id') || '').trim();
    if (!jsonStr || !folderId) throw new Error('Google Drive no está configurado todavía');

    const serviceAccount = drive.parseServiceAccount(jsonStr);
    const { buffer, filename } = construirBackupBuffer();
    const mantener = parseInt(settings.get('drive_mantener_cantidad') || '14', 10) || 14;

    await drive.subirYRotar(serviceAccount, folderId, filename, buffer, mantener);

    settings.set('drive_ultimo_backup', new Date().toISOString());
    settings.set('drive_ultimo_estado', 'ok');
    settings.set('drive_ultimo_error', '');
    return { ok: true, filename };
  } catch (e) {
    settings.set('drive_ultimo_estado', 'error');
    settings.set('drive_ultimo_error', e.message);
    return { ok: false, error: e.message };
  } finally {
    corriendo = false;
  }
}

function debeCorrer() {
  if (settings.get('drive_habilitado') !== '1') return false;
  const intervaloHoras = parseFloat(settings.get('drive_intervalo_horas') || '12') || 12;
  const ultimo = settings.get('drive_ultimo_backup');
  if (!ultimo) return true;
  const transcurridoMs = Date.now() - new Date(ultimo).getTime();
  return transcurridoMs >= intervaloHoras * 3600 * 1000;
}

async function chequear() {
  try {
    if (debeCorrer()) await ejecutarBackupADrive();
  } catch (e) { /* nunca debe tirar abajo el proceso */ }
}

function iniciar() {
  // primer chequeo a los 60s de arrancar (deja que el server termine de levantar)
  setTimeout(chequear, 60 * 1000);
  setInterval(chequear, CHEQUEO_MS);
}

module.exports = { iniciar, ejecutarBackupADrive, debeCorrer };
