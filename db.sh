#!/usr/bin/env bash
# Roda comandos do Prisma num container temporário — sem instalar Node no VPS.
# Exemplos:
#   ./db.sh db push                  (cria/atualiza as tabelas no banco)
#   ./db.sh migrate dev --name init  (cria uma migração)
set -e
docker run --rm --env-file .env -v "$PWD":/app -w /app node:22-slim \
  sh -c "apt-get update -qq && apt-get install -y -qq openssl ca-certificates >/dev/null 2>&1 && npm ci --no-audit --no-fund && npx prisma $*"
