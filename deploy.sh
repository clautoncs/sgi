#!/usr/bin/env bash
# Script de deploy do SGI.
# Uso: ./deploy.sh
# Ele puxa o código mais novo do GitHub, reconstrói o container e sobe.

set -e  # para na primeira falha

echo "==> Puxando código mais recente do GitHub..."
git pull

echo "==> Reconstruindo e subindo o container..."
docker compose up -d --build

echo "==> Limpando imagens antigas não usadas..."
docker image prune -f

echo ""
echo "==> Deploy concluído. Estado do container:"
docker compose ps
