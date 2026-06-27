"""WhatsApp notification helper.

Sends notifications via a configurable webhook (mitiendapro.com style bot).
If WHATSAPP_BOT_URL is empty, just logs the intended message.
"""
import os
import logging
import httpx
from typing import Optional

logger = logging.getLogger(__name__)

WHATSAPP_BOT_URL = os.environ.get("WHATSAPP_BOT_URL", "").strip()
WHATSAPP_BOT_TOKEN = os.environ.get("WHATSAPP_BOT_TOKEN", "").strip()


def _wa_link(phone: str, message: str) -> str:
    import urllib.parse

    clean = "".join(ch for ch in phone if ch.isdigit())
    text = urllib.parse.quote(message)
    return f"https://wa.me/{clean}?text={text}"


async def send_whatsapp(phone: Optional[str], message: str) -> dict:
    """Send a WhatsApp message. Always returns a dict with {ok, mode, detail, wa_link}.

    Modes:
      - "sent": webhook responded 2xx
      - "fallback_link": no URL configured, returns wa.me link
      - "error": webhook failed (still returns wa.me link as fallback)
    """
    if not phone:
        return {"ok": False, "mode": "no_phone", "detail": "Sin teléfono", "wa_link": None}

    wa_link = _wa_link(phone, message)

    if not WHATSAPP_BOT_URL:
        logger.info(f"[WhatsApp:fallback_link] to={phone}")
        return {
            "ok": True,
            "mode": "fallback_link",
            "detail": "Webhook no configurado. Usa el link wa.me.",
            "wa_link": wa_link,
        }

    headers = {"Content-Type": "application/json"}
    if WHATSAPP_BOT_TOKEN:
        headers["Authorization"] = f"Bearer {WHATSAPP_BOT_TOKEN}"

    payload = {"to": phone, "phone": phone, "message": message, "text": message}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(WHATSAPP_BOT_URL, json=payload, headers=headers)
            if 200 <= res.status_code < 300:
                logger.info(f"[WhatsApp:sent] to={phone} status={res.status_code}")
                return {
                    "ok": True,
                    "mode": "sent",
                    "detail": "Mensaje enviado",
                    "wa_link": wa_link,
                }
            logger.warning(
                f"[WhatsApp:error] to={phone} status={res.status_code} body={res.text[:200]}"
            )
            return {
                "ok": False,
                "mode": "error",
                "detail": f"Bot respondió {res.status_code}",
                "wa_link": wa_link,
            }
    except Exception as e:
        logger.exception("WhatsApp send failed")
        return {
            "ok": False,
            "mode": "error",
            "detail": f"Error de red: {str(e)[:120]}",
            "wa_link": wa_link,
        }


def build_assignment_message(
    tecnico_nombre: str,
    numero: str,
    cliente: str,
    comercio: str,
    codigo_comercio: str,
    direccion: str,
    prioridad: str,
    fecha_limite: Optional[str],
) -> str:
    fecha_str = ""
    if fecha_limite:
        fecha_str = f"\n📅 Fecha límite: {fecha_limite}"
    return (
        f"🛠️ *Nueva orden asignada*\n\n"
        f"Hola {tecnico_nombre},\n"
        f"Se te asignó la orden *{numero}*.\n\n"
        f"🏢 Cliente: {cliente}\n"
        f"🏪 Comercio: {comercio} (CC {codigo_comercio})\n"
        f"📍 Dirección: {direccion}\n"
        f"⚠️ Prioridad: {prioridad.upper()}"
        f"{fecha_str}\n\n"
        f"Ingresa a la app *MVG Computación* para ver el detalle y tomar la evidencia."
    )
