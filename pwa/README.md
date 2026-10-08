# Seguimiento de búsqueda laboral (PWA)

App estática instalable: sin build ni dependencias.

- `index.html`, `styles.css`, `app.js`: interfaz (pendiente / postulado / descartado, archivar, agregar a mano).
- `jobs.json`: listado diario de ofertas. La rutina diaria edita solo este archivo (`actualizado` + `items`).
- `sw.js`: service worker. Shell en caché; `jobs.json` va por red primero y cae a caché sin conexión. Al cambiar archivos del shell, subir `VERSION` en `sw.js`.
- `manifest.webmanifest` + `icons/`: instalación en el celu o la PC.

Los estados se guardan en el navegador de cada dispositivo (`localStorage`). "Exportar respaldo" / "Importar respaldo" los pasa de un dispositivo a otro.

## Probar local
`cd pwa && python3 -m http.server 8000` y abrir http://localhost:8000 (el service worker funciona en localhost).

## Publicar
Servir la carpeta `pwa/` por HTTPS (Netlify, GitHub Pages, etc.). Es necesario HTTPS para poder instalarla.
