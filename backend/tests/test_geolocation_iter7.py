"""Iteration 7 tests for geolocation + 30-min photo edit window.

Covered:
- PATCH /api/tecnico/ordenes/{id}/pinpad/{pid}
    * Updating one pin pad of many WITHOUT lat/lng → 200 (more pin pads remain).
    * Completing the last pin pad WITHOUT lat/lng → 400 "Ubicación requerida".
    * Completing the last pin pad WITH lat/lng → 200; orden estado finalizada;
      closed_lat/lng/address/finalized_at persisted on root.
- PATCH /api/tecnico/ordenes/{id}/pinpad/{pid}/foto (replace within 30 min) → 200.
- DELETE /api/tecnico/ordenes/{id}/pinpad/{pid}/foto
    * 400 when orden already finalizada
    * 400 when pin pad not completed yet
    * Happy-path: resets completed=false, clears photo/notas/uploaded_at/lat/lng
- 403 on expired 30-min window (uploaded_at backdated 31 min)
- Auth matrix:
    * 401 sin token
    * 403 con admin token
    * 403 con técnico ajeno
"""
import os
import uuid
import asyncio
import pytest
import requests
from datetime import datetime, timezone, timedelta

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")


# ---------- Mongo helpers (direct DB) ----------
def _mongo_db():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client, client[os.environ["DB_NAME"]]


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


# ---------- Helpers ----------
B64_PNG = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)
B64_PNG_NEW = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR42mP8/5+hngEJMA4VCAB+1xH3LQAA"
)


def _seed_orden_with_pinpads(num_pinpads: int, tecnico_id: str, estado: str = "pendiente"):
    """Insert a fresh test orden directly in MongoDB with `num_pinpads` pin pads."""
    async def _do():
        client, db = _mongo_db()
        # We need cliente_id + sucursal_id that exist
        cliente = await db.clientes.find_one({}, {"_id": 0, "id": 1})
        if not cliente:
            client.close()
            return None
        sucursal = await db.sucursales.find_one(
            {"cliente_id": cliente["id"]}, {"_id": 0, "id": 1}
        )
        if not sucursal:
            client.close()
            return None
        orden_id = str(uuid.uuid4())
        pin_pads = [
            {
                "id": str(uuid.uuid4()),
                "serie": f"TEST-S-{i}",
                "ddll": f"TEST-D-{i}",
                "modelo": "TST",
                "completed": False,
                "evidencia_base64": None,
                "notas": None,
                "completed_at": None,
                "uploaded_at": None,
                "lat": None,
                "lng": None,
                "address": None,
            }
            for i in range(num_pinpads)
        ]
        doc = {
            "id": orden_id,
            "numero": f"OS-TEST-{uuid.uuid4().hex[:6]}",
            "cliente_id": cliente["id"],
            "sucursal_id": sucursal["id"],
            "tecnico_id": tecnico_id,
            "titulo": "TEST geolocation orden",
            "descripcion": "TEST iter7",
            "prioridad": "media",
            "estado": estado,
            "evidencia_base64": None,
            "notas_tecnico": None,
            "pin_pads": pin_pads,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "_test_marker": "iter7",
        }
        await db.ordenes.insert_one(doc)
        client.close()
        return orden_id, [p["id"] for p in pin_pads]

    return _run(_do())


def _set_uploaded_at(orden_id, pinpad_id, dt_iso):
    async def _do():
        client, db = _mongo_db()
        await db.ordenes.update_one(
            {"id": orden_id, "pin_pads.id": pinpad_id},
            {"$set": {"pin_pads.$.uploaded_at": dt_iso}},
        )
        client.close()
    _run(_do())


def _cleanup_orden(orden_id):
    async def _do():
        client, db = _mongo_db()
        await db.ordenes.delete_one({"id": orden_id})
        client.close()
    _run(_do())


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def other_tecnico(base_url, admin_headers):
    """A second técnico that does NOT own the test orden — used for 403 test."""
    uniq = uuid.uuid4().hex[:8]
    creds = {
        "rut": f"TEST{uniq}-Z",
        "nombre": "Foreign",
        "apellidos": f"Tec{uniq}",
        "email": f"TEST_foreign_{uniq}@mvg.cl",
        "telefono": "+56912345678",
        "password": "Tecnico123!",
    }
    r = requests.post(
        f"{base_url}/api/admin/tecnicos", json=creds, headers=admin_headers, timeout=30
    )
    assert r.status_code == 201, r.text
    tec = r.json()
    r2 = requests.post(
        f"{base_url}/api/auth/login",
        json={"email": creds["email"], "password": creds["password"]},
        timeout=20,
    )
    token = r2.json()["access_token"]
    yield {"id": tec["id"], "headers": {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}}
    requests.delete(
        f"{base_url}/api/admin/tecnicos/{tec['id']}", headers=admin_headers, timeout=20
    )


@pytest.fixture
def fresh_orden_2pp(tecnico_user):
    """Fresh orden with 2 pin pads assigned to the tecnico_user (session fixture)."""
    res = _seed_orden_with_pinpads(2, tecnico_user["id"])
    assert res, "Failed to seed orden — no cliente/sucursal in DB?"
    orden_id, pp_ids = res
    yield orden_id, pp_ids
    _cleanup_orden(orden_id)


# ---------- 1) Pin pad update / finalize behaviours ----------
class TestPinPadGeolocation:
    def test_first_pinpad_without_location_returns_200(
        self, base_url, tecnico_headers, fresh_orden_2pp
    ):
        orden_id, (pp1, pp2) = fresh_orden_2pp
        r = requests.patch(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad/{pp1}",
            json={"evidencia_base64": B64_PNG},
            headers=tecnico_headers,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["estado"] == "en_progreso", "Orden must auto-start"
        pp = next(p for p in data["pin_pads"] if p["id"] == pp1)
        assert pp["completed"] is True
        assert pp.get("uploaded_at") is not None
        assert pp.get("evidencia_base64", "").startswith("data:image/")

    def test_last_pinpad_without_location_returns_400(
        self, base_url, tecnico_headers, fresh_orden_2pp
    ):
        orden_id, (pp1, pp2) = fresh_orden_2pp
        # complete pp1 first
        r1 = requests.patch(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad/{pp1}",
            json={"evidencia_base64": B64_PNG},
            headers=tecnico_headers,
            timeout=30,
        )
        assert r1.status_code == 200
        # closing pp2 WITHOUT location must fail
        r2 = requests.patch(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad/{pp2}",
            json={"evidencia_base64": B64_PNG},
            headers=tecnico_headers,
            timeout=30,
        )
        assert r2.status_code == 400, r2.text
        assert "ubicaci" in r2.json()["detail"].lower()
        # GET → estado must still be en_progreso
        rg = requests.get(
            f"{base_url}/api/tecnico/ordenes/{orden_id}",
            headers=tecnico_headers,
            timeout=20,
        )
        # Endpoint shape: maybe tecnico GET; fallback to admin list
        # Just verify via direct DB check
        async def _check():
            client, db = _mongo_db()
            o = await db.ordenes.find_one({"id": orden_id}, {"_id": 0})
            client.close()
            return o
        o = _run(_check())
        assert o["estado"] == "en_progreso"

    def test_last_pinpad_with_location_finalizes_orden(
        self, base_url, tecnico_headers, fresh_orden_2pp
    ):
        orden_id, (pp1, pp2) = fresh_orden_2pp
        # First pin pad
        r1 = requests.patch(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad/{pp1}",
            json={"evidencia_base64": B64_PNG},
            headers=tecnico_headers,
            timeout=30,
        )
        assert r1.status_code == 200
        # Second pin pad with location → closes orden
        payload = {
            "evidencia_base64": B64_PNG,
            "lat": 40.4168,
            "lng": -3.7038,
            "address": "Plaza Mayor, Madrid",
            "accuracy_m": 12.5,
        }
        r2 = requests.patch(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad/{pp2}",
            json=payload,
            headers=tecnico_headers,
            timeout=30,
        )
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert data["estado"] == "finalizada"
        assert data.get("closed_lat") == 40.4168
        assert data.get("closed_lng") == -3.7038
        assert data.get("closed_address") == "Plaza Mayor, Madrid"
        assert data.get("closed_accuracy_m") == 12.5
        assert data.get("finalized_at") is not None
        # And the pin pad itself stored the coords too
        pp_after = next(p for p in data["pin_pads"] if p["id"] == pp2)
        assert pp_after.get("lat") == 40.4168
        assert pp_after.get("lng") == -3.7038


# ---------- 2) Photo replace (PATCH /foto) ----------
class TestReplacePhoto:
    def test_replace_photo_within_window_returns_200(
        self, base_url, tecnico_headers, fresh_orden_2pp
    ):
        orden_id, (pp1, pp2) = fresh_orden_2pp
        # Upload first photo
        requests.patch(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad/{pp1}",
            json={"evidencia_base64": B64_PNG},
            headers=tecnico_headers,
            timeout=30,
        )
        # Replace it (orden NOT finalized — pp2 still pending)
        r = requests.patch(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad/{pp1}/foto",
            json={"evidencia_base64": B64_PNG_NEW, "notas": "replaced"},
            headers=tecnico_headers,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        pp = next(p for p in data["pin_pads"] if p["id"] == pp1)
        assert pp.get("evidencia_base64", "").endswith("1xH3LQAA")  # tail of B64_PNG_NEW
        assert pp.get("edited_at") is not None
        assert pp.get("notas") == "replaced"

    def test_replace_photo_after_window_expired_returns_403(
        self, base_url, tecnico_headers, fresh_orden_2pp
    ):
        orden_id, (pp1, _pp2) = fresh_orden_2pp
        # Upload first photo
        requests.patch(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad/{pp1}",
            json={"evidencia_base64": B64_PNG},
            headers=tecnico_headers,
            timeout=30,
        )
        # Backdate uploaded_at to 31 min ago
        past = (datetime.now(timezone.utc) - timedelta(minutes=31)).isoformat()
        _set_uploaded_at(orden_id, pp1, past)
        r = requests.patch(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad/{pp1}/foto",
            json={"evidencia_base64": B64_PNG_NEW},
            headers=tecnico_headers,
            timeout=30,
        )
        assert r.status_code == 403, r.text
        assert "ventana" in r.json()["detail"].lower()


# ---------- 3) Photo delete (DELETE /foto) ----------
class TestDeletePhoto:
    def test_delete_when_pinpad_not_completed_returns_400(
        self, base_url, tecnico_headers, fresh_orden_2pp
    ):
        orden_id, (pp1, _pp2) = fresh_orden_2pp
        r = requests.delete(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad/{pp1}/foto",
            headers=tecnico_headers,
            timeout=30,
        )
        assert r.status_code == 400, r.text
        assert "foto" in r.json()["detail"].lower()

    def test_delete_when_orden_finalized_returns_400(
        self, base_url, tecnico_headers, fresh_orden_2pp
    ):
        orden_id, (pp1, pp2) = fresh_orden_2pp
        # Complete pp1
        requests.patch(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad/{pp1}",
            json={"evidencia_base64": B64_PNG},
            headers=tecnico_headers,
            timeout=30,
        )
        # Complete pp2 with location → closes orden
        requests.patch(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad/{pp2}",
            json={
                "evidencia_base64": B64_PNG,
                "lat": 40.4168,
                "lng": -3.7038,
                "address": "X",
            },
            headers=tecnico_headers,
            timeout=30,
        )
        # Try to delete pp1 photo
        r = requests.delete(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad/{pp1}/foto",
            headers=tecnico_headers,
            timeout=30,
        )
        assert r.status_code == 400, r.text
        assert "finaliz" in r.json()["detail"].lower()

    def test_delete_happy_path_resets_pinpad(
        self, base_url, tecnico_headers, fresh_orden_2pp
    ):
        orden_id, (pp1, _pp2) = fresh_orden_2pp
        # Upload photo on pp1 only (orden still en_progreso since pp2 pending)
        requests.patch(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad/{pp1}",
            json={"evidencia_base64": B64_PNG, "lat": 1.0, "lng": 2.0, "address": "Y"},
            headers=tecnico_headers,
            timeout=30,
        )
        r = requests.delete(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad/{pp1}/foto",
            headers=tecnico_headers,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        pp = next(p for p in data["pin_pads"] if p["id"] == pp1)
        assert pp.get("completed") is False
        assert pp.get("evidencia_base64") is None
        assert pp.get("notas") is None
        assert pp.get("uploaded_at") is None
        assert pp.get("lat") is None
        assert pp.get("lng") is None
        assert pp.get("address") is None

    def test_delete_after_window_expired_returns_403(
        self, base_url, tecnico_headers, fresh_orden_2pp
    ):
        orden_id, (pp1, _pp2) = fresh_orden_2pp
        requests.patch(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad/{pp1}",
            json={"evidencia_base64": B64_PNG},
            headers=tecnico_headers,
            timeout=30,
        )
        past = (datetime.now(timezone.utc) - timedelta(minutes=31)).isoformat()
        _set_uploaded_at(orden_id, pp1, past)
        r = requests.delete(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad/{pp1}/foto",
            headers=tecnico_headers,
            timeout=30,
        )
        assert r.status_code == 403, r.text


# ---------- 4) finalizar endpoint requires lat/lng ----------
class TestFinalizarLocation:
    def test_finalizar_without_lat_lng_returns_422(
        self, base_url, tecnico_headers, fresh_orden_2pp
    ):
        orden_id, _ = fresh_orden_2pp
        r = requests.patch(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/finalizar",
            json={"evidencia_base64": B64_PNG},
            headers=tecnico_headers,
            timeout=30,
        )
        # OrdenFinalizar has lat/lng required → Pydantic 422
        assert r.status_code == 422, r.text

    def test_finalizar_with_lat_lng_persists_closed_fields(
        self, base_url, tecnico_headers, fresh_orden_2pp
    ):
        orden_id, _ = fresh_orden_2pp
        r = requests.patch(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/finalizar",
            json={
                "evidencia_base64": B64_PNG,
                "lat": 10.0,
                "lng": 20.0,
                "address": "Test addr",
                "accuracy_m": 5.0,
            },
            headers=tecnico_headers,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["estado"] == "finalizada"
        assert data.get("closed_lat") == 10.0
        assert data.get("closed_lng") == 20.0
        assert data.get("closed_address") == "Test addr"
        assert data.get("closed_accuracy_m") == 5.0


# ---------- 5) Auth matrix ----------
class TestAuthMatrix:
    def test_pinpad_update_requires_token(self, base_url, fresh_orden_2pp):
        orden_id, (pp1, _) = fresh_orden_2pp
        r = requests.patch(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad/{pp1}",
            json={"evidencia_base64": B64_PNG},
            timeout=20,
        )
        assert r.status_code == 401

    def test_pinpad_update_admin_token_403(
        self, base_url, admin_headers, fresh_orden_2pp
    ):
        orden_id, (pp1, _) = fresh_orden_2pp
        r = requests.patch(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad/{pp1}",
            json={"evidencia_base64": B64_PNG},
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 403

    def test_pinpad_update_foreign_tecnico_403(
        self, base_url, other_tecnico, fresh_orden_2pp
    ):
        orden_id, (pp1, _) = fresh_orden_2pp
        r = requests.patch(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad/{pp1}",
            json={"evidencia_base64": B64_PNG},
            headers=other_tecnico["headers"],
            timeout=20,
        )
        assert r.status_code == 403

    def test_replace_photo_admin_token_403(
        self, base_url, admin_headers, fresh_orden_2pp, tecnico_headers
    ):
        orden_id, (pp1, _) = fresh_orden_2pp
        # need to have a photo first
        requests.patch(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad/{pp1}",
            json={"evidencia_base64": B64_PNG},
            headers=tecnico_headers,
            timeout=20,
        )
        r = requests.patch(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad/{pp1}/foto",
            json={"evidencia_base64": B64_PNG_NEW},
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 403

    def test_delete_photo_no_token_401(self, base_url, fresh_orden_2pp):
        orden_id, (pp1, _) = fresh_orden_2pp
        r = requests.delete(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad/{pp1}/foto",
            timeout=20,
        )
        assert r.status_code == 401

    def test_delete_photo_foreign_tecnico_403(
        self, base_url, other_tecnico, fresh_orden_2pp, tecnico_headers
    ):
        orden_id, (pp1, _) = fresh_orden_2pp
        requests.patch(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad/{pp1}",
            json={"evidencia_base64": B64_PNG},
            headers=tecnico_headers,
            timeout=20,
        )
        r = requests.delete(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad/{pp1}/foto",
            headers=other_tecnico["headers"],
            timeout=20,
        )
        assert r.status_code == 403
