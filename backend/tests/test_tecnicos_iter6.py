"""Iteration 6 tests for new técnicos features:
- Welcome email on create_tecnico
- POST /api/admin/tecnicos/{id}/enviar-password-whatsapp
- Auth requirements on both endpoints
"""
import uuid
import time
import pytest
import requests


def _unique_creds(prefix="iter6", telefono="+56912345678"):
    uniq = uuid.uuid4().hex[:8]
    return {
        "rut": f"TEST{uniq}-X",
        "nombre": "WelcomeTest",
        "apellidos": f"User{uniq}",
        "email": f"TEST_iter6_{uniq}@mvg.cl",
        "telefono": telefono,
        "password": "Tecnico123!",
    }


# -------- Welcome email block --------
class TestWelcomeEmail:
    def test_create_tecnico_returns_welcome_email_field(self, base_url, admin_headers):
        creds = _unique_creds()
        r = requests.post(
            f"{base_url}/api/admin/tecnicos",
            json=creds,
            headers=admin_headers,
            timeout=40,
        )
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["email"] == creds["email"].lower()
        assert data["role"] == "tecnico"
        assert data.get("bodega_id") is None
        # New field for iter6
        assert "welcome_email" in data, "Response must include welcome_email"
        we = data["welcome_email"]
        assert isinstance(we, dict)
        assert "mode" in we
        # For a non-allowlisted recipient Resend test mode returns error 403 - that is OK
        assert we["mode"] in ("sent", "error", "disabled", "no_recipients")
        if we["mode"] == "sent":
            assert we.get("id")
        # cleanup
        requests.delete(
            f"{base_url}/api/admin/tecnicos/{data['id']}",
            headers=admin_headers,
            timeout=20,
        )

    def test_create_tecnico_with_bodega(self, base_url, admin_headers):
        # pick any existing bodega
        r = requests.get(
            f"{base_url}/api/admin/bodegas", headers=admin_headers, timeout=20
        )
        assert r.status_code == 200
        bodegas = r.json()
        assert len(bodegas) >= 1
        bodega_id = bodegas[0]["id"]

        creds = _unique_creds()
        creds["bodega_id"] = bodega_id
        r = requests.post(
            f"{base_url}/api/admin/tecnicos",
            json=creds,
            headers=admin_headers,
            timeout=40,
        )
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["bodega_id"] == bodega_id
        assert "welcome_email" in data
        # Verify persistence
        rl = requests.get(
            f"{base_url}/api/admin/tecnicos", headers=admin_headers, timeout=20
        )
        found = next((u for u in rl.json() if u["id"] == data["id"]), None)
        assert found is not None
        assert found["bodega_id"] == bodega_id
        # cleanup
        requests.delete(
            f"{base_url}/api/admin/tecnicos/{data['id']}",
            headers=admin_headers,
            timeout=20,
        )


# -------- Send password via WhatsApp block --------
@pytest.fixture(scope="module")
def fresh_tecnico_with_phone(base_url, admin_headers):
    creds = _unique_creds(telefono="+56912345678")
    r = requests.post(
        f"{base_url}/api/admin/tecnicos",
        json=creds,
        headers=admin_headers,
        timeout=40,
    )
    assert r.status_code == 201, r.text
    tec = r.json()
    yield tec, creds
    # cleanup
    requests.delete(
        f"{base_url}/api/admin/tecnicos/{tec['id']}",
        headers=admin_headers,
        timeout=20,
    )


@pytest.fixture(scope="module")
def fresh_tecnico_no_phone(base_url, admin_headers):
    creds = _unique_creds(telefono="+56999999999")
    r = requests.post(
        f"{base_url}/api/admin/tecnicos",
        json=creds,
        headers=admin_headers,
        timeout=40,
    )
    assert r.status_code == 201, r.text
    tec = r.json()
    # Remove telefono via PATCH-like direct mongo would be cleaner, but
    # PATCH with empty string is allowed by Pydantic, set explicitly to "".
    # Use PATCH endpoint with telefono="" – but TecnicoUpdate has telefono as
    # Optional[str]; "" is truthy-falsy. Use direct DB? We don't have it from
    # tests, but we can call PATCH with telefono="" — the backend filter
    # uses `if v is not None`. So empty string passes through. We then
    # need backend code to treat empty string as no telefono. Let's check.
    # The endpoint checks `if not tec.get("telefono")` so empty string is falsy.
    r = requests.patch(
        f"{base_url}/api/admin/tecnicos/{tec['id']}",
        json={"telefono": ""},
        headers=admin_headers,
        timeout=20,
    )
    assert r.status_code == 200, r.text
    yield tec, creds
    requests.delete(
        f"{base_url}/api/admin/tecnicos/{tec['id']}",
        headers=admin_headers,
        timeout=20,
    )


class TestSendPasswordWhatsApp:
    def test_404_invalid_id(self, base_url, admin_headers):
        r = requests.post(
            f"{base_url}/api/admin/tecnicos/{uuid.uuid4()}/enviar-password-whatsapp",
            json={"password": "ValidPass123"},
            headers=admin_headers,
            timeout=30,
        )
        assert r.status_code == 404

    def test_422_short_password(self, base_url, admin_headers, fresh_tecnico_with_phone):
        tec, _ = fresh_tecnico_with_phone
        r = requests.post(
            f"{base_url}/api/admin/tecnicos/{tec['id']}/enviar-password-whatsapp",
            json={"password": "abc"},  # < 6 chars
            headers=admin_headers,
            timeout=30,
        )
        assert r.status_code == 422

    def test_400_no_telefono(self, base_url, admin_headers, fresh_tecnico_no_phone):
        tec, _ = fresh_tecnico_no_phone
        r = requests.post(
            f"{base_url}/api/admin/tecnicos/{tec['id']}/enviar-password-whatsapp",
            json={"password": "ValidPass123"},
            headers=admin_headers,
            timeout=30,
        )
        assert r.status_code == 400
        assert "tel" in r.json()["detail"].lower()

    def test_success_updates_password_and_returns_whatsapp(
        self, base_url, admin_headers, fresh_tecnico_with_phone
    ):
        tec, creds = fresh_tecnico_with_phone
        new_password = "NewClaveTest2026"
        r = requests.post(
            f"{base_url}/api/admin/tecnicos/{tec['id']}/enviar-password-whatsapp",
            json={"password": new_password},
            headers=admin_headers,
            timeout=40,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert "whatsapp" in body
        assert "mode" in body["whatsapp"]

        # Old password must now fail
        r_old = requests.post(
            f"{base_url}/api/auth/login",
            json={"email": creds["email"], "password": creds["password"]},
            timeout=20,
        )
        assert r_old.status_code == 401

        # New password must succeed
        r_new = requests.post(
            f"{base_url}/api/auth/login",
            json={"email": creds["email"], "password": new_password},
            timeout=20,
        )
        assert r_new.status_code == 200, r_new.text
        assert "access_token" in r_new.json()


# -------- Auth requirements --------
class TestAuthRequirements:
    def test_create_tecnico_no_token_401(self, base_url):
        r = requests.post(
            f"{base_url}/api/admin/tecnicos",
            json=_unique_creds(),
            timeout=20,
        )
        assert r.status_code == 401

    def test_create_tecnico_tecnico_token_403(
        self, base_url, tecnico_headers
    ):
        r = requests.post(
            f"{base_url}/api/admin/tecnicos",
            json=_unique_creds(),
            headers=tecnico_headers,
            timeout=20,
        )
        assert r.status_code == 403

    def test_enviar_password_no_token_401(self, base_url):
        r = requests.post(
            f"{base_url}/api/admin/tecnicos/{uuid.uuid4()}/enviar-password-whatsapp",
            json={"password": "ValidPass123"},
            timeout=20,
        )
        assert r.status_code == 401

    def test_enviar_password_tecnico_token_403(
        self, base_url, tecnico_headers, fresh_tecnico_with_phone
    ):
        tec, _ = fresh_tecnico_with_phone
        r = requests.post(
            f"{base_url}/api/admin/tecnicos/{tec['id']}/enviar-password-whatsapp",
            json={"password": "ValidPass123"},
            headers=tecnico_headers,
            timeout=20,
        )
        assert r.status_code == 403
