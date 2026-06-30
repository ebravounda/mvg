"""Iteration 11 backend tests — 5 main features.

Features covered:
1) PUT /api/tecnico/disponibilidad (persist + validation hora_fin<=hora_inicio → 400).
2) GET /api/tecnico/disponibilidad returns saved data.
3) GET /api/admin/disponibilidad returns list of técnicos with disponibilidad.
4) POST/GET/DELETE /api/tecnico/ordenes/{id}/cue (cue_base64).
5) PATCH /api/admin/ordenes/{id} con fecha_ejecucion persists.
6) PATCH /api/tecnico/ordenes/{id}/pinpad/{pp_id} valida foto_antes+foto_despues
   (sólo foto_antes → 400; las 4 fotos → OK y persiste).
7) build_assignment_message contiene CC, RUT, Razón social, Nombre fantasía,
   Dirección, Comuna, Región, prioridad, fecha_ejecucion, fecha_limite y
   listado de pin_pads con DDLL/serie/modelo.

Note: PRD pidió "POST /api/tecnico/ordenes/{id}/pinpads/{pp_id}" pero el endpoint
real implementado es PATCH .../pinpad/{pp_id} (singular). Probamos el endpoint
existente.
"""
import sys
import uuid
import base64
import requests
import pytest

# Allow importing whatsapp_service from /app/backend
sys.path.insert(0, "/app/backend")
from whatsapp_service import build_assignment_message  # noqa: E402

# Minimal valid 1x1 PNG (transparent)
_TINY_PNG = base64.b64encode(
    bytes.fromhex(
        "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4"
        "890000000A49444154789C6300010000000500010D0A2DB40000000049454E44AE426082"
    )
).decode()
TINY_DATA_URL = f"data:image/png;base64,{_TINY_PNG}"


# -------------------------- Fixtures de soporte --------------------------
@pytest.fixture(scope="module")
def cliente_id(base_url, admin_headers):
    uniq = uuid.uuid4().hex[:8]
    payload = {
        "nombre": f"TEST_iter11_RazonSocial_{uniq}",
        "nombre_fantasia": f"TEST_iter11_Fantasia_{uniq}",
        "rut": "76123456-7",
        "telefono": "+56911112222",
    }
    r = requests.post(
        f"{base_url}/api/admin/clientes", json=payload, headers=admin_headers, timeout=30
    )
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    yield cid, payload
    requests.delete(f"{base_url}/api/admin/clientes/{cid}", headers=admin_headers, timeout=20)


@pytest.fixture(scope="module")
def sucursal_id(base_url, admin_headers, cliente_id):
    cid, _ = cliente_id
    uniq = uuid.uuid4().hex[:6]
    payload = {
        "cliente_id": cid,
        "nombre": f"TEST_iter11_Sucursal_{uniq}",
        "codigo_comercio": f"CC{uniq.upper()}",
        "direccion": "Av. Providencia 1234",
        "comuna": "Providencia",
        "region": "Metropolitana",
    }
    r = requests.post(
        f"{base_url}/api/admin/sucursales", json=payload, headers=admin_headers, timeout=30
    )
    assert r.status_code == 201, r.text
    sid = r.json()["id"]
    yield sid, payload
    requests.delete(f"{base_url}/api/admin/sucursales/{sid}", headers=admin_headers, timeout=20)


@pytest.fixture(scope="module")
def orden_para_tecnico(base_url, admin_headers, cliente_id, sucursal_id, tecnico_user):
    cid, _ = cliente_id
    sid, _ = sucursal_id
    payload = {
        "cliente_id": cid,
        "sucursal_id": sid,
        "tecnico_id": tecnico_user["id"],
        "titulo": "TEST_iter11 orden",
        "descripcion": "TEST iter11 — test fixture",
        "prioridad": "alta",
        "serie": "SN-ITER11",
        "modelo": "VX520",
        "ddll": "DDLL-001",
        "fecha_limite": "2026-08-30",
    }
    r = requests.post(
        f"{base_url}/api/admin/ordenes", json=payload, headers=admin_headers, timeout=30
    )
    assert r.status_code == 201, r.text
    o = r.json()
    yield o
    requests.delete(f"{base_url}/api/admin/ordenes/{o['id']}", headers=admin_headers, timeout=20)


# ============== 1) Disponibilidad técnico ==============
class TestDisponibilidadTecnico:
    def _payload_7_dias(self):
        return {
            "lun": {"activo": True, "hora_inicio": "09:00", "hora_fin": "18:00"},
            "mar": {"activo": True, "hora_inicio": "09:00", "hora_fin": "18:00"},
            "mie": {"activo": True, "hora_inicio": "09:00", "hora_fin": "18:00"},
            "jue": {"activo": True, "hora_inicio": "09:00", "hora_fin": "18:00"},
            "vie": {"activo": True, "hora_inicio": "09:00", "hora_fin": "17:00"},
            "sab": {"activo": False, "hora_inicio": "10:00", "hora_fin": "14:00"},
            "dom": {"activo": False, "hora_inicio": "10:00", "hora_fin": "14:00"},
        }

    def test_put_disponibilidad_persists_and_get_returns_it(
        self, base_url, tecnico_headers
    ):
        payload = self._payload_7_dias()
        r = requests.put(
            f"{base_url}/api/tecnico/disponibilidad",
            json=payload, headers=tecnico_headers, timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert data["disponibilidad"]["lun"]["activo"] is True
        assert data["disponibilidad"]["vie"]["hora_fin"] == "17:00"
        assert data["disponibilidad"]["sab"]["activo"] is False

        # GET para verificar persistencia
        r2 = requests.get(
            f"{base_url}/api/tecnico/disponibilidad",
            headers=tecnico_headers, timeout=20,
        )
        assert r2.status_code == 200
        disp = r2.json()["disponibilidad"]
        # los 7 días deben estar
        for d in ("lun", "mar", "mie", "jue", "vie", "sab", "dom"):
            assert d in disp, f"Día {d} no devuelto en GET"
        assert disp["lun"]["hora_inicio"] == "09:00"
        assert disp["vie"]["hora_fin"] == "17:00"
        assert disp["mar"]["activo"] is True

    def test_put_disponibilidad_hora_fin_menor_o_igual_inicio_devuelve_400(
        self, base_url, tecnico_headers
    ):
        bad = self._payload_7_dias()
        bad["lun"] = {"activo": True, "hora_inicio": "18:00", "hora_fin": "09:00"}
        r = requests.put(
            f"{base_url}/api/tecnico/disponibilidad",
            json=bad, headers=tecnico_headers, timeout=20,
        )
        assert r.status_code == 400, (
            f"Expected 400 si hora_fin<=hora_inicio cuando activo=true. Got {r.status_code}: {r.text}"
        )

    def test_put_disponibilidad_hora_fin_igual_inicio_400(
        self, base_url, tecnico_headers
    ):
        bad = self._payload_7_dias()
        bad["mar"] = {"activo": True, "hora_inicio": "12:00", "hora_fin": "12:00"}
        r = requests.put(
            f"{base_url}/api/tecnico/disponibilidad",
            json=bad, headers=tecnico_headers, timeout=20,
        )
        assert r.status_code == 400, r.text


# ============== 2) Admin disponibilidad ==============
class TestAdminDisponibilidad:
    def test_admin_lista_disponibilidad(
        self, base_url, admin_headers, tecnico_user, tecnico_headers
    ):
        # Asegurar que el técnico tiene disponibilidad seteada
        payload = {
            "lun": {"activo": True, "hora_inicio": "08:00", "hora_fin": "17:00"},
            "mar": {"activo": False, "hora_inicio": "09:00", "hora_fin": "18:00"},
            "mie": {"activo": False, "hora_inicio": "09:00", "hora_fin": "18:00"},
            "jue": {"activo": False, "hora_inicio": "09:00", "hora_fin": "18:00"},
            "vie": {"activo": False, "hora_inicio": "09:00", "hora_fin": "18:00"},
            "sab": {"activo": False, "hora_inicio": "10:00", "hora_fin": "14:00"},
            "dom": {"activo": False, "hora_inicio": "10:00", "hora_fin": "14:00"},
        }
        requests.put(
            f"{base_url}/api/tecnico/disponibilidad",
            json=payload, headers=tecnico_headers, timeout=20,
        )
        r = requests.get(
            f"{base_url}/api/admin/disponibilidad",
            headers=admin_headers, timeout=20,
        )
        assert r.status_code == 200, r.text
        lst = r.json()
        assert isinstance(lst, list)
        # Debe incluir al técnico recién creado
        match = next((t for t in lst if t["id"] == tecnico_user["id"]), None)
        assert match is not None, (
            f"El técnico {tecnico_user['id']} no aparece en /admin/disponibilidad"
        )
        assert "disponibilidad" in match
        assert match["disponibilidad"]["lun"]["activo"] is True
        assert match["disponibilidad"]["lun"]["hora_inicio"] == "08:00"


# ============== 3) CUE ==============
class TestCUE:
    def test_post_cue_persists_and_get_orden_includes_it(
        self, base_url, tecnico_headers, admin_headers, orden_para_tecnico
    ):
        oid = orden_para_tecnico["id"]
        r = requests.post(
            f"{base_url}/api/tecnico/ordenes/{oid}/cue",
            json={"cue_base64": TINY_DATA_URL, "notas": "TEST iter11 CUE"},
            headers=tecnico_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("cue_base64"), "cue_base64 vacío en respuesta"
        assert data["id"] == oid

        # GET de admin
        rg = requests.get(
            f"{base_url}/api/admin/ordenes/{oid}",
            headers=admin_headers, timeout=20,
        )
        # Si no existe ese endpoint, probar el genérico /api/ordenes
        if rg.status_code == 404:
            rg = requests.get(
                f"{base_url}/api/ordenes/{oid}",
                headers=admin_headers, timeout=20,
            )
        assert rg.status_code == 200, rg.text
        body = rg.json()
        assert body.get("cue_base64"), (
            "cue_base64 no aparece en GET de la orden después de subirla"
        )
        assert body.get("cue_uploaded_at"), "cue_uploaded_at debería estar presente"

    def test_delete_cue_elimina_campo(
        self, base_url, tecnico_headers, admin_headers, orden_para_tecnico
    ):
        oid = orden_para_tecnico["id"]
        # Asegurar que hay un CUE primero
        requests.post(
            f"{base_url}/api/tecnico/ordenes/{oid}/cue",
            json={"cue_base64": TINY_DATA_URL},
            headers=tecnico_headers, timeout=30,
        )
        r = requests.delete(
            f"{base_url}/api/tecnico/ordenes/{oid}/cue",
            headers=tecnico_headers, timeout=20,
        )
        assert r.status_code == 200, r.text
        # Verificar
        rg = requests.get(
            f"{base_url}/api/admin/ordenes/{oid}",
            headers=admin_headers, timeout=20,
        )
        if rg.status_code == 404:
            rg = requests.get(
                f"{base_url}/api/ordenes/{oid}",
                headers=admin_headers, timeout=20,
            )
        assert rg.status_code == 200
        body = rg.json()
        assert not body.get("cue_base64"), "cue_base64 debería estar removido"


# ============== 4) PATCH admin fecha_ejecucion ==============
class TestFechaEjecucion:
    def test_patch_admin_orden_fecha_ejecucion_persiste(
        self, base_url, admin_headers, orden_para_tecnico
    ):
        oid = orden_para_tecnico["id"]
        r = requests.patch(
            f"{base_url}/api/admin/ordenes/{oid}",
            json={"fecha_ejecucion": "2026-07-15"},
            headers=admin_headers, timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("fecha_ejecucion") == "2026-07-15", (
            f"fecha_ejecucion no persistió. Body={data}"
        )

        # GET para verificar persistencia
        rg = requests.get(
            f"{base_url}/api/admin/ordenes/{oid}",
            headers=admin_headers, timeout=20,
        )
        if rg.status_code == 404:
            rg = requests.get(
                f"{base_url}/api/ordenes/{oid}",
                headers=admin_headers, timeout=20,
            )
        assert rg.status_code == 200
        assert rg.json().get("fecha_ejecucion") == "2026-07-15"


# ============== 5) PinPad 4 fotos ==============
class TestPinPad4Fotos:
    def _pp_id(self, orden):
        pps = orden.get("pin_pads") or []
        assert pps, "La orden no tiene pin_pads"
        return pps[0]["id"]

    def test_pinpad_solo_foto_antes_devuelve_400(
        self, base_url, tecnico_headers, orden_para_tecnico
    ):
        oid = orden_para_tecnico["id"]
        pp_id = self._pp_id(orden_para_tecnico)
        # Sin foto_despues y sin evidencia_base64 legacy → debe ser 400
        r = requests.patch(
            f"{base_url}/api/tecnico/ordenes/{oid}/pinpad/{pp_id}",
            json={
                "foto_antes_base64": TINY_DATA_URL,
                "sin_suministros": True,
            },
            headers=tecnico_headers, timeout=30,
        )
        assert r.status_code == 400, (
            f"Esperado 400 si falta foto_despues_base64. Got {r.status_code}: {r.text}"
        )

    def test_pinpad_las_4_fotos_se_guardan(
        self, base_url, tecnico_headers, admin_headers, orden_para_tecnico
    ):
        oid = orden_para_tecnico["id"]
        pp_id = self._pp_id(orden_para_tecnico)
        r = requests.patch(
            f"{base_url}/api/tecnico/ordenes/{oid}/pinpad/{pp_id}",
            json={
                "foto_antes_base64": TINY_DATA_URL,
                "foto_descarga_master_base64": TINY_DATA_URL,
                "foto_despues_base64": TINY_DATA_URL,
                "foto_comprobante_venta_base64": TINY_DATA_URL,
                "sin_suministros": True,
                "lat": -33.4290,
                "lng": -70.6211,
            },
            headers=tecnico_headers, timeout=30,
        )
        assert r.status_code == 200, r.text

        rg = requests.get(
            f"{base_url}/api/admin/ordenes/{oid}",
            headers=admin_headers, timeout=20,
        )
        if rg.status_code == 404:
            rg = requests.get(
                f"{base_url}/api/ordenes/{oid}",
                headers=admin_headers, timeout=20,
            )
        assert rg.status_code == 200
        pps = rg.json().get("pin_pads") or []
        pp = next((p for p in pps if p["id"] == pp_id), None)
        assert pp is not None, "PinPad no encontrado tras update"
        for k in (
            "foto_antes_base64",
            "foto_descarga_master_base64",
            "foto_despues_base64",
            "foto_comprobante_venta_base64",
        ):
            assert pp.get(k), f"Campo {k} no se guardó"


# ============== 6) build_assignment_message ==============
class TestBuildAssignmentMessage:
    def test_message_contiene_todos_los_campos(self):
        pin_pads = [
            {"ddll": "DDLL-100", "serie": "SN-100", "modelo": "VX520"},
            {"ddll": "DDLL-200", "serie": "SN-200", "modelo": "VX680"},
        ]
        msg = build_assignment_message(
            tecnico_nombre="Carlos",
            numero="OS-2026-0099",
            cliente="Razón Social SA",
            comercio="Sucursal Centro",
            codigo_comercio="CC-XYZ",
            direccion="Av. Apoquindo 4700",
            prioridad="alta",
            fecha_limite="2026-08-30",
            pin_pads=pin_pads,
            rut="76.123.456-7",
            razon_social="Razón Social SA",
            nombre_fantasia="MiTienda",
            comuna="Las Condes",
            region="Metropolitana",
            fecha_ejecucion="2026-07-15",
        )
        # Validar contenido esperado del PRD
        assert "CC-XYZ" in msg, "Falta código comercio"
        assert "76.123.456-7" in msg, "Falta RUT"
        assert "Razón Social SA" in msg, "Falta Razón social"
        assert "MiTienda" in msg, "Falta Nombre fantasía"
        assert "Av. Apoquindo 4700" in msg, "Falta Dirección"
        assert "Las Condes" in msg, "Falta Comuna"
        assert "Metropolitana" in msg, "Falta Región"
        assert "ALTA" in msg, "Falta prioridad (en mayúsculas)"
        assert "2026-07-15" in msg, "Falta fecha_ejecucion"
        assert "2026-08-30" in msg, "Falta fecha_limite"
        # Pin pads con DDLL/serie/modelo
        assert "DDLL-100" in msg and "DDLL-200" in msg
        assert "SN-100" in msg and "SN-200" in msg
        assert "VX520" in msg and "VX680" in msg
        # Etiquetas semánticas
        assert "CC" in msg
        assert "RUT" in msg
        assert "Razón social" in msg
        assert "Nombre fantasía" in msg

    def test_message_sin_nombre_fantasia_no_duplica_si_igual_a_razon(self):
        msg = build_assignment_message(
            tecnico_nombre="Carlos", numero="OS-1", cliente="SoloRazon",
            comercio="Suc 1", codigo_comercio="CC-1", direccion="Av X 1",
            prioridad="media", fecha_limite=None, pin_pads=None,
            rut="11111111-1", razon_social="SoloRazon",
            nombre_fantasia="SoloRazon", comuna=None, region=None,
        )
        # razón = nombre fantasía → no debe duplicar línea fantasía
        assert msg.count("SoloRazon") <= 1  # solo aparece en razón social
        # Pero igual debe tener CC/RUT
        assert "CC-1" in msg and "11111111-1" in msg
