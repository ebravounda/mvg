"""PDF generation for órdenes de servicio MVG."""
import base64
import io
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors as rcolors
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    Image as RLImage,
    PageBreak,
)


PRIMARY = rcolors.HexColor("#2563EB")
ACCENT = rcolors.HexColor("#F97316")
DARK = rcolors.HexColor("#0F172A")
MUTED = rcolors.HexColor("#64748B")


def _fmt_dt(iso: str) -> str:
    if not iso:
        return "—"
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime(
            "%d-%m-%Y %H:%M"
        )
    except Exception:
        return iso


def _b64_to_image(b64: str, max_w_cm: float = 14):
    if not b64:
        return None
    try:
        data = b64.split(",", 1)[-1]
        raw = base64.b64decode(data)
        img = RLImage(io.BytesIO(raw))
        ratio = img.imageHeight / max(img.imageWidth, 1)
        img.drawWidth = max_w_cm * cm
        img.drawHeight = max_w_cm * cm * ratio
        return img
    except Exception:
        return None


def build_orden_pdf(orden: dict, cliente: dict, sucursal: dict, tecnico: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=1.6 * cm,
        bottomMargin=1.6 * cm,
        title=f"Orden {orden.get('numero', '')}",
    )
    styles = getSampleStyleSheet()
    H1 = ParagraphStyle(
        "H1",
        parent=styles["Heading1"],
        textColor=DARK,
        fontSize=20,
        spaceAfter=4,
    )
    H2 = ParagraphStyle(
        "H2",
        parent=styles["Heading2"],
        textColor=PRIMARY,
        fontSize=12,
        spaceBefore=14,
        spaceAfter=6,
    )
    NORMAL = ParagraphStyle(
        "N", parent=styles["BodyText"], fontSize=10, leading=14, textColor=DARK
    )
    MUTED_STYLE = ParagraphStyle(
        "M", parent=styles["BodyText"], fontSize=9, textColor=MUTED
    )

    elements = []

    # Header
    title_table = Table(
        [
            [
                Paragraph(
                    "<b>MVG Computación</b><br/><font size=9>Orden de servicio</font>",
                    NORMAL,
                ),
                Paragraph(
                    f"<para align='right'><b>{orden.get('numero', '')}</b><br/>"
                    f"<font size=9>{_fmt_dt(orden.get('created_at', ''))}</font></para>",
                    NORMAL,
                ),
            ]
        ],
        colWidths=[10 * cm, 7 * cm],
    )
    title_table.setStyle(
        TableStyle(
            [
                ("LINEBELOW", (0, 0), (-1, -1), 1.5, PRIMARY),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    elements.append(title_table)
    elements.append(Spacer(1, 6))

    # Title + estado
    estado = orden.get("estado", "pendiente").replace("_", " ").upper()
    elements.append(Paragraph(orden.get("titulo", ""), H1))
    elements.append(
        Paragraph(
            f"Estado: <b>{estado}</b> &nbsp;·&nbsp; "
            f"Prioridad: <b>{(orden.get('prioridad') or '').upper()}</b> &nbsp;·&nbsp; "
            f"Fecha límite: <b>{orden.get('fecha_limite') or '—'}</b>",
            MUTED_STYLE,
        )
    )

    # Cliente / Comercio
    elements.append(Paragraph("Cliente y Comercio", H2))
    info_rows = [
        ["Cliente", cliente.get("nombre_fantasia") or cliente.get("nombre", "—")],
        ["Razón social", cliente.get("nombre", "—")],
        ["RUT", cliente.get("rut") or "—"],
        ["Código de comercio (CC)", sucursal.get("codigo_comercio", "—")],
        ["Dirección", sucursal.get("direccion") or "—"],
        ["Comuna / Región", f"{sucursal.get('comuna') or '—'} / {sucursal.get('region') or '—'}"],
    ]
    t = Table(info_rows, colWidths=[5 * cm, 12 * cm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), rcolors.HexColor("#F1F5F9")),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("BOX", (0, 0), (-1, -1), 0.5, rcolors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, rcolors.HexColor("#CBD5E1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    elements.append(t)

    # Tecnico
    elements.append(Paragraph("Técnico asignado", H2))
    if tecnico:
        tec_rows = [
            ["Nombre", f"{tecnico.get('nombre', '')} {tecnico.get('apellidos', '')}"],
            ["RUT", tecnico.get("rut") or "—"],
            ["Email", tecnico.get("email") or "—"],
            ["Teléfono", tecnico.get("telefono") or "—"],
        ]
        tt = Table(tec_rows, colWidths=[5 * cm, 12 * cm])
        tt.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (0, -1), rcolors.HexColor("#F1F5F9")),
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("BOX", (0, 0), (-1, -1), 0.5, rcolors.HexColor("#CBD5E1")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.5, rcolors.HexColor("#CBD5E1")),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ]
            )
        )
        elements.append(tt)
    else:
        elements.append(Paragraph("Sin técnico asignado", MUTED_STYLE))

    # Descripcion
    if orden.get("descripcion"):
        elements.append(Paragraph("Descripción del trabajo", H2))
        elements.append(Paragraph(orden["descripcion"], NORMAL))

    # Timeline
    elements.append(Paragraph("Historial", H2))
    hist_rows = [
        ["Creada", _fmt_dt(orden.get("created_at"))],
        ["Iniciada", _fmt_dt(orden.get("started_at"))],
        ["Finalizada", _fmt_dt(orden.get("finalized_at"))],
    ]
    h = Table(hist_rows, colWidths=[5 * cm, 12 * cm])
    h.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), rcolors.HexColor("#F1F5F9")),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("BOX", (0, 0), (-1, -1), 0.5, rcolors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, rcolors.HexColor("#CBD5E1")),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    elements.append(h)

    # Pin Pads / Equipos
    pin_pads = orden.get("pin_pads") or []
    elements.append(Paragraph(f"Pin Pads del comercio ({len(pin_pads)})", H2))

    if not pin_pads:
        # Legacy single-pinpad ordenes
        legacy = {
            "serie": orden.get("serie"),
            "modelo": orden.get("modelo"),
            "ddll": orden.get("ddll"),
            "evidencia_base64": orden.get("evidencia_base64"),
            "notas": orden.get("notas_tecnico"),
            "completed_at": orden.get("finalized_at"),
            "completed": orden.get("estado") == "finalizada",
        }
        if legacy.get("serie") or legacy.get("evidencia_base64"):
            pin_pads = [legacy]

    for idx, pp in enumerate(pin_pads, start=1):
        head = (
            f"<b>Pin Pad #{idx}</b> · Serie: <b>{pp.get('serie') or '—'}</b> · "
            f"DDLL: <b>{pp.get('ddll') or '—'}</b> · Modelo: {pp.get('modelo') or '—'}"
        )
        elements.append(Spacer(1, 6))
        elements.append(Paragraph(head, NORMAL))
        status_txt = "✓ Actualizado" if pp.get("completed") else "Pendiente"
        if pp.get("completed_at"):
            status_txt += f" · {_fmt_dt(pp.get('completed_at'))}"
        elements.append(Paragraph(status_txt, MUTED_STYLE))
        if pp.get("notas"):
            elements.append(Paragraph(f"Notas: {pp.get('notas')}", MUTED_STYLE))
        img = _b64_to_image(pp.get("evidencia_base64"))
        if img:
            elements.append(Spacer(1, 4))
            elements.append(img)

    # Footer
    elements.append(Spacer(1, 18))
    elements.append(
        Paragraph(
            f"<para align='center'><font size=8 color='#94A3B8'>"
            f"MVG Computación · Documento generado el "
            f"{datetime.now().strftime('%d-%m-%Y %H:%M')}</font></para>",
            NORMAL,
        )
    )

    doc.build(elements)
    return buf.getvalue()
