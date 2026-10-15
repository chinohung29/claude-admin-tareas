# Sitio de LMH Apps (lmhapps.pages.dev)

Página estática alojada en **Cloudflare Pages** (proyecto `lmhapps`, cuenta Lamh2903@gmail.com).
Archivos: `index.html` (estilos y scripts incluidos) y `assets/` (logo, logo-mark, favicon).

## Cambio de esta versión: sección "Consultas"
- Formulario antes de "Contacto" y enlace "Consultas" en el menú.
- Envía a **lmhapps2@gmail.com** mediante FormSubmit (`https://formsubmit.co/ajax/lmhapps2@gmail.com`),
  sin cuenta ni clave. El dato de destino está en la constante `DEST` del script al final de `index.html`.
- Anti-spam: campo trampa `_honey`, mínimo 3 s antes de enviar, un envío por minuto por visitante.
- Si el servicio falla, el visitante ve un aviso con el correo y el WhatsApp como alternativa.

## Primera vez (activación obligatoria) — ya hecho y probado el 15/10/2026
FormSubmit exige activar el formulario: el primer envío manda un mail de activación a lmhapps2@gmail.com
(revisar Spam/Promociones) con el botón **Activate Form**. Hasta entonces los envíos muestran el aviso rojo.

## Cómo publicar un cambio
Cloudflare → Workers & Pages → `lmhapps` → Deployments → Create deployment → subir un `.zip` con
`index.html` y la carpeta `assets/` en la raíz (Production) → Save and deploy.
Para generar el zip: `cd lmhapps-site && zip -r ../lmhapps-sitio.zip index.html assets`.

## Alternativa futura
Función propia de Cloudflare Pages (`functions/api/consulta.js`) + Turnstile, sin servicio externo.
