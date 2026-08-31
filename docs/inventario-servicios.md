# Inventario de Servicios y Arquitectura

| Servicio | Función en el Sistema | Estado / Proveedor | Configuración / Variables |
|---|---|---|---|
| **Frontend Web** | Interfaz SPA modular (HTML5, Vanilla JS, CSS3) | Servidor Web / Hosting Estático | Apache/Nginx con HTTPS y cabeceras CSP |
| **Base de Datos** | PostgreSQL relacional | Supabase Cloud | Tablas: `usuarios`, `recepciones`, `auditorias`, `inventario`, `confiabilidad`, `permisos`, `historial` |
| **Autenticación y RLS** | Control de acceso y políticas por fila | Supabase Auth & PostgreSQL RLS | Políticas RLS activas en todas las tablas |
| **Storage (Archivos)** | Almacenamiento de soportes y actas (PDF/Imágenes) | Supabase Storage | Buckets: `recepciones-pdf` (público), `auditorias` (privado) |
| **Realtime** | Sincronización en vivo de KPIs y tablas | Supabase Realtime (WebSockets) | Canal activo: `erp-realtime` |
| **CDN / Librerías** | Soporte gráfico y exportación | CDN jsDelivr / cdnjs | Chart.js, SheetJS (XLSX), jsPDF, html2canvas, FontAwesome |