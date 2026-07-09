// ---------- Helpers ----------
const API = {
  async get(url) { const r = await fetch(url); return r.json(); },
  async send(url, method, body, isForm) {
    const opts = { method };
    if (isForm) { opts.body = body; }
    else { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(body); }
    const r = await fetch(url, opts);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Error');
    return data;
  },
  post(url, body, isForm) { return this.send(url, 'POST', body, isForm); },
  put(url, body, isForm) { return this.send(url, 'PUT', body, isForm); },
  async del(url) {
    const r = await fetch(url, { method: 'DELETE' });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Error');
    return data;
  }
};

function fmtARS(n) { return '$ ' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtUSD(n) { return 'US$ ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function esc(s) { return (s ?? '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------- Tema / colores ----------
function shadeColor(hex, percent) {
  hex = (hex || '#000000').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const num = parseInt(hex, 16);
  let r = (num >> 16) + Math.round(255 * percent / 100);
  let g = ((num >> 8) & 0xff) + Math.round(255 * percent / 100);
  let b = (num & 0xff) + Math.round(255 * percent / 100);
  r = Math.min(255, Math.max(0, r)); g = Math.min(255, Math.max(0, g)); b = Math.min(255, Math.max(0, b));
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}
function applyBrandName(nombre) {
  const n = (nombre || 'FacturApp').trim() || 'FacturApp';
  document.getElementById('brandName').textContent = n;
  document.title = n;
  document.getElementById('brandMarkLetter').textContent = n.charAt(0).toUpperCase();
}
function applyBrandLogo(logoPath) {
  const img = document.getElementById('brandMarkImg');
  const letter = document.getElementById('brandMarkLetter');
  if (logoPath) {
    img.src = logoPath;
    img.style.display = 'block';
    letter.style.display = 'none';
  } else {
    img.style.display = 'none';
    letter.style.display = 'inline';
  }
}
function applyTheme(cfg) {
  const root = document.documentElement;
  const acento = (cfg && cfg.tema_acento) || '#C9713D';
  const sidebar = (cfg && cfg.tema_sidebar) || '#1B2733';
  const fondo = (cfg && cfg.tema_fondo) || '#F7F5F1';
  root.style.setProperty('--copper', acento);
  root.style.setProperty('--copper-dark', shadeColor(acento, -18));
  root.style.setProperty('--ink', sidebar);
  root.style.setProperty('--ink-soft', shadeColor(sidebar, 14));
  root.style.setProperty('--paper', fondo);
}

function toast(msg, isError) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => t.classList.remove('show'), 2600);
}

const Modal = {
  abrir(title, html) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('modalOverlay').classList.add('open');
  },
  cerrar() { document.getElementById('modalOverlay').classList.remove('open'); }
};
document.getElementById('modalOverlay').addEventListener('click', (e) => { if (e.target.id === 'modalOverlay') Modal.cerrar(); });

// ---------- Tabs ----------
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
  if (tab === 'clientes') Clientes.cargar();
  if (tab === 'productos') Productos.cargar();
  if (tab === 'stock') Stock.cargar();
  if (tab === 'manoobra') ManoObra.cargar();
  if (tab === 'factura') DocForm.render('factura');
  if (tab === 'presupuesto') DocForm.render('presupuesto');
  if (tab === 'historial') Historial.cargar();
  if (tab === 'agenda') Agenda.cargar();
  if (tab === 'balance') Balance.cargar();
  if (tab === 'negocio') Negocio.cargar();
}

// ---------- Tasa de cambio (badge) ----------
async function cargarTasaBadge() {
  try {
    const data = await API.get('/api/settings/tasa-cambio');
    const badge = document.getElementById('tasaBadge');
    badge.textContent = data.tasa > 0 ? `USD $${Number(data.tasa).toLocaleString('es-AR')}` : 'USD sin datos';
    badge.title = data.error || (data.actualizada ? 'Actualizada: ' + new Date(data.actualizada).toLocaleString('es-AR') : '');
  } catch (e) { /* silencioso */ }
}

// ============ IMPORTAR CSV ============
const ImportCSV = {
  config: {
    clientes: {
      titulo: 'Importar clientes desde CSV',
      endpoint: '/api/clientes/import',
      recargar: () => Clientes.cargar(),
      columnas: [
        ['nombre', 'obligatoria'],
        ['apellido', 'obligatoria'],
        ['doc_tipo', 'opcional (DNI, CUIL, CUIT)'],
        ['doc_numero', 'opcional — si coincide con uno existente, actualiza ese cliente'],
        ['telefono', 'opcional'],
        ['direccion', 'opcional'],
        ['localidad', 'opcional'],
        ['provincia', 'opcional'],
        ['pais', 'opcional (por defecto Argentina)']
      ],
      ejemplo: 'nombre,apellido,doc_tipo,doc_numero,telefono,localidad,provincia\nJuan,Pérez,DNI,30111222,1155551234,Quilmes,Buenos Aires'
    },
    productos: {
      titulo: 'Importar productos desde CSV',
      endpoint: '/api/productos/import',
      recargar: () => { Productos.cargar(); cargarTasaBadge(); },
      columnas: [
        ['nombre', 'obligatoria — si coincide con uno existente, lo actualiza'],
        ['precio_usd', 'obligatoria (precio de costo en USD)'],
        ['stock_actual', 'opcional (si el producto ya existe, se suma como entrada de mercadería)'],
        ['stock_minimo', 'opcional'],
        ['recargo_pct', 'opcional (% de ganancia)']
      ],
      ejemplo: 'nombre,precio_usd,stock_actual,stock_minimo,recargo_pct\nAuricular Bluetooth,15.50,10,2,40'
    },
    manoobra: {
      titulo: 'Importar mano de obra desde CSV',
      endpoint: '/api/mano-obra/import',
      recargar: () => { ManoObra.cargar(); cargarTasaBadge(); },
      columnas: [
        ['descripcion', 'obligatoria — si coincide con una existente, actualiza el precio'],
        ['precio_usd', 'obligatoria']
      ],
      ejemplo: 'descripcion,precio_usd\nInstalación de pantalla,25'
    }
  },
  abrir(tipo) {
    const cfg = this.config[tipo];
    Modal.abrir(cfg.titulo, `
      <p class="hint">Subí un archivo .csv (separado por coma o punto y coma). La primera fila debe tener los nombres de columna:</p>
      <table style="width:100%;margin-bottom:12px;font-size:13px">
        <tbody>
          ${cfg.columnas.map(([col, desc]) => `<tr><td style="padding:3px 8px 3px 0"><code>${esc(col)}</code></td><td style="color:var(--text-mute)">${esc(desc)}</td></tr>`).join('')}
        </tbody>
      </table>
      <p class="hint">Ejemplo:</p>
      <pre style="background:var(--paper);padding:10px;border-radius:6px;font-size:12px;overflow:auto">${esc(cfg.ejemplo)}</pre>
      <label>Archivo CSV<input id="importCsvFile" type="file" accept=".csv,text/csv"></label>
      <div id="importCsvResultado"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="Modal.cerrar()">Cancelar</button>
        <button class="btn btn-primary" onclick="ImportCSV.subir('${tipo}')">Importar</button>
      </div>
    `);
  },
  async subir(tipo) {
    const cfg = this.config[tipo];
    const file = document.getElementById('importCsvFile').files[0];
    if (!file) return toast('Elegí un archivo CSV', true);
    const fd = new FormData();
    fd.append('csv', file);
    try {
      const r = await API.post(cfg.endpoint, fd, true);
      const box = document.getElementById('importCsvResultado');
      let html = `<p class="hint" style="color:var(--copper-dark)">Listo: ${r.creados} creado(s), ${r.actualizados} actualizado(s).</p>`;
      if (r.errores && r.errores.length) {
        html += `<p class="hint" style="color:#b3441e">${r.errores.length} fila(s) con error:</p>
          <ul style="font-size:12px;color:#b3441e;max-height:140px;overflow:auto">
            ${r.errores.slice(0, 30).map(e => `<li>Fila ${e.fila}: ${esc(e.motivo)}</li>`).join('')}
          </ul>`;
      }
      box.innerHTML = html;
      toast('Importación completada');
      cfg.recargar();
    } catch (e) {
      toast(e.message, true);
    }
  }
};

// ============ EXPORTAR CSV ============
const ExportCSV = {
  endpoints: {
    clientes: '/api/clientes/export',
    productos: '/api/productos/export',
    manoobra: '/api/mano-obra/export'
  },
  descargar(tipo) {
    const url = this.endpoints[tipo];
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
};

// ============ CLIENTES ============
const Clientes = {
  data: [],
  async cargar() {
    const q = document.getElementById('clientesBuscar').value.trim();
    this.data = await API.get('/api/clientes' + (q ? '?q=' + encodeURIComponent(q) : ''));
    this.pintar();
  },
  pintar() {
    const tbody = document.getElementById('clientesTbody');
    if (!this.data.length) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="8">No hay clientes todavía. Creá el primero con "+ Nuevo cliente".</td></tr>`;
      return;
    }
    tbody.innerHTML = this.data.map(c => `
      <tr>
        <td>#${c.numero_cliente}</td>
        <td>${esc(c.nombre)}</td>
        <td>${esc(c.apellido)}</td>
        <td>${c.doc_tipo ? `${esc(c.doc_tipo)}: ${esc(c.doc_numero || '')}` : '—'}</td>
        <td>${esc(c.telefono || '—')}</td>
        <td>${esc(c.localidad || '—')}</td>
        <td>${esc(c.provincia || '—')}</td>
        <td class="row-actions">
          <button class="btn btn-ghost btn-sm" onclick="Clientes.editar(${c.id})">Editar</button>
          <button class="btn btn-danger btn-sm" onclick="Clientes.eliminar(${c.id})">Eliminar</button>
        </td>
      </tr>
    `).join('');
  },
  formHTML(c = {}) {
    return `
      <div class="form-grid">
        <label>Nombre*<input id="f_nombre" value="${esc(c.nombre)}"></label>
        <label>Apellido*<input id="f_apellido" value="${esc(c.apellido)}"></label>
        <label>Tipo de documento
          <select id="f_doc_tipo">
            <option value="">Sin especificar</option>
            ${['DNI', 'CUIL', 'CUIT'].map(t => `<option ${c.doc_tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </label>
        <label>N° de documento<input id="f_doc_numero" value="${esc(c.doc_numero)}"></label>
        <label>Teléfono<input id="f_telefono" value="${esc(c.telefono)}"></label>
        <label>Dirección<input id="f_direccion" value="${esc(c.direccion)}"></label>
        <label>Localidad<input id="f_localidad" value="${esc(c.localidad)}"></label>
        <label>Provincia<input id="f_provincia" value="${esc(c.provincia)}"></label>
        <label>País<input id="f_pais" value="${esc(c.pais || 'Argentina')}"></label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="Modal.cerrar()">Cancelar</button>
        <button class="btn btn-primary" onclick="Clientes.guardar(${c.id || 'null'})">Guardar</button>
      </div>
    `;
  },
  abrirNuevo() { Modal.abrir('Nuevo cliente', this.formHTML()); },
  editar(id) {
    const c = this.data.find(x => x.id === id);
    Modal.abrir('Editar cliente', this.formHTML(c));
  },
  async guardar(id) {
    const body = {
      nombre: val('f_nombre'), apellido: val('f_apellido'),
      doc_tipo: val('f_doc_tipo') || null, doc_numero: val('f_doc_numero') || null,
      telefono: val('f_telefono'), direccion: val('f_direccion'),
      localidad: val('f_localidad'), provincia: val('f_provincia'), pais: val('f_pais')
    };
    if (!body.nombre || !body.apellido) return toast('Nombre y apellido son obligatorios', true);
    try {
      if (id) await API.put('/api/clientes/' + id, body);
      else await API.post('/api/clientes', body);
      Modal.cerrar(); toast('Cliente guardado'); this.cargar();
    } catch (e) { toast(e.message, true); }
  },
  async eliminar(id) {
    if (!confirm('¿Eliminar este cliente?')) return;
    try {
      await API.del('/api/clientes/' + id);
      toast('Cliente eliminado'); this.cargar();
    } catch (e) { toast(e.message, true); }
  }
};
function val(id) { return document.getElementById(id).value.trim(); }
document.getElementById('clientesBuscar').addEventListener('input', debounce(() => Clientes.cargar(), 300));

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ============ PRODUCTOS ============
const Productos = {
  data: [],
  async cargar() {
    const q = document.getElementById('productosBuscar').value.trim();
    this.data = await API.get('/api/productos' + (q ? '?q=' + encodeURIComponent(q) : ''));
    this.pintar();
  },
  pintar() {
    const grid = document.getElementById('productosGrid');
    if (!this.data.length) {
      grid.innerHTML = `<p style="color:var(--text-mute)">No hay productos todavía. Creá el primero con "+ Nuevo producto".</p>`;
      return;
    }
    grid.innerHTML = this.data.map(p => `
      <div class="prod-card">
        ${p.imagen ? `<img class="prod-card-img" src="${p.imagen}">` : `<div class="prod-card-img">Sin imagen</div>`}
        <div class="prod-card-body">
          <div class="prod-card-name">${esc(p.nombre)}</div>
          <div class="prod-card-price">${fmtUSD(p.precio_usd)} · ${fmtARS(p.precio_ars)}${p.recargo_pct ? ` <span style="color:var(--text-mute)">+${p.recargo_pct}%</span>` : ''}</div>
          ${p.recargo_pct ? `<div class="prod-card-price"><strong style="color:var(--copper-dark)">${fmtARS(p.precio_final_ars)}</strong> <span style="color:var(--text-mute);font-size:11px">precio final</span></div>` : ''}
          <span class="stock-badge ${p.stock_minimo > 0 && p.stock_actual <= p.stock_minimo ? 'bajo' : 'ok'}" style="width:fit-content">
            Stock: ${p.stock_actual}
          </span>
        </div>
        <div class="prod-card-actions">
          <button class="btn btn-ghost btn-sm" onclick="Productos.editar(${p.id})">Editar</button>
          <button class="btn btn-danger btn-sm" onclick="Productos.eliminar(${p.id})">Eliminar</button>
        </div>
      </div>
    `).join('');
  },
  formHTML(p = {}, recargoDefault) {
    const esNuevo = !p.id;
    const recargoValor = esNuevo ? (recargoDefault ?? 0) : (p.recargo_pct ?? 0);
    return `
      <label>Nombre*<input id="p_nombre" value="${esc(p.nombre)}"></label>
      <div class="form-grid">
        <label>Precio de costo en USD*<input id="p_precio_usd" type="number" step="0.01" value="${p.precio_usd ?? ''}"></label>
        <label>Recargo / ganancia (%)<input id="p_recargo" type="number" step="0.01" min="0" value="${recargoValor}"></label>
      </div>
      ${!esNuevo ? `<p class="hint">Precio base (costo convertido a ARS): <strong>${fmtARS(p.precio_ars)}</strong> · Precio final con recargo: <strong style="color:var(--copper-dark)">${fmtARS(p.precio_final_ars)}</strong></p>` : ''}
      <div class="form-grid">
        ${esNuevo ? `<label>Stock inicial<input id="p_stock_actual" type="number" min="0" step="1" value="0"></label>` : ''}
        <label>Stock mínimo (para alertas)<input id="p_stock_minimo" type="number" min="0" step="1" value="${p.stock_minimo ?? 0}"></label>
      </div>
      <label>Imagen del producto
        ${p.imagen ? `<img src="${p.imagen}" class="preview-img" style="margin-bottom:8px">` : ''}
        <input id="p_imagen" type="file" accept="image/*">
      </label>
      <p class="hint">El precio en pesos argentinos se calcula automáticamente con la cotización oficial del dólar, y el recargo se suma sobre ese valor.${esNuevo ? '' : ' El stock actual se administra desde la pestaña "Stock" (entradas de mercadería, ventas, ajustes).'}</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="Modal.cerrar()">Cancelar</button>
        <button class="btn btn-primary" onclick="Productos.guardar(${p.id || 'null'})">Guardar</button>
      </div>
    `;
  },
  async abrirNuevo() {
    let recargoDefault = 0;
    try { const cfg = await API.get('/api/settings'); recargoDefault = Number(cfg.recargo_pct_default) || 0; } catch (e) {}
    Modal.abrir('Nuevo producto', this.formHTML({}, recargoDefault));
  },
  editar(id) { Modal.abrir('Editar producto', this.formHTML(this.data.find(x => x.id === id))); },
  async guardar(id) {
    const nombre = val('p_nombre'); const precio_usd = val('p_precio_usd');
    if (!nombre || !precio_usd) return toast('Nombre y precio en USD son obligatorios', true);
    const fd = new FormData();
    fd.append('nombre', nombre); fd.append('precio_usd', precio_usd);
    fd.append('recargo_pct', val('p_recargo') || '0');
    if (!id) fd.append('stock_actual', val('p_stock_actual') || '0');
    fd.append('stock_minimo', val('p_stock_minimo') || '0');
    const file = document.getElementById('p_imagen').files[0];
    if (file) fd.append('imagen', file);
    try {
      if (id) await API.put('/api/productos/' + id, fd, true);
      else await API.post('/api/productos', fd, true);
      Modal.cerrar(); toast('Producto guardado'); this.cargar(); cargarTasaBadge();
    } catch (e) { toast(e.message, true); }
  },
  async eliminar(id) {
    if (!confirm('¿Eliminar este producto?')) return;
    try {
      await API.del('/api/productos/' + id);
      toast('Producto eliminado'); this.cargar();
    } catch (e) { toast(e.message, true); }
  },
  async recalcular() {
    try {
      const r = await API.post('/api/productos/recalcular-todos', {});
      toast(`Cotización actualizada (${r.actualizados} productos)`); this.cargar(); cargarTasaBadge();
    } catch (e) { toast(e.message, true); }
  }
};
document.getElementById('productosBuscar').addEventListener('input', debounce(() => Productos.cargar(), 300));

// ============ STOCK ============
const Stock = {
  data: [],
  async cargar() {
    this.data = await API.get('/api/productos');
    this.pintar();
    this.actualizarAlertas();
  },
  filtrar() {
    const q = document.getElementById('stockBuscar').value.trim().toLowerCase();
    return q ? this.data.filter(p => p.nombre.toLowerCase().includes(q)) : this.data;
  },
  pintar() {
    const rows = this.filtrar();
    const tbody = document.getElementById('stockTbody');
    if (!rows.length) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="5">No hay productos cargados todavía.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(p => {
      const bajo = p.stock_minimo > 0 && p.stock_actual <= p.stock_minimo;
      return `
      <tr>
        <td>${esc(p.nombre)}</td>
        <td><strong>${p.stock_actual}</strong> unidades</td>
        <td>${p.stock_minimo}</td>
        <td><span class="stock-badge ${bajo ? 'bajo' : 'ok'}">${bajo ? '⚠ Stock bajo' : '✓ OK'}</span></td>
        <td class="row-actions">
          <button class="btn btn-ghost btn-sm" onclick="Stock.abrirEntrada(${p.id})">+ Entrada</button>
          <button class="btn btn-ghost btn-sm" onclick="Stock.abrirAjuste(${p.id})">Ajustar</button>
        </td>
      </tr>`;
    }).join('');
  },
  async actualizarAlertas() {
    try {
      const bajos = await API.get('/api/productos/alertas/bajo-stock');
      const badge = document.getElementById('stockAlertBadge');
      const banner = document.getElementById('stockAlertBanner');
      if (bajos.length) {
        badge.style.display = 'inline-block'; badge.textContent = bajos.length;
        banner.innerHTML = `<div class="alert-banner show">⚠ Tenés ${bajos.length} producto(s) con stock bajo: ${bajos.map(p => `${esc(p.nombre)} (quedan ${p.stock_actual})`).join(', ')}.</div>`;
      } else {
        badge.style.display = 'none';
        banner.innerHTML = '';
      }
    } catch (e) { /* silencioso */ }
  },
  abrirEntrada(id) {
    const p = this.data.find(x => x.id === id);
    Modal.abrir(`Entrada de mercadería · ${p.nombre}`, `
      <p class="hint">Registrá los equipos que te entregó el proveedor. Stock actual: <strong>${p.stock_actual}</strong></p>
      <label>Cantidad que ingresa*<input id="s_cantidad" type="number" min="1" step="1" value="1"></label>
      <label>Motivo / referencia (opcional)<input id="s_motivo" placeholder="Ej: Remito 0001-00023"></label>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="Modal.cerrar()">Cancelar</button>
        <button class="btn btn-primary" onclick="Stock.confirmarEntrada(${id})">Registrar entrada</button>
      </div>
    `);
  },
  async confirmarEntrada(id) {
    const cantidad = Number(val('s_cantidad'));
    if (!cantidad || cantidad <= 0) return toast('Ingresá una cantidad válida', true);
    try {
      await API.post(`/api/productos/${id}/stock/entrada`, { cantidad, motivo: val('s_motivo') });
      Modal.cerrar(); toast('Stock actualizado'); this.cargar(); Productos.cargar();
    } catch (e) { toast(e.message, true); }
  },
  abrirAjuste(id) {
    const p = this.data.find(x => x.id === id);
    Modal.abrir(`Ajustar stock · ${p.nombre}`, `
      <p class="hint">Usalo para corregir el inventario (roturas, pérdidas, conteos). Stock actual: <strong>${p.stock_actual}</strong></p>
      <label>Cantidad a sumar o restar* (usá negativo para restar, ej: -2)<input id="s_delta" type="number" step="1" value="0"></label>
      <label>Motivo<input id="s_motivo2" placeholder="Ej: Rotura, conteo físico..."></label>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="Modal.cerrar()">Cancelar</button>
        <button class="btn btn-primary" onclick="Stock.confirmarAjuste(${id})">Guardar ajuste</button>
      </div>
    `);
  },
  async confirmarAjuste(id) {
    const cantidad = Number(val('s_delta'));
    if (!cantidad) return toast('Ingresá una cantidad distinta de cero', true);
    try {
      await API.post(`/api/productos/${id}/stock/ajuste`, { cantidad, motivo: val('s_motivo2') });
      Modal.cerrar(); toast('Stock ajustado'); this.cargar(); Productos.cargar();
    } catch (e) { toast(e.message, true); }
  }
};
document.getElementById('stockBuscar').addEventListener('input', debounce(() => Stock.pintar(), 200));

// ============ MANO DE OBRA ============
const ManoObra = {
  data: [],
  async cargar() {
    const q = document.getElementById('manoobraBuscar').value.trim();
    this.data = await API.get('/api/mano-obra' + (q ? '?q=' + encodeURIComponent(q) : ''));
    this.pintar();
  },
  pintar() {
    const tbody = document.getElementById('manoobraTbody');
    if (!this.data.length) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="4">No hay ítems de mano de obra todavía.</td></tr>`;
      return;
    }
    tbody.innerHTML = this.data.map(m => `
      <tr>
        <td>${esc(m.descripcion)}</td>
        <td>${fmtUSD(m.precio_usd)}</td>
        <td><strong>${fmtARS(m.precio_ars)}</strong></td>
        <td class="row-actions">
          <button class="btn btn-ghost btn-sm" onclick="ManoObra.editar(${m.id})">Editar</button>
          <button class="btn btn-danger btn-sm" onclick="ManoObra.eliminar(${m.id})">Eliminar</button>
        </td>
      </tr>
    `).join('');
  },
  formHTML(m = {}) {
    return `
      <label>Descripción*<input id="m_descripcion" value="${esc(m.descripcion)}"></label>
      <label>Precio en USD*<input id="m_precio_usd" type="number" step="0.01" value="${m.precio_usd ?? ''}"></label>
      <p class="hint">El precio en pesos argentinos se calcula automáticamente con la cotización oficial del dólar.</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="Modal.cerrar()">Cancelar</button>
        <button class="btn btn-primary" onclick="ManoObra.guardar(${m.id || 'null'})">Guardar</button>
      </div>
    `;
  },
  abrirNuevo() { Modal.abrir('Nuevo ítem de mano de obra', this.formHTML()); },
  editar(id) { Modal.abrir('Editar ítem', this.formHTML(this.data.find(x => x.id === id))); },
  async guardar(id) {
    const descripcion = val('m_descripcion'); const precio_usd = val('m_precio_usd');
    if (!descripcion || !precio_usd) return toast('Descripción y precio en USD son obligatorios', true);
    try {
      if (id) await API.put('/api/mano-obra/' + id, { descripcion, precio_usd });
      else await API.post('/api/mano-obra', { descripcion, precio_usd });
      Modal.cerrar(); toast('Ítem guardado'); this.cargar(); cargarTasaBadge();
    } catch (e) { toast(e.message, true); }
  },
  async eliminar(id) {
    if (!confirm('¿Eliminar este ítem?')) return;
    await API.del('/api/mano-obra/' + id);
    toast('Ítem eliminado'); this.cargar();
  },
  async recalcular() {
    try {
      const r = await API.post('/api/mano-obra/recalcular-todos', {});
      toast(`Cotización actualizada (${r.actualizados} ítems)`); this.cargar(); cargarTasaBadge();
    } catch (e) { toast(e.message, true); }
  }
};
document.getElementById('manoobraBuscar').addEventListener('input', debounce(() => ManoObra.cargar(), 300));

// ============ FACTURA / PRESUPUESTO (formulario compartido) ============
const DocForm = {
  state: {}, // { factura: {...}, presupuesto: {...} }
  editingId: { factura: null, presupuesto: null },

  blank() {
    return { cliente: null, items: [], iva_pct: 0, descuento_contado: false, forma_pago: 'efectivo', validez_dias: 15, notas: '' };
  },

  render(tipo, loadDoc = null) {
    if (!this.state[tipo]) this.state[tipo] = this.blank();
    const s = this.state[tipo];
    if (loadDoc) {
      s.cliente = loadDoc._cliente || null;
      s.items = loadDoc.items.map(it => ({ ...it }));
      s.iva_pct = loadDoc.iva_pct || 0;
      s.descuento_contado = !!loadDoc.descuento_contado;
      s.forma_pago = loadDoc.forma_pago || 'efectivo';
      s.validez_dias = loadDoc.validez_dias || 15;
      s.notas = loadDoc.notas || '';
      this.editingId[tipo] = loadDoc.id;
    }

    const container = document.getElementById('docForm-' + tipo);
    container.innerHTML = `
      <div class="doc-layout">
        <div class="doc-card">
          <div class="doc-section-title">Cliente</div>
          <div class="client-picker">
            <input type="search" id="${tipo}_clienteBuscar" placeholder="Buscar cliente por nombre, apellido o N°...">
          </div>
          <div id="${tipo}_clienteResultados" class="search-results" style="display:none"></div>
          <div id="${tipo}_clienteSel" class="selected-client-box ${s.cliente ? 'show' : ''}">
            ${s.cliente ? this.clienteResumen(s.cliente) : ''}
          </div>

          <div class="divider"></div>
          <div class="doc-section-title">Agregar productos</div>
          <input type="search" id="${tipo}_prodBuscar" placeholder="Buscar producto...">
          <div id="${tipo}_prodResultados" class="search-results" style="display:none"></div>

          <div style="height:10px"></div>
          <div class="doc-section-title">Agregar mano de obra</div>
          <input type="search" id="${tipo}_moBuscar" placeholder="Buscar mano de obra...">
          <div id="${tipo}_moResultados" class="search-results" style="display:none"></div>

          <table class="items-table">
            <thead><tr><th>Ítem</th><th>Cant.</th><th>P. Unit.</th><th>Total</th><th></th></tr></thead>
            <tbody id="${tipo}_itemsTbody"></tbody>
          </table>

          <div class="divider"></div>
          <div class="doc-section-title">Forma de pago</div>
          <div class="chip-toggle" id="${tipo}_formaPago">
            ${['contado', 'efectivo', 'tarjeta', 'billetera_virtual'].map(fp => `
              <div class="chip ${s.forma_pago === fp ? 'active' : ''}" data-fp="${fp}">${this.labelFP(fp)}</div>
            `).join('')}
          </div>

          ${tipo === 'presupuesto' ? `
          <div class="divider"></div>
          <label style="max-width:220px">Validez del presupuesto (días)
            <input type="number" id="${tipo}_validez" value="${s.validez_dias}">
          </label>` : ''}

          <div class="divider"></div>
          <label>Notas (opcional)<textarea id="${tipo}_notas" rows="2">${esc(s.notas)}</textarea></label>
        </div>

        <div class="doc-card">
          <div class="doc-section-title">Resumen</div>
          <div class="summary-row"><span>Subtotal</span><span id="${tipo}_subtotal">${fmtARS(0)}</span></div>
          <label style="margin:10px 0 6px">IVA (%)
            <input type="number" id="${tipo}_iva" value="${s.iva_pct}" style="max-width:100px">
          </label>
          <label style="display:flex;flex-direction:row;align-items:center;gap:8px;margin:10px 0">
            <input type="checkbox" id="${tipo}_descuento" style="width:auto" ${s.descuento_contado ? 'checked' : ''}>
            <span style="font-weight:600;color:var(--text)">Descuento 10% por pago de contado</span>
          </label>
          <div class="summary-row total"><span>TOTAL</span><span id="${tipo}_total">${fmtARS(0)}</span></div>

          <div class="divider"></div>
          <button class="btn btn-primary" style="width:100%;margin-bottom:8px" onclick="DocForm.guardar('${tipo}')">
            ${this.editingId[tipo] ? 'Guardar cambios' : (tipo === 'factura' ? 'Emitir factura' : 'Emitir presupuesto')}
          </button>
          ${this.editingId[tipo] ? `<button class="btn btn-ghost" style="width:100%;margin-bottom:8px" onclick="DocForm.verPdf('${tipo}', ${this.editingId[tipo]})">Ver PDF</button>` : ''}
          <button class="btn btn-ghost" style="width:100%" onclick="DocForm.limpiar('${tipo}')">Limpiar formulario</button>
        </div>
      </div>
    `;

    this.bindEvents(tipo);
    this.pintarItems(tipo);
    this.recalcularTotales(tipo);
  },

  labelFP(fp) { return { contado: 'Contado', efectivo: 'Efectivo', tarjeta: 'Tarjeta', billetera_virtual: 'Billetera virtual' }[fp]; },

  clienteResumen(c) {
    return `<strong>${esc(c.nombre)} ${esc(c.apellido)}</strong> — N° ${c.numero_cliente}<br>
      ${esc(c.localidad || '')} ${c.provincia ? ', ' + esc(c.provincia) : ''}
      <button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="DocForm.quitarCliente(event)">Quitar</button>`;
  },

  bindEvents(tipo) {
    const s = this.state[tipo];

    document.getElementById(tipo + '_clienteBuscar').addEventListener('input', debounce(async (e) => {
      const q = e.target.value.trim();
      const box = document.getElementById(tipo + '_clienteResultados');
      if (!q) { box.style.display = 'none'; return; }
      const results = await API.get('/api/clientes?q=' + encodeURIComponent(q));
      box.style.display = results.length ? 'block' : 'none';
      box.innerHTML = results.map(c => `
        <div class="search-result-item" onclick='DocForm.elegirCliente("${tipo}", ${c.id})'>
          <span>${esc(c.nombre)} ${esc(c.apellido)} — N° ${c.numero_cliente}</span>
        </div>`).join('');
      this._clienteCache = results;
    }, 250));

    document.getElementById(tipo + '_prodBuscar').addEventListener('input', debounce(async (e) => {
      const q = e.target.value.trim();
      const box = document.getElementById(tipo + '_prodResultados');
      if (!q) { box.style.display = 'none'; return; }
      const results = await API.get('/api/productos?q=' + encodeURIComponent(q));
      box.style.display = results.length ? 'block' : 'none';
      box.innerHTML = results.map(p => {
        const bajo = p.stock_minimo > 0 && p.stock_actual <= p.stock_minimo;
        return `
        <div class="search-result-item" onclick='DocForm.agregarItem("${tipo}", "producto", ${p.id}, ${JSON.stringify(p.nombre).replace(/'/g, '&#39;')}, ${p.precio_final_ars}, ${p.stock_actual})'>
          <span>${esc(p.nombre)} <span style="color:${bajo ? 'var(--danger)' : 'var(--text-mute)'};font-size:11px">(stock: ${p.stock_actual})</span></span><span class="price">${fmtARS(p.precio_final_ars)}</span>
        </div>`;
      }).join('');
    }, 250));

    document.getElementById(tipo + '_moBuscar').addEventListener('input', debounce(async (e) => {
      const q = e.target.value.trim();
      const box = document.getElementById(tipo + '_moResultados');
      if (!q) { box.style.display = 'none'; return; }
      const results = await API.get('/api/mano-obra?q=' + encodeURIComponent(q));
      box.style.display = results.length ? 'block' : 'none';
      box.innerHTML = results.map(m => `
        <div class="search-result-item" onclick='DocForm.agregarItem("${tipo}", "mano_obra", ${m.id}, ${JSON.stringify(m.descripcion).replace(/'/g, '&#39;')}, ${m.precio_ars})'>
          <span>${esc(m.descripcion)}</span><span class="price">${fmtARS(m.precio_ars)}</span>
        </div>`).join('');
    }, 250));

    document.querySelectorAll(`#${tipo}_formaPago .chip`).forEach(chip => {
      chip.addEventListener('click', () => {
        s.forma_pago = chip.dataset.fp;
        document.querySelectorAll(`#${tipo}_formaPago .chip`).forEach(c => c.classList.toggle('active', c === chip));
      });
    });

    document.getElementById(tipo + '_iva').addEventListener('input', (e) => { s.iva_pct = Number(e.target.value) || 0; this.recalcularTotales(tipo); });
    document.getElementById(tipo + '_descuento').addEventListener('change', (e) => { s.descuento_contado = e.target.checked; this.recalcularTotales(tipo); });
    document.getElementById(tipo + '_notas').addEventListener('input', (e) => { s.notas = e.target.value; });
    if (tipo === 'presupuesto') {
      document.getElementById(tipo + '_validez').addEventListener('input', (e) => { s.validez_dias = Number(e.target.value) || 0; });
    }
  },

  elegirCliente(tipo, id) {
    const c = this._clienteCache.find(x => x.id === id);
    this.state[tipo].cliente = c;
    document.getElementById(tipo + '_clienteResultados').style.display = 'none';
    document.getElementById(tipo + '_clienteBuscar').value = '';
    const box = document.getElementById(tipo + '_clienteSel');
    box.classList.add('show');
    box.innerHTML = this.clienteResumen(c);
  },
  quitarCliente(e) {
    // detecta el tipo por el contenedor
    const tipo = e.target.closest('.doc-card').querySelector('[id$="_clienteSel"]').id.split('_')[0];
    this.state[tipo].cliente = null;
    const box = document.getElementById(tipo + '_clienteSel');
    box.classList.remove('show'); box.innerHTML = '';
  },

  agregarItem(tipo, tipoItem, refId, descripcion, precioUnit, stockDisponible) {
    const s = this.state[tipo];
    const existente = s.items.find(i => i.tipo === tipoItem && i.ref_id === refId);
    if (existente) { existente.cantidad += 1; }
    else { s.items.push({ tipo: tipoItem, ref_id: refId, descripcion, cantidad: 1, precio_unit: precioUnit, stock_disponible: stockDisponible }); }
    if (tipoItem === 'producto' && stockDisponible !== undefined) {
      const item = s.items.find(i => i.tipo === tipoItem && i.ref_id === refId);
      if (item.cantidad > stockDisponible) toast(`Atención: pediste ${item.cantidad} pero solo hay ${stockDisponible} en stock`, true);
    }
    document.getElementById(tipo + (tipoItem === 'producto' ? '_prodResultados' : '_moResultados')).style.display = 'none';
    document.getElementById(tipo + (tipoItem === 'producto' ? '_prodBuscar' : '_moBuscar')).value = '';
    this.pintarItems(tipo);
    this.recalcularTotales(tipo);
  },

  quitarItem(tipo, idx) {
    this.state[tipo].items.splice(idx, 1);
    this.pintarItems(tipo);
    this.recalcularTotales(tipo);
  },

  cambiarCantidad(tipo, idx, val) {
    const item = this.state[tipo].items[idx];
    item.cantidad = Math.max(1, Number(val) || 1);
    if (item.tipo === 'producto' && item.stock_disponible !== undefined && item.cantidad > item.stock_disponible) {
      toast(`Atención: pediste ${item.cantidad} pero solo hay ${item.stock_disponible} en stock`, true);
    }
    this.recalcularTotales(tipo);
    // refresca solo el total de esa fila sin re-render completo para no perder foco
    const total = item.cantidad * item.precio_unit;
    const cell = document.querySelector(`#${tipo}_itemsTbody tr[data-idx="${idx}"] .item-total`);
    if (cell) cell.textContent = fmtARS(total);
  },

  pintarItems(tipo) {
    const tbody = document.getElementById(tipo + '_itemsTbody');
    const items = this.state[tipo].items;
    if (!items.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-mute)">Buscá y agregá productos o mano de obra arriba</td></tr>`;
      return;
    }
    tbody.innerHTML = items.map((it, idx) => `
      <tr data-idx="${idx}">
        <td>${esc(it.descripcion)} <span style="color:var(--text-mute);font-size:11px">(${it.tipo === 'producto' ? 'producto' : 'mano de obra'})</span></td>
        <td><input type="number" min="1" value="${it.cantidad}" onchange="DocForm.cambiarCantidad('${tipo}', ${idx}, this.value)"></td>
        <td>${fmtARS(it.precio_unit)}</td>
        <td class="item-total">${fmtARS(it.cantidad * it.precio_unit)}</td>
        <td><button class="btn btn-danger btn-sm" onclick="DocForm.quitarItem('${tipo}', ${idx})">✕</button></td>
      </tr>
    `).join('');
  },

  recalcularTotales(tipo) {
    const s = this.state[tipo];
    const subtotal = s.items.reduce((acc, it) => acc + it.cantidad * it.precio_unit, 0);
    let total = subtotal;
    if (s.iva_pct) total += subtotal * (s.iva_pct / 100);
    if (s.descuento_contado) total -= total * 0.10;
    document.getElementById(tipo + '_subtotal').textContent = fmtARS(subtotal);
    document.getElementById(tipo + '_total').textContent = fmtARS(total);
  },

  limpiar(tipo) {
    this.state[tipo] = this.blank();
    this.editingId[tipo] = null;
    this.render(tipo);
  },

  async guardar(tipo) {
    const s = this.state[tipo];
    if (!s.cliente) return toast('Elegí un cliente', true);
    if (!s.items.length) return toast('Agregá al menos un producto o mano de obra', true);
    const body = {
      tipo,
      cliente_id: s.cliente.id,
      items: s.items.map(it => ({ tipo: it.tipo, ref_id: it.ref_id || null, descripcion: it.descripcion, cantidad: it.cantidad, precio_unit: it.precio_unit })),
      iva_pct: s.iva_pct,
      descuento_contado: s.descuento_contado,
      forma_pago: s.forma_pago,
      validez_dias: tipo === 'presupuesto' ? s.validez_dias : null,
      notas: s.notas,
      moneda: 'ARS'
    };
    try {
      let doc;
      if (this.editingId[tipo]) doc = await API.put('/api/documentos/' + this.editingId[tipo], body);
      else doc = await API.post('/api/documentos', body);
      this.editingId[tipo] = doc.id;
      toast((tipo === 'factura' ? 'Factura' : 'Presupuesto') + ' guardado');
      this.render(tipo);
    } catch (e) { toast(e.message, true); }
  },

  verPdf(tipo, id) { window.open('/api/pdf/' + id, '_blank'); },

  async cargarParaEditar(tipo, docId) {
    const doc = await API.get('/api/documentos/' + docId);
    doc._cliente = await API.get('/api/clientes/' + doc.cliente_id);
    switchTab(tipo);
    this.render(tipo, doc);
  }
};

// ============ HISTORIAL ============
const Historial = {
  clientesCache: {},
  async cargar() {
    const tipo = document.getElementById('historialTipo').value;
    const docs = await API.get('/api/documentos' + (tipo ? '?tipo=' + tipo : ''));
    // resolver nombres de cliente
    const idsFaltantes = [...new Set(docs.map(d => d.cliente_id))].filter(id => !this.clientesCache[id]);
    for (const id of idsFaltantes) {
      try { this.clientesCache[id] = await API.get('/api/clientes/' + id); } catch (e) { this.clientesCache[id] = null; }
    }
    const tbody = document.getElementById('historialTbody');
    if (!docs.length) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="7">Todavía no generaste facturas ni presupuestos.</td></tr>`;
      return;
    }
    tbody.innerHTML = docs.map(d => {
      const c = this.clientesCache[d.cliente_id];
      return `
      <tr>
        <td>${d.tipo === 'factura' ? 'Factura' : 'Presupuesto'}</td>
        <td>#${String(d.numero).padStart(6, '0')}</td>
        <td>${c ? esc(c.nombre) + ' ' + esc(c.apellido) : '—'}</td>
        <td>${new Date(d.creado).toLocaleDateString('es-AR')}</td>
        <td>${d.forma_pago ? DocForm.labelFP(d.forma_pago) : '—'}</td>
        <td><strong>${fmtARS(d.total)}</strong></td>
        <td class="row-actions">
          <button class="btn btn-ghost btn-sm" onclick="window.open('/api/pdf/${d.id}','_blank')">PDF</button>
          <button class="btn btn-ghost btn-sm" onclick="DocForm.cargarParaEditar('${d.tipo}', ${d.id})">Editar</button>
          <button class="btn btn-danger btn-sm" onclick="Historial.eliminar(${d.id})">Eliminar</button>
        </td>
      </tr>`;
    }).join('');
  },
  async eliminar(id) {
    if (!confirm('¿Eliminar este documento?')) return;
    await API.del('/api/documentos/' + id);
    toast('Documento eliminado'); this.cargar();
  }
};
document.getElementById('historialTipo').addEventListener('change', () => Historial.cargar());

// ============ AGENDA ============
const Agenda = {
  fechaActual: new Date().toISOString().slice(0, 10),
  data: [],
  clienteCache: [],

  init() {
    document.getElementById('agendaFecha').value = this.fechaActual;
    document.getElementById('agendaFecha').addEventListener('change', (e) => {
      this.fechaActual = e.target.value;
      this.cargar();
    });
  },
  hoy() {
    this.fechaActual = new Date().toISOString().slice(0, 10);
    document.getElementById('agendaFecha').value = this.fechaActual;
    this.cargar();
  },
  cambiarDia(delta) {
    const d = new Date(this.fechaActual + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    this.fechaActual = d.toISOString().slice(0, 10);
    document.getElementById('agendaFecha').value = this.fechaActual;
    this.cargar();
  },
  async cargar() {
    this.data = await API.get('/api/turnos?fecha=' + this.fechaActual);
    this.pintar();
  },
  labelEstado(e) { return { pendiente: 'Pendiente', confirmado: 'Confirmado', completado: 'Completado', cancelado: 'Cancelado' }[e] || e; },
  pintar() {
    const cont = document.getElementById('agendaLista');
    if (!this.data.length) {
      cont.innerHTML = `<div class="empty-state">No hay turnos reservados para este día.</div>`;
      return;
    }
    cont.innerHTML = this.data.map(t => `
      <div class="turno-card">
        <div class="turno-hora">${esc(t.hora)}</div>
        <div class="turno-info">
          <div class="turno-cliente">${esc(t.cliente_nombre || (t.cliente_id ? 'Cliente #' + t.cliente_id : 'Sin nombre'))}</div>
          <div class="turno-motivo">${esc(t.motivo || 'Sin motivo especificado')} · ${t.duracion_min} min</div>
        </div>
        <span class="turno-estado ${t.estado}">${this.labelEstado(t.estado)}</span>
        <div class="turno-actions">
          ${t.estado !== 'completado' ? `<button class="btn btn-ghost btn-sm" onclick="Agenda.cambiarEstado(${t.id}, 'completado')">✓</button>` : ''}
          ${t.estado !== 'cancelado' ? `<button class="btn btn-ghost btn-sm" onclick="Agenda.cambiarEstado(${t.id}, 'cancelado')">✕</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="Agenda.editar(${t.id})">Editar</button>
          <button class="btn btn-danger btn-sm" onclick="Agenda.eliminar(${t.id})">Eliminar</button>
        </div>
      </div>
    `).join('');
  },
  async cambiarEstado(id, estado) {
    await API.put('/api/turnos/' + id, { estado });
    toast('Turno actualizado'); this.cargar();
  },
  formHTML(t = {}) {
    return `
      <label>Cliente
        <input type="search" id="t_clienteBuscar" placeholder="Buscar cliente registrado..." value="${t.cliente_id ? '' : ''}">
      </label>
      <div id="t_clienteResultados" class="search-results" style="display:none"></div>
      <div id="t_clienteSel" class="selected-client-box ${t.cliente_id ? 'show' : ''}">
        ${t.cliente_id ? `Cliente #${t.cliente_id} seleccionado <button class="btn btn-ghost btn-sm" onclick="Agenda.quitarCliente()">Quitar</button>` : ''}
      </div>
      <label>O nombre libre (si no es un cliente registrado)<input id="t_cliente_nombre" value="${esc(t.cliente_nombre)}"></label>
      <div class="form-grid">
        <label>Fecha*<input id="t_fecha" type="date" value="${t.fecha || Agenda.fechaActual}"></label>
        <label>Hora*<input id="t_hora" type="time" value="${t.hora || ''}"></label>
      </div>
      <div class="form-grid">
        <label>Duración (minutos)<input id="t_duracion" type="number" step="5" value="${t.duracion_min || 30}"></label>
        ${t.id ? `<label>Estado
          <select id="t_estado">
            ${['pendiente', 'confirmado', 'completado', 'cancelado'].map(e => `<option value="${e}" ${t.estado === e ? 'selected' : ''}>${this.labelEstado(e)}</option>`).join('')}
          </select>
        </label>` : ''}
      </div>
      <label>Motivo<input id="t_motivo" value="${esc(t.motivo)}" placeholder="Ej: Revisión de equipo"></label>
      <label>Notas<textarea id="t_notas" rows="2">${esc(t.notas)}</textarea></label>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="Modal.cerrar()">Cancelar</button>
        <button class="btn btn-primary" onclick="Agenda.guardar(${t.id || 'null'})">Guardar</button>
      </div>
    `;
  },
  _clienteSeleccionado: null,
  abrirNuevo() {
    this._clienteSeleccionado = null;
    Modal.abrir('Reservar turno', this.formHTML());
    this.bindClienteBuscar();
  },
  editar(id) {
    const t = this.data.find(x => x.id === id);
    this._clienteSeleccionado = t.cliente_id || null;
    Modal.abrir('Editar turno', this.formHTML(t));
    this.bindClienteBuscar();
  },
  bindClienteBuscar() {
    document.getElementById('t_clienteBuscar').addEventListener('input', debounce(async (e) => {
      const q = e.target.value.trim();
      const box = document.getElementById('t_clienteResultados');
      if (!q) { box.style.display = 'none'; return; }
      const results = await API.get('/api/clientes?q=' + encodeURIComponent(q));
      this.clienteCache = results;
      box.style.display = results.length ? 'block' : 'none';
      box.innerHTML = results.map(c => `
        <div class="search-result-item" onclick="Agenda.elegirCliente(${c.id})">
          <span>${esc(c.nombre)} ${esc(c.apellido)} — N° ${c.numero_cliente}</span>
        </div>`).join('');
    }, 250));
  },
  elegirCliente(id) {
    const c = this.clienteCache.find(x => x.id === id);
    this._clienteSeleccionado = id;
    document.getElementById('t_clienteResultados').style.display = 'none';
    document.getElementById('t_clienteBuscar').value = '';
    const box = document.getElementById('t_clienteSel');
    box.classList.add('show');
    box.innerHTML = `${esc(c.nombre)} ${esc(c.apellido)} <button class="btn btn-ghost btn-sm" onclick="Agenda.quitarCliente()">Quitar</button>`;
  },
  quitarCliente() {
    this._clienteSeleccionado = null;
    const box = document.getElementById('t_clienteSel');
    box.classList.remove('show'); box.innerHTML = '';
  },
  async guardar(id) {
    const fecha = val('t_fecha'); const hora = val('t_hora');
    const cliente_nombre = val('t_cliente_nombre');
    if (!fecha || !hora) return toast('Fecha y hora son obligatorias', true);
    if (!this._clienteSeleccionado && !cliente_nombre) return toast('Elegí un cliente o escribí un nombre', true);
    const body = {
      cliente_id: this._clienteSeleccionado || null,
      cliente_nombre: this._clienteSeleccionado ? null : cliente_nombre,
      fecha, hora,
      duracion_min: Number(val('t_duracion')) || 30,
      motivo: val('t_motivo'),
      notas: val('t_notas')
    };
    if (id) body.estado = document.getElementById('t_estado').value;
    try {
      if (id) await API.put('/api/turnos/' + id, body);
      else await API.post('/api/turnos', body);
      Modal.cerrar(); toast('Turno guardado');
      this.fechaActual = fecha; document.getElementById('agendaFecha').value = fecha;
      this.cargar();
    } catch (e) { toast(e.message, true); }
  },
  async eliminar(id) {
    if (!confirm('¿Eliminar este turno?')) return;
    await API.del('/api/turnos/' + id);
    toast('Turno eliminado'); this.cargar();
  }
};
Agenda.init();

// ============ BALANCE ============
const Balance = {
  async cargar() {
    const anioSel = document.getElementById('balanceAnio');
    const mesSel = document.getElementById('balanceMes');
    if (!anioSel.dataset.loaded) {
      const preview = await API.get('/api/balance?anio=' + new Date().getFullYear());
      anioSel.innerHTML = preview.aniosDisponibles.map(a => `<option value="${a}">${a}</option>`).join('');
      anioSel.dataset.loaded = '1';
    }
    const anio = anioSel.value || new Date().getFullYear();
    const mes = mesSel.value;
    const data = await API.get(`/api/balance?anio=${anio}${mes ? '&mes=' + mes : ''}`);
    this.pintar(data);
  },
  pintar(d) {
    const cont = document.getElementById('balanceContenido');
    const pctProd = d.totalFacturado ? Math.round((d.totalProductos / (d.totalProductos + d.totalManoObra || 1)) * 100) : 0;
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const maxMes = Math.max(1, ...Object.values(d.porMes));

    let html = `
      <div class="balance-cards">
        <div class="balance-card">
          <div class="label">Total facturado</div>
          <div class="value copper">${fmtARS(d.totalFacturado)}</div>
        </div>
        <div class="balance-card">
          <div class="label">Cantidad de facturas</div>
          <div class="value">${d.cantidadFacturas}</div>
        </div>
        <div class="balance-card">
          <div class="label">Promedio por factura</div>
          <div class="value">${fmtARS(d.promedioPorFactura)}</div>
        </div>
        <div class="balance-card">
          <div class="label">Productos vs. mano de obra</div>
          <div class="balance-split">
            <div class="seg-prod" style="width:${pctProd}%"></div>
            <div class="seg-mo" style="width:${100 - pctProd}%"></div>
          </div>
          <div class="balance-legend">
            <span class="l-prod">${fmtARS(d.totalProductos)}</span>
            <span class="l-mo">${fmtARS(d.totalManoObra)}</span>
          </div>
        </div>
      </div>
    `;

    if (!d.mes) {
      html += `<div class="bar-chart">` + meses.map((m, i) => {
        const key = String(i + 1).padStart(2, '0');
        const valor = d.porMes[key] || 0;
        const h = Math.max(3, Math.round((valor / maxMes) * 120));
        return `<div class="bar-chart-col"><div class="bar-chart-bar" style="height:${h}px" title="${fmtARS(valor)}"></div><div class="bar-chart-label">${m}</div></div>`;
      }).join('') + `</div>`;
    }

    const formas = { contado: 'Contado', efectivo: 'Efectivo', tarjeta: 'Tarjeta', billetera_virtual: 'Billetera virtual' };
    const entradasFP = Object.entries(d.porFormaPago);
    html += `<div class="formapago-list">
      <div class="doc-section-title">Por forma de pago</div>
      ${entradasFP.length ? entradasFP.map(([k, v]) => `
        <div class="formapago-row"><span>${formas[k] || k}</span><strong>${fmtARS(v)}</strong></div>
      `).join('') : '<p class="hint">No hay facturas en este período.</p>'}
    </div>`;

    cont.innerHTML = html;
  }
};

// ============ NEGOCIO ============
const Negocio = {
  async cargar() {
    const cfg = await API.get('/api/settings');
    document.getElementById('cfg_nombre').value = cfg.negocio_nombre || '';
    document.getElementById('cfg_cuit').value = cfg.negocio_cuit || '';
    document.getElementById('cfg_direccion').value = cfg.negocio_direccion || '';
    document.getElementById('cfg_telefono').value = cfg.negocio_telefono || '';
    document.getElementById('cfg_email').value = cfg.negocio_email || '';
    document.getElementById('cfg_iva').value = cfg.iva_pct_default || 0;
    document.getElementById('cfg_recargo').value = cfg.recargo_pct_default || 0;
    document.getElementById('cfg_tasa_modo').value = cfg.tasa_cambio_modo || 'auto';
    document.getElementById('cfg_tasa_manual').value = cfg.tasa_cambio_manual || '';

    const logoImg = document.getElementById('logoPreview');
    logoImg.src = cfg.negocio_logo || '';
    logoImg.style.visibility = cfg.negocio_logo ? 'visible' : 'hidden';
    applyBrandLogo(cfg.negocio_logo);

    const fondoImg = document.getElementById('fondoPreview');
    fondoImg.src = cfg.negocio_fondo || '';
    fondoImg.style.visibility = cfg.negocio_fondo ? 'visible' : 'hidden';

    document.getElementById('cfg_app_nombre').value = cfg.app_nombre || 'FacturApp';
    document.getElementById('cfg_app_nombre').oninput = (e) => applyBrandName(e.target.value);

    document.getElementById('cfg_tema_acento').value = cfg.tema_acento || '#C9713D';
    document.getElementById('cfg_tema_sidebar').value = cfg.tema_sidebar || '#1B2733';
    document.getElementById('cfg_tema_fondo').value = cfg.tema_fondo || '#F7F5F1';
    ['cfg_tema_acento', 'cfg_tema_sidebar', 'cfg_tema_fondo'].forEach(id => {
      document.getElementById(id).oninput = () => applyTheme({
        tema_acento: val('cfg_tema_acento'),
        tema_sidebar: val('cfg_tema_sidebar'),
        tema_fondo: val('cfg_tema_fondo')
      });
    });

    const tasa = await API.get('/api/settings/tasa-cambio');
    document.getElementById('tasaInfo').textContent = tasa.tasa > 0
      ? `Cotización actual: $${tasa.tasa} (${tasa.modo === 'manual' ? 'manual' : 'automática, dólar oficial'})${tasa.actualizada ? ' · actualizada ' + new Date(tasa.actualizada).toLocaleString('es-AR') : ''}`
      : 'Todavía no se pudo obtener la cotización automática. Podés configurar un valor manual.';
  },
  async guardar() {
    const body = {
      negocio_nombre: val('cfg_nombre'), negocio_cuit: val('cfg_cuit'), negocio_direccion: val('cfg_direccion'),
      negocio_telefono: val('cfg_telefono'), negocio_email: val('cfg_email'),
      iva_pct_default: val('cfg_iva'), tasa_cambio_modo: document.getElementById('cfg_tasa_modo').value,
      tasa_cambio_manual: val('cfg_tasa_manual'), recargo_pct_default: val('cfg_recargo'),
      tema_acento: val('cfg_tema_acento'), tema_sidebar: val('cfg_tema_sidebar'), tema_fondo: val('cfg_tema_fondo'),
      app_nombre: val('cfg_app_nombre') || 'FacturApp'
    };
    try {
      const cfg = await API.put('/api/settings', body);
      applyTheme(cfg);
      applyBrandName(cfg.app_nombre);
      const logoFile = document.getElementById('cfg_logo_file').files[0];
      if (logoFile) {
        const fd = new FormData(); fd.append('logo', logoFile);
        const nuevaCfg = await API.post('/api/settings/logo', fd, true);
        applyBrandLogo(nuevaCfg.negocio_logo);
      }
      const fondoFile = document.getElementById('cfg_fondo_file').files[0];
      if (fondoFile) { const fd = new FormData(); fd.append('fondo', fondoFile); await API.post('/api/settings/fondo', fd, true); }
      document.getElementById('negocioGuardadoMsg').textContent = '✓ Guardado';
      setTimeout(() => document.getElementById('negocioGuardadoMsg').textContent = '', 2500);
      this.cargar(); cargarTasaBadge();
    } catch (e) { toast(e.message, true); }
  },
  async restaurarColores() {
    try {
      const cfg = await API.post('/api/settings/tema/restaurar', {});
      applyTheme(cfg);
      this.cargar();
      toast('Colores restaurados');
    } catch (e) { toast(e.message, true); }
  }
};

// ============ BACKUP ============
const Backup = {
  exportar() {
    window.open('/api/backup/exportar', '_blank');
  },
  async importar() {
    const input = document.getElementById('backupArchivo');
    const file = input.files[0];
    if (!file) return toast('Elegí primero el archivo .zip del backup', true);
    const ok = confirm('Esto va a REEMPLAZAR todos los datos actuales (clientes, productos, facturas, presupuestos, stock, agenda y configuración) por los del backup. ¿Confirmás que querés continuar?');
    if (!ok) return;

    const estado = document.getElementById('backupEstado');
    estado.textContent = 'Restaurando, no cierres esta ventana...';
    const fd = new FormData();
    fd.append('backup', file);
    try {
      const r = await fetch('/api/backup/importar', { method: 'POST', body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error al restaurar el backup');
      estado.textContent = '✓ Backup restaurado correctamente. Recargando la app...';
      toast('Backup restaurado');
      setTimeout(() => location.reload(), 1500);
    } catch (e) {
      estado.textContent = '';
      toast(e.message, true);
    }
  }
};

// ---------- Init ----------
(async function initApp() {
  try {
    const cfg = await API.get('/api/settings');
    applyTheme(cfg);
    applyBrandName(cfg.app_nombre);
    applyBrandLogo(cfg.negocio_logo);
  } catch (e) { /* usa valores por defecto */ }
  Clientes.cargar();
  cargarTasaBadge();
  Stock.actualizarAlertas();
})();
setInterval(cargarTasaBadge, 5 * 60 * 1000);
setInterval(() => Stock.actualizarAlertas(), 5 * 60 * 1000);
