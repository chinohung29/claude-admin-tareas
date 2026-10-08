import { createClient } from 'jsr:@supabase/supabase-js@2'
import { decidirCambio, resultadoDeCobro, type Evento } from './decision.ts'

// Notificación de Mercado Pago: nunca confiamos en los datos del payload (podrían ser falsificados).
// Solo usamos el `id` para volver a consultar el estado real contra la API de Mercado Pago con nuestro
// propio access token, y recién ahí actualizamos el plan del usuario.
//
// Temas que atendemos:
// - preapproval / subscription_preapproval: cambios de estado de la suscripción (authorized, paused, cancelled).
// - subscription_authorized_payment: resultado de cada cobro. Un cobro fallido o una suscripción
//   pausada/cancelada abre un período de gracia (ver decision.ts); un cobro exitoso lo cierra.
Deno.serve(async (req: Request) => {
  const ok = () => new Response('ok', { status: 200 })
  const url = new URL(req.url)
  let id = url.searchParams.get('id') ?? url.searchParams.get('data.id')
  let topic = url.searchParams.get('topic') ?? url.searchParams.get('type')

  if (req.method === 'POST') {
    try {
      const body = await req.json()
      id = body?.data?.id ?? id
      topic = body?.type ?? topic
    } catch {
      // Sin body JSON (IPN legacy por query params): seguimos con la URL.
    }
  }

  const esSuscripcion = !topic || topic === 'preapproval' || topic === 'subscription_preapproval'
  const esCobro = topic === 'subscription_authorized_payment'
  if (!id || (!esSuscripcion && !esCobro)) return ok()

  const accessToken = Deno.env.get('MP_ACCESS_TOKEN')
  if (!accessToken) return new Response('Mercado Pago no configurado', { status: 200 })
  const headers = { Authorization: `Bearer ${accessToken}` }

  let preapprovalId = String(id)
  let resultadoCobro: 'exitoso' | 'fallido' | 'otro' = 'otro'

  if (esCobro) {
    const apResp = await fetch(`https://api.mercadopago.com/authorized_payments/${id}`, { headers })
    if (!apResp.ok) return ok()
    const ap = await apResp.json()
    if (!ap?.preapproval_id) return ok()
    preapprovalId = String(ap.preapproval_id)
    resultadoCobro = resultadoDeCobro(ap)
  }

  const mpResponse = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, { headers })
  if (!mpResponse.ok) return ok()

  const preapproval = await mpResponse.json()
  const [userId, plan] = String(preapproval.external_reference ?? '').split(':')
  if (!userId || plan !== 'pro') return ok()

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: perfil } = await supabase
    .from('profiles')
    .select('plan, mp_preapproval_id, plan_vence_el, plan_desde')
    .eq('id', userId)
    .single()
  if (!perfil) return ok()

  const evento: Evento = esCobro
    ? { tipo: 'cobro', preapprovalId, resultado: resultadoCobro }
    : { tipo: 'preapproval', preapprovalId, status: String(preapproval.status), plan }

  const cambio = decidirCambio(evento, perfil, new Date())
  if (cambio) {
    const { error } = await supabase.from('profiles').update(cambio).eq('id', userId)
    if (error) console.error('mp-webhook: no se pudo actualizar el perfil', error.message)
  }
  return ok()
})
