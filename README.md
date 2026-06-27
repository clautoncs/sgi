# SGI — PCBH Informática

Sistema de Gestão Integrado. Stack: Next.js + (TiDB Cloud + Prisma a seguir).

Este é o **esqueleto** (Fatia 0): uma página de status que confirma o sistema no ar.
O objetivo dela é provar que toda a tubulação de deploy funciona, ponta a ponta.

## O que tem aqui

| Arquivo | Para que serve |
|---|---|
| `app/` | O código da aplicação (a página de status). |
| `Dockerfile` | Receita que empacota o app num container. |
| `docker-compose.yml` | Sobe o container; publica a porta só no localhost do VPS. |
| `nginx/sgi.conf` | Config do Nginx (proxy reverso para `sgi.ilinked.com.br`). |
| `deploy.sh` | Atualiza o sistema com um comando só. |
| `.gitignore` | Lista do que NÃO vai para o Git (segredos, build, node_modules). |

## Rodar no VPS (resumo — o passo a passo detalhado vem no chat)

```bash
# 1. Subir o container
docker compose up -d --build

# 2. Conferir que respondeu localmente
curl http://localhost:3000

# 3. Ativar a config do Nginx
sudo cp nginx/sgi.conf /etc/nginx/sites-available/sgi.conf
sudo ln -s /etc/nginx/sites-available/sgi.conf /etc/nginx/sites-enabled/sgi.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# 4. Emitir o certificado SSL (com o domínio já apontando para o VPS)
sudo certbot --nginx -d sgi.ilinked.com.br
```

## Atualizar depois

```bash
./deploy.sh
```
