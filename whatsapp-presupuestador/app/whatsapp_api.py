"""Cliente mínimo de la API de Meta (WhatsApp Business Cloud API)."""

from typing import List

import httpx

from . import config

_BASE_URL = f"https://graph.facebook.com/{config.META_GRAPH_API_VERSION}/{config.META_PHONE_NUMBER_ID}/messages"
_HEADERS = {
    "Authorization": f"Bearer {config.META_WHATSAPP_TOKEN}",
    "Content-Type": "application/json",
}


async def send_text(to: str, body: str) -> None:
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": body},
    }
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(_BASE_URL, headers=_HEADERS, json=payload)
        resp.raise_for_status()


async def send_list(to: str, header: str, body: str, button_text: str, options: List[str]) -> None:
    """Lista interactiva (hasta 10 opciones). `options` son textos visibles;
    el id que vuelve en la respuesta del usuario es el mismo texto en minúsculas
    sin espacios, para simplificar el parseo en conversation_flow."""
    rows = [
        {"id": _slug(opt), "title": opt[:24]}
        for opt in options[:10]
    ]
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "interactive",
        "interactive": {
            "type": "list",
            "header": {"type": "text", "text": header[:60]},
            "body": {"text": body[:1024]},
            "action": {"button": button_text[:20], "sections": [{"title": "Opciones", "rows": rows}]},
        },
    }
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(_BASE_URL, headers=_HEADERS, json=payload)
        resp.raise_for_status()


def _slug(text: str) -> str:
    return text.strip().lower().replace(" ", "_")[:200]
