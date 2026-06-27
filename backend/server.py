import os
import uuid
import logging
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Form
from fastapi.security import OAuth2PasswordBearer
from starlette.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from jose import jwt, JWTError
from pydantic import BaseModel, EmailStr, Field
import openpyxl
import io

from whatsapp_service import send_whatsapp, build_assignment_message
from pdf_service import build_orden_pdf
from fastapi.responses import StreamingResponse

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ----------------- Config -----------------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
JWT_EXPIRES_MINUTES = int(os.environ.get("JWT_EXPIRES_MINUTES", "1440"))
ADMIN_EMAIL = os.environ["ADMIN_EMAIL"]
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]
ADMIN_NOMBRE = os.environ.get("ADMIN_NOMBRE", "Admin")
ADMIN_APELLIDOS = os.environ.get("ADMIN_APELLIDOS", "MVG")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# ----------------- DB -----------------
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

users_col = db.users
clientes_col = db.clientes
sucursales_col = db.sucursales
ordenes_col = db.ordenes

# ----------------- Auth utils -----------------
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        return False


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRES_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ----------------- Models -----------------
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class UserPublic(BaseModel):
    id: str
    email: EmailStr
    role: str
    nombre: str
    apellidos: str
    rut: Optional[str] = None
    telefono: Optional[str] = None


class TecnicoCreate(BaseModel):
    rut: str
    nombre: str
    apellidos: str
    email: EmailStr
    telefono: str
    password: str = Field(min_length=6)


class TecnicoUpdate(BaseModel):
    rut: Optional[str] = None
    nombre: Optional[str] = None
    apellidos: Optional[str] = None
    email: Optional[EmailStr] = None
    telefono: Optional[str] = None
    password: Optional[str] = None


class ClienteCreate(BaseModel):
    nombre: str
    nombre_fantasia: Optional[str] = None
    rut: Optional[str] = None
    contacto: Optional[str] = None
    email: Optional[EmailStr] = None
    telefono: Optional[str] = None
    direccion: Optional[str] = None


class ClienteUpdate(BaseModel):
    nombre: Optional[str] = None
    nombre_fantasia: Optional[str] = None
    rut: Optional[str] = None
    contacto: Optional[str] = None
    email: Optional[EmailStr] = None
    telefono: Optional[str] = None
    direccion: Optional[str] = None


class Cliente(BaseModel):
    id: str
    nombre: str
    nombre_fantasia: Optional[str] = None
    rut: Optional[str] = None
    contacto: Optional[str] = None
    email: Optional[str] = None
    telefono: Optional[str] = None
    direccion: Optional[str] = None
    created_at: str


class SucursalCreate(BaseModel):
    cliente_id: str
    nombre: str
    codigo_comercio: Optional[str] = None
    direccion: Optional[str] = None
    comuna: Optional[str] = None
    region: Optional[str] = None
    telefono: Optional[str] = None
    encargado: Optional[str] = None


class SucursalUpdate(BaseModel):
    nombre: Optional[str] = None
    codigo_comercio: Optional[str] = None
    direccion: Optional[str] = None
    comuna: Optional[str] = None
    region: Optional[str] = None
    telefono: Optional[str] = None
    encargado: Optional[str] = None


class OrdenCreate(BaseModel):
    cliente_id: str
    sucursal_id: str
    tecnico_id: Optional[str] = None
    titulo: str
    descripcion: str
    prioridad: str = Field(pattern="^(baja|media|alta)$")
    serie: Optional[str] = None
    modelo: Optional[str] = None
    ddll: Optional[str] = None
    fecha_limite: Optional[str] = None  # ISO date "YYYY-MM-DD"


class OrdenUpdate(BaseModel):
    titulo: Optional[str] = None
    descripcion: Optional[str] = None
    prioridad: Optional[str] = Field(default=None, pattern="^(baja|media|alta)$")
    tecnico_id: Optional[str] = None
    serie: Optional[str] = None
    modelo: Optional[str] = None
    ddll: Optional[str] = None
    fecha_limite: Optional[str] = None


class OrdenAsignar(BaseModel):
    tecnico_id: str


class OrdenFinalizar(BaseModel):
    evidencia_base64: str  # base64 image data
    notas: Optional[str] = None


class PinPadUpdate(BaseModel):
    evidencia_base64: str
    notas: Optional[str] = None


# ----------------- Auth dependencies -----------------
async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No autorizado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id: str = payload.get("sub")
        if not user_id:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = await users_col.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    if not user:
        raise credentials_exception
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Permisos insuficientes")
    return user


async def require_tecnico(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "tecnico":
        raise HTTPException(status_code=403, detail="Permisos insuficientes")
    return user


# ----------------- App & Router -----------------
app = FastAPI(title="MVG Computación API")
api_router = APIRouter(prefix="/api")


# ----------------- Helpers -----------------
def clean_user(u: dict) -> dict:
    if not u:
        return u
    u = {k: v for k, v in u.items() if k not in ("_id", "hashed_password")}
    return u


async def enrich_orden(o: dict) -> dict:
    """Add cliente, sucursal, tecnico info to orden."""
    cliente = await clientes_col.find_one({"id": o.get("cliente_id")}, {"_id": 0})
    sucursal = await sucursales_col.find_one({"id": o.get("sucursal_id")}, {"_id": 0})
    tecnico = await users_col.find_one(
        {"id": o.get("tecnico_id")}, {"_id": 0, "hashed_password": 0}
    )
    return {
        **{k: v for k, v in o.items() if k != "_id"},
        "cliente": cliente,
        "sucursal": sucursal,
        "tecnico": tecnico,
    }


# ----------------- Auth Routes -----------------
@api_router.post("/auth/login", response_model=TokenResponse)
async def login(payload: LoginRequest):
    user = await users_col.find_one({"email": payload.email.lower()})
    if not user or not verify_password(payload.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    token = create_access_token({"sub": user["id"], "role": user["role"]})
    return TokenResponse(access_token=token, user=clean_user(user))


@api_router.get("/auth/me")
async def me(current: dict = Depends(get_current_user)):
    return current


# ----------------- Admin: Tecnicos -----------------
@api_router.post("/admin/tecnicos", status_code=201)
async def create_tecnico(payload: TecnicoCreate, _: dict = Depends(require_admin)):
    existing = await users_col.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email ya registrado")
    rut_existing = await users_col.find_one({"rut": payload.rut})
    if rut_existing:
        raise HTTPException(status_code=400, detail="RUT ya registrado")
    new_user = {
        "id": str(uuid.uuid4()),
        "email": payload.email.lower(),
        "rut": payload.rut,
        "nombre": payload.nombre,
        "apellidos": payload.apellidos,
        "telefono": payload.telefono,
        "role": "tecnico",
        "hashed_password": hash_password(payload.password),
        "created_at": now_iso(),
    }
    await users_col.insert_one(new_user)
    return clean_user(new_user)


@api_router.get("/admin/tecnicos")
async def list_tecnicos(_: dict = Depends(require_admin)):
    cursor = users_col.find(
        {"role": "tecnico"}, {"_id": 0, "hashed_password": 0}
    ).sort("created_at", -1)
    return await cursor.to_list(1000)


@api_router.patch("/admin/tecnicos/{tecnico_id}")
async def update_tecnico(
    tecnico_id: str, payload: TecnicoUpdate, _: dict = Depends(require_admin)
):
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "password" in update_data:
        update_data["hashed_password"] = hash_password(update_data.pop("password"))
    if "email" in update_data:
        update_data["email"] = update_data["email"].lower()
    if not update_data:
        raise HTTPException(status_code=400, detail="Sin cambios")
    result = await users_col.update_one(
        {"id": tecnico_id, "role": "tecnico"}, {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Técnico no encontrado")
    user = await users_col.find_one(
        {"id": tecnico_id}, {"_id": 0, "hashed_password": 0}
    )
    return user


@api_router.delete("/admin/tecnicos/{tecnico_id}")
async def delete_tecnico(tecnico_id: str, _: dict = Depends(require_admin)):
    result = await users_col.delete_one({"id": tecnico_id, "role": "tecnico"})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Técnico no encontrado")
    return {"ok": True}


# ----------------- Admin: Clientes -----------------
@api_router.post("/admin/clientes", status_code=201)
async def create_cliente(payload: ClienteCreate, _: dict = Depends(require_admin)):
    doc = {
        "id": str(uuid.uuid4()),
        **payload.model_dump(),
        "created_at": now_iso(),
    }
    await clientes_col.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@api_router.get("/admin/clientes")
async def list_clientes(_: dict = Depends(require_admin)):
    cursor = clientes_col.find({}, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(1000)


@api_router.get("/admin/clientes/{cliente_id}")
async def get_cliente(cliente_id: str, _: dict = Depends(require_admin)):
    cliente = await clientes_col.find_one({"id": cliente_id}, {"_id": 0})
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    sucursales = await sucursales_col.find(
        {"cliente_id": cliente_id}, {"_id": 0}
    ).to_list(1000)
    return {**cliente, "sucursales": sucursales}


@api_router.patch("/admin/clientes/{cliente_id}")
async def update_cliente(
    cliente_id: str, payload: ClienteUpdate, _: dict = Depends(require_admin)
):
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="Sin cambios")
    result = await clientes_col.update_one({"id": cliente_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return await clientes_col.find_one({"id": cliente_id}, {"_id": 0})


@api_router.delete("/admin/clientes/{cliente_id}")
async def delete_cliente(cliente_id: str, _: dict = Depends(require_admin)):
    result = await clientes_col.delete_one({"id": cliente_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    # Cascade: delete sucursales
    await sucursales_col.delete_many({"cliente_id": cliente_id})
    return {"ok": True}


# ----------------- Admin: Sucursales -----------------
@api_router.post("/admin/sucursales", status_code=201)
async def create_sucursal(payload: SucursalCreate, _: dict = Depends(require_admin)):
    cliente = await clientes_col.find_one({"id": payload.cliente_id})
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    doc = {
        "id": str(uuid.uuid4()),
        **payload.model_dump(),
        "created_at": now_iso(),
    }
    await sucursales_col.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@api_router.get("/admin/sucursales")
async def list_sucursales(
    cliente_id: Optional[str] = Query(None), _: dict = Depends(require_admin)
):
    q = {"cliente_id": cliente_id} if cliente_id else {}
    cursor = sucursales_col.find(q, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(1000)


@api_router.patch("/admin/sucursales/{sucursal_id}")
async def update_sucursal(
    sucursal_id: str, payload: SucursalUpdate, _: dict = Depends(require_admin)
):
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="Sin cambios")
    result = await sucursales_col.update_one(
        {"id": sucursal_id}, {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Sucursal no encontrada")
    return await sucursales_col.find_one({"id": sucursal_id}, {"_id": 0})


@api_router.delete("/admin/sucursales/{sucursal_id}")
async def delete_sucursal(sucursal_id: str, _: dict = Depends(require_admin)):
    result = await sucursales_col.delete_one({"id": sucursal_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Sucursal no encontrada")
    return {"ok": True}


# ----------------- Admin: Órdenes -----------------
async def _send_assignment_whatsapp(orden_id: str) -> dict:
    """Helper: sends WhatsApp to the technician currently assigned to an orden."""
    o = await ordenes_col.find_one({"id": orden_id}, {"_id": 0})
    if not o or not o.get("tecnico_id"):
        return {"ok": False, "mode": "no_tecnico", "detail": "Sin técnico asignado"}
    tecnico = await users_col.find_one(
        {"id": o["tecnico_id"]}, {"_id": 0, "hashed_password": 0}
    )
    if not tecnico:
        return {"ok": False, "mode": "no_tecnico", "detail": "Técnico no encontrado"}
    cliente = await clientes_col.find_one({"id": o["cliente_id"]}, {"_id": 0}) or {}
    sucursal = await sucursales_col.find_one({"id": o["sucursal_id"]}, {"_id": 0}) or {}
    msg = build_assignment_message(
        tecnico_nombre=tecnico.get("nombre", ""),
        numero=o.get("numero", ""),
        cliente=cliente.get("nombre_fantasia") or cliente.get("nombre", "—"),
        comercio=sucursal.get("nombre", "—"),
        codigo_comercio=sucursal.get("codigo_comercio", "—"),
        direccion=sucursal.get("direccion", "—"),
        prioridad=o.get("prioridad", "media"),
        fecha_limite=o.get("fecha_limite"),
    )
    result = await send_whatsapp(tecnico.get("telefono"), msg)
    # store last notification result on the order
    await ordenes_col.update_one(
        {"id": orden_id},
        {"$set": {"whatsapp_last": {**result, "to": tecnico.get("telefono"), "at": now_iso()}}},
    )
    return result


@api_router.post("/admin/ordenes", status_code=201)
async def create_orden(payload: OrdenCreate, admin: dict = Depends(require_admin)):
    # validations
    cliente = await clientes_col.find_one({"id": payload.cliente_id})
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    sucursal = await sucursales_col.find_one(
        {"id": payload.sucursal_id, "cliente_id": payload.cliente_id}
    )
    if not sucursal:
        raise HTTPException(
            status_code=404, detail="Comercio no encontrado para este cliente"
        )
    if payload.tecnico_id:
        tecnico = await users_col.find_one(
            {"id": payload.tecnico_id, "role": "tecnico"}
        )
        if not tecnico:
            raise HTTPException(status_code=404, detail="Técnico no encontrado")

    # Generate numero correlativo
    count = await ordenes_col.count_documents({})
    numero = f"OS-{datetime.now().year}-{count + 1:04d}"

    doc = {
        "id": str(uuid.uuid4()),
        "numero": numero,
        "cliente_id": payload.cliente_id,
        "sucursal_id": payload.sucursal_id,
        "tecnico_id": payload.tecnico_id,
        "titulo": payload.titulo,
        "descripcion": payload.descripcion,
        "prioridad": payload.prioridad,
        "serie": payload.serie,
        "modelo": payload.modelo,
        "ddll": payload.ddll,
        "fecha_limite": payload.fecha_limite,
        "estado": "pendiente",
        "evidencia_base64": None,
        "notas_tecnico": None,
        "created_by": admin["id"],
        "created_at": now_iso(),
        "started_at": None,
        "finalized_at": None,
        "whatsapp_last": None,
    }
    await ordenes_col.insert_one(doc)

    if payload.tecnico_id:
        await _send_assignment_whatsapp(doc["id"])

    o = await ordenes_col.find_one({"id": doc["id"]}, {"_id": 0})
    return await enrich_orden(o)


@api_router.patch("/admin/ordenes/{orden_id}/asignar")
async def asignar_tecnico(
    orden_id: str, payload: OrdenAsignar, _: dict = Depends(require_admin)
):
    orden = await ordenes_col.find_one({"id": orden_id})
    if not orden:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    tecnico = await users_col.find_one(
        {"id": payload.tecnico_id, "role": "tecnico"}
    )
    if not tecnico:
        raise HTTPException(status_code=404, detail="Técnico no encontrado")
    await ordenes_col.update_one(
        {"id": orden_id}, {"$set": {"tecnico_id": payload.tecnico_id}}
    )
    wa = await _send_assignment_whatsapp(orden_id)
    o = await ordenes_col.find_one({"id": orden_id}, {"_id": 0})
    enriched = await enrich_orden(o)
    return {"orden": enriched, "whatsapp": wa}


@api_router.post("/admin/ordenes/upload-excel")
async def upload_ordenes_excel(
    file: UploadFile = File(...),
    fecha_limite: Optional[str] = Form(None),
    prioridad: str = Form("media"),
    admin: dict = Depends(require_admin),
):
    """Upload Excel file (BASE FEMSA REGIONES style) to bulk-create ordenes.

    Strategy:
      - Sheet "FEMSA" (if present): master inventory of pin pads
        Columns: RUT, NOM_RAZON_SOCIAL, NOM_FANTASIA, CC, DIRECCION, COMUNA,
                 #REGION, M_MODELO, SERIEPI, DDLL
      - Sheet "CC" (if present): work orders to create (one orden per row).
        Columns include: RUT, NOM_RAZON_SOCIAL, NOM_FANTASIA, CC, DIRECCION,
                         COMUNA, #REGION, Cantidad, Fecha
      - For each CC row: locate matching pin pads from FEMSA inventory by
        (rut, CC); create ONE orden with that list of pin_pads.
      - If only FEMSA exists: group its rows by (rut, CC) and create one
        orden per group with all its pin pads.
    """
    if prioridad not in ("baja", "media", "alta"):
        prioridad = "media"
    content = await file.read()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True, read_only=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Excel inválido: {e}")

    sheet_femsa = None
    sheet_cc = None
    for s in wb.sheetnames:
        low = s.strip().lower()
        if low == "femsa":
            sheet_femsa = s
        elif low == "cc":
            sheet_cc = s
    if not sheet_femsa and not sheet_cc:
        # fallback: first sheet
        sheet_femsa = wb.sheetnames[0]

    def make_cell_fn(headers_row):
        h = [str(h).strip() if h is not None else "" for h in headers_row]
        idx = {x.upper(): i for i, x in enumerate(h)}

        def get(row, name):
            i = idx.get(name.upper())
            if i is None or i >= len(row):
                return None
            v = row[i]
            if v is None:
                return None
            if hasattr(v, "isoformat"):
                # date/datetime
                try:
                    return v.date().isoformat() if hasattr(v, "date") else v.isoformat()
                except Exception:
                    return str(v)
            s = str(v).strip()
            return s if s else None

        return get

    # Build FEMSA inventory: (rut_or_razon, cc) -> [pin_pad_dict]
    inventory: dict = {}
    if sheet_femsa:
        ws = wb[sheet_femsa]
        rows = list(ws.iter_rows(values_only=True))
        if rows:
            get = make_cell_fn(rows[0])
            for row in rows[1:]:
                if not row or all(c is None for c in row):
                    continue
                rut = get(row, "RUT")
                razon = get(row, "NOM_RAZON_SOCIAL")
                cc = get(row, "CC")
                if not cc:
                    continue
                modelo = get(row, "M_MODELO") or get(row, "MODELO")
                serie = get(row, "SERIEPI") or get(row, "SERIE")
                ddll = get(row, "DDLL")
                if not (serie or ddll):
                    continue
                key = ((rut or razon or "").strip(), cc.strip())
                inventory.setdefault(key, []).append(
                    {
                        "id": str(uuid.uuid4()),
                        "serie": serie,
                        "modelo": modelo,
                        "ddll": ddll,
                        "completed": False,
                        "evidencia_base64": None,
                        "notas": None,
                        "completed_at": None,
                    }
                )

    summary = {
        "total_rows": 0,
        "ordenes_creadas": 0,
        "clientes_creados": 0,
        "comercios_creados": 0,
        "pin_pads_total": 0,
        "errores": [],
    }

    async def upsert_cliente(rut, razon, fantasia):
        cli_query = {"rut": rut} if rut else {"nombre": razon}
        cli = await clientes_col.find_one(cli_query)
        if not cli:
            cli = {
                "id": str(uuid.uuid4()),
                "nombre": razon or fantasia,
                "nombre_fantasia": fantasia,
                "rut": rut,
                "contacto": None,
                "email": None,
                "telefono": None,
                "direccion": None,
                "created_at": now_iso(),
            }
            await clientes_col.insert_one(cli)
            summary["clientes_creados"] += 1
        else:
            if fantasia and not cli.get("nombre_fantasia"):
                await clientes_col.update_one(
                    {"id": cli["id"]}, {"$set": {"nombre_fantasia": fantasia}}
                )
        return cli

    async def upsert_comercio(cliente, cc, direccion, comuna, region, fantasia, razon):
        suc = await sucursales_col.find_one(
            {"cliente_id": cliente["id"], "codigo_comercio": cc}
        )
        if not suc:
            suc = {
                "id": str(uuid.uuid4()),
                "cliente_id": cliente["id"],
                "nombre": (fantasia or razon or "") + f" - {cc}",
                "codigo_comercio": cc,
                "direccion": direccion,
                "comuna": comuna,
                "region": region,
                "telefono": None,
                "encargado": None,
                "created_at": now_iso(),
            }
            await sucursales_col.insert_one(suc)
            summary["comercios_creados"] += 1
        return suc

    async def create_orden(cliente, suc, cc, fecha_lim, pin_pads, direccion):
        # fresh copies of pin_pads (new ids each time)
        fresh_pp = [
            {
                **pp,
                "id": str(uuid.uuid4()),
                "completed": False,
                "evidencia_base64": None,
                "notas": None,
                "completed_at": None,
            }
            for pp in pin_pads
        ]
        count = await ordenes_col.count_documents({})
        numero = f"OS-{datetime.now().year}-{count + 1:04d}"
        num_pp = len(fresh_pp)
        titulo = f"Actualización Pin Pads · CC {cc}"
        descripcion = (
            f"Actualizar {num_pp} pin pad{'s' if num_pp != 1 else ''} en el "
            f"comercio CC {cc} ({direccion or '—'})."
        )
        doc = {
            "id": str(uuid.uuid4()),
            "numero": numero,
            "cliente_id": cliente["id"],
            "sucursal_id": suc["id"],
            "tecnico_id": None,
            "titulo": titulo,
            "descripcion": descripcion,
            "prioridad": prioridad,
            "serie": None,
            "modelo": None,
            "ddll": None,
            "fecha_limite": fecha_lim,
            "estado": "pendiente",
            "evidencia_base64": None,
            "notas_tecnico": None,
            "pin_pads": fresh_pp,
            "created_by": admin["id"],
            "created_at": now_iso(),
            "started_at": None,
            "finalized_at": None,
            "whatsapp_last": None,
        }
        await ordenes_col.insert_one(doc)
        summary["ordenes_creadas"] += 1
        summary["pin_pads_total"] += num_pp

    if sheet_cc:
        ws = wb[sheet_cc]
        rows = list(ws.iter_rows(values_only=True))
        if rows:
            get = make_cell_fn(rows[0])
            for row in rows[1:]:
                if not row or all(c is None for c in row):
                    continue
                summary["total_rows"] += 1
                try:
                    rut = get(row, "RUT")
                    razon = get(row, "NOM_RAZON_SOCIAL")
                    fantasia = get(row, "NOM_FANTASIA")
                    cc = get(row, "CC")
                    direccion = get(row, "DIRECCION")
                    comuna = get(row, "COMUNA")
                    region = get(row, "#REGION") or get(row, "REGION")
                    fecha_row = get(row, "Fecha") or get(row, "FECHA")
                    if not cc:
                        summary["errores"].append("Fila sin CC")
                        continue
                    fecha_lim = fecha_row or fecha_limite

                    cliente = await upsert_cliente(rut, razon, fantasia)
                    suc = await upsert_comercio(
                        cliente, cc, direccion, comuna, region, fantasia, razon
                    )
                    # look up pin pads from inventory
                    key = ((rut or razon or "").strip(), cc.strip())
                    pin_pads = inventory.get(key, [])
                    await create_orden(cliente, suc, cc, fecha_lim, pin_pads, direccion)
                except Exception as e:
                    summary["errores"].append(f"CC {cc}: {str(e)[:120]}")
    else:
        # Only FEMSA exists: group by (rut, cc)
        groups: dict = {}
        ws = wb[sheet_femsa]
        rows = list(ws.iter_rows(values_only=True))
        if rows:
            get = make_cell_fn(rows[0])
            for row in rows[1:]:
                if not row or all(c is None for c in row):
                    continue
                summary["total_rows"] += 1
                rut = get(row, "RUT")
                razon = get(row, "NOM_RAZON_SOCIAL")
                fantasia = get(row, "NOM_FANTASIA")
                cc = get(row, "CC")
                if not cc:
                    continue
                direccion = get(row, "DIRECCION")
                comuna = get(row, "COMUNA")
                region = get(row, "#REGION") or get(row, "REGION")
                modelo = get(row, "M_MODELO")
                serie = get(row, "SERIEPI")
                ddll = get(row, "DDLL")
                gkey = ((rut or razon or "").strip(), cc.strip())
                g = groups.setdefault(
                    gkey,
                    {
                        "rut": rut,
                        "razon": razon,
                        "fantasia": fantasia,
                        "cc": cc,
                        "direccion": direccion,
                        "comuna": comuna,
                        "region": region,
                        "pin_pads": [],
                    },
                )
                if serie or ddll:
                    g["pin_pads"].append(
                        {
                            "id": str(uuid.uuid4()),
                            "serie": serie,
                            "modelo": modelo,
                            "ddll": ddll,
                            "completed": False,
                            "evidencia_base64": None,
                            "notas": None,
                            "completed_at": None,
                        }
                    )

        for _, g in groups.items():
            try:
                cliente = await upsert_cliente(g["rut"], g["razon"], g["fantasia"])
                suc = await upsert_comercio(
                    cliente,
                    g["cc"],
                    g["direccion"],
                    g["comuna"],
                    g["region"],
                    g["fantasia"],
                    g["razon"],
                )
                await create_orden(
                    cliente, suc, g["cc"], fecha_limite, g["pin_pads"], g["direccion"]
                )
            except Exception as e:
                summary["errores"].append(f"CC {g['cc']}: {str(e)[:120]}")

    return summary


@api_router.post("/admin/ordenes/reset")
async def reset_ordenes(_: dict = Depends(require_admin)):
    """Elimina TODAS las órdenes (mantiene clientes, comercios y técnicos)."""
    r = await ordenes_col.delete_many({})
    return {"deleted": r.deleted_count}


@api_router.get("/admin/comercios")
async def list_comercios(_: dict = Depends(require_admin)):
    """Returns all comercios with cliente info and pin_pads summary derived from ordenes."""
    sucursales = await sucursales_col.find({}, {"_id": 0}).to_list(5000)
    out = []
    for s in sucursales:
        cliente = await clientes_col.find_one(
            {"id": s.get("cliente_id")}, {"_id": 0}
        )
        # Aggregate pin_pads across all ordenes of this comercio
        ordenes = await ordenes_col.find(
            {"sucursal_id": s["id"]}, {"_id": 0}
        ).to_list(2000)
        pin_pads_map = {}
        ordenes_count = 0
        finalizadas_count = 0
        for o in ordenes:
            ordenes_count += 1
            if o.get("estado") == "finalizada":
                finalizadas_count += 1
            for pp in o.get("pin_pads") or []:
                key = (pp.get("serie") or "") + "|" + (pp.get("ddll") or "")
                if key not in pin_pads_map:
                    pin_pads_map[key] = {
                        "serie": pp.get("serie"),
                        "modelo": pp.get("modelo"),
                        "ddll": pp.get("ddll"),
                    }
            # legacy single-pinpad ordenes
            if not o.get("pin_pads") and (o.get("serie") or o.get("ddll")):
                key = (o.get("serie") or "") + "|" + (o.get("ddll") or "")
                if key not in pin_pads_map:
                    pin_pads_map[key] = {
                        "serie": o.get("serie"),
                        "modelo": o.get("modelo"),
                        "ddll": o.get("ddll"),
                    }
        out.append(
            {
                **s,
                "cliente": cliente,
                "pin_pads": list(pin_pads_map.values()),
                "pin_pads_count": len(pin_pads_map),
                "ordenes_count": ordenes_count,
                "ordenes_finalizadas": finalizadas_count,
            }
        )
    # sort by cliente name then cc
    out.sort(
        key=lambda x: (
            (x.get("cliente") or {}).get("nombre_fantasia")
            or (x.get("cliente") or {}).get("nombre", ""),
            x.get("codigo_comercio") or "",
        )
    )
    return out


@api_router.get("/admin/ordenes/{orden_id}/pdf")
async def orden_pdf(orden_id: str, _: dict = Depends(require_admin)):
    o = await ordenes_col.find_one({"id": orden_id}, {"_id": 0})
    if not o:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    cliente = await clientes_col.find_one({"id": o.get("cliente_id")}, {"_id": 0}) or {}
    sucursal = await sucursales_col.find_one({"id": o.get("sucursal_id")}, {"_id": 0}) or {}
    tecnico = await users_col.find_one(
        {"id": o.get("tecnico_id")}, {"_id": 0, "hashed_password": 0}
    ) or {}
    pdf_bytes = build_orden_pdf(o, cliente, sucursal, tecnico)
    filename = f"orden_{o.get('numero', orden_id)}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@api_router.get("/admin/ordenes")
async def list_ordenes_admin(
    estado: Optional[str] = Query(None),
    prioridad: Optional[str] = Query(None),
    tecnico_id: Optional[str] = Query(None),
    _: dict = Depends(require_admin),
):
    q = {}
    if estado:
        q["estado"] = estado
    if prioridad:
        q["prioridad"] = prioridad
    if tecnico_id:
        q["tecnico_id"] = tecnico_id
    cursor = ordenes_col.find(q, {"_id": 0}).sort("created_at", -1)
    items = await cursor.to_list(1000)
    return [await enrich_orden(o) for o in items]


@api_router.get("/admin/stats")
async def admin_stats(_: dict = Depends(require_admin)):
    total = await ordenes_col.count_documents({})
    en_progreso = await ordenes_col.count_documents({"estado": "en_progreso"})
    pendientes = await ordenes_col.count_documents({"estado": "pendiente"})
    finalizadas = await ordenes_col.count_documents({"estado": "finalizada"})
    total_clientes = await clientes_col.count_documents({})
    total_tecnicos = await users_col.count_documents({"role": "tecnico"})
    return {
        "total_ordenes": total,
        "en_progreso": en_progreso,
        "pendientes": pendientes,
        "finalizadas": finalizadas,
        "total_clientes": total_clientes,
        "total_tecnicos": total_tecnicos,
    }


@api_router.patch("/admin/ordenes/{orden_id}")
async def update_orden(
    orden_id: str, payload: OrdenUpdate, _: dict = Depends(require_admin)
):
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="Sin cambios")
    result = await ordenes_col.update_one({"id": orden_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    o = await ordenes_col.find_one({"id": orden_id}, {"_id": 0})
    return await enrich_orden(o)


@api_router.delete("/admin/ordenes/{orden_id}")
async def delete_orden(orden_id: str, _: dict = Depends(require_admin)):
    result = await ordenes_col.delete_one({"id": orden_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    return {"ok": True}


# ----------------- Shared orden detail -----------------
@api_router.get("/ordenes/{orden_id}")
async def get_orden(orden_id: str, current: dict = Depends(get_current_user)):
    o = await ordenes_col.find_one({"id": orden_id}, {"_id": 0})
    if not o:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    # Scope check for tecnico
    if current["role"] == "tecnico" and o.get("tecnico_id") != current["id"]:
        raise HTTPException(status_code=403, detail="Sin acceso a esta orden")
    return await enrich_orden(o)


# ----------------- Tecnico routes -----------------
@api_router.get("/tecnico/ordenes")
async def list_ordenes_tecnico(
    estado: Optional[str] = Query(None), tec: dict = Depends(require_tecnico)
):
    q = {"tecnico_id": tec["id"]}
    if estado:
        q["estado"] = estado
    cursor = ordenes_col.find(q, {"_id": 0}).sort("created_at", -1)
    items = await cursor.to_list(1000)
    return [await enrich_orden(o) for o in items]


@api_router.get("/tecnico/stats")
async def tecnico_stats(tec: dict = Depends(require_tecnico)):
    base = {"tecnico_id": tec["id"]}
    total = await ordenes_col.count_documents(base)
    pendientes = await ordenes_col.count_documents({**base, "estado": "pendiente"})
    en_progreso = await ordenes_col.count_documents(
        {**base, "estado": "en_progreso"}
    )
    finalizadas = await ordenes_col.count_documents(
        {**base, "estado": "finalizada"}
    )
    return {
        "total": total,
        "pendientes": pendientes,
        "en_progreso": en_progreso,
        "finalizadas": finalizadas,
    }


@api_router.patch("/tecnico/ordenes/{orden_id}/iniciar")
async def iniciar_orden(orden_id: str, tec: dict = Depends(require_tecnico)):
    o = await ordenes_col.find_one({"id": orden_id})
    if not o:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if o.get("tecnico_id") != tec["id"]:
        raise HTTPException(status_code=403, detail="Sin acceso a esta orden")
    if o.get("estado") != "pendiente":
        raise HTTPException(status_code=400, detail="La orden no está pendiente")
    await ordenes_col.update_one(
        {"id": orden_id},
        {"$set": {"estado": "en_progreso", "started_at": now_iso()}},
    )
    o = await ordenes_col.find_one({"id": orden_id}, {"_id": 0})
    return await enrich_orden(o)


@api_router.patch("/tecnico/ordenes/{orden_id}/pinpad/{pinpad_id}")
async def update_pinpad(
    orden_id: str,
    pinpad_id: str,
    payload: PinPadUpdate,
    tec: dict = Depends(require_tecnico),
):
    """Técnico marca UN pin pad como actualizado con evidencia fotográfica."""
    o = await ordenes_col.find_one({"id": orden_id})
    if not o:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if o.get("tecnico_id") != tec["id"]:
        raise HTTPException(status_code=403, detail="Sin acceso a esta orden")
    if not payload.evidencia_base64:
        raise HTTPException(status_code=400, detail="Evidencia requerida")

    pin_pads = o.get("pin_pads") or []
    found = False
    all_done = True
    for pp in pin_pads:
        if pp.get("id") == pinpad_id:
            pp["completed"] = True
            pp["evidencia_base64"] = payload.evidencia_base64
            pp["notas"] = payload.notas
            pp["completed_at"] = now_iso()
            found = True
        if not pp.get("completed"):
            all_done = False
    if not found:
        raise HTTPException(status_code=404, detail="Pin pad no encontrado")

    set_data = {"pin_pads": pin_pads}
    # auto-start if pendiente
    if o.get("estado") == "pendiente":
        set_data["estado"] = "en_progreso"
        set_data["started_at"] = now_iso()
    # auto-finalize if all done
    if all_done:
        set_data["estado"] = "finalizada"
        set_data["finalized_at"] = now_iso()

    await ordenes_col.update_one({"id": orden_id}, {"$set": set_data})
    o = await ordenes_col.find_one({"id": orden_id}, {"_id": 0})
    return await enrich_orden(o)


@api_router.patch("/tecnico/ordenes/{orden_id}/finalizar")
async def finalizar_orden(
    orden_id: str, payload: OrdenFinalizar, tec: dict = Depends(require_tecnico)
):
    o = await ordenes_col.find_one({"id": orden_id})
    if not o:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if o.get("tecnico_id") != tec["id"]:
        raise HTTPException(status_code=403, detail="Sin acceso a esta orden")
    if o.get("estado") == "finalizada":
        raise HTTPException(status_code=400, detail="Orden ya finalizada")
    if not payload.evidencia_base64:
        raise HTTPException(status_code=400, detail="Evidencia fotográfica requerida")
    await ordenes_col.update_one(
        {"id": orden_id},
        {
            "$set": {
                "estado": "finalizada",
                "evidencia_base64": payload.evidencia_base64,
                "notas_tecnico": payload.notas,
                "finalized_at": now_iso(),
            }
        },
    )
    o = await ordenes_col.find_one({"id": orden_id}, {"_id": 0})
    return await enrich_orden(o)


# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----------------- Startup: seed admin -----------------
@app.on_event("startup")
async def on_startup():
    await users_col.create_index("email", unique=True)
    await users_col.create_index("rut", unique=False, sparse=True)
    existing = await users_col.find_one({"email": ADMIN_EMAIL.lower()})
    if not existing:
        admin_doc = {
            "id": str(uuid.uuid4()),
            "email": ADMIN_EMAIL.lower(),
            "nombre": ADMIN_NOMBRE,
            "apellidos": ADMIN_APELLIDOS,
            "role": "admin",
            "hashed_password": hash_password(ADMIN_PASSWORD),
            "created_at": now_iso(),
        }
        await users_col.insert_one(admin_doc)
        logger.info(f"Admin seed creado: {ADMIN_EMAIL}")
    else:
        logger.info(f"Admin ya existe: {ADMIN_EMAIL}")


@app.on_event("shutdown")
async def shutdown():
    client.close()
