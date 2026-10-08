import { createClient } from 'jsr:@supabase/supabase-js@2'

// Suscripción mensual en pesos con Mercado Pago (preapproval), mismo esquema que LMH Flow.
// Precio fijo en ARS: se puede cambiar con el secreto PRECIO_PRO_ARS sin tocar el código.
const PRECIO_ARS = Number(Deno.env.get('PRECIO_PRO_ARS') ?? '10000')

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
    if (userError || !user?.email) return json({ error: 'No autenticado.' }, 401)

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: perfil } = await admin.from('profiles').select('plan, mp_preapproval_id').eq('id', user.id).single()
    if (perfil?.plan === 'pro' && perfil.mp_preapproval_id) {
      return json({ error: 'Ya tenés una suscripción activa.' }, 400)
    }

    const accessToken = Deno.env.get('MP_ACCESS_TOKEN')
    if (!accessToken) return json({ error: 'Mercado Pago no está configurado (falta el secret MP_ACCESS_TOKEN).' }, 500)
    const appUrl = Deno.env.get('APP_URL') ?? 'https://busqueda-laboral-lmh.netlify.app'

    const mpResponse = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: `Búsqueda laboral · Plan Pro ($${PRECIO_ARS}/mes)`,
        external_reference: `${user.id}:pro`,
        payer_email: user.email,
        back_url: `${appUrl}/`,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: PRECIO_ARS,
          currency_id: 'ARS',
        },
      }),
    })
    const mpTexto = await mpResponse.text()
    let mpData: any = null
    try { mpData = JSON.parse(mpTexto) } catch { /* respuesta no JSON: se loguea abajo */ }

    if (!mpResponse.ok) {
      console.error('Mercado Pago rechazó la solicitud:', mpResponse.status, mpTexto)
      return json({ error: mpData?.message ?? 'Error al crear la suscripción en Mercado Pago.' }, 502)
    }
    return json({ init_point: mpData.init_point, monto: PRECIO_ARS })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Error inesperado.' }, 500)
  }
})
