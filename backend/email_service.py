"""Email service using Resend HTTP API.

Async-compatible. Never raises on send failure - returns a result dict.
"""
import os
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL", "onboarding@resend.dev")


async def send_email(
    to: list[str],
    subject: str,
    html: str,
    text: Optional[str] = None,
    from_email: Optional[str] = None,
) -> dict:
    """Send a transactional email via Resend.

    Returns a dict with keys: mode (sent/error/disabled), recipients, error, id.
    """
    if not RESEND_API_KEY:
        logger.warning("[Email] RESEND_API_KEY not configured - skipping send")
        return {"mode": "disabled", "recipients": to, "error": "API key missing"}
    recipients = [t.strip() for t in to if t and t.strip()]
    if not recipients:
        return {"mode": "no_recipients", "recipients": [], "error": "Sin destinatarios"}
    payload = {
        "from": from_email or RESEND_FROM_EMAIL,
        "to": recipients,
        "subject": subject,
        "html": html,
    }
    if text:
        payload["text"] = text
    headers = {
        "Authorization": f"Bearer {RESEND_API_KEY}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(RESEND_API_URL, headers=headers, json=payload)
        if r.status_code >= 400:
            logger.warning(
                "[Email:error] status=%s body=%s", r.status_code, r.text[:300]
            )
            return {
                "mode": "error",
                "recipients": recipients,
                "error": f"HTTP {r.status_code}: {r.text[:200]}",
            }
        data = r.json()
        logger.info("[Email:sent] id=%s to=%s", data.get("id"), recipients)
        return {
            "mode": "sent",
            "recipients": recipients,
            "id": data.get("id"),
        }
    except Exception as e:
        logger.exception("[Email] exception sending email: %s", e)
        return {"mode": "error", "recipients": recipients, "error": str(e)}


def build_supply_email_html(
    tecnico_nombre: str,
    tecnico_email: str,
    tecnico_telefono: str,
    bodega: str,
    region: str = "",
    items: list[dict] = None,
    notas: Optional[str] = None,
    urgencia: str = "normal",
    fecha: str = "",
) -> tuple[str, str]:
    """Returns (html, text) for a supply request email.

    items: list of {sku, descripcion, cantidad, comentario?}
    """
    items_rows = ""
    items_text = ""
    items = items or []
    for it in items:
        items_rows += f"""
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:10px 12px;font-family:monospace;color:#475569;font-size:13px;">{it.get('sku', '—')}</td>
          <td style="padding:10px 12px;color:#0f172a;font-size:14px;">{it.get('descripcion', '')}</td>
          <td style="padding:10px 12px;text-align:center;font-weight:700;color:#f97316;font-size:15px;">{it.get('cantidad', 0)}</td>
          <td style="padding:10px 12px;color:#64748b;font-size:13px;">{it.get('comentario') or ''}</td>
        </tr>"""
        items_text += f"  • SKU {it.get('sku')} · {it.get('descripcion')} · Cantidad: {it.get('cantidad')}"
        if it.get('comentario'):
            items_text += f" · {it.get('comentario')}"
        items_text += "\n"

    urgencia_badge_color = {
        "alta": "#dc2626",
        "media": "#d97706",
        "normal": "#059669",
    }.get(urgencia, "#059669")

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fb;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 12px rgba(15,23,42,0.06);">
        <tr><td style="background:#0f172a;padding:24px 32px;">
          <h1 style="color:#fff;font-size:18px;margin:0;font-weight:700;letter-spacing:0.3px;">MVG Computación</h1>
          <p style="color:#94a3b8;font-size:13px;margin:4px 0 0 0;">Solicitud de suministros</p>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <div style="display:inline-block;padding:5px 12px;background:{urgencia_badge_color}1a;border:1px solid {urgencia_badge_color};color:{urgencia_badge_color};border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:14px;">Urgencia: {urgencia}</div>
          <h2 style="color:#0f172a;font-size:20px;margin:0 0 6px 0;">Nueva solicitud de un técnico</h2>
          <p style="color:#64748b;font-size:13px;margin:0 0 22px 0;">{fecha}</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border-collapse:collapse;background:#f8fafc;border-radius:8px;">
            <tr>
              <td style="padding:10px 14px;color:#64748b;font-size:12px;font-weight:600;width:40%;">TÉCNICO</td>
              <td style="padding:10px 14px;color:#0f172a;font-size:14px;">{tecnico_nombre}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;color:#64748b;font-size:12px;font-weight:600;border-top:1px solid #e2e8f0;">REGIÓN</td>
              <td style="padding:10px 14px;color:#0f172a;font-size:14px;border-top:1px solid #e2e8f0;">{region or '—'}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;color:#64748b;font-size:12px;font-weight:600;border-top:1px solid #e2e8f0;">CIUDAD / BODEGA</td>
              <td style="padding:10px 14px;color:#0f172a;font-size:14px;border-top:1px solid #e2e8f0;">{bodega or '—'}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;color:#64748b;font-size:12px;font-weight:600;border-top:1px solid #e2e8f0;">EMAIL</td>
              <td style="padding:10px 14px;color:#0f172a;font-size:14px;border-top:1px solid #e2e8f0;">{tecnico_email}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;color:#64748b;font-size:12px;font-weight:600;border-top:1px solid #e2e8f0;">TELÉFONO</td>
              <td style="padding:10px 14px;color:#0f172a;font-size:14px;border-top:1px solid #e2e8f0;">{tecnico_telefono or '—'}</td>
            </tr>
          </table>

          <h3 style="color:#0f172a;font-size:14px;margin:0 0 10px 0;text-transform:uppercase;letter-spacing:0.5px;">Productos solicitados ({len(items)})</h3>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;border-collapse:collapse;">
            <tr style="background:#f1f5f9;">
              <th style="padding:10px 12px;text-align:left;color:#475569;font-size:11px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;">SKU</th>
              <th style="padding:10px 12px;text-align:left;color:#475569;font-size:11px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;">Descripción</th>
              <th style="padding:10px 12px;text-align:center;color:#475569;font-size:11px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;">Cant.</th>
              <th style="padding:10px 12px;text-align:left;color:#475569;font-size:11px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;">Comentario</th>
            </tr>
            {items_rows}
          </table>

          {'<div style="margin-top:20px;padding:14px;background:#fef3c7;border:1px solid #fde68a;border-radius:8px;"><strong style="color:#92400e;font-size:13px;display:block;margin-bottom:4px;">NOTAS DEL TÉCNICO</strong><p style="color:#78350f;font-size:13px;margin:0;">' + (notas or '') + '</p></div>' if notas else ''}

        </td></tr>
        <tr><td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
          <p style="color:#94a3b8;font-size:11px;margin:0;text-align:center;">Este es un mensaje automático del sistema MVG Computación. No respondas a este correo.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""

    text = f"""MVG Computación - Solicitud de suministros
======================================
Fecha: {fecha}
Urgencia: {urgencia.upper()}

TÉCNICO: {tecnico_nombre}
Región: {region or '—'}
Ciudad/Bodega: {bodega or '—'}
Email: {tecnico_email}
Teléfono: {tecnico_telefono or '—'}

PRODUCTOS SOLICITADOS ({len(items)}):
{items_text}
"""
    if notas:
        text += f"\nNOTAS: {notas}\n"

    return html, text
