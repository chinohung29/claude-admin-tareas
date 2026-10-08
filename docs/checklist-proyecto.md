# Checklist del proyecto: Seguimiento de búsqueda laboral

Actualizado: 2026-10-08. Marcá `[x]` a medida que avances.
Responsable: **Vos** = acción tuya (cuentas, claves, pagos). **Yo** = la hago yo (Claude) cuando me lo pidas.

App: https://busqueda-laboral-lmh.netlify.app
Supabase: proyecto `busqueda-laboral` (ref `bclqrmeeqssvqovkvvkz`, São Paulo)
Repo: `chinohung29/claude-admin-tareas`, rama `claude/serene-cray-96u5fr`

---

## A. REALIZADO

### App (PWA)
- [x] PWA instalable (manifest, íconos, service worker v12, uso sin conexión).
- [x] Aviso de instalación en celular (Android y iOS "Añadir a pantalla de inicio").
- [x] Tutorial de primer uso (6 pasos: cargar CV, clasificar, filtros, etc.).
- [x] Lista de ofertas con estados: pendiente / postulado / descartado / archivar, filtros Activas / Archivadas / Descartadas / Todas.
- [x] Enlaces de búsqueda por portal (Computrabajo, Indeed, Bumeran, LinkedIn) en cada bloque.
- [x] Carga de CV (el texto se extrae en el dispositivo; solo se guarda el texto).
- [x] Descarga de mis datos y eliminación de cuenta.

### Infraestructura
- [x] Proyecto Supabase propio separado de LMH Flow (Auth, RLS por usuario, Realtime).
- [x] Proyecto Netlify propio, conectado al repo GitHub, publica la carpeta `pwa`.
- [x] Respaldo inicial en Google Drive (LMH APPS / LMH busqueda laboral / "Respaldo app 2026-10-08"). Está desactualizado.

### Agente automático y cobro (código listo y desplegado)
- [x] Agente `agente-ofertas` (SerpApi Google Jobs): límites 1 búsqueda cada 6 h por usuario, 240/mes, 15 nuevas por bloque. Probado con simulaciones.
- [x] Funciones de Mercado Pago: crear suscripción, webhook, cancelar, botón de arrepentimiento (10 días, Res. 424/2020). Lógica probada con tests; **no probada contra Mercado Pago real**.
- [x] Precio $10.000 ARS/mes configurable (`PRECIO_PRO_ARS`).

### Legal
- [x] Borradores: política de privacidad, términos y condiciones, consentimientos, análisis normativo (Ley 25.326, Ley 24.240, etc.).
- [x] Consentimiento registrado al registrarse; páginas `privacidad.html` y `terminos.html` en la app.
- [x] Decisión de región (São Paulo) documentada con su base legal.

---

## B. PENDIENTE

### 1. Activar el agente con datos reales — Vos (primero esto)
- [ ] **Cargar `SERPAPI_KEY`.**
  1. Entrá a supabase.com → proyecto `busqueda-laboral` → *Edge Functions* → *Secrets*.
  2. *Add new secret*: nombre `SERPAPI_KEY`, valor = tu API key de serpapi.com (Dashboard → API key).
  3. No me la pegues en el chat.
- [ ] **Configurar Auth del proyecto.**
  1. Supabase → *Authentication* → *URL Configuration*.
  2. *Site URL*: `https://busqueda-laboral-lmh.netlify.app`
  3. *Redirect URLs*: agregá `https://busqueda-laboral-lmh.netlify.app/**`
  4. Guardá.
- [ ] **Crear tu usuario de prueba.**
  1. Abrí la app, registrate con lamh2903@gmail.com y una contraseña.
  2. Confirmá el mail que llega.
  3. Cargá tu CV y pulsá **Buscar ofertas ahora**.
- [ ] Avisame cuando lo hayas hecho. Yo reviso qué devolvió SerpApi.

### 2. Validar el agente — Yo
- [ ] Leer las tablas `busquedas` y `ofertas`, ajustar fechas ("hace X días"), enlaces y ubicaciones según la respuesta real (modo `diagnostico:true`).
- [ ] Verificar formato de URL de búsqueda de Computrabajo y Bumeran.
- [ ] Programar la ejecución diaria (pg_cron + `AGENTE_CRON_SECRET`).
- [ ] Probar de punta a punta `eliminar-cuenta`.

### 3. Cobro con Mercado Pago (modo prueba) — Vos, yo te guío
- [ ] Crear aplicación en Mercado Pago Developers (mercadopago.com.ar/developers) → *Tus integraciones* → *Crear aplicación* (producto: suscripciones/pagos online).
- [ ] Crear cuentas de prueba (vendedor y comprador): *Cuentas de prueba* en el mismo panel.
- [ ] En Supabase → Edge Functions → Secrets cargar:
  - `MP_ACCESS_TOKEN` = token de **prueba** del vendedor.
  - `APP_URL` = `https://busqueda-laboral-lmh.netlify.app`
- [ ] En Mercado Pago → *Webhooks*: URL `https://bclqrmeeqssvqovkvvkz.supabase.co/functions/v1/mp-webhook`, eventos de suscripciones (preapproval) y pagos.
- [ ] Probar con el comprador de prueba: suscribirse, pago rechazado, cancelar, botón de arrepentimiento (dentro de 10 días).
- [ ] Yo: corregir lo que falle y definir qué limita el plan gratuito (hoy el plan solo se registra).

### 4. Claude para analizar CV y ordenar ofertas — Vos + Yo
- [ ] Vos: crear la API key en console.anthropic.com y cargarla como secret `ANTHROPIC_API_KEY` (al lanzar).
- [ ] Yo: reemplazar el puntaje por reglas y el análisis del CV por Claude.

### 5. Legal — Vos
- [ ] Revisión por abogado/a de `docs/legal/*` (política, términos, consentimientos).
- [ ] Completar datos pendientes en los borradores: nombre, CUIL/CUIT, domicilio, plazos, email de privacidad.
- [ ] Inscribir la base de datos en el Registro Nacional de Bases de Datos (AAIP, Ley 25.326 art. 21).
- [ ] Contratos/cláusulas modelo (Res. 198/2023) con proveedores que reciben datos: Supabase, Netlify, Anthropic, SerpApi, proveedor de correo.
- [ ] Consulta con contador/a: monotributo, facturación, ARCA.
- [ ] Yo: regenerar páginas legales con `scripts/generar-legales.py` cuando tengas los datos.

### 6. Pasar a producción — Vos (al lanzar)
- [ ] Proyecto Supabase Pro (backups, sin límite de proyectos activos).
- [ ] SMTP propio con dominio verificado (evita "email rate limit exceeded").
- [ ] Captcha en registro (Supabase → Auth → Attack Protection).
- [ ] Dominio propio en Netlify.
- [ ] Cargar todos los secrets en el proyecto de producción y cambiar Mercado Pago a credenciales reales.
- [ ] Yo: replicar esquema y funciones en el proyecto nuevo.

### 7. Limpieza (requiere tu aprobación explícita) — Yo, con tu OK
- [ ] En LMH_Flow_Proyecto: eliminar el esquema `busqueda_laboral`, revertir `pgrst.db_schemas` a `public, graphql_public` y sacar sus tablas de realtime.
- [ ] En `busqueda-laboral`: eliminar tablas `*_v1`, `es_dueno()` y la función de trigger vacía.
- [ ] Retirar la rutina diaria provisional y el artifact viejo (WHK96CgnRtWD6HjebtEyu8).
- [ ] Actualizar el respaldo en Drive (carpeta LMH APPS) con el código actual.

---

## Orden recomendado
1 → 2 → 3 → 5 (en paralelo con 3) → 4 → 7 → 6.
