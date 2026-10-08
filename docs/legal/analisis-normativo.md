# Análisis normativo (Argentina) del tablero de búsqueda laboral

Fecha: 2026-10-08. **No es asesoramiento legal.** Se armó con fuentes secundarias (estudios jurídicos, notas, páginas oficiales de la AAIP y del Boletín Oficial) y hay que contrastarlo con el texto vigente y con un abogado antes de lanzar. Donde dice **[verificar]** hay un dato que no se pudo confirmar en la norma original.

## 1. Datos personales: Ley 25.326 y Decreto 1558/2001
| Tema | Qué exige | Cómo lo resolvemos |
|---|---|---|
| Consentimiento (art. 5) | Libre, expreso e informado, previo al tratamiento. | Dos consentimientos separados, casillas sin marcar: términos y privacidad al registrarse; CV con IA y transferencia al exterior al guardar el CV. Se registran con versión y fecha en la base. |
| Información al titular (art. 6) | Finalidad, destinatarios, existencia de la base, responsable, derechos. | Política de Privacidad (borrador) con todo eso, enlazada en el registro. |
| Datos sensibles (art. 7) | Nadie está obligado a darlos; solo se tratan con consentimiento o por ley. | Avisamos que no incluya datos sensibles en el CV y el texto se puede editar antes de guardar. |
| Seguridad (art. 9) | Medidas técnicas y organizativas; confidencialidad. | Permisos por usuario en la base, conexión cifrada, contraseñas cifradas, acceso solo con sesión. |
| Cesión y encargados | Con consentimiento o contrato con el encargado. | Proveedores listados en la política; contratos con cada uno **[a firmar/confirmar]**. |
| Transferencia internacional (art. 12) | Prohibida a países sin nivel adecuado, salvo consentimiento expreso o cláusulas contractuales. | Consentimiento expreso específico + cláusulas contractuales modelo de la AAIP (Disposición 60-E/2016 **[verificar número exacto]** y Resolución 198/2023) con Supabase, Netlify y Anthropic. |
| Derechos (arts. 14 a 16) | Acceso, rectificación, actualización, supresión. Plazos cortos. | "Descargar mis datos" y "Eliminar mi cuenta" dentro de la app, más un mail de contacto. Plazos de respuesta **[verificar]**. |
| Registro (art. 21) | Inscribir las bases de datos privadas ante la AAIP (Registro Nacional de Bases de Datos). | **Trámite pendiente del titular del producto.** Se hace a distancia en dos pasos: inscribirse como responsable y luego declarar cada base, su finalidad y sus medidas de seguridad. Antes de lanzar. |
| Leyenda de la AAIP | Debe figurar en las comunicaciones. | Incluida al final de la Política de Privacidad **[verificar texto vigente]**. |

Notas:
- Un CV es un dato personal; si trae datos sensibles pasa a un régimen más estricto. De ahí el aviso y la edición previa.
- El análisis con IA no es una decisión sobre derechos del usuario, pero se informa y se ofrece revisión humana. La AAIP publicó guías sobre IA responsable que conviene leer antes de lanzar.
- **Reforma en trámite:** hay proyectos de ley integral de datos personales en Diputados (por ejemplo 3397-D-2026 y 1751-D-2026) sin dictamen a septiembre de 2026. Siguen rigiendo la Ley 25.326 y su decreto. Hay que seguirlos: podrían cambiar plazos, multas y reglas de IA.

## 2. Consumidores: venta online de una suscripción
| Norma | Qué exige | Cómo lo resolvemos |
|---|---|---|
| Ley 24.240 y Código Civil y Comercial (contratos de consumo y a distancia) | Información clara y completa, trato digno, cláusulas no abusivas, jurisdicción del domicilio del consumidor. | Términos y Condiciones (borrador) en español, precio y renovación a la vista, jurisdicción del consumidor. |
| Resolución 424/2020 (Botón de arrepentimiento) | Enlace visible en la página de inicio para revocar dentro de 10 días corridos (art. 34 Ley 24.240, art. 1110 CCyC); código de identificación dentro de 24 horas. | **Implementado**: botón destacado en la pantalla de inicio y en la cuenta; la función `mp-arrepentimiento` cancela la suscripción, corta el plan, entrega al instante el código (`ARR-…`) y registra la solicitud para gestionar la devolución. Sin probar con Mercado Pago real. |
| Ley 24.240 art. 10 ter, Resolución 316/2018 y Disposición 357/2021 (Botón de baja) | La baja se debe poder hacer por el mismo medio de la contratación. Las resoluciones listan rubros puntuales **[verificar si nuestro rubro está listado]**. | **Implementado**: «Cancelar suscripción» dentro de la app (función `mp-cancelar-suscripcion`), sin trámites ni penalidad; el usuario conserva el plan hasta el fin del período pagado. También «Eliminar mi cuenta». |
| Precio y facturación | Registro fiscal y comprobante por cada cobro. | **Consultar con un contador** (régimen de ARCA, factura electrónica, IVA y Ingresos Brutos). No investigado. |

## 3. Producto ofrecido por una persona humana
Que el servicio lo ofrezca una persona humana (no una sociedad) no lo saca del alcance de estas normas:
- **Datos personales:** la Ley 25.326 rige para personas humanas y jurídicas que traten datos. Quien tiene una base de datos de terceros con fines comerciales debe identificarse como responsable e inscribirla en la AAIP; el nombre y un domicilio de contacto son parte de esa identificación **[verificar si existe alguna excepción para casos de pequeña escala]**.
- **Consumidores:** vender un servicio de forma habitual y a distancia te hace "proveedor" frente a los consumidores, y las normas piden informar tu identidad y un domicilio y medio de contacto **[verificar la norma exacta y qué datos fiscales hacen falta]**.
- **Fiscal:** cobrar $10.000 por mes de forma habitual es una actividad que normalmente requiere inscripción en ARCA (por ejemplo, monotributo) y emitir comprobante por cada cobro. **No investigado: consultar con un contador.**
En los borradores se reemplazó "razón social" por "persona humana" y se dejaron como datos a confirmar con el abogado el CUIL/CUIT y el domicilio; se pueden ajustar según lo que él indique.

## 4. Qué hay que hacer antes de lanzar (fuera del código)
1. Que un abogado revise los tres documentos de `docs/legal/` y complete los datos entre corchetes.
2. Inscribir la base en el Registro Nacional de Bases de Datos (AAIP).
3. Firmar o aceptar los contratos con cláusulas modelo con Supabase, Netlify, Anthropic y el proveedor de correo (y revisar los términos de uso de la API de IA, por ejemplo qué hacen con los datos enviados).
4. Definir con un contador la situación fiscal y la facturación.
5. Revisar las condiciones comerciales de las fuentes de ofertas que se contraten (ver `docs/producto.md`).
6. Probar el botón de arrepentimiento y la cancelación con una cuenta de prueba de Mercado Pago, y definir el plazo de devolución (el reintegro se hace a mano desde Mercado Pago).

## Fuentes consultadas
Texto de la Resolución 424/2020 en argentina.gob.ar; página de obligaciones de los responsables de bases de datos de la AAIP; trámite de inscripción de base privada en Trámites a Distancia; notas de estudios jurídicos sobre transferencias internacionales y cláusulas modelo (Resolución 198/2023); notas sobre Resolución 316/2018 y Disposición 357/2021; notas sobre los proyectos de reforma de datos personales de 2026.
