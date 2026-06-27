# 🚀 Despliegue MVG Computación → `mvg.goroky.es` (Plesk)

> **Aislamiento garantizado**: este despliegue NO toca tu MongoDB existente
> (tramilex, gym24.app, ingresoqr.com). Usa una BD **nueva** llamada `mvg_db`
> en la misma instancia y puertos `127.0.0.1` propios.

---

## 📋 Resumen

| Componente | Detalle |
|---|---|
| Subdominio | `https://mvg.goroky.es` |
| Repo Git | https://github.com/ebravounda/mvg |
| Stack | FastAPI (Python 3.11) + Expo PWA estática + MongoDB |
| BD | `mvg_db` (nueva en tu Mongo local) |
| Backend port | `127.0.0.1:8101` (configurable) |
| Frontend port | `127.0.0.1:3101` (configurable) |
| Aislamiento | Docker Compose en `/var/www/vhosts/.../mvg` |

---

## 🧭 Paso 1 — SSH al servidor y chequear puertos libres

```bash
ssh tu_usuario@goroky.es
cd /tmp
git clone https://github.com/ebravounda/mvg.git mvg_temp
bash mvg_temp/deploy/check-ports.sh
```

El script imprime los puertos en uso y te sugiere puertos LIBRES (ej. `8101`, `3101`).
Si están ocupados, te avisa cuál usar (`8102`, `8103`…).

**Anota** los puertos sugeridos. Los necesitarás en el paso 4.

---

## 🧭 Paso 2 — Crear el subdominio en Plesk

1. Plesk → **Dominios** → **Añadir subdominio**
2. Subdominio: `mvg` &nbsp; · &nbsp; Dominio padre: `goroky.es`
3. Document root: `/httpdocs/mvg` (lo creará automáticamente — lo dejaremos vacío, sirve para SSL)
4. Click **Aceptar**.
5. Plesk → `mvg.goroky.es` → **Certificado SSL/TLS** → **Get free using Let's Encrypt** → activar.

---

## 🧭 Paso 3 — Clonar el repo en el servidor

```bash
# Dirección típica de Plesk:
cd /var/www/vhosts/goroky.es

# Clonamos el repo (ajustá si tu usuario Plesk no tiene permisos aquí, podés usar tu home)
git clone https://github.com/ebravounda/mvg.git mvg
cd mvg
```

> 💡 Alternativa: Plesk → tu subdominio → **Git** → conectar `https://github.com/ebravounda/mvg`
> branch `main`, deployment path `/mvg`. Plesk hará pull automático cuando hagas push.

---

## 🧭 Paso 4 — Configurar variables de entorno

```bash
cd /var/www/vhosts/goroky.es/mvg/deploy

# 1. Variables Docker (puertos locales)
cp .env.docker.example .env.docker
nano .env.docker
# → Editar BACKEND_PORT y FRONTEND_PORT con los que sugirió check-ports.sh

# 2. Variables de la app (Mongo, Resend, JWT, WhatsApp)
cp .env.production.example .env.production
nano .env.production
# → Cambiar:
#    JWT_SECRET   →  ejecutá:  openssl rand -hex 32   y pegá el resultado
#    WHATSAPP_API_KEY / WHATSAPP_INSTANCE  → tus credenciales mitiendapro
#    ADMIN_PASSWORD  → cambiar a algo seguro
```

**MongoDB**: por defecto el contenedor se conecta al Mongo del **host** vía
`host.docker.internal:27017` con `DB_NAME=mvg_db`. **No toca** tramilex,
gym24, ingresoqr (cada uno tiene su propia BD nombrada distinto).

Si tu Mongo tiene auth, edita `MONGO_URL` así:
```
MONGO_URL=mongodb://USER:PASS@host.docker.internal:27017/?authSource=admin
```

---

## 🧭 Paso 5 — Build del PWA + levantar Docker

```bash
cd /var/www/vhosts/goroky.es/mvg

# Configurar URL del backend para que el PWA llame a /api del mismo dominio
cat > frontend/.env.production <<'EOF'
EXPO_PUBLIC_BACKEND_URL=https://mvg.goroky.es
EOF

# Deploy completo
bash deploy/deploy.sh
```

Esto:
1. Compila el PWA con `npx expo export --platform web` → genera `deploy/frontend-dist/`
2. Construye la imagen Docker del backend
3. Levanta los 2 contenedores: `mvg_backend` y `mvg_frontend`
4. Backend escucha en `127.0.0.1:8101`, Frontend en `127.0.0.1:3101`

Verifica:
```bash
docker ps | grep mvg_
curl -s http://127.0.0.1:8101/api/   # → {"message":"..."}
curl -sI http://127.0.0.1:3101/      # → 200 OK
```

---

## 🧭 Paso 6 — Configurar reverse proxy en Plesk

Plesk → `mvg.goroky.es` → **Apache & nginx Settings** →
sección **"Additional nginx directives"** → pegar:

```nginx
# ===== MVG Computación =====
client_max_body_size 50M;
proxy_read_timeout 120s;

# API → backend Docker
location /api/ {
    proxy_pass http://127.0.0.1:8101;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# Endpoints internos del backend que NO llevan /api (login, etc.)
# (No aplica para MVG — todo va por /api/)

# PWA (todo lo demás) → frontend Docker
location / {
    proxy_pass http://127.0.0.1:3101;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

Click **OK** y luego **Apply**. Plesk recarga nginx.

---

## ✅ Paso 7 — Verificación

1. Abrí `https://mvg.goroky.es` → debe cargar la PWA con el login.
2. Login con `admin@mvg.cl` / tu nueva `ADMIN_PASSWORD`.
3. Probá subir un Excel y crear una orden.
4. Verificá que las otras webs (`tramilex`, `gym24`, `ingresoqr`) siguen funcionando:
   ```bash
   curl -sI https://tramilex.tu_dominio
   curl -sI https://gym24.app
   curl -sI https://ingresoqr.com
   ```

---

## 🔁 Actualizar a una nueva versión

Cuando hagas `git push` en GitHub:

```bash
cd /var/www/vhosts/goroky.es/mvg
bash deploy/deploy.sh update
```

Eso hace `git pull` + rebuild del PWA + rebuild del backend + restart.

---

## 🆘 Comandos útiles

```bash
# Ver logs en vivo
bash deploy/deploy.sh logs

# Reiniciar sin rebuild
bash deploy/deploy.sh restart

# Ver consumo
docker stats mvg_backend mvg_frontend

# Acceder al contenedor backend
docker exec -it mvg_backend bash

# Verificar la BD aislada
docker exec -it mvg_backend python -c \
  "from server import db; import asyncio; \
   asyncio.run(db.command('listCollections'))"
```

---

## 🛡 Seguridad de aislamiento confirmada

| Sistema existente | Su BD Mongo | ¿Afectado? |
|---|---|---|
| tramilex | (su propia BD) | ❌ NO — diferente nombre |
| gym24.app | (su propia BD) | ❌ NO — diferente nombre |
| ingresoqr.com | (su propia BD) | ❌ NO — diferente nombre |
| **MVG (nuevo)** | **`mvg_db`** | ✅ Aislado |

Mongo se conecta por host.docker.internal, **NO** modifica la config del
servicio Mongo del host. Cada sistema usa su `DB_NAME` distinto.

---

## ⚠️ Troubleshooting rápido

| Síntoma | Causa | Solución |
|---|---|---|
| `502 Bad Gateway` | Backend no responde | `docker logs mvg_backend` |
| `CORS error` en consola | Origen no permitido | Verificar `CORS_ORIGINS` en `.env.production` |
| `Mongo connection refused` | host.docker.internal no resuelve | En Linux Plesk, ya está en `extra_hosts` del compose |
| `port already allocated` | Otro servicio usa el puerto | Cambiar `BACKEND_PORT`/`FRONTEND_PORT` en `.env.docker` |
| `Resend 403` | Dominio no verificado en Resend | https://resend.com/domains |
| PWA carga pero sin datos | `EXPO_PUBLIC_BACKEND_URL` mal | Rebuild con la URL correcta |

---

¡Listo! Cualquier duda durante el despliegue, **ejecutá** los comandos arriba y pegame la salida que te interese.
