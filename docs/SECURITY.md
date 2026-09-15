# Segurança — FAST / North Police Department

Este documento descreve a arquitetura de segurança do painel FAST, como mantê‑lo
seguro, como atualizar dependências, como fazer deploy com segurança e como
reagir em caso de incidente.

> **Regra de ouro:** o arquivo `backend/.env` contém segredos e **nunca** deve ser
> versionado nem compartilhado. Ele já está no `.gitignore`.

---

## 1. Arquitetura de segurança (defesa em profundidade)

| Camada | Implementação | Arquivo |
|--------|---------------|---------|
| Validação de ambiente (fail‑fast) | Aborta o boot se `JWT_SECRET` for fraco/placeholder | `backend/src/config/env.ts` |
| Headers HTTP / CSP / HSTS | Helmet + Permissions‑Policy | `backend/src/middleware/securityHeaders.ts` |
| Rate limiting | Global, API, login e ações críticas | `backend/src/middleware/rateLimiter.ts` |
| Sanitização de entrada | Anti null‑byte, path traversal e prototype pollution | `backend/src/middleware/sanitize.ts` |
| Validação de schema | Zod em todas as rotas de escrita | `backend/src/middleware/validate.ts` |
| Autenticação | JWT (8h) com `jti` revogável | `backend/src/routes/auth.ts`, `middleware/auth.ts` |
| Hashing de senha | bcrypt (cost 12) + comparação timing‑safe | `backend/src/routes/auth.ts` |
| Força bruta | Lockout por conta (5 tentativas / 15 min) | `backend/src/security/bruteForce.ts` |
| Revogação de token | Blacklist de `jti` (logout) | `backend/src/security/tokenBlacklist.ts` |
| Autorização (RBAC) | Níveis admin/moderador/membro/view_only | `backend/src/middleware/roles.ts` |
| Permissões granulares | Cargos por área (ver/editar) | `backend/src/permAreas.ts`, `routes/config.ts` |
| Auditoria | Log estruturado de eventos de segurança | `backend/src/security/audit.ts` |
| HPP | Proteção contra HTTP Parameter Pollution | `hpp` em `index.ts` |
| Tratador global de erros | Nunca vaza stack trace ao cliente | `backend/src/index.ts` |

### Mapeamento OWASP Top 10 (2021)

- **A01 Broken Access Control** → `requireAuth` + `roles.ts` + cargos por área; rotas de escrita bloqueiam `view_only`.
- **A02 Cryptographic Failures** → bcrypt cost 12; JWT com segredo forte validado no boot; HSTS/HTTPS em produção.
- **A03 Injection** → sem SQL (persistência JSON); Zod valida tipos; `sanitize.ts` remove null‑bytes/path traversal; `hpp` evita poluição de parâmetros. **Não** há `eval`/`child_process`/exec no código.
- **A04 Insecure Design** → princípio do menor privilégio, lockout, fail‑fast de config.
- **A05 Security Misconfiguration** → Helmet, CSP restritiva, `X‑Powered‑By` desligado, erros genéricos.
- **A06 Vulnerable Components** → `npm run audit` / `audit:fix`; hoje **0 vulnerabilidades**.
- **A07 Auth Failures** → lockout de força bruta, rate limit de login, mensagens genéricas, expiração de token.
- **A08 Integrity Failures** → CSP `object-src 'none'`, `base-uri 'self'`; sem scripts de terceiros exceto o embed do Protocolo (heyzine).
- **A09 Logging & Monitoring** → `audit.log` com login, alterações e tentativas suspeitas.
- **A10 SSRF** → o backend não faz requisições a URLs fornecidas pelo usuário (apenas Discord OAuth com endpoints fixos).

---

## 2. Como manter seguro (rotina)

1. **Antes de cada release**, rode:
   ```bash
   npm run security          # na raiz: security:check + audit + typecheck do backend + audit do frontend
   ```
2. **Segredos**: gere um `JWT_SECRET` único por ambiente:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```
   Rotacione o segredo se suspeitar de vazamento — isso invalida todos os tokens (todos re‑logam).
3. **Contas**: mantenha o menor número possível de administradores. Revise a aba
   **Configurações → Contas** e **Permissões** periodicamente.
4. **Auditoria**: revise `backend/audit.log` (eventos `LOGIN_FAILED`, `LOGIN_LOCKED`,
   `PRIVILEGE_ESCALATION_ATTEMPT`, `RATE_LIMIT_HIT`).

---

## 3. Como atualizar dependências

```bash
# ver vulnerabilidades
cd backend && npm audit
cd ../frontend && npm audit

# aplicar correções semver-compatíveis (seguro)
npm audit fix

# atualizações major (podem quebrar) — revise antes:
npm audit fix --force   # use com cautela + rode os typechecks depois
```
Sempre rode `npm run typecheck` (backend e frontend) após atualizar.

---

## 4. Deploy seguro

1. **Variáveis de ambiente** no provedor (não no código):
   - `NODE_ENV=production` (ativa CSP, HSTS e desliga CORS aberto)
   - `JWT_SECRET` (forte e único)
   - `DATA_PATH` apontando para um **volume persistente** (fora do diretório público)
   - `DISCORD_*` se usar login por Discord
2. **HTTPS obrigatório**: sirva atrás de um proxy/CDN com TLS (Let's Encrypt/Cloudflare).
   Em produção o HSTS já força HTTPS por 1 ano.
3. **Firewall / DDoS**: exponha apenas a porta HTTP(S); use o rate limit da aplicação
   em conjunto com proteção de borda (Cloudflare/WAF).
4. **Menor privilégio**: rode o processo Node com um usuário não‑root e sem acesso
   de escrita além de `DATA_PATH` e do log.
5. **`trust proxy`** já está configurado (`app.set('trust proxy', 1)`) para o rate
   limit enxergar o IP real atrás do proxy.
6. Troque a senha do admin padrão (`admin/admin123`) **no primeiro acesso**.

---

## 5. Backup e recuperação

- **Dados**: `backend/data.json`. Faça backup periódico (o painel também tem
  **Configurações → Backup** para admins, que exporta com senhas mascaradas).
- **Restauração**: use um backup **completo** (com hashes) — o restore recusa backups
  sanitizados. Sempre copie `data.json` antes de restaurar.

### Em caso de ataque / comprometimento

1. **Rotacione o `JWT_SECRET`** imediatamente (invalida todos os tokens ativos).
2. **Force novas senhas** dos administradores (Configurações → Contas).
3. **Revise `audit.log`** para identificar contas/IPs envolvidos.
4. **Desative contas suspeitas** (toggle Ativo) — o efeito é imediato (o
   `requireAuth` recusa contas inativas a cada requisição).
5. **Restaure** `data.json` de um backup íntegro anterior ao incidente, se necessário.
6. Rode `npm run audit` para verificar se alguma dependência foi comprometida.

---

## 6. Checklist final de segurança

- [x] `JWT_SECRET` forte, único e validado no boot (fail‑fast)
- [x] `.env` fora do versionamento; `.env.example` só com placeholders
- [x] Senhas com bcrypt (cost 12) e comparação timing‑safe
- [x] Rate limiting (global, API, login, crítico)
- [x] Lockout de força bruta por conta
- [x] JWT com expiração (8h) e revogação por `jti`
- [x] RBAC + permissões granulares por área
- [x] Helmet + CSP + HSTS + Permissions‑Policy (produção)
- [x] Sanitização anti path‑traversal / prototype pollution / HPP
- [x] Validação de schema (Zod) em todas as escritas
- [x] Tratador global de erros (sem vazar stack)
- [x] Auditoria de eventos de segurança
- [x] 0 vulnerabilidades em dependências (`npm audit`)
- [x] `npm run security:check` automatizado
- [ ] HTTPS/TLS configurado no ambiente de produção *(responsabilidade de deploy)*
- [ ] Backup automático agendado de `data.json` *(responsabilidade de operação)*
- [ ] MFA/2FA *(melhoria recomendada — ver abaixo)*

---

## 7. Melhorias recomendadas (roadmap)

1. **MFA/2FA (TOTP)** para contas admin — maior ganho de segurança para acesso privilegiado.
2. **Persistência com banco real** (PostgreSQL) com usuário de menor privilégio e
   criptografia em repouso, substituindo o `data.json` quando a escala exigir.
3. **Refresh tokens** com rotação, permitindo access tokens de curta duração.
4. **Alertas ativos** (webhook/e‑mail) em `LOGIN_LOCKED` e `PRIVILEGE_ESCALATION_ATTEMPT`.
5. **CI de segurança**: rodar `npm run security` em cada push (GitHub Actions).
6. **Criptografia em repouso** de campos sensíveis do `data.json` se hospedado em
   disco compartilhado.
