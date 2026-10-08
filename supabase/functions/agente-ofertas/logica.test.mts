import assert from 'node:assert/strict'
import { diasDePublicacion, esDeArgentina, modalidad, elegirEnlace, idOferta, palabrasClave, puntuar, terminos, fechaIso, KW_DEFECTO } from './logica.ts'

// Antigüedad
assert.equal(diasDePublicacion('hace 3 días'), 3)
assert.equal(diasDePublicacion('Hace 1 hora'), 0)
assert.equal(diasDePublicacion('hace una semana'), 7)
assert.equal(diasDePublicacion('hace 2 semanas'), 14)
assert.equal(diasDePublicacion('hace 1 mes'), 30)
assert.equal(diasDePublicacion('hace 30+ días'), 30)
assert.equal(diasDePublicacion('Hoy'), 0)
assert.equal(diasDePublicacion('ayer'), 1)
assert.equal(diasDePublicacion('5 days ago'), 5)
assert.equal(diasDePublicacion('an hour ago'), 0)
assert.equal(diasDePublicacion('a month ago'), 30)
assert.equal(diasDePublicacion('vence pronto'), null)
assert.equal(diasDePublicacion(undefined), null)
assert.equal(fechaIso(3, new Date('2026-10-10T12:00:00Z')), '2026-10-07')
console.log('ok antigüedad')

// Argentina / remoto
assert.ok(esDeArgentina({ location: 'Buenos Aires, Argentina' }))
assert.ok(esDeArgentina({ location: 'Córdoba' }))
assert.ok(esDeArgentina({ location: 'Anywhere', detected_extensions: { work_from_home: true } }))
assert.ok(!esDeArgentina({ location: 'Miami, FL' }))
assert.ok(!esDeArgentina({ location: 'Santiago, Chile' }))
console.log('ok solo Argentina')

// Modalidad
assert.equal(modalidad({ title: 'Analista', description: 'Modalidad híbrida, 3 días' }), 'Híbrido')
assert.equal(modalidad({ title: 'Dev', detected_extensions: { work_from_home: true } }), 'Remoto')
assert.equal(modalidad({ title: 'Analista', description: 'Trabajo presencial en Pilar' }), 'Presencial')
assert.equal(modalidad({ title: 'Analista', description: 'Buscamos analista' }), 'A confirmar')
console.log('ok modalidad')

// Enlace
assert.equal(elegirEnlace({ apply_options: [{ link: 'https://x.com/a' }, { link: 'https://ar.computrabajo.com/oferta-1' }] }), 'https://ar.computrabajo.com/oferta-1')
assert.equal(elegirEnlace({ apply_options: [{ link: 'https://x.com/a' }] }), 'https://x.com/a')
assert.equal(elegirEnlace({ share_link: 'https://www.google.com/search?q=1' }), 'https://www.google.com/search?q=1')
assert.equal(elegirEnlace({ apply_options: [{ link: 'javascript:alert(1)' }] }), null)
assert.equal(elegirEnlace({}), null)
console.log('ok enlaces (solo http/https)')

// Id estable
const a = await idOferta({ title: 'Analista Contable', company_name: 'ACME', location: 'CABA' })
const b = await idOferta({ title: 'analista contable ', company_name: 'Acme', location: 'caba' })
const c = await idOferta({ title: 'Analista Contable', company_name: 'Otra', location: 'CABA' })
assert.equal(a, b); assert.notEqual(a, c); assert.match(a, /^g[0-9a-f]{14}$/)
console.log('ok id estable', a)

// Palabras clave
assert.deepEqual(palabrasClave({ palabras_clave: { admin: ['jefe de administración', ' '] } }, 'admin'), ['jefe de administración'])
assert.deepEqual(palabrasClave(null, 'odoo'), KW_DEFECTO.odoo)
assert.deepEqual(palabrasClave({ palabras_clave: { ia: [] } }, 'ia'), KW_DEFECTO.ia)
console.log('ok palabras clave')

// Puntaje
const cv = terminos('Analista administrativo con experiencia en facturación, cobranzas y Odoo contable. Pagos a proveedores.')
const buena = { title: 'Analista de Cobranzas', description: 'Facturación y cobranzas, manejo de Odoo, pagos a proveedores' }
const mala = { title: 'Chofer de reparto', description: 'Reparto de mercadería' }
assert.ok(puntuar(buena, 'analista de cobranzas', cv) > puntuar(mala, 'analista de cobranzas', cv))
console.log('ok puntaje: buena', puntuar(buena, 'analista de cobranzas', cv), '> mala', puntuar(mala, 'analista de cobranzas', cv))
console.log('TODAS LAS PRUEBAS PASARON')
