# Changelog

Todas as mudanças notáveis do projeto SGI serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

---

## [0.2.0] - 2026-08-04

### Adicionado

- Schema Prisma completo: User, Session, Role, Permission, DataSource, Dashboard, SystemSetting, AuditLog
- Dependências: next-auth v4, bcryptjs
- Seed com roles padrão (admin, manager, viewer), permissões e usuário admin
- Arquivo `.env.example` com template de variáveis
- Workflow CI/CD via GitHub Actions (deploy automático no push para main)
- CHANGELOG.md para rastreamento de versões

### Corrigido

- Formato do `.env` (adicionado prefixo DATABASE_URL=)
- Database alterado de "sys" para "sgi" (banco dedicado)

---

## [0.1.0] - 2026-07-01

### Adicionado

- Esqueleto inicial do SGI (Fatia 0)
- Página de status confirmando sistema no ar
- Dockerfile multi-stage (builder + runner)
- docker-compose.yml com porta exposta apenas no localhost
- Configuração Nginx com proxy reverso
- SSL via Let's Encrypt/Certbot
- Script deploy.sh para atualização rápida
- Script db.sh para gerenciamento do banco via container
- API health check do banco (/api/health/db)

---

## Formato das Entradas

- **Adicionado** para novas funcionalidades
- **Alterado** para mudanças em funcionalidades existentes
- **Obsoleto** para funcionalidades que serão removidas em breve
- **Removido** para funcionalidades removidas
- **Corrigido** para correção de bugs
- **Segurança** para vulnerabilidades corrigidas
