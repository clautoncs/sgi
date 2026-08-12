# SGI - Sistema de Gerenciamento iLinked

Sistema de dashboards e gerenciamento para a **PCBH Informática** (R. Malaga, 53, Contagem/MG).

## Acesso

- **URL:** https://sgi.ilinked.com.br
- **Login:** admin@ilinked.com.br / admin123
- **SSO Google:** Habilitado (usuários aprovados pelo admin)

## Stack Tecnológica

| Tecnologia | Versão | Uso |
|---|---|---|
| Next.js | 16.2.9 | Framework (App Router, TypeScript) |
| Prisma | 6.19.3 | ORM |
| TiDB Cloud | MySQL | Banco de dados (autenticação/usuários) |
| NextAuth.js | v4 | Autenticação (Credentials + Google SSO) |
| Recharts | - | Gráficos interativos |
| Framer Motion | - | Animações |
| Google Sheets API | - | Dados de vendas e estoque (tempo real) |
| Docker | 29.6.1 | Containerização |
| Nginx | 1.24 | Reverse proxy + SSL |
| Let's Encrypt | - | Certificado SSL |

## Estrutura de Rotas

| Rota | Descrição | Proteção |
|---|---|---|
| `/` | Página de login | Pública |
| `/status` | Status do sistema | Pública |
| `/dashboard` | Painel de controle | Autenticado |
| `/dashboard/vendas` | Dashboard de vendas | Autenticado |
| `/estoque` | Catálogo de estoque | Autenticado |
| `/estoque/pedidos` | Listagem de pedidos | Autenticado |
| `/estoque/pedido?id=X` | Pedido individual | Autenticado |
| `/estoque/proposta` | Geração de proposta PDF | Autenticado |
| `/configuracoes/metas` | Configuração de metas | Autenticado |
| `/configuracoes/usuarios` | Gerenciamento de usuários | Autenticado |
| `/configuracoes/permissoes` | Perfis e permissões | Autenticado |
| `/configuracoes/integracoes` | Fontes de dados | Autenticado |

## APIs

| Endpoint | Método | Descrição |
|---|---|---|
| `/api/sheets` | GET | Dados de vendas (Google Sheets) |
| `/api/metas` | GET/POST | CRUD de metas mensais |
| `/api/estoque` | GET | Dados de estoque (Google Sheets) |
| `/api/pedidos` | GET/POST/PUT/DELETE | CRUD de pedidos |
| `/api/usuarios` | GET/POST/PUT/DELETE | CRUD de usuários |
| `/api/permissoes` | GET/POST/PUT/DELETE | CRUD de perfis/permissões |
| `/api/health` | GET | Health check |

## Fontes de Dados (Google Sheets)

### Planilha de Vendas
- **ID:** 1lB-W_5t0H3dWLBKZdKxJ00mKSktkaXidrv1k_rTWYN4
- **Abas:** AGOSTO-26, JULHO-26, JUNHO-26, etc.
- **Colunas:** DATA, VENDEDOR, ORIGEM, ANÚNCIO, BASE, PRODUTO, VALOR, FRETE, PAGAMENTO, NOME, TELEFONE, SISTEMA, CUSTO, TOTAL DIA
- **Vendedores:** FLÁVIA, YASMIN, CLAUTON

### Planilha de Estoque
- **ID:** 1o-AtrxDoSzDjOwNt_UIsbe5vtFrgSDLywd1a7nxI22U
- **Abas:** COMPUTADORES, NOTEBOOKS, COMPONENTES, MONITORES
- **Service Account:** shetts@golden-shine-142418.iam.gserviceaccount.com

## Funcionalidades

### Dashboard de Vendas
- Cards: Total Vendas Dia, Total Vendas, Meta do Mês, Meta Faltante, Ticket Médio, Lucro Total
- Gráfico evolução diária vs meta (Recharts) com tooltip interativo
- Calendário mensal com histórico de vendas por dia
- Fila horizontal de vendas do dia selecionado
- Tabela de performance por vendedor
- Auto-refresh a cada 2 minutos
- Seletor de mês

### Catálogo de Estoque
- 4 categorias: Computadores, Notebooks, Componentes, Monitores
- 3 perfis de visualização: Prateleira, Revenda, Vendedor
- Busca em tempo real
- Links de fotos dos produtos (Google Photos)
- Carrinho com desconto/alteração de preço
- Sistema de pedidos com aprovação por gerente
- Geração de proposta (WhatsApp e PDF)
- Auto-refresh a cada 2 minutos

### Gerenciamento de Usuários
- Listagem com filtros (Ativos, Pendentes, Bloqueados)
- Criação manual de usuários
- Aprovação de login SSO Google
- Edição de perfil de acesso

### Permissões
- Perfis: Administrador, Gerente, Vendedor, Visualizador
- Permissões granulares por página (Visualizar, Editar, Gerenciar)
- Criação de perfis customizados

## Infraestrutura

- **VPS:** 206.183.129.142 (Ubuntu 24.04 LTS)
- **Container SGI:** porta 127.0.0.1:3000
- **Container OpenClaw:** porta 0.0.0.0:18789 (https://claw.ilinked.com.br)
- **Nginx:** Reverse proxy com SSL para ambos os domínios
- **CI/CD:** GitHub Actions (deploy automático no push para main)

## Deploy Manual

```bash
ssh root@206.183.129.142
cd /root/sgi-skeleton
docker compose up -d --build
```

## Variáveis de Ambiente (.env)

```
DATABASE_URL=mysql://...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://sgi.ilinked.com.br
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CREDENTIALS_PATH=/app/google-credentials.json
GOOGLE_SHEET_ID=1lB-W_5t0H3dWLBKZdKxJ00mKSktkaXidrv1k_rTWYN4
GOOGLE_SHEET_ESTOQUE_ID=1o-AtrxDoSzDjOwNt_UIsbe5vtFrgSDLywd1a7nxI22U
```

## Segurança

- Chaves de autenticação armazenadas APENAS no .env da VPS
- Credenciais Google (JSON) montadas como volume Docker (fora do repositório)
- Metas e pedidos em arquivos JSON persistentes (volumes Docker)
- Middleware NextAuth protege todas as rotas internas
- SSL/HTTPS obrigatório

## Licença

Proprietário - PCBH Informática / iLinked
