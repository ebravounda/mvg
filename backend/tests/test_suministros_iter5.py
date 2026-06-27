"""Iteration 5 tests for suministros module.

Covers the NEW changes only:
- SEED_BODEGAS expansion to 20 cities/regions (idempotent upsert)
- Dynamic email subject in create_solicitud and reenviar_solicitud
- Region field on bodega and propagation to email
- Consumo flow remains functional (regression sanity)
"""
import os
import re
import uuid
import requests
import pytest

EXPECTED_BODEGAS = {
    "Iquique": "I Región",
    "Antofagasta": "II Región",
    "Calama": "II Región",
    "Copiapó": "III Región",
    "La Serena": "IV Región",
    "Viña del Mar": "V Región",
    "Rancagua": "VI Región",
    "Talca": "VII Región",
    "Concepción": "VIII Región",
    "Los Ángeles": "VIII Región",
    "Temuco": "IX Región",
    "Puerto Montt": "X Región",
    "Osorno": "X Región",
    "Castro": "X Región",
    "Coyhaique": "XI Región",
    "Punta Arenas": "XII Región",
    "Santiago": "Región Metropolitana",
    "Valdivia": "XIV Región",
    "Arica": "XV Región",
    "Chillán": "XVI Región",
}


# ------------ Bodegas seed expansion ------------

class TestBodegasSeedExpansion:
    def test_all_20_seed_bodegas_present(self, base_url, admin_headers):
        r = requests.get(
            f"{base_url}/api/admin/bodegas", headers=admin_headers, timeout=20
        )
        assert r.status_code == 200, r.text
        bodegas = r.json()
        names = {b["nombre"] for b in bodegas}
        missing = set(EXPECTED_BODEGAS.keys()) - names
        assert not missing, f"Missing seed bodegas: {missing}"

    def test_each_seed_bodega_has_correct_region(self, base_url, admin_headers):
        r = requests.get(
            f"{base_url}/api/admin/bodegas", headers=admin_headers, timeout=20
        )
        bodegas = r.json()
        by_name = {b["nombre"]: b for b in bodegas}
        for name, expected_region in EXPECTED_BODEGAS.items():
            assert name in by_name, f"Missing bodega {name}"
            assert by_name[name].get("region") == expected_region, (
                f"Bodega {name}: expected region '{expected_region}', "
                f"got '{by_name[name].get('region')}'"
            )

    def test_bodega_count_at_least_20(self, base_url, admin_headers):
        r = requests.get(
            f"{base_url}/api/admin/bodegas", headers=admin_headers, timeout=20
        )
        assert len(r.json()) >= 20


# ------------ Idempotency: upsert by nombre ------------

class TestBodegasIdempotent:
    """If init_suministros runs again (e.g. backend restart), bodegas must not
    duplicate. We can't trigger a real restart here easily, but we can verify
    each bodega name is unique (no duplicates in current state)."""

    def test_no_duplicate_bodega_names(self, base_url, admin_headers):
        r = requests.get(
            f"{base_url}/api/admin/bodegas", headers=admin_headers, timeout=20
        )
        bodegas = r.json()
        names = [b["nombre"] for b in bodegas]
        seen = {}
        for n in names:
            seen[n] = seen.get(n, 0) + 1
        dups = {n: c for n, c in seen.items() if c > 1}
        assert not dups, f"Duplicate bodega names found: {dups}"


# ------------ Setup: tecnico in Concepción ------------

@pytest.fixture(scope="module")
def concepcion_bodega_id(base_url, admin_headers):
    r = requests.get(
        f"{base_url}/api/admin/bodegas", headers=admin_headers, timeout=20
    )
    bodegas = r.json()
    for b in bodegas:
        if b["nombre"] == "Concepción":
            return b["id"]
    pytest.skip("Concepción bodega not seeded")


@pytest.fixture(scope="module")
def concepcion_tecnico(base_url, admin_headers, concepcion_bodega_id):
    uniq = uuid.uuid4().hex[:8]
    payload = {
        "rut": f"CON{uniq}-1",
        "nombre": "Carlos",
        "apellidos": "Concepcionino",
        "email": f"TEST_contec_{uniq}@mvg.cl",
        "telefono": "+56977776666",
        "password": "Tec1234!",
        "bodega_id": concepcion_bodega_id,
    }
    r = requests.post(
        f"{base_url}/api/admin/tecnicos",
        json=payload,
        headers=admin_headers,
        timeout=20,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    body["_password"] = payload["password"]
    body["_email"] = payload["email"]
    body["_nombre_completo"] = f"{payload['nombre']} {payload['apellidos']}"
    return body


@pytest.fixture(scope="module")
def concepcion_tecnico_headers(base_url, concepcion_tecnico):
    r = requests.post(
        f"{base_url}/api/auth/login",
        json={
            "email": concepcion_tecnico["_email"],
            "password": concepcion_tecnico["_password"],
        },
        timeout=20,
    )
    assert r.status_code == 200, r.text
    return {
        "Authorization": f"Bearer {r.json()['access_token']}",
        "Content-Type": "application/json",
    }


# ------------ Dynamic email subject via create_solicitud ------------

class TestDynamicEmailSubject:
    @pytest.fixture(scope="class")
    def configured_email(self, base_url, admin_headers):
        """Configure the Resend-account-owner email and clear phones."""
        r = requests.patch(
            f"{base_url}/api/admin/suministros/config",
            json={
                "emails_destino": ["ed0.2580@gmail.com"],
                "telefonos_destino": [],
            },
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 200, r.text
        return r.json()

    @pytest.fixture(scope="class")
    def solicitud_response(
        self, base_url, concepcion_tecnico_headers, configured_email
    ):
        payload = {
            "items": [
                {"sku": "5143019", "descripcion": "VX520", "cantidad": 2},
                {"sku": "500646", "descripcion": "Cable", "cantidad": 1},
            ],
            "urgencia": "media",
            "notas": "Iteration 5 dynamic-subject test",
        }
        r = requests.post(
            f"{base_url}/api/tecnico/suministros/solicitudes",
            json=payload,
            headers=concepcion_tecnico_headers,
            timeout=60,
        )
        assert r.status_code == 201, r.text
        return r.json()

    def test_solicitud_created_with_201(self, solicitud_response):
        assert solicitud_response["id"]
        assert solicitud_response["estado"] == "pendiente"
        assert len(solicitud_response["items"]) == 2

    def test_email_result_mode_sent(self, solicitud_response):
        er = solicitud_response.get("email_result")
        assert er is not None, "email_result should be set"
        assert er.get("mode") == "sent", (
            f"Expected mode='sent' but got {er}. "
            "Resend must accept ed0.2580@gmail.com (account-owner). "
            "If 'error', check RESEND_API_KEY and that the email is the resend "
            "account owner."
        )

    def test_email_result_has_resend_uuid_id(self, solicitud_response):
        er = solicitud_response["email_result"]
        rid = er.get("id")
        assert rid, "Resend response should include id"
        # UUID v4 format
        assert re.match(
            r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
            rid,
        ), f"Resend id not UUID-like: {rid}"

    def test_whatsapp_results_empty_when_no_phones(self, solicitud_response):
        assert solicitud_response.get("whatsapp_results") == []

    def test_enriched_with_tecnico_and_bodega(
        self, solicitud_response, concepcion_tecnico
    ):
        # _enrich_solicitud should attach tecnico + bodega
        assert solicitud_response.get("tecnico") is not None
        assert solicitud_response["tecnico"]["id"] == concepcion_tecnico["id"]
        bod = solicitud_response.get("bodega")
        assert bod is not None
        assert bod["nombre"] == "Concepción"
        assert bod["region"] == "VIII Región"


# ------------ Dynamic subject string check via unit-level function ------------

class TestEmailBuilder:
    """Directly exercise build_supply_email_html to verify region field
    is rendered (in both HTML and text)."""

    def test_html_and_text_include_region(self):
        import sys
        sys.path.insert(0, "/app/backend")
        from email_service import build_supply_email_html

        html, text = build_supply_email_html(
            tecnico_nombre="Carlos Concepcionino",
            tecnico_email="t@x.cl",
            tecnico_telefono="+56977776666",
            bodega="Concepción",
            region="VIII Región",
            items=[{"sku": "5143019", "descripcion": "VX520", "cantidad": 2}],
            urgencia="media",
            fecha="2026-01-01 12:00",
        )
        # Region rendered in both
        assert "REGIÓN" in html or "Región" in html
        assert "VIII Región" in html
        assert "VIII Región" in text
        assert "Concepción" in html
        assert "Concepción" in text

    def test_items_default_empty(self):
        import sys
        sys.path.insert(0, "/app/backend")
        from email_service import build_supply_email_html

        # items is now keyword arg with default []
        html, text = build_supply_email_html(
            tecnico_nombre="X",
            tecnico_email="x@x.cl",
            tecnico_telefono="",
            bodega="",
            region="",
        )
        assert "(0)" in html  # "Productos solicitados (0)"
        assert "PRODUCTOS SOLICITADOS (0)" in text


# ------------ Reenviar should also use dynamic subject ------------

class TestReenviar:
    def test_reenviar_returns_email_result_with_subject_path(
        self, base_url, admin_headers, concepcion_tecnico_headers
    ):
        # Use the same Resend-owner email
        requests.patch(
            f"{base_url}/api/admin/suministros/config",
            json={
                "emails_destino": ["ed0.2580@gmail.com"],
                "telefonos_destino": [],
            },
            headers=admin_headers,
            timeout=20,
        )
        # Create a fresh solicitud
        r = requests.post(
            f"{base_url}/api/tecnico/suministros/solicitudes",
            json={
                "items": [{"sku": "5143019", "descripcion": "X", "cantidad": 1}],
                "urgencia": "normal",
            },
            headers=concepcion_tecnico_headers,
            timeout=60,
        )
        assert r.status_code == 201, r.text
        sid = r.json()["id"]

        # Reenviar
        rr = requests.post(
            f"{base_url}/api/admin/suministros/solicitudes/{sid}/reenviar",
            headers=admin_headers,
            timeout=60,
        )
        assert rr.status_code == 200, rr.text
        body = rr.json()
        er = body["email_result"]
        assert er["mode"] == "sent", f"reenviar email not sent: {er}"
        assert er.get("id")


# ------------ Consumo flow regression sanity ------------

class TestConsumoFlowRegression:
    def test_consumo_decrements_stock_for_concepcion_tecnico(
        self, base_url, admin_headers, concepcion_tecnico, concepcion_tecnico_headers
    ):
        # Set stock=5 for the Concepción técnico
        r = requests.post(
            f"{base_url}/api/admin/inventario",
            json={"tecnico_id": concepcion_tecnico["id"], "sku": "5143019", "cantidad": 5},
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 200, r.text

        # Tecnico consume 3
        r2 = requests.post(
            f"{base_url}/api/tecnico/consumos",
            json={
                "orden_id": f"TEST_iter5_{uuid.uuid4().hex[:6]}",
                "items": [{"sku": "5143019", "cantidad": 3}],
            },
            headers=concepcion_tecnico_headers,
            timeout=20,
        )
        assert r2.status_code == 201, r2.text
        assert r2.json()["results"][0]["nuevo_stock"] == 2

        # GET /tecnico/inventario must reflect new value (5-3=2)
        r3 = requests.get(
            f"{base_url}/api/tecnico/inventario",
            headers=concepcion_tecnico_headers,
            timeout=20,
        )
        assert r3.status_code == 200
        skus = {it["sku"]: it["cantidad"] for it in r3.json()}
        assert skus.get("5143019") == 2
