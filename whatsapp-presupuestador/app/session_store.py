"""Estado de la conversación por número de WhatsApp.

Implementación en memoria: sirve para probar el flujo, pero se pierde si el
proceso se reinicia y no funciona si corrés más de una instancia del backend
en paralelo. Para producción, reemplazar por Redis o una tabla en la misma
base (una fila por wa_id) sin cambiar la interfaz de las tres funciones de
abajo.
"""

from dataclasses import dataclass, field
from typing import Dict, Optional

ESPERANDO_SUCURSAL = "esperando_sucursal"
ESPERANDO_VEHICULO = "esperando_vehiculo"
ESPERANDO_TRABAJO = "esperando_trabajo"
RESOLVIENDO_AMBIGUEDAD = "resolviendo_ambiguedad"
FINALIZADO = "finalizado"


@dataclass
class Sesion:
    wa_id: str
    paso: str = ESPERANDO_SUCURSAL
    sucursal: Optional[str] = None
    marca: Optional[str] = None
    modelo: Optional[str] = None
    motor: Optional[str] = None
    trabajo: Optional[str] = None
    ambiguedad_pendiente_campo: Optional[str] = None
    universal_override_id: Optional[str] = None


_sesiones: Dict[str, Sesion] = {}


def obtener(wa_id: str) -> Sesion:
    if wa_id not in _sesiones:
        _sesiones[wa_id] = Sesion(wa_id=wa_id)
    return _sesiones[wa_id]


def reiniciar(wa_id: str) -> Sesion:
    _sesiones[wa_id] = Sesion(wa_id=wa_id)
    return _sesiones[wa_id]


def guardar(sesion: Sesion) -> None:
    _sesiones[sesion.wa_id] = sesion
