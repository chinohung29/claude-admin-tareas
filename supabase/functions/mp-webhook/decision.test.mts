import { decidirCambio, resultadoDeCobro, finDeGracia } from './decision.ts'
import assert from 'node:assert/strict'
const ahora = new Date('2026-10-10T12:00:00Z')
const base = { plan: 'gratis', mp_preapproval_id: null, plan_vence_el: null, plan_desde: null }
const pro = { plan: 'pro', mp_preapproval_id: 'A1', plan_vence_el: null, plan_desde: '2026-10-01T00:00:00Z' }
let c

c = decidirCambio({ tipo: 'preapproval', preapprovalId: 'A1', status: 'authorized', plan: 'pro' }, base, ahora)
assert.equal(c.plan, 'pro'); assert.equal(c.mp_preapproval_id, 'A1'); assert.equal(c.plan_desde, ahora.toISOString()); console.log('ok alta nueva fija plan_desde')

c = decidirCambio({ tipo: 'preapproval', preapprovalId: 'A1', status: 'authorized', plan: 'pro' }, pro, ahora)
assert.ok(!('plan_desde' in c)); assert.ok(!('plan_vence_el' in c)); console.log('ok aviso repetido de la misma suscripción no mueve plan_desde ni borra la gracia')

c = decidirCambio({ tipo: 'preapproval', preapprovalId: 'B2', status: 'authorized', plan: 'pro' }, { ...pro, plan: 'cancelado', mp_preapproval_id: null, plan_vence_el: '2026-10-09T00:00:00Z' }, ahora)
assert.equal(c.plan_desde, ahora.toISOString()); assert.equal(c.plan_vence_el, null); console.log('ok reactivación: nueva fecha de inicio y limpia vencimiento')

c = decidirCambio({ tipo: 'preapproval', preapprovalId: 'A1', status: 'cancelled', plan: 'pro' }, pro, ahora)
assert.equal(c.plan_vence_el, finDeGracia(ahora)); console.log('ok cancelada desde Mercado Pago abre gracia de 10 días')

assert.equal(decidirCambio({ tipo: 'preapproval', preapprovalId: 'VIEJA', status: 'cancelled', plan: 'pro' }, pro, ahora), null); console.log('ok aviso de suscripción vieja se ignora')

c = decidirCambio({ tipo: 'cobro', preapprovalId: 'A1', resultado: 'fallido' }, pro, ahora)
assert.equal(c.plan_vence_el, finDeGracia(ahora)); console.log('ok cobro fallido abre gracia')

assert.equal(decidirCambio({ tipo: 'cobro', preapprovalId: 'A1', resultado: 'fallido' }, { ...pro, plan_vence_el: '2026-10-12T00:00:00Z' }, ahora), null); console.log('ok segundo fallo no extiende la gracia')

c = decidirCambio({ tipo: 'cobro', preapprovalId: 'A1', resultado: 'exitoso' }, { ...pro, plan_vence_el: '2026-10-12T00:00:00Z' }, ahora)
assert.equal(c.plan_vence_el, null); console.log('ok cobro exitoso cierra la gracia')

assert.equal(decidirCambio({ tipo: 'preapproval', preapprovalId: 'A1', status: 'authorized', plan: 'starter' }, base, ahora), null); console.log('ok plan desconocido se ignora')

assert.equal(resultadoDeCobro({ status: 'processed', payment: { status: 'approved' } }), 'exitoso')
assert.equal(resultadoDeCobro({ status: 'recycling' }), 'fallido')
assert.equal(resultadoDeCobro({ payment: { status: 'rejected' } }), 'fallido')
assert.equal(resultadoDeCobro({ status: 'scheduled' }), 'otro'); console.log('ok interpretación de cobros')
// Prueba gratuita
c = decidirCambio({ tipo: 'preapproval', preapprovalId: 'T1', status: 'authorized', plan: 'pro', pruebaDias: 3 }, base, ahora)
assert.equal(c.plan_desde, ahora.toISOString()); assert.equal(c.plan_prueba_hasta, '2026-10-13T12:00:00.000Z'); console.log('ok la prueba dura 3 días corridos desde la suscripción')
c = decidirCambio({ tipo: 'preapproval', preapprovalId: 'T2', status: 'authorized', plan: 'pro' }, base, ahora)
assert.equal(c.plan_prueba_hasta, null); console.log('ok sin prueba (ya la usó): plan_prueba_hasta queda en null')
c = decidirCambio({ tipo: 'preapproval', preapprovalId: 'T1', status: 'authorized', plan: 'pro', pruebaDias: 3 }, { ...pro, mp_preapproval_id: 'T1', plan_prueba_hasta: '2026-10-13T12:00:00.000Z' }, ahora)
assert.ok(!('plan_prueba_hasta' in c)); console.log('ok un aviso repetido no reinicia la prueba')
console.log('TODAS LAS PRUEBAS PASARON')
