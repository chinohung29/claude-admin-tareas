import { createClient } from 'jsr:@supabase/supabase-js@2'

// Baja voluntaria: cancela la suscripción en Mercado Pago, sin penalidad, desde la misma app donde se contrató
// (art. 10 ter de la Ley 24.240). El usuario conserva el plan hasta el fin del período ya pagado
// (próxima fecha de cobro). Si Mercado Pago no informa esa fecha, el plan termina en el momento.
// El pase a 'cancelado' al vencer lo hace la tarea diaria (ver supabase/schema.sql, bajar_planes_vencidos).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const supabaseUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser()
    if (userError || !user) return json({ error: 'No autenticado.' }, 401)

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: perfil, error: perfilError } = await admin
      .from('profiles').select('mp_preapproval_id').eq('id', user.id).single()
    if (perfilError || !perfil?.mp_preapproval_id) {
      return json({ error: 'No tenés una suscripción activa para cancelar.' }, 400)
    }

    const accessToken = Deno.env.get('MP_ACCESS_TOKEN')
    if (!accessToken) return json({ error: 'Mercado Pago no está configurado (falta el secret MP_ACCESS_TOKEN).' }, 500)

    const getResp = await fetch(`https://api.mercadopago.com/preapproval/${perfil.mp_preapproval_id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const preapproval = getResp.ok ? await getResp.json() : null
    const venceEl = preapproval?.next_payment_date ?? new Date().toISOString()

    const cancelResp = await fetch(`https://api.mercadopago.com/preapproval/${perfil.mp_preapproval_id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    })
    if (!cancelResp.ok) {
      console.error('Mercado Pago rechazó la cancelación:', cancelResp.status, await cancelResp.text())
      return json({ error: 'No se pudo cancelar la suscripción en Mercado Pago.' }, 502)
    }

    await admin.from('profiles').update({ mp_preapproval_id: null, plan_vence_el: venceEl, plan_prueba_hasta: null }).eq('id', user.id)
    return json({ plan_vence_el: venceEl })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Error inesperado.' }, 500)
  }
})
