# ERP de Auditoría, Inventario y Gestión Logística

Plataforma integral para el control de inventarios, recepción de mercancías, auditorías documentales y confiabilidad

## 🚀 Requisitos Previos
- Servidor Web (Nginx, Apache, LiteSpeed o Hosting compartido con soporte SSL).
- Proyecto configurado en **Supabase** (PostgreSQL 15+).

## 🛠️ Instalación y Despliegue

1. **Configuración de Base de Datos:**
   - Ejecuta los scripts de la carpeta `supabase/migrations/` en el SQL Editor de Supabase en orden cronológico (`001` a `005`).
   - Verifica la creación de los buckets de Storage: `recepciones-pdf` y `auditorias`.

2. **Configuración del Cliente:**
   - Edita `js/supabaseClient.js` con la URL y Anon Key correspondientes a tu instancia de producción:
   ```javascript
   window.supabaseClient = window.supabase.createClient(
     'https://TU_PROYECTO.supabase.co',
     'TU_ANON_KEY'
   );

# Auditoría EI — Actualización de soportes documentales

**Versión documentada:** 1.1.0  
**Fecha de intervención:** 6 de agosto de 2026  
**Proyecto base recibido:** `AuditoriaEI-main.zip`  
**Objetivo:** habilitar la gestión de múltiples soportes en todos los puntos del proyecto que ya manejaban documentos, conservando compatibilidad con los registros existentes y dejando trazabilidad técnica de los cambios.

---

## 1. Alcance funcional implementado

Se revisó el proyecto completo y se identificaron dos módulos con gestión documental real:

1. **Auditorías**
2. **Recepción**

Los inputs de Excel de **Inventario** y **BI** son importadores de datos para procesamiento y generación de reportes. No son repositorios de soportes, por lo que no fueron modificados para evitar afectar sus flujos actuales.

En Auditorías y Recepción se habilitó lo siguiente:

- Mínimo obligatorio: **1 soporte** por registro.
- Máximo permitido: **10 soportes** por registro.
- Imágenes: JPG, JPEG, PNG, GIF, WEBP, BMP, SVG, HEIC y HEIF.
- PDF.
- Videos: MP4, WEBM, MOV, M4V, AVI, MPEG, MPG, 3GP y MKV.
- Enlaces de Google Drive y Google Docs.
- En Auditorías se conservaron además los formatos documentales que ya existían: XLS, XLSX, CSV, DOC, DOCX y TXT.
- Límite del frontend: **100 MB por archivo**.
- Prevención de archivos repetidos durante una misma selección.
- Prevención de enlaces de Drive repetidos durante una misma selección.
- Validación de URL: únicamente se aceptan enlaces HTTPS de `drive.google.com` o `docs.google.com`.
- Contadores visibles de soportes seleccionados y almacenados.
- Apertura individual de archivos y enlaces.
- Eliminación individual, sin permitir que el registro quede con menos de un soporte.
- Posibilidad de agregar nuevos soportes a registros ya creados, hasta completar el máximo de diez.

> El tamaño efectivo permitido también depende del límite configurado en Supabase Storage. El frontend rechaza archivos superiores a 100 MB, pero Supabase puede tener un límite menor según la configuración del proyecto.

---

## 2. Cambios en el módulo de Recepción

### 2.1 Formulario de nueva recepción

El campo anterior **“Adjuntar PDF / Remisión”**, que aceptaba un solo PDF, fue reemplazado por un panel documental completo.

Ahora permite:

- Seleccionar varios archivos en una sola operación.
- Combinar archivos locales y enlaces de Drive.
- Ver el listado antes de guardar.
- Quitar elementos antes del envío.
- Validar el rango obligatorio de 1 a 10 soportes.

### 2.2 Persistencia sin migración de base de datos

Para no exigir cambios destructivos en Supabase se reutilizó la columna existente:

```text
recepciones.pdf_url
```

La columna ahora guarda un arreglo JSON serializado con los metadatos de cada soporte:

```json
[
  {
    "tipo": "archivo",
    "nombre": "remision.pdf",
    "url": "https://...",
    "ruta": "recepciones/uuid_remision.pdf",
    "mime": "application/pdf",
    "tamano": 245810
  },
  {
    "tipo": "drive",
    "nombre": "Enlace de Drive 2",
    "url": "https://drive.google.com/...",
    "ruta": "",
    "mime": "text/uri-list",
    "tamano": 0
  }
]
```

### 2.3 Compatibilidad con datos anteriores

Los registros antiguos que contienen una única URL en `pdf_url` continúan funcionando. El código detecta automáticamente si el valor es:

- Una URL antigua individual.
- Un arreglo JSON con múltiples soportes.

No se requiere convertir manualmente los registros existentes.

### 2.4 Storage utilizado

Los archivos físicos de Recepción continúan almacenándose en el bucket existente:

```text
recepciones-pdf
```

Las nuevas rutas utilizan esta estructura:

```text
recepciones/{uuid}_{nombre_limpio_del_archivo}
```

### 2.5 Gestión posterior al registro

Desde el botón de soportes de cada recepción ahora se puede:

- Consultar todos los soportes.
- Abrir cada archivo o enlace.
- Agregar nuevos archivos o enlaces hasta completar diez.
- Eliminar soportes, conservando mínimo uno.

La edición documental se restringe a usuarios con permisos de Recepción o a los roles operativos que el módulo ya reconoce para gestión: Admin, Auditor, Líder y Compras.

### 2.6 Limpieza y consistencia

- Si los archivos se suben, pero falla la inserción de la recepción, el sistema elimina los archivos recién cargados para evitar archivos huérfanos.
- Si falla una actualización documental, también se limpian los archivos nuevos que no alcanzaron a asociarse.
- Al eliminar una recepción, se consultan sus soportes y se eliminan del bucket las rutas físicas registradas.
- Los enlaces de Drive no se borran en Google Drive; únicamente se elimina su referencia dentro del ERP.

---

## 3. Cambios en el módulo de Auditorías

### 3.1 Registro de auditoría

La sección **Documentos Adjuntos** fue ampliada para permitir:

- Entre 1 y 10 soportes.
- Archivos locales de los formatos permitidos.
- Enlaces de Google Drive o Google Docs.
- Listado previo con nombre, tipo y tamaño.
- Eliminación temporal antes de guardar.

La auditoría no se guarda si no contiene por lo menos un soporte.

### 3.2 Persistencia sin cambiar la tabla

Se conserva la tabla existente:

```text
auditoria_documentos
```

Los archivos físicos continúan utilizando las columnas actuales:

- `auditoria_id`
- `nombre_archivo`
- `ruta_storage`
- `tipo_archivo`
- `tamano`

Los enlaces de Drive se guardan sin alterar el esquema. En `ruta_storage` se utiliza el prefijo interno:

```text
drive::https://drive.google.com/...
```

El sistema identifica ese prefijo y abre el enlace directamente, en lugar de solicitar una URL firmada a Storage.

### 3.3 Storage utilizado

Los archivos físicos de Auditorías continúan almacenándose en el bucket existente:

```text
auditorias
```

Las nuevas rutas utilizan la estructura:

```text
{auditoria_id}/{uuid}_{nombre_limpio_del_archivo}
```

### 3.4 Gestión documental posterior

El modal de documentos ahora permite:

- Consultar todos los soportes.
- Abrir archivos mediante URL firmada temporal.
- Abrir enlaces de Drive directamente.
- Agregar varios archivos a una auditoría existente.
- Agregar enlaces de Drive a una auditoría existente.
- Eliminar un soporte individual.
- Mantener la regla de mínimo uno y máximo diez.

En la edición general de la auditoría, los soportes nuevos **se agregan** a los existentes. Ya no se reemplaza y elimina automáticamente toda la documentación anterior.

### 3.5 Integridad de creación y eliminación

- Si se crea la auditoría pero falla la carga documental, se eliminan los soportes cargados durante esa operación y se revierte el registro de auditoría recién creado.
- Al eliminar una auditoría, se eliminan primero sus registros documentales y sus archivos físicos.
- Los enlaces de Drive solo se eliminan de `auditoria_documentos`; el contenido original de Google Drive no se modifica.

### 3.6 Trazabilidad existente

Las operaciones de agregar o eliminar soportes utilizan la función de historial/notificaciones que ya tenía el módulo:

```text
registrarEvento(...)
```

Se generan eventos para:

- Creación de auditoría con soportes.
- Adición de soportes.
- Adición de enlaces de Drive.
- Eliminación individual de soportes.
- Edición general con nuevos soportes.
- Eliminación completa de la auditoría.

---

## 4. Componente común creado

### Archivo nuevo

```text
js/adjuntos-common.js
```

Centraliza las reglas compartidas para evitar que Auditorías y Recepción tengan validaciones incompatibles.

Responsabilidades principales:

- Constantes `MIN_ADJUNTOS = 1` y `MAX_ADJUNTOS = 10`.
- Límite de 100 MB por archivo.
- Validación de extensiones y MIME types.
- Validación y normalización de enlaces de Drive.
- Sanitización de textos antes de insertarlos en HTML.
- Identificación visual de imagen, PDF, video, hoja de cálculo, documento y enlace.
- Formateo de tamaños.
- Serialización y deserialización de los soportes de Recepción.
- Compatibilidad con la URL única usada por Recepción antes de esta actualización.

---

## 5. Estilos comunes creados

### Archivo nuevo

```text
css/adjuntos.css
```

Incluye la presentación compartida de:

- Panel documental.
- Contadores.
- Selector de archivos.
- Campo para enlaces de Drive.
- Listado de soportes.
- Estados vacíos.
- Botones Abrir, Quitar y Eliminar.
- Adaptación responsive para pantallas pequeñas.

---

## 6. Archivos modificados

### `dashboard.html`

Se agregaron las referencias globales:

```html
<link rel="stylesheet" href="css/adjuntos.css">
<script src="js/adjuntos-common.js"></script>
```

El componente común se carga antes de los módulos dinámicos.

### `modules/recepcion.html`

- Se reemplazó el input único de PDF.
- Se agregó selector múltiple.
- Se agregó campo de Drive.
- Se agregó listado temporal.
- Se agregó contador.
- Se agregó modal de consulta y administración documental.

### `js/recepcion.js`

- Gestión temporal de 1 a 10 soportes.
- Subida múltiple a Supabase Storage.
- Serialización en `pdf_url`.
- Compatibilidad con registros antiguos.
- Modal de visualización.
- Adición y eliminación posterior.
- Limpieza de archivos huérfanos.
- Limpieza de Storage al eliminar recepciones.
- Notificaciones de cambios documentales.

### `modules/auditorias.html`

- Se ampliaron los formatos aceptados.
- Se agregó Drive en creación, edición y modal documental.
- Se agregaron selectores múltiples.
- Se agregaron contadores y listados de soporte.
- Se cambió el concepto de reemplazar por agregar.

### `js/auditorias.js`

- Validación obligatoria de 1 a 10 soportes.
- Archivos y Drive en la misma gestión.
- Persistencia compatible con `auditoria_documentos`.
- Adición posterior sin borrar documentos anteriores.
- Eliminación individual con mínimo obligatorio.
- Apertura firmada de archivos privados.
- Apertura directa de Drive.
- Reversión de creación si falla la documentación.
- Registro de eventos para trazabilidad.

### `js/adjuntos-common.js`

Archivo nuevo con la lógica compartida.

### `css/adjuntos.css`

Archivo nuevo con el diseño documental compartido.

---

## 7. Base de datos y compatibilidad

### No se requiere migración SQL

La implementación reutiliza:

```text
recepciones.pdf_url
auditoria_documentos
```

No se agregaron tablas, columnas, funciones SQL ni cambios de tipos de datos.

### Condición importante para `recepciones.pdf_url`

La columna debe admitir texto suficiente para almacenar el JSON de hasta diez soportes. Si actualmente fue creada como `text`, no se requiere ninguna acción. Si fue creada con un `varchar` muy corto, debe ampliarse a `text` antes del despliegue.

Consulta de verificación opcional en Supabase:

```sql
select
  table_name,
  column_name,
  data_type,
  character_maximum_length
from information_schema.columns
where table_schema = 'public'
  and table_name = 'recepciones'
  and column_name = 'pdf_url';
```

Solo si el resultado muestra un límite corto, ejecutar:

```sql
alter table public.recepciones
alter column pdf_url type text;
```

---

## 8. Configuración que debe verificarse en Supabase Storage

La actualización del frontend está terminada, pero los buckets remotos deben permitir los archivos solicitados.

### Bucket `recepciones-pdf`

- Debe existir.
- Debe permitir `INSERT` y `DELETE` a los usuarios autorizados.
- Debe permitir lectura pública porque el módulo conserva `getPublicUrl()` para compatibilidad con su diseño anterior.
- No debe estar restringido únicamente a `application/pdf`.
- Su límite por archivo debe permitir el tamaño de los videos que se usarán.

### Bucket `auditorias`

- Debe existir.
- Debe permitir `INSERT`, `SELECT` y `DELETE` a los usuarios autorizados.
- Puede permanecer privado; el módulo usa URLs firmadas temporales para abrir los archivos.
- No debe limitarse únicamente a PDF o Excel.

### Políticas

Las políticas RLS de `auditoria_documentos`, `recepciones` y `storage.objects` deben permitir las operaciones que ya realiza cada rol del ERP. Esta actualización no reemplaza ni amplía permisos remotos de Supabase desde el navegador.

---

## 9. Pruebas técnicas realizadas

Se ejecutaron las siguientes comprobaciones locales:

- Validación sintáctica de todos los archivos JavaScript mediante `node --check`.
- Verificación de IDs HTML duplicados en los módulos modificados.
- Validación de enlace correcto de Google Drive.
- Rechazo de enlaces de dominios diferentes.
- Aceptación de PDF.
- Aceptación de imágenes.
- Aceptación de videos.
- Conservación de Excel en Auditorías.
- Rechazo de ejecutables.
- Lectura de registros antiguos de Recepción con una única URL.
- Serialización y lectura del nuevo arreglo JSON de Recepción.

No se realizó una prueba contra el Supabase productivo porque las credenciales, políticas y límites de Storage dependen del entorno remoto donde se despliegue el proyecto.

---

## 10. Pruebas funcionales recomendadas después del despliegue

### Recepción nueva

1. Intentar guardar sin soporte: debe bloquearse.
2. Agregar una imagen: debe guardar.
3. Agregar un PDF, una imagen, un video y un Drive: deben quedar cuatro soportes.
4. Intentar agregar once: debe limitarse a diez.
5. Abrir los cuatro soportes desde la tabla.
6. Agregar un soporte adicional desde el modal de un registro existente.
7. Eliminar un soporte.
8. Intentar eliminar el último: debe bloquearse.
9. Eliminar la recepción y verificar que sus rutas desaparezcan del bucket.
10. Abrir una recepción antigua con URL única: debe seguir mostrando el soporte.

### Auditoría nueva

1. Intentar guardar sin soporte: debe bloquearse.
2. Registrar con PDF, imagen, video, Excel y Drive.
3. Abrir cada tipo desde Documentos.
4. Editar la auditoría y agregar más soportes: los anteriores deben conservarse.
5. Agregar soportes desde el modal Documentos.
6. Intentar superar diez: debe bloquearse.
7. Eliminar soportes hasta quedar uno.
8. Intentar eliminar el último: debe bloquearse.
9. Eliminar la auditoría y verificar limpieza de tabla y Storage.
10. Revisar que los eventos aparezcan en historial/notificaciones.

---

## 11. Matriz de trazabilidad

| Requisito | Implementación | Ubicación principal |
|---|---|---|
| Mínimo 1 soporte | Validación previa al guardado y bloqueo de eliminación del último | `js/recepcion.js`, `js/auditorias.js` |
| Máximo 10 soportes | Contadores y validación antes de seleccionar, subir y actualizar | `js/adjuntos-common.js`, módulos JS |
| Imágenes | `accept`, MIME y extensiones | HTML de módulos y `js/adjuntos-common.js` |
| PDF | `application/pdf` | HTML de módulos y componente común |
| Videos | MIME `video/*` y extensiones comunes | HTML de módulos y componente común |
| Drive | Validación HTTPS y dominios Google | `js/adjuntos-common.js` |
| Registros antiguos de Recepción | Parser de URL única | `deserializarRecepcion()` |
| Varios soportes en Recepción | JSON en `recepciones.pdf_url` | `serializarRecepcion()` |
| Varios soportes en Auditorías | Una fila por soporte | `auditoria_documentos` |
| No perder documentos al editar | Los nuevos soportes se agregan | `guardarCambiosAuditoria()` |
| Limpieza de archivos fallidos | Eliminación de rutas recién subidas | módulos JS |
| Trazabilidad de Auditorías | `registrarEvento()` | `js/auditorias.js` |
| Trazabilidad de Recepción | Notificaciones operativas | `crearNotificacion()` |
| Diseño uniforme | Hoja común responsive | `css/adjuntos.css` |

---

## 12. Huellas SHA-256 de los archivos intervenidos

Estas huellas permiten comprobar que los archivos desplegados corresponden exactamente a esta entrega.

```text
75b3e6c1554ff95382f748ebbe0cc031d88cc54a76f3b16a5a648cb9e41ee783  dashboard.html
4e9f992510691a2c3e8a62a695806df9fb7019715a8ef14507780d506f1b4c0c  css/adjuntos.css
6879733243569579a2f6fa3e58f28af0eec62c43b619984056a193b2449b9a33  js/adjuntos-common.js
b6eac53557aae598f1a95aa0c36b88d09473241cc883cbf3dc0574787e0434be  modules/recepcion.html
2f51a013544a4d8a33a63c46fe63e73432350850b136cd90051dbd8ad8498ac1  js/recepcion.js
10d882cffd5f750ea8215fbf5b49092579260223a64f829a42dfc8f72c02acd2  modules/auditorias.html
9b85f8debe101b85c1b5e80805cb4b7ebbd39d0f1015febc77b05ce9eeb23d86  js/auditorias.js
```

---

## 13. Secuencia de despliegue

1. Reemplazar el proyecto por esta versión o copiar los siete archivos intervenidos respetando sus rutas.
2. Confirmar que `dashboard.html` carga `css/adjuntos.css` y `js/adjuntos-common.js`.
3. Verificar buckets y políticas en Supabase.
4. Verificar el tipo de `recepciones.pdf_url`.
5. Subir los cambios al repositorio.
6. Desplegar.
7. Limpiar caché del navegador o hacer recarga forzada.
8. Ejecutar la matriz de pruebas funcionales de este README.

---

## 14. Archivos no modificados funcionalmente

No se alteraron los flujos de:

- Login.
- Usuarios.
- Inventario.
- Importación Excel de Inventario.
- BI.
- Importación Excel de BI.
- Dashboard de Recepción.
- Confiabilidad.
- Notificaciones generales, salvo el uso de la función ya existente para registrar cambios documentales de Recepción.

Esto reduce el riesgo de regresiones fuera del alcance solicitado.
