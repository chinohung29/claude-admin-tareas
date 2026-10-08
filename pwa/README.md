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
- `perfil`: una sola fila (`id = 'principal'`). La app guarda `cv_nombre`, `cv_texto` y `cv_actualizado` (el archivo PDF/DOCX/TXT/MD se lee en el navegador con `cv.js` y `vendor/pdf*.mjs`; no se sube). El agente escribe `analisis` (jsonb), `analisis_de_cv` y `analisis_actualizado`; la app no tiene permiso de escritura sobre esas columnas.
- RLS activado en las tres: solo el dueño (`es_dueno()`, por email del JWT) puede leer o escribir. El proyecto comparte auth con otras apps, por eso la política no se limita a "usuario autenticado".
- La clave `sb_publishable_…` del código es pública por diseño; sin sesión del dueño no devuelve nada.

## Rutina diaria
0. Leer `perfil`. Si hay `cv_texto` y `analisis_de_cv` es null o menor que `cv_actualizado`, analizar el CV y escribir `analisis` con esta forma: `{"resumen": "", "seniority": "", "fortalezas": [], "oportunidades": [], "palabras_clave": {"admin": [], "ia": [], "odoo": []}}`, más `analisis_de_cv = cv_actualizado` y `analisis_actualizado = now()`. Usar `palabras_clave`, la seniority y las fortalezas para armar las búsquedas y ordenar las ofertas (`prio`) por coincidencia con el CV. Si el análisis ya está al día, reutilizarlo.
1. Leer `estados` donde `status = 'descartado'` y no volver a proponer esos `job_id`.
2. Borrar de `ofertas` las que estén `removed` o descartadas.
3. Insertar las ofertas nuevas en `ofertas` (id nuevo, `bloque` = `admin`/`ia`/`odoo`, `prio`, `nuevo = true`).

## Login
Email y contraseña (`signInWithPassword`) con la contraseña que ya tiene la cuenta, o link mágico por mail (`signInWithOtp`, sin crear usuarios nuevos). La app no crea ni cambia contraseñas ni usuarios: el proyecto de Supabase se comparte con LMH Flow y no debe afectarla. Agregar la URL donde se publique la app en Supabase → Authentication → URL Configuration → Redirect URLs.

## Probar local
`cd pwa && python3 -m http.server 8000` y abrir http://localhost:8000 (el service worker funciona en localhost; para el login, `http://localhost:8000` también tiene que estar en Redirect URLs).

## Publicar
Servir `pwa/` por HTTPS (Netlify, GitHub Pages, etc.). Necesario para instalarla.

## Separar de LMH Flow (pendiente)
Hoy comparte con LMH Flow el proyecto de Supabase (esquema propio `busqueda_laboral`, con RLS por email) y los usuarios de Auth. Cambios hechos en el proyecto compartido: el esquema y sus tablas, el esquema agregado a `pgrst.db_schemas` del rol `authenticator`, las tablas `estados` y `perfil` en la publicación `supabase_realtime`, y las Redirect URLs de Auth. Al pasar a un proyecto propio: exportar las tablas del esquema, crear el esquema en el proyecto nuevo, cambiar `SUPABASE_URL` y `SUPABASE_KEY` en `app.js`, y en el viejo borrar el esquema, quitar la tabla de la publicación y volver `pgrst.db_schemas` a `public, graphql_public`.
