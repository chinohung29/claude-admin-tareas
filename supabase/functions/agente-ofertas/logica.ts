// Lógica pura del agente de ofertas (sin red ni base de datos), para poder probarla.
// Fuente: SerpApi, motor google_jobs. La forma exacta de cada resultado no se pudo confirmar sin una clave,
// por eso todo se lee de forma defensiva (campos opcionales, valores por defecto).

export const DIAS_MAXIMOS = 15

export const KW_DEFECTO: Record<string, string[]> = {
  admin: ['analista administrativo', 'analista de cobranzas', 'analista de facturación', 'cuentas a pagar'],
  ia: ['automatización de procesos', 'desarrollador IA', 'desarrollador web', 'analista de datos'],
  odoo: ['analista funcional odoo', 'consultor odoo', 'implementador odoo'],
}

export const BLOQUES = ['admin', 'ia', 'odoo'] as const
export type Bloque = (typeof BLOQUES)[number]

export interface ResultadoSerp {
  title?: string
  company_name?: string
  location?: string
  via?: string
  description?: string
  share_link?: string
  job_id?: string
  extensions?: string[]
  detected_extensions?: { posted_at?: string; schedule_type?: string; work_from_home?: boolean; salary?: string }
  apply_options?: { title?: string; link?: string }[]
}

export const sinTildes = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Palabras clave de un bloque: las del análisis del CV si hay, si no las de ejemplo. */
export function palabrasClave(analisis: unknown, bloque: Bloque): string[] {
  const a = (analisis as { palabras_clave?: Record<string, unknown> } | null)?.palabras_clave?.[bloque]
  const lista = Array.isArray(a) ? a.map((x) => String(x).trim()).filter((x) => x.length > 1 && x.length <= 80) : []
  return lista.length ? lista : KW_DEFECTO[bloque]
}

const UNIDAD_DIAS: Record<string, number> = {
  minuto: 0, minute: 0, hora: 0, hour: 0, dia: 1, day: 1, semana: 7, week: 7, mes: 30, month: 30,
}

/** Días de antigüedad según el texto "hace 3 días" / "3 days ago". null si no se puede interpretar. */
export function diasDePublicacion(texto: string | undefined | null): number | null {
  if (!texto) return null
  const t = sinTildes(texto)
  if (/\b(hoy|today|just posted|recien|ahora)\b/.test(t)) return 0
  if (/\b(ayer|yesterday)\b/.test(t)) return 1
  const m = t.match(/hace\s+(\d+|un|una)\+?\s+(minuto|hora|dia|semana|mes)/) ?? t.match(/(\d+|an?)\+?\s+(minute|hour|day|week|month)s?\s+ago/)
  if (!m) return null
  const n = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : 1
  return n * UNIDAD_DIAS[m[2]]
}

export function fechaIso(dias: number, hoy: Date): string {
  return new Date(hoy.getTime() - dias * 86_400_000).toISOString().slice(0, 10)
}

const PROVINCIAS = ['argentina', 'buenos aires', 'caba', 'capital federal', 'cordoba', 'santa fe', 'mendoza', 'tucuman', 'rosario', 'la plata', 'salta', 'neuquen', 'entre rios', 'chubut', 'misiones', 'corrientes', 'jujuy', 'san juan', 'san luis', 'santiago del estero', 'rio negro', 'tierra del fuego', 'santa cruz', 'la pampa', 'catamarca', 'la rioja', 'formosa', 'chaco']

/** Solo ofertas de Argentina, o remotas. */
export function esDeArgentina(r: ResultadoSerp): boolean {
  if (r.detected_extensions?.work_from_home) return true
  const loc = sinTildes(r.location ?? '')
  return PROVINCIAS.some((p) => loc.includes(p))
}

export function modalidad(r: ResultadoSerp): string {
  const texto = sinTildes([r.title, r.description?.slice(0, 1500), ...(r.extensions ?? [])].join(' '))
  if (/\bhibrid[oa]\b|\bhybrid\b/.test(texto)) return 'Híbrido'
  if (r.detected_extensions?.work_from_home || /\bremot[oa]\b|\bhome office\b|\bwork from home\b/.test(texto)) return 'Remoto'
  if (/\bpresencial\b|\bon-?site\b/.test(texto)) return 'Presencial'
  return 'A confirmar'
}

const PORTALES_PREFERIDOS = ['computrabajo', 'bumeran', 'linkedin', 'indeed', 'zonajobs', 'empleos', 'getonbrd', 'jooble']

/** Prefiere el enlace de uno de los portales argentinos conocidos; si no, el primero; si no, el de Google. */
export function elegirEnlace(r: ResultadoSerp): string | null {
  const links = (r.apply_options ?? []).map((o) => o?.link).filter((l): l is string => typeof l === 'string' && /^https?:\/\//.test(l))
  const preferido = links.find((l) => PORTALES_PREFERIDOS.some((p) => l.toLowerCase().includes(p)))
  return preferido ?? links[0] ?? (typeof r.share_link === 'string' && /^https?:\/\//.test(r.share_link) ? r.share_link : null)
}

/** Identificador estable: el mismo aviso (título, empresa, ubicación) da siempre el mismo id. */
export async function idOferta(r: ResultadoSerp): Promise<string> {
  const base = [r.title, r.company_name, r.location].map((x) => sinTildes(x ?? '').replace(/\s+/g, ' ').trim()).join('|')
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(base))
  return 'g' + Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 14)
}

const STOP = new Set(['para', 'como', 'esta', 'este', 'esto', 'estos', 'estas', 'sobre', 'entre', 'desde', 'hasta', 'cuando', 'donde', 'tambien', 'pero', 'porque', 'todos', 'todas', 'otros', 'otras', 'tiene', 'tienen', 'tenia', 'fueron', 'sido', 'ademas', 'durante', 'cada', 'mismo', 'misma', 'siendo', 'puede', 'pueden', 'hacer', 'haber', 'años', 'anos', 'experiencia', 'trabajo', 'empresa'])
export function terminos(texto: string): Set<string> {
  return new Set(sinTildes(texto).split(/[^a-z0-9+#.]+/).filter((w) => w.length >= 4 && !STOP.has(w)))
}

/**
 * Puntaje de coincidencia entre una oferta y el perfil. MODO DE PRUEBAS, por reglas: coincidencias de la
 * palabra clave en el título (peso alto) y en la descripción, más los términos del CV que aparecen en el aviso.
 * Cuando haya clave de Claude, esto lo reemplaza un análisis de IA.
 */
export function puntuar(r: ResultadoSerp, palabra: string, cvTerminos: Set<string>): number {
  const titulo = sinTildes(r.title ?? '')
  const desc = sinTildes((r.description ?? '').slice(0, 3000))
  const kw = sinTildes(palabra).split(/\s+/).filter((w) => w.length >= 3)
  let p = 0
  for (const w of kw) {
    if (titulo.includes(w)) p += 5
    else if (desc.includes(w)) p += 2
  }
  if (cvTerminos.size) {
    let coincide = 0
    for (const t of terminos(titulo + ' ' + desc)) if (cvTerminos.has(t)) coincide++
    p += Math.min(coincide, 40) * 0.5
  }
  return p
}
