"""Iteration 3 backend tests.

Focus:
- POST /api/admin/ordenes/{orden_id}/reenviar-whatsapp (new endpoint)
  - 200 with whatsapp field when tecnico is assigned
  - 400 when no tecnico assigned
  - 404 when orden not found
  - 401/403 without auth
- Regression: PATCH /api/admin/ordenes/{id}/asignar still works.
"""

import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
BASE_URL = BASE_URL.rstrip("/")


# ---------- helpers ----------

def _get_or_create_orden_with_tecnico(admin_headers, tecnico_user):
    """Pick the first orden in the system, assign tecnico_user to it, return its id."""
    r = requests.get(f"{BASE_URL}/api/admin/ordenes", headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    ordenes = r.json()
    if not ordenes:
        pytest.skip("No hay ordenes en la base; sube el Excel primero")
    orden_id = ordenes[0]["id"]
    # Assign tecnico (regression of asignar)
    r2 = requests.patch(
        f"{BASE_URL}/api/admin/ordenes/{orden_id}/asignar",
        json={"tecnico_id": tecnico_user["id"]},
        headers=admin_headers,
        timeout=60,
    )
    assert r2.status_code == 200, r2.text
    data = r2.json()
    assert "orden" in data and "whatsapp" in data
    assert data["orden"]["tecnico_id"] == tecnico_user["id"]
    return orden_id


def _get_orden_without_tecnico(admin_headers):
    r = requests.get(f"{BASE_URL}/api/admin/ordenes", headers=admin_headers, timeout=30)
    assert r.status_code == 200
    for o in r.json():
        if not o.get("tecnico_id"):
            return o["id"]
    return None


# ---------- regression: asignar ----------

class TestAsignarRegression:
    def test_patch_asignar_returns_orden_and_whatsapp(self, admin_headers, tecnico_user):
        orden_id = _get_or_create_orden_with_tecnico(admin_headers, tecnico_user)
        # Now reassign again to ensure idempotency
        r = requests.patch(
            f"{BASE_URL}/api/admin/ordenes/{orden_id}/asignar",
            json={"tecnico_id": tecnico_user["id"]},
            headers=admin_headers,
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["orden"]["id"] == orden_id
        assert body["orden"]["tecnico_id"] == tecnico_user["id"]
        wa = body["whatsapp"]
        assert "mode" in wa
        assert wa["mode"] in ("sent", "fallback_link", "no_phone", "error")


# ---------- new endpoint: reenviar-whatsapp ----------

class TestReenviarWhatsapp:

    def test_reenviar_with_assigned_tecnico_returns_200(self, admin_headers, tecnico_user):
        orden_id = _get_or_create_orden_with_tecnico(admin_headers, tecnico_user)
        r = requests.post(
            f"{BASE_URL}/api/admin/ordenes/{orden_id}/reenviar-whatsapp",
            headers=admin_headers,
            timeout=60,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        assert "orden" in body
        assert "whatsapp" in body
        wa = body["whatsapp"]
        assert "mode" in wa
        # Accept any valid send-result mode
        assert wa["mode"] in ("sent", "fallback_link", "no_phone", "error"), wa
        # orden must still have the tecnico assigned
        assert body["orden"]["id"] == orden_id
        assert body["orden"]["tecnico_id"] == tecnico_user["id"]
        # whatsapp_last should be updated on the orden
        assert body["orden"].get("whatsapp_last") is not None

    def test_reenviar_without_tecnico_returns_400(self, admin_headers):
        """Create a brand-new orden without tecnico, then try to reenviar."""
        # We need a cliente + sucursal to create one. Use existing ones.
        r = requests.get(f"{BASE_URL}/api/admin/clientes", headers=admin_headers, timeout=30)
        clientes = r.json() if r.status_code == 200 else []
        if not clientes:
            pytest.skip("Sin clientes para crear orden de test")
        cliente_id = clientes[0]["id"]
        r = requests.get(
            f"{BASE_URL}/api/admin/comercios", headers=admin_headers, timeout=30
        )
        if r.status_code != 200:
            pytest.skip("admin/comercios no disponible")
        sucursales = [c for c in r.json() if c.get("cliente_id") == cliente_id]
        if not sucursales:
            pytest.skip("Sin sucursales para este cliente")
        sucursal_id = sucursales[0]["id"]

        payload = {
            "cliente_id": cliente_id,
            "sucursal_id": sucursal_id,
            "tecnico_id": None,
            "titulo": f"TEST_iter3_{uuid.uuid4().hex[:6]}",
            "descripcion": "Test orden sin tecnico",
            "prioridad": "media",
            "serie": None,
            "modelo": None,
            "ddll": None,
            "fecha_limite": None,
        }
        r = requests.post(
            f"{BASE_URL}/api/admin/ordenes",
            json=payload,
            headers=admin_headers,
            timeout=30,
        )
        assert r.status_code == 201, r.text
        new_orden = r.json()
        assert new_orden.get("tecnico_id") in (None, "", None)
        new_id = new_orden["id"]

        r = requests.post(
            f"{BASE_URL}/api/admin/ordenes/{new_id}/reenviar-whatsapp",
            headers=admin_headers,
            timeout=30,
        )
        assert r.status_code == 400, f"Expected 400, got {r.status_code} {r.text}"
        body = r.json()
        # Detail should explain tecnico is missing (Spanish)
        assert "técnico" in body.get("detail", "").lower() or "tecnico" in body.get("detail", "").lower()

    def test_reenviar_nonexistent_orden_returns_404(self, admin_headers):
        fake_id = f"nonexistent-{uuid.uuid4().hex}"
        r = requests.post(
            f"{BASE_URL}/api/admin/ordenes/{fake_id}/reenviar-whatsapp",
            headers=admin_headers,
            timeout=30,
        )
        assert r.status_code == 404, f"Expected 404, got {r.status_code} {r.text}"

    def test_reenviar_without_auth_returns_401_or_403(self, admin_headers, tecnico_user):
        orden_id = _get_or_create_orden_with_tecnico(admin_headers, tecnico_user)
        r = requests.post(
            f"{BASE_URL}/api/admin/ordenes/{orden_id}/reenviar-whatsapp",
            timeout=30,
        )
        assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code} {r.text}"

    def test_reenviar_as_tecnico_returns_403(self, tecnico_headers, admin_headers, tecnico_user):
        """Tecnico role should NOT be allowed to call this admin endpoint."""
        orden_id = _get_or_create_orden_with_tecnico(admin_headers, tecnico_user)
        r = requests.post(
            f"{BASE_URL}/api/admin/ordenes/{orden_id}/reenviar-whatsapp",
            headers=tecnico_headers,
            timeout=30,
        )
        assert r.status_code in (401, 403), f"Expected 403, got {r.status_code} {r.text}"
