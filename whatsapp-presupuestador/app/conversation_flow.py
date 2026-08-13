"""Máquina de estados de la conversación de WhatsApp.

Deliberadamente NO usa un LLM para decidir marca/modelo/motor/trabajo: usa listas
interactivas y matching por texto contra las hojas, para no depender de que un
modelo de lenguaje "entienda bien" el pedido. Esto es justamente lo que evita el
tipo de error (inventar o adivinar) que vimos al probar el cálculo a mano.
"""

import logging
from typing import List

from . import sheets_client
from .formatting import calculo_interno, mensaje_cliente, solicitud_repuestos
from .models import Vehiculo
from .rules_engine import armar_presupuesto
from .session_store import (
    ESPERANDO_SUCURSAL,
    ESPERANDO_TRABAJO,
    ESPERANDO_VEHICULO,
    RESOLVIENDO_AMBIGUEDAD,
    Sesion,
    guardar,
    obtener,
    reiniciar,
)
from .whatsapp_api import send_list, send_text

logger = logging.getLogger("presupuestador")


def _notificar_comercial(texto: str) -> None:
    # TODO: reemplazar por envío real (email, Slack, etc.) usando
    # config.COMERCIAL_NOTIFY_EMAIL. Por ahora solo queda en el log del backend
    # para no perder la traza mientras se define el canal definitivo.
    logger.info("SOLICITUD A REPUESTOS/COMERCIAL:\n%s", texto)


def _match_vehiculos_en_texto(texto: str, vehiculos: List[Vehiculo]) -> List[Vehiculo]:
    texto_n = texto.lower()
    candidatos = [v for v in vehiculos if v.marca.lower() in texto_n and v.modelo.lower() in texto_n]
    if len(candidatos) > 1:
        # Si el texto además menciona el motor exacto de alguno, nos quedamos con ese.
        motor_exacto = [v for v in candidatos if v.motor_informado.lower() in texto_n]
        if motor_exacto:
            return motor_exacto
    return candidatos


async def handle_incoming_message(wa_id: str, texto: str) -> None:
    texto = (texto or "").strip()
    sesion = obtener(wa_id)

    if texto.lower() in ("hola", "buenas", "presupuesto", "start"):
        sesion = reiniciar(wa_id)

    if sesion.paso == ESPERANDO_SUCURSAL:
        await _pedir_sucursal(sesion)
        return

    if sesion.paso == ESPERANDO_VEHICULO and sesion.sucursal is None:
        # Vino de la lista de sucursales: texto es el id (slug) elegido.
        sucursales = {s.sucursal.lower().replace(" ", "_"): s.sucursal for s in sheets_client.load_mano_de_obra()}
        elegido = sucursales.get(texto)
        if not elegido:
            await send_text(wa_id, "No reconocí esa sucursal, elegí una de la lista por favor.")
            await _pedir_sucursal(sesion)
            return
        sesion.sucursal = elegido
        guardar(sesion)
        await send_text(
            wa_id,
            "Contame marca, modelo y motor de tu vehículo (ej: 'Renault Kangoo 1.6 SCe').",
        )
        return

    if sesion.paso == ESPERANDO_VEHICULO:
        vehiculos = sheets_client.load_vehiculos()
        candidatos = _match_vehiculos_en_texto(texto, vehiculos)
        if not candidatos:
            await send_text(
                wa_id,
                "No encontré ese vehículo en nuestra base. ¿Podés confirmarme marca y modelo exactos? "
                "Si el problema persiste, te derivo con un comercial.",
            )
            return
        if len(candidatos) > 1:
            opciones = [f"{v.marca} {v.modelo} {v.motor_informado}" for v in candidatos]
            await send_list(
                wa_id,
                header="Confirmá el vehículo",
                body="Encontré más de una coincidencia, elegí la correcta:",
                button_text="Elegir",
                options=opciones,
            )
            return
        vehiculo = candidatos[0]
        sesion.marca, sesion.modelo, sesion.motor = vehiculo.marca, vehiculo.modelo, vehiculo.motor_informado
        sesion.paso = ESPERANDO_TRABAJO
        guardar(sesion)
        await _pedir_trabajo(sesion)
        return

    if sesion.paso == ESPERANDO_TRABAJO:
        recetas = sheets_client.load_recetas()
        trabajo = next((r for r in recetas if r.trabajo.lower().replace(" ", "_") == texto.lower()), None)
        if trabajo is None:
            trabajo = next((r for r in recetas if r.trabajo.lower() in texto.lower()), None)
        if trabajo is None:
            await send_text(wa_id, "No reconocí ese trabajo, elegí una opción de la lista por favor.")
            await _pedir_trabajo(sesion)
            return
        sesion.trabajo = trabajo.trabajo
        guardar(sesion)
        await _calcular_y_responder(sesion)
        return

    if sesion.paso == RESOLVIENDO_AMBIGUEDAD:
        await _resolver_ambiguedad(sesion, texto)
        return

    # Estado inesperado: reiniciamos la conversación.
    reiniciar(wa_id)
    await _pedir_sucursal(obtener(wa_id))


async def _pedir_sucursal(sesion: Sesion) -> None:
    sucursales = [m.sucursal for m in sheets_client.load_mano_de_obra()]
    sesion.paso = ESPERANDO_VEHICULO  # el próximo mensaje entrante es la respuesta a esta lista
    guardar(sesion)
    await send_list(
        sesion.wa_id,
        header="Presupuestador JustFix",
        body="¡Hola! ¿En qué sucursal vas a hacer el service?",
        button_text="Elegir sucursal",
        options=sucursales,
    )


async def _pedir_trabajo(sesion: Sesion) -> None:
    trabajos = [r.trabajo for r in sheets_client.load_recetas()]
    await send_list(
        sesion.wa_id,
        header="Trabajo solicitado",
        body="¿Qué trabajo necesitás presupuestar?",
        button_text="Elegir trabajo",
        options=trabajos,
    )


async def _calcular_y_responder(sesion: Sesion) -> None:
    vehiculos = sheets_client.load_vehiculos()
    recetas = sheets_client.load_recetas()
    repuestos = sheets_client.load_repuestos()
    universales = sheets_client.load_universales()
    manos_de_obra = sheets_client.load_mano_de_obra()
    iva_ref = sheets_client.load_iva_referencia()

    resultado = armar_presupuesto(
        vehiculos=vehiculos,
        recetas=recetas,
        repuestos=repuestos,
        universales=universales,
        manos_de_obra=manos_de_obra,
        iva_referencia=iva_ref,
        sucursal=sesion.sucursal,
        marca=sesion.marca,
        modelo=sesion.modelo,
        motor=sesion.motor,
        trabajo=sesion.trabajo,
        universal_override_id=sesion.universal_override_id,
    )

    logger.info("Cálculo interno para %s:\n%s", sesion.wa_id, calculo_interno(resultado))

    if resultado.ambiguedades:
        ambiguedad = resultado.ambiguedades[0]
        sesion.ambiguedad_pendiente_campo = ambiguedad.campo
        sesion.paso = RESOLVIENDO_AMBIGUEDAD
        guardar(sesion)
        await send_list(
            sesion.wa_id,
            header="Necesito confirmar un dato",
            body=ambiguedad.mensaje,
            button_text="Elegir",
            options=ambiguedad.opciones,
        )
        return

    if not resultado.ok:
        _notificar_comercial(solicitud_repuestos(resultado))
        await send_text(sesion.wa_id, mensaje_cliente(resultado))
        reiniciar(sesion.wa_id)
        return

    await send_text(sesion.wa_id, mensaje_cliente(resultado))
    reiniciar(sesion.wa_id)


async def _resolver_ambiguedad(sesion: Sesion, texto: str) -> None:
    campo = sesion.ambiguedad_pendiente_campo
    if campo == "vehiculo":
        vehiculos = sheets_client.load_vehiculos()
        # El id de la opción es "marca_modelo_motor" en minúsculas (ver whatsapp_api._slug).
        elegido = next(
            (v for v in vehiculos if f"{v.marca}_{v.modelo}_{v.motor_informado}".lower().replace(" ", "_") == texto),
            None,
        )
        if elegido is None:
            await send_text(sesion.wa_id, "No reconocí esa opción, elegí una de la lista por favor.")
            return
        sesion.marca, sesion.modelo, sesion.motor = elegido.marca, elegido.modelo, elegido.motor_informado
        sesion.paso = ESPERANDO_TRABAJO
        guardar(sesion)
        await _pedir_trabajo(sesion)
        return

    if campo == "universal":
        # La opción elegida trae el ID del universal al principio (ej. "uni-002_-_aceite_5w-30_...").
        universales = sheets_client.load_universales()
        elegido = next((u for u in universales if texto.startswith(u.id.lower())), None)
        if elegido is None:
            await send_text(sesion.wa_id, "No reconocí esa opción, elegí una de la lista por favor.")
            return
        # Se guarda en la sesión (no se muta el objeto Vehiculo directamente: cada
        # llamada a _calcular_y_responder recarga las hojas desde cero, así que
        # cualquier mutación en memoria se perdería). armar_presupuesto aplica este
        # override puntualmente en cada corrida.
        sesion.universal_override_id = elegido.id
        # NOTA: esto no persiste en la hoja Vehículos. Si esta ambigüedad se repite
        # seguido para el mismo vehículo, conviene cargar la columna "Tipo de aceite"
        # en la hoja real para dejar de preguntar.
        guardar(sesion)
        if sesion.trabajo:
            await _calcular_y_responder(sesion)
        else:
            sesion.paso = ESPERANDO_TRABAJO
            guardar(sesion)
            await _pedir_trabajo(sesion)
        return

    await send_text(sesion.wa_id, "Disculpá, hubo un problema interno. Te derivo con un comercial.")
    reiniciar(sesion.wa_id)
