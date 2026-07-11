const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'facturapp.db'));

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_cliente INTEGER UNIQUE,
    nombre TEXT NOT NULL,
    apellido TEXT NOT NULL,
    doc_tipo TEXT,           -- DNI, CUIL, CUIT
    doc_numero TEXT,
    direccion TEXT,
    telefono TEXT,
    localidad TEXT,
    provincia TEXT,
    pais TEXT DEFAULT 'Argentina',
    creado TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    imagen TEXT,
    precio_usd REAL NOT NULL DEFAULT 0,
    precio_ars REAL NOT NULL DEFAULT 0,
    stock_actual INTEGER NOT NULL DEFAULT 0,
    stock_minimo INTEGER NOT NULL DEFAULT 0,
    recargo_pct REAL NOT NULL DEFAULT 0,
    creado TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS stock_movimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,           -- 'entrada' | 'venta' | 'ajuste' | 'devolucion'
    cantidad INTEGER NOT NULL,    -- siempre positivo, el signo lo da "tipo"
    motivo TEXT,
    creado TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(producto_id) REFERENCES productos(id)
  );

  CREATE TABLE IF NOT EXISTS turnos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER,
    cliente_nombre TEXT,          -- por si no está cargado como cliente
    fecha TEXT NOT NULL,          -- YYYY-MM-DD
    hora TEXT NOT NULL,           -- HH:MM
    duracion_min INTEGER DEFAULT 30,
    motivo TEXT,
    estado TEXT DEFAULT 'pendiente',  -- pendiente | confirmado | completado | cancelado
    notas TEXT,
    creado TEXT DEFAULT (datetime('now')),
    actualizado TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(cliente_id) REFERENCES clientes(id)
  );

  CREATE TABLE IF NOT EXISTS mano_obra (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descripcion TEXT NOT NULL,
    precio_usd REAL NOT NULL DEFAULT 0,
    precio_ars REAL NOT NULL DEFAULT 0,
    creado TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS documentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,             -- 'factura' | 'presupuesto'
    numero INTEGER NOT NULL,
    cliente_id INTEGER,
    fecha TEXT DEFAULT (datetime('now')),
    validez_dias INTEGER,           -- solo presupuestos
    items TEXT NOT NULL,            -- JSON array
    iva_pct REAL DEFAULT 0,
    descuento_contado INTEGER DEFAULT 0, -- 0/1 (10%)
    forma_pago TEXT,                -- contado | efectivo | tarjeta | billetera_virtual
    subtotal REAL,
    total REAL,
    moneda TEXT DEFAULT 'ARS',
    tasa_cambio REAL,
    notas TEXT,
    creado TEXT DEFAULT (datetime('now')),
    actualizado TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(cliente_id) REFERENCES clientes(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    clave TEXT PRIMARY KEY,
    valor TEXT
  );

  CREATE TABLE IF NOT EXISTS cuentas_cobro (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa TEXT NOT NULL,        -- banco / empresa / billetera virtual (ej: Banco Galicia, Mercado Pago, Ualá)
    tipo TEXT DEFAULT 'CBU',      -- CBU | Alias | CVU | otro
    cbu TEXT,
    alias TEXT,
    titular TEXT,
    notas TEXT,
    orden INTEGER NOT NULL DEFAULT 0,
    creado TEXT DEFAULT (datetime('now'))
  );
`);

// Migración: agrega columnas nuevas si la base ya existía de una versión anterior
function columnaExiste(tabla, columna) {
  const cols = db.prepare(`PRAGMA table_info(${tabla})`).all();
  return cols.some(c => c.name === columna);
}
if (!columnaExiste('productos', 'stock_actual')) {
  db.exec(`ALTER TABLE productos ADD COLUMN stock_actual INTEGER NOT NULL DEFAULT 0`);
}
if (!columnaExiste('productos', 'stock_minimo')) {
  db.exec(`ALTER TABLE productos ADD COLUMN stock_minimo INTEGER NOT NULL DEFAULT 0`);
}
if (!columnaExiste('productos', 'recargo_pct')) {
  db.exec(`ALTER TABLE productos ADD COLUMN recargo_pct REAL NOT NULL DEFAULT 0`);
}
if (!columnaExiste('productos', 'codigo_barras')) {
  db.exec(`ALTER TABLE productos ADD COLUMN codigo_barras TEXT`);
}
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_productos_codigo_barras ON productos(codigo_barras) WHERE codigo_barras IS NOT NULL AND codigo_barras != ''`);

// valores por defecto
const defaults = {
  negocio_nombre: '',
  negocio_cuit: '',
  negocio_direccion: '',
  negocio_telefono: '',
  negocio_email: '',
  negocio_logo: '',
  negocio_fondo: '',
  tasa_cambio_manual: '',
  tasa_cambio_modo: 'auto', // auto | manual
  tasa_cambio_actual: '0',
  tasa_cambio_actualizada: '',
  iva_pct_default: '21',
  contador_factura: '0',
  contador_presupuesto: '0',
  tema_acento: '#C9713D',
  tema_sidebar: '#1B2733',
  tema_fondo: '#F7F5F1',
  app_nombre: 'FacturApp',
  recargo_pct_default: '0',
  drive_habilitado: '0',
  drive_folder_id: '',
  drive_intervalo_horas: '12',
  drive_service_account: '',
  drive_service_account_email: '',
  drive_mantener_cantidad: '14',
  drive_ultimo_backup: '',
  drive_ultimo_estado: '',
  drive_ultimo_error: ''
};

const getSetting = db.prepare('SELECT valor FROM settings WHERE clave = ?');
const insertSetting = db.prepare('INSERT INTO settings (clave, valor) VALUES (?, ?)');
for (const [k, v] of Object.entries(defaults)) {
  const row = getSetting.get(k);
  if (!row) insertSetting.run(k, v);
}

module.exports = db;
