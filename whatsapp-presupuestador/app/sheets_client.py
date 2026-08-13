"""Lectura de la base de datos del presupuestador desde Google Sheets.

El spreadsheet debe tener las mismas 5 hojas y encabezados que el Excel piloto:
"Vehiculos piloto", "Recetas base", "Carga repuestos", "Universales", "Mano de obra".
Solo se lee (nunca se escribe) para no pisar la carga manual del equipo.
"""

from typing import Dict, List, Optional

import gspread
from google.oauth2.service_account import Credentials

from . import config
from .models import ManoDeObra, Receta, RepuestoCargado, Universal, Vehiculo

SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]

_client = None


def _get_client():
    global _client
    if _client is None:
        creds = Credentials.from_service_account_file(
            config.GOOGLE_SERVICE_ACCOUNT_FILE, scopes=SCOPES
        )
        _client = gspread.authorize(creds)
    return _client


def _rows(sheet_name: str) -> List[List[str]]:
    sheet = _get_client().open_by_key(config.GOOGLE_SHEET_ID)
    worksheet = sheet.worksheet(sheet_name)
    return worksheet.get_all_values()


def _find_header(rows: List[List[str]], must_contain: str):
    for i, row in enumerate(rows):
        if must_contain in row:
            return i, {name: pos for pos, name in enumerate(row) if name}
    raise ValueError(
        f"No encontré una fila de encabezado con la columna '{must_contain}'. "
        "Revisá que la hoja no haya cambiado de estructura."
    )


def _cell(row: List[str], idx: Dict[str, int], column: str) -> str:
    pos = idx.get(column)
    if pos is None or pos >= len(row):
        return ""
    return row[pos].strip()


def _to_float(raw: Optional[str]) -> Optional[float]:
    text = (raw or "").strip()
    if not text:
        return None
    if _looks_es_number(text):
        # "10.616,50" (miles con punto, decimales con coma) -> "10616.50"
        text = text.replace(".", "").replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def _looks_es_number(text: str) -> bool:
    # Heurística simple: si tiene coma decimal, lo tratamos como número en
    # formato es-AR ("10.616,50"). Si solo tiene punto, lo dejamos tal cual
    # (Google Sheets suele exportar números ya en formato "10616.5").
    return "," in text


def load_vehiculos() -> List[Vehiculo]:
    rows = _rows("Vehiculos piloto")
    header_idx, idx = _find_header(rows, "ID vehículo")
    tiene_tipo_aceite = "Tipo de aceite" in idx
    vehiculos = []
    for row in rows[header_idx + 1 :]:
        vid = _cell(row, idx, "ID vehículo")
        if not vid.startswith("VEH-"):
            continue
        vehiculos.append(
            Vehiculo(
                id=vid,
                marca=_cell(row, idx, "Marca"),
                modelo=_cell(row, idx, "Modelo"),
                motor_informado=_cell(row, idx, "Motor informado"),
                codigo_motor=_cell(row, idx, "Código motor exacto") or None,
                tipo_aceite_id=(_cell(row, idx, "Tipo de aceite") or None) if tiene_tipo_aceite else None,
            )
        )
    return vehiculos


def load_recetas() -> List[Receta]:
    rows = _rows("Recetas base")
    header_idx, idx = _find_header(rows, "Código")
    recetas = []
    for row in rows[header_idx + 1 :]:
        codigo = _cell(row, idx, "Código")
        if not codigo:
            continue
        universal_1 = _cell(row, idx, "Universal 1") or None
        cant1_raw = _cell(row, idx, "Cantidad universal 1")
        cant1 = _to_float(cant1_raw)
        universal_2 = _cell(row, idx, "Universal 2") or None
        cant2_raw = _cell(row, idx, "Cantidad universal 2")
        cant2 = _to_float(cant2_raw)
        horas_raw = _cell(row, idx, "Horas MO")
        horas = _to_float(horas_raw)
        recetas.append(
            Receta(
                codigo=codigo,
                trabajo=_cell(row, idx, "Trabajo"),
                repuestos_incluidos=_cell(row, idx, "Repuestos incluidos"),
                universal_1=universal_1,
                cantidad_universal_1=cant1,
                universal_1_pendiente=bool(universal_1) and cant1 is None,
                universal_2=universal_2,
                cantidad_universal_2=cant2,
                universal_2_pendiente=bool(universal_2) and cant2 is None,
                horas_mo=horas,
                horas_mo_pendiente=horas is None and bool(horas_raw),
            )
        )
    return recetas


def load_repuestos() -> List[RepuestoCargado]:
    rows = _rows("Carga repuestos")
    header_idx, idx = _find_header(rows, "ID vehículo")
    repuestos = []
    for row in rows[header_idx + 1 :]:
        vid = _cell(row, idx, "ID vehículo")
        if not vid.startswith("VEH-"):
            continue
        repuestos.append(
            RepuestoCargado(
                vehiculo_id=vid,
                marca=_cell(row, idx, "Marca"),
                modelo=_cell(row, idx, "Modelo"),
                motor=_cell(row, idx, "Motor"),
                codigo_trabajo=_cell(row, idx, "Código trabajo"),
                trabajo=_cell(row, idx, "Trabajo"),
                repuesto=_cell(row, idx, "Repuesto"),
                cantidad=_to_float(_cell(row, idx, "Cantidad")) or 0.0,
                unidad=_cell(row, idx, "Unidad"),
                codigo_repuesto=_cell(row, idx, "Código repuesto"),
                precio_venta_unitario=_to_float(_cell(row, idx, "Precio venta unitario s/IVA")),
            )
        )
    return repuestos


def load_universales() -> List[Universal]:
    rows = _rows("Universales")
    header_idx, idx = _find_header(rows, "ID")
    # NOTA: en el piloto la columna de cantidad se llama literalmente
    # "Cantidad ref. Kangoo" porque solo hay un vehículo cargado. Antes de sumar
    # el segundo vehículo con consumo de aceite distinto, esa columna tiene que
    # generalizarse (ej. una hoja aparte "Vehículo x Universal x Cantidad").
    columna_cantidad = "Cantidad ref. Kangoo" if "Cantidad ref. Kangoo" in idx else None
    universales = []
    for row in rows[header_idx + 1 :]:
        uid = _cell(row, idx, "ID")
        if not uid:
            continue
        universales.append(
            Universal(
                id=uid,
                categoria=_cell(row, idx, "Categoría"),
                descripcion=_cell(row, idx, "Descripción"),
                sucursal=_cell(row, idx, "Sucursal"),
                unidad=_cell(row, idx, "Unidad"),
                precio_venta_unitario=_to_float(_cell(row, idx, "Precio venta unitario s/IVA")),
                cantidad_referencia=_to_float(_cell(row, idx, columna_cantidad)) if columna_cantidad else None,
            )
        )
    return universales


def load_mano_de_obra() -> List[ManoDeObra]:
    rows = _rows("Mano de obra")
    header_idx, idx = _find_header(rows, "Sucursal")
    resultado = []
    for row in rows[header_idx + 1 :]:
        sucursal = _cell(row, idx, "Sucursal")
        if not sucursal:
            continue
        resultado.append(
            ManoDeObra(
                sucursal=sucursal,
                precio_hora_s_iva=_to_float(_cell(row, idx, "Precio hora s/IVA")),
                precio_hora_c_iva=_to_float(_cell(row, idx, "Precio hora c/IVA")),
            )
        )
    return resultado


def load_iva_referencia() -> Optional[float]:
    rows = _rows("Mano de obra")
    for row in rows:
        if row and row[0].strip().lower().startswith("iva de referencia"):
            valor = _to_float(row[1]) if len(row) > 1 else None
            return valor
    return None
