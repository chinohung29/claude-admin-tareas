"""Arma los tres textos de salida a partir de un PresupuestoResult:
cálculo interno, mensaje para el cliente y solicitud a Repuestos/Comercial."""

from .models import PresupuestoResult


def _money(value) -> str:
    if value is None:
        return "-"
    return f"${value:,.2f}".replace(",", "@").replace(".", ",").replace("@", ".")


def calculo_interno(r: PresupuestoResult) -> str:
    if not r.vehiculo:
        return "Sin vehículo resuelto."
    lineas = [
        f"Vehículo: {r.vehiculo.marca} {r.vehiculo.modelo} ({r.vehiculo.motor_informado}) - {r.vehiculo.id}",
        f"Sucursal: {r.sucursal} | Trabajo: {r.trabajo}",
        "",
        "Concepto | Código | Cant. | Precio unit. s/IVA | Subtotal",
    ]
    for item in r.items:
        lineas.append(
            f"{item.concepto} | {item.codigo} | {item.cantidad} | "
            f"{_money(item.precio_unitario_s_iva)} | {_money(item.subtotal_s_iva)}"
        )
    if r.horas_mo is not None:
        lineas.append("")
        lineas.append(
            f"Mano de obra: {r.horas_mo} hs x {_money(r.valor_hora_s_iva)}/h = {_money(r.total_mo_s_iva)}"
        )
    if r.ok:
        lineas.append("")
        lineas.append(f"Total general s/IVA: {_money(r.total_general_s_iva)}")
        if r.total_general_c_iva is not None:
            lineas.append(f"Total general c/IVA ({r.iva_aplicado:.0%}): {_money(r.total_general_c_iva)}")
    else:
        lineas.append("")
        lineas.append("PRESUPUESTO NO CERRADO — ver solicitud a Repuestos/Comercial.")
    return "\n".join(lineas)


def mensaje_cliente(r: PresupuestoResult) -> str:
    if not r.ok or not r.vehiculo:
        return (
            "¡Hola! Ya tomé los datos de tu vehículo y el trabajo solicitado. "
            "Estoy confirmando el detalle con el equipo y te paso el presupuesto en breve."
        )
    v = r.vehiculo
    items_txt = "\n".join(f"• {i.concepto}" for i in r.items)
    total = r.total_general_c_iva if r.total_general_c_iva is not None else r.total_general_s_iva
    iva_txt = "IVA incluido" if r.total_general_c_iva is not None else "precio sin IVA"
    return (
        f"¡Hola! Te paso el presupuesto de {r.trabajo} para tu {v.marca} {v.modelo} "
        f"({v.motor_informado}) – Sucursal {r.sucursal}:\n\n"
        f"Incluye:\n{items_txt}\n• Mano de obra ({r.horas_mo} hs)\n\n"
        f"💰 Total: {_money(total)} ({iva_txt})\n\n"
        "Cualquier consulta, estamos a disposición."
    )


def solicitud_repuestos(r: PresupuestoResult) -> str:
    if r.ok:
        return ""
    partes = ["Solicitud automática — faltan datos para cerrar un presupuesto:"]
    if r.vehiculo:
        partes.append(f"Vehículo: {r.vehiculo.id} - {r.vehiculo.marca} {r.vehiculo.modelo}")
    partes.append(f"Sucursal: {r.sucursal} | Trabajo pedido: {r.trabajo}")
    for f in r.faltantes:
        partes.append(f"- FALTA: {f}")
    for a in r.ambiguedades:
        partes.append(f"- AMBIGÜEDAD ({a.campo}): {a.mensaje} Opciones: {', '.join(a.opciones)}")
    return "\n".join(partes)
