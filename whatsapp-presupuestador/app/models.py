from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class Vehiculo:
    id: str
    marca: str
    modelo: str
    motor_informado: str
    codigo_motor: Optional[str] = None
    # Columna opcional "Tipo de aceite" en la hoja Vehículos (ID de fila en Universales,
    # ej "UNI-002"). Hoy esa columna no existe en el piloto: mientras no se cargue,
    # el motor de reglas trata el aceite como ambiguo y pide confirmación.
    tipo_aceite_id: Optional[str] = None


@dataclass
class Receta:
    codigo: str
    trabajo: str
    repuestos_incluidos: str
    universal_1: Optional[str]
    cantidad_universal_1: Optional[float]
    universal_1_pendiente: bool
    universal_2: Optional[str]
    cantidad_universal_2: Optional[float]
    universal_2_pendiente: bool
    horas_mo: Optional[float]
    horas_mo_pendiente: bool


@dataclass
class RepuestoCargado:
    vehiculo_id: str
    marca: str
    modelo: str
    motor: str
    codigo_trabajo: str
    trabajo: str
    repuesto: str
    cantidad: float
    unidad: str
    codigo_repuesto: str
    precio_venta_unitario: Optional[float]


@dataclass
class Universal:
    id: str
    categoria: str
    descripcion: str
    sucursal: str
    unidad: str
    precio_venta_unitario: Optional[float]
    # Cantidad de referencia para el vehículo pedido. En el piloto esta columna
    # se llama literalmente "Cantidad ref. Kangoo" porque solo hay un vehículo
    # cargado: ver nota en sheets_client.load_universales.
    cantidad_referencia: Optional[float]


@dataclass
class ManoDeObra:
    sucursal: str
    precio_hora_s_iva: Optional[float]
    precio_hora_c_iva: Optional[float]


@dataclass
class LineItem:
    concepto: str
    codigo: str
    cantidad: float
    precio_unitario_s_iva: float
    subtotal_s_iva: float


@dataclass
class Ambiguedad:
    campo: str  # "vehiculo" | "aceite" | ...
    mensaje: str
    opciones: List[str] = field(default_factory=list)


@dataclass
class PresupuestoResult:
    ok: bool
    vehiculo: Optional[Vehiculo] = None
    sucursal: Optional[str] = None
    trabajo: Optional[str] = None
    items: List[LineItem] = field(default_factory=list)
    horas_mo: Optional[float] = None
    valor_hora_s_iva: Optional[float] = None
    valor_hora_c_iva: Optional[float] = None
    total_mo_s_iva: Optional[float] = None
    total_mo_c_iva: Optional[float] = None
    subtotal_items_s_iva: Optional[float] = None
    total_general_s_iva: Optional[float] = None
    total_general_c_iva: Optional[float] = None
    iva_aplicado: Optional[float] = None
    faltantes: List[str] = field(default_factory=list)
    ambiguedades: List[Ambiguedad] = field(default_factory=list)
