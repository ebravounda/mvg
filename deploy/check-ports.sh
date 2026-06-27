#!/usr/bin/env bash
# Chequeo de puertos en el servidor antes del deploy.
# Uso:  bash deploy/check-ports.sh
#
# Lista los servicios escuchando y propone puertos libres para MVG.

set -e
echo "========================================="
echo " Puertos TCP escuchando en este servidor"
echo "========================================="
if command -v ss >/dev/null 2>&1; then
  ss -tlnp 2>/dev/null | awk 'NR==1 || /LISTEN/'
else
  netstat -tlnp 2>/dev/null | grep LISTEN
fi

echo
echo "=========================="
echo " Servicios Docker corriendo"
echo "=========================="
if command -v docker >/dev/null 2>&1; then
  docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}' || true
else
  echo "(docker no instalado)"
fi

echo
echo "========================================"
echo " Sugerencia de puertos LIBRES para MVG"
echo "========================================"
for p in 8101 8102 8103 8104 8105 8106 8107 8108; do
  if ! (ss -tln 2>/dev/null | grep -q ":$p \b" || netstat -tln 2>/dev/null | grep -q ":$p \b"); then
    echo "  ✓ Backend BACKEND_PORT=$p (LIBRE)"
    break
  fi
done
for p in 3101 3102 3103 3104 3105 3106 3107 3108; do
  if ! (ss -tln 2>/dev/null | grep -q ":$p \b" || netstat -tln 2>/dev/null | grep -q ":$p \b"); then
    echo "  ✓ Frontend FRONTEND_PORT=$p (LIBRE)"
    break
  fi
done

echo
echo "Pega los valores en deploy/.env.docker"
