# Regras obrigatórias para IAs — Sistema DU

**Segurança é a base deste projeto.** Leia antes de tocar em qualquer arquivo. Se uma
mudança conflitar com estas regras, a regra vence — pare e avise o usuário.
Detalhes: `docs/SECURITY.md`.

## Segredos e ambiente
- Nunca imprima, copie, registre em log ou coloque em arquivo versionado valores de `backend/.env`.
- `.env.example` só com placeholders (vazios ou de exemplo óbvio).
- Nada sensível no frontend: `VITE_*` vai para o bundle público — nunca segredo, token, chave, URI de banco.
- Sem sourcemaps em produção (`frontend/vite.config.ts` → `sourcemap: false`).
- Não desligue validações de `backend/src/config/env.ts` (fail‑fast de `JWT_SECRET`, `DATA_ENCRYPTION_KEY`).

## Rotas do backend (toda rota nova)
- `requireAuth` + `requireArea(area, 'ver')` para leitura e `requireArea(area, 'editar')` para escrita
  (ou `adminOnly`). Exceções públicas só em `routes/public.ts` e no fluxo OAuth.
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
  (cookie `fast_sessao` httpOnly + SameSite=Strict + path restrito, header `X-Fast-Sessao: 1`). Nunca salve token em
  localStorage/sessionStorage; o logout apaga o cookie e revoga o `jti`.
- Rate limit: use `limitador()` de `middleware/rateLimiter.ts` (armazenamento com teto de chaves). Polling leve
  (`/api/public/revisao`) tem limite próprio — não pontue uso legítimo (várias abas, CGNAT) no firewall.

## Logs e auditoria
- Use `audit()` (`security/audit.ts`) para eventos de segurança; o console já passa por `redact()`.
- Nunca logue corpo de requisição, token, cookie, header `Authorization` ou URI de banco.

## Imagens
- Aceitas: qualquer link `http/https` ou upload `data:image/(png|jpeg|webp|gif);base64`, validado por
  `backend/src/security/imagem.ts` (`imagemValida`). A CSP `img-src` permite `https: http: data: blob:` — mantenha.
- Nenhum outro protocolo (`javascript:`, `file:`, `data:text/html`…). O backend não busca URLs de usuários (sem SSRF).

## Contas exoneradas
- Exonerado = bloqueio total (login OAuth e toda rota via `requireAuth`), mas os dados são **arquivados**
  (`membroArquivado`), nunca apagados. Não crie caminhos que contornem esse bloqueio.

## Dados
- Não altere a semântica de `backend/src/data.ts` nem migre dados sem backup e pedido explícito.
- Criptografia de campos: use `security/crypto.ts` (AES‑256‑GCM) seguindo o plano em `docs/SECURITY.md`.
- Nunca conecte à produção (`fastunit.shardweb.app`) nem rode `copiar:producao`/`testar:local` sem pedido.

## Antes de terminar
```bash
cd backend && npx tsc --noEmit && npm run test:ranking && npm run test:du && npm run security
```
Tudo precisa passar. Nova proteção → acrescente a checagem em `backend/scripts/security-check.mjs`.
