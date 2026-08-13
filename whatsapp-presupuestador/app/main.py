import logging

from fastapi import FastAPI, Request, Response

from . import config
from .conversation_flow import handle_incoming_message

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Presupuestador WhatsApp - JustFix")


@app.get("/webhook")
async def verify_webhook(request: Request):
    params = request.query_params
    if params.get("hub.mode") == "subscribe" and params.get("hub.verify_token") == config.META_VERIFY_TOKEN:
        return Response(content=params.get("hub.challenge", ""), media_type="text/plain")
    return Response(status_code=403)


@app.post("/webhook")
async def receive_webhook(request: Request):
    payload = await request.json()
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            for message in value.get("messages", []):
                wa_id = message.get("from")
                texto = _extraer_texto(message)
                if wa_id:
                    await handle_incoming_message(wa_id, texto)
    return {"status": "received"}


def _extraer_texto(message: dict) -> str:
    tipo = message.get("type")
    if tipo == "text":
        return message.get("text", {}).get("body", "")
    if tipo == "interactive":
        interactive = message.get("interactive", {})
        if interactive.get("type") == "list_reply":
            return interactive["list_reply"]["id"]
        if interactive.get("type") == "button_reply":
            return interactive["button_reply"]["id"]
    return ""


@app.get("/health")
async def health():
    return {"status": "ok"}
