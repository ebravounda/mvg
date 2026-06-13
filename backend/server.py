import os
import uuid
import logging
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Query
from fastapi.security import OAuth2PasswordBearer
from starlette.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from jose import jwt, JWTError
from pydantic import BaseModel, EmailStr, Field

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
    rut: Optional[str] = None
    contacto: Optional[str] = None
    email: Optional[EmailStr] = None
    telefono: Optional[str] = None
    direccion: Optional[str] = None


class ClienteUpdate(BaseModel):
    nombre: Optional[str] = None
    rut: Optional[str] = None
    contacto: Optional[str] = None
    email: Optional[EmailStr] = None
    telefono: Optional[str] = None
    direccion: Optional[str] = None


class Cliente(BaseModel):
    id: str
    nombre: str
    rut: Optional[str] = None
    contacto: Optional[str] = None
    email: Optional[str] = None
    telefono: Optional[str] = None
    direccion: Optional[str] = None
    created_at: str


class SucursalCreate(BaseModel):
    cliente_id: str
    nombre: str
    direccion: Optional[str] = None
    telefono: Optional[str] = None
    encargado: Optional[str] = None


class SucursalUpdate(BaseModel):
    nombre: Optional[str] = None
    direccion: Optional[str] = None
    telefono: Optional[str] = None
    encargado: Optional[str] = None


class OrdenCreate(BaseModel):
    cliente_id: str
    sucursal_id: str
    tecnico_id: str
    titulo: str
    descripcion: str
    prioridad: str = Field(pattern="^(baja|media|alta)$")


class OrdenUpdate(BaseModel):
    titulo: Optional[str] = None
    descripcion: Optional[str] = None
    prioridad: Optional[str] = Field(default=None, pattern="^(baja|media|alta)$")
    tecnico_id: Optional[str] = None


class OrdenFinalizar(BaseModel):
    evidencia_base64: str  # base64 image data
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
            status_code=404, detail="Sucursal no encontrada para este cliente"
        )
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
        "estado": "pendiente",
        "evidencia_base64": None,
        "notas_tecnico": None,
        "created_by": admin["id"],
        "created_at": now_iso(),
        "started_at": None,
        "finalized_at": None,
    }
    await ordenes_col.insert_one(doc)
    return await enrich_orden(doc)


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
