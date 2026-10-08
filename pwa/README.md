# Seguimiento de búsqueda laboral (PWA)

App estática instalable, sin build. Datos y login en Supabase (proyecto `LMH_Flow_Proyecto`, esquema aislado `busqueda_laboral`).

- `index.html`, `styles.css`, `app.js`: interfaz (pendiente / postulado / descartado, archivar, agregar a mano).
- `vendor/supabase.js`: supabase-js (UMD), servido local para que funcione offline.
- `sw.js`: service worker. Cachea el shell; la API va directo a la red. Al cambiar archivos del shell, subir `VERSION`.
- `manifest.webmanifest` + `icons/`: instalación en el celu o la PC.

## Datos (esquema `busqueda_laboral`)
- `ofertas`: el listado diario. Lo escribe la rutina; la app solo lee.
- `estados`: estado por oferta (`pendiente`/`postulado`/`descartado`, `archived`, `removed`). Sincronizado en tiempo real entre dispositivos. Sin conexión se guarda local y se sube al volver.
- `manuales`: ofertas agregadas a mano desde la app.
- RLS activado en las tres: solo el dueño (`es_dueno()`, por email del JWT) puede leer o escribir. El proyecto comparte auth con otras apps, por eso la política no se limita a "usuario autenticado".
- La clave `sb_publishable_…` del código es pública por diseño; sin sesión del dueño no devuelve nada.

## Rutina diaria
1. Leer `estados` donde `status = 'descartado'` y no volver a proponer esos `job_id`.
2. Borrar de `ofertas` las que estén `removed` o descartadas.
3. Insertar las ofertas nuevas en `ofertas` (id nuevo, `bloque` = `admin`/`ia`/`odoo`, `prio`, `nuevo = true`).

## Login
Link mágico por mail (`signInWithOtp`, sin crear usuarios nuevos). Hay que agregar la URL donde se publique la app en Supabase → Authentication → URL Configuration → Redirect URLs.

## Probar local
`cd pwa && python3 -m http.server 8000` y abrir http://localhost:8000 (el service worker funciona en localhost; para el login, `http://localhost:8000` también tiene que estar en Redirect URLs).

## Publicar
Servir `pwa/` por HTTPS (Netlify, GitHub Pages, etc.). Necesario para instalarla.
