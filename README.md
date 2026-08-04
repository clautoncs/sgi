# SGI — Sistema de Gerenciamento iLinked

> Plataforma de dashboards com autenticação, permissionamento e integrações configuráveis.

**PCBH Informática** · R. Malaga, 53 — Santa Cruz Industrial, Contagem/MG

---

## Visão Geral

O SGI é uma aplicação web de dashboards desenvolvida para centralizar dados de múltiplas fontes (Google Ads, Meta Ads, planilhas, APIs) em painéis customizáveis. O sistema conta com autenticação local e SSO Google, controle de acesso baseado em roles (RBAC) e auditoria de ações.

---

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 16 (React 19, TypeScript) |
| Backend | Next.js API Routes (App Router) |
| ORM | Prisma 6 |
| Banco de Dados | TiDB Cloud (MySQL compatível) |
| Autenticação | NextAuth.js v4 (Credentials + Google OAuth) |
| Container | Docker (multi-stage build) |
| Proxy Reverso | Nginx 1.24 + Let's Encrypt (HTTPS) |
| CI/CD | GitHub Actions |
| VPS | Ubuntu 24.04 LTS |

---

## Estrutura do Projeto

```
sgi/
  app/                        # Páginas e rotas (App Router)
    api/                      # API Routes
      health/db/route.ts      # Health check do banco
    globals.css               # Estilos globais
    layout.tsx                # Layout raiz
    page.tsx                  # Página inicial
  lib/                        # Utilitários compartilhados
    prisma.ts                 # Singleton do Prisma Client
  prisma/
    schema.prisma             # Schema do banco de dados
    seed.ts                   # Dados iniciais (roles, admin)
  nginx/
    sgi.conf                  # Configuração Nginx
  .github/
    workflows/
      deploy.yml              # CI/CD - Deploy automático
  docker-compose.yml          # Orquestração do container
  Dockerfile                  # Build multi-stage
  deploy.sh                   # Script de deploy manual
  db.sh                       # Gerenciamento do banco (Prisma)
  .env                        # Variáveis de ambiente (NAO versionado)
  .env.example                # Exemplo de variáveis
  .gitignore                  # Arquivos ignorados pelo Git
  next.config.js              # Configuração Next.js
  tsconfig.json               # Configuração TypeScript
  package.json                # Dependências e scripts
```

---

## Pré-requisitos

- Docker >= 24.0
- Docker Compose >= 2.0
- Git >= 2.40
- Domínio apontando para o IP do VPS (DNS A record)

---

## Instalação

### 1. Clonar o repositório

```bash
git clone git@github.com:clautoncs/sgi.git /root/sgi-skeleton
cd /root/sgi-skeleton
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
nano .env
```

### 3. Criar tabelas no banco

```bash
./db.sh db push
```

### 4. Popular dados iniciais

```bash
docker run --rm --env-file .env -v "$PWD":/app -w /app node:22-slim \
  sh -c 'apt-get update -qq && apt-get install -y -qq openssl ca-certificates >/dev/null 2>&1 && npm ci --no-audit --no-fund >/dev/null 2>&1 && npx tsx prisma/seed.ts'
```

### 5. Build e deploy

```bash
docker compose up -d --build
```

### 6. Configurar Nginx + SSL

```bash
sudo cp nginx/sgi.conf /etc/nginx/sites-available/sgi.conf
sudo ln -sf /etc/nginx/sites-available/sgi.conf /etc/nginx/sites-enabled/sgi.conf
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d sgi.ilinked.com.br
```

---

## Deploy

### Deploy Manual

```bash
./deploy.sh
```

Este script executa: `git pull` -> `docker compose up -d --build` -> `docker image prune -f`

### Deploy Automático (CI/CD)

O deploy é acionado automaticamente a cada push na branch `main` via GitHub Actions. O workflow SSH conecta na VPS e executa o `deploy.sh`.

---

## Gerenciamento do Banco

```bash
# Sincronizar schema com o banco (sem migrações)
./db.sh db push

# Criar uma migração formal
./db.sh migrate dev --name descricao_da_mudanca

# Resetar banco (CUIDADO: apaga tudo)
./db.sh migrate reset

# Abrir Prisma Studio (interface visual)
./db.sh studio
```

---

## Versionamento

O projeto segue **Semantic Versioning (SemVer)**:

```
MAJOR.MINOR.PATCH
```

| Tipo | Quando incrementar | Exemplo |
|---|---|---|
| MAJOR | Mudanças incompatíveis na API/estrutura | 1.0.0 -> 2.0.0 |
| MINOR | Nova funcionalidade compatível | 1.0.0 -> 1.1.0 |
| PATCH | Correção de bug | 1.0.0 -> 1.0.1 |

### Tags de Release

```bash
git tag -a v1.0.0 -m "Release 1.0.0: Autenticação e permissionamento"
git push origin v1.0.0
```

### Branches

| Branch | Propósito |
|---|---|
| `main` | Produção — deploy automático |
| `develop` | Desenvolvimento — integração de features |
| `feature/*` | Novas funcionalidades |
| `hotfix/*` | Correções urgentes em produção |

---

## Módulos do Sistema

### Autenticação

- Login local (email + senha com bcrypt)
- SSO Google (OAuth 2.0 via NextAuth)
- Sessões com expiração configurável
- Registro de IP e user-agent

### Permissionamento (RBAC)

- Roles: Administrador, Gerente, Visualizador (customizáveis)
- Permissões granulares por módulo
- Vínculo role <-> permissão (N:N)

### Fontes de Dados

- Tipo: API, Database, Spreadsheet, Webhook
- Providers: Google Ads, Meta Ads, Sheets, Custom
- Configuração JSON criptografada
- Sincronização com timestamp

### Dashboards

- Slug único para URLs amigáveis
- Layout e widgets configuráveis via JSON
- Vínculo com múltiplas fontes
- Ordenação customizável

### Configurações

- Chave-valor com tipagem (string, number, boolean, json)
- Agrupamento: general, appearance, auth, integrations
- Interface de administração

### Auditoria

- Log de todas as ações (login, CRUD, config)
- Rastreamento por usuário e IP
- Detalhes em JSON

---

## Variáveis de Ambiente

| Variável | Descrição | Exemplo |
|---|---|---|
| `DATABASE_URL` | URL de conexão MySQL/TiDB | `mysql://user:pass@host:4000/sgi?sslaccept=strict` |
| `NEXTAUTH_SECRET` | Chave secreta para JWT | (gerar com `openssl rand -base64 32`) |
| `NEXTAUTH_URL` | URL base da aplicação | `https://sgi.ilinked.com.br` |
| `GOOGLE_CLIENT_ID` | OAuth Google (opcional) | `xxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Secret OAuth Google | `GOCSPX-xxx` |

---

## Contribuição

1. Crie uma branch a partir de `develop`: `git checkout -b feature/nome-da-feature`
2. Desenvolva e teste localmente
3. Commit com mensagem descritiva (padrão Conventional Commits)
4. Abra um Pull Request para `develop`
5. Após revisão, merge para `develop` -> depois para `main` (deploy)

### Padrão de Commits

```
feat: adiciona login com Google SSO
fix: corrige validação de email no cadastro
docs: atualiza README com instruções de deploy
refactor: reorganiza middleware de autenticação
chore: atualiza dependências do Prisma
```

---

## Licença

Projeto privado — PCBH Informática / iLinked. Todos os direitos reservados.
