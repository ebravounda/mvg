"""Iteration 9 - Asignación Masiva MANUAL (POST /api/admin/ordenes/asignar-bulk).

Covers:
 - Happy path: 2-3 órdenes + tecnico_id válido → 200 + {asignadas, whatsapps_enviados, tecnico}
   y verificación en MongoDB que las órdenes quedaron con ese tecnico_id.
 - orden_ids=[] → 400 'Selecciona al menos 1 orden'.
 - tecnico_id inexistente → 404 'Técnico no encontrado'.
"""
import os
import uuid
import asyncio
import pytest
import requests
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

TEST_MARKER = "iter9_bulk"


def _mongo_db():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client, client[os.environ["DB_NAME"]]


def _run(coro):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("closed")
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


# ----- Helpers -----
def _seed_orden_pendiente(comuna: str = "Santiago"):
    """Inserta una orden TEST sin tecnico, devuelve orden_id."""
    async def _do():
        client, db = _mongo_db()
        cliente = await db.clientes.find_one({}, {"_id": 0, "id": 1})
        if not cliente:
            client.close()
            return None
        sucursal_id = str(uuid.uuid4())
        await db.sucursales.insert_one({
            "id": sucursal_id,
            "cliente_id": cliente["id"],
            "nombre": f"TEST_SUC_BULK_{uuid.uuid4().hex[:4]}",
            "direccion": "Calle Test 123",
            "comuna": comuna,
            "region": "Metropolitana",
            "_test_marker": TEST_MARKER,
        })
        orden_id = str(uuid.uuid4())
        await db.ordenes.insert_one({
            "id": orden_id,
            "numero": f"OS-BULK-{uuid.uuid4().hex[:6]}",
            "cliente_id": cliente["id"],
            "sucursal_id": sucursal_id,
            "tecnico_id": None,
            "titulo": "TEST iter9 bulk",
            "descripcion": "TEST",
            "prioridad": "media",
            "estado": "pendiente",
            "pin_pads": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "_test_marker": TEST_MARKER,
        })
        client.close()
        return orden_id
    return _run(_do())


def _get_orden_tecnico(orden_id: str):
    async def _do():
        client, db = _mongo_db()
        doc = await db.ordenes.find_one({"id": orden_id}, {"_id": 0, "tecnico_id": 1})
        client.close()
        return (doc or {}).get("tecnico_id")
    return _run(_do())


@pytest.fixture(scope="module", autouse=True)
def _cleanup():
    yield
    async def _do():
        client, db = _mongo_db()
        await db.ordenes.delete_many({"_test_marker": TEST_MARKER})
        await db.sucursales.delete_many({"_test_marker": TEST_MARKER})
        client.close()
    _run(_do())


# ----- Tests -----
class TestAsignarBulkHappyPath:
    """POST /api/admin/ordenes/asignar-bulk con datos válidos."""

    def test_bulk_asigna_3_ordenes_a_tecnico(self, base_url, admin_headers, tecnico_user):
        # Seed 3 órdenes pendientes
        ids = [_seed_orden_pendiente(comuna="Santiago") for _ in range(3)]
        assert all(ids), "No se pudieron crear las órdenes seed"
        tecnico_id = tecnico_user["id"]

        r = requests.post(
            f"{base_url}/api/admin/ordenes/asignar-bulk",
            json={"orden_ids": ids, "tecnico_id": tecnico_id},
            headers=admin_headers,
            timeout=60,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        data = r.json()
        # Shape
        assert "asignadas" in data
        assert "whatsapps_enviados" in data
        assert "tecnico" in data
        assert data["asignadas"] == 3, f"Expected 3 asignadas, got {data['asignadas']}"
        assert isinstance(data["whatsapps_enviados"], int)
        assert isinstance(data["tecnico"], str) and len(data["tecnico"]) > 0

        # Verifica en MongoDB
        for oid in ids:
            t_id = _get_orden_tecnico(oid)
            assert t_id == tecnico_id, f"Orden {oid} no quedó con tecnico_id correcto"

    def test_bulk_asigna_2_ordenes(self, base_url, admin_headers, tecnico_user):
        ids = [_seed_orden_pendiente() for _ in range(2)]
        assert all(ids)
        tecnico_id = tecnico_user["id"]

        r = requests.post(
            f"{base_url}/api/admin/ordenes/asignar-bulk",
            json={"orden_ids": ids, "tecnico_id": tecnico_id},
            headers=admin_headers,
            timeout=60,
        )
        assert r.status_code == 200, r.text
        assert r.json()["asignadas"] == 2


class TestAsignarBulkValidations:
    """Validaciones de error."""

    def test_orden_ids_vacios_400(self, base_url, admin_headers, tecnico_user):
        r = requests.post(
            f"{base_url}/api/admin/ordenes/asignar-bulk",
            json={"orden_ids": [], "tecnico_id": tecnico_user["id"]},
            headers=admin_headers,
            timeout=30,
        )
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
        body = r.json()
        detail = body.get("detail", "")
        assert "Selecciona al menos 1 orden" in detail, f"Mensaje inesperado: {detail}"

    def test_tecnico_inexistente_404(self, base_url, admin_headers):
        # Seed 1 orden para tener algo en orden_ids
        oid = _seed_orden_pendiente()
        assert oid

        fake_tec = str(uuid.uuid4())
        r = requests.post(
            f"{base_url}/api/admin/ordenes/asignar-bulk",
            json={"orden_ids": [oid], "tecnico_id": fake_tec},
            headers=admin_headers,
            timeout=30,
        )
        assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text}"
        detail = r.json().get("detail", "")
        assert "Técnico no encontrado" in detail, f"Mensaje inesperado: {detail}"

        # Verifica que la orden NO se haya modificado
        t = _get_orden_tecnico(oid)
        assert t is None, f"Orden no debió asignarse cuando técnico inexistente, quedó con {t}"

    def test_sin_auth_devuelve_401_o_403(self, base_url):
        r = requests.post(
            f"{base_url}/api/admin/ordenes/asignar-bulk",
            json={"orden_ids": ["x"], "tecnico_id": "y"},
            timeout=30,
        )
        assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"
