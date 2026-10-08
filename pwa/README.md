# Seguimiento de búsqueda laboral (PWA)

App estática instalable, sin build. Datos y login en su propio proyecto de Supabase (`busqueda-laboral`, ref `bclqrmeeqssvqovkvvkz`, São Paulo), separado de LMH Flow. Publicada en Netlify como proyecto propio (`busqueda-laboral-lmh`).

- `index.html`, `styles.css`, `app.js`, `cv.js`: interfaz (pendiente / postulado / descartado, archivar, agregar a mano, perfil/CV).
- `vendor/`: supabase-js y pdf.js, servidos locales para que funcione offline.
- `sw.js`: service worker. Cachea el shell; la API va directo a la red. Al cambiar archivos del shell, subir `VERSION`.
- `manifest.webmanifest` + `icons/`: instalación en el celu o la PC.
- `../netlify.toml`: publica la carpeta `pwa/`.

## Datos (esquema `public`)
- `ofertas`: el listado diario. Lo escribe la rutina; la app solo lee.
- `estados`: estado por oferta (`pendiente`/`postulado`/`descartado`, `archived`, `removed`). Sincronizado en tiempo real. Sin conexión se guarda local y se sube al volver.
- `manuales`: ofertas agregadas a mano desde la app.
- `perfil`: una sola fila (`id = 'principal'`). La app guarda `cv_nombre`, `cv_texto` y `cv_actualizado` (el archivo se lee en el navegador; no se sube). El agente escribe `analisis` (jsonb), `analisis_de_cv` y `analisis_actualizado`; la app no puede escribir esas columnas.
- RLS en las cuatro: solo el dueño (`public.es_dueno()`, por email del JWT) lee o escribe. `anon` no tiene acceso.
- La clave `sb_publishable_…` del código es pública por diseño; sin sesión del dueño no devuelve nada.

## Login
Email y contraseña (`signInWithPassword`). La cuenta se crea una sola vez desde la app ("Crear cuenta (primera vez)"). Un trigger en `auth.users` (`solo_dueno_se_registra`) rechaza cualquier otro email y deja la cuenta del dueño confirmada al crearse, sin depender del mail. Para habilitar a otra persona hay que editar ese trigger y `es_dueno()`.
Recomendado: en Supabase → Authentication → URL Configuration, poner como Site URL `https://busqueda-laboral-lmh.netlify.app` (por defecto apunta a localhost; solo afecta a mails de Auth).

## Rutina diaria
0. Leer `perfil`. Si hay `cv_texto` y `analisis_de_cv` es null o menor que `cv_actualizado`, analizar el CV y escribir `analisis` con esta forma: `{"resumen": "", "seniority": "", "fortalezas": [], "oportunidades": [], "palabras_clave": {"admin": [], "ia": [], "odoo": []}}`, más `analisis_de_cv = cv_actualizado` y `analisis_actualizado = now()`. Usar `palabras_clave`, la seniority y las fortalezas para armar las búsquedas y ordenar las ofertas (`prio`) por coincidencia con el CV. Si el análisis ya está al día, reutilizarlo.
1. Leer `estados` donde `status = 'descartado'` y no volver a proponer esos `job_id`.
2. Borrar de `ofertas` las que estén `removed` o descartadas.
3. Insertar las ofertas nuevas en `ofertas` (id nuevo, `bloque` = `admin`/`ia`/`odoo`, `prio`, `nuevo = true`).

## Probar local
`cd pwa && python3 -m http.server 8000` y abrir http://localhost:8000 (el service worker funciona en localhost).
