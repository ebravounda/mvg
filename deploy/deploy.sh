#!/usr/bin/env bash
# MVG Computación — Despliegue Plesk
# Uso:
#   bash deploy/deploy.sh           # Deploy completo (primera vez)
#   bash deploy/deploy.sh update    # Pull + rebuild + restart
#   bash deploy/deploy.sh restart   # Solo restart
#   bash deploy/deploy.sh logs      # Ver logs en vivo

set -e
MODE=${1:-deploy}
cd "$(dirname "$0")/.."

build_frontend() {
  echo "==> Building PWA (Expo web export)"
  cd frontend
  cp -f .env.production .env || true
  yarn install --frozen-lockfile
  npx expo export --platform web --output-dir ../deploy/frontend-dist
  cd ..
  echo "==> PWA listo en deploy/frontend-dist"
}

docker_up() {
  echo "==> Levantando contenedores"
  cd deploy
  set -a; source .env.docker; set +a
  docker compose up -d --build
  cd ..
  echo "==> Contenedores arriba"
  docker ps --filter name=mvg_
}

case "$MODE" in
  deploy)
    build_frontend
    docker_up
    ;;
  update)
    echo "==> git pull"
    git pull --ff-only
    build_frontend
    docker_up
    ;;
  restart)
    cd deploy && docker compose restart && cd ..
    ;;
  logs)
    cd deploy && docker compose logs -f --tail=100
    ;;
  *)
    echo "Modo desconocido: $MODE"
    exit 1
    ;;
esac
