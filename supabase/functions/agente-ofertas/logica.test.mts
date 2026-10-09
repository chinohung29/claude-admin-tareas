import assert from 'node:assert/strict'
import { analizarCV, detectarSeniority } from './analisis.ts'
import { esJunior, diasDePublicacion, esDeArgentina, modalidad, elegirEnlace, idOferta, palabrasClave, puntuar, terminos, fechaIso, KW_DEFECTO } from './logica.ts'

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
assert.deepEqual(palabrasClave({ palabras_clave: { ia: [] } }, 'ia'), []) // con análisis, una lista vacía significa que no se busca ese rubro
console.log('ok palabras clave')

// Puntaje
const cv = terminos('Analista administrativo con experiencia en facturación, cobranzas y Odoo contable. Pagos a proveedores.')
const buena = { title: 'Analista de Cobranzas', description: 'Facturación y cobranzas, manejo de Odoo, pagos a proveedores' }
const mala = { title: 'Chofer de reparto', description: 'Reparto de mercadería' }
assert.ok(puntuar(buena, 'analista de cobranzas', cv) > puntuar(mala, 'analista de cobranzas', cv))
console.log('ok puntaje: buena', puntuar(buena, 'analista de cobranzas', cv), '> mala', puntuar(mala, 'analista de cobranzas', cv))
assert.ok(esJunior({ title: 'Analista Jr contable' }) && esJunior({ title: 'Pasante de sistemas' }) && !esJunior({ title: 'Analista Senior' }))
console.log('ok filtro junior')

// Análisis del CV
const cvAdmin = 'Laura Pérez\nAnalista contable senior\n8 años de experiencia en contabilidad, cobranzas, facturación y cuentas a pagar. Excel avanzado, SAP, ARCA, conciliaciones bancarias. Inglés intermedio.'
const a1 = analizarCV(cvAdmin)
assert.equal(a1.seniority, 'senior')
assert.equal(a1.bloques[0].id, 'admin')
assert.ok(a1.palabras_clave.admin.includes('analista contable'))
assert.deepEqual(a1.palabras_clave.ia, []) // no es de tecnología: no se busca ahí
assert.ok(a1.fortalezas.includes('Excel avanzado') && a1.fortalezas.includes('SAP'))
console.log('ok CV administrativo ->', a1.palabras_clave.admin, '|', a1.resumen)

const cvEnf = 'Marta Gómez\nEnfermera profesional\nEnfermería en terapia intensiva, 5 años de experiencia en hospital. Enfermera universitaria.'
const a2 = analizarCV(cvEnf)
assert.equal(a2.bloques.length, 1); assert.equal(a2.bloques[0].nombre, 'Salud')
const slot = a2.bloques[0].id // un rubro fuera de las tres familias ocupa un bloque libre
assert.deepEqual(a2.palabras_clave[slot], ['enfermero'])
assert.equal(a2.seniority, 'semi senior')
console.log('ok CV de salud en el bloque', slot)

const a3 = analizarCV('Juan Gómez\nDesarrollador full stack\nPython, SQL, JavaScript, automatización con n8n y Odoo técnico. 4 años de experiencia. Odoo, odoo, odoo.')
assert.equal(a3.bloques[0].id, 'ia'); assert.ok(a3.bloques.some((b) => b.id === 'odoo'))
console.log('ok CV técnico ->', a3.bloques.map((b) => b.nombre))

const a4 = analizarCV('Carlos Díaz\nMaestro mayor de obras\nTrabajo en obras de construcción y supervisión de personal durante años.')
assert.ok(a4.sin_coincidencias); assert.deepEqual(a4.palabras_clave.admin, ['Maestro mayor de obras']) // nunca se busca por el nombre de la persona
console.log('ok CV sin rubro conocido ->', a4.palabras_clave.admin, a4.sin_coincidencias)
assert.equal(detectarSeniority('Estudiante, primer empleo'), 'junior')
assert.equal(detectarSeniority('Analista'), 'no determinado')
// CV administrativo con operaciones comerciales y eCommerce (texto genérico): administración manda, sin rubros flojos
const a5 = analizarCV('ANALISTA ADMINISTRATIVO | OPERACIONES COMERCIALES | ECOMMERCE\nExperiencia en gestión documental, facturación, órdenes de compra, devoluciones, cobranzas, conciliación de cuentas. Ejecutivo de cuentas B2B en marketing. SAP, CRM, Excel.')
assert.equal(a5.bloques[0].nombre, 'Administración y finanzas')
assert.ok(a5.palabras_clave.admin.includes('analista administrativo') && a5.palabras_clave.admin.includes('analista de facturación'))
assert.ok(a5.bloques.length <= 3)
console.log('ok CV administrativo/ecommerce ->', a5.bloques.map((b) => b.nombre), a5.palabras_clave)
// CV administrativo con eCommerce y mención de logística como área con la que se coordina: sale eCommerce, no Logística
const a6 = analizarCV('ANALISTA ADMINISTRATIVO | OPERACIONES COMERCIALES | ECOMMERCE OPERATIONS\nProfesional con experiencia en administración, operaciones comerciales y eCommerce en multinacionales: gestión documental, facturación, órdenes de compra, devoluciones, garantías, cobranzas, conciliación de cuentas. Trabajo transversal con Finanzas, Logística y Comercial.\neCommerce Data Specialist 2020-2026. Coordinación con Finanzas, Logística y Comercial. Ejecutivo de Cuentas, Marketing B2B. SAP, CRM, Excel.')
const nombres6 = a6.bloques.map((b) => b.nombre)
assert.equal(nombres6[0], 'Administración y finanzas'); assert.ok(nombres6.includes('eCommerce')); assert.ok(!nombres6.includes('Logística y operaciones'))
console.log('ok CV administrativo/eCommerce ->', nombres6, a6.palabras_clave)
// Elección manual de rubros
const cvAdm = 'ANALISTA ADMINISTRATIVO | OPERACIONES COMERCIALES | ECOMMERCE OPERATIONS\nFacturación, cobranzas, órdenes de compra, conciliación de cuentas. eCommerce Data Specialist. Coordinación con Logística y Comercial.'
const auto = analizarCV(cvAdm)
assert.equal(auto.elegidas, null)
assert.ok(auto.catalogo.length >= 10 && auto.catalogo[0].id === 'admin' && auto.catalogo[0].sugerido && auto.catalogo[0].automatico)
assert.ok(auto.catalogo.find((c) => c.id === 'ecommerce')!.automatico)
const man = analizarCV(cvAdm, ['logistica', 'ecommerce', 'inexistente', 'logistica', 'salud', 'docencia'])
assert.deepEqual(man.elegidas, ['logistica', 'ecommerce', 'salud']) // sin repetidos ni desconocidos, máximo 3
assert.deepEqual(man.bloques.map((b) => b.nombre).sort(), ['Salud', 'eCommerce', 'Logística y operaciones'].sort())
assert.ok(Object.values(man.palabras_clave).flat().includes('analista de logística'))
assert.ok(man.palabras_clave.admin.length === 0 || man.bloques.some((b) => b.id === 'admin')) // si admin no se eligió, no se busca
assert.ok(man.catalogo.find((c) => c.id === 'admin')!.automatico) // el catálogo sigue mostrando la selección automática
const man2 = analizarCV(cvAdm, ['salud']) // un rubro sin nada en el CV usa sus búsquedas por defecto
assert.deepEqual(man2.palabras_clave.admin.concat(man2.palabras_clave.ia, man2.palabras_clave.odoo), ['enfermero', 'kinesiólogo', 'psicólogo', 'nutricionista'])
assert.equal(analizarCV(cvAdm, []).elegidas, null); assert.equal(analizarCV(cvAdm, ['x']).elegidas, null) // nada válido = automático
console.log('ok elección manual de rubros:', man.bloques.map((b) => b.id + '=' + b.nombre))
console.log('TODAS LAS PRUEBAS PASARON')
