# 🚀 Guía de Despliegue MVG en Servidor Plesk

Esta guía explica cómo desplegar la app **MVG Computación** (Backend FastAPI + Frontend Expo PWA + MongoDB) en un servidor con **Plesk Obsidian**.

> ⚡ **Recomendación rápida**: Si tu servidor tiene Docker habilitado en Plesk, ve directo a la **Opción B (Docker)** — es la más fácil y la más parecida al entorno actual.

---

## 📦 Pre-requisitos en tu servidor Plesk

1. **Subscription / dominio** ya creado (ej. `mvg.tudominio.cl`).
2. **SSL Let's Encrypt** habilitado en el dominio.
3. **Node.js ≥ 20** instalado vía Plesk (Tools & Settings → Updates → Add component → Node.js).
4. **Python 3.11+** disponible (Plesk lo incluye o lo añades como extensión).
5. **MongoDB** (dos opciones):
   - **Opción Atlas (recomendada)**: crear cluster gratis en https://cloud.mongodb.com y obtener `MONGO_URL`.
   - **MongoDB local en Plesk**: instalar `mongodb-org` vía SSH y dejarlo en `mongodb://127.0.0.1:27017`.

---

## 🧱 Estructura del proyecto

```
/app
├── backend/         # FastAPI - se sirve en puerto 8001
│   ├── server.py
│   ├── suministros_module.py
│   ├── email_service.py
│   ├── whatsapp_service.py
│   ├── requirements.txt
│   └── .env
└── frontend/        # Expo PWA - se exporta a /dist
    ├── app/
    ├── src/
    ├── package.json
    └── .env
```

---

# ✅ OPCIÓN A — Despliegue tradicional (Passenger Python + Site estático)

### A.1 — Backend FastAPI con Passenger

1. **Subir el código** del directorio `/app/backend/` a `/httpdocs/api/` (o a un dominio aparte como `api.mvg.tudominio.cl`).

2. En Plesk → Tu dominio → **Python**:
   - **Document Root**: `/httpdocs/api`
   - **Application Mode**: `production`
   - **Application Startup File**: `passenger_wsgi.py`
   - **Application Entry Point**: `application`
   - **Python version**: 3.11

3. Crear `/httpdocs/api/passenger_wsgi.py`:
   ```python
   import sys, os
   INTERP = os.path.expanduser("~/api/venv/bin/python")
   if sys.executable != INTERP:
       os.execl(INTERP, INTERP, *sys.argv)

   sys.path.insert(0, os.path.dirname(__file__))

   from server import app as application
   ```

4. Instalar dependencias (vía SSH):
   ```bash
   cd ~/httpdocs/api
   python3.11 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   pip install passenger
   ```

5. Crear `/httpdocs/api/.env` con:
   ```
   MONGO_URL=mongodb+srv://<user>:<pass>@cluster.mongodb.net/mvg
   JWT_SECRET=<genera-uno-largo-seguro>
   RESEND_API_KEY=<tu-resend-api-key>
   WHATSAPP_API_KEY=<tu-mitiendapro-api-key>
   WHATSAPP_INSTANCE=<tu-instance>
   CORS_ORIGINS=https://mvg.tudominio.cl
   ```

6. **Important**: En Plesk → tu dominio → **Apache & nginx Settings** → "Additional nginx directives":
   ```nginx
   location /api/ {
       proxy_pass http://127.0.0.1:8001;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       client_max_body_size 50M;
   }
   ```

7. Reiniciar la app desde Plesk → Python → **Restart App**.

### A.2 — Frontend Expo como sitio estático

1. **Build local** (en tu PC o en SSH del servidor):
   ```bash
   cd /app/frontend
   echo "EXPO_PUBLIC_BACKEND_URL=https://mvg.tudominio.cl" > .env
   yarn install
   npx expo export --platform web
   ```
   Esto genera `dist/` con la PWA estática.

2. Subir el contenido de `dist/` a `/httpdocs/` (o `/httpdocs/app/` si el API va a la raíz).

3. En Plesk → **Apache & nginx Settings** → añadir fallback SPA:
   ```nginx
   location / {
       try_files $uri $uri/ /index.html;
   }
   ```

4. Listo: visitar `https://mvg.tudominio.cl` y debería funcionar.

---

# 🐳 OPCIÓN B — Despliegue con Docker (Recomendado)

Si Plesk tiene la extensión **Docker** instalada (Plesk Obsidian la trae):

### B.1 — Crear `/opt/mvg/docker-compose.yml`:

```yaml
version: "3.9"
services:
  mongo:
    image: mongo:7
    restart: unless-stopped
    volumes:
      - mongo_data:/data/db
    networks: [mvg]

  backend:
    build: ./backend
    restart: unless-stopped
    env_file: ./backend/.env
    environment:
      - MONGO_URL=mongodb://mongo:27017/mvg
    depends_on: [mongo]
    ports: ["127.0.0.1:8001:8001"]
    networks: [mvg]

  frontend:
    image: nginx:alpine
    restart: unless-stopped
    volumes:
      - ./frontend-dist:/usr/share/nginx/html:ro
      - ./nginx-spa.conf:/etc/nginx/conf.d/default.conf:ro
    ports: ["127.0.0.1:3000:80"]
    networks: [mvg]

volumes:
  mongo_data:

networks:
  mvg:
```

### B.2 — `backend/Dockerfile`:

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8001
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
```

### B.3 — `nginx-spa.conf`:

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;
  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

### B.4 — Build & deploy:

```bash
# Build PWA
cd /app/frontend
echo "EXPO_PUBLIC_BACKEND_URL=https://mvg.tudominio.cl" > .env
yarn install && npx expo export --platform web
# Copia el dist resultante a /opt/mvg/frontend-dist
rsync -av dist/ /opt/mvg/frontend-dist/

# Levantar todo
cd /opt/mvg
docker compose up -d --build
```

### B.5 — Plesk → Apache & nginx Settings → Reverse-proxy:

```nginx
# PWA (frontend)
location / {
    proxy_pass http://127.0.0.1:3000;
}

# API (backend)
location /api/ {
    proxy_pass http://127.0.0.1:8001;
    proxy_set_header Host $host;
    client_max_body_size 50M;
}
```

Habilita SSL Let's Encrypt en Plesk para `mvg.tudominio.cl` y ¡listo!

---

## 🔐 Variables de entorno requeridas (backend `.env`)

| Variable | Descripción | Ejemplo |
|---|---|---|
| `MONGO_URL` | URL de conexión MongoDB | `mongodb+srv://user:pass@cluster.mongodb.net/mvg` |
| `JWT_SECRET` | Secreto para firmar tokens JWT | Genera con `openssl rand -hex 32` |
| `RESEND_API_KEY` | Clave de Resend (emails) | `re_xxxxxxxxxxx` |
| `WHATSAPP_API_KEY` | Token mitiendapro.com | tu key |
| `WHATSAPP_INSTANCE` | Instancia mitiendapro | `t2_xxxxxxxxx` |
| `CORS_ORIGINS` | Dominios permitidos | `https://mvg.tudominio.cl` |

---

## 🧪 Verificación post-deploy

1. `curl https://mvg.tudominio.cl/api/` → debe devolver JSON `{"message":"MVG API"}`
2. Abrir `https://mvg.tudominio.cl/login` → ver el logo MVG Computación.
3. Login con `admin@mvg.cl` / `Admin123!`
4. Verificar:
   - Sidebar con logo
   - Subir Excel
   - WhatsApp se envía al asignar técnico
   - Resend emails llegan en Suministros
   - Geolocalización al finalizar orden

---

## 🆘 Troubleshooting común

| Problema | Solución |
|---|---|
| 502 Bad Gateway | Revisar logs del backend con `docker logs mvg-backend-1` o Plesk → Python → Logs |
| CORS error en consola | Añadir tu dominio en `CORS_ORIGINS` y reiniciar backend |
| MongoDB no conecta | Whitelist IP del servidor en MongoDB Atlas |
| Imágenes no cargan | Aumentar `client_max_body_size 50M` en nginx |
| `Resend 403` | Verificar dominio en https://resend.com/domains |

---

**¿Dudas?** El backend escucha en `127.0.0.1:8001` y el frontend en `127.0.0.1:3000`. Plesk solo necesita un reverse-proxy SSL al frente.
