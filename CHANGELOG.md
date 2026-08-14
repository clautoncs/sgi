# Changelog

Todas as mudanças notáveis do projeto SGI serão documentadas neste arquivo.

---

## [0.4.0] - 2026-08-14

### Adicionado
- Sistema de permissões granular com perfil de estoque (varejo/atacado/full)
- Configuração de perfil padrão para novos usuários (Visualizador/varejo)
- Página /configuracoes/permissoes reescrita com configurador completo
- Calculadora de custos/lucro no carrinho (perfil vendedor/full)
- API /api/taxas para configuração de impostos e canais de venda
- Possibilidade de adicionar/remover páginas ao sistema de permissões
- Perfil Vendedor restrito a vendas e estoque

### Alterado
- CSS da sidebar unificado em styles/sidebar.css (removidas 3 cópias)
- Versão atualizada para v0.4.0

### Removido
- users.json (não utilizado - API usa Prisma/TiDB)
- metas.json local (redundante - volume Docker monta /root/metas.json)
- dashboard.css duplicados em /estoque e /configuracoes

---

## [0.3.0] - 2026-08-12

### Adicionado
- Reorganização de rotas: /estoque, /configuracoes/*
- Catálogo de estoque com 317 itens (4 categorias)
- Sistema de pedidos com aprovação por gerente
- Geração de proposta (WhatsApp e PDF)
- Carrinho com desconto/alteração de preço
- Links de fotos (Google Photos) para 55 itens
- Dashboard de vendas com gráfico acumulado, calendário, fila de vendas
- Gerenciamento de usuários com aprovação SSO
- Auto-refresh a cada 2 minutos em todas as páginas
- OpenClaw AI em https://claw.ilinked.com.br

---

## [0.2.0] - 2026-08-04

### Adicionado
- Schema Prisma completo: User, Session, Role, Permission, DataSource, Dashboard, SystemSetting, AuditLog
- Dependências: next-auth v4, bcryptjs
- Seed com roles padrão (admin, manager, viewer), permissões e usuário admin
- Arquivo .env.example com template de variáveis
- Workflow CI/CD via GitHub Actions
- CHANGELOG.md para rastreamento de versões

### Corrigido
- Formato do .env (adicionado prefixo DATABASE_URL=)
- Database alterado de "sys" para "sgi"

---

## [0.1.0] - 2026-07-01

### Adicionado
- Esqueleto inicial do SGI
- Página de status
- Dockerfile multi-stage (builder + runner)
- docker-compose.yml
- Configuração Nginx com proxy reverso
- SSL via Let's Encrypt/Certbot
- API health check do banco (/api/health/db)
