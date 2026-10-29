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
| Validação de ambiente (parada imediata) | Aborta o boot com `JWT_SECRET` fraco, `DATA_ENCRYPTION_KEY` inválida/ausente ou login do Discord incompleto/sem HTTPS em produção | `backend/src/config/env.ts` |
| Firewall de aplicação | Pontuação de abuso por IP → ban escalonado; scanners, assinaturas (traversal, XSS, SQLi/NoSQLi, log4shell), métodos, URL/headers gigantes, Content‑Type | `security/firewall.ts` |
| HTTPS + headers | Redireciona http→https (produção) + HSTS; Helmet, CSP, COOP/CORP, Permissions‑Policy; API com `no-store` e CSP `default-src 'none'`; sem ETag/X‑Powered‑By | `middleware/securityHeaders.ts` |
| Rate limiting | Páginas, API, escrita, upload, público, ranking, login pelo Discord, críticos (restore), backup — estouros pontuam no firewall | `middleware/rateLimiter.ts` |
| Sanitização + schema | Anti null‑byte/path traversal/prototype pollution; Zod `.strict()` em toda rota que lê corpo | `middleware/sanitize.ts`, `middleware/validate.ts` |
| Login | **Só Discord** (OAuth2 `identify`, sem senha). `state` aleatório em cookie httpOnly/Lax de uso único, comparado em tempo constante; token do usuário revogado na hora e nunca guardado; redirecionamentos só para destinos fixos | `routes/auth.ts`, `discord.ts` |
| Pertencer à unidade | Só entra quem está no servidor do Discord (o bot só lê o servidor e edita a mensagem do painel de hierarquia), e no máximo **2 donos** (`DISCORD_DONO_ID`: o 1º é a conta dona, o 2º tem conta própria com cargo dev). Primeiro acesso = pedido aprovado por admin. Quem sai do servidor é **exonerado automaticamente** (dados arquivados), na verificação periódica ou no login. Falha da API do Discord nunca exonera nem libera | `discord.ts`, `efetivo.ts` |
| Painel de hierarquia | Mensagem do bot num canal, editada a cada 1 min só quando muda (cache de cargos/canais/membros). Menções sem notificar (`allowed_mentions` vazio). Edição no site exige a área `hierarquia` (editar), Zod, limitador e **versão** (quem salva sobre a edição de outra pessoa recebe 409, nada é sobrescrito). Prévia no site sem IDs do Discord | `hierarquia.ts`, `routes/hierarquia.ts` |
| Servidor do Discord | Página com tudo do servidor (informações, canais, cargos, emojis) via área `servidor`; lista de membros (com ID do Discord) só com **editar**. Ícone/banner passam pelo backend (sem o ID do servidor no navegador). Cache único de 1 min para servidor e membros (hierarquia, página e perfil compartilham) | `discord.ts`, `routes/servidor.ts` |
| Setagem | Painel e mensagens em Componentes V2. Botão/modal via Gateway (sem intents, só o servidor da unidade). Pedido pendente pode ser **editado** (modal preenchido); quem já tem cadastro não pede de novo; exonerado não pede. Codinome/passaporte validados, 1 envio/30 s, passaporte único. Cada pedido abre um **canal temporário privado** (só bot + cargos aprovadores) com Aprovar/Reprovar/Refazer; quem clica é conferido pelos cargos enviados pelo Discord (aprovadores, administrador ou dono) e nunca avalia o próprio pedido. "Refazer" pede motivo + confirmação de quem digitou, e avisa no privado. Cargo do Discord e acesso ao site **só na aprovação**; cargo do site limitado a quem configura/aprova; cargos com moderação recusados. O bot só apaga o próprio painel e o canal temporário guardado no pedido | `setagem.ts`, `routes/setagem.ts`, `discord.ts` |
| Carteirinha no fórum | Só posta quando alguém com `carteira` (editar) clica em Postar; PNG conferido pelos bytes (até 4 MB); 1º post cria o tópico do membro e os seguintes entram no mesmo tópico; o ID do tópico fica no membro e não sai da API; texto sem menções | `routes/carteira.ts`, `discord.ts` |
| Árvore de investigação | Área `arvore` (ver = abrir quadros; editar = criar/mexer em cards, linhas e chat). **Privada**: cada árvore é de quem criou + as pessoas escolhidas; quem não participa recebe 404 (nem a lista mostra). Admins veem todas. Só quem criou ou admin escolhe as pessoas; árvore antiga (sem participantes) segue aberta até ser fechada. Linhas podem sair do meio de outra linha (ponto 0–1); apagar uma linha leva as que saíam dela. Fotos: arquivo enviado na área `arvore` (bytes conferidos, qualquer imagem/PDF convertido no navegador) ou link http/https; o backend não busca links. Texto sem `<`, `>` e crase; telefone só com números e sinais. Edição parcial nunca apaga campos que não vieram. Remover card/árvore apaga as fotos dela. Título do inquérito ligado só para quem vê inquéritos. Chat sem IDs de conta na saída. Chat aceita vídeo MP4/MOV de até 1 minuto e 50 MB (a duração é lida dos bytes no servidor, caixa moov/mvhd) e link de vídeo (vai como link; quem recebe abre em outra aba; o servidor não abre). Foto de card só aceita imagem. Chat aceita foto por upload ou por link: o link é copiado pelo NAVEGADOR (img com CORS → canvas → upload conferido), nunca pelo backend; se o site não permitir, fica como link. Nada do chat é apagado enquanto a árvore existir; apagar a árvore apaga cards, fotos e anexos. Tetos: 200 árvores, 300 cards, 600 linhas, 5.000 mensagens | `routes/arvores.ts`, `routes/arquivos.ts`, `middleware/validate.ts` |
| Rodapé dos painéis | Fotinha pequena + nome, embaixo à esquerda (`-# <emoji> **Nome**`). A fotinha é um emoji da APLICAÇÃO do bot (`/applications/<bot>/emojis`), nome sempre `du_<hash>`, criado a partir de data URL conferida pela assinatura (≤256 KB) ou da foto do bot no CDN do Discord; link de usuário é copiado pelo navegador, nunca pelo backend. O bot nunca cria/apaga emoji do servidor; guarda no máximo 8 emojis do rodapé | `rodapeDiscord.ts`, `discord.ts`, `hierarquia.ts`, `setagem.ts` |
| Logs | Página só para a área `logs` (ver). Junta os eventos do site (`audit()`, sem os técnicos/repetitivos) e o registro de auditoria do servidor do Discord (só leitura, a cada 1 min; exige "Ver registro de auditoria") + quem entrou/saiu. Arquivo `logs.json` cifrado com a chave dos dados, teto de 5.000 entradas. A API devolve nomes e textos, nunca IDs do Discord/conta nem IP; o avatar vem por chave opaca (HMAC com segredo do processo) e passa pelo backend (data URL conferida ou CDN de avatar do Discord) | `logs.ts`, `routes/logs.ts`, `discord.ts` |
| Setores, promoção e advertências | Setores/subunidades (ex.: COD, DNARC e o combinado COD/DNARC) com 1–2 cargos do Discord, escolhidos no modal depois da patente; cargos da patente **e** do setor só na aprovação. Depois de aprovado, troca de patente/setor/codinome/passaporte é pedida no perfil e só vale após aprovação em Membros: aí o bot **tira** os cargos antigos, **dá** os novos e troca o apelido. Valores pedidos têm de existir na setagem. ADV 1–3 da dashboard dão/tiram cargos no Discord; o bot só **cria** os cargos de advertência que faltarem, sempre **sem permissão nenhuma** (`permissions: "0"`). Cargos com moderação/administração nunca são dados nem tirados (conferido ao salvar e ao aplicar) | `setagem.ts`, `routes/setagem.ts`, `routes/membros.ts`, `discord.ts` |
| Fórum de registro | Fórum escolhido na setagem (conferido como fórum do servidor). Ao aprovar o set, o bot abre o tópico da pessoa ("Codinome \| ID") com os dados aprovados; cadastro, pedidos de alteração, aprovações/recusas, promoções, advertências, exoneração, readmissão e edições da ficha entram no mesmo tópico como painel V2 com o rodapé padrão. Menções sem notificar, textos do usuário sem formatação. Fila única (nunca dois tópicos para a mesma pessoa). O ID do tópico fica na conta e nunca sai da API | `setagem.ts` (`registrarNoForum`), `discord.ts` (`postarV2NoForum`) |
| Exoneração no Discord | Exonerar (ou remover do efetivo quem tem conta) manda no privado um painel V2 com a logo do sistema e o motivo, **tira** os cargos da pessoa e a **expulsa** do servidor (kick, nunca ban), nessa ordem, em segundo plano. Cargos com moderação/administração/integração nunca são tirados pelo bot: se a expulsão falhar, quem cuida de Membros é avisado para tirá-los à mão. Donos (`DISCORD_DONO_ID`) nunca são expulsos. Falha do Discord não desfaz nem libera nada no site; resultado vai para a auditoria | `setagem.ts` (`exonerarNoDiscord`), `discord.ts` (`expulsarMembro`), `routes/membros.ts` |
| Aprovação = membro | Aprovar em Solicitações (ou no Discord) cria a conta E a ficha de membro na hora; codinome, passaporte e patente aprovados não mudam no cadastro inicial | `setagem.ts`, `routes/auth.ts` |
| Sessões | JWT HS256 8 h (`iss`/`aud`/`jti`), só em memória no navegador; cookie `du_sessao` httpOnly + SameSite=Strict + path restrito para recarregar; **versão de sessão por conta**: "sair de todos" derruba todos os aparelhos | `security/jwt.ts`, `middleware/auth.ts` |
| Revogação | Logout revoga o `jti` (só o SHA‑256) e persiste em `sessoes-revogadas.json` | `security/tokenBlacklist.ts` |
| Autorização | Cargos de permissão por área (ver/editar), admin e dev; conta dona = conta 1 | `access.ts`, `permAreas.ts`, `middleware/roles.ts` |
| Dados em repouso | Arquivo JSON com gravação atômica (tmp + rename, modo 0600); arquivo corrompido derruba o boot (nunca é zerado) | `armazenamento.ts`, `data.ts` |
| Backups | Automáticos, **criptografados** (AES‑256‑GCM), ao iniciar e a cada 24 h, 14 mais recentes | `backupAutomatico.ts` |
| Uploads | Bytes conferidos (assinatura do arquivo), sem SVG/HTML, ID aleatório de 144 bits, download com `nosniff` + CSP `sandbox`, permissão por área | `routes/arquivos.ts`, `routes/anuncioImagem.ts` |
| Auditoria | `audit.log` estruturado e redigido (login, falhas, bloqueios, alterações, admin) | `security/audit.ts`, `security/redact.ts` |
| Alertas | Notificação aos admins (+ webhook opcional) em: ban do firewall, restauração de backup; notificação aos admins quando alguém sai do servidor | `security/alertas.ts` |
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
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | — (obrigatórias em produção) | App do Discord para o login (OAuth2) |
| `DISCORD_BOT_TOKEN` | — (obrigatória em produção) | Bot no servidor, sem permissões: confere quem continua no servidor |
| `DISCORD_GUILD_ID` | — (obrigatória em produção) | Servidor da unidade |
| `DISCORD_REDIRECT_URI` | `PUBLIC_URL` + `/api/auth/discord/callback` | Precisa ser https em produção e estar cadastrada no app do Discord |
| `DISCORD_DONO_ID` | — (obrigatória em produção) | Até **2** IDs (vírgula): as únicas pessoas que entram sem estar no servidor. 1º = conta dona; 2º = conta própria com cargo dev. Mais de 2 = o servidor não sobe |
| `DISCORD_VERIFICAR_MINUTOS` | `3` | Intervalo da verificação de quem saiu do servidor (1–60) |
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
- **A04 Insecure Design** → acesso só após aprovação do comando; menor privilégio (conta nova sem cargo); parada imediata no boot.
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
3. **Contas**: poucos administradores, com verificação em duas etapas no Discord. Revise
   **Configurações → Contas/Permissões** e quem está em `DISCORD_DONO_ID` (máx. 2).
4. **Auditoria**: revise `audit.log` (`DISCORD_LOGIN_DENIED`, `DISCORD_MEMBER_LEFT`, `FIREWALL_BAN`,
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
   `DATA_ENCRYPTION_KEY`, `DATA_PATH` (disco persistente), variáveis `DISCORD_*` (login),
   `PUBLIC_URL`/`FRONTEND_URL`, opcional `ALERTA_WEBHOOK_URL`.
2. **HTTPS obrigatório**: atrás de proxy/CDN com TLS 1.2+ (Cloudflare/Let's Encrypt). O app força
   https e manda HSTS de 1 ano.
3. **DDoS/WAF**: proteção de borda (Cloudflare) + firewall e rate limit da aplicação.
4. **Menor privilégio**: processo Node sem root, escrevendo só na pasta do `DATA_PATH` e no log.
5. Guarde a `DATA_ENCRYPTION_KEY` também num cofre de senhas — sem ela os backups não abrem.
6. Primeiro acesso: entre com o Discord de `DISCORD_DONO_ID` (conta dona) e aprove os pedidos de acesso.

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
3. **Discord**: gere novo `DISCORD_CLIENT_SECRET` e novo `DISCORD_BOT_TOKEN` no portal do Discord se houver
   suspeita de vazamento; peça aos admins para revisarem a segurança da conta do Discord.
4. **Investigue**: `audit.log` (IPs, contas, horários) e os alertas recebidos.
5. **Restaure** de um backup anterior ao incidente, se os dados foram alterados.
6. **Dependências**: `npm audit` nos dois projetos; verifique o histórico do git (gitleaks no CI).
7. **Chave vazada?** Gere nova `DATA_ENCRYPTION_KEY` e descarte
   os backups antigos depois de criar um novo.

---

## 6. Checklist final de segurança

- [x] Segredos validados no boot; `.env` fora do git; `.env.example` só com placeholders
- [x] Histórico do git sem segredos (auditado; gitleaks no CI)
- [x] Login só pelo Discord: `state` anti‑CSRF, sem senha guardada, token do usuário revogado
- [x] Saída do servidor do Discord = exoneração automática (dados arquivados); falha da API não exonera
- [x] Rate limit por IP no login + firewall com ban escalonado
- [x] Sessões: 8 h, `jti` revogável, versão por conta ("sair de todos")
- [x] Zod estrito em toda rota que lê corpo; DTOs por lista branca
- [x] Uploads conferidos pelos bytes, sem SVG/HTML, servidos com `sandbox`
- [x] HTTPS/HSTS, CSP, headers de segurança, sem sourcemaps
- [x] Gravação atômica dos dados; backups automáticos criptografados com rotação
- [x] Auditoria + alertas ativos aos admins (e webhook opcional)
- [x] 0 vulnerabilidades em dependências; CI + Dependabot
- [ ] TLS e disco persistente configurados na hospedagem *(deploy)*
- [ ] App e bot do Discord configurados; `DISCORD_DONO_ID` definido *(operação)*
- [ ] `DATA_ENCRYPTION_KEY` guardada num cofre fora do servidor *(operação)*

## 7. Melhorias recomendadas (roadmap)

1. **Criptografia de campos** pessoais no `data.json` (passaporte, motivos) com o helper já existente.
2. **Refresh tokens** com rotação para encurtar o access token (hoje 8 h).
3. **Backup externo** (cópia automática dos `.enc` para outro provedor/região).
4. **Monitoramento de disponibilidade** (uptime) e retenção do `audit.log` fora do servidor.
