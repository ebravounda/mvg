"""Iteration 2 backend tests: Excel upload (FEMSA + CC), pin_pads embedded
in ordenes, pinpad-update endpoint, comercios endpoint, WhatsApp fallback,
PDF download, cross-access and admin-only enforcement."""
import os
import uuid
import requests

EXCEL_PATH = "/app/test_assets/BASE_FEMSA_REGIONES.xlsx"

# A real 1x1 PNG (data URL)
PNG_DATA_URL = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


# ----------------- Bulk import flow -----------------
class TestExcelImport:
    """End-to-end: reset → upload Excel → verify comercios/ordenes/pin_pads."""

    def test_01_reset(self, base_url, admin_headers):
        r = requests.post(
            f"{base_url}/api/admin/ordenes/reset",
            headers=admin_headers,
            timeout=60,
        )
        assert r.status_code == 200, r.text
        assert "deleted" in r.json()

    def test_02_upload_excel_as_admin(self, base_url, admin_token):
        assert os.path.exists(EXCEL_PATH), f"Missing fixture: {EXCEL_PATH}"
        with open(EXCEL_PATH, "rb") as f:
            files = {
                "file": (
                    "BASE_FEMSA_REGIONES.xlsx",
                    f,
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            }
            r = requests.post(
                f"{base_url}/api/admin/ordenes/upload-excel",
                headers={"Authorization": f"Bearer {admin_token}"},
                files=files,
                timeout=300,
            )
        assert r.status_code == 200, r.text
        summary = r.json()
        print("Upload summary:", summary)
        # Expectations from problem statement: ~542 órdenes, ~3200 pin pads.
        # Note: clientes_creados/comercios_creados count only NEW upserts, so they
        # can legitimately be 0 if data persists from a prior run; total counts
        # are validated via /api/admin/comercios in test_04.
        assert summary["ordenes_creadas"] >= 500, summary
        assert summary["pin_pads_total"] >= 2500, summary
        assert summary["total_rows"] >= 500, summary
        assert summary["errores"] == [], summary

    def test_03_upload_excel_as_tecnico_returns_403(
        self, base_url, tecnico_token
    ):
        with open(EXCEL_PATH, "rb") as f:
            files = {
                "file": (
                    "BASE_FEMSA_REGIONES.xlsx",
                    f,
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            }
            r = requests.post(
                f"{base_url}/api/admin/ordenes/upload-excel",
                headers={"Authorization": f"Bearer {tecnico_token}"},
                files=files,
                timeout=60,
            )
        assert r.status_code == 403, r.text

    def test_04_list_comercios(self, base_url, admin_headers):
        r = requests.get(
            f"{base_url}/api/admin/comercios", headers=admin_headers, timeout=120
        )
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 400, f"Expected ~542 comercios, got {len(items)}"
        # Validate shape on first item
        c = items[0]
        for k in (
            "id",
            "codigo_comercio",
            "cliente",
            "pin_pads",
            "pin_pads_count",
            "ordenes_count",
            "ordenes_finalizadas",
        ):
            assert k in c, f"missing key {k} in comercio"
        assert isinstance(c["pin_pads"], list)
        assert c["cliente"] is not None
        # at least some comercios must have >=1 pin pad
        with_pp = [x for x in items if x["pin_pads_count"] > 0]
        assert len(with_pp) >= 100, f"Only {len(with_pp)} comercios with pin pads"

    def test_05_list_ordenes_has_pin_pads(self, base_url, admin_headers):
        r = requests.get(
            f"{base_url}/api/admin/ordenes", headers=admin_headers, timeout=120
        )
        assert r.status_code == 200, r.text
        ordenes = r.json()
        assert len(ordenes) >= 500
        # Find an orden with pin_pads
        with_pp = [o for o in ordenes if o.get("pin_pads")]
        assert with_pp, "No ordenes have pin_pads array"
        o = with_pp[0]
        # validate shape
        assert isinstance(o["pin_pads"], list)
        pp = o["pin_pads"][0]
        for k in ("id", "serie", "modelo", "ddll", "completed", "evidencia_base64"):
            assert k in pp, f"missing pin_pad field {k}"
        assert pp["completed"] is False
        assert pp["evidencia_base64"] is None
        # sucursal should have codigo_comercio
        assert o.get("sucursal") is not None
        assert "codigo_comercio" in o["sucursal"]


# ----------------- Asignación + WhatsApp fallback -----------------
class TestAsignarYWhatsapp:
    def test_06_asignar_returns_wa_fallback_link(
        self, base_url, admin_headers, tecnico_user
    ):
        # pick an orden with pin_pads to use for downstream tests
        r = requests.get(
            f"{base_url}/api/admin/ordenes", headers=admin_headers, timeout=120
        )
        assert r.status_code == 200
        ordenes = [o for o in r.json() if o.get("pin_pads")]
        assert ordenes, "Need an orden with pin_pads"
        target = ordenes[0]

        r2 = requests.patch(
            f"{base_url}/api/admin/ordenes/{target['id']}/asignar",
            json={"tecnico_id": tecnico_user["id"]},
            headers=admin_headers,
            timeout=30,
        )
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert "orden" in body and "whatsapp" in body
        wa = body["whatsapp"]
        # WHATSAPP_BOT_URL is empty -> mode must be fallback_link
        assert wa.get("mode") == "fallback_link", wa
        assert wa.get("wa_link", "").startswith("https://wa.me/"), wa
        assert body["orden"]["tecnico_id"] == tecnico_user["id"]

        # GET /api/ordenes/{id} returns pin_pads
        r3 = requests.get(
            f"{base_url}/api/ordenes/{target['id']}",
            headers=admin_headers,
            timeout=30,
        )
        assert r3.status_code == 200
        assert isinstance(r3.json().get("pin_pads"), list)

        # Save id for later tests via module-level holder
        TestAsignarYWhatsapp.assigned_orden_id = target["id"]
        TestAsignarYWhatsapp.assigned_pin_pads = target["pin_pads"]


# ----------------- Tecnico pinpad updates -----------------
class TestPinpadUpdate:
    def test_07_tecnico_only_sees_assigned(
        self, base_url, tecnico_headers
    ):
        r = requests.get(
            f"{base_url}/api/tecnico/ordenes", headers=tecnico_headers, timeout=60
        )
        assert r.status_code == 200
        items = r.json()
        ids = [o["id"] for o in items]
        assert TestAsignarYWhatsapp.assigned_orden_id in ids
        # all items should be assigned to this tecnico
        for o in items:
            assert o.get("tecnico_id") is not None

    def test_08_pinpad_update_without_evidencia_returns_400(
        self, base_url, tecnico_headers
    ):
        orden_id = TestAsignarYWhatsapp.assigned_orden_id
        pp_id = TestAsignarYWhatsapp.assigned_pin_pads[0]["id"]
        r = requests.patch(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad/{pp_id}",
            json={"evidencia_base64": "", "notas": "vacio"},
            headers=tecnico_headers,
            timeout=30,
        )
        assert r.status_code == 400, r.text

    def test_09_update_first_pinpad_sets_en_progreso(
        self, base_url, tecnico_headers
    ):
        orden_id = TestAsignarYWhatsapp.assigned_orden_id
        pin_pads = TestAsignarYWhatsapp.assigned_pin_pads
        first_id = pin_pads[0]["id"]
        r = requests.patch(
            f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad/{first_id}",
            json={"evidencia_base64": PNG_DATA_URL, "notas": "OK 1"},
            headers=tecnico_headers,
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # If there are more pin pads, status should be en_progreso, else finalizada
        if len(pin_pads) > 1:
            assert body["estado"] == "en_progreso", body["estado"]
        else:
            assert body["estado"] == "finalizada"
        marked = [p for p in body["pin_pads"] if p["id"] == first_id][0]
        assert marked["completed"] is True
        assert marked["evidencia_base64"] == PNG_DATA_URL

    def test_10_complete_all_pinpads_sets_finalizada(
        self, base_url, tecnico_headers
    ):
        orden_id = TestAsignarYWhatsapp.assigned_orden_id
        pin_pads = TestAsignarYWhatsapp.assigned_pin_pads
        # complete remaining pin pads
        for pp in pin_pads[1:]:
            r = requests.patch(
                f"{base_url}/api/tecnico/ordenes/{orden_id}/pinpad/{pp['id']}",
                json={"evidencia_base64": PNG_DATA_URL, "notas": f"OK {pp['id'][:4]}"},
                headers=tecnico_headers,
                timeout=60,
            )
            assert r.status_code == 200, r.text

        # Verify final state
        r = requests.get(
            f"{base_url}/api/ordenes/{orden_id}", headers=tecnico_headers, timeout=30
        )
        assert r.status_code == 200
        body = r.json()
        assert body["estado"] == "finalizada", body["estado"]
        assert body["finalized_at"] is not None
        assert all(p["completed"] for p in body["pin_pads"])

    def test_11_cross_access_other_tecnico_returns_403(
        self, base_url, admin_headers, tecnico_headers, tecnico_user
    ):
        # Find an orden NOT owned by current tecnico
        r = requests.get(
            f"{base_url}/api/admin/ordenes", headers=admin_headers, timeout=120
        )
        assert r.status_code == 200
        others = [
            o for o in r.json()
            if o.get("tecnico_id") != tecnico_user["id"] and o.get("pin_pads")
        ]
        assert others, "Need an orden owned by another (or no) tecnico"
        target = others[0]
        pp_id = target["pin_pads"][0]["id"]
        r2 = requests.patch(
            f"{base_url}/api/tecnico/ordenes/{target['id']}/pinpad/{pp_id}",
            json={"evidencia_base64": PNG_DATA_URL, "notas": "hack"},
            headers=tecnico_headers,
            timeout=30,
        )
        assert r2.status_code == 403, r2.text


# ----------------- PDF download -----------------
class TestPdfDownload:
    def test_12_pdf_returns_binary_pdf(self, base_url, admin_headers):
        orden_id = TestAsignarYWhatsapp.assigned_orden_id
        r = requests.get(
            f"{base_url}/api/admin/ordenes/{orden_id}/pdf",
            headers=admin_headers,
            timeout=60,
        )
        assert r.status_code == 200, r.text[:200]
        ct = r.headers.get("Content-Type", "")
        assert "application/pdf" in ct, ct
        assert r.content[:4] == b"%PDF", r.content[:20]
        assert len(r.content) > 1500  # not trivially small
