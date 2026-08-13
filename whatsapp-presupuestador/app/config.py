import os

from dotenv import load_dotenv

load_dotenv()


def _require(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Falta la variable de entorno {name} (ver .env.example)")
    return value


META_WHATSAPP_TOKEN = _require("META_WHATSAPP_TOKEN")
META_PHONE_NUMBER_ID = _require("META_PHONE_NUMBER_ID")
META_VERIFY_TOKEN = _require("META_VERIFY_TOKEN")
META_GRAPH_API_VERSION = os.environ.get("META_GRAPH_API_VERSION", "v21.0")

GOOGLE_SERVICE_ACCOUNT_FILE = _require("GOOGLE_SERVICE_ACCOUNT_FILE")
GOOGLE_SHEET_ID = _require("GOOGLE_SHEET_ID")

IVA_DEFAULT = float(os.environ.get("IVA_DEFAULT", "0.21"))

COMERCIAL_NOTIFY_EMAIL = os.environ.get("COMERCIAL_NOTIFY_EMAIL", "")
