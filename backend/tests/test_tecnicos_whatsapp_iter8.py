"""Iteration 8 tests — WhatsApp auto-send on POST /api/admin/tecnicos.

Coverage:
- POST /api/admin/tecnicos with telefono → response includes whatsapp_welcome (dict).
- POST /api/admin/tecnicos with empty telefono → response includes whatsapp_welcome=null
  AND user creation NOT blocked (status 201).
- If WhatsApp backend fails / returns error, técnico creation MUST still succeed (best-effort).
- welcome_email field continues to be returned (regression).
- Manual endpoint POST /admin/tecnicos/{id}/enviar-password-whatsapp continues to work
  (regression on existing flow).
"""
import uuid
import requests


def _unique_creds(prefix="iter8", telefono="+56912345678"):
    uniq = uuid.uuid4().hex[:8]
    return {
        "rut": f"TEST{prefix}{uniq}-W",
        "nombre": "WaTest",
        "apellidos": f"User{uniq}",
        "email": f"TEST_iter8_{uniq}@mvg.cl",
        "telefono": telefono,
        "password": "Tecnico123!",
    }


def _cleanup(base_url, admin_headers, tec_id):
    requests.delete(
        f"{base_url}/api/admin/tecnicos/{tec_id}",
        headers=admin_headers,
        timeout=20,
    )


# ---------------- Feature tests ----------------
class TestWhatsAppOnCreateTecnico:
    """The new behaviour: POST /api/admin/tecnicos now also triggers WhatsApp."""

    def test_response_includes_whatsapp_welcome_field(self, base_url, admin_headers):
        creds = _unique_creds()
        r = requests.post(
            f"{base_url}/api/admin/tecnicos",
            json=creds,
            headers=admin_headers,
            timeout=60,
        )
        assert r.status_code == 201, r.text
        data = r.json()

        # Mandatory new field
        assert "whatsapp_welcome" in data, (
            "Response must include whatsapp_welcome field"
        )
        wa = data["whatsapp_welcome"]
        # With a phone, wa MUST be a dict with an 'ok' key (success OR error).
        assert isinstance(wa, dict), f"whatsapp_welcome must be a dict when phone is set, got {wa!r}"
        assert "ok" in wa, f"whatsapp_welcome dict missing 'ok': {wa!r}"
        assert isinstance(wa["ok"], bool)
        # mode should be one of the known values from whatsapp_service
        if "mode" in wa:
            assert wa["mode"] in (
                "sent", "error", "fallback_link", "no_phone"
            ), f"Unexpected mode: {wa.get('mode')!r}"

        # Welcome email must still be present (regression)
        assert "welcome_email" in data, "welcome_email field missing — regression!"
        assert isinstance(data["welcome_email"], dict)

        # GET to confirm persistence
        rl = requests.get(
            f"{base_url}/api/admin/tecnicos", headers=admin_headers, timeout=20
        )
        assert rl.status_code == 200
        found = next((u for u in rl.json() if u["id"] == data["id"]), None)
        assert found is not None, "Tecnico not persisted"
        assert found["email"] == creds["email"].lower()
        assert found["telefono"] == creds["telefono"]

        _cleanup(base_url, admin_headers, data["id"])

    def test_creation_succeeds_even_when_whatsapp_fails(self, base_url, admin_headers):
        """WhatsApp send is best-effort: even if mitiendapro returns 500 / fake phone
        causes an error, the técnico MUST still be created with status 201."""
        # Use a phone number very likely to be rejected by the real bot service.
        creds = _unique_creds(telefono="+56900000000")
        r = requests.post(
            f"{base_url}/api/admin/tecnicos",
            json=creds,
            headers=admin_headers,
            timeout=60,
        )
        assert r.status_code == 201, (
            f"Creation must NOT fail even if WhatsApp errors. Got {r.status_code}: {r.text}"
        )
        data = r.json()
        # User truly persisted
        assert data.get("id")
        # whatsapp_welcome should be present; ok may be True (fallback_link) or False (error)
        assert "whatsapp_welcome" in data
        wa = data["whatsapp_welcome"]
        assert isinstance(wa, dict)
        # Whatever happened, we should be able to login with the credentials
        r_login = requests.post(
            f"{base_url}/api/auth/login",
            json={"email": creds["email"], "password": creds["password"]},
            timeout=20,
        )
        assert r_login.status_code == 200, (
            f"Created técnico must be able to login: {r_login.status_code} {r_login.text}"
        )

        _cleanup(base_url, admin_headers, data["id"])

    def test_no_phone_whatsapp_welcome_is_null_and_creation_ok(
        self, base_url, admin_headers
    ):
        """If técnico is created with empty telefono, whatsapp_welcome MUST be None,
        and creation MUST NOT fail (status 201)."""
        creds = _unique_creds(telefono="")
        r = requests.post(
            f"{base_url}/api/admin/tecnicos",
            json=creds,
            headers=admin_headers,
            timeout=40,
        )
        # If Pydantic rejects empty telefono, that's a different test outcome we
        # should know about (the model declares telefono: str, so empty string is allowed).
        assert r.status_code == 201, (
            f"Creation with empty telefono must succeed (got {r.status_code}): {r.text}"
        )
        data = r.json()
        assert "whatsapp_welcome" in data, (
            "whatsapp_welcome must still be present (as null) when no phone"
        )
        assert data["whatsapp_welcome"] is None, (
            f"whatsapp_welcome must be null when no phone, got {data['whatsapp_welcome']!r}"
        )
        # welcome_email should still have been attempted
        assert "welcome_email" in data
        assert isinstance(data["welcome_email"], dict)

        _cleanup(base_url, admin_headers, data["id"])


# ---------------- Regression — manual endpoint still works ----------------
class TestManualWhatsAppEndpointStillWorks:
    def test_manual_endpoint_succeeds_after_create(self, base_url, admin_headers):
        creds = _unique_creds()
        r = requests.post(
            f"{base_url}/api/admin/tecnicos",
            json=creds,
            headers=admin_headers,
            timeout=60,
        )
        assert r.status_code == 201, r.text
        tec = r.json()

        new_password = "NewIter8Pass!"
        r2 = requests.post(
            f"{base_url}/api/admin/tecnicos/{tec['id']}/enviar-password-whatsapp",
            json={"password": new_password},
            headers=admin_headers,
            timeout=40,
        )
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert body.get("ok") is True
        assert "whatsapp" in body
        assert isinstance(body["whatsapp"], dict)

        # New password works
        r_login = requests.post(
            f"{base_url}/api/auth/login",
            json={"email": creds["email"], "password": new_password},
            timeout=20,
        )
        assert r_login.status_code == 200, r_login.text

        _cleanup(base_url, admin_headers, tec["id"])


# ---------------- Auth (regression) ----------------
class TestAuthOnCreate:
    def test_create_requires_admin_token(self, base_url):
        r = requests.post(
            f"{base_url}/api/admin/tecnicos",
            json=_unique_creds(),
            timeout=20,
        )
        assert r.status_code == 401

    def test_create_rejects_tecnico_token(self, base_url, tecnico_headers):
        r = requests.post(
            f"{base_url}/api/admin/tecnicos",
            json=_unique_creds(),
            headers=tecnico_headers,
            timeout=20,
        )
        assert r.status_code == 403
