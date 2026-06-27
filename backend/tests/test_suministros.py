"""Tests for the new Suministros (supplies) module.

Covers:
- Productos catalog CRUD + seed
- Bodegas CRUD + seed
- Config singleton GET/PATCH
- Solicitudes create/list/patch/reenviar + notifications
- Inventario upsert + tecnico view + delete
- Consumos with stock decrement
- Auth checks (anonymous, tecnico-vs-admin role enforcement)
- Tecnico bodega_id storage
"""
import os
import uuid
import requests
import pytest

# Reuse conftest fixtures (admin_token, admin_headers, base_url, tecnico_*)
SEED_SKUS = {"5143019", "500646", "5273002", "500610", "200020"}


# ============================================================
# Shared helpers / fixtures
# ============================================================

@pytest.fixture(scope="module")
def bodega_id(base_url, admin_headers):
    """Get or create a bodega we can use for tecnicos."""
    r = requests.get(f"{base_url}/api/admin/bodegas", headers=admin_headers, timeout=20)
    assert r.status_code == 200, r.text
    items = r.json()
    if items:
        # Prefer Santiago seed
        for b in items:
            if b.get("nombre") == "Santiago":
                return b["id"]
        return items[0]["id"]
    # No bodegas -> create one
    rc = requests.post(
        f"{base_url}/api/admin/bodegas",
        json={"nombre": "TEST_Bodega_Default", "region": "RM"},
        headers=admin_headers,
        timeout=20,
    )
    assert rc.status_code == 201, rc.text
    return rc.json()["id"]


@pytest.fixture(scope="module")
def sum_tecnico(base_url, admin_headers, bodega_id):
    """Create a fresh tecnico WITH bodega_id for suministros tests."""
    uniq = uuid.uuid4().hex[:8]
    payload = {
        "rut": f"SUM{uniq}-1",
        "nombre": "Sum",
        "apellidos": "Tester",
        "email": f"TEST_sumtec_{uniq}@mvg.cl",
        "telefono": "+56988887777",
        "password": "Sum1234!",
        "bodega_id": bodega_id,
    }
    r = requests.post(
        f"{base_url}/api/admin/tecnicos", json=payload, headers=admin_headers, timeout=20
    )
    assert r.status_code == 201, r.text
    body = r.json()
    body["_password"] = payload["password"]
    body["_email"] = payload["email"]
    return body


@pytest.fixture(scope="module")
def sum_tecnico_headers(base_url, sum_tecnico):
    r = requests.post(
        f"{base_url}/api/auth/login",
        json={"email": sum_tecnico["_email"], "password": sum_tecnico["_password"]},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    return {
        "Authorization": f"Bearer {r.json()['access_token']}",
        "Content-Type": "application/json",
    }


# ============================================================
# 1) Productos catalog
# ============================================================

class TestProductos:
    def test_admin_list_seed(self, base_url, admin_headers):
        r = requests.get(f"{base_url}/api/admin/productos", headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list)
        skus = {it["sku"] for it in items}
        assert SEED_SKUS.issubset(skus), f"Missing seed SKUs. Got: {skus}"

    def test_admin_create_duplicate_and_delete(self, base_url, admin_headers):
        # Cleanup if a previous run left it
        existing = requests.get(
            f"{base_url}/api/admin/productos", headers=admin_headers, timeout=20
        ).json()
        for p in existing:
            if p["sku"] == "TEST001":
                requests.delete(
                    f"{base_url}/api/admin/productos/{p['id']}",
                    headers=admin_headers,
                    timeout=20,
                )

        # Create new
        r = requests.post(
            f"{base_url}/api/admin/productos",
            json={"sku": "TEST001", "descripcion": "Test product", "categoria": "Test"},
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 201, r.text
        new_id = r.json()["id"]
        assert r.json()["sku"] == "TEST001"

        # Duplicate -> 400
        r2 = requests.post(
            f"{base_url}/api/admin/productos",
            json={"sku": "TEST001", "descripcion": "dup", "categoria": "Test"},
            headers=admin_headers,
            timeout=20,
        )
        assert r2.status_code == 400, r2.text

        # Delete
        rd = requests.delete(
            f"{base_url}/api/admin/productos/{new_id}",
            headers=admin_headers,
            timeout=20,
        )
        assert rd.status_code == 200, rd.text

    def test_tecnico_can_see_catalog(self, base_url, sum_tecnico_headers):
        r = requests.get(f"{base_url}/api/tecnico/productos", headers=sum_tecnico_headers, timeout=20)
        assert r.status_code == 200
        assert len(r.json()) >= 5


# ============================================================
# 2) Bodegas
# ============================================================

class TestBodegas:
    def test_admin_list_seed_santiago(self, base_url, admin_headers):
        r = requests.get(f"{base_url}/api/admin/bodegas", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        names = {b["nombre"] for b in r.json()}
        assert "Santiago" in names

    def test_create_bodega_valparaiso(self, base_url, admin_headers):
        unique_name = f"TEST_Valpo_{uuid.uuid4().hex[:6]}"
        r = requests.post(
            f"{base_url}/api/admin/bodegas",
            json={"nombre": unique_name, "region": "V Región"},
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 201, r.text
        bid = r.json()["id"]
        # cleanup
        requests.delete(
            f"{base_url}/api/admin/bodegas/{bid}", headers=admin_headers, timeout=20
        )

    def test_delete_bodega_with_tecnico_assigned_returns_400(
        self, base_url, admin_headers, bodega_id, sum_tecnico
    ):
        # sum_tecnico is assigned to bodega_id
        r = requests.delete(
            f"{base_url}/api/admin/bodegas/{bodega_id}",
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 400, r.text


# ============================================================
# 3) Config singleton
# ============================================================

class TestConfig:
    def test_get_config_defaults(self, base_url, admin_headers):
        r = requests.get(
            f"{base_url}/api/admin/suministros/config", headers=admin_headers, timeout=20
        )
        assert r.status_code == 200, r.text
        cfg = r.json()
        assert "emails_destino" in cfg
        assert "telefonos_destino" in cfg
        assert "from_email" in cfg

    def test_patch_and_get_config(self, base_url, admin_headers):
        payload = {
            "emails_destino": ["test1@test.com", "test2@test.com"],
            "telefonos_destino": ["56912345678"],
        }
        r = requests.patch(
            f"{base_url}/api/admin/suministros/config",
            json=payload,
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 200, r.text
        cfg = r.json()
        assert cfg["emails_destino"] == payload["emails_destino"]
        assert cfg["telefonos_destino"] == ["56912345678"]

        # GET again confirms persistence
        r2 = requests.get(
            f"{base_url}/api/admin/suministros/config",
            headers=admin_headers,
            timeout=20,
        )
        assert r2.status_code == 200
        assert r2.json()["emails_destino"] == payload["emails_destino"]


# ============================================================
# 4) Tecnico bodega_id
# ============================================================

class TestTecnicoBodegaField:
    def test_tecnico_has_bodega_id(self, base_url, admin_headers, sum_tecnico, bodega_id):
        # sum_tecnico fixture was created with bodega_id; list and find it
        r = requests.get(f"{base_url}/api/admin/tecnicos", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        found = next((t for t in r.json() if t["id"] == sum_tecnico["id"]), None)
        assert found is not None, "Created tecnico not found in list"
        assert found.get("bodega_id") == bodega_id


# ============================================================
# 5) Solicitudes flow (config seeded by TestConfig above)
# ============================================================

@pytest.fixture(scope="module")
def created_solicitud(base_url, sum_tecnico_headers, admin_headers):
    # ensure config has at least one email + phone (TestConfig may not have run yet)
    requests.patch(
        f"{base_url}/api/admin/suministros/config",
        json={
            "emails_destino": ["sum_test@mvg.cl"],
            "telefonos_destino": ["56912345678"],
        },
        headers=admin_headers,
        timeout=20,
    )
    payload = {
        "items": [
            {"sku": "5143019", "descripcion": "VX520", "cantidad": 2},
            {"sku": "500646", "descripcion": "Cable", "cantidad": 1, "comentario": "para CC"},
        ],
        "urgencia": "alta",
        "notas": "Para CC 123",
    }
    r = requests.post(
        f"{base_url}/api/tecnico/suministros/solicitudes",
        json=payload,
        headers=sum_tecnico_headers,
        timeout=45,  # email + WA call may take time
    )
    assert r.status_code == 201, r.text
    return r.json()


class TestSolicitudes:
    def test_create_returns_results_fields(self, created_solicitud):
        s = created_solicitud
        assert s["id"]
        assert s["estado"] == "pendiente"
        assert s["urgencia"] == "alta"
        # email_result + whatsapp_results MUST exist (even if upstream failed)
        assert "email_result" in s
        assert "whatsapp_results" in s
        assert isinstance(s["whatsapp_results"], list)
        assert len(s["items"]) == 2

    def test_tecnico_lists_own_solicitud(self, base_url, sum_tecnico_headers, created_solicitud):
        r = requests.get(
            f"{base_url}/api/tecnico/suministros/solicitudes",
            headers=sum_tecnico_headers,
            timeout=20,
        )
        assert r.status_code == 200
        ids = [s["id"] for s in r.json()]
        assert created_solicitud["id"] in ids

    def test_admin_lists_all_solicitudes(self, base_url, admin_headers, created_solicitud):
        r = requests.get(
            f"{base_url}/api/admin/suministros/solicitudes", headers=admin_headers, timeout=20
        )
        assert r.status_code == 200
        ids = [s["id"] for s in r.json()]
        assert created_solicitud["id"] in ids

    def test_admin_patch_estado_atendida(self, base_url, admin_headers, created_solicitud):
        sid = created_solicitud["id"]
        r = requests.patch(
            f"{base_url}/api/admin/suministros/solicitudes/{sid}?estado=atendida",
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 200, r.text
        assert r.json()["estado"] == "atendida"

    def test_admin_reenviar(self, base_url, admin_headers, created_solicitud):
        sid = created_solicitud["id"]
        r = requests.post(
            f"{base_url}/api/admin/suministros/solicitudes/{sid}/reenviar",
            headers=admin_headers,
            timeout=45,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "email_result" in body
        assert "whatsapp_results" in body

    def test_admin_cannot_create_solicitud_as_admin_role(
        self, base_url, admin_headers
    ):
        """POST /tecnico/suministros/solicitudes as ADMIN role -> 403."""
        r = requests.post(
            f"{base_url}/api/tecnico/suministros/solicitudes",
            json={
                "items": [{"sku": "5143019", "descripcion": "x", "cantidad": 1}],
                "urgencia": "normal",
            },
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 403, r.text


# ============================================================
# 6) Inventario
# ============================================================

class TestInventario:
    def test_admin_upsert_inventario(self, base_url, admin_headers, sum_tecnico):
        # First create with cantidad=5
        payload = {"tecnico_id": sum_tecnico["id"], "sku": "5143019", "cantidad": 5}
        r1 = requests.post(
            f"{base_url}/api/admin/inventario",
            json=payload,
            headers=admin_headers,
            timeout=20,
        )
        assert r1.status_code == 200, r1.text
        assert r1.json()["cantidad"] == 5
        first_id = r1.json()["id"]

        # Same SKU+tecnico -> upsert (same id, new qty)
        r2 = requests.post(
            f"{base_url}/api/admin/inventario",
            json={**payload, "cantidad": 10},
            headers=admin_headers,
            timeout=20,
        )
        assert r2.status_code == 200, r2.text
        assert r2.json()["id"] == first_id
        assert r2.json()["cantidad"] == 10

        # Admin list filter by tecnico
        r3 = requests.get(
            f"{base_url}/api/admin/inventario?tecnico_id={sum_tecnico['id']}",
            headers=admin_headers,
            timeout=20,
        )
        assert r3.status_code == 200
        items = r3.json()
        assert any(it["sku"] == "5143019" and it["cantidad"] == 10 for it in items)

    def test_tecnico_views_own_inventory(self, base_url, sum_tecnico_headers):
        r = requests.get(
            f"{base_url}/api/tecnico/inventario", headers=sum_tecnico_headers, timeout=20
        )
        assert r.status_code == 200
        skus = {it["sku"]: it["cantidad"] for it in r.json()}
        assert skus.get("5143019") == 10


# ============================================================
# 7) Consumos (decrements stock)
# ============================================================

class TestConsumos:
    def test_create_consumo_decrements_stock(
        self, base_url, sum_tecnico_headers, admin_headers
    ):
        # Use an arbitrary orden_id string (endpoint doesn't validate orden exists)
        payload = {
            "orden_id": f"TEST_orden_{uuid.uuid4().hex[:6]}",
            "items": [{"sku": "5143019", "cantidad": 3}],
        }
        r = requests.post(
            f"{base_url}/api/tecnico/consumos",
            json=payload,
            headers=sum_tecnico_headers,
            timeout=20,
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["results"][0]["nuevo_stock"] == 7
        assert body["results"][0]["negativo"] is False

        # Tecnico inventario now should show 7
        r2 = requests.get(
            f"{base_url}/api/tecnico/inventario",
            headers=sum_tecnico_headers,
            timeout=20,
        )
        assert r2.status_code == 200
        skus = {it["sku"]: it["cantidad"] for it in r2.json()}
        assert skus.get("5143019") == 7

        # Admin can list consumos
        r3 = requests.get(
            f"{base_url}/api/admin/consumos?orden_id={payload['orden_id']}",
            headers=admin_headers,
            timeout=20,
        )
        assert r3.status_code == 200
        assert len(r3.json()) == 1


# ============================================================
# 8) Auth enforcement
# ============================================================

class TestAuth:
    @pytest.mark.parametrize("path", [
        "/api/admin/productos",
        "/api/admin/bodegas",
        "/api/admin/suministros/config",
        "/api/admin/suministros/solicitudes",
        "/api/admin/inventario",
    ])
    def test_admin_endpoints_no_token(self, base_url, path):
        r = requests.get(f"{base_url}{path}", timeout=20)
        assert r.status_code in (401, 403), f"{path} returned {r.status_code}"

    @pytest.mark.parametrize("path", [
        "/api/admin/productos",
        "/api/admin/bodegas",
        "/api/admin/suministros/config",
        "/api/admin/suministros/solicitudes",
        "/api/admin/inventario",
    ])
    def test_admin_endpoints_with_tecnico_token(self, base_url, sum_tecnico_headers, path):
        r = requests.get(f"{base_url}{path}", headers=sum_tecnico_headers, timeout=20)
        assert r.status_code == 403, f"{path} returned {r.status_code}"
