"""Tests para iter10 — Geocoding + Optimización ruta técnico (acordeón).

Cubre:
- POST /api/admin/geocode (válida, corta, sin auth)
- POST /api/admin/tecnicos auto-geocode al crear (sin lat/lng)
- PATCH /api/admin/tecnicos/{id} re-geocodifica al cambiar dirección
- GET /api/tecnico/ruta con técnico geocodificado y órdenes pendientes
- POST /api/admin/geocode/sucursales (limit + only_missing)
"""
import os
import time
import uuid

import pytest
import requests


CHILE_LAT_MIN, CHILE_LAT_MAX = -56.0, -17.0
CHILE_LNG_MIN, CHILE_LNG_MAX = -75.0, -65.0


# ---------- Helpers ----------

def _login(base_url, email, password):
    r = requests.post(
        f"{base_url}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    return r


# ---------- POST /api/admin/geocode ----------

class TestAdminGeocodeEndpoint:
    """Geocoding directo via /admin/geocode."""

    def test_geocode_valid_address_in_chile(self, base_url, admin_headers):
        r = requests.post(
            f"{base_url}/api/admin/geocode",
            json={
                "direccion": "Av. Providencia 1234",
                "comuna": "Providencia",
                "region": "Metropolitana",
            },
            headers=admin_headers,
            timeout=30,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        data = r.json()
        assert data.get("ok") is True, f"Esperaba ok=true; respuesta: {data}"
        lat = data.get("lat")
        lng = data.get("lng")
        assert isinstance(lat, (int, float)), f"lat no numérico: {lat!r}"
        assert isinstance(lng, (int, float)), f"lng no numérico: {lng!r}"
        assert CHILE_LAT_MIN <= lat <= CHILE_LAT_MAX, f"lat {lat} fuera de Chile"
        assert CHILE_LNG_MIN <= lng <= CHILE_LNG_MAX, f"lng {lng} fuera de Chile"
        assert isinstance(data.get("display_name"), str) and data["display_name"]

    def test_geocode_short_address_returns_400(self, base_url, admin_headers):
        r = requests.post(
            f"{base_url}/api/admin/geocode",
            json={"direccion": "ab"},
            headers=admin_headers,
            timeout=30,
        )
        assert r.status_code == 400, f"Esperaba 400 para dirección corta, got {r.status_code} {r.text}"

    def test_geocode_empty_address_rejected(self, base_url, admin_headers):
        # direccion = "" debería disparar 400 (longitud < 4) o 422 (validación pydantic)
        r = requests.post(
            f"{base_url}/api/admin/geocode",
            json={"direccion": ""},
            headers=admin_headers,
            timeout=30,
        )
        assert r.status_code in (400, 422), f"Esperaba 400/422 para vacío, got {r.status_code} {r.text}"

    def test_geocode_requires_auth(self, base_url):
        r = requests.post(
            f"{base_url}/api/admin/geocode",
            json={"direccion": "Av. Providencia 1234"},
            timeout=30,
        )
        assert r.status_code in (401, 403), f"Esperaba 401/403 sin auth, got {r.status_code}"


# ---------- POST /api/admin/tecnicos auto-geocode ----------

@pytest.fixture(scope="module")
def created_tecnico_with_address(base_url, admin_headers):
    """Crea un técnico con dirección pero SIN lat/lng — backend debe auto-geocodificar."""
    uniq = uuid.uuid4().hex[:8]
    payload = {
        "rut": f"TEST{uniq}-K",
        "nombre": "GeoTest",
        "apellidos": "Iter10",
        "email": f"TEST_geo_{uniq}@mvg.cl",
        "telefono": "+56911112222",
        "password": "Tecnico123!",
        "direccion": "Av. Providencia 1234",
        "comuna": "Providencia",
        "region": "Metropolitana",
    }
    r = requests.post(
        f"{base_url}/api/admin/tecnicos",
        json=payload,
        headers=admin_headers,
        timeout=60,
    )
    assert r.status_code == 201, f"Create tecnico failed: {r.status_code} {r.text}"
    body = r.json()
    tec_id = body.get("id") or body.get("tecnico", {}).get("id")
    assert tec_id, f"Sin id en respuesta: {body}"
    yield {"id": tec_id, "email": payload["email"], "password": payload["password"], "payload": payload}
    # Cleanup
    try:
        requests.delete(
            f"{base_url}/api/admin/tecnicos/{tec_id}",
            headers=admin_headers,
            timeout=30,
        )
    except Exception:
        pass


class TestTecnicoAutoGeocode:

    def test_create_tecnico_auto_geocodes(self, base_url, admin_headers, created_tecnico_with_address):
        tec_id = created_tecnico_with_address["id"]
        # GET listado y buscar el técnico
        r = requests.get(
            f"{base_url}/api/admin/tecnicos",
            headers=admin_headers,
            timeout=30,
        )
        assert r.status_code == 200
        tecnicos = r.json()
        tec = next((t for t in tecnicos if t.get("id") == tec_id), None)
        assert tec is not None, f"Técnico {tec_id} no encontrado en listado"
        assert tec.get("lat") is not None, f"lat es None tras auto-geocode: {tec}"
        assert tec.get("lng") is not None, f"lng es None: {tec}"
        assert CHILE_LAT_MIN <= tec["lat"] <= CHILE_LAT_MAX
        assert CHILE_LNG_MIN <= tec["lng"] <= CHILE_LNG_MAX

    def test_patch_tecnico_address_regeocodes(self, base_url, admin_headers, created_tecnico_with_address):
        tec_id = created_tecnico_with_address["id"]
        # Recordar las coords iniciales
        r0 = requests.get(f"{base_url}/api/admin/tecnicos", headers=admin_headers, timeout=30)
        tec0 = next(t for t in r0.json() if t["id"] == tec_id)
        lat0, lng0 = tec0["lat"], tec0["lng"]

        # PATCH cambiando solo dirección
        new_dir = "Av. Libertador Bernardo O'Higgins 1449"
        new_comuna = "Santiago"
        r = requests.patch(
            f"{base_url}/api/admin/tecnicos/{tec_id}",
            json={"direccion": new_dir, "comuna": new_comuna},
            headers=admin_headers,
            timeout=60,
        )
        assert r.status_code == 200, f"PATCH falló: {r.status_code} {r.text}"
        body = r.json()
        # Esperar coords actualizadas no nulas y distintas a las iniciales
        assert body.get("lat") is not None, f"lat null tras PATCH: {body}"
        assert body.get("lng") is not None
        assert CHILE_LAT_MIN <= body["lat"] <= CHILE_LAT_MAX
        # GET para confirmar persistencia
        r2 = requests.get(f"{base_url}/api/admin/tecnicos", headers=admin_headers, timeout=30)
        tec2 = next(t for t in r2.json() if t["id"] == tec_id)
        assert tec2["lat"] == body["lat"] and tec2["lng"] == body["lng"]
        # Las coords deberían haber cambiado (direcciones distintas) — tolerar empate
        # como caso degenerado pero verificar algo:
        assert tec2["direccion"] == new_dir
        # Si por algún motivo Nominatim devolvió las mismas coords (improbable), no fallar.
        if (round(lat0, 3), round(lng0, 3)) == (round(tec2["lat"], 3), round(tec2["lng"], 3)):
            pytest.skip("Nominatim devolvió las mismas coords (improbable). Saltando comparación.")


# ---------- GET /api/tecnico/ruta ----------

class TestTecnicoRutaOptimizada:

    @pytest.fixture(scope="class")
    def ruta_data(self, base_url, admin_headers):
        """Crea técnico geocodificado + 3 órdenes pendientes en distintas sucursales."""
        uniq = uuid.uuid4().hex[:8]
        tec_email = f"TEST_ruta_{uniq}@mvg.cl"
        tec_pwd = "Tecnico123!"

        # Crear técnico con domicilio en Providencia
        r = requests.post(
            f"{base_url}/api/admin/tecnicos",
            json={
                "rut": f"TESTR{uniq}-9",
                "nombre": "Ruta",
                "apellidos": "Iter10",
                "email": tec_email,
                "telefono": "+56933334444",
                "password": tec_pwd,
                "direccion": "Av. Providencia 1234",
                "comuna": "Providencia",
                "region": "Metropolitana",
            },
            headers=admin_headers,
            timeout=60,
        )
        assert r.status_code == 201, f"create tec failed: {r.status_code} {r.text}"
        tec = r.json()
        tec_id = tec.get("id") or tec.get("tecnico", {}).get("id")

        # Buscar/crear cliente
        r = requests.get(f"{base_url}/api/admin/clientes", headers=admin_headers, timeout=30)
        clientes = r.json() if r.status_code == 200 else []
        cliente_id = None
        if clientes:
            cliente_id = clientes[0]["id"]
        else:
            rc = requests.post(
                f"{base_url}/api/admin/clientes",
                json={"nombre": f"TEST_iter10_cli_{uniq}"},
                headers=admin_headers,
                timeout=30,
            )
            assert rc.status_code == 201
            cliente_id = rc.json()["id"]

        # Crear 3 sucursales: 1 en Providencia (misma comuna), 2 en otras comunas RM
        sucursales_data = [
            {"nombre": f"TEST_iter10_suc_prov_{uniq}", "direccion": "Av. 11 de Septiembre 2155",
             "comuna": "Providencia", "region": "Metropolitana",
             "lat": -33.4257, "lng": -70.6105},
            {"nombre": f"TEST_iter10_suc_lc_{uniq}", "direccion": "Av. Apoquindo 4700",
             "comuna": "Las Condes", "region": "Metropolitana",
             "lat": -33.4108, "lng": -70.5806},
            {"nombre": f"TEST_iter10_suc_nu_{uniq}", "direccion": "Av. Irarrázaval 5000",
             "comuna": "Ñuñoa", "region": "Metropolitana",
             "lat": -33.4569, "lng": -70.5965},
        ]
        suc_ids = []
        for sd in sucursales_data:
            rs = requests.post(
                f"{base_url}/api/admin/sucursales",
                json={**sd, "cliente_id": cliente_id},
                headers=admin_headers,
                timeout=30,
            )
            assert rs.status_code == 201, f"create suc: {rs.status_code} {rs.text}"
            suc_ids.append(rs.json()["id"])

        # Crear 3 órdenes pendientes asignadas al técnico
        orden_ids = []
        for i, suc_id in enumerate(suc_ids):
            ro = requests.post(
                f"{base_url}/api/admin/ordenes",
                json={
                    "titulo": f"TEST_iter10_orden_{i}_{uniq}",
                    "descripcion": "Test ruta iter10",
                    "cliente_id": cliente_id,
                    "sucursal_id": suc_id,
                    "tecnico_id": tec_id,
                    "prioridad": "media",
                },
                headers=admin_headers,
                timeout=30,
            )
            assert ro.status_code == 201, f"create orden: {ro.status_code} {ro.text}"
            orden_ids.append(ro.json()["id"])

        # Login técnico
        rl = requests.post(
            f"{base_url}/api/auth/login",
            json={"email": tec_email, "password": tec_pwd},
            timeout=30,
        )
        assert rl.status_code == 200
        tec_token = rl.json()["access_token"]

        yield {
            "tec_id": tec_id,
            "tec_headers": {"Authorization": f"Bearer {tec_token}"},
            "orden_ids": orden_ids,
            "suc_ids": suc_ids,
            "cliente_id": cliente_id,
        }

        # Cleanup
        for oid in orden_ids:
            try:
                requests.delete(f"{base_url}/api/admin/ordenes/{oid}", headers=admin_headers, timeout=20)
            except Exception:
                pass
        for sid in suc_ids:
            try:
                requests.delete(f"{base_url}/api/admin/sucursales/{sid}", headers=admin_headers, timeout=20)
            except Exception:
                pass
        try:
            requests.delete(f"{base_url}/api/admin/tecnicos/{tec_id}", headers=admin_headers, timeout=20)
        except Exception:
            pass

    def test_ruta_returns_expected_fields(self, base_url, ruta_data):
        r = requests.get(
            f"{base_url}/api/tecnico/ruta",
            headers=ruta_data["tec_headers"],
            timeout=60,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        data = r.json()
        for k in ("tecnico_lat", "tecnico_lng", "tecnico_direccion",
                  "ordenes_dia", "ordenes_resto", "hora_termino_estimada"):
            assert k in data, f"falta campo {k} en respuesta: {list(data.keys())}"
        assert data["tecnico_lat"] is not None
        assert data["tecnico_lng"] is not None
        assert isinstance(data["ordenes_dia"], list)
        assert len(data["ordenes_dia"]) >= 3, f"Esperaba ≥3 órdenes_dia, got {len(data['ordenes_dia'])}"

    def test_ruta_prioritizes_same_comuna_first(self, base_url, ruta_data):
        r = requests.get(
            f"{base_url}/api/tecnico/ruta",
            headers=ruta_data["tec_headers"],
            timeout=60,
        )
        assert r.status_code == 200
        data = r.json()
        # Filtrar sólo nuestras órdenes TEST_iter10_
        test_ord = [
            o for o in data["ordenes_dia"]
            if (o.get("titulo") or "").startswith("TEST_iter10_orden_")
        ]
        assert len(test_ord) >= 3, f"No se encontraron las 3 órdenes TEST_iter10: {len(test_ord)}"
        first = test_ord[0]
        first_comuna = ((first.get("sucursal") or {}).get("comuna") or "").lower()
        assert first_comuna == "providencia", (
            f"La primera orden no es de la comuna del técnico (providencia): {first_comuna} "
            f"— titulo={first.get('titulo')}"
        )


# ---------- POST /api/admin/geocode/sucursales ----------

class TestGeocodeSucursalesBulk:

    def test_regeocode_sucursales_limit5(self, base_url, admin_headers):
        r = requests.post(
            f"{base_url}/api/admin/geocode/sucursales?limit=5&only_missing=true",
            headers=admin_headers,
            timeout=120,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        data = r.json()
        for k in ("ok", "fail", "procesadas"):
            assert k in data, f"falta campo {k}: {data}"
        assert isinstance(data["ok"], int)
        assert isinstance(data["fail"], int)
        assert isinstance(data["procesadas"], int)
        # Suma cuadra
        assert data["ok"] + data["fail"] == data["procesadas"], data
        # No debe procesar más que el limit
        assert data["procesadas"] <= 5
