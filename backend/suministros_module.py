"""Suministros (supplies) module for MVG Computación.

Provides:
- Productos (master catalog: SKU + descripción)
- Bodegas (warehouses)
- Inventario por técnico (stock per technician per SKU)
- Solicitudes de suministros (supply requests from technicians)
- Consumos de materiales (materials used per pin pad in evidence)
- Config (destination emails + WhatsApp phones)

All endpoints are mounted under /api/admin/* and /api/tecnico/*.
"""
import os
import uuid
import logging
import asyncio
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from email_service import send_email, build_supply_email_html
from whatsapp_service import send_whatsapp

logger = logging.getLogger(__name__)

router = APIRouter()


# ===================== Models =====================

class ProductoCreate(BaseModel):
    sku: str
    descripcion: str
    categoria: Optional[str] = None
    comentario: Optional[str] = None


class ProductoUpdate(BaseModel):
    descripcion: Optional[str] = None
    categoria: Optional[str] = None
    comentario: Optional[str] = None


class BodegaCreate(BaseModel):
    nombre: str
    region: Optional[str] = None
    direccion: Optional[str] = None


class BodegaUpdate(BaseModel):
    nombre: Optional[str] = None
    region: Optional[str] = None
    direccion: Optional[str] = None


class SuministroItem(BaseModel):
    sku: str
    descripcion: str
    cantidad: int = Field(gt=0)
    comentario: Optional[str] = None


class SolicitudCreate(BaseModel):
    items: List[SuministroItem] = Field(min_length=1)
    notas: Optional[str] = None
    urgencia: str = Field(default="normal", pattern="^(normal|media|alta)$")


class ConfigUpdate(BaseModel):
    emails_destino: Optional[List[str]] = None
    telefonos_destino: Optional[List[str]] = None
    from_email: Optional[str] = None


class InventarioSet(BaseModel):
    """Set/upsert stock for a tecnico+sku."""
    tecnico_id: str
    sku: str
    cantidad: int = Field(ge=0)


class ConsumoItem(BaseModel):
    sku: str
    cantidad: int = Field(gt=0)


class ConsumoCreate(BaseModel):
    orden_id: str
    pin_pad_idx: Optional[int] = None
    items: List[ConsumoItem] = Field(min_length=1)


# ===================== Helpers =====================

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# Default product seed (from user's image)
SEED_PRODUCTOS = [
    {"sku": "5143019", "descripcion": "VX520 TRIO 3G CTLS B2B 26.10", "categoria": "Pin Pad"},
    {"sku": "500646", "descripcion": "Cable Serial VX 805 6 mts.", "categoria": "Cable"},
    {"sku": "5273002", "descripcion": "VX805 Estándar 26.10", "categoria": "Pin Pad"},
    {"sku": "500610", "descripcion": "CABLE CONEXION USB VX 805 3MTS.", "categoria": "Cable"},
    {"sku": "200020", "descripcion": "COMPROBANTE UNICO DE EQUIPO", "categoria": "Insumo"},
]

SEED_BODEGAS = [
    {"nombre": "Iquique", "region": "I Región"},
    {"nombre": "Antofagasta", "region": "II Región"},
    {"nombre": "Calama", "region": "II Región"},
    {"nombre": "Copiapó", "region": "III Región"},
    {"nombre": "La Serena", "region": "IV Región"},
    {"nombre": "Viña del Mar", "region": "V Región"},
    {"nombre": "Rancagua", "region": "VI Región"},
    {"nombre": "Talca", "region": "VII Región"},
    {"nombre": "Concepción", "region": "VIII Región"},
    {"nombre": "Los Ángeles", "region": "VIII Región"},
    {"nombre": "Temuco", "region": "IX Región"},
    {"nombre": "Puerto Montt", "region": "X Región"},
    {"nombre": "Osorno", "region": "X Región"},
    {"nombre": "Castro", "region": "X Región"},
    {"nombre": "Coyhaique", "region": "XI Región"},
    {"nombre": "Punta Arenas", "region": "XII Región"},
    {"nombre": "Santiago", "region": "Región Metropolitana"},
    {"nombre": "Valdivia", "region": "XIV Región"},
    {"nombre": "Arica", "region": "XV Región"},
    {"nombre": "Chillán", "region": "XVI Región"},
]

DEFAULT_CONFIG = {
    "emails_destino": [],
    "telefonos_destino": [],
    "from_email": os.environ.get("RESEND_FROM_EMAIL", "onboarding@resend.dev"),
}


async def init_suministros(db) -> None:
    """Seed productos + bodegas + config on startup if collections empty."""
    productos_col = db.productos
    bodegas_col = db.bodegas
    config_col = db.suministros_config

    if await productos_col.count_documents({}) == 0:
        for p in SEED_PRODUCTOS:
            await productos_col.insert_one({
                "id": str(uuid.uuid4()),
                "sku": p["sku"],
                "descripcion": p["descripcion"],
                "categoria": p.get("categoria"),
                "comentario": None,
                "created_at": now_iso(),
            })
        logger.info("[Suministros] Seeded %d productos", len(SEED_PRODUCTOS))

    # Bodegas: upsert by name so re-runs add missing ones without dupes
    for b in SEED_BODEGAS:
        existing = await bodegas_col.find_one({"nombre": b["nombre"]})
        if not existing:
            await bodegas_col.insert_one({
                "id": str(uuid.uuid4()),
                "nombre": b["nombre"],
                "region": b.get("region"),
                "direccion": None,
                "created_at": now_iso(),
            })
    logger.info("[Suministros] Bodegas synced (%d total)", len(SEED_BODEGAS))

    if await config_col.count_documents({}) == 0:
        await config_col.insert_one({"_id": "singleton", **DEFAULT_CONFIG})
        logger.info("[Suministros] Initialized config singleton")


async def get_config(db) -> dict:
    config_col = db.suministros_config
    doc = await config_col.find_one({"_id": "singleton"})
    if not doc:
        doc = {"_id": "singleton", **DEFAULT_CONFIG}
        await config_col.insert_one(doc)
    doc.pop("_id", None)
    return doc


# ===================== Endpoints =====================

def build_router(db, require_admin, require_user):
    """Factory that injects DB + auth dependencies and returns the router."""

    productos_col = db.productos
    bodegas_col = db.bodegas
    users_col = db.users
    solicitudes_col = db.solicitudes_suministros
    inventario_col = db.inventario_tecnico
    consumos_col = db.consumos_materiales
    config_col = db.suministros_config

    # ---------------- Productos ----------------
    @router.get("/admin/productos")
    async def list_productos(_: dict = Depends(require_admin)):
        cursor = productos_col.find({}, {"_id": 0}).sort("descripcion", 1)
        return await cursor.to_list(1000)

    @router.post("/admin/productos", status_code=201)
    async def create_producto(p: ProductoCreate, _: dict = Depends(require_admin)):
        existing = await productos_col.find_one({"sku": p.sku.strip()})
        if existing:
            raise HTTPException(400, "SKU ya existe")
        doc = {
            "id": str(uuid.uuid4()),
            "sku": p.sku.strip(),
            "descripcion": p.descripcion.strip(),
            "categoria": p.categoria,
            "comentario": p.comentario,
            "created_at": now_iso(),
        }
        await productos_col.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.patch("/admin/productos/{producto_id}")
    async def update_producto(
        producto_id: str, p: ProductoUpdate, _: dict = Depends(require_admin)
    ):
        update = {k: v for k, v in p.model_dump().items() if v is not None}
        if not update:
            raise HTTPException(400, "Sin cambios")
        r = await productos_col.update_one({"id": producto_id}, {"$set": update})
        if r.matched_count == 0:
            raise HTTPException(404, "Producto no encontrado")
        return await productos_col.find_one({"id": producto_id}, {"_id": 0})

    @router.delete("/admin/productos/{producto_id}")
    async def delete_producto(producto_id: str, _: dict = Depends(require_admin)):
        r = await productos_col.delete_one({"id": producto_id})
        if r.deleted_count == 0:
            raise HTTPException(404, "Producto no encontrado")
        return {"ok": True}

    # Technician can see catalog
    @router.get("/tecnico/productos")
    async def list_productos_tecnico(_: dict = Depends(require_user)):
        cursor = productos_col.find({}, {"_id": 0}).sort("descripcion", 1)
        return await cursor.to_list(1000)

    # ---------------- Bodegas ----------------
    @router.get("/admin/bodegas")
    async def list_bodegas(_: dict = Depends(require_admin)):
        cursor = bodegas_col.find({}, {"_id": 0}).sort("nombre", 1)
        return await cursor.to_list(500)

    @router.post("/admin/bodegas", status_code=201)
    async def create_bodega(b: BodegaCreate, _: dict = Depends(require_admin)):
        doc = {
            "id": str(uuid.uuid4()),
            "nombre": b.nombre.strip(),
            "region": b.region,
            "direccion": b.direccion,
            "created_at": now_iso(),
        }
        await bodegas_col.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.patch("/admin/bodegas/{bodega_id}")
    async def update_bodega(
        bodega_id: str, b: BodegaUpdate, _: dict = Depends(require_admin)
    ):
        update = {k: v for k, v in b.model_dump().items() if v is not None}
        if not update:
            raise HTTPException(400, "Sin cambios")
        r = await bodegas_col.update_one({"id": bodega_id}, {"$set": update})
        if r.matched_count == 0:
            raise HTTPException(404, "Bodega no encontrada")
        return await bodegas_col.find_one({"id": bodega_id}, {"_id": 0})

    @router.delete("/admin/bodegas/{bodega_id}")
    async def delete_bodega(bodega_id: str, _: dict = Depends(require_admin)):
        # safety: prevent deleting a bodega that has technicians assigned
        users_using = await users_col.count_documents({"bodega_id": bodega_id})
        if users_using:
            raise HTTPException(
                400, f"Hay {users_using} técnico(s) asignado(s) a esta bodega"
            )
        r = await bodegas_col.delete_one({"id": bodega_id})
        if r.deleted_count == 0:
            raise HTTPException(404, "Bodega no encontrada")
        return {"ok": True}

    # ---------------- Config ----------------
    @router.get("/admin/suministros/config")
    async def get_suministros_config(_: dict = Depends(require_admin)):
        return await get_config(db)

    @router.patch("/admin/suministros/config")
    async def patch_suministros_config(
        payload: ConfigUpdate, _: dict = Depends(require_admin)
    ):
        update = {k: v for k, v in payload.model_dump().items() if v is not None}
        if not update:
            raise HTTPException(400, "Sin cambios")
        # Normalize / clean
        if "emails_destino" in update:
            update["emails_destino"] = [
                e.strip() for e in update["emails_destino"] if e and e.strip()
            ]
        if "telefonos_destino" in update:
            update["telefonos_destino"] = [
                t.strip().lstrip("+") for t in update["telefonos_destino"] if t and t.strip()
            ]
        await config_col.update_one(
            {"_id": "singleton"}, {"$set": update}, upsert=True
        )
        return await get_config(db)

    # ---------------- Solicitudes ----------------
    async def _enrich_solicitud(s: dict) -> dict:
        if s.get("tecnico_id"):
            tec = await users_col.find_one(
                {"id": s["tecnico_id"]},
                {"_id": 0, "hashed_password": 0},
            )
            s["tecnico"] = tec
            if tec and tec.get("bodega_id"):
                bod = await bodegas_col.find_one({"id": tec["bodega_id"]}, {"_id": 0})
                s["bodega"] = bod
        return s

    @router.post("/tecnico/suministros/solicitudes", status_code=201)
    async def create_solicitud(
        payload: SolicitudCreate, current: dict = Depends(require_user)
    ):
        if current.get("role") != "tecnico":
            raise HTTPException(403, "Sólo técnicos pueden crear solicitudes")
        sol = {
            "id": str(uuid.uuid4()),
            "tecnico_id": current["id"],
            "items": [it.model_dump() for it in payload.items],
            "notas": payload.notas,
            "urgencia": payload.urgencia,
            "estado": "pendiente",
            "fecha": now_iso(),
            "email_result": None,
            "whatsapp_results": [],
        }
        await solicitudes_col.insert_one(sol)
        sol.pop("_id", None)

        # Send notifications (best effort, non-blocking on error)
        cfg = await get_config(db)
        bodega_doc = None
        if current.get("bodega_id"):
            bodega_doc = await bodegas_col.find_one(
                {"id": current["bodega_id"]}, {"_id": 0}
            )

        nombre_completo = f"{current.get('nombre', '')} {current.get('apellidos', '')}".strip()
        bodega_label = bodega_doc.get("nombre") if bodega_doc else "Sin bodega"
        region_label = bodega_doc.get("region") if bodega_doc else ""
        try:
            fecha_legible = datetime.fromisoformat(sol["fecha"]).strftime(
                "%d-%m-%Y %H:%M"
            )
        except Exception:
            fecha_legible = sol["fecha"]

        html, text = build_supply_email_html(
            tecnico_nombre=nombre_completo,
            tecnico_email=current.get("email", ""),
            tecnico_telefono=current.get("telefono", ""),
            bodega=bodega_label,
            region=region_label,
            items=sol["items"],
            notas=payload.notas,
            urgencia=payload.urgencia,
            fecha=fecha_legible,
        )

        # Dynamic subject: "Solicitud de suministros - Técnico X - Región X - Ciudad X"
        subject_parts = [f"Solicitud de suministros - Técnico {nombre_completo or 'sin nombre'}"]
        if region_label:
            subject_parts.append(f"Región {region_label}")
        if bodega_label and bodega_label != "Sin bodega":
            subject_parts.append(f"Ciudad {bodega_label}")
        email_subject = " - ".join(subject_parts)

        email_result = None
        if cfg.get("emails_destino"):
            email_result = await send_email(
                to=cfg["emails_destino"],
                subject=email_subject,
                html=html,
                text=text,
                from_email=cfg.get("from_email"),
            )

        wa_results = []
        if cfg.get("telefonos_destino"):
            # build a compact WhatsApp message
            items_lines = "\n".join(
                [
                    f"• SKU {it['sku']} · {it['descripcion']} · Cant: {it['cantidad']}"
                    + (f" · {it['comentario']}" if it.get('comentario') else "")
                    for it in sol["items"]
                ]
            )
            wa_msg = (
                f"📦 *Solicitud de suministros MVG*\n\n"
                f"👤 Técnico: *{nombre_completo}*\n"
                f"📞 {current.get('telefono', '—')}\n"
                f"📍 Región: {region_label or '—'}\n"
                f"🏪 Ciudad/Bodega: {bodega_label}\n"
                f"🚩 Urgencia: *{payload.urgencia.upper()}*\n"
                f"📅 {fecha_legible}\n\n"
                f"*Productos solicitados:*\n{items_lines}"
            )
            if payload.notas:
                wa_msg += f"\n\n📝 Notas: {payload.notas}"

            for phone in cfg["telefonos_destino"]:
                try:
                    res = await send_whatsapp(phone, wa_msg)
                    wa_results.append({"to": phone, **res})
                except Exception as e:
                    logger.exception("[Suministros WA] error %s", e)
                    wa_results.append({"to": phone, "mode": "error", "error": str(e)})

        # Persist results
        await solicitudes_col.update_one(
            {"id": sol["id"]},
            {"$set": {"email_result": email_result, "whatsapp_results": wa_results}},
        )
        sol["email_result"] = email_result
        sol["whatsapp_results"] = wa_results

        return await _enrich_solicitud(sol)

    @router.get("/tecnico/suministros/solicitudes")
    async def list_my_solicitudes(current: dict = Depends(require_user)):
        if current.get("role") != "tecnico":
            raise HTTPException(403, "Sólo técnicos")
        cursor = solicitudes_col.find(
            {"tecnico_id": current["id"]}, {"_id": 0}
        ).sort("fecha", -1)
        results = await cursor.to_list(500)
        for s in results:
            await _enrich_solicitud(s)
        return results

    @router.get("/admin/suministros/solicitudes")
    async def list_all_solicitudes(
        estado: Optional[str] = Query(None), _: dict = Depends(require_admin)
    ):
        q: dict = {}
        if estado:
            q["estado"] = estado
        cursor = solicitudes_col.find(q, {"_id": 0}).sort("fecha", -1)
        results = await cursor.to_list(1000)
        for s in results:
            await _enrich_solicitud(s)
        return results

    @router.patch("/admin/suministros/solicitudes/{sol_id}")
    async def update_solicitud_estado(
        sol_id: str, estado: str = Query(...), _: dict = Depends(require_admin)
    ):
        if estado not in ("pendiente", "atendida", "rechazada"):
            raise HTTPException(400, "Estado inválido")
        r = await solicitudes_col.update_one(
            {"id": sol_id},
            {"$set": {"estado": estado, "fecha_atencion": now_iso()}},
        )
        if r.matched_count == 0:
            raise HTTPException(404, "Solicitud no encontrada")
        s = await solicitudes_col.find_one({"id": sol_id}, {"_id": 0})
        return await _enrich_solicitud(s)

    @router.post("/admin/suministros/solicitudes/{sol_id}/reenviar")
    async def reenviar_solicitud(sol_id: str, _: dict = Depends(require_admin)):
        """Re-send email + WhatsApp for an existing solicitud."""
        sol = await solicitudes_col.find_one({"id": sol_id}, {"_id": 0})
        if not sol:
            raise HTTPException(404, "Solicitud no encontrada")
        tec = await users_col.find_one(
            {"id": sol["tecnico_id"]}, {"_id": 0, "hashed_password": 0}
        )
        if not tec:
            raise HTTPException(404, "Técnico no encontrado")
        bodega_doc = None
        if tec.get("bodega_id"):
            bodega_doc = await bodegas_col.find_one(
                {"id": tec["bodega_id"]}, {"_id": 0}
            )
        cfg = await get_config(db)
        nombre_completo = f"{tec.get('nombre','')} {tec.get('apellidos','')}".strip()
        bodega_label = bodega_doc.get("nombre") if bodega_doc else "Sin bodega"
        region_label = bodega_doc.get("region") if bodega_doc else ""
        try:
            fecha_legible = datetime.fromisoformat(sol["fecha"]).strftime(
                "%d-%m-%Y %H:%M"
            )
        except Exception:
            fecha_legible = sol["fecha"]
        html, text = build_supply_email_html(
            tecnico_nombre=nombre_completo,
            tecnico_email=tec.get("email", ""),
            tecnico_telefono=tec.get("telefono", ""),
            bodega=bodega_label,
            region=region_label,
            items=sol["items"],
            notas=sol.get("notas"),
            urgencia=sol.get("urgencia", "normal"),
            fecha=fecha_legible,
        )
        subject_parts = [f"Solicitud de suministros (reenvío) - Técnico {nombre_completo or 'sin nombre'}"]
        if region_label:
            subject_parts.append(f"Región {region_label}")
        if bodega_label and bodega_label != "Sin bodega":
            subject_parts.append(f"Ciudad {bodega_label}")
        email_subject = " - ".join(subject_parts)
        email_result = None
        if cfg.get("emails_destino"):
            email_result = await send_email(
                to=cfg["emails_destino"],
                subject=email_subject,
                html=html,
                text=text,
                from_email=cfg.get("from_email"),
            )
        wa_results = []
        if cfg.get("telefonos_destino"):
            items_lines = "\n".join(
                [
                    f"• SKU {it['sku']} · {it['descripcion']} · Cant: {it['cantidad']}"
                    for it in sol["items"]
                ]
            )
            wa_msg = (
                f"📦 *Reenvío - Solicitud de suministros MVG*\n\n"
                f"👤 {nombre_completo}\n"
                f"🏪 Bodega: {bodega_label}\n"
                f"📅 {fecha_legible}\n\n"
                f"{items_lines}"
            )
            for phone in cfg["telefonos_destino"]:
                try:
                    res = await send_whatsapp(phone, wa_msg)
                    wa_results.append({"to": phone, **res})
                except Exception as e:
                    wa_results.append({"to": phone, "mode": "error", "error": str(e)})
        await solicitudes_col.update_one(
            {"id": sol_id},
            {"$set": {"email_result": email_result, "whatsapp_results": wa_results}},
        )
        sol["email_result"] = email_result
        sol["whatsapp_results"] = wa_results
        return await _enrich_solicitud(sol)

    # ---------------- Inventario (PHASE 2) ----------------
    @router.get("/admin/inventario")
    async def list_inventario(
        tecnico_id: Optional[str] = Query(None), _: dict = Depends(require_admin)
    ):
        q = {}
        if tecnico_id:
            q["tecnico_id"] = tecnico_id
        cursor = inventario_col.find(q, {"_id": 0})
        items = await cursor.to_list(5000)
        # enrich with tecnico + producto
        for it in items:
            tec = await users_col.find_one(
                {"id": it["tecnico_id"]},
                {"_id": 0, "hashed_password": 0},
            )
            it["tecnico"] = tec
            prod = await productos_col.find_one({"sku": it["sku"]}, {"_id": 0})
            it["producto"] = prod
        return items

    @router.post("/admin/inventario")
    async def set_inventario(payload: InventarioSet, _: dict = Depends(require_admin)):
        # validate tecnico + producto
        tec = await users_col.find_one(
            {"id": payload.tecnico_id, "role": "tecnico"}
        )
        if not tec:
            raise HTTPException(404, "Técnico no encontrado")
        prod = await productos_col.find_one({"sku": payload.sku.strip()})
        if not prod:
            raise HTTPException(404, "Producto/SKU no encontrado")
        existing = await inventario_col.find_one(
            {"tecnico_id": payload.tecnico_id, "sku": payload.sku.strip()}
        )
        if existing:
            await inventario_col.update_one(
                {"id": existing["id"]},
                {"$set": {"cantidad": payload.cantidad, "updated_at": now_iso()}},
            )
            doc = await inventario_col.find_one(
                {"id": existing["id"]}, {"_id": 0}
            )
            return doc
        doc = {
            "id": str(uuid.uuid4()),
            "tecnico_id": payload.tecnico_id,
            "sku": payload.sku.strip(),
            "descripcion": prod.get("descripcion"),
            "cantidad": payload.cantidad,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        await inventario_col.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.delete("/admin/inventario/{inv_id}")
    async def delete_inventario(inv_id: str, _: dict = Depends(require_admin)):
        r = await inventario_col.delete_one({"id": inv_id})
        if r.deleted_count == 0:
            raise HTTPException(404, "Item no encontrado")
        return {"ok": True}

    # Technician sees their own stock
    @router.get("/tecnico/inventario")
    async def my_inventario(current: dict = Depends(require_user)):
        if current.get("role") != "tecnico":
            raise HTTPException(403, "Sólo técnicos")
        cursor = inventario_col.find(
            {"tecnico_id": current["id"], "cantidad": {"$gt": 0}}, {"_id": 0}
        )
        items = await cursor.to_list(2000)
        return items

    # ---------------- Consumos (materiales usados en evidencia) ----------------
    @router.post("/tecnico/consumos", status_code=201)
    async def create_consumo(
        payload: ConsumoCreate, current: dict = Depends(require_user)
    ):
        """Register materials consumed by tecnico for an order/pinpad.
        Deducts stock automatically. Allows negative stock (warning)
        but logs a flag.
        """
        if current.get("role") != "tecnico":
            raise HTTPException(403, "Sólo técnicos")
        results = []
        for item in payload.items:
            inv = await inventario_col.find_one(
                {"tecnico_id": current["id"], "sku": item.sku.strip()}
            )
            prod = await productos_col.find_one({"sku": item.sku.strip()})
            descripcion = prod.get("descripcion") if prod else None
            new_qty = (inv["cantidad"] if inv else 0) - item.cantidad
            warn = False
            if new_qty < 0:
                warn = True
                logger.warning(
                    "[Consumo] tecnico=%s sku=%s -> stock negativo (%s)",
                    current["id"], item.sku, new_qty,
                )
            if inv:
                await inventario_col.update_one(
                    {"id": inv["id"]},
                    {"$set": {"cantidad": new_qty, "updated_at": now_iso()}},
                )
            else:
                # create row at the negative quantity to keep history
                await inventario_col.insert_one({
                    "id": str(uuid.uuid4()),
                    "tecnico_id": current["id"],
                    "sku": item.sku.strip(),
                    "descripcion": descripcion,
                    "cantidad": new_qty,
                    "created_at": now_iso(),
                    "updated_at": now_iso(),
                })
            results.append({
                "sku": item.sku, "cantidad_consumida": item.cantidad,
                "nuevo_stock": new_qty, "negativo": warn,
            })
        consumo = {
            "id": str(uuid.uuid4()),
            "tecnico_id": current["id"],
            "orden_id": payload.orden_id,
            "pin_pad_idx": payload.pin_pad_idx,
            "items": [it.model_dump() for it in payload.items],
            "results": results,
            "fecha": now_iso(),
        }
        await consumos_col.insert_one(consumo)
        consumo.pop("_id", None)
        return consumo

    @router.get("/admin/consumos")
    async def list_consumos(
        orden_id: Optional[str] = Query(None),
        tecnico_id: Optional[str] = Query(None),
        _: dict = Depends(require_admin),
    ):
        q = {}
        if orden_id:
            q["orden_id"] = orden_id
        if tecnico_id:
            q["tecnico_id"] = tecnico_id
        cursor = consumos_col.find(q, {"_id": 0}).sort("fecha", -1)
        items = await cursor.to_list(2000)
        # enrich tecnico
        for it in items:
            tec = await users_col.find_one(
                {"id": it["tecnico_id"]},
                {"_id": 0, "hashed_password": 0},
            )
            it["tecnico"] = tec
        return items

    return router
