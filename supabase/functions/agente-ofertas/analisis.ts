// Análisis del CV por reglas (sin IA): detecta los puestos que la persona puede ocupar, su nivel y sus habilidades,
// y arma las búsquedas a partir de eso. Cuando haya clave de Claude, esto lo reemplaza un análisis de IA con la misma forma de salida.
// Puro: sin red ni base de datos, para poder probarlo.
import { BLOQUES, sinTildes, type Bloque } from './logica.ts'

interface Rol { termino: string; pat: RegExp }
interface Grupo {
  nombre: string
  /** Si el grupo es una de las tres familias originales conserva su bloque; si no, ocupa un bloque libre. */
  bloque?: Bloque
  roles: Rol[]
  /** Habilidades que suelen pedir los avisos de este grupo (nombres del catálogo de habilidades). */
  pedidas: string[]
}

const GRUPOS: Grupo[] = [
  { nombre: 'Administración y finanzas', bloque: 'admin', pedidas: ['Excel avanzado', 'Odoo', 'ARCA / AFIP', 'Inglés', 'Power BI'], roles: [
    { termino: 'analista administrativo', pat: /administrativ/ },
    { termino: 'analista contable', pat: /contab|contador/ },
    { termino: 'analista de cobranzas', pat: /cobranza/ },
    { termino: 'analista de facturación', pat: /facturaci|facturacion/ },
    { termino: 'cuentas a pagar', pat: /cuentas a pagar|pago a proveedores|pagos a proveedores/ },
    { termino: 'analista de tesorería', pat: /tesorer/ },
    { termino: 'analista impositivo', pat: /impositiv|impuestos/ },
    { termino: 'liquidación de sueldos', pat: /liquidacion de sueldos|sueldos y jornales/ },
    { termino: 'analista de compras', pat: /\bcompras\b|abastecimiento/ },
    { termino: 'analista de cuentas corrientes', pat: /cuentas? corrientes?|conciliacion de cuentas/ },
    { termino: 'analista de operaciones comerciales', pat: /operaciones comerciales|ordenes de compra|gestion documental/ },
  ] },
  { nombre: 'Tecnología, datos y automatización', bloque: 'ia', pedidas: ['Python', 'SQL', 'Power BI', 'Inglés', 'Gestión de proyectos'], roles: [
    { termino: 'desarrollador web', pat: /desarrollador|programador|developer|front.?end|back.?end|full.?stack/ },
    { termino: 'automatización de procesos', pat: /automatiza|\brpa\b|\bn8n\b|zapier|make\.com/ },
    { termino: 'desarrollador IA', pat: /inteligencia artificial|machine learning|\bllm\b|chatgpt|\bia\b/ },
    { termino: 'analista de datos', pat: /power ?bi|analista de datos|tableau|data analyst|business intelligence/ },
    { termino: 'analista de sistemas', pat: /analista de sistemas|soporte tecnico|help ?desk|sistemas/ },
    { termino: 'project manager', pat: /project manager|gestion de proyectos|scrum|lider de proyecto/ },
  ] },
  { nombre: 'Odoo y ERP', bloque: 'odoo', pedidas: ['Odoo', 'SQL', 'Inglés', 'Gestión de proyectos', 'ARCA / AFIP'], roles: [
    { termino: 'analista funcional odoo', pat: /odoo/ },
    { termino: 'consultor ERP', pat: /\berp\b|\bsap\b|netsuite|bejerman|\btango\b/ },
    { termino: 'analista funcional', pat: /analista funcional|consultor funcional/ },
  ] },
  { nombre: 'eCommerce', pedidas: ['Excel avanzado', 'Inglés', 'Power BI'], roles: [
    { termino: 'analista de ecommerce', pat: /e-?commerce|comercio electronico/ },
    { termino: 'ecommerce operations', pat: /e-?commerce operations|operaciones de e-?commerce/ },
    { termino: 'ecommerce specialist', pat: /e-?commerce (data )?specialist|especialista en e-?commerce/ },
  ] },
  { nombre: 'Ventas y comercial', pedidas: ['Inglés', 'Excel avanzado', 'Atención al cliente'], roles: [
    { termino: 'ejecutivo de ventas', pat: /ventas|vendedor|asesor comercial|ejecutivo comercial/ },
    { termino: 'ejecutivo de cuentas', pat: /ejecutivo de cuentas|account manager/ },
  ] },
  { nombre: 'Atención al cliente', pedidas: ['Inglés', 'Excel avanzado'], roles: [
    { termino: 'atención al cliente', pat: /atencion al cliente|call center|customer service|soporte al cliente/ },
  ] },
  { nombre: 'Marketing y comunicación', pedidas: ['Inglés', 'Power BI'], roles: [
    { termino: 'analista de marketing', pat: /marketing/ },
    { termino: 'community manager', pat: /community manager|redes sociales/ },
  ] },
  { nombre: 'Recursos humanos', pedidas: ['Excel avanzado', 'Inglés'], roles: [
    { termino: 'analista de recursos humanos', pat: /recursos humanos|reclutamiento|seleccion de personal/ },
  ] },
  { nombre: 'Logística y operaciones', pedidas: ['Excel avanzado', 'Inglés', 'SAP'], roles: [
    { termino: 'analista de logística', pat: /logistic|deposito|supply chain|stock/ },
  ] },
  { nombre: 'Salud', pedidas: ['Inglés'], roles: [
    { termino: 'enfermero', pat: /enfermer/ },
    { termino: 'kinesiólogo', pat: /kinesi/ },
    { termino: 'psicólogo', pat: /psicolog/ },
    { termino: 'nutricionista', pat: /nutricion/ },
  ] },
  { nombre: 'Docencia', pedidas: ['Inglés'], roles: [{ termino: 'docente', pat: /docente|profesor|maestr[oa] (de grado|jardinera|de nivel)/ }] },
  { nombre: 'Legales', pedidas: ['Inglés'], roles: [{ termino: 'abogado', pat: /abogad|asuntos legales/ }] },
  { nombre: 'Ingeniería', pedidas: ['Inglés', 'Gestión de proyectos'], roles: [{ termino: 'ingeniero', pat: /ingenier/ }] },
]

const HABILIDADES: { nombre: string; pat: RegExp }[] = [
  { nombre: 'Excel avanzado', pat: /excel|tablas dinamicas/ },
  { nombre: 'Odoo', pat: /odoo/ },
  { nombre: 'SAP', pat: /\bsap\b/ },
  { nombre: 'Power BI', pat: /power ?bi/ },
  { nombre: 'SQL', pat: /\bsql\b|postgres|mysql/ },
  { nombre: 'Python', pat: /python/ },
  { nombre: 'JavaScript', pat: /javascript|typescript|node\.?js|react/ },
  { nombre: 'Automatización (n8n, Zapier, RPA)', pat: /\bn8n\b|zapier|\brpa\b|make\.com/ },
  { nombre: 'ARCA / AFIP', pat: /\barca\b|afip|facturacion electronica/ },
  { nombre: 'Conciliaciones bancarias', pat: /conciliaci/ },
  { nombre: 'Inglés', pat: /ingles|english/ },
  { nombre: 'Liderazgo de equipos', pat: /liderazgo|equipo a cargo|personal a cargo|jefe de|gerente|coordinador/ },
  { nombre: 'Gestión de proyectos', pat: /gestion de proyectos|project manager|scrum|agile|agil/ },
  { nombre: 'Atención al cliente', pat: /atencion al cliente|customer service/ },
]

export interface Analisis {
  resumen: string
  seniority: 'junior' | 'semi senior' | 'senior' | 'no determinado'
  fortalezas: string[]
  oportunidades: string[]
  palabras_clave: Record<Bloque, string[]>
  bloques: { id: Bloque; nombre: string }[]
  sin_coincidencias: boolean
}

export function detectarSeniority(texto: string): Analisis['seniority'] {
  const t = sinTildes(texto)
  const anios = [...t.matchAll(/(\d{1,2})\s*\+?\s*anos?\s+de\s+experiencia|experiencia\s+de\s+(\d{1,2})\s+anos|(\d{1,2})\s*\+?\s*years/g)]
    .map((m) => parseInt(m[1] ?? m[2] ?? m[3], 10)).filter((n) => n > 0 && n < 50)
  const max = anios.length ? Math.max(...anios) : 0
  if (/\bsemi ?senior\b|\bssr\b/.test(t)) return 'semi senior'
  if (/\bsenior\b|\bsr\b/.test(t) || max >= 7) return 'senior'
  if (max >= 3) return 'semi senior'
  if (/\bjunior\b|\bjr\b|estudiante|primer empleo/.test(t) || (max > 0 && max < 3)) return 'junior'
  return 'no determinado'
}

/** Primera línea que parece un título (el encabezado del CV), por si ningún grupo coincide. */
function encabezado(texto: string): string | null {
  for (const linea of texto.split('\n').map((l) => l.trim()).slice(0, 12)) {
    if (linea.length < 6 || linea.length > 60 || /@|https?:|\d{4}/.test(linea)) continue
    const palabras = linea.split(/\s+/)
    if (palabras.length < 2) continue
    if (palabras.length <= 3 && palabras.every((w) => /^\p{Lu}/u.test(w))) continue // parece el nombre de la persona
    return linea
  }
  return null
}

export function analizarCV(texto: string): Analisis {
  const t = sinTildes(texto)
  const inicio = t.slice(0, 600)
  const seniority = detectarSeniority(texto)

  const puntuados = GRUPOS.map((g) => {
    const roles = g.roles.map((r) => {
      const veces = (t.match(new RegExp(r.pat.source, 'g')) ?? []).length
      return { termino: r.termino, puntaje: veces ? Math.min(veces, 6) + (r.pat.test(inicio) ? 4 : 0) : 0 }
    }).filter((r) => r.puntaje > 0).sort((a, b) => b.puntaje - a.puntaje)
    return { g, roles, puntaje: roles.reduce((s, r) => s + r.puntaje, 0) }
  }).filter((x) => x.puntaje >= 3).sort((a, b) => b.puntaje - a.puntaje)
    .filter((x, _i, todos) => x.puntaje >= todos[0].puntaje * 0.3) // los rubros secundarios muy flojos no se buscan
    .slice(0, BLOQUES.length)

  // Cada grupo conserva su bloque si es una de las tres familias; el resto ocupa los bloques que queden libres.
  const ocupados = new Set<Bloque>(puntuados.map((x) => x.g.bloque).filter((b): b is Bloque => !!b))
  const libres = BLOQUES.filter((b) => !ocupados.has(b))
  const palabras: Record<Bloque, string[]> = { admin: [], ia: [], odoo: [] }
  const bloques: Analisis['bloques'] = []
  for (const x of puntuados) {
    const id = x.g.bloque ?? libres.shift()!
    palabras[id] = x.roles.slice(0, 4).map((r) => r.termino)
    bloques.push({ id, nombre: x.g.nombre })
  }

  let sinCoincidencias = false
  if (!bloques.length) {
    sinCoincidencias = true
    const h = encabezado(texto)
    if (h) { palabras.admin = [h]; bloques.push({ id: 'admin', nombre: 'Según el encabezado de tu CV' }) }
  }

  const detectadas = HABILIDADES.filter((h) => h.pat.test(t)).map((h) => h.nombre)
  const oportunidades = [...new Set(puntuados.flatMap((x) => x.g.pedidas))].filter((p) => !detectadas.includes(p)).slice(0, 5)
    .map((p) => `Sumar ${p} amplía las ofertas a las que podés aspirar`)

  const principales = puntuados.map((x) => x.g.nombre)
  const resumen = principales.length
    ? `Perfil principal: ${principales[0]}${principales.length > 1 ? '. También encaja en: ' + principales.slice(1).join(', ') : ''}.`
    : 'No se reconoció un puesto claro en el CV; se busca según su encabezado.'

  return { resumen, seniority, fortalezas: detectadas.slice(0, 8), oportunidades, palabras_clave: palabras, bloques, sin_coincidencias: sinCoincidencias }
}
