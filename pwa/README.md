# Seguimiento de búsqueda laboral (PWA)

App estática instalable, sin build. Datos y login en su propio proyecto de Supabase (`busqueda-laboral`, ref `bclqrmeeqssvqovkvvkz`, São Paulo), separado de LMH Flow. Publicada en Netlify como proyecto propio (`busqueda-laboral-lmh`).

- `index.html`, `styles.css`, `app.js`, `cv.js`: interfaz (pendiente / postulado / descartado, archivar, agregar a mano, perfil/CV).
- `vendor/`: supabase-js y pdf.js, servidos locales para que funcione offline.
- `sw.js`: service worker. Cachea el shell; la API va directo a la red. Al cambiar archivos del shell, subir `VERSION`.
- `manifest.webmanifest` + `icons/`: instalación en el celu o la PC.
- `../netlify.toml`: publica la carpeta `pwa/`.

## Datos (esquema `public`)
- `ofertas`: el listado diario. Lo escribe la rutina; la app solo lee. La app muestra las Activas por defecto y tiene filtros para Archivadas, Descartadas y Todas; archiva sola las pendientes de más de 15 días.
- `estados`: estado por oferta (`pendiente`/`postulado`/`descartado`, `archived`, `removed`). Sincronizado en tiempo real. Sin conexión se guarda local y se sube al volver.
- `manuales`: ofertas agregadas a mano desde la app.
- `perfil`: una sola fila (`id = 'principal'`). La app guarda `cv_nombre`, `cv_texto` y `cv_actualizado` (el archivo se lee en el navegador; no se sube). El agente escribe `analisis` (jsonb), `analisis_de_cv` y `analisis_actualizado`; la app no puede escribir esas columnas.
- RLS en las cuatro: solo el dueño (`public.es_dueno()`, por email del JWT) lee o escribe. `anon` no tiene acceso.
- La clave `sb_publishable_…` del código es pública por diseño; sin sesión del dueño no devuelve nada.

## Login
Email y contraseña (`signInWithPassword`). La cuenta se crea una sola vez desde la app ("Crear cuenta (primera vez)"). Un trigger en `auth.users` (`solo_dueno_se_registra`) rechaza cualquier otro email y deja la cuenta del dueño confirmada al crearse, sin depender del mail. Para habilitar a otra persona hay que editar ese trigger y `es_dueno()`.
Recomendado: en Supabase → Authentication → URL Configuration, poner como Site URL `https://busqueda-laboral-lmh.netlify.app` (por defecto apunta a localhost; solo afecta a mails de Auth).

## Rutina diaria
El prompt completo para la tarea programada está en `../docs/prompt-rutina-diaria.md`. Resumen: leer `perfil` (analizar el CV si cambió), no proponer de nuevo lo `descartado` o archivado, insertar en `ofertas` avisos de hasta 15 días (si la fecha no se puede verificar se incluyen con `iso` null y la app los marca como "Fecha sin verificar") con `prio` por coincidencia, y nunca borrar filas (los descartados y archivados se ven en los filtros de la app).

## Instalación y tutorial
- Aviso de instalación (`#instalarBanner`): en celulares, o donde el navegador ofrezca `beforeinstallprompt`. En Android/Chrome muestra el botón «Instalar» (usa el prompt nativo); en iOS/Safari explica «Compartir → Añadir a pantalla de inicio» (iOS no tiene prompt programático); en otros navegadores móviles indica el menú. No aparece si ya está instalada y «Ahora no» lo oculta 7 días. Un sitio no puede forzar la instalación sin que la persona toque el botón: es una restricción de los navegadores.
- Tutorial de 6 pasos (`<dialog id="tutorial">`, contenido en `TUTORIAL` de `app.js`): se abre solo la primera vez que se entra en un dispositivo (`localStorage.lmh_tutorial_visto`) y se reabre con el botón «Ayuda». Cubre bienvenida, instalación, carga del CV, clasificación de ofertas, filtros y la rutina diaria.

## Probar local
`cd pwa && python3 -m http.server 8000` y abrir http://localhost:8000 (el service worker funciona en localhost).
