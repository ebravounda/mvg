"""WhatsApp notification helper for mitiendapro.com bot.

Endpoint: POST https://mitiendapro.com/api/v1/send
Headers: Authorization: Bearer <sk_live_...>
Body: {"instanceName": "...", "number": "5491155...", "type": "text", "message": "..."}
"""
import os
import logging
import re
import httpx
from typing import Optional
from dotenv import load_dotenv
from pathlib import Path

# Ensure .env is loaded even if module imported before server.py runs load_dotenv
load_dotenv(Path(__file__).parent / ".env")

logger = logging.getLogger(__name__)


def _env(name: str) -> str:
    return (os.environ.get(name) or "").strip()


def _clean_number(phone: str) -> str:
    """Strip all non-digit chars. Ensures Chile country code if missing."""
    digits = re.sub(r"\D", "", phone or "")
    # If 9-digit Chilean mobile starting with 9, prepend country code 56
    if len(digits) == 9 and digits.startswith("9"):
        digits = "56" + digits
    elif len(digits) == 8:
        digits = "569" + digits
    return digits


def _wa_link(phone: str, message: str) -> str:
    import urllib.parse

    clean = _clean_number(phone)
    text = urllib.parse.quote(message)
    return f"https://wa.me/{clean}?text={text}"


async def send_whatsapp(phone: Optional[str], message: str) -> dict:
    if not phone:
        return {"ok": False, "mode": "no_phone", "detail": "Sin teléfono", "wa_link": None}

    cleaned = _clean_number(phone)
    wa_link = _wa_link(phone, message)

    bot_url = _env("WHATSAPP_BOT_URL")
    bot_token = _env("WHATSAPP_BOT_TOKEN")
    bot_instance = _env("WHATSAPP_BOT_INSTANCE")

    if not bot_url or not bot_token:
        logger.info(f"[WhatsApp:fallback_link] to={cleaned}")
        return {
            "ok": True,
            "mode": "fallback_link",
            "detail": "Webhook no configurado. Usa el link wa.me.",
            "wa_link": wa_link,
        }

    headers = {
        "Authorization": f"Bearer {bot_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "instanceName": bot_instance,
        "number": cleaned,
        "type": "text",
        "message": message,
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.post(bot_url, json=payload, headers=headers)
            if 200 <= res.status_code < 300:
                logger.info(
                    f"[WhatsApp:sent] instance={bot_instance} to={cleaned} status={res.status_code}"
                )
                return {
                    "ok": True,
                    "mode": "sent",
                    "detail": "Mensaje enviado por mitiendapro",
                    "wa_link": wa_link,
                }
            logger.warning(
                f"[WhatsApp:error] to={cleaned} status={res.status_code} body={res.text[:300]}"
            )
            return {
                "ok": False,
                "mode": "error",
                "detail": f"Bot respondió {res.status_code}: {res.text[:120]}",
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
    pin_pads: Optional[list] = None,
    rut: Optional[str] = None,
    razon_social: Optional[str] = None,
    nombre_fantasia: Optional[str] = None,
    comuna: Optional[str] = None,
    region: Optional[str] = None,
    fecha_ejecucion: Optional[str] = None,
) -> str:
    fecha_str = ""
    if fecha_ejecucion:
        fecha_str += f"\n🗓️ Fecha de ejecución: {fecha_ejecucion}"
    if fecha_limite:
        fecha_str += f"\n📅 Fecha límite: {fecha_limite}"

    pp_section = ""
    if pin_pads:
        lines = []
        for i, pp in enumerate(pin_pads, start=1):
            ddll = (pp.get("ddll") or "").strip() or "—"
            serie = (pp.get("serie") or "").strip()
            modelo = (pp.get("modelo") or "").strip()
            extras = []
            if serie:
                extras.append(f"S/N {serie}")
            if modelo:
                extras.append(modelo)
            extra_txt = f" ({' · '.join(extras)})" if extras else ""
            lines.append(f"  {i}. DDLL {ddll}{extra_txt}")
        pp_section = (
            f"\n\n📟 *Pin Pads a actualizar ({len(pin_pads)}):*\n" + "\n".join(lines)
        )

    # --- Bloque comercio ---
    comercio_lines = [f"🏪 *Comercio*"]
    comercio_lines.append(f"  • CC: {codigo_comercio or '—'}")
    if rut:
        comercio_lines.append(f"  • RUT: {rut}")
    razon = razon_social or cliente
    if razon:
        comercio_lines.append(f"  • Razón social: {razon}")
    if nombre_fantasia and nombre_fantasia.strip().lower() != (razon or "").strip().lower():
        comercio_lines.append(f"  • Nombre fantasía: {nombre_fantasia}")
    comercio_block = "\n".join(comercio_lines)

    # --- Bloque dirección ---
    dir_parts = [direccion]
    if comuna:
        dir_parts.append(comuna)
    if region:
        dir_parts.append(region)
    direccion_full = ", ".join([p for p in dir_parts if p])

    return (
        f"🛠️ *Nueva orden asignada*\n\n"
        f"Hola {tecnico_nombre},\n"
        f"Se te asignó la orden *{numero}*.\n\n"
        f"{comercio_block}\n\n"
        f"📍 Dirección: {direccion_full}\n"
        f"⚠️ Prioridad: {prioridad.upper()}"
        f"{fecha_str}"
        f"{pp_section}\n\n"
        f"Ingresa a la app *MVG Computación* para tomar la evidencia."
    )
