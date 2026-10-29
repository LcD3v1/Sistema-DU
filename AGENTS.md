# Regras obrigatórias para IAs — Sistema DU

**Segurança é a base deste projeto.** Leia antes de tocar em qualquer arquivo. Se uma
mudança conflitar com estas regras, a regra vence — pare e avise o usuário.
Detalhes: `docs/SECURITY.md`.

## Segredos e ambiente
- Nunca imprima, copie, registre em log ou coloque em arquivo versionado valores de `backend/.env` nem do `.env` da raiz (variáveis do Discord, lido também pelo backend).
- `.env.example` só com placeholders (vazios ou de exemplo óbvio).
- Nada sensível no frontend: `VITE_*` vai para o bundle público — nunca segredo, token, chave, URI de banco.
- Sem sourcemaps em produção (`frontend/vite.config.ts` → `sourcemap: false`).
- Não desligue validações de `backend/src/config/env.ts` (parada imediata de `JWT_SECRET`, `DATA_ENCRYPTION_KEY`).

## Rotas do backend (toda rota nova)
- `requireAuth` + `requireArea(area, 'ver')` para leitura e `requireArea(area, 'editar')` para escrita
  (ou `adminOnly`). Exceções públicas só em `routes/public.ts` e no login pelo Discord (`GET /api/auth/discord` e `/api/auth/discord/callback`, com limitador próprio e `state` anti‑CSRF).
- Login é **só pelo Discord** (OAuth2 `identify`). Não reintroduza login por senha. Token do bot, segredo do app e chamadas à API do
  Discord ficam só em `backend/src/discord.ts`; o bot só lê o servidor (membros, cargos, canais, emojis, registro de auditoria para a página Logs; ícone/banner passam pelo backend porque a URL leva o ID do servidor) e publica/edita as mensagens dos painéis (hierarquia e setagem, menções sem notificar).
  Escrita além disso, só na setagem (`backend/src/setagem.ts`): trocar apelido, DAR o cargo da patente e do setor na aprovação, criar/apagar
  o canal temporário do pedido (ID guardado no pedido) e avisar no privado; e postar a carteirinha no fórum (`routes/carteira.ts`,
  só quando alguém com "editar carteira" clica em Postar; no tópico do membro ou num tópico escolhido, conferido como sendo do fórum configurado). Depois de aprovado (perfil/promoção em Membros): TIRAR os cargos de patente/setor
  antigos, DAR os novos e trocar o apelido (`aplicarPerfilNoDiscord`); advertências da dashboard dão/tiram os cargos ADV 1–3
  (`sincronizarAdvertencias`), e só esses cargos podem ser CRIADOS pelo bot, sempre com `permissions: "0"` (`criarCargo`).
  Patente/setor pedidos têm de existir na setagem (`valorDePerfilInvalido`). Nunca banir, expulsar, apagar outro canal nem dar/tirar cargo com moderação/administração. Esse cargo pode ser configurado numa patente/setor, mas o bot só avisa quem aprovou para dá-lo à mão.
- **Nome das pessoas (regra):** em TODO lugar (site, Discord, logs, chat, árvore, notificações) a pessoa aparece pelo **codinome**. Use `nomeDaConta`/`nomeDoMembro`/`nomeDeExibicao` (`registros.ts`); nunca monte o nome com `nomeServidor`/`policial` direto.
- **Rodapé de TODO painel do Discord (regra):** igual ao rodapé de um embed — fotinha pequena + nome do servidor (o que a pessoa configurou), em letra pequena, embaixo à esquerda: `-# <emoji> **Nome**` (`rodapeV2` em `hierarquia.ts`). Nunca miniatura grande à direita. A fotinha (upload ou link copiado pelo navegador; vazio = foto do bot) vira **emoji do próprio bot** (`rodapeDiscord.ts`, nomes `du_<hash>`): o bot só cria/apaga esses emojis da aplicação, nunca emojis do servidor.
  Quem avalia no Discord é conferido pelos cargos que o Discord envia (aprovadores configurados, administrador ou dono), nunca o próprio pedido. Cliques chegam pelo Gateway sem intents, só do servidor da unidade. Falha da API do Discord nunca exonera nem libera acesso.
- Corpo validado com Zod (`validateBody`, schemas em `middleware/validate.ts`); IDs de rota com `parseInt` + checagem.
- Rate limit: já há limitadores globais em `index.ts` (API, escrita, upload, público, ranking, backup);
  endpoints caros/críticos ganham limitador próprio em `middleware/rateLimiter.ts`.
- Não remova nem reordene o firewall (`security/firewall.ts`): `trust proxy` → firewall → headers → parsers → rotas.
- Respostas de erro genéricas: nunca `err.message`, stack, nomes de coleção, caminhos ou IDs internos.
- Filtre a saída campo a campo: não devolva objetos crus do banco. Nunca exponha `guildId`, `botId`,
  `discordThreadId`, tokens, `discordId` de terceiros sem permissão de edição.
- Endpoints públicos expõem **somente** campos públicos (DTO explícito, lista branca).
- JWT só via `security/jwt.ts` (`assinarToken`/`verificarToken`); nada de `jwt.sign/verify` direto.
- Compare segredos/tokens com `iguaisSeguro` (`security/crypto.ts`), nunca `===`.
- Sessão no navegador: token só em memória (zustand). Ao recarregar, o app chama `POST /api/auth/sessao`
  (cookie `du_sessao` httpOnly + SameSite=Strict + path restrito, header `X-DU-Sessao: 1`). Nunca salve token em
  localStorage/sessionStorage; o logout apaga o cookie e revoga o `jti`.
- Rate limit: use `limitador()` de `middleware/rateLimiter.ts` (armazenamento com teto de chaves). Polling leve
  (`/api/public/revisao`) tem limite próprio — não pontue uso legítimo (várias abas, CGNAT) no firewall.

## Logs e auditoria
- Use `audit()` (`security/audit.ts`) para eventos de segurança; o console já passa por `redact()`.
- Página **Logs** (área `logs`, só leitura): eventos do `audit()` + registro de auditoria do servidor do Discord (GET `/audit-logs`, a cada 1 min) + entradas/saídas. Arquivo `logs.json` cifrado (teto 5.000). Saída sem IDs do Discord/conta nem IP; avatar por chave opaca (`routes/logs.ts`).
- Nunca logue corpo de requisição, token, cookie, header `Authorization` ou URI de banco.

## Imagens
- Aceitas: qualquer link `http/https` ou upload `data:image/(png|jpeg|webp|gif);base64`, validado por
  `backend/src/security/imagem.ts` (`imagemValida`). A CSP `img-src` permite `https: http: data: blob:` — mantenha.
- Nenhum outro protocolo (`javascript:`, `file:`, `data:text/html`…). O backend não busca URLs de usuários (sem SSRF).

## Contas exoneradas
- Exonerado = bloqueio total (login e toda rota via `requireAuth`), mas os dados são **arquivados**
  (`membroArquivado`), nunca apagados. Não crie caminhos que contornem esse bloqueio.

## Dados
- Não altere a semântica de `backend/src/data.ts` nem migre dados sem backup e pedido explícito.
- Criptografia de campos: use `security/crypto.ts` (AES‑256‑GCM) seguindo o plano em `docs/SECURITY.md`.
- Nunca conecte à produção (`duunit.discloud.dev`).
- Dados: memória (`data.ts`) + arquivo JSON (`DATA_PATH`, reserva) + **MongoDB opcional** (`MONGODB_URI`, Discloud/Atlas — pedido do usuário em 2026-10-29), só em `backend/src/bancoDados.ts`: documento compactado e **cifrado** (DATA_ENCRYPTION_KEY), TLS + usuário/senha em produção. Não leve o driver para outros arquivos nem guarde dados sem cifra no banco.

## Antes de terminar
```bash
cd backend && npx tsc --noEmit && npm run test:ranking && npm run test:du && npm run security
```
Tudo precisa passar. Nova proteção → acrescente a checagem em `backend/scripts/security-check.mjs`.
