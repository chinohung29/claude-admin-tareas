# Restaurar el respaldo de la app "Seguimiento de búsqueda laboral"

Contenido: `pwa/` (la app), `docs/` (prompt de la rutina diaria), `supabase/` (esquema y datos), `netlify.toml`, `CLAUDE.md`.

1. **Librerías (`pwa/vendor/`)**: el zip las incluye. Si faltan, bajarlas de npm:
   - `pwa/vendor/supabase.js` = `@supabase/supabase-js` (build UMD, `dist/umd/supabase.js`), versión 2.117.3.
   - `pwa/vendor/pdf.min.mjs` y `pdf.worker.min.mjs` = `pdfjs-dist` 6.4.299, carpeta `legacy/build/`.
2. **Base de datos**: crear un proyecto en Supabase, ejecutar `supabase/schema.sql` y después `supabase/datos-2026-10-08.sql`. Cambiar `SUPABASE_URL` y `SUPABASE_KEY` (clave publishable) en `pwa/app.js`. Después crear la cuenta desde la pantalla de acceso.
3. **Publicación**: subir el repo a GitHub y conectarlo a un proyecto de Netlify (`netlify.toml` ya indica que se publica `pwa/`), o arrastrar la carpeta `pwa/` a Netlify.
4. **Rutina diaria**: pegar `docs/prompt-rutina-diaria.md` en la tarea programada y actualizar el id del proyecto de Supabase si cambió.

Las claves secretas no están en el respaldo: la clave `sb_publishable_…` que aparece en `pwa/app.js` es pública por diseño.
