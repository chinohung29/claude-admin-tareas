import { createClient } from 'jsr:@supabase/supabase-js@2'

// Botón de arrepentimiento (Ley 24.240 art. 34, Código Civil y Comercial art. 1110, Res. 424/2020):
// el consumidor puede revocar la contratación dentro de los 10 días corridos, sin costo.
// A diferencia de mp-cancelar-suscripcion, es una rescisión inmediata: se cancela la suscripción en Mercado Pago
// YA, se corta el plan pago en el acto y queda registrada la solicitud con un número de reclamo
// (se entrega al instante, dentro de las 24 horas que exige la norma). La devolución del dinero se gestiona
// a mano en Mercado Pago a partir del reclamo (estado 'pendiente_reintegro').
const DIAS_PARA_ARREPENTIRSE = 10

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { motivo } = await req.json().catch(() => ({ motivo: null }))

    const url = Deno.env.get('SUPABASE_URL')!
    const supabaseUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser()
    if (userError || !user) return json({ error: 'No autenticado.' }, 401)

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: perfil, error: perfilError } = await admin
      .from('profiles').select('plan, email, mp_preapproval_id, plan_desde, plan_prueba_hasta').eq('id', user.id).single()
    if (perfilError || !perfil) return json({ error: 'No se encontró tu perfil.' }, 400)

    if (perfil.plan !== 'pro') {
      return json({ error: 'No tenés una contratación vigente para revocar.' }, 400)
    }
    if (perfil.plan_desde) {
      const dias = (Date.now() - new Date(perfil.plan_desde).getTime()) / 86_400_000
      if (dias > DIAS_PARA_ARREPENTIRSE) {
        return json({
          error: `Pasaron más de ${DIAS_PARA_ARREPENTIRSE} días desde la contratación, así que ya no corresponde el arrepentimiento. Si querés dejar de pagar, cancelá la suscripción.`,
        }, 400)
      }
    }

    // Si hay suscripción activa en Mercado Pago, se cancela ya mismo.
    if (perfil.mp_preapproval_id) {
      const accessToken = Deno.env.get('MP_ACCESS_TOKEN')
      if (!accessToken) return json({ error: 'Mercado Pago no está configurado (falta el secret MP_ACCESS_TOKEN).' }, 500)
      const cancelResp = await fetch(`https://api.mercadopago.com/preapproval/${perfil.mp_preapproval_id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      if (!cancelResp.ok) {
        console.error('Mercado Pago rechazó la cancelación:', cancelResp.status, await cancelResp.text())
        return json({ error: 'No se pudo cancelar la suscripción en Mercado Pago.' }, 502)
      }
    }

    // Si todavía está en los días de prueba no se le cobró nada: se deja constancia y no hay reintegro.
    const enPrueba = !!perfil.plan_prueba_hasta && new Date(perfil.plan_prueba_hasta) > new Date()

    // Se corta el acceso al plan pago en el acto.
    await admin.from('profiles')
      .update({ mp_preapproval_id: null, plan: 'cancelado', plan_vence_el: new Date().toISOString(), plan_prueba_hasta: null })
      .eq('id', user.id)

    const { data: solicitud, error: insertError } = await admin
      .from('solicitudes_arrepentimiento')
      .insert({
        user_id: user.id,
        email: perfil.email ?? user.email,
        plan: perfil.plan,
        mp_preapproval_id: perfil.mp_preapproval_id,
        motivo: typeof motivo === 'string' ? motivo.slice(0, 500) : null,
        en_prueba: enPrueba,
      })
      .select('numero_reclamo')
      .single()
    if (insertError || !solicitud) {
      console.error('Error al registrar la solicitud de arrepentimiento:', insertError)
      return json({ error: 'La suscripción se canceló, pero no pudimos registrar el reclamo. Escribinos para gestionar la devolución.' }, 500)
    }
    return json({ numero_reclamo: solicitud.numero_reclamo, en_prueba: enPrueba })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Error inesperado.' }, 500)
  }
})
