# FacturApp

Aplicación autohospedada para gestionar clientes, productos, mano de obra, facturas y presupuestos, con conversión automática USD → ARS.

## Qué incluye

- **Clientes**: nombre, apellido, número de cliente automático, DNI/CUIL/CUIT (opcional), dirección, teléfono, localidad, provincia, país.
- **Productos**: nombre, imagen, precio en USD con conversión automática a ARS (cotización oficial vía dolarapi.com).
- **Stock**: cada producto tiene stock actual y stock mínimo. Al emitir una factura, el stock se descuenta automáticamente; si editás o eliminás la factura, se repone. Podés registrar entradas de mercadería (cuando te entrega tu proveedor) y hacer ajustes manuales (roturas, conteos). La app te avisa (badge en la pestaña + banner) cuando un producto queda en o por debajo del mínimo configurado.
- **Mano de obra**: descripción, precio en USD y ARS.
- **Facturas y Presupuestos**: buscador de clientes/productos/mano de obra, IVA configurable, descuento del 10% por pago contado, forma de pago (contado, efectivo, tarjeta, billetera virtual), edición posterior, exportación a PDF con tu logo e imagen de fondo. Los presupuestos no descuentan stock (solo las facturas, al ser ventas confirmadas).
- **Agenda**: reservá turnos por fecha y hora, vinculados a un cliente registrado o con nombre libre. Cada turno tiene estado (pendiente, confirmado, completado, cancelado) y podés navegar día por día.
- **Balance**: vista mensual o anual con total facturado, cantidad de facturas, promedio por factura, desglose productos vs. mano de obra, gráfico de barras por mes (vista anual) y totales por forma de pago.
- **Mi negocio**: datos de tu negocio, logo, imagen de fondo (marca de agua en los PDF), nombre de la app y colores personalizables, y configuración de la cotización del dólar (automática o manual).
- **Cuentas para cobro**: cargá tus CBU/CVU, alias y las empresas/billeteras virtuales asociadas (Mercado Pago, Ualá, bancos, etc.). Cuando una factura o presupuesto tiene la forma de pago "Billetera virtual", estos datos aparecen automáticamente en el PDF.
- **Backup automático a Google Drive**: además del backup manual, podés conectar una cuenta de servicio de Google para que la app suba un backup completo a tu Drive cada tantas horas (12 por defecto) de forma totalmente automática, sin que tengas que abrir la app.

Todo se guarda en una base de datos SQLite local — no necesitas ningún servidor de base de datos aparte.

## Requisitos

- Docker y Docker Compose instalados en tu NAS (Synology: Container Manager / DSM 7; QNAP: Container Station).

## Instalación

1. Copiá toda esta carpeta (`facturapp/`) a tu NAS, por ejemplo a `/volume1/docker/facturapp`.
2. Entrá a esa carpeta por SSH o terminal del NAS:

   ```bash
   cd /volume1/docker/facturapp
   docker compose up -d --build
   ```

3. Esperá a que termine de construir la imagen (la primera vez tarda uno o dos minutos).
4. Abrí en el navegador: `http://IP_DE_TU_NAS:8080`

Si el puerto 8080 ya lo usa otra aplicación de tu NAS, editá `docker-compose.yml` y cambiá la primera parte del mapeo de puertos, por ejemplo `"8090:3000"`.

## Primeros pasos dentro de la app

1. Entrá a la pestaña **Mi negocio** y completá tus datos, subí tu logo y (opcional) una imagen de fondo. Estos datos van a aparecer automáticamente en todas las facturas y presupuestos.
2. Cargá tus **Clientes**, **Productos** y **Mano de obra**.
3. En **Factura** o **Presupuesto**, buscá el cliente, agregá productos/mano de obra, ajustá IVA o el descuento por pago contado, elegí la forma de pago y guardá. Desde ahí podés ver o descargar el PDF.
4. En **Historial** podés ver, editar, volver a generar el PDF o eliminar cualquier factura o presupuesto ya emitido.

## Datos y backups

Los datos persisten en dos carpetas junto al `docker-compose.yml`:

- `./data` → base de datos (clientes, productos, facturas, etc.)
- `./uploads` → imágenes de productos, logo y fondo

Para hacer un backup a nivel de archivos, simplemente copiá esas dos carpetas.

**Backup desde la propia app (recomendado):** entrá a **Mi negocio → Backup y restauración** y hacé clic en "Descargar backup completo". Se descarga un único archivo `.zip` con todos tus datos (clientes, productos, mano de obra, facturas, presupuestos, stock, agenda y configuración) más tus imágenes (logo, fondo, fotos de productos). Guardalo en tu computadora o en la nube, fuera del NAS.

**Restaurar un backup:** en la misma sección, elegí el archivo `.zip` y hacé clic en "Restaurar backup". **Esto reemplaza todos los datos actuales** por los del archivo — usalo para recuperarte de una pérdida de datos o para migrar la app a otro NAS. La operación no se puede deshacer, así que si tenés datos actuales que querés conservar, hacé un backup de ellos primero.

### Backup automático a Google Drive

En **Mi negocio → Backup automático a Google Drive** podés dejar que la app suba un backup completo a tu Drive cada cierta cantidad de horas (12 por defecto), sin intervención manual. Usa una **cuenta de servicio** de Google (no tu usuario personal), que es el método pensado para procesos que corren solos en un servidor:

1. Entrá a [Google Cloud Console → Cuentas de servicio](https://console.cloud.google.com/iam-admin/serviceaccounts), creá un proyecto (o usá uno existente) y creá una cuenta de servicio.
2. Generale una clave nueva en formato **JSON** y descargala. Guardala en un lugar seguro: le da acceso a la carpeta de Drive que compartas con ella.
3. En el mismo proyecto, habilitá la **Google Drive API** (buscala en "APIs y servicios → Biblioteca").
4. En tu Google Drive, creá o elegí una carpeta para los backups. Compartila con el email de la cuenta de servicio (termina en `...iam.gserviceaccount.com`) con permiso de **Editor**, y copiá el ID de la carpeta (la parte de la URL después de `/folders/`).
5. En la app, subí el archivo JSON, pegá el ID de carpeta, elegí cada cuántas horas hacer backup y cuántas copias conservar en Drive (las más viejas se van borrando automáticamente), y activá el interruptor.
6. Podés probar la conexión o forzar un backup inmediato con los botones correspondientes.

El servidor revisa cada 15 minutos si corresponde hacer el backup según el intervalo configurado, y recuerda el último backup exitoso aunque reiniciés el contenedor (no se te va a acumular ni te va a faltar ningún backup por un reinicio).

## Actualizar la app si en el futuro cambiás el código

```bash
docker compose up -d --build
```

## Cotización del dólar

Por defecto la app consulta automáticamente el dólar oficial en dolarapi.com una vez por hora. Si tu NAS no tiene salida a internet o preferís fijar el valor manualmente, entrá a **Mi negocio → Cotización del dólar** y elegí modo "Manual".

## Notas técnicas

- Backend: Node.js 22 + Express + SQLite nativo (`node:sqlite`), sin dependencias de compilación nativa — funciona igual en NAS ARM o x86.
- PDF: generado con `pdfkit`, incluye logo, marca de agua de fondo y todos los datos de cliente/negocio/ítems.
- Frontend: HTML/CSS/JS simple, sin frameworks, para minimizar el consumo de recursos del NAS.
- Vas a ver un aviso `ExperimentalWarning: SQLite is an experimental feature` en los logs del contenedor: es normal, no afecta el funcionamiento.
