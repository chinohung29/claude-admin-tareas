// Decide qué cambiar en profiles según lo que informa Mercado Pago.
// Lógica pura (sin red ni base) para poder probarla.
//
// Falta de pago: la cuenta no se corta al instante. Se fija plan_vence_el a
// GRACIA_DIAS días y, pasada esa fecha, el plan baja a 'cancelado'.

export const GRACIA_DIAS = 10

export interface Perfil {
  plan: string
  mp_preapproval_id: string | null
  plan_vence_el: string | null
  plan_desde: string | null
}

export type Evento =
  | { tipo: 'preapproval'; preapprovalId: string; status: string; plan: string }
  | { tipo: 'cobro'; preapprovalId: string; resultado: 'exitoso' | 'fallido' | 'otro' }

export type Cambio = Record<string, string | null>

export function finDeGracia(ahora: Date, dias = GRACIA_DIAS): string {
  return new Date(ahora.getTime() + dias * 24 * 60 * 60 * 1000).toISOString()
}

// Interpreta un authorized_payment de Mercado Pago.
export function resultadoDeCobro(ap: {
  status?: string
  payment?: { status?: string }
}): 'exitoso' | 'fallido' | 'otro' {
  const pago = ap.payment?.status
  if (ap.status === 'processed' && pago === 'approved') return 'exitoso'
  if (ap.status === 'recycling' || pago === 'rejected' || pago === 'cancelled') return 'fallido'
  return 'otro'
}

const esPago = (plan: string) => plan === 'pro'

// Devuelve los campos a actualizar en profiles, o null si no hay que hacer nada.
export function decidirCambio(evento: Evento, perfil: Perfil, ahora: Date): Cambio | null {
  // Solo actúan sobre la suscripción vigente del usuario; los avisos de una
  // suscripción vieja o ya cancelada por el usuario se ignoran.
  const esVigente = perfil.mp_preapproval_id === evento.preapprovalId

  if (evento.tipo === 'preapproval') {
    if (evento.status === 'authorized') {
      if (!esPago(evento.plan)) return null
      const cambio: Cambio = { plan: evento.plan, mp_preapproval_id: evento.preapprovalId }
      // Una suscripción nueva (alta o reactivación): desde hoy rige el plan y se limpia cualquier vencimiento previo.
      // Si es la misma, no: los avisos de actualización no deben borrar la gracia de un cobro que sigue fallando
      // ni mover la fecha de inicio (que cuenta los 10 días de arrepentimiento).
      if (!esVigente) {
        cambio.plan_desde = ahora.toISOString()
        if (perfil.plan_vence_el) cambio.plan_vence_el = null
      }
      return cambio
    }
    if (evento.status === 'paused' || evento.status === 'cancelled') {
      if (!esVigente || !esPago(perfil.plan) || perfil.plan_vence_el) return null
      return { plan_vence_el: finDeGracia(ahora) }
    }
    return null
  }

  // Aviso de cobro
  if (!esVigente) return null
  if (evento.resultado === 'fallido') {
    if (!esPago(perfil.plan) || perfil.plan_vence_el) return null
    return { plan_vence_el: finDeGracia(ahora) }
  }
  if (evento.resultado === 'exitoso' && perfil.plan_vence_el) {
    return { plan_vence_el: null }
  }
  return null
}
