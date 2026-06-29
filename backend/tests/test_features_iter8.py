"""Iteration 8 tests for the 3 new feature phases + asignación masiva.

Covered:

- Técnico fields (POST /api/admin/tecnicos):
    * direccion + comuna are accepted and persisted.

- Pin pad EXTRA (POST /api/tecnico/ordenes/{id}/pinpad-extra):
    * 200 happy-path con DDLL del mismo largo + patrón alfanumérico.
    * 400 cuando difiere la longitud ('Ingresa DDLL correctamente').
    * 400 cuando la DDLL ya existe en la orden.
    * 400 cuando no hay materiales y sin_suministros=false.
    * 200 + descuento atómico de stock cuando se pasan materiales.

- Reagendar (POST /api/tecnico/ordenes/{id}/reagendar):
    * Guarda motivo + nueva_fecha + cambia estado a 'reagendada'.
    * Mantiene historial (array reagendamientos) acumulativo.

- Ruta (GET /api/tecnico/ruta):
    * Devuelve ordenes_dia, ordenes_resto, max_dia=25, hora_inicio_sugerida='09:00',
      hora_termino_estimada, pin_pads_pendientes_dia.
    * Ordena por cercanía: misma comuna primero.

- Asignación masiva (POST /api/admin/ordenes/asignar-masivo):
    * Distribuye órdenes pasadas explícitamente entre técnicos pasados,
      respetando max_por_tecnico.
    * Respuesta { asignadas, detalle[], carga_final }.

- Stats (GET /api/admin/stats):
    * Incluye pin_pads_pendientes, tecnicos_necesarios, horas_totales_estimadas,
      pin_pads_por_tecnico_dia, reagendadas.
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


B64_PNG = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)

TEST_MARKER = "iter8"


# ---------- Mongo helpers ----------
def _mongo_db():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client, client[os.environ["DB_NAME"]]


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


# ---------- Helpers ----------
def _seed_orden(
    tecnico_id: str,
    ddlls: list,
    estado: str = "pendiente",
    comuna: str = None,
):
    """Insert a fresh test orden in MongoDB with pin pads of the given DDLLs.
    Optionally sets sucursal.comuna to `comuna` by upserting a test sucursal.
    """
    async def _do():
        client, db = _mongo_db()
        cliente = await db.clientes.find_one({}, {"_id": 0, "id": 1})
        if not cliente:
            client.close()
            return None
        if comuna:
            sucursal_id = str(uuid.uuid4())
            await db.sucursales.insert_one({
                "id": sucursal_id,
                "cliente_id": cliente["id"],
                "nombre": f"TEST_SUC_{comuna}",
                "direccion": "Calle Test 123",
                "comuna": comuna,
                "region": "Test",
                "_test_marker": TEST_MARKER,
            })
        else:
            sucursal = await db.sucursales.find_one(
                {"cliente_id": cliente["id"]}, {"_id": 0, "id": 1}
            )
            if not sucursal:
                client.close()
                return None
            sucursal_id = sucursal["id"]
        orden_id = str(uuid.uuid4())
        pin_pads = [
            {
                "id": str(uuid.uuid4()),
                "serie": f"TEST-S-{i}",
                "ddll": d,
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
            for i, d in enumerate(ddlls)
        ]
        doc = {
            "id": orden_id,
            "numero": f"OS-TEST-{uuid.uuid4().hex[:6]}",
            "cliente_id": cliente["id"],
            "sucursal_id": sucursal_id,
            "tecnico_id": tecnico_id,
            "titulo": "TEST iter8 orden",
            "descripcion": "TEST iter8",
            "prioridad": "media",
            "estado": estado,
            "evidencia_base64": None,
            "notas_tecnico": None,
            "pin_pads": pin_pads,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "_test_marker": TEST_MARKER,
        }
        await db.ordenes.insert_one(doc)
        client.close()
        return orden_id, [p["id"] for p in pin_pads], sucursal_id

    return _run(_do())


def _seed_orden_sin_asignar(comuna: str):
    async def _do():
        client, db = _mongo_db()
        cliente = await db.clientes.find_one({}, {"_id": 0, "id": 1})
        sucursal_id = str(uuid.uuid4())
        await db.sucursales.insert_one({
            "id": sucursal_id,
            "cliente_id": cliente["id"],
            "nombre": f"TEST_SUC_{comuna}_{uuid.uuid4().hex[:4]}",
            "direccion": "Calle Test",
            "comuna": comuna,
            "_test_marker": TEST_MARKER,
        })
        orden_id = str(uuid.uuid4())
        await db.ordenes.insert_one({
            "id": orden_id,
            "numero": f"OS-TEST-{uuid.uuid4().hex[:6]}",
            "cliente_id": cliente["id"],
            "sucursal_id": sucursal_id,
            "tecnico_id": None,
            "titulo": "TEST iter8 sin asignar",
            "descripcion": "TEST",
            "prioridad": "media",
            "estado": "pendiente",
            "pin_pads": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "_test_marker": TEST_MARKER,
        })
        client.close()
        return orden_id, sucursal_id
    return _run(_do())


def _cleanup_all():
    async def _do():
        client, db = _mongo_db()
        await db.ordenes.delete_many({"_test_marker": TEST_MARKER})
        await db.sucursales.delete_many({"_test_marker": TEST_MARKER})
        client.close()
    _run(_do())


def _get_inv_qty(tecnico_id: str, sku: str):
    async def _do():
        client, db = _mongo_db()
        inv = await db.inventario_tecnico.find_one(
            {"tecnico_id": tecnico_id, "sku": sku}, {"_id": 0}
        )
        client.close()
        return inv.get("cantidad") if inv else None
    return _run(_do())


def _ensure_product_and_stock(tecnico_id: str, sku: str, cantidad: int = 50):
    """Seed productos catalog + inventario for a tecnico."""
    async def _do():
        client, db = _mongo_db()
        prod = await db.productos.find_one({"sku": sku})
        if not prod:
            await db.productos.insert_one({
                "id": str(uuid.uuid4()),
                "sku": sku,
                "descripcion": f"TEST product {sku}",
                "_test_marker": TEST_MARKER,
            })
        inv = await db.inventario_tecnico.find_one({"tecnico_id": tecnico_id, "sku": sku})
        if inv:
            await db.inventario_tecnico.update_one(
                {"id": inv["id"]}, {"$set": {"cantidad": cantidad}}
            )
        else:
            await db.inventario_tecnico.insert_one({
                "id": str(uuid.uuid4()),
                "tecnico_id": tecnico_id,
                "sku": sku,
                "descripcion": f"TEST product {sku}",
                "cantidad": cantidad,
                "_test_marker": TEST_MARKER,
            })
        client.close()
    _run(_do())


# ---------- Fixtures ----------
@pytest.fixture(scope="module", autouse=True)
def _module_cleanup():
    yield
    _cleanup_all()


# =========================================================================
# 1. TECNICO_CREATE accepts direccion + comuna
# =========================================================================
class TestTecnicoCreateGeoFields:
    def test_create_tecnico_with_direccion_and_comuna(self, base_url, admin_headers):
        uniq = uuid.uuid4().hex[:8]
        creds = {
            "rut": f"TEST{uniq}-G",
            "nombre": "Geo",
            "apellidos": f"Tec{uniq}",
            "email": f"TEST_geo_{uniq}@mvg.cl",
            "telefono": "+56912345678",
            "password": "Tecnico123!",
            "direccion": "Av. Siempre Viva 742",
            "comuna": "Providencia",
        }
        r = requests.post(
            f"{base_url}/api/admin/tecnicos", json=creds, headers=admin_headers, timeout=30
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body.get("direccion") == "Av. Siempre Viva 742"
        assert body.get("comuna") == "Providencia"

        # GET to verify persistence
        list_r = requests.get(
            f"{base_url}/api/admin/tecnicos", headers=admin_headers, timeout=20
        )
        assert list_r.status_code == 200
        found = next((t for t in list_r.json() if t["id"] == body["id"]), None)
        assert found is not None
        assert found.get("direccion") == "Av. Siempre Viva 742"
        assert found.get("comuna") == "Providencia"

        # Cleanup
        requests.delete(
            f"{base_url}/api/admin/tecnicos/{body['id']}",
            headers=admin_headers,
            timeout=20,
        )


# =========================================================================
# 2. PIN PAD EXTRA
# =========================================================================
class TestPinPadExtra:
    def test_pinpad_extra_happy_path_alnum(self, base_url, tecnico_user, tecnico_headers):
        """Same length (16) + alfanumérico → 200 + agregado."""
        seed = _seed_orden(tecnico_user["id"], ["H3PII52205669414", "H3PII52205669415"])
        assert seed
        orden_id, _, _ = seed
        new_ddll = "H3PII52205669999"  # 16 chars alphanum
        payload = {
            "ddll": new_ddll,
            "serie": "EXTRA-S",
            "modelo": "EXTRA",
            "evidencia_base64": B64_PNG,
            "notas": "TEST extra",
            "sin_suministros": True,
        }
        r = requests.post(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad-extra",
            json=payload,
            headers=tecnico_headers,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        ddlls = [pp.get("ddll") for pp in body.get("pin_pads") or []]
        assert new_ddll in ddlls
        # Marca extra=True
        extra_pp = next(pp for pp in body["pin_pads"] if pp.get("ddll") == new_ddll)
        assert extra_pp.get("extra") is True
        assert extra_pp.get("completed") is True
        assert extra_pp.get("agregado_por") == tecnico_user["id"]

    def test_pinpad_extra_rejects_wrong_length(
        self, base_url, tecnico_user, tecnico_headers
    ):
        """16-char existentes → DDLL de 15 chars → 400 'Ingresa DDLL correctamente'."""
        seed = _seed_orden(tecnico_user["id"], ["H3PII52205669414", "H3PII52205669415"])
        assert seed
        orden_id, _, _ = seed
        bad_ddll = "H3PII5220566941"  # 15 chars
        payload = {
            "ddll": bad_ddll,
            "evidencia_base64": B64_PNG,
            "sin_suministros": True,
        }
        r = requests.post(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad-extra",
            json=payload,
            headers=tecnico_headers,
            timeout=20,
        )
        assert r.status_code == 400, r.text
        assert "Ingresa DDLL correctamente" in r.text

    def test_pinpad_extra_rejects_duplicate(
        self, base_url, tecnico_user, tecnico_headers
    ):
        existing = "H3PII52205669414"
        seed = _seed_orden(tecnico_user["id"], [existing, "H3PII52205669415"])
        assert seed
        orden_id, _, _ = seed
        payload = {
            "ddll": existing,
            "evidencia_base64": B64_PNG,
            "sin_suministros": True,
        }
        r = requests.post(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad-extra",
            json=payload,
            headers=tecnico_headers,
            timeout=20,
        )
        assert r.status_code == 400, r.text
        assert "ya existe" in r.text.lower()

    def test_pinpad_extra_rejects_no_mat_no_flag(
        self, base_url, tecnico_user, tecnico_headers
    ):
        """sin materiales y sin_suministros=False → 400."""
        seed = _seed_orden(tecnico_user["id"], ["H3PII52205669414"])
        assert seed
        orden_id, _, _ = seed
        payload = {
            "ddll": "H3PII52205669777",
            "evidencia_base64": B64_PNG,
            "sin_suministros": False,
        }
        r = requests.post(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad-extra",
            json=payload,
            headers=tecnico_headers,
            timeout=20,
        )
        assert r.status_code == 400, r.text
        body = r.json()
        # Either uses Spanish message about materials
        assert "materiales" in body.get("detail", "").lower() or "suministros" in body.get("detail", "").lower()

    def test_pinpad_extra_descuenta_stock_atomicamente(
        self, base_url, tecnico_user, tecnico_headers
    ):
        sku = f"TEST-SKU-{uuid.uuid4().hex[:6]}"
        _ensure_product_and_stock(tecnico_user["id"], sku, cantidad=50)
        before = _get_inv_qty(tecnico_user["id"], sku)
        assert before == 50

        seed = _seed_orden(tecnico_user["id"], ["H3PII52205669414"])
        assert seed
        orden_id, _, _ = seed
        payload = {
            "ddll": "H3PII52205669888",
            "evidencia_base64": B64_PNG,
            "materiales_usados": [
                {"sku": sku, "descripcion": "TEST", "cantidad": 3}
            ],
        }
        r = requests.post(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad-extra",
            json=payload,
            headers=tecnico_headers,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        after = _get_inv_qty(tecnico_user["id"], sku)
        assert after == 47, f"Esperado 47, got {after}"

    def test_pinpad_extra_numeric_pattern_rejects_alpha(
        self, base_url, tecnico_user, tecnico_headers
    ):
        """Si las DDLL existentes son todas numéricas, alfanumérico debe rechazar."""
        seed = _seed_orden(tecnico_user["id"], ["1234567890123456", "9876543210987654"])
        assert seed
        orden_id, _, _ = seed
        payload = {
            "ddll": "ABCD567890123456",
            "evidencia_base64": B64_PNG,
            "sin_suministros": True,
        }
        r = requests.post(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad-extra",
            json=payload,
            headers=tecnico_headers,
            timeout=20,
        )
        assert r.status_code == 400, r.text
        assert "dígitos" in r.text.lower() or "digit" in r.text.lower() or "numérico" in r.text.lower() or "numerico" in r.text.lower()


# =========================================================================
# 3. REAGENDAR
# =========================================================================
class TestReagendar:
    def test_reagendar_changes_estado_and_keeps_history(
        self, base_url, tecnico_user, tecnico_headers
    ):
        seed = _seed_orden(tecnico_user["id"], ["H3PII52205669414"])
        assert seed
        orden_id, _, _ = seed

        nueva = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
        r1 = requests.post(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/reagendar",
            json={"motivo": "Cliente solicitó otra fecha", "nueva_fecha": nueva},
            headers=tecnico_headers,
            timeout=20,
        )
        assert r1.status_code == 200, r1.text
        body1 = r1.json()
        assert body1.get("estado") == "reagendada"
        assert body1.get("ultimo_motivo_reagenda") == "Cliente solicitó otra fecha"
        assert body1.get("fecha_limite") == nueva
        hist = body1.get("reagendamientos") or []
        assert len(hist) == 1
        assert hist[0]["motivo"] == "Cliente solicitó otra fecha"
        assert hist[0]["tecnico_id"] == tecnico_user["id"]

        # Segundo reagendamiento → historial acumulativo
        r2 = requests.post(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/reagendar",
            json={"motivo": "Segunda razón"},
            headers=tecnico_headers,
            timeout=20,
        )
        assert r2.status_code == 200, r2.text
        hist2 = r2.json().get("reagendamientos") or []
        assert len(hist2) == 2
        motivos = [h["motivo"] for h in hist2]
        assert "Cliente solicitó otra fecha" in motivos and "Segunda razón" in motivos

    def test_reagendar_rejects_orden_finalizada(
        self, base_url, tecnico_user, tecnico_headers
    ):
        seed = _seed_orden(tecnico_user["id"], ["H3PII52205669414"], estado="finalizada")
        assert seed
        orden_id, _, _ = seed
        r = requests.post(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/reagendar",
            json={"motivo": "Test motivo"},
            headers=tecnico_headers,
            timeout=20,
        )
        assert r.status_code == 400, r.text


# =========================================================================
# 4. RUTA OPTIMIZADA
# =========================================================================
class TestRutaTecnico:
    def test_ruta_shape_and_nearest_neighbor(
        self, base_url, admin_headers
    ):
        """Crea un técnico con comuna 'Santiago' y le asigna 3 órdenes en
        comunas diferentes; verifica que la API ordene Santiago primero."""
        uniq = uuid.uuid4().hex[:8]
        creds = {
            "rut": f"TESTR{uniq}-X",
            "nombre": "Ruta",
            "apellidos": "Tec",
            "email": f"TEST_ruta_{uniq}@mvg.cl",
            "telefono": "+56912345678",
            "password": "Tecnico123!",
            "direccion": "Av. Test 1",
            "comuna": "Santiago",
        }
        rc = requests.post(
            f"{base_url}/api/admin/tecnicos", json=creds, headers=admin_headers, timeout=30
        )
        assert rc.status_code == 201, rc.text
        tec = rc.json()
        try:
            rl = requests.post(
                f"{base_url}/api/auth/login",
                json={"email": creds["email"], "password": creds["password"]},
                timeout=20,
            )
            token = rl.json()["access_token"]
            tec_h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

            # Seed 3 ordenes: 2 en distintas comunas + 1 en Santiago (misma)
            s1 = _seed_orden(tec["id"], ["AAAA11112222BBBB"], comuna="Valparaiso")
            s2 = _seed_orden(tec["id"], ["AAAA11112222CCCC"], comuna="Santiago")
            s3 = _seed_orden(tec["id"], ["AAAA11112222DDDD"], comuna="Concepcion")
            assert s1 and s2 and s3
            santiago_orden_id = s2[0]

            r = requests.get(f"{base_url}/api/tecnico/ruta", headers=tec_h, timeout=20)
            assert r.status_code == 200, r.text
            data = r.json()
            # Shape
            for key in (
                "ordenes_dia",
                "ordenes_resto",
                "max_dia",
                "hora_termino_estimada",
                "pin_pads_pendientes_dia",
                "hora_inicio_sugerida",
            ):
                assert key in data, f"Missing key {key}"
            assert data["max_dia"] == 25
            assert data["hora_inicio_sugerida"] == "09:00"
            assert isinstance(data["ordenes_dia"], list)
            # Nearest neighbor: la primera del día debe ser la de Santiago
            assert len(data["ordenes_dia"]) >= 3
            first = data["ordenes_dia"][0]
            assert first.get("id") == santiago_orden_id, (
                f"Esperaba {santiago_orden_id} primero (Santiago), got "
                f"{first.get('id')} (comuna={(first.get('sucursal') or {}).get('comuna')})"
            )
            # Pin pads pendientes = 3 (1 por orden, todos no completed)
            assert data["pin_pads_pendientes_dia"] >= 3
            # Hora término = 09:00 + N*10 min ; N>=3 → al menos 09:30
            assert data["hora_termino_estimada"] >= "09:30"
        finally:
            requests.delete(
                f"{base_url}/api/admin/tecnicos/{tec['id']}",
                headers=admin_headers,
                timeout=20,
            )


# =========================================================================
# 5. ASIGNACION MASIVA
# =========================================================================
class TestAsignacionMasiva:
    def test_asignacion_masiva_distribuye_por_cercania(
        self, base_url, admin_headers
    ):
        uniq = uuid.uuid4().hex[:8]
        # 2 técnicos: A en Santiago, B en Valparaiso
        tec_a_creds = {
            "rut": f"TESTAM{uniq}-A",
            "nombre": "Mas",
            "apellidos": "TecA",
            "email": f"TEST_ma_a_{uniq}@mvg.cl",
            "telefono": "+56912345678",
            "password": "Tecnico123!",
            "comuna": "Santiago",
        }
        tec_b_creds = {
            "rut": f"TESTAM{uniq}-B",
            "nombre": "Mas",
            "apellidos": "TecB",
            "email": f"TEST_ma_b_{uniq}@mvg.cl",
            "telefono": "+56912345678",
            "password": "Tecnico123!",
            "comuna": "Valparaiso",
        }
        ra = requests.post(
            f"{base_url}/api/admin/tecnicos", json=tec_a_creds, headers=admin_headers, timeout=30
        )
        rb = requests.post(
            f"{base_url}/api/admin/tecnicos", json=tec_b_creds, headers=admin_headers, timeout=30
        )
        assert ra.status_code == 201, ra.text
        assert rb.status_code == 201, rb.text
        ta, tb = ra.json(), rb.json()
        try:
            # 2 ordenes sin asignar: una en Santiago, otra en Valparaiso
            o_san_id, _ = _seed_orden_sin_asignar("Santiago")
            o_val_id, _ = _seed_orden_sin_asignar("Valparaiso")

            payload = {
                "orden_ids": [o_san_id, o_val_id],
                "tecnico_ids": [ta["id"], tb["id"]],
                "max_por_tecnico": 25,
            }
            r = requests.post(
                f"{base_url}/api/admin/ordenes/asignar-masivo",
                json=payload,
                headers=admin_headers,
                timeout=60,
            )
            assert r.status_code == 200, r.text
            data = r.json()
            assert data.get("asignadas") == 2, data
            detalle = data.get("detalle") or []
            assert len(detalle) == 2
            by_orden = {d["orden_id"]: d for d in detalle}
            # La de Santiago → técnico Santiago (A)
            assert by_orden[o_san_id]["tecnico_id"] == ta["id"], by_orden[o_san_id]
            # La de Valparaiso → técnico Valparaiso (B)
            assert by_orden[o_val_id]["tecnico_id"] == tb["id"], by_orden[o_val_id]
            assert "carga_final" in data
            assert data["carga_final"].get(ta["id"], 0) >= 1
            assert data["carga_final"].get(tb["id"], 0) >= 1
        finally:
            requests.delete(
                f"{base_url}/api/admin/tecnicos/{ta['id']}", headers=admin_headers, timeout=20
            )
            requests.delete(
                f"{base_url}/api/admin/tecnicos/{tb['id']}", headers=admin_headers, timeout=20
            )

    def test_asignacion_masiva_respeta_max_por_tecnico(
        self, base_url, admin_headers
    ):
        uniq = uuid.uuid4().hex[:8]
        creds = {
            "rut": f"TESTAM{uniq}-C",
            "nombre": "Cap",
            "apellidos": "Tec",
            "email": f"TEST_macap_{uniq}@mvg.cl",
            "telefono": "+56912345678",
            "password": "Tecnico123!",
            "comuna": "Santiago",
        }
        r = requests.post(
            f"{base_url}/api/admin/tecnicos", json=creds, headers=admin_headers, timeout=30
        )
        assert r.status_code == 201, r.text
        tec = r.json()
        try:
            # Crear 3 órdenes sin asignar
            ids = []
            for _ in range(3):
                oid, _ = _seed_orden_sin_asignar("Santiago")
                ids.append(oid)

            payload = {
                "orden_ids": ids,
                "tecnico_ids": [tec["id"]],
                "max_por_tecnico": 2,  # debería asignar solo 2 de las 3
            }
            r = requests.post(
                f"{base_url}/api/admin/ordenes/asignar-masivo",
                json=payload,
                headers=admin_headers,
                timeout=60,
            )
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["asignadas"] == 2, data
            assert data["carga_final"].get(tec["id"], 0) <= 2
        finally:
            requests.delete(
                f"{base_url}/api/admin/tecnicos/{tec['id']}",
                headers=admin_headers,
                timeout=20,
            )


# =========================================================================
# 6. ADMIN STATS — campos nuevos
# =========================================================================
class TestAdminStatsNewFields:
    def test_stats_includes_new_fields(self, base_url, admin_headers):
        r = requests.get(f"{base_url}/api/admin/stats", headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        required = [
            "pin_pads_pendientes",
            "tecnicos_necesarios",
            "horas_totales_estimadas",
            "pin_pads_por_tecnico_dia",
            "reagendadas",
        ]
        for k in required:
            assert k in data, f"Missing stat key {k}"
        assert data["pin_pads_por_tecnico_dia"] == 25
        # Tipos
        assert isinstance(data["pin_pads_pendientes"], int)
        assert isinstance(data["tecnicos_necesarios"], int)
        assert isinstance(data["horas_totales_estimadas"], (int, float))
        assert isinstance(data["reagendadas"], int)
        # Coherencia matemática: ceil(pp/25)
        import math
        expected = math.ceil(data["pin_pads_pendientes"] / 25) if data["pin_pads_pendientes"] else 0
        assert data["tecnicos_necesarios"] == expected
