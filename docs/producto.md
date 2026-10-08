# Producto: tablero de búsqueda laboral con agente automático

Estado: entorno de pruebas (proyecto Supabase `busqueda-laboral`, plan gratuito). Las claves y los planes de pago se contratan al lanzar.

## Decisiones tomadas
1. **Sin prompts de usuario.** El usuario se registra, carga su CV y clasifica ofertas. Un agente de servidor hace el resto. La rutina diaria con prompt (`prompt-rutina-diaria.md`) queda como solución provisoria.
2. **Fuentes.** Portales de empleo de Argentina: Computrabajo, Indeed, Bumeran y LinkedIn. El producto solo entrega enlaces: el usuario completa la postulación a mano en el portal. No lee ni copia el contenido de los portales.
3. **Cobro.** $10.000 por mes en pesos, con suscripción de Mercado Pago, igual que LMH Flow (ver guía abajo).
4. **Claves y planes de pago** al lanzar: clave de la API de Claude y Supabase Pro.
5. **Cuenta de pruebas.** `lamh2903@gmail.com` es un usuario más; sus datos de prueba se le asignan al confirmar el mail.

## Hecho
- Modelo multiusuario con permisos por usuario (`supabase/schema.sql`).
- **Enlaces de búsqueda a los 4 portales** por bloque, con las palabras clave del análisis del CV (o de ejemplo mientras no haya CV). Indeed (`fromage=14`) y LinkedIn (`f_TPR`) filtran los últimos 15 días; en Computrabajo y Bumeran no se verificó un filtro de fecha por URL. Los formatos de URL de Computrabajo y Bumeran no están documentados oficialmente: revisar que sigan funcionando.
- Registro con aceptación obligatoria de Términos y Privacidad (validada en el servidor), consentimiento separado para tratar el CV con IA y transferirlo al exterior, descarga de datos y eliminación de cuenta. Borradores legales en `docs/legal/` y páginas `privacidad.html` y `terminos.html`.

## Fuentes de ofertas: capas
**Capa 1 (hecha): enlaces a las búsquedas.** Gratis, sin claves, sin riesgo de términos de uso.

**Capa 2 (pendiente): ofertas individuales por API.** No encontré APIs públicas de búsqueda de empleo de Computrabajo, Bumeran, Indeed ni LinkedIn para quien busca trabajo (ver nota). Alternativas con prueba gratuita, todas **sin verificar para Argentina hasta probar con una clave**:
| Servicio | Prueba gratis | Qué trae | Pendiente de verificar |
|---|---|---|---|
| JSearch (OpenWeb Ninja) | 200 consultas por mes, sin tarjeta | Ofertas de Google for Jobs, que agrega LinkedIn, Indeed, Glassdoor y otros, con enlace para postular | Que devuelva ofertas de Argentina (parámetro `country=ar`); condiciones de uso comercial |
| SerpApi (motor Google Jobs) | 250 búsquedas por mes (confirmar en su sitio) | Resultados de Google for Jobs | Argentina (`gl=ar`, `hl=es`); precio pago desde USD 25 por 1.000 búsquedas |
| Careerjet (API v4 para publishers) | Gratis para publishers, con clave | Ofertas de su red, con locales por país | Locale `es_AR`; exige IP y user agent de un visitante real en cada llamada (sirve para "buscar ahora" desde la app, no para lotes nocturnos) |
| Jooble | Clave gratuita a pedido | Ofertas agregadas, edición Argentina según fuentes de terceros | Límites y términos comerciales; descripciones truncadas |
| Get on Board | API pública sin autenticación | Empleos tech de Latinoamérica | Cuántos avisos de Argentina hay |
Recomendación: probar **JSearch** primero (200 consultas gratis alcanzan para validar con pocos usuarios). Para probarlo: crear la cuenta en OpenWeb Ninja, y cargar la clave como secreto en Supabase (no en el chat ni en el código). Después se arma el agente con esa fuente y se mide cuántas ofertas reales de Argentina devuelve.
Nota: Google for Jobs y los agregadores se alimentan de los portales; revisar sus términos para uso comercial. Indeed y LinkedIn restringen sus APIs a empleadores y socios.

## Cobro con Mercado Pago (guía para conectar la cuenta de prueba)
Se replica el esquema de LMH Flow: `mp-crear-suscripcion` (crea el `preapproval` de $10.000 por mes), `mp-webhook` (revalida cada aviso contra la API y aplica 10 días de gracia si falla un cobro), `mp-cancelar-suscripcion` y `mp-arrepentimiento`.
Lo que necesito que hagas vos (verificá cada paso en la documentación de Mercado Pago, que cambia):
1. En Mercado Pago Developers, crear una **aplicación nueva** para este producto (no reutilizar la de LMH Flow, para no mezclar avisos).
2. Crear **cuentas de prueba**: un vendedor y un comprador.
3. Copiar el **Access Token de prueba** y cargarlo como secreto `MP_ACCESS_TOKEN` en Supabase (Edge Functions → Secrets). También `APP_URL` (`https://busqueda-laboral-lmh.netlify.app`).
4. Cuando las funciones estén desplegadas, cargar en la aplicación de Mercado Pago la **URL del webhook** (la de `mp-webhook`) y activar los eventos de suscripciones y pagos.
5. Probar una suscripción con la cuenta compradora de prueba y tarjetas de prueba.
Yo escribo y despliego las funciones, y las pruebo apenas el secreto esté cargado. El botón de arrepentimiento (Resolución 424/2020) se implementa en este paso.

## Producción (guía)
1. **Proyecto de Supabase de producción** en plan Pro, separado del de pruebas. Ejecutar `supabase/schema.sql` (sin los datos de prueba).
2. **Autenticación:** Site URL y Redirect URLs de producción, confirmación de mail obligatoria, contraseña mínima de 8 y protección contra contraseñas filtradas (opción de planes pagos), y captcha en el registro para evitar abusos.
3. **Correo propio (SMTP):** el integrado limita los mails por hora. Contratar un servicio de envío (por ejemplo Resend, Brevo, Postmark o Amazon SES), verificar el dominio (SPF, DKIM y DMARC) y cargarlo en Authentication → SMTP. Personalizar las plantillas de mail en español con tu marca.
4. **Dominio propio** para la app y para el remitente de los mails; sitio de Netlify de producción con su propio proyecto.
5. **Secretos:** claves de Claude, de Mercado Pago (de producción) y del servicio de ofertas, siempre como secretos del servidor.
6. **Copias de seguridad** (activar las del plan Pro) y alertas.
7. **Legal antes de abrir:** ver `docs/legal/analisis-normativo.md` (inscripción de la base ante la AAIP, contratos con proveedores, revisión de los textos, situación fiscal).

## Pendiente, en este orden
1. Probar la capa 2 con una clave de prueba de JSearch y armar el agente (`agente-diario`): analiza el CV una vez, busca, puntúa por perfil, guarda en `ofertas` y avisa. Sin clave de Claude usa un modo de pruebas por palabras clave.
2. Cobro con Mercado Pago (guía de arriba) y botón de arrepentimiento.
3. Revisión legal por un abogado e inscripción de la base en la AAIP.
4. Producción.

## Limpieza pendiente (requiere aprobación para borrar)
En el proyecto de pruebas: tablas renombradas `ofertas_v1`, `estados_v1`, `manuales_v1`, `perfil_v1`, función `es_dueno()` y la función-disparador `solo_dueno_se_registra` (hoy sin efecto). Desde acá los `DROP` y `DELETE` por SQL quedan esperando una aprobación que no llega; hay que hacerlos con aprobación explícita.
