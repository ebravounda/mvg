import os
import uuid
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

# Load frontend .env to get the public backend URL (what the user sees)
load_dotenv(Path("/app/frontend/.env"))

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
)
if not BASE_URL:
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not configured")
BASE_URL = BASE_URL.rstrip("/")

ADMIN_EMAIL = "admin@mvg.cl"
ADMIN_PASSWORD = "Admin123!"


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def admin_token(base_url):
    r = requests.post(
        f"{base_url}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def tecnico_creds():
    """Unique tecnico credentials per test run."""
    uniq = uuid.uuid4().hex[:8]
    return {
        "rut": f"TEST{uniq}-9",
        "nombre": "Juan",
        "apellidos": "TestPerez",
        "email": f"TEST_tecnico_{uniq}@mvg.cl",
        "telefono": "+56912345678",
        "password": "Tecnico123!",
    }


@pytest.fixture(scope="session")
def tecnico_user(base_url, admin_headers, tecnico_creds):
    r = requests.post(
        f"{base_url}/api/admin/tecnicos", json=tecnico_creds, headers=admin_headers, timeout=30
    )
    assert r.status_code == 201, f"Create tecnico failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def tecnico_token(base_url, tecnico_user, tecnico_creds):
    r = requests.post(
        f"{base_url}/api/auth/login",
        json={"email": tecnico_creds["email"], "password": tecnico_creds["password"]},
        timeout=30,
    )
    assert r.status_code == 200, f"Tecnico login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def tecnico_headers(tecnico_token):
    return {"Authorization": f"Bearer {tecnico_token}", "Content-Type": "application/json"}


# Cleanup at end of session
@pytest.fixture(scope="session", autouse=True)
def _cleanup(request, base_url):
    yield
    # Best-effort cleanup is performed inside individual tests via DELETE endpoints
