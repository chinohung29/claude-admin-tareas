// Base de datos simulada, en memoria, con la misma interfaz encadenable que usa el agente.
export const DB: any = { tablas: { busquedas: [], ofertas: [], estados: [], perfil: [] }, log: [] }
function tabla(nombre: string) {
  let filtros: ((r: any) => boolean)[] = [], op = 'select', payload: any = null, head = false, opts: any = {}
  const q: any = {
    select(_c?: string, o?: any) { head = !!o?.head; opts = o ?? {}; return q },
    insert(p: any) { op = 'insert'; payload = p; return q },
    upsert(p: any, o?: any) { op = 'upsert'; payload = p; opts = o ?? {}; return q },
    update(p: any) { op = 'update'; payload = p; return q },
    eq(c: string, v: any) { filtros.push((r) => r[c] === v); return q },
    is(c: string, v: any) { filtros.push((r) => (v === null ? r[c] == null : r[c] === v)); return q },
    not(c: string, _o: string, v: any) { filtros.push((r) => !(v === null ? r[c] == null : r[c] === v)); return q },
    gte(c: string, v: any) { filtros.push((r) => r[c] >= v); return q },
    order() { return q }, limit() { return q },
    maybeSingle() { return Promise.resolve({ data: DB.tablas[nombre].filter((r: any) => filtros.every((f) => f(r)))[0] ?? null, error: null }) },
    then(res: any, rej: any) {
      const filas = DB.tablas[nombre]
      let out: any = { data: null, error: null }
      if (op === 'select') { const d = filas.filter((r: any) => filtros.every((f) => f(r))); out = head ? { data: null, count: d.length, error: null } : { data: d, error: null } }
      if (op === 'insert') { filas.push(...[].concat(payload).map((p: any) => ({ ejecutado_el: new Date().toISOString(), ...p }))); DB.log.push(['insert', nombre, payload]) }
      if (op === 'update') { for (const r of filas) if (filtros.every((f) => f(r))) Object.assign(r, payload); DB.log.push(['update', nombre, payload]) }
      if (op === 'upsert') { for (const p of [].concat(payload)) { if (!filas.some((r: any) => r.user_id === p.user_id && r.id === p.id)) filas.push(p) } DB.log.push(['upsert', nombre, [].concat(payload).length, opts]) }
      return Promise.resolve(out).then(res, rej)
    },
  }
  return q
}
export const createClient = (_u: string, _k: string, _o?: any) => ({
  from: (n: string) => tabla(n),
  auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
})
