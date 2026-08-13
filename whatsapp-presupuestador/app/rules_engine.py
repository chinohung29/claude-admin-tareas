"""Motor de cálculo determinístico del presupuestador.

Implementa las reglas obligatorias validadas manualmente antes de automatizar esto:
- Usar únicamente datos de las hojas (nunca inventar precio, código o cantidad).
- Precio de venta de los repuestos, nunca el costo.
- Mano de obra según la sucursal pedida.
- Solo los ítems de la receta del trabajo solicitado, sin opcionales.
- Si falta un dato: no cerrar el presupuesto, listar exactamente qué falta y dónde.
- Si hay más de una coincidencia posible (vehículo, tipo de aceite): pedir confirmación,
  nunca elegir por conveniencia o por lo "más común".
Los totales los calcula siempre este módulo, nunca un modelo de lenguaje, para que el
presupuesto no pueda "alucinar" un número.
"""

from decimal import ROUND_HALF_UP, Decimal
from typing import List, Optional

from .models import (
    Ambiguedad,
    LineItem,
    ManoDeObra,
    PresupuestoResult,
    Receta,
    RepuestoCargado,
    Universal,
    Vehiculo,
)


def _d(value) -> Decimal:
    # Pasar por str() antes de Decimal recupera el número "tal como se ve"
    # (ej. 14986.23) en vez de su representación binaria aproximada, que es lo
    # que produce errores de un centavo en cálculos de dinero con float puro.
    return Decimal(str(value))


def _round2(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def buscar_vehiculos(
    vehiculos: List[Vehiculo], marca: str, modelo: str, motor: Optional[str] = None
) -> List[Vehiculo]:
    marca_n, modelo_n = marca.strip().lower(), modelo.strip().lower()
    candidatos = [
        v for v in vehiculos if v.marca.strip().lower() == marca_n and v.modelo.strip().lower() == modelo_n
    ]
    if motor:
        motor_n = motor.strip().lower()
        exactos = [v for v in candidatos if v.motor_informado.strip().lower() == motor_n]
        if exactos:
            return exactos
    return candidatos


def buscar_receta(recetas: List[Receta], trabajo: str) -> Optional[Receta]:
    trabajo_n = trabajo.strip().lower()
    for r in recetas:
        if r.codigo.strip().lower() == trabajo_n or r.trabajo.strip().lower() == trabajo_n:
            return r
    return None


def _repuestos_de_receta(
    repuestos: List[RepuestoCargado], vehiculo_id: str, codigo_trabajo: str
) -> List[RepuestoCargado]:
    return [r for r in repuestos if r.vehiculo_id == vehiculo_id and r.codigo_trabajo == codigo_trabajo]


def _resolver_universal(
    universales: List[Universal],
    vehiculo: Vehiculo,
    categoria_o_texto: str,
    sucursal: str,
) -> "tuple[Optional[Universal], Optional[Ambiguedad], Optional[str]]":
    """Devuelve (universal_elegido, ambiguedad, faltante). Solo uno de los tres es not-None."""
    texto = categoria_o_texto.strip().lower()

    # Caso ya resuelto: el vehículo tiene explícitamente cargado qué universal usar
    # (columna "Tipo de aceite" en la hoja Vehículos, cuando exista).
    if vehiculo.tipo_aceite_id:
        elegido = next((u for u in universales if u.id == vehiculo.tipo_aceite_id), None)
        if elegido is None:
            return None, None, (
                f"El vehículo {vehiculo.id} tiene cargado tipo_aceite_id="
                f"'{vehiculo.tipo_aceite_id}' pero no existe ese ID en la hoja Universales."
            )
        return elegido, None, None

    # Sin columna de resolución: buscamos candidatos por categoría (ej. "Aceite")
    # aplicables a "Todas" las sucursales o a la sucursal pedida.
    candidatos = [
        u
        for u in universales
        if (u.categoria.strip().lower() in texto or texto in u.categoria.strip().lower())
        and u.sucursal.strip().lower() in ("todas", sucursal.strip().lower())
    ]

    if not candidatos:
        return None, None, (
            f"No encontré en la hoja Universales ninguna fila de categoría relacionada con "
            f"'{categoria_o_texto}' aplicable a la sucursal {sucursal}."
        )

    if len(candidatos) > 1:
        opciones = [f"{u.id} - {u.descripcion} (${u.precio_venta_unitario or 0:,.2f}/{u.unidad})" for u in candidatos]
        return None, Ambiguedad(
            campo="universal",
            mensaje=(
                f"La receta pide '{categoria_o_texto}' pero hay más de una opción cargada para "
                f"{vehiculo.marca} {vehiculo.modelo} y ninguna columna indica cuál corresponde. "
                "¿Cuál es la correcta?"
            ),
            opciones=opciones,
        ), None

    return candidatos[0], None, None


def armar_presupuesto(
    *,
    vehiculos: List[Vehiculo],
    recetas: List[Receta],
    repuestos: List[RepuestoCargado],
    universales: List[Universal],
    manos_de_obra: List[ManoDeObra],
    iva_referencia: Optional[float],
    sucursal: str,
    marca: str,
    modelo: str,
    motor: Optional[str],
    trabajo: str,
    universal_override_id: Optional[str] = None,
) -> PresupuestoResult:
    resultado = PresupuestoResult(ok=True, sucursal=sucursal, trabajo=trabajo)

    # 1. Vehículo: cero o múltiples coincidencias bloquean el presupuesto.
    candidatos = buscar_vehiculos(vehiculos, marca, modelo, motor)
    if not candidatos:
        resultado.ok = False
        resultado.faltantes.append(
            f"No hay ningún vehículo '{marca} {modelo}' (motor '{motor or 'no especificado'}') "
            "cargado en la hoja Vehículos piloto. Hay que agregarlo ahí antes de poder cotizar."
        )
        return resultado
    if len(candidatos) > 1:
        resultado.ok = False
        opciones = [f"{v.id} - {v.marca} {v.modelo} {v.motor_informado}" for v in candidatos]
        resultado.ambiguedades.append(
            Ambiguedad(
                campo="vehiculo",
                mensaje=f"Hay más de un '{marca} {modelo}' cargado y el motor no alcanza para distinguirlos.",
                opciones=opciones,
            )
        )
        return resultado
    vehiculo = candidatos[0]
    resultado.vehiculo = vehiculo
    # Si el cliente ya confirmó qué universal (ej. tipo de aceite) corresponde en un
    # turno anterior de la conversación, se aplica acá para esta única resolución
    # (no se persiste en la hoja Vehículos).
    if universal_override_id and not vehiculo.tipo_aceite_id:
        vehiculo.tipo_aceite_id = universal_override_id

    # 2. Receta del trabajo solicitado.
    receta = buscar_receta(recetas, trabajo)
    if receta is None:
        resultado.ok = False
        resultado.faltantes.append(
            f"'{trabajo}' no coincide con ningún código/nombre de trabajo en la hoja Recetas base."
        )
        return resultado

    # 3. Repuestos de la receta para este vehículo puntual.
    items_repuesto = _repuestos_de_receta(repuestos, vehiculo.id, receta.codigo)
    if not items_repuesto:
        resultado.faltantes.append(
            f"No hay filas cargadas en 'Carga repuestos' para {vehiculo.id} / {receta.codigo} "
            f"({receta.trabajo}). Hay que cargar los repuestos de esa receta para ese vehículo."
        )
    for rep in items_repuesto:
        if rep.precio_venta_unitario is None:
            resultado.faltantes.append(
                f"Falta 'Precio venta unitario s/IVA' para '{rep.repuesto}' "
                f"(código {rep.codigo_repuesto}) de {vehiculo.id}/{receta.codigo} en 'Carga repuestos'."
            )
            continue
        resultado.items.append(
            LineItem(
                concepto=rep.repuesto,
                codigo=rep.codigo_repuesto,
                cantidad=rep.cantidad,
                precio_unitario_s_iva=rep.precio_venta_unitario,
                subtotal_s_iva=_round2(_d(rep.cantidad) * _d(rep.precio_venta_unitario)),
            )
        )

    # 4. Universales de la receta (aceite, refrigerante, etc.), si aplican.
    for universal_ref, cantidad, pendiente in (
        (receta.universal_1, receta.cantidad_universal_1, receta.universal_1_pendiente),
        (receta.universal_2, receta.cantidad_universal_2, receta.universal_2_pendiente),
    ):
        if not universal_ref:
            continue
        if pendiente:
            resultado.faltantes.append(
                f"La receta '{receta.codigo}' no tiene definida la cantidad de '{universal_ref}' "
                "(columna 'Cantidad universal' en Recetas base)."
            )
            continue

        elegido, ambiguedad, faltante = _resolver_universal(universales, vehiculo, universal_ref, sucursal)
        if ambiguedad:
            resultado.ambiguedades.append(ambiguedad)
            continue
        if faltante:
            resultado.faltantes.append(faltante)
            continue
        if elegido.precio_venta_unitario is None:
            resultado.faltantes.append(
                f"Falta 'Precio venta unitario s/IVA' para '{elegido.descripcion}' ({elegido.id}) en Universales."
            )
            continue
        resultado.items.append(
            LineItem(
                concepto=elegido.descripcion,
                codigo=elegido.id,
                cantidad=cantidad,
                precio_unitario_s_iva=elegido.precio_venta_unitario,
                subtotal_s_iva=_round2(_d(cantidad) * _d(elegido.precio_venta_unitario)),
            )
        )

    # 5. Mano de obra de la sucursal pedida.
    if receta.horas_mo_pendiente or receta.horas_mo is None:
        resultado.faltantes.append(
            f"La receta '{receta.codigo}' no tiene horas de mano de obra definidas (están como "
            "'a completar' en Recetas base)."
        )
    else:
        mo = next((m for m in manos_de_obra if m.sucursal.strip().lower() == sucursal.strip().lower()), None)
        if mo is None:
            resultado.faltantes.append(f"La sucursal '{sucursal}' no existe en la hoja Mano de obra.")
        elif mo.precio_hora_s_iva is None:
            resultado.faltantes.append(f"Falta 'Precio hora s/IVA' para la sucursal '{sucursal}' en Mano de obra.")
        else:
            resultado.horas_mo = receta.horas_mo
            resultado.valor_hora_s_iva = mo.precio_hora_s_iva
            resultado.valor_hora_c_iva = mo.precio_hora_c_iva
            resultado.total_mo_s_iva = _round2(_d(receta.horas_mo) * _d(mo.precio_hora_s_iva))
            if mo.precio_hora_c_iva is not None:
                resultado.total_mo_c_iva = _round2(_d(receta.horas_mo) * _d(mo.precio_hora_c_iva))

    # 6. Si algo faltó o quedó ambiguo, no se cierra el presupuesto.
    if resultado.faltantes or resultado.ambiguedades:
        resultado.ok = False
        return resultado

    # 7. Totales. IVA solo se aplica explícitamente y se dice de dónde sale.
    subtotal_items_exacto = sum((_d(i.subtotal_s_iva) for i in resultado.items), Decimal("0"))
    resultado.subtotal_items_s_iva = _round2(subtotal_items_exacto)
    total_mo_exacto = _d(resultado.total_mo_s_iva or 0)
    resultado.total_general_s_iva = _round2(subtotal_items_exacto + total_mo_exacto)

    iva = iva_referencia if iva_referencia is not None else None
    resultado.iva_aplicado = iva
    if iva is not None:
        iva_d = _d(iva)
        items_c_iva = subtotal_items_exacto * (Decimal("1") + iva_d)
        mo_c_iva = (
            _d(resultado.total_mo_c_iva)
            if resultado.total_mo_c_iva is not None
            else total_mo_exacto * (Decimal("1") + iva_d)
        )
        resultado.total_general_c_iva = _round2(items_c_iva + mo_c_iva)

    return resultado
