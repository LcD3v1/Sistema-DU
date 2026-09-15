# FAST — North Police Department

Painel de gestão operacional da unidade FAST (RP): apreensões, efetivo, ranking,
ausências, promoções, recrutamento, avisos, geradores (anúncio/boletim/carteira),
protocolo e um sistema de cargos de permissão granular.

## Stack

- **Frontend:** React 19 + Vite + TypeScript + Tailwind v4 + React Query + Zustand + framer-motion
- **Backend:** Express 5 + TypeScript, JWT + bcrypt, persistência em arquivo JSON, Zod

## Como rodar (desenvolvimento)

```bash
# 1. Instalar dependências
npm run install:all

# 2. Configurar o backend
cd backend
cp .env.example .env
# gere um segredo forte e cole em JWT_SECRET no .env:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# 3. Subir backend (porta 3001) e frontend (porta 5173) — em terminais separados
npm run dev:backend
npm run dev:frontend
```

Acesso padrão: **admin / admin123** — troque a senha no primeiro acesso.

## Build de produção

```bash
npm run build          # instala tudo + builda frontend e backend
NODE_ENV=production node backend/dist/index.js
```
Em produção o backend serve o frontend buildado e ativa CSP/HSTS.

## Segurança

Este projeto segue práticas do OWASP Top 10 (headers/CSP, rate limiting, bcrypt,
lockout de força bruta, JWT revogável, RBAC + permissões por área, auditoria).

```bash
npm run security       # security-check + npm audit + typecheck
```

Documentação completa: [`docs/SECURITY.md`](docs/SECURITY.md).

> ⚠️ **Nunca** versione o arquivo `backend/.env` (ele contém o `JWT_SECRET`).
> Ele já está no `.gitignore`.

## Estrutura

```
backend/   API Express + TS (config, middleware, security, routes, scripts)
frontend/  SPA React + Vite
docs/      Documentação (SECURITY.md)
```

Alguns assets de mídia grandes não são versionados — veja
[`frontend/public/media/README.md`](frontend/public/media/README.md).
