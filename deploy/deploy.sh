#!/usr/bin/env bash
# MVG Computación — Despliegue 100% Docker (no necesita Node/yarn en host)
# Uso:
#   bash deploy/deploy.sh           # Deploy completo
#   bash deploy/deploy.sh update    # git pull + rebuild + restart
#   bash deploy/deploy.sh restart   # Solo restart
#   bash deploy/deploy.sh stop      # Detener
#   bash deploy/deploy.sh logs      # Ver logs en vivo

set -e
MODE=${1:-deploy}
cd "$(dirname "$0")/.."

docker_up() {
  echo "==> Building & starting containers (esto puede tardar 3-5 min la primera vez)"
  cd deploy
  set -a; source .env.docker; set +a
  docker compose up -d --build
  cd ..
  echo
  echo "==> Estado:"
  docker ps --filter name=mvg_
}

case "$MODE" in
  deploy)
    docker_up
    ;;
  update)
    echo "==> git pull"
    git pull --ff-only
    docker_up
    ;;
  restart)
    cd deploy && docker compose restart
    ;;
  stop)
    cd deploy && docker compose down
    ;;
  logs)
    cd deploy && docker compose logs -f --tail=100
    ;;
  *)
    echo "Modo desconocido: $MODE"
    echo "Usa: deploy | update | restart | stop | logs"
    exit 1
    ;;
esac
