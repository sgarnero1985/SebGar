const settings = require('./settings');

let fetchFn = global.fetch;
if (!fetchFn) fetchFn = require('node-fetch');

const CACHE_MS = 1000 * 60 * 60; // 1 hora

async function fetchOficial() {
  // dolarapi.com - API pública gratuita de cotizaciones Argentina
  const res = await fetchFn('https://dolarapi.com/v1/dolares/oficial');
  if (!res.ok) throw new Error('No se pudo obtener la cotización');
  const data = await res.json();
  // usamos el valor de venta
  return Number(data.venta);
}

async function getTasaCambio(forceRefresh = false) {
  const modo = settings.get('tasa_cambio_modo') || 'auto';

  if (modo === 'manual') {
    const manual = parseFloat(settings.get('tasa_cambio_manual') || '0');
    return { tasa: manual || 0, modo: 'manual', actualizada: null };
  }

  const actual = parseFloat(settings.get('tasa_cambio_actual') || '0');
  const actualizada = settings.get('tasa_cambio_actualizada') || '';
  const edadMs = actualizada ? Date.now() - new Date(actualizada).getTime() : Infinity;

  if (!forceRefresh && actual > 0 && edadMs < CACHE_MS) {
    return { tasa: actual, modo: 'auto', actualizada };
  }

  try {
    const tasa = await fetchOficial();
    const now = new Date().toISOString();
    settings.set('tasa_cambio_actual', tasa);
    settings.set('tasa_cambio_actualizada', now);
    return { tasa, modo: 'auto', actualizada: now };
  } catch (e) {
    // si falla la API, devolvemos el último valor cacheado (aunque esté vencido)
    return { tasa: actual || 0, modo: 'auto', actualizada, error: 'No se pudo actualizar, se usa el último valor guardado' };
  }
}

async function convertirUsdArs(usd, forceRefresh = false) {
  const { tasa } = await getTasaCambio(forceRefresh);
  return Math.round((Number(usd) || 0) * tasa * 100) / 100;
}

module.exports = { getTasaCambio, convertirUsdArs };
