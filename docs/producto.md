# Producto: tablero de búsqueda laboral con agente automático

Estado: entorno de pruebas (proyecto Supabase `busqueda-laboral`, plan gratuito). Las claves y los planes de pago se contratan al lanzar.

## Decisiones tomadas
1. **Sin prompts de usuario.** El usuario se registra, carga su CV y clasifica ofertas. Un agente de servidor hace el resto. La rutina diaria con prompt (`prompt-rutina-diaria.md`) queda como solución provisoria.
2. **Fuentes.** Portales de empleo de Argentina: Computrabajo, Indeed, Bumeran y LinkedIn. El producto solo entrega enlaces: el usuario completa la postulación a mano en el portal. No lee ni copia el contenido de los portales.
3. **Cobro.** $10.000 por mes en pesos, con suscripción de Mercado Pago, igual que LMH Flow (ver guía abajo). Producto ofrecido por una persona humana. Las búsquedas son solo en Argentina.
4. **Claves y planes de pago** al lanzar: clave de la API de Claude y Supabase Pro.
5. **Cuenta de pruebas.** `lamh2903@gmail.com` es un usuario más; sus datos de prueba se le asignan al confirmar el mail.

## Hecho
- Modelo multiusuario con permisos por usuario (`supabase/schema.sql`).
- **Enlaces de búsqueda a los 4 portales** por bloque, con las palabras clave del análisis del CV (o de ejemplo mientras no haya CV). Indeed (`fromage=14`) y LinkedIn (`f_TPR`) filtran los últimos 15 días; en Computrabajo y Bumeran no se verificó un filtro de fecha por URL. Los formatos de URL de Computrabajo y Bumeran no están documentados oficialmente: revisar que sigan funcionando.
- Registro con aceptación obligatoria de Términos y Privacidad (validada en el servidor), consentimiento separado para tratar el CV con IA y transferirlo al exterior, descarga de datos y eliminación de cuenta. Borradores legales en `docs/legal/` y páginas `privacidad.html` y `terminos.html`.

- **Cobro y derechos del consumidor** (funciones desplegadas en el proyecto de pruebas, sin probar con Mercado Pago real): `mp-crear-suscripcion` ($10.000 por mes, `PRECIO_PRO_ARS` para cambiar el precio), `mp-webhook` (revalida cada aviso contra la API y aplica 10 días de gracia si falla un cobro), `mp-cancelar-suscripcion` (baja por la misma app; el plan sigue hasta el fin del período pagado), `mp-arrepentimiento` (botón de arrepentimiento: dentro de los 10 días corridos, cancela y corta el plan en el momento, entrega al instante un código `ARR-…` y registra la solicitud para devolver el pago a mano). La tarea diaria `bajar_planes_vencidos` (06:00 UTC) pasa a `cancelado` los planes vencidos. La lógica de decisión del webhook tiene pruebas (`supabase/functions/mp-webhook/decision.test.mts`).
- Sección «Mi plan» en la app y botón de arrepentimiento destacado en la pantalla de inicio y en la cuenta.

## Fuentes de ofertas
**Capa 1 (hecha): enlaces a las búsquedas** en Computrabajo, Indeed, Bumeran y LinkedIn. Gratis, sin claves.

**Capa 2 (hecha, falta cargar la clave y validar): agente de ofertas con SerpApi** (motor Google Jobs). Función `agente-ofertas`, botón «Buscar ofertas ahora» en la app.
- Busca solo en Argentina (`location=Argentina`, `gl=ar`, `hl=es`), una palabra clave por bloque por corrida (rota entre las del análisis del CV o las de ejemplo). A SerpApi solo viaja la palabra clave, nunca el CV.
- Filtra: solo Argentina o remotas, hasta 15 días de antigüedad (el filtro de fecha de Google por parámetro está deprecado; se filtra por el «hace X días» de cada resultado; sin fecha interpretable se guarda sin fecha y la app lo marca «Fecha sin verificar»), con enlace http/https al aviso (prefiere Computrabajo, Bumeran, LinkedIn, Indeed), sin repetir y sin volver a proponer lo descartado o archivado.
- Ordena por coincidencia con el CV (`prio`). **Hoy el puntaje es por reglas** (palabra clave en título y descripción, términos del CV); cuando haya clave de Claude lo reemplaza un análisis de IA.
- Límites: una corrida por usuario cada 6 horas (`AGENTE_HORAS_ENTRE_BUSQUEDAS`) y tope mensual de 240 búsquedas (`SERPAPI_LIMITE_MENSUAL`, plan gratuito: 250). Cada corrida usa 3 búsquedas (una por bloque).
- Costo: con búsqueda diaria de lunes a viernes son unas 66 búsquedas por usuario por mes; en el plan pago de SerpApi (USD 25 por 1.000 búsquedas, según su página) serían unos USD 1,65 por usuario. En el plan gratuito alcanza para unos 3 usuarios de prueba. Si dos usuarios comparten palabras clave se podrían reutilizar búsquedas (no implementado).
- La forma exacta de los resultados de SerpApi no se pudo confirmar desde acá (su sitio no es accesible desde el entorno de desarrollo): se leen de forma defensiva y hay un modo diagnóstico para validarlos con la clave real.
- Pruebas sin red ni clave: `supabase/functions/agente-ofertas/pruebas/correr.sh` (lógica pura y orquestación con base y SerpApi simulados).

**Para activarlo (tuyo):**
1. En SerpApi, copiar la API key (Dashboard → Your Account). No la pegues en el chat.
2. En Supabase → Edge Functions → Secrets: crear `SERPAPI_KEY` con esa clave.
3. En la app, con tu cuenta, tocar «Buscar ofertas ahora». Gasta 3 búsquedas.
4. Avisarme: leo `busquedas` y `ofertas` en la base y ajusto lo que haga falta (formato de fechas, enlaces, ubicaciones). Para ver la forma cruda de la respuesta, invoco la función con `diagnostico: true`.

**Tarea diaria automática (después de validar):** generar un secreto largo al azar, cargarlo como `AGENTE_CRON_SECRET` en Edge Functions y también en el Vault de Supabase, y programar con `pg_cron` + `pg_net` una llamada diaria a la función con el encabezado `x-cron-secret`. La función ya admite ese modo: procesa a todos los usuarios que tienen CV.

**Otras opciones descartadas por ahora:** JSearch (OpenWeb Ninja, 200 consultas gratis por mes), Careerjet, Jooble y Get on Board. Indeed y LinkedIn restringen sus APIs a empleadores y socios; no hay APIs públicas de búsqueda para Computrabajo ni Bumeran. Google for Jobs se alimenta de los portales: revisar los términos de SerpApi para uso comercial.

## Cobro con Mercado Pago (guía para conectar la cuenta de prueba)
Se replica el esquema de LMH Flow: `mp-crear-suscripcion` (crea el `preapproval` de $10.000 por mes), `mp-webhook` (revalida cada aviso contra la API y aplica 10 días de gracia si falla un cobro), `mp-cancelar-suscripcion` y `mp-arrepentimiento`.
Lo que necesito que hagas vos (verificá cada paso en la documentación de Mercado Pago, que cambia):
1. En Mercado Pago Developers, crear una **aplicación nueva** para este producto (no reutilizar la de LMH Flow, para no mezclar avisos).
2. Crear **cuentas de prueba**: un vendedor y un comprador.
3. Copiar el **Access Token de prueba** y cargarlo como secreto `MP_ACCESS_TOKEN` en Supabase (Edge Functions → Secrets). También `APP_URL` (`https://busqueda-laboral-lmh.netlify.app`).
4. Cuando las funciones estén desplegadas, cargar en la aplicación de Mercado Pago la **URL del webhook** (la de `mp-webhook`) y activar los eventos de suscripciones y pagos.
5. Probar una suscripción con la cuenta compradora de prueba y tarjetas de prueba.
Las funciones ya están desplegadas; faltan los secretos y probarlas con la cuenta de prueba. URL del webhook para cargar en Mercado Pago: `https://bclqrmeeqssvqovkvvkz.supabase.co/functions/v1/mp-webhook`.
Qué probar con la cuenta compradora: (a) suscribirse desde «Mi plan» y volver a la app; (b) cancelar la suscripción; (c) usar el botón de arrepentimiento dentro de los 10 días y comprobar el código, que el plan se corta y que aparece la solicitud en la tabla `solicitudes_arrepentimiento`; (d) un cobro fallido, para ver la gracia de 10 días.

## Producción (guía)
1. **Proyecto de Supabase de producción** en plan Pro, separado del de pruebas. Ejecutar `supabase/schema.sql` (sin los datos de prueba).
2. **Autenticación:** Site URL y Redirect URLs de producción, confirmación de mail obligatoria, contraseña mínima de 8 y protección contra contraseñas filtradas (opción de planes pagos), y captcha en el registro para evitar abusos.
3. **Correo propio (SMTP):** el integrado limita los mails por hora. Contratar un servicio de envío (por ejemplo Resend, Brevo, Postmark o Amazon SES), verificar el dominio (SPF, DKIM y DMARC) y cargarlo en Authentication → SMTP. Personalizar las plantillas de mail en español con tu marca.
4. **Dominio propio** para la app y para el remitente de los mails; sitio de Netlify de producción con su propio proyecto.
5. **Secretos:** claves de Claude, de Mercado Pago (de producción) y del servicio de ofertas, siempre como secretos del servidor.
6. **Copias de seguridad** (activar las del plan Pro) y alertas.
7. **Legal antes de abrir:** ver `docs/legal/analisis-normativo.md` (inscripción de la base ante la AAIP, contratos con proveedores, revisión de los textos, situación fiscal).

## Pendiente, en este orden
1. Cargar `SERPAPI_KEY`, validar el agente con una corrida real y ajustar. Después, la tarea diaria automática y el análisis del CV con IA (cuando haya clave de Claude).
2. Probar el cobro con Mercado Pago de prueba (guía de arriba). Definir qué limita el plan gratuito: hoy el plan se registra pero todavía no restringe funciones.
3. Revisión legal por un abogado e inscripción de la base en la AAIP.
4. Producción.

## Limpieza pendiente (requiere aprobación para borrar)
En el proyecto de pruebas: tablas renombradas `ofertas_v1`, `estados_v1`, `manuales_v1`, `perfil_v1`, función `es_dueno()` y la función-disparador `solo_dueno_se_registra` (hoy sin efecto). Desde acá los `DROP` y `DELETE` por SQL quedan esperando una aprobación que no llega; hay que hacerlos con aprobación explícita.
