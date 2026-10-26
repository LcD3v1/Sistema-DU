# Segurança — DU / Detroit Police Department

Este documento descreve a arquitetura de segurança do painel DU, como mantê‑lo
seguro, como atualizar dependências, como fazer deploy com segurança e como
reagir em caso de incidente.

> **Regra de ouro:** o arquivo `backend/.env` contém segredos e **nunca** deve ser
> versionado nem compartilhado. Ele já está no `.gitignore`.

---

## 1. Arquitetura de segurança (defesa em profundidade)

| Camada | Implementação | Arquivo |
|--------|---------------|---------|
| Validação de ambiente (fail‑fast) | Aborta o boot se `JWT_SECRET`/`DATA_ENCRYPTION_KEY` forem fracos/inválidos | `backend/src/config/env.ts` |
| Firewall de aplicação | Pontuação de abuso por IP → ban temporário escalonado; scanners, assinaturas (traversal, XSS, SQLi/NoSQLi, log4shell), métodos, URL/headers gigantes, Content‑Type | `backend/src/security/firewall.ts` |
| HTTPS | Redireciona `X-Forwarded-Proto=http` → https (produção) + HSTS | `backend/src/middleware/securityHeaders.ts` |
| Headers HTTP / CSP / HSTS | Helmet, COOP/CORP, Permissions‑Policy ampla, CSP `default-src 'none'` + `no-store` na API, sem ETag/X‑Powered‑By | `backend/src/middleware/securityHeaders.ts` |
| Rate limiting | Páginas, API, escrita, upload, público, ranking, login/OAuth, restore, backup (hits pontuam no firewall) | `backend/src/middleware/rateLimiter.ts` |
| Sanitização de entrada | Anti null‑byte, path traversal e prototype pollution | `backend/src/middleware/sanitize.ts` |
| Validação de schema | Zod em todas as rotas de escrita | `backend/src/middleware/validate.ts` |
| Autenticação | JWT HS256 (8h) com `iss`/`aud`, `maxAge`, tolerância de 30s, `jti` revogável; escopo servidor+bot só como hash | `backend/src/security/jwt.ts`, `security/escopo.ts`, `middleware/auth.ts` |
| Autenticação | Somente Discord OAuth2 (sem senhas armazenadas), `state` anti-CSRF vinculado a cookie HttpOnly, comparação timing‑safe | `backend/src/routes/auth.ts` |
| Revogação de token | `jti` (SHA‑256) em memória + coleção `tokensRevogados` (TTL) — logout sobrevive a reinício | `backend/src/security/tokenBlacklist.ts` |
| Criptografia em repouso | Helper AES‑256‑GCM (IV aleatório, AAD) — pronto, não aplicado aos dados atuais | `backend/src/security/crypto.ts` |
| Redação de logs | Segredos do env, JWT, Bearer/Bot, tokens de bot, webhooks, URIs Mongo, hex de 64 chars | `backend/src/security/redact.ts` |
| Autorização (RBAC) | Níveis admin/moderador/membro/view_only | `backend/src/middleware/roles.ts` |
| Permissões granulares | Cargos por área (ver/editar) | `backend/src/permAreas.ts`, `routes/config.ts` |
| Auditoria | Log estruturado de eventos de segurança | `backend/src/security/audit.ts` |
| HPP | Proteção contra HTTP Parameter Pollution | `hpp` em `index.ts` |
| Tratador global de erros | Nunca vaza stack trace ao cliente | `backend/src/index.ts` |

### Ordem dos middlewares (`backend/src/index.ts`)

`trust proxy 1` → **firewall** → HTTPS → Helmet/Permissions‑Policy → limite de páginas → parser JSON
(200kb; 5mb só em upload) → HPP → sanitização → `/api`: headers no‑store → limites (API, escrita,
upload, público, ranking, backup) → rotas (`requireAuth` + `requireArea`) → 404 genérico → tratador de erros.

### Firewall (`security/firewall.ts`)

| Gatilho | Pontos | Resposta |
|---|---|---|
| Sondagem de scanner (`/.env`, `/.git`, `/wp-admin`, `*.php`…) | 60 | 404 |
| Assinatura de ataque na URL (decodificada 2×) | 40 | 400 |
| Método HTTP fora de GET/HEAD/POST/PUT/PATCH/DELETE/OPTIONS | 25 | 405 |
| URL > 2048 / headers > 12KB ou > 80 | 20 | 414 / 431 |
| URL malformada | 20 | 400 |
| Corpo JSON inválido/grande demais; Content‑Type ≠ JSON em escrita `/api` | 10 | 400/413/415 |
| Rate limit estourado | 1–20 (conforme o limitador) | 429 |
| Respostas 401 / 403 / 404 / 400 | 3 / 5 / 3 / 1 | — |

Limiar 100 pontos (decaem 10/min) → ban de 15 min, ×4 a cada reincidência em 24h (teto 24h).
Banido recebe 403 genérico. Memória limitada (`FIREWALL_MAX_IPS`, LRU + limpeza a cada 5 min).
IPv6 agrupado por /64. IPs privados/loopback **nunca são banidos** (se o proxy parar de mandar
`X-Forwarded-For`, todos apareceriam com o IP do proxy — banir derrubaria o site), mas continuam
barrados por assinatura. Loopback é totalmente isento fora de produção (testes).
Eventos: `FIREWALL_BAN`, `FIREWALL_BLOCK` (1×/min por IP), `RATE_LIMIT_HIT` (1×/min por IP/limitador).

### Variáveis de ambiente de segurança

| Variável | Padrão | Efeito |
|---|---|---|
| `FIREWALL_ATIVO` | `on` | Liga o firewall |
| `FIREWALL_ISENTAR_LOOPBACK` | `on` fora de prod, `off` em prod | Isenta 127.0.0.1/::1 |
| `FIREWALL_NAO_BANIR_PRIVADOS` | `on` | IPs privados não acumulam pontos |
| `FIREWALL_LIMIAR` / `FIREWALL_BAN_MINUTOS` / `FIREWALL_BAN_MAX_HORAS` / `FIREWALL_MAX_IPS` | 100 / 15 / 24 / 20000 | Ajuste fino |
| `FORCAR_HTTPS` | `on` (prod) | Redireciona http→https quando o proxy informa |
| `JWT_EXIGIR_EMISSOR` | exigido em prod | Fora de prod aceita tokens sem `iss`/`aud` (testes) |
| `REVOGACAO_PERSISTENTE` | `on` | Persiste logout no MongoDB |
| `AUDIT_LOG_MAX_MB` | `20` | Rotação do `audit.log` |
| `DATA_ENCRYPTION_KEY` | vazio | Chave AES‑256‑GCM (32 bytes) |

> Ao publicar esta versão, sessões antigas (sem `iss`/`aud` e com escopo em claro) são recusadas
> em produção: todos precisam entrar de novo uma vez.

### Criptografia de campos em repouso (como aplicar)

`security/crypto.ts` expõe `criptografar(texto, aad)`, `descriptografar(cifrado, aad)`,
`lerCampo(valor, aad)` (aceita legado em texto puro) e `estaCriptografado(valor)`.
Formato `enc:v1:<iv>:<tag>:<dados>`. **Nenhum dado existente foi migrado** (risco de perda).
Para aplicar (ex.: `passaporte`, `discordId`, motivos de advertência/exoneração):

1. Gerar `DATA_ENCRYPTION_KEY` e guardá‑la **fora** do banco, com backup (perdeu a chave = perdeu os dados).
2. Fazer backup completo do MongoDB.
3. Na camada de dados (`data.ts`), cifrar ao gravar e usar `lerCampo` ao carregar, com AAD
   `"<coleção>:<id>:<campo>"` (impede copiar o cifrado de um registro para outro).
4. Migração gradual: registros legados continuam legíveis; são cifrados na próxima gravação.
5. Campos usados em busca/ordenação/ID (ex.: `discordId` para login) precisam de um índice
   cego (HMAC) à parte — não cifrar sem isso.
6. Rotação: adicionar versão `enc:v2` com a nova chave, ler as duas, regravar tudo, remover a antiga.

### Mapeamento OWASP Top 10 (2021)

- **A01 Broken Access Control** → `requireAuth` + `roles.ts` + cargos por área; rotas de escrita bloqueiam `view_only`.
- **A02 Cryptographic Failures** → bcrypt cost 12; JWT com segredo forte validado no boot; HSTS/HTTPS em produção.
- **A03 Injection** → sem SQL (persistência JSON); Zod valida tipos; `sanitize.ts` remove null‑bytes/path traversal; `hpp` evita poluição de parâmetros. **Não** há `eval`/`child_process`/exec no código.
- **A04 Insecure Design** → princípio do menor privilégio, contas novas sem cargo até aprovação, fail‑fast de config.
- **A05 Security Misconfiguration** → Helmet, CSP restritiva, `X‑Powered‑By` desligado, erros genéricos.
- **A06 Vulnerable Components** → `npm run audit` / `audit:fix`; hoje **0 vulnerabilidades**.
- **A07 Auth Failures** → login exclusivo via Discord OAuth2 (sem senhas), rate limit no fluxo OAuth, expiração de token.
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
6. Defina `DISCORD_OWNER_ID` e faça o primeiro login para assumir a conta dona.

---

## 5. Backup e recuperação

- **Dados**: MongoDB (`MONGODB_URI`). Faça backup periódico (o painel também tem
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
- [x] Rate limiting (páginas, API, escrita, upload, público, ranking, login, restore, backup)
- [x] Firewall de aplicação com ban escalonado e memória limitada
- [x] JWT com `iss`/`aud`/`maxAge` e revogação persistente
- [x] HTTPS forçado (proxy) + HSTS; API com `no-store` e CSP `default-src 'none'`
- [x] Helper AES‑256‑GCM para campos sensíveis (aplicação pendente — ver seção 1)
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
