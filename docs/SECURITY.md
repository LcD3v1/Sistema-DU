# Segurança — DU / Detroit Police Department

Arquitetura de segurança do painel DU, como mantê‑lo seguro, como atualizar,
como fazer deploy e como reagir a um incidente. Última auditoria: **2026‑10‑27**.

> **Regra de ouro:** `backend/.env` contém segredos e **nunca** é versionado nem
> compartilhado (está no `.gitignore`). O mesmo vale para a pasta de dados
> (`data.json`, `arquivos/`, `backups/`…).

---

## 1. Arquitetura de segurança (defesa em profundidade)

| Camada | Implementação | Arquivo |
|--------|---------------|---------|
| Validação de ambiente (fail‑fast) | Aborta o boot com `JWT_SECRET` fraco ou `DATA_ENCRYPTION_KEY` inválida/ausente em produção | `backend/src/config/env.ts` |
| Firewall de aplicação | Pontuação de abuso por IP → ban escalonado; scanners, assinaturas (traversal, XSS, SQLi/NoSQLi, log4shell), métodos, URL/headers gigantes, Content‑Type | `security/firewall.ts` |
| HTTPS + headers | Redireciona http→https (produção) + HSTS; Helmet, CSP, COOP/CORP, Permissions‑Policy; API com `no-store` e CSP `default-src 'none'`; sem ETag/X‑Powered‑By | `middleware/securityHeaders.ts` |
| Rate limiting | Páginas, API, escrita, upload, público, ranking, login, pedido de acesso, críticos (senha/restore), backup — estouros pontuam no firewall | `middleware/rateLimiter.ts` |
| Sanitização + schema | Anti null‑byte/path traversal/prototype pollution; Zod `.strict()` em toda rota que lê corpo | `middleware/sanitize.ts`, `middleware/validate.ts` |
| Login | Usuário + senha (bcrypt custo 12); usuário inexistente custa o mesmo tempo (hash falso); resposta única "usuário ou senha incorretos"; estado da conta só revelado após a senha certa | `routes/auth.ts` |
| Força bruta | 5 erros seguidos bloqueiam o **usuário** por 15 min (memória com teto) + limite por **IP** | `security/bruteForce.ts` |
| Sessões | JWT HS256 8 h (`iss`/`aud`/`jti`), só em memória no navegador; cookie `fast_sessao` httpOnly + SameSite=Strict + path restrito para recarregar; **versão de sessão por conta**: trocar/redefinir senha ou "sair de todos" derruba todos os aparelhos | `security/jwt.ts`, `middleware/auth.ts` |
| Revogação | Logout revoga o `jti` (só o SHA‑256) e persiste em `sessoes-revogadas.json` | `security/tokenBlacklist.ts` |
| Autorização | Cargos de permissão por área (ver/editar), admin e dev; conta dona = conta 1 | `access.ts`, `permAreas.ts`, `middleware/roles.ts` |
| Dados em repouso | Arquivo JSON com gravação atômica (tmp + rename, modo 0600); arquivo corrompido derruba o boot (nunca é zerado) | `armazenamento.ts`, `data.ts` |
| Backups | Automáticos, **criptografados** (AES‑256‑GCM), ao iniciar e a cada 24 h, 14 mais recentes | `backupAutomatico.ts` |
| Uploads | Bytes conferidos (assinatura do arquivo), sem SVG/HTML, ID aleatório de 144 bits, download com `nosniff` + CSP `sandbox`, permissão por área | `routes/arquivos.ts`, `routes/anuncioImagem.ts` |
| Auditoria | `audit.log` estruturado e redigido (login, falhas, bloqueios, alterações, admin) | `security/audit.ts`, `security/redact.ts` |
| Alertas | Notificação aos admins (+ webhook opcional) em: conta bloqueada, ban do firewall, restauração de backup, senha redefinida por admin | `security/alertas.ts` |
| Erros | Tratador global genérico (sem stack, caminho ou `err.message`) | `index.ts` |

### Ordem dos middlewares (`backend/src/index.ts`)

`trust proxy 1` → **firewall** → HTTPS → Helmet/Permissions‑Policy → limite de páginas → parser JSON
(200kb; 5mb só em upload) → HPP → sanitização → `/api`: headers no‑store → limites → rotas
(`requireAuth` + `requireArea`) → 404 genérico → tratador de erros. **Não reordene.**

### Firewall

| Gatilho | Pontos | Resposta |
|---|---|---|
| Sondagem de scanner (`/.env`, `/.git`, `/wp-admin`, `*.php`…) | 60 | 404 |
| Assinatura de ataque na URL (decodificada 2×) | 40 | 400 |
| Método fora de GET/HEAD/POST/PUT/PATCH/DELETE/OPTIONS | 25 | 405 |
| URL > 2048 / headers > 12KB ou > 80 | 20 | 414 / 431 |
| Corpo inválido/grande; Content‑Type ≠ JSON em escrita `/api` | 10 | 400/413/415 |
| Rate limit estourado | 1–20 | 429 |
| Respostas 401 / 403 / 404 / 400 | 3 / 5 / 3 / 1 | — |

Limiar 100 pontos (decaem 10/min) → ban de 15 min, ×4 a cada reincidência em 24 h (teto 24 h).
IPv6 agrupado por /64. IPs privados/loopback nunca são banidos (proxy sem `X-Forwarded-For`).

### Variáveis de ambiente de segurança

| Variável | Padrão | Efeito |
|---|---|---|
| `JWT_SECRET` | — (obrigatória) | Assina as sessões. ≥ 48 bytes aleatórios |
| `DATA_ENCRYPTION_KEY` | — (obrigatória em produção) | AES‑256‑GCM dos backups. **Perdeu a chave = perdeu os backups** |
| `DATA_PATH` | `backend/data.json` | Arquivo de dados; em produção, disco **persistente** |
| `ADMIN_INITIAL_PASSWORD` | `admin123` | Senha inicial da conta `admin` (≥ 12), usada só no primeiro boot |
| `ALERTA_WEBHOOK_URL` | vazio | Webhook https (ex.: canal privado da staff) para alertas |
| `FIREWALL_*`, `FORCAR_HTTPS` | ligados | Ver tabela do firewall; não desligue em produção |
| `REVOGACAO_PERSISTENTE` | `on` | Logout sobrevive a reinício |
| `AUDIT_LOG_MAX_MB` | `20` | Rotação do `audit.log` |

Gerar segredos:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # DATA_ENCRYPTION_KEY
```

### Mapeamento OWASP Top 10 (2021)

- **A01 Broken Access Control** → `requireAuth` + `requireArea` em toda rota; IDs com `parseInt`; DTOs por lista branca (nunca hash ou `sessaoVersao`).
- **A02 Cryptographic Failures** → bcrypt 12; AES‑256‑GCM com AAD; HSTS; segredos validados no boot.
- **A03 Injection** → sem banco SQL/NoSQL (arquivo JSON); Zod estrito; sem `eval`/`exec`/`child_process`; React escapa o HTML (sem `dangerouslySetInnerHTML`).
- **A04 Insecure Design** → acesso só após aprovação do comando; menor privilégio (conta nova sem cargo); fail‑fast.
- **A05 Misconfiguration** → Helmet/CSP, sem sourcemap em produção, erros genéricos.
- **A06 Vulnerable Components** → `npm audit` no CI (falha em alta/crítica) + Dependabot semanal; **0 vulnerabilidades** em 2026‑10‑27.
- **A07 Auth Failures** → bcrypt, bloqueio por usuário e IP, sessões revogáveis em todos os aparelhos.
- **A08 Integrity Failures** → CSP `object-src 'none'`, `base-uri 'self'`; lockfiles + `npm ci` no CI.
- **A09 Logging & Monitoring** → `audit.log` + alertas ativos.
- **A10 SSRF** → o backend não busca URLs de usuário; o único envio externo é o webhook de alerta, fixo no `.env` e só https.

---

## 2. Como manter seguro (rotina)

1. **A cada mudança** (o CI faz isso sozinho em todo push/PR — `.github/workflows/seguranca.yml`):
   ```bash
   cd backend && npx tsc --noEmit && npm run test:ranking && npm run test:du && npm run security
   ```
2. **Toda semana**: aprove os PRs do Dependabot depois que o workflow "Segurança" passar.
3. **Contas**: poucos administradores, com senhas fortes; troque a senha padrão `admin123` no
   primeiro acesso (o painel avisa enquanto não trocar). Revise **Configurações → Contas/Permissões**.
4. **Auditoria**: revise `audit.log` (`LOGIN_FAILED`, `LOGIN_LOCKED`, `FIREWALL_BAN`,
   `PRIVILEGE_ESCALATION_ATTEMPT`, `RESTORE_EXECUTED`) e os alertas no sino.
5. **Nova proteção** → acrescente a checagem em `backend/scripts/security-check.mjs`.

## 3. Como atualizar dependências

```bash
cd backend && npm audit && npm audit fix      # correções compatíveis
cd ../frontend && npm audit && npm audit fix
# major (pode quebrar): atualize um pacote por vez e rode tipos + testes
```

## 4. Deploy seguro

1. Variáveis no painel da hospedagem (nunca no código): `NODE_ENV=production`, `JWT_SECRET`,
   `DATA_ENCRYPTION_KEY`, `DATA_PATH` (disco persistente), `ADMIN_INITIAL_PASSWORD` (recomendado),
   `PUBLIC_URL`/`FRONTEND_URL`, opcional `ALERTA_WEBHOOK_URL`.
2. **HTTPS obrigatório**: atrás de proxy/CDN com TLS 1.2+ (Cloudflare/Let's Encrypt). O app força
   https e manda HSTS de 1 ano.
3. **DDoS/WAF**: proteção de borda (Cloudflare) + firewall e rate limit da aplicação.
4. **Menor privilégio**: processo Node sem root, escrevendo só na pasta do `DATA_PATH` e no log.
5. Guarde a `DATA_ENCRYPTION_KEY` também num cofre de senhas — sem ela os backups não abrem.
6. Primeiro acesso: entre como `admin`, **troque a senha**.

## 5. Backup e recuperação

- **Automático**: `<pasta do DATA_PATH>/backups/du-AAAAMMDD-HHMMSS.json.enc` (criptografado, 14 dias).
- **Manual**: Configurações → Backup (download do JSON, só admin — guarde em local seguro).
- **Copie também** `arquivos/` e `anuncio-imagens/` no backup da hospedagem (uploads não entram no `.enc`).
- **Restaurar um backup automático**:
  ```bash
  cd backend && npm run build
  node scripts/restaurar-backup.cjs ../dados/backups/du-20261027-030000.json.enc restaurado.json
  # pare o servidor, guarde o data.json atual, coloque restaurado.json no lugar e suba de novo
  ```

### Em caso de ataque / comprometimento

1. **Contenha**: desative as contas suspeitas (efeito imediato) e, se preciso, tire o site do ar.
2. **Rotacione o `JWT_SECRET`** → derruba todas as sessões de todo mundo.
3. **Senhas**: redefina a dos admins (Configurações → Contas → chave) — derruba as sessões deles;
   peça a todos para trocar a senha.
4. **Investigue**: `audit.log` (IPs, contas, horários) e os alertas recebidos.
5. **Restaure** de um backup anterior ao incidente, se os dados foram alterados.
6. **Dependências**: `npm audit` nos dois projetos; verifique o histórico do git (gitleaks no CI).
7. **Chave vazada?** Gere nova `DATA_ENCRYPTION_KEY` e descarte
   os backups antigos depois de criar um novo.

---

## 6. Checklist final de segurança

- [x] Segredos validados no boot; `.env` fora do git; `.env.example` só com placeholders
- [x] Histórico do git sem segredos (auditado; gitleaks no CI)
- [x] Senhas bcrypt 12, resposta única, tempo igual para usuário inexistente
- [x] Bloqueio por usuário (5 erros) + rate limit por IP + firewall com ban escalonado
- [x] Sessões: 8 h, `jti` revogável, versão por conta ("sair de todos", troca de senha)
- [x] Zod estrito em toda rota que lê corpo; DTOs por lista branca
- [x] Uploads conferidos pelos bytes, sem SVG/HTML, servidos com `sandbox`
- [x] HTTPS/HSTS, CSP, headers de segurança, sem sourcemaps
- [x] Gravação atômica dos dados; backups automáticos criptografados com rotação
- [x] Auditoria + alertas ativos aos admins (e webhook opcional)
- [x] 0 vulnerabilidades em dependências; CI + Dependabot
- [ ] TLS e disco persistente configurados na hospedagem *(deploy)*
- [ ] Senha padrão `admin123` trocada em todo admin *(operação)*
- [ ] `DATA_ENCRYPTION_KEY` guardada num cofre fora do servidor *(operação)*

## 7. Melhorias recomendadas (roadmap)

1. **Criptografia de campos** pessoais no `data.json` (passaporte, motivos) com o helper já existente.
2. **Refresh tokens** com rotação para encurtar o access token (hoje 8 h).
3. **Backup externo** (cópia automática dos `.enc` para outro provedor/região).
4. **Monitoramento de disponibilidade** (uptime) e retenção do `audit.log` fora do servidor.
