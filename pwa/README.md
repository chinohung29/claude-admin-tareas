# Seguimiento de búsqueda laboral (PWA)

App estática instalable, sin build. Datos y login en su propio proyecto de Supabase (`busqueda-laboral`, ref `bclqrmeeqssvqovkvvkz`, São Paulo), separado de LMH Flow. Publicada en Netlify como proyecto propio (`busqueda-laboral-lmh`).

- `index.html`, `styles.css`, `app.js`, `cv.js`: interfaz (pendiente / postulado / descartado, archivar, agregar a mano, perfil/CV).
- `vendor/`: supabase-js y pdf.js, servidos locales para que funcione offline.
- `sw.js`: service worker. Cachea el shell; la API va directo a la red. Al cambiar archivos del shell, subir `VERSION`.
- `manifest.webmanifest` + `icons/`: instalación en el celu o la PC.
- `../netlify.toml`: publica la carpeta `pwa/`.

## Datos (esquema `public`, multiusuario)
Cada tabla lleva `user_id` y los permisos (RLS) dejan a cada usuario ver y escribir solo lo suyo. `anon` no tiene acceso.
- `profiles`: plan de cuenta (`gratis` | `pro` | `cancelado`), vencimiento y suscripción de Mercado Pago. Se crea sola al registrarse; solo el servidor la modifica.
- `ofertas`: el listado diario de cada usuario. Lo escribe el agente (service role); la app solo lee. Muestra las Activas por defecto, con filtros para Archivadas, Descartadas y Todas; archiva sola las pendientes de más de 15 días.
- `estados`: estado por oferta (`pendiente`/`postulado`/`descartado`, `archived`). Clave `(user_id, job_id)`. Sincronizado en tiempo real; sin conexión se guarda local y se sube al volver.
- `manuales`: ofertas agregadas a mano desde la app.
- `perfil`: una fila por usuario con `cv_nombre`, `cv_texto` y `cv_actualizado` (el archivo se lee en el navegador; no se sube). El agente escribe `analisis`, `analisis_de_cv` y `analisis_actualizado`; la app no puede escribir esas columnas.
- `consentimientos`: constancia de qué se aceptó, versión y fecha (solo se agregan filas). El registro exige aceptar términos y privacidad (lo valida el servidor); guardar el CV exige un consentimiento aparte para IA y transferencia al exterior.
- `solicitudes_arrepentimiento`: constancia de cada revocación (código `ARR-…`, estado de la devolución). Solo la escribe el servidor.
- `legado_*`: datos de prueba que se asignan a `lamh2903@gmail.com` al confirmar su mail (cerradas a los usuarios).
- La clave `sb_publishable_…` del código es pública por diseño.

## Login
Email y contraseña. Cualquiera puede crear su cuenta; Supabase envía un mail de confirmación. Para que el link vuelva a la app hay que configurar en Supabase → Authentication → URL Configuration: Site URL `https://busqueda-laboral-lmh.netlify.app` y esa misma URL en Redirect URLs. El servicio de correo integrado limita los mails por hora: para producción hace falta uno propio.

## Rutina diaria (provisoria)
Va a ser reemplazada por el agente automático descrito en `../docs/producto.md`. Mientras tanto: El prompt completo para la tarea programada está en `../docs/prompt-rutina-diaria.md`. Resumen: leer `perfil` (analizar el CV si cambió), no proponer de nuevo lo `descartado` o archivado, insertar en `ofertas` avisos de hasta 15 días (si la fecha no se puede verificar se incluyen con `iso` null y la app los marca como "Fecha sin verificar") con `prio` por coincidencia, y nunca borrar filas (los descartados y archivados se ven en los filtros de la app).

## Portales, legales y datos del usuario
- Cada bloque tiene «Buscar en los portales de empleo»: enlaces a Computrabajo, Indeed, Bumeran y LinkedIn con las palabras clave del análisis del CV. No se lee ni copia nada de los portales.
- `terminos.html` y `privacidad.html` se generan desde `docs/legal/*.md` (borradores: los datos a completar salen resaltados). Se regeneran con `python3 scripts/generar-legales.py`.
- «Descargar mis datos» (archivo JSON con todo) y «Mi plan»: suscribirse (Mercado Pago), cancelar, y botón de arrepentimiento (visible también en la pantalla de inicio). «Eliminar mi cuenta» (función `eliminar-cuenta` del servidor, borra la cuenta y sus datos en cascada).

## Instalación y tutorial
- Aviso de instalación (`#instalarBanner`): en celulares, o donde el navegador ofrezca `beforeinstallprompt`. En Android/Chrome muestra el botón «Instalar» (usa el prompt nativo); en iOS/Safari explica «Compartir → Añadir a pantalla de inicio» (iOS no tiene prompt programático); en otros navegadores móviles indica el menú. No aparece si ya está instalada y «Ahora no» lo oculta 7 días. Un sitio no puede forzar la instalación sin que la persona toque el botón: es una restricción de los navegadores.
- Tutorial de 6 pasos (`<dialog id="tutorial">`, contenido en `TUTORIAL` de `app.js`): se abre solo la primera vez que se entra en un dispositivo (`localStorage.lmh_tutorial_visto`) y se reabre con el botón «Ayuda». Cubre bienvenida, instalación, carga del CV, clasificación de ofertas, filtros y la rutina diaria.

## Probar local
`cd pwa && python3 -m http.server 8000` y abrir http://localhost:8000 (el service worker funciona en localhost).
