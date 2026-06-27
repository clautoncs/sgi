# ---------- Etapa 1: build ----------
# Compila a aplicação. Esta etapa é "descartada" no fim — só aproveitamos
# o resultado, deixando a imagem final pequena.
FROM node:22-alpine AS builder
WORKDIR /app

# Copia só os manifestos primeiro (melhora o cache do Docker:
# só reinstala dependências quando o package.json muda).
COPY package.json package-lock.json ./
RUN npm ci

# Copia o resto do código e gera o build de produção.
COPY . .
RUN npm run build

# ---------- Etapa 2: produção ----------
# Imagem final, só com o necessário para rodar.
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
# Porta interna do container (o Nginx vai falar com ela).
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Roda como usuário sem privilégios (segurança).
RUN addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -S nextjs

# Copia o build standalone (o servidor + só as dependências usadas).
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
