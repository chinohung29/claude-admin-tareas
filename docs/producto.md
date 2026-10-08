# Producto: tablero de búsqueda laboral con agente automático

Estado: entorno de pruebas (proyecto Supabase `busqueda-laboral`, plan gratuito; claves y planes de pago se contratan al lanzar).

## Decisiones tomadas
1. **Sin prompts de usuario.** El usuario solo se registra, carga su CV y clasifica ofertas. Un agente de servidor (programado) hace el resto. La rutina diaria con prompt (`prompt-rutina-diaria.md`) queda como solución provisoria hasta que el agente esté listo.
2. **Fuentes.** Computrabajo, Indeed, LinkedIn y portales argentinos, asociados al mail del usuario. Cada oferta lleva el enlace directo para que el usuario complete la postulación a mano (el producto no se postula por él).
3. **Cobro.** $10.000 por mes en pesos, con suscripción de Mercado Pago, igual que LMH Flow: `preapproval`, webhook que revalida contra la API de Mercado Pago, 10 días de gracia si falla un cobro, cancelación y botón de arrepentimiento. Precio fijo en ARS (no hace falta conversión de USD).
4. **Claves.** La clave de la API de Claude y el plan Pro de Supabase se contratan al lanzar. Hasta entonces el agente se desarrolla con una interfaz que acepta la clave como secreto.
5. **Cuenta de pruebas.** `lamh2903@gmail.com` es un usuario más; sus datos de prueba se asignan cuando confirma el mail.

## Hecho
- Modelo multiusuario (tablas por `user_id`, permisos por usuario, perfil con plan `gratis|pro|cancelado`, registro abierto con confirmación por mail). Ver `supabase/schema.sql`.

## Pendiente, en este orden
1. **Fuentes (a definir con cuidado).** Los portales bloquean la lectura automática y sus términos la prohíben, así que no se puede depender de leerlos. Opciones para "asociado al mail del usuario":
   - **Alertas por mail reenviadas**: el usuario crea alertas de empleo en cada portal con su cuenta y las reenvía a una casilla de entrada del producto (por ejemplo `alertas+<id>@dominio`); el agente extrae los avisos y sus enlaces. Evita permisos restringidos de Gmail y no copia datos de los portales.
   - **APIs con permiso**: Jooble (Argentina, requiere clave y revisar condiciones comerciales) y Get on Board (tech de Latinoamérica).
   - Descartado: pedir contraseñas de los portales, o leer el Gmail del usuario (permiso restringido de Google con auditoría de seguridad).
2. **Agente** (Edge Function + programación diaria): analizar el CV una vez, ingerir ofertas, puntuarlas por perfil, guardar en `ofertas` con `prio`, y avisar. Sin clave de Claude usa un modo de pruebas con reglas por palabras clave.
3. **Cobro con Mercado Pago**: funciones `mp-crear-suscripcion`, `mp-webhook`, `mp-cancelar-suscripcion`, `mp-arrepentimiento` y reglas de acceso por plan. Requiere credenciales de Mercado Pago (de prueba primero).
4. **Producción**: proyecto Supabase Pro separado, servicio de correo propio (el integrado limita los mails por hora), dominio.
5. **Legal**: términos y condiciones, política de privacidad, consentimiento al registrarse, borrado de datos a pedido, botón de arrepentimiento, y revisión de la Ley 25.326 de protección de datos personales (incluye inscripción de la base). Lo tiene que revisar un abogado.

## Limpieza pendiente (requiere aprobación para borrar)
Tablas renombradas `ofertas_v1`, `estados_v1`, `manuales_v1`, `perfil_v1`, función `es_dueno()` y la función-disparador `solo_dueno_se_registra` (hoy sin efecto), en el proyecto de pruebas.
