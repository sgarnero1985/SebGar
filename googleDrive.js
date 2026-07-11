const crypto = require('crypto');

let fetchFn = global.fetch;
if (!fetchFn) fetchFn = require('node-fetch');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const SCOPE = 'https://www.googleapis.com/auth/drive';

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function parseJsonSeguro(res) {
  const texto = await res.text();
  try {
    return JSON.parse(texto);
  } catch (e) {
    throw new Error(`No se pudo contactar a Google (respuesta inesperada, código ${res.status}). Verificá la conexión a internet del servidor.`);
  }
}

// caché simple en memoria del access_token (dura ~1h)
let tokenCache = { token: null, exp: 0 };

async function obtenerAccessToken(serviceAccount) {
  if (tokenCache.token && Date.now() < tokenCache.exp - 30000) return tokenCache.token;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: serviceAccount.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(serviceAccount.private_key);
  const jwt = `${signingInput}.${base64url(signature)}`;

  const res = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });
  const data = await parseJsonSeguro(res);
  if (!res.ok) throw new Error(data.error_description || data.error || 'No se pudo autenticar con Google');

  tokenCache = { token: data.access_token, exp: Date.now() + (data.expires_in * 1000) };
  return data.access_token;
}

function parseServiceAccount(jsonStr) {
  let obj;
  try {
    obj = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error('El archivo de credenciales no es un JSON válido');
  }
  if (!obj.client_email || !obj.private_key) {
    throw new Error('El JSON no parece ser una cuenta de servicio válida (faltan client_email o private_key)');
  }
  return obj;
}

async function verificarCarpeta(serviceAccount, folderId) {
  const token = await obtenerAccessToken(serviceAccount);
  const url = `${DRIVE_FILES_URL}/${encodeURIComponent(folderId)}?fields=id,name,mimeType&supportsAllDrives=true`;
  const res = await fetchFn(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await parseJsonSeguro(res);
  if (!res.ok) throw new Error(data.error?.message || 'No se pudo acceder a la carpeta. Verificá el ID y que la compartiste con el email de la cuenta de servicio.');
  if (data.mimeType !== 'application/vnd.google-apps.folder') throw new Error('El ID no corresponde a una carpeta de Google Drive');
  return data;
}

async function subirBackup(serviceAccount, folderId, filename, buffer) {
  const token = await obtenerAccessToken(serviceAccount);
  const boundary = 'facturapp-' + crypto.randomBytes(16).toString('hex');
  const metadata = JSON.stringify({ name: filename, parents: [folderId] });

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`, 'utf-8'),
    Buffer.from(`--${boundary}\r\nContent-Type: application/zip\r\n\r\n`, 'utf-8'),
    buffer,
    Buffer.from(`\r\n--${boundary}--`, 'utf-8')
  ]);

  const res = await fetchFn(`${DRIVE_UPLOAD_URL}?uploadType=multipart&supportsAllDrives=true&fields=id,name,createdTime`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body
  });
  const data = await parseJsonSeguro(res);
  if (!res.ok) throw new Error(data.error?.message || 'No se pudo subir el backup a Google Drive');
  return data;
}

async function listarBackups(serviceAccount, folderId) {
  const token = await obtenerAccessToken(serviceAccount);
  const q = encodeURIComponent(`'${folderId}' in parents and name contains 'facturapp-backup' and trashed = false`);
  const url = `${DRIVE_FILES_URL}?q=${q}&fields=files(id,name,createdTime)&orderBy=createdTime&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const res = await fetchFn(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await parseJsonSeguro(res);
  if (!res.ok) throw new Error(data.error?.message || 'No se pudo listar los backups en Drive');
  return data.files || [];
}

async function eliminarArchivo(serviceAccount, fileId) {
  const token = await obtenerAccessToken(serviceAccount);
  const res = await fetchFn(`${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok && res.status !== 404) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || 'No se pudo eliminar un backup viejo de Drive');
  }
}

// sube el backup y, si hay más de `mantener` copias en la carpeta, borra las más viejas
async function subirYRotar(serviceAccount, folderId, filename, buffer, mantener) {
  const subido = await subirBackup(serviceAccount, folderId, filename, buffer);
  try {
    const archivos = await listarBackups(serviceAccount, folderId);
    if (mantener > 0 && archivos.length > mantener) {
      const aBorrar = archivos
        .sort((a, b) => new Date(a.createdTime) - new Date(b.createdTime))
        .slice(0, archivos.length - mantener);
      for (const a of aBorrar) {
        await eliminarArchivo(serviceAccount, a.id).catch(() => {});
      }
    }
  } catch (e) { /* si falla la rotación no invalida el backup ya subido */ }
  return subido;
}

module.exports = { parseServiceAccount, verificarCarpeta, subirBackup, subirYRotar, listarBackups };
