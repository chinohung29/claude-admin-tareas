# Prompt de la rutina diaria (para pegar en la tarea programada)

Entrar todos los días a las 9 de la mañana en los portales más comunes y utilizados para empleos en Argentina (Computrabajo, Bumeran, ZonaJobs, Indeed, LinkedIn, Get on Board, entre otros) y buscar ofertas que concuerden con mi perfil laboral, de acuerdo al CV que cargué en la app, analizando las habilidades que me hacen un candidato atractivo para cada oferta.

## Datos y app
Todo vive en el proyecto de Supabase `busqueda-laboral` (id `bclqrmeeqssvqovkvvkz`), esquema `public`. No usar ningún otro proyecto de Supabase. La app es https://busqueda-laboral-lmh.netlify.app.
- `perfil` (fila `id = 'principal'`): `cv_texto`, `cv_actualizado`, `analisis`, `analisis_de_cv`.
- `ofertas`: el listado diario que muestra la app.
- `estados`: mis botones (`status`: pendiente / postulado / descartado; `archived`).

## Paso 1: leer mi CV
Leer `perfil`. Si no hay `cv_texto`, avisarme por notificación que cargue el CV y buscar con los bloques por defecto de abajo. Si hay CV y `analisis_de_cv` es null o menor que `cv_actualizado`, analizarlo y guardar en `analisis` (junto con `analisis_de_cv = cv_actualizado` y `analisis_actualizado = now()`): `{"resumen": "", "seniority": "", "fortalezas": [], "oportunidades": [], "palabras_clave": {"admin": [], "ia": [], "odoo": []}}`. Si el análisis ya está al día, reutilizarlo. Usar fortalezas, seniority y palabras clave para decidir qué buscar y cómo ordenar.

## Paso 2: bloques
Dividir todo en 3 bloques (`bloque` = `admin`, `ia`, `odoo`), ajustados a lo que muestre el CV:
1. `admin`: administrativas (facturación, cobranzas, pago a proveedores, administración general y contabilidad), perfil ssr y sr.
2. `ia`: automatización, diseño y creación de aplicaciones web, gestión de proyectos y herramientas digitales y soluciones para empresas, valorando mi experiencia creando aplicaciones y herramientas con IA. No sumar avisos que exijan título universitario en computación o ingeniería.
3. `odoo`: analista funcional y analistas con experiencia en uso de Odoo (no partner) en implementación de módulos contable-administrativo, stock, fabricación, CRM y proyectos. Excluir junior y los que exijan ser implementadora o partner certificado.

## Paso 3: qué ofertas entran
- Antigüedad no mayor a 15 días (excluyente). Si la fecha de publicación se puede verificar y supera los 15 días, no incluirla. Si no se puede verificar (por ejemplo, porque el portal bloquea la lectura), sí incluirla, dejando `iso` en null: la app la muestra marcada como "Fecha sin verificar". En ese caso preferir avisos que el buscador del portal muestre como recientes (de la última semana o publicados "hace X días" con X menor o igual a 15).
- No proponer de nuevo ninguna oferta cuyo id o link ya esté en `estados` como `descartado` o con `archived = true`, ni repetir las que ya están en `ofertas`.
- Cada oferta lleva el link directo al aviso (no a una búsqueda) para completar la postulación.

## Paso 4: cargar el listado
Insertar las nuevas en `ofertas` con: `id` único (por ejemplo `o20261009a`), `bloque`, `titulo`, `empresa`, `modalidad` (Remoto, Híbrido o Presencial), `salario` (si no figura, null: la app muestra "A convenir"), `iso` (fecha de publicación), `url`, `nuevo = true` y `prio` (1 = mejor coincidencia con mi perfil, ordenado dentro de cada bloque). Poner `nuevo = false` a las que ya no son del día. No borrar filas de `ofertas`: los descartados y archivados quedan visibles en los filtros de la app, y la app archiva sola las pendientes de más de 15 días.

## Paso 5: calendario
Verificar que en el Google Calendar de lamh2903@gmail.com exista el evento recurrente "Postulaciones laborales" de lunes a viernes de 10:00 a 12:00 (hora de Argentina), con aviso por mail 30 minutos antes y popup 15 minutos antes, y el link a la app en la descripción. Si existe, no tocarlo ni duplicarlo; si falta, crearlo.

## Paso 6: aviso
Enviar una notificación solo si hay ofertas nuevas (con cuántas hay por bloque) o si algo falló. Si no hay novedades, no avisar.
