# SGI — Sistema de Gerenciamento iLinked

**PCBH Informática** — R. Malaga, 53, Contagem/MG

Sistema de dashboards e gestão comercial com autenticação, permissionamento granular, integração com Google Sheets, catálogo de estoque com pedidos e calculadora de custos.

**Produção:** https://sgi.ilinked.com.br

---

## Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Next.js 16 (App Router), TypeScript, Recharts, Framer Motion |
| Backend | Next.js API Routes, Prisma ORM |
| Banco de Dados | TiDB Cloud (MySQL compatível) |
| Autenticação | NextAuth.js v4 (Credentials + Google SSO) |
| Infraestrutura | Docker (multi-stage), Nginx 1.24, Let's Encrypt SSL |
| CI/CD | GitHub Actions (deploy automático no push para main) |
| VPS | Ubuntu 24.04 LTS, IP 206.183.129.142 |

---

## Estrutura de Rotas

| Rota | Descrição | Acesso |
|------|-----------|--------|
| `/` | Página de login (email/senha ou Google SSO) | Público |
| `/dashboard` | Painel principal com ações rápidas e status | Autenticado |
| `/dashboard/vendas` | Dashboard de vendas com metas, gráfico acumulado, calendário | Autenticado |
| `/estoque` | Catálogo de estoque (3 perfis: prateleira/revenda/vendedor) | Autenticado |
| `/estoque/pedidos` | Listagem e aprovação de pedidos | Autenticado |
| `/estoque/pedido?id=X` | Pedido individual editável | Autenticado |
| `/estoque/proposta` | Geração de proposta em PDF | Autenticado |
| `/configuracoes/metas` | Configuração de metas mensais por vendedor | Admin/Gerente |
| `/configuracoes/integracoes` | Status das integrações do sistema | Admin/Gerente |
| `/configuracoes/usuarios` | Gerenciamento de usuários (CRUD, aprovação SSO) | Admin |
| `/configuracoes/permissoes` | Configuração de perfis e permissões granulares | Admin |
| `/status` | Informações técnicas do sistema | Autenticado |
| `/api/health/db` | Health check do banco de dados | Público |

---

## Sistema de Permissões

### Perfis Padrão

| Perfil | Estoque | Acesso |
|--------|---------|--------|
| **Administrador do Sistema** | Full | Acesso total a tudo |
| **Gerente** | Full | Dashboards, estoque, aprovação de pedidos, configurações |
| **Vendedor** | Full (com calculadora de custos) | Dashboard de vendas + Estoque + Pedidos |
| **Visualizador** | Varejo (prateleira) | Apenas catálogo de estoque (perfil padrão para novos usuários) |

### Perfis de Estoque

| Perfil | Visualização |
|--------|-------------|
| Varejo (Prateleira) | Apenas preço de prateleira |
| Atacado + Varejo (Revenda) | Preço de prateleira + preço de revenda |
| Full (Vendedor) | Todos os preços incluindo custo + calculadora de custos |

### Configuração via Interface

Tudo configurável em `/configuracoes/permissoes`:
- Criar/editar/excluir perfis customizados
- Definir perfil padrão para novos usuários
- Definir perfil de estoque padrão
- Permissões granulares por página (Visualizar / Editar / Gerenciar)
- Adicionar novas páginas ao sistema de permissões
- Ativar/desativar permissões por módulo

---

## Dashboard de Vendas

- **Fonte:** Google Sheets (Service Account)
- **Atualização:** A cada 2 minutos (auto-refresh)
- **Cards:** Total Vendas Dia, Total Vendas Mês, Meta do Mês, Meta Faltante, Ticket Médio, Lucro Total
- **Gráfico:** Evolução diária acumulada vs meta (Recharts) — linha verde (vendas) vs laranja tracejada (meta)
- **Calendário:** Histórico de vendas por dia clicável
- **Fila:** Vendas do dia selecionado (horizontal, com zoom ao hover)
- **Tabela:** Performance por vendedor
- **Vendedores:** FLÁVIA, YASMIN, CLAUTON

---

## Catálogo de Estoque

- **Fonte:** Google Sheets (4 abas: COMPUTADORES, NOTEBOOKS, MONITORES, COMPONENTES)
- **Total:** 317 itens (74 Computadores, 37 Notebooks, 22 Monitores, 184 Componentes)
- **Atualização:** A cada 2 minutos
- **Funcionalidades:**
  - Busca em tempo real
  - Filtros por categoria
  - 3 perfis de preço (prateleira/revenda/vendedor)
  - Links de fotos (Google Photos)
  - Carrinho com desconto/alteração de preço por item
  - Geração de proposta (WhatsApp e PDF)
  - Sistema de pedidos com aprovação por gerente

### Calculadora de Custos (Perfil Full)

Visível apenas no perfil Vendedor, no painel do carrinho:
- **Imposto (NF):** Padrão 12%, editável por orçamento
- **Canal de Venda:** Vendedor (0%), Shopee (20%), Licitador (10%) — editáveis
- **Resumo:** Receita, Custo, Imposto, Comissão, Lucro Líquido, Margem %
- Configurações de taxas persistentes via `/api/taxas`

---

## APIs

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/sheets` | GET | Dados de vendas (Google Sheets) |
| `/api/estoque` | GET | Dados de estoque (Google Sheets, 4 abas) |
| `/api/metas` | GET/POST | Metas mensais (arquivo JSON persistente) |
| `/api/pedidos` | GET/POST | CRUD de pedidos (arquivo JSON persistente) |
| `/api/taxas` | GET/POST | Configuração de impostos e canais de venda |
| `/api/usuarios` | GET/POST | CRUD de usuários (Prisma/TiDB) |
| `/api/permissoes` | GET/POST | CRUD de perfis e permissões (arquivo JSON) |
| `/api/health/db` | GET | Health check do banco |
| `/api/auth/[...nextauth]` | * | Autenticação NextAuth.js |

---

## Arquivos Persistentes (Volumes Docker)

| Arquivo | Caminho no Host | Caminho no Container | Descrição |
|---------|----------------|---------------------|-----------|
| `google-credentials.json` | `/root/google-credentials.json` | `/app/google-credentials.json` | Chave Service Account Google (read-only) |
| `metas.json` | `/root/metas.json` | `/app/metas.json` | Metas mensais por vendedor |
| `pedidos.json` | `/root/pedidos.json` | `/app/data/pedidos.json` | Pedidos do sistema |
| `taxas.json` | `/root/taxas.json` | `/app/taxas.json` | Configuração de impostos e canais |
| `roles.json` | `./roles.json` | `/app/roles.json` | Perfis e permissões |
| `shopee-config.json` | `/root/shopee-config.json` | `/app/shopee-config.json` | Credenciais e token OAuth da Shopee |
| `shopee-costs.json` | `/root/shopee-costs.json` | `/app/shopee-costs.json` | Custo cadastrado por produto (Shopee) |

---

## Estrutura do Projeto

```
sgi-skeleton/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts   # Autenticação
│   │   ├── estoque/route.ts              # Dados de estoque
│   │   ├── health/db/route.ts            # Health check
│   │   ├── metas/route.ts                # Metas mensais
│   │   ├── pedidos/route.ts              # CRUD pedidos
│   │   ├── permissoes/route.ts           # CRUD permissões
│   │   ├── sheets/route.ts               # Dados de vendas
│   │   ├── taxas/route.ts                # Impostos e canais
│   │   └── usuarios/route.ts             # CRUD usuários
│   ├── configuracoes/
│   │   ├── integracoes/page.tsx
│   │   ├── metas/page.tsx
│   │   ├── permissoes/page.tsx + permissoes.css
│   │   ├── usuarios/page.tsx + usuarios.css
│   │   └── layout.tsx
│   ├── dashboard/
│   │   ├── vendas/page.tsx + vendas.css
│   │   ├── page.tsx                      # Painel principal
│   │   └── layout.tsx
│   ├── estoque/
│   │   ├── pedido/page.tsx + pedido.css
│   │   ├── pedidos/page.tsx + pedidos.css
│   │   ├── proposta/page.tsx + proposta.css
│   │   ├── page.tsx + estoque.css        # Catálogo + carrinho
│   │   └── layout.tsx
│   ├── status/page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   ├── login.css
│   ├── page.tsx                          # Login
│   └── providers.tsx
├── lib/
│   └── prisma.ts
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── styles/
│   └── sidebar.css                       # CSS compartilhado da sidebar
├── .env.example
├── .github/workflows/deploy.yml
├── docker-compose.yml
├── Dockerfile
├── middleware.ts
├── package.json
├── roles.json
└── tsconfig.json
```

---

## Deploy

### Automático (CI/CD)

Push para `main` → GitHub Actions → SSH na VPS → `docker compose up -d --build`

### Manual

```bash
ssh root@206.183.129.142
cd /root/sgi-skeleton
git pull origin main
docker compose up -d --build
```

### Verificar Logs

```bash
docker logs sgi 2>&1 | tail -20
```

---

## Credenciais

| Serviço | Usuário | Observação |
|---------|---------|-----------|
| SGI Admin | admin@ilinked.com.br / admin123 | Role: sysadmin (acesso total) |
| Google SSO | clauton.cs2@gmail.com | Role: sysadmin |
| VPS SSH | root | Senha no .env da CI/CD |
| TiDB Cloud | Configurado no DATABASE_URL | Banco: sgi |
| Google Sheets | Service Account | shetts@golden-shine-142418.iam.gserviceaccount.com |

---

## Serviços Relacionados

| Serviço | URL | Descrição |
|---------|-----|-----------|
| SGI | https://sgi.ilinked.com.br | Sistema principal |
| OpenClaw AI | https://claw.ilinked.com.br | Assistente IA (Gemini 2.0 Flash) |

---

## Versão

**v0.4.0** — Agosto 2026
