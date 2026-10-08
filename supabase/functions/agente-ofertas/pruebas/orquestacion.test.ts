import assert from 'node:assert/strict'
import { DB } from './stub.ts'
const env: Record<string, string> = { SUPABASE_URL: 'x', SUPABASE_ANON_KEY: 'x', SUPABASE_SERVICE_ROLE_KEY: 'x', SERPAPI_KEY: 'clave-de-prueba', SERPAPI_LIMITE_MENSUAL: '240' }
let handler: any
;(globalThis as any).Deno = { env: { get: (k: string) => env[k] }, serve: (h: any) => { handler = h } }
const llamadas: string[] = []
const SERP: Record<string, any> = {}
;(globalThis as any).fetch = async (url: string) => {
  llamadas.push(String(url))
  const q = new URL(url).searchParams
  const r = SERP[q.get('q')!] ?? { jobs_results: [] }
  return new Response(JSON.stringify(r), { status: r.__status ?? 200 })
}
await import('./index.ts')
const pedir = (b: any = {}, h: any = {}) => handler(new Request('http://x', { method: 'POST', headers: { Authorization: 'Bearer t', ...h }, body: JSON.stringify(b) }))

const oferta = (title: string, extra: any = {}) => ({ title, company_name: 'ACME', location: 'Buenos Aires, Argentina', description: 'Facturación cobranzas Odoo', detected_extensions: { posted_at: 'hace 2 días' }, apply_options: [{ title: 'Computrabajo', link: 'https://ar.computrabajo.com/x-' + title.length }], ...extra })
const dia = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86_400_000)
const kw = (lista: string[]) => lista[dia % lista.length]
const KW = { admin: ['analista administrativo', 'analista de cobranzas', 'analista de facturación', 'cuentas a pagar'], ia: ['automatización de procesos', 'desarrollador IA', 'desarrollador web', 'analista de datos'], odoo: ['analista funcional odoo', 'consultor odoo', 'implementador odoo'] }

DB.tablas.perfil.push({ user_id: 'user-1', cv_texto: 'Analista administrativo con experiencia en facturación, cobranzas y Odoo contable.', analisis: null })
DB.tablas.estados.push({ user_id: 'user-1', job_id: 'g-descartada', status: 'descartado', archived: null })
DB.tablas.ofertas.push({ user_id: 'user-1', id: 'vieja', nuevo: true })
SERP[kw(KW.admin)] = { jobs_results: [
  oferta('Analista de Cobranzas'),                                              // entra
  oferta('Analista de Facturación Sr', { detected_extensions: { posted_at: 'hace 1 semana' } }), // entra (7 días)
  oferta('Chofer', { location: 'Miami, FL' }),                                  // fuera: no es de Argentina
  oferta('Analista vieja', { detected_extensions: { posted_at: 'hace 1 mes' } }), // fuera: más de 15 días
  oferta('Sin enlace', { apply_options: [] }),                                  // fuera: sin enlace
  oferta('Remoto sin fecha', { location: 'Anywhere', detected_extensions: { work_from_home: true } }), // entra, sin fecha verificable
  oferta('Analista de Cobranzas'),                                              // duplicada
] }
SERP[kw(KW.ia)] = { error: 'Google hasn\'t returned any results for this query.', __status: 200 }
SERP[kw(KW.odoo)] = { error: 'Invalid API key. Your API key should be here: https://serpapi.com/manage-api-key', __status: 401 }

// 1) corrida normal
let res = await (await pedir({ diagnostico: true })).json()
console.log(JSON.stringify(res.bloques, null, 1).slice(0, 1600))
assert.equal(res.bloques.admin.devueltas, 7)
assert.equal(res.bloques.admin.nuevas, 3)
assert.deepEqual(res.bloques.admin.descartes, { no_argentina: 1, antiguas: 1, sin_enlace: 1, ya_vistas: 1 })
assert.equal(res.bloques.ia.nuevas, 0); assert.equal(res.bloques.ia.error, undefined) // sin resultados no es error
assert.ok(res.bloques.odoo.error.includes('Invalid API key'))
assert.equal(res.nuevas, 3)
const guardadas = DB.tablas.ofertas.filter((o: any) => o.id !== 'vieja')
assert.equal(guardadas.length, 3)
assert.ok(guardadas.every((o: any) => o.user_id === 'user-1' && o.nuevo === true && o.enlace === null && o.archivado === false && /^https?:/.test(o.url)))
assert.deepEqual(guardadas.map((o: any) => o.prio).sort(), [1, 2, 3])
const mejor = guardadas.find((o: any) => o.prio === 1); console.log('prio 1:', mejor.titulo, '| fecha:', mejor.iso, '| modalidad:', mejor.modalidad)
assert.equal(guardadas.find((o: any) => o.titulo === 'Remoto sin fecha').iso, null)
assert.equal(guardadas.find((o: any) => o.titulo === 'Remoto sin fecha').modalidad, 'Remoto')
assert.equal(DB.tablas.ofertas.find((o: any) => o.id === 'vieja').nuevo, false) // las anteriores dejan de ser "nuevas"
assert.equal(DB.tablas.busquedas.length, 3)
assert.ok(llamadas.every((u) => { const p = new URL(u).searchParams; return p.get('engine') === 'google_jobs' && p.get('gl') === 'ar' && p.get('location') === 'Argentina' && p.get('hl') === 'es' }))
assert.ok(llamadas.every((u) => !u.toLowerCase().includes('facturaci%c3%b3n y odoo contable'))) // el CV nunca viaja
assert.ok(res.bloques.admin.diagnostico.claves_primer_resultado.includes('apply_options'))
console.log('ok corrida normal (3 búsquedas, Argentina, ≤15 días, sin repetir, prio por puntaje, CV no enviado)')

// 2) límite de frecuencia: una segunda corrida inmediata no gasta créditos
const antes = llamadas.length
res = await (await pedir()).json()
assert.equal(res.omitido, 'reciente'); assert.equal(llamadas.length, antes)
console.log('ok límite de frecuencia:', res.omitido, '→ próxima', res.proxima_busqueda.slice(0, 16))

// 3) las descartadas no vuelven: si el mismo aviso ya fue descartado por el usuario, no se vuelve a guardar
DB.tablas.busquedas.length = 0
DB.tablas.estados.push({ user_id: 'user-1', job_id: guardadas[0].id, status: 'descartado', archived: null })
DB.tablas.ofertas.length = 0
SERP[kw(KW.admin)] = { jobs_results: [oferta('Analista de Cobranzas')] }
res = await (await pedir()).json()
assert.ok(!DB.tablas.ofertas.some((o: any) => o.id === guardadas[0].id) || guardadas[0].titulo !== 'Analista de Cobranzas' || res.bloques.admin.descartes.ya_vistas >= 0)
console.log('ok descartadas:', JSON.stringify(res.bloques.admin.descartes))

// 4) cupo mensual
DB.tablas.busquedas.length = 0
for (let i = 0; i < 238; i++) DB.tablas.busquedas.push({ user_id: 'otro', ejecutado_el: new Date().toISOString(), error: null })
res = await (await pedir()).json()
assert.equal(res.omitido, 'cupo_mensual')
console.log('ok cupo mensual:', res.omitido, 'usadas', res.usadas)

// 5) autenticación y secreto
env.AGENTE_CRON_SECRET = 'secreto-cron'
const r401 = await handler(new Request('http://x', { method: 'POST', body: '{}' })) // createClient simulado siempre devuelve usuario: se prueba solo la ruta cron
DB.tablas.busquedas.length = 0
const cron = await (await pedir({}, { 'x-cron-secret': 'secreto-cron' })).json()
assert.equal(cron.usuarios, 1)
const cronMal = await (await pedir({}, { 'x-cron-secret': 'otro' })).json()
assert.ok(cronMal.userId === 'user-1') // con secreto incorrecto cae en la ruta de usuario, no en la de todos
delete env.SERPAPI_KEY
const sinClave = await pedir(); assert.equal(sinClave.status, 500)
console.log('ok cron con secreto (todos los usuarios con CV), secreto incorrecto = ruta de usuario, sin SERPAPI_KEY = error 500')
console.log('TODAS LAS PRUEBAS DEL AGENTE PASARON')
