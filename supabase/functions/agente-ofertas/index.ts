import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  BLOQUES, DIAS_MAXIMOS, type Bloque, type ResultadoSerp,
  diasDePublicacion, elegirEnlace, esDeArgentina, esJunior, fechaIso, idOferta, modalidad, palabrasClave, puntuar, terminos,
} from './logica.ts'
import { analizarCV } from './analisis.ts'

// Agente de ofertas: busca en Google Jobs (vía SerpApi) ofertas de Argentina para cada bloque del usuario,
// las filtra (solo Argentina o remotas, hasta 15 días, sin repetir ni volver a proponer descartadas/archivadas)
// y las guarda en `ofertas` con un enlace directo para que la persona se postule por su cuenta.
//
// Privacidad: a SerpApi solo se le envía la palabra clave de la búsqueda, nunca el CV. El puntaje por
// coincidencia con el CV se calcula acá, dentro de Supabase.
//
// Quién lo llama:
// - La persona, con su sesión ("Buscar ofertas ahora"): procesa solo su cuenta.
// - La tarea programada, con el encabezado x-cron-secret (secreto AGENTE_CRON_SECRET): procesa a todos los que tienen CV.
// Por eso verify_jwt está en false: la autenticación se valida acá adentro.
const SERP_URL = 'https://serpapi.com/search.json'
const HORAS_ENTRE_BUSQUEDAS = Number(Deno.env.get('AGENTE_HORAS_ENTRE_BUSQUEDAS') ?? '6')
const LIMITE_MENSUAL = Number(Deno.env.get('SERPAPI_LIMITE_MENSUAL') ?? '240') // plan gratuito: 250 por mes
const NUEVAS_POR_BLOQUE = 15
const NOMBRES_ORIGINALES: Record<string, string> = { admin: 'Administración y finanzas', ia: 'Tecnología, datos y automatización', odoo: 'Odoo y ERP' }
const MINUTOS_CV_NUEVO = 30 // con un CV nuevo se puede buscar antes de las horas de espera, pero no más seguido que esto

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

async function buscarEnSerpApi(q: string, apiKey: string): Promise<{ resultados: ResultadoSerp[]; error?: string; crudo?: any }> {
  const params = new URLSearchParams({ engine: 'google_jobs', q, location: 'Argentina', gl: 'ar', hl: 'es', api_key: apiKey })
  const resp = await fetch(`${SERP_URL}?${params}`, { signal: AbortSignal.timeout(25_000) })
  const texto = await resp.text()
  let data: any = null
  try { data = JSON.parse(texto) } catch { /* no JSON */ }
  if (!resp.ok || data?.error) {
    // Una búsqueda sin resultados no es un error: SerpApi responde "Google hasn't returned any results for this query."
    const msg = String(data?.error ?? `HTTP ${resp.status}`)
    if (/hasn't returned any results/i.test(msg)) return { resultados: [], crudo: data }
    return { resultados: [], error: msg.slice(0, 300) }
  }
  return { resultados: Array.isArray(data?.jobs_results) ? data.jobs_results : [], crudo: data }
}

async function procesarUsuario(userId: string, apiKey: string, diagnostico: boolean) {
  const db = admin()
  const ahora = new Date()

  const { data: perfil } = await db.from('perfil').select('cv_texto, cv_actualizado, analisis, analisis_de_cv, analisis_actualizado, busquedas_elegidas').eq('user_id', userId).maybeSingle()

  // Análisis del CV.
  let analisis: Record<string, any> | null = perfil?.analisis ?? null
  let analizado = false
  let analisisEl: string | null = perfil?.analisis_actualizado ?? null
  // Se rehace si no existe, si el CV es más nuevo, si es de una versión sin catálogo de rubros o si cambió la elección manual.
  const elegidas = Array.isArray(perfil?.busquedas_elegidas) && perfil.busquedas_elegidas.length ? perfil.busquedas_elegidas : null
  const cambioEleccion = JSON.stringify(elegidas) !== JSON.stringify(analisis?.elegidas ?? null)
  if (perfil?.cv_texto && (!analisis || !analisis.catalogo || cambioEleccion || !perfil.analisis_de_cv || new Date(perfil.analisis_de_cv) < new Date(perfil.cv_actualizado ?? 0))) {
    const antes: Record<string, string> = perfil.analisis?.bloques
      ? Object.fromEntries(perfil.analisis.bloques.map((b: any) => [b.id, b.nombre]))
      : NOMBRES_ORIGINALES // sin análisis previo, las ofertas guardadas salieron de las búsquedas de ejemplo
    analisis = analizarCV(perfil.cv_texto, elegidas)
    // Un bloque que cambió de rubro (o dejó de buscarse) no puede conservar avisos del rubro anterior: se archivan,
    // salvo los que la persona ya marcó como postulados.
    const despues: Record<string, string> = Object.fromEntries(analisis.bloques.map((b) => [b.id, b.nombre]))
    const cambiados = BLOQUES.filter((b) => antes[b] !== despues[b])
    if (cambiados.length) {
      const { data: post } = await db.from('estados').select('job_id').eq('user_id', userId).eq('status', 'postulado')
      const postulados = new Set((post ?? []).map((e) => e.job_id))
      const { data: previas } = await db.from('ofertas').select('id').eq('user_id', userId).eq('archivado', false).in('bloque', cambiados)
      const ids = (previas ?? []).map((o) => o.id).filter((id) => !postulados.has(id))
      if (ids.length) await db.from('ofertas').update({ archivado: true }).eq('user_id', userId).in('id', ids)
    }
    const { error: errAnalisis } = await db.from('perfil').update({
      analisis, analisis_actualizado: ahora.toISOString(), analisis_de_cv: perfil.cv_actualizado ?? ahora.toISOString(),
    }).eq('user_id', userId)
    if (errAnalisis) console.error('agente-ofertas: no se pudo guardar el análisis', errAnalisis.message)
    else { analizado = true; analisisEl = ahora.toISOString() }
  }
  // Frecuencia: no más de una corrida cada HORAS_ENTRE_BUSQUEDAS horas por usuario. Excepción: si cargó un CV
  // después de la última búsqueda, se busca de nuevo (como mínimo MINUTOS_CV_NUEVO después de la anterior).
  const desde = new Date(ahora.getTime() - HORAS_ENTRE_BUSQUEDAS * 3_600_000).toISOString()
  const { data: recientes } = await db.from('busquedas').select('ejecutado_el').eq('user_id', userId).is('error', null)
    .gte('ejecutado_el', desde).order('ejecutado_el', { ascending: false }).limit(1)
  if (recientes?.length) {
    const ultima = new Date(recientes[0].ejecutado_el).getTime()
    // Perfil nuevo = CV cargado o análisis rehecho después de la última búsqueda (aunque la persona toque el botón antes de tiempo).
    const perfilNuevo = (!!analisisEl && new Date(analisisEl).getTime() > ultima) || (!!perfil?.cv_actualizado && new Date(perfil.cv_actualizado).getTime() > ultima)
    const cvNuevo = perfilNuevo && ahora.getTime() - ultima >= MINUTOS_CV_NUEVO * 60_000
    if (!cvNuevo) {
      // Con perfil nuevo (CV o elección distinta) se puede volver a buscar a los 30 minutos; si no, a las horas de espera.
      const proxima = new Date(ultima + (perfilNuevo ? MINUTOS_CV_NUEVO * 60_000 : HORAS_ENTRE_BUSQUEDAS * 3_600_000)).toISOString()
      return { userId, omitido: 'reciente', proxima_busqueda: proxima, analizado }
    }
  }

  // Cupo mensual de SerpApi (compartido por todos los usuarios).
  const inicioMes = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1)).toISOString()
  const { count: usadas } = await db.from('busquedas').select('id', { count: 'exact', head: true }).gte('ejecutado_el', inicioMes)
  if ((usadas ?? 0) + BLOQUES.length > LIMITE_MENSUAL) return { userId, omitido: 'cupo_mensual', usadas }

  const [{ data: ofertas }, { data: estados }] = await Promise.all([
    db.from('ofertas').select('id').eq('user_id', userId),
    db.from('estados').select('job_id, status, archived').eq('user_id', userId),
  ])
  const yaVistas = new Set<string>([
    ...(ofertas ?? []).map((o) => o.id),
    ...(estados ?? []).filter((e) => e.status === 'descartado' || e.archived === true).map((e) => e.job_id),
  ])
  const cv = terminos(perfil?.cv_texto ?? '')
  const aceptaJunior = analisis?.seniority === 'junior'
  const diaDelAnio = Math.floor((ahora.getTime() - Date.UTC(ahora.getUTCFullYear(), 0, 0)) / 86_400_000)

  const resumen: Record<string, unknown> = { userId, analizado, nombres: Object.fromEntries((analisis?.bloques ?? []).map((b: any) => [b.id, b.nombre])), bloques: {} as Record<string, unknown> }
  const nuevasTotales: Record<string, unknown>[] = []

  for (const bloque of BLOQUES as readonly Bloque[]) {
    const lista = palabrasClave(analisis, bloque)
    if (!lista.length) continue // el CV no apunta a este rubro: no se busca ni se gasta cupo
    const consulta = lista[diaDelAnio % lista.length] // una palabra por bloque y por día, rotando para variar
    const { resultados, error, crudo } = await buscarEnSerpApi(consulta, apiKey)
    const descartes = { no_argentina: 0, antiguas: 0, junior: 0, sin_enlace: 0, ya_vistas: 0 }
    const candidatas: { fila: Record<string, unknown>; puntaje: number }[] = []

    for (const r of resultados) {
      if (!r?.title) continue
      if (!esDeArgentina(r)) { descartes.no_argentina++; continue }
      if (!aceptaJunior && esJunior(r)) { descartes.junior++; continue }
      const posted = r.detected_extensions?.posted_at ?? (r.extensions ?? []).find((e) => /hace|ago|hoy|today|ayer/i.test(e))
      const dias = diasDePublicacion(posted)
      if (dias !== null && dias > DIAS_MAXIMOS) { descartes.antiguas++; continue }
      const url = elegirEnlace(r)
      if (!url) { descartes.sin_enlace++; continue }
      const id = await idOferta(r)
      if (yaVistas.has(id)) { descartes.ya_vistas++; continue }
      yaVistas.add(id)
      candidatas.push({
        puntaje: puntuar(r, consulta, cv),
        fila: {
          user_id: userId, id, bloque,
          titulo: String(r.title).slice(0, 200),
          empresa: String(r.company_name ?? '').slice(0, 120),
          modalidad: modalidad(r),
          salario: r.detected_extensions?.salary ? String(r.detected_extensions.salary).slice(0, 80) : null,
          iso: dias === null ? null : fechaIso(dias, ahora), // sin fecha verificable: la app lo muestra como "Fecha sin verificar"
          url, enlace: null, nuevo: true, archivado: false,
        },
      })
    }
    candidatas.sort((a, b) => b.puntaje - a.puntaje)
    const elegidas = candidatas.slice(0, NUEVAS_POR_BLOQUE).map((c, i) => ({ ...c.fila, prio: i + 1 }))
    nuevasTotales.push(...elegidas)

    await db.from('busquedas').insert({
      user_id: userId, bloque, consulta, resultados: resultados.length, nuevas: elegidas.length, error: error ?? null,
    })
    ;(resumen.bloques as Record<string, unknown>)[bloque] = {
      consulta, devueltas: resultados.length, nuevas: elegidas.length, descartes, error: error ?? undefined,
      ...(diagnostico && resultados[0] ? {
        diagnostico: {
          claves_primer_resultado: Object.keys(resultados[0]),
          detected_extensions: resultados[0].detected_extensions ?? null,
          apply_options: (resultados[0].apply_options ?? []).slice(0, 2),
          claves_respuesta: Object.keys(crudo ?? {}),
        },
      } : {}),
    }
  }

  if (nuevasTotales.length) {
    await db.from('ofertas').update({ nuevo: false }).eq('user_id', userId).eq('nuevo', true) // las de hoy dejan de ser "nuevas" las anteriores
    const { error } = await db.from('ofertas').upsert(nuevasTotales, { onConflict: 'user_id,id', ignoreDuplicates: true })
    if (error) { console.error('agente-ofertas: no se pudieron guardar las ofertas', error.message); resumen.error_guardado = error.message }
  }
  resumen.nuevas = nuevasTotales.length
  return resumen
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405)

  const apiKey = Deno.env.get('SERPAPI_KEY')
  if (!apiKey) return json({ error: 'La búsqueda de ofertas todavía no está configurada (falta el secreto SERPAPI_KEY).' }, 500)

  const body = await req.json().catch(() => ({}))
  const cronSecret = Deno.env.get('AGENTE_CRON_SECRET')
  const esCron = !!cronSecret && req.headers.get('x-cron-secret') === cronSecret

  try {
    if (esCron) {
      const { data } = await admin().from('perfil').select('user_id').not('cv_texto', 'is', null)
      const resultados = []
      for (const u of data ?? []) resultados.push(await procesarUsuario(u.user_id, apiKey, false))
      return json({ usuarios: resultados.length, resultados })
    }

    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user }, error } = await userClient.auth.getUser()
    if (error || !user) return json({ error: 'No autenticado.' }, 401)
    return json(await procesarUsuario(user.id, apiKey, body?.diagnostico === true))
  } catch (err) {
    console.error('agente-ofertas:', err)
    return json({ error: err instanceof Error ? err.message : 'Error inesperado.' }, 500)
  }
})
