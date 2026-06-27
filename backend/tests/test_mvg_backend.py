"""Backend tests for MVG Computación API."""
import uuid
import requests

# 1x1 transparent PNG base64
SAMPLE_IMG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


# ---------------- Auth ----------------
class TestAuth:
    def test_login_admin_success(self, base_url):
        r = requests.post(
            f"{base_url}/api/auth/login",
            json={"email": "admin@mvg.cl", "password": "Admin123!"},
            timeout=30,
        )
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"
        assert data["user"]["email"] == "admin@mvg.cl"
        assert "hashed_password" not in data["user"]

    def test_login_invalid_credentials(self, base_url):
        r = requests.post(
            f"{base_url}/api/auth/login",
            json={"email": "admin@mvg.cl", "password": "wrongpass"},
            timeout=30,
        )
        assert r.status_code == 401

    def test_login_unknown_user(self, base_url):
        r = requests.post(
            f"{base_url}/api/auth/login",
            json={"email": "noexiste@mvg.cl", "password": "whatever"},
            timeout=30,
        )
        assert r.status_code == 401

    def test_auth_me_with_token(self, base_url, admin_headers):
        r = requests.get(f"{base_url}/api/auth/me", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        u = r.json()
        assert u["role"] == "admin"
        assert u["email"] == "admin@mvg.cl"
        assert "hashed_password" not in u

    def test_auth_me_without_token(self, base_url):
        r = requests.get(f"{base_url}/api/auth/me", timeout=30)
        assert r.status_code == 401


# ---------------- Admin: Técnicos ----------------
class TestTecnicos:
    def test_create_and_list_tecnico(self, base_url, admin_headers, tecnico_user):
        # tecnico_user fixture creates one; verify in list
        r = requests.get(f"{base_url}/api/admin/tecnicos", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        items = r.json()
        ids = [t["id"] for t in items]
        assert tecnico_user["id"] in ids
        for t in items:
            assert t["role"] == "tecnico"
            assert "hashed_password" not in t

    def test_duplicate_email_returns_400(self, base_url, admin_headers, tecnico_creds):
        payload = {**tecnico_creds, "rut": f"OTHER{uuid.uuid4().hex[:6]}-1"}
        r = requests.post(
            f"{base_url}/api/admin/tecnicos", json=payload, headers=admin_headers, timeout=30
        )
        assert r.status_code == 400

    def test_duplicate_rut_returns_400(self, base_url, admin_headers, tecnico_creds):
        payload = {
            **tecnico_creds,
            "email": f"TEST_dup_{uuid.uuid4().hex[:6]}@mvg.cl",
        }
        r = requests.post(
            f"{base_url}/api/admin/tecnicos", json=payload, headers=admin_headers, timeout=30
        )
        assert r.status_code == 400


# ---------------- Admin: Clientes & Sucursales ----------------
class TestClientesSucursales:
    def test_create_list_get_cliente_with_sucursales(self, base_url, admin_headers):
        # Create cliente
        cli_payload = {
            "nombre": f"TEST_Cliente_{uuid.uuid4().hex[:6]}",
            "rut": "76.123.456-7",
            "contacto": "Tester",
            "email": "test_cliente@example.com",
            "telefono": "+56911111111",
            "direccion": "Av. Test 123",
        }
        rc = requests.post(
            f"{base_url}/api/admin/clientes",
            json=cli_payload,
            headers=admin_headers,
            timeout=30,
        )
        assert rc.status_code == 201
        cliente = rc.json()
        assert cliente["nombre"] == cli_payload["nombre"]
        assert "id" in cliente
        cli_id = cliente["id"]

        # List clientes
        rl = requests.get(
            f"{base_url}/api/admin/clientes", headers=admin_headers, timeout=30
        )
        assert rl.status_code == 200
        assert any(c["id"] == cli_id for c in rl.json())

        # Create sucursal
        suc_payload = {
            "cliente_id": cli_id,
            "nombre": "TEST_Sucursal Centro",
            "direccion": "Calle 1",
            "telefono": "+5612345",
            "encargado": "Pepe",
        }
        rs = requests.post(
            f"{base_url}/api/admin/sucursales",
            json=suc_payload,
            headers=admin_headers,
            timeout=30,
        )
        assert rs.status_code == 201
        sucursal = rs.json()
        assert sucursal["cliente_id"] == cli_id
        suc_id = sucursal["id"]

        # GET cliente by id should include sucursales
        rg = requests.get(
            f"{base_url}/api/admin/clientes/{cli_id}", headers=admin_headers, timeout=30
        )
        assert rg.status_code == 200
        body = rg.json()
        assert body["id"] == cli_id
        assert "sucursales" in body
        assert any(s["id"] == suc_id for s in body["sucursales"])

        # Cascade delete
        rd = requests.delete(
            f"{base_url}/api/admin/clientes/{cli_id}", headers=admin_headers, timeout=30
        )
        assert rd.status_code == 200
        rg2 = requests.get(
            f"{base_url}/api/admin/clientes/{cli_id}", headers=admin_headers, timeout=30
        )
        assert rg2.status_code == 404
        # Verify sucursales also deleted
        rsl = requests.get(
            f"{base_url}/api/admin/sucursales?cliente_id={cli_id}",
            headers=admin_headers,
            timeout=30,
        )
        assert rsl.status_code == 200
        assert rsl.json() == []


# ---------------- Admin: Órdenes ----------------
class TestOrdenes:
    def _create_cliente_sucursal(self, base_url, admin_headers):
        cli = requests.post(
            f"{base_url}/api/admin/clientes",
            json={"nombre": f"TEST_Cli_{uuid.uuid4().hex[:6]}"},
            headers=admin_headers,
            timeout=30,
        ).json()
        suc = requests.post(
            f"{base_url}/api/admin/sucursales",
            json={"cliente_id": cli["id"], "nombre": "Suc Test"},
            headers=admin_headers,
            timeout=30,
        ).json()
        return cli, suc

    def test_create_orden_and_list(self, base_url, admin_headers, tecnico_user):
        cli, suc = self._create_cliente_sucursal(base_url, admin_headers)
        payload = {
            "cliente_id": cli["id"],
            "sucursal_id": suc["id"],
            "tecnico_id": tecnico_user["id"],
            "titulo": "TEST Orden",
            "descripcion": "Probar flujo",
            "prioridad": "media",
        }
        r = requests.post(
            f"{base_url}/api/admin/ordenes",
            json=payload,
            headers=admin_headers,
            timeout=30,
        )
        assert r.status_code == 201, r.text
        orden = r.json()
        assert orden["estado"] == "pendiente"
        assert orden["cliente"]["id"] == cli["id"]
        assert orden["sucursal"]["id"] == suc["id"]
        assert orden["tecnico"]["id"] == tecnico_user["id"]
        assert "numero" in orden and orden["numero"].startswith("OS-")

        # List enriched
        rl = requests.get(
            f"{base_url}/api/admin/ordenes", headers=admin_headers, timeout=30
        )
        assert rl.status_code == 200
        found = [o for o in rl.json() if o["id"] == orden["id"]]
        assert found and found[0]["cliente"] is not None
        # cleanup
        requests.delete(
            f"{base_url}/api/admin/ordenes/{orden['id']}",
            headers=admin_headers,
            timeout=30,
        )
        requests.delete(
            f"{base_url}/api/admin/clientes/{cli['id']}",
            headers=admin_headers,
            timeout=30,
        )

    def test_admin_stats(self, base_url, admin_headers):
        r = requests.get(f"{base_url}/api/admin/stats", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        s = r.json()
        for key in (
            "total_ordenes",
            "en_progreso",
            "pendientes",
            "finalizadas",
            "total_clientes",
            "total_tecnicos",
        ):
            assert key in s, f"Missing key: {key}"
            assert isinstance(s[key], int)


# ---------------- Tecnico flow ----------------
class TestTecnicoFlow:
    def test_tecnico_only_sees_own_ordenes(
        self, base_url, admin_headers, tecnico_headers, tecnico_user
    ):
        # Create cliente + sucursal + orden assigned to this tecnico
        cli = requests.post(
            f"{base_url}/api/admin/clientes",
            json={"nombre": f"TEST_Cli_{uuid.uuid4().hex[:6]}"},
            headers=admin_headers,
            timeout=30,
        ).json()
        suc = requests.post(
            f"{base_url}/api/admin/sucursales",
            json={"cliente_id": cli["id"], "nombre": "Suc"},
            headers=admin_headers,
            timeout=30,
        ).json()
        orden = requests.post(
            f"{base_url}/api/admin/ordenes",
            json={
                "cliente_id": cli["id"],
                "sucursal_id": suc["id"],
                "tecnico_id": tecnico_user["id"],
                "titulo": "TEST Flujo",
                "descripcion": "test",
                "prioridad": "alta",
            },
            headers=admin_headers,
            timeout=30,
        ).json()

        # Tecnico lists ordenes -> sees own
        r = requests.get(
            f"{base_url}/api/tecnico/ordenes", headers=tecnico_headers, timeout=30
        )
        assert r.status_code == 200
        ids = [o["id"] for o in r.json()]
        assert orden["id"] in ids
        # All should belong to tecnico
        for o in r.json():
            assert o["tecnico_id"] == tecnico_user["id"]

        # Iniciar
        ri = requests.patch(
            f"{base_url}/api/tecnico/ordenes/{orden['id']}/iniciar",
            headers=tecnico_headers,
            timeout=30,
        )
        assert ri.status_code == 200
        assert ri.json()["estado"] == "en_progreso"

        # Finalizar without lat/lng -> 422 (iter7: OrdenFinalizar requires lat/lng)
        rf_no_geo = requests.patch(
            f"{base_url}/api/tecnico/ordenes/{orden['id']}/finalizar",
            json={"evidencia_base64": SAMPLE_IMG_B64, "notas": "sin geo"},
            headers=tecnico_headers,
            timeout=30,
        )
        assert rf_no_geo.status_code == 422

        # Finalizar without evidencia -> 400 (pydantic requires field; send empty string)
        rf_bad = requests.patch(
            f"{base_url}/api/tecnico/ordenes/{orden['id']}/finalizar",
            json={"evidencia_base64": "", "notas": "sin foto", "lat": 1.0, "lng": 2.0},
            headers=tecnico_headers,
            timeout=30,
        )
        assert rf_bad.status_code == 400

        # Finalizar with evidencia + geo -> 200
        rf = requests.patch(
            f"{base_url}/api/tecnico/ordenes/{orden['id']}/finalizar",
            json={
                "evidencia_base64": SAMPLE_IMG_B64,
                "notas": "ok",
                "lat": 40.4168,
                "lng": -3.7038,
                "address": "Test",
            },
            headers=tecnico_headers,
            timeout=30,
        )
        assert rf.status_code == 200, rf.text
        body = rf.json()
        assert body["estado"] == "finalizada"
        assert body["evidencia_base64"] == SAMPLE_IMG_B64
        assert body["finalized_at"] is not None

        # GET /api/ordenes/{id} as tecnico -> ok (own orden)
        rg = requests.get(
            f"{base_url}/api/ordenes/{orden['id']}", headers=tecnico_headers, timeout=30
        )
        assert rg.status_code == 200

        # cleanup
        requests.delete(
            f"{base_url}/api/admin/ordenes/{orden['id']}",
            headers=admin_headers,
            timeout=30,
        )
        requests.delete(
            f"{base_url}/api/admin/clientes/{cli['id']}",
            headers=admin_headers,
            timeout=30,
        )

    def test_tecnico_cannot_access_other_orden(
        self, base_url, admin_headers, tecnico_headers, tecnico_user
    ):
        # Create another tecnico + orden assigned to that other
        other_creds = {
            "rut": f"OTHER{uuid.uuid4().hex[:6]}-K",
            "nombre": "Otro",
            "apellidos": "TestT",
            "email": f"TEST_other_{uuid.uuid4().hex[:6]}@mvg.cl",
            "telefono": "+56999999999",
            "password": "Otro1234!",
        }
        other = requests.post(
            f"{base_url}/api/admin/tecnicos",
            json=other_creds,
            headers=admin_headers,
            timeout=30,
        ).json()

        cli = requests.post(
            f"{base_url}/api/admin/clientes",
            json={"nombre": f"TEST_Cli2_{uuid.uuid4().hex[:6]}"},
            headers=admin_headers,
            timeout=30,
        ).json()
        suc = requests.post(
            f"{base_url}/api/admin/sucursales",
            json={"cliente_id": cli["id"], "nombre": "Suc2"},
            headers=admin_headers,
            timeout=30,
        ).json()
        orden = requests.post(
            f"{base_url}/api/admin/ordenes",
            json={
                "cliente_id": cli["id"],
                "sucursal_id": suc["id"],
                "tecnico_id": other["id"],
                "titulo": "TEST Otro",
                "descripcion": "ajeno",
                "prioridad": "baja",
            },
            headers=admin_headers,
            timeout=30,
        ).json()

        # Our tecnico tries to access this orden -> 403
        r = requests.get(
            f"{base_url}/api/ordenes/{orden['id']}", headers=tecnico_headers, timeout=30
        )
        assert r.status_code == 403

        # cleanup
        requests.delete(
            f"{base_url}/api/admin/ordenes/{orden['id']}",
            headers=admin_headers,
            timeout=30,
        )
        requests.delete(
            f"{base_url}/api/admin/clientes/{cli['id']}",
            headers=admin_headers,
            timeout=30,
        )
        requests.delete(
            f"{base_url}/api/admin/tecnicos/{other['id']}",
            headers=admin_headers,
            timeout=30,
        )


# ---------------- Role enforcement ----------------
class TestRoleEnforcement:
    def test_tecnico_cannot_call_admin_endpoints(self, base_url, tecnico_headers):
        r = requests.post(
            f"{base_url}/api/admin/clientes",
            json={"nombre": "TEST_NoDebe"},
            headers=tecnico_headers,
            timeout=30,
        )
        assert r.status_code == 403

        r2 = requests.get(
            f"{base_url}/api/admin/tecnicos", headers=tecnico_headers, timeout=30
        )
        assert r2.status_code == 403

        r3 = requests.get(
            f"{base_url}/api/admin/stats", headers=tecnico_headers, timeout=30
        )
        assert r3.status_code == 403
