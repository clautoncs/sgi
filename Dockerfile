# ---------- Etapa 1: build ----------
FROM node:22-slim AS builder
WORKDIR /app

# openssl é exigido pelo Prisma.
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Instala dependências (com o schema já presente para o Prisma gerar o cliente).
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate

# Copia o resto e gera o build de produção.
COPY . .
RUN npm run build

# ---------- Etapa 2: produção ----------
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Usuário sem privilégios (segurança).
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nextjs

# Build standalone enxuto.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Motor e cliente do Prisma (garante que o app fala com o banco em produção).
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
