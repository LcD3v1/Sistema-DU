#!/usr/bin/env node
/**
 * Verificação de segurança automatizada (sem dependências externas).
 * Roda invariantes críticas e falha (exit 1) se algo estiver inseguro.
 *
 *   npm run security:check
 *
 * Cobre: força do JWT_SECRET, .gitignore protegendo segredos,
 * ausência de segredos reais no .env.example, e presença dos
 * arquivos de configuração de segurança esperados.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const REPO = path.resolve(ROOT, '..')

let failures = 0
let passes = 0
const ok = (m) => { console.log('  ✓ ' + m); passes++ }
const bad = (m) => { console.error('  ✗ ' + m); failures++ }

function readEnv(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return out
}

const PLACEHOLDERS = [
  'mude-para-uma-string-aleatoria-forte-minimo-48-chars',
  'changeme', 'secret', 'your-secret-here',
]

console.log('\n=== DU — Verificação de Segurança ===\n')

// 1. JWT_SECRET
console.log('[1] Segredo JWT (.env)')
const env = readEnv(path.join(ROOT, '.env'))
const secret = env.JWT_SECRET || ''
if (!secret) bad('JWT_SECRET não definido em backend/.env')
else {
  if (PLACEHOLDERS.includes(secret)) bad('JWT_SECRET é o valor de exemplo (forjável!)')
  else ok('JWT_SECRET não é placeholder')
  if (secret.length < 32) bad(`JWT_SECRET curto demais (${secret.length} < 32)`)
  else ok(`JWT_SECRET tem tamanho adequado (${secret.length} chars)`)
  if (new Set(secret).size < 12) bad('JWT_SECRET com baixa entropia')
  else ok('JWT_SECRET com entropia adequada')
}

// 2. .gitignore protege segredos e dados
console.log('\n[2] .gitignore')
const giPath = path.join(REPO, '.gitignore')
const gi = fs.existsSync(giPath) ? fs.readFileSync(giPath, 'utf8') : ''
for (const needle of ['.env', 'data.json', 'audit.log', 'node_modules']) {
  if (gi.includes(needle)) ok(`.gitignore cobre "${needle}"`)
  else bad(`.gitignore NÃO cobre "${needle}"`)
}

// 3. .env.example não contém segredos reais
console.log('\n[3] .env.example (deve conter apenas placeholders)')
const exEnv = readEnv(path.join(ROOT, '.env.example'))
const exSecret = exEnv.JWT_SECRET || ''
if (!exSecret || PLACEHOLDERS.includes(exSecret)) ok('.env.example usa placeholder para JWT_SECRET')
else bad('.env.example parece conter um JWT_SECRET real')
for (const k of ['DISCORD_CLIENT_SECRET', 'DISCORD_BOT_TOKEN']) {
  if (!exEnv[k]) ok(`.env.example não expõe ${k}`)
  else bad(`.env.example expõe ${k}`)
}

// 4. Arquivos de segurança esperados presentes
console.log('\n[4] Camadas de segurança presentes')
const expect = [
  'src/config/env.ts',
  'src/middleware/securityHeaders.ts',
  'src/middleware/rateLimiter.ts',
  'src/middleware/sanitize.ts',
  'src/middleware/auth.ts',
  'src/middleware/roles.ts',
  'src/security/tokenBlacklist.ts',
  'src/security/audit.ts',
]
for (const f of expect) {
  if (fs.existsSync(path.join(ROOT, f))) ok(f)
  else bad(`ausente: ${f}`)
}

// 5. Sem segredos óbvios hardcoded no código-fonte
console.log('\n[5] Varredura de segredos hardcoded em src/')
function walk(dir) {
  let files = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) files = files.concat(walk(p))
    else if (/\.(ts|js|mjs)$/.test(e.name)) files.push(p)
  }
  return files
}
const secretRe = /(?:api[_-]?key|secret|passwd|password|token)\s*[:=]\s*['"][A-Za-z0-9/+_-]{12,}['"]/i
let hardcoded = 0
for (const f of walk(path.join(ROOT, 'src'))) {
  const txt = fs.readFileSync(f, 'utf8')
  for (const line of txt.split('\n')) {
    if (secretRe.test(line) && !line.includes('invalidsalthash')) {
      bad(`possível segredo em ${path.relative(ROOT, f)} (conteúdo omitido)`)
      hardcoded++
    }
  }
}
if (hardcoded === 0) ok('nenhum segredo hardcoded encontrado')

const ler = (rel) => { try { return fs.readFileSync(path.join(ROOT, rel), 'utf8') } catch { return '' } }
const check = (cond, msgOk, msgBad) => (cond ? ok(msgOk) : bad(msgBad))
const idx = (txt, needle) => txt.indexOf(needle)

// 6. Firewall e ordem dos middlewares
console.log('\n[6] Firewall e ordem dos middlewares (index.ts)')
const index = ler('src/index.ts')
const fwSrc = ler('src/security/firewall.ts')
check(fwSrc.length > 0, 'security/firewall.ts presente', 'ausente: src/security/firewall.ts')
check(idx(index, 'app.use(firewall)') > 0, 'firewall montado', 'firewall NÃO montado em index.ts')
check(idx(index, "app.set('trust proxy', 1)") > 0 && idx(index, "app.set('trust proxy', 1)") < idx(index, 'app.use(firewall)'),
  'trust proxy (1) definido antes do firewall', 'trust proxy ausente ou depois do firewall')
check(idx(index, 'app.use(firewall)') < idx(index, 'express.json('), 'firewall antes do parser de corpo', 'firewall depois do parser de corpo')
check(idx(index, 'app.use(firewall)') < idx(index, 'app.use(securityHeaders)'), 'firewall antes dos headers/rotas', 'firewall fora de ordem')
for (const sig of ['SCANNER', 'ASSINATURAS', 'METODOS', 'MAX_URL', 'MAX_HEADERS_BYTES', 'maxIps', 'limparFirewall', "'content_type'"]) {
  check(fwSrc.includes(sig), `firewall cobre ${sig}`, `firewall sem ${sig}`)
}
check(/\\\$\(where\|ne/.test(fwSrc) || fwSrc.includes('$(where|ne'), 'firewall barra operadores NoSQL', 'firewall sem assinatura NoSQL')
check(/wp-admin/.test(fwSrc) && /\\\.env/.test(fwSrc) && /\\\.git/.test(fwSrc), 'firewall detecta scanners (.env/.git/wp-admin)', 'firewall sem detecção de scanners')
check(index.includes("app.disable('x-powered-by')"), 'X-Powered-By desligado', 'X-Powered-By não desligado')
check(index.includes("app.set('etag', false)"), 'ETag desligado nas respostas dinâmicas', 'ETag ligado')

// 7. Rate limiting em todas as superfícies
console.log('\n[7] Rate limiting')
for (const lim of ['globalLimiter', 'apiLimiter', 'mutationLimiter', 'uploadLimiter', 'publicLimiter', 'rankingLimiter', 'backupLimiter']) {
  check(new RegExp(`app\\.use\\([^\\n]*${lim}`).test(index) || new RegExp(`\\? ${lim}\\(`).test(index), `${lim} aplicado`, `${lim} NÃO aplicado em index.ts`)
}
const authRoutes = ler('src/routes/auth.ts')
check(/router\.get\('\/discord', discordLoginLimiter,/.test(authRoutes) && /router\.get\('\/discord\/callback', discordLoginLimiter,/.test(authRoutes),
  'limitador próprio no login pelo Discord (início e volta)', 'login pelo Discord sem limitador')
check(/router\.post\('\/sessao', sessaoLimiter/.test(authRoutes), 'sessaoLimiter em /sessao', 'rate limit ausente em /sessao')
check(/httpOnly: true, [^\n]*sameSite: 'strict'[^\n]*path: '\/api\/auth\/sessao'/.test(authRoutes), 'cookie de sessão httpOnly + SameSite=Strict', 'cookie de sessão sem httpOnly/SameSite=Strict')
check(/router\.post\('\/me\/nivel\/solicitar', requireAuth, validateBody\(nivelInicialSchema\)/.test(authRoutes),
  'pedido de nível exige login + Zod', 'pedido de nível sem requireAuth/validateBody')
check(/router\.put\('\/solicitacoes-perfil\/:id\/aprovar', requireAuth, requireArea\('membros', 'editar'\)/.test(ler('src/routes/membros.ts')),
  'aprovar alteração de perfil/nível exige editar membros', 'aprovação de perfil/nível sem requireArea editar')
check(/router\.put\('\/me\/personalizacao', requireAuth, validateBody\(personalizacaoSchema\)/.test(authRoutes),
  'personalização do perfil exige login + Zod', 'personalização do perfil sem requireAuth/validateBody')
check(/router\.get\('\/me\/qrus', requireAuth/.test(authRoutes) && /some\(p => p\.memberId === membroId\)/.test(authRoutes),
  'QRUs do perfil: só login e só as do próprio membro', 'QRUs do perfil sem requireAuth ou sem filtro do próprio membro')
{
  const perfilSec = ler('src/security/perfil.ts')
  check(/url\.protocol === 'https:' \|\| url\.protocol === 'http:'/.test(perfilSec) && /!url\.username && !url\.password/.test(perfilSec),
    'links do perfil só http/https e sem credenciais', 'links do perfil aceitam outros protocolos/credenciais')
  const pub = ler('src/routes/public.ts')
  check(/filter\(h => h\.tipo === 'promocao'\)/.test(pub), 'perfil público mostra só promoções', 'perfil público expõe rebaixamentos')
  check(/delete conta\.banner[\s\S]*delete conta\.links[\s\S]*delete conta\.emojisPerfil/.test(ler('src/efetivo.ts')),
    'exoneração apaga o perfil personalizado', 'exoneração mantém fundo/links/emojis')
  check(/filter\(l => ehLinkPerfil\(l\.url\)\)/.test(pub) && /filter\(ehEmoji\)/.test(pub),
    'perfil público revalida links/emojis na saída', 'perfil público devolve links/emojis sem revalidar')
}
{
  // Logos de plataforma: a lista branca do backend tem de bater com a do frontend
  const back = (ler('src/security/perfil.ts').match(/ICONES_PLATAFORMA = new Set\(\(\s*'([a-z0-9 ]+)'/) || [])[1]?.split(' ') ?? []
  const frontTs = fs.readFileSync(path.join(ROOT, '..', 'frontend', 'src', 'lib', 'iconesPlataforma.ts'), 'utf8')
  const front = [...frontTs.matchAll(/\[si([A-Z][a-z0-9]*)/g)].map(m => m[1].toLowerCase())
  check(back.length > 0 && front.length === back.length && front.every(c => back.includes(c)),
    `logos de plataforma: backend e frontend iguais (${back.length})`, 'lista de logos de plataforma diferente entre backend e frontend')
}
{
  // Cursos Internos (biblioteca): ver para ler, editar para mudar, Zod estrito, saída sem criadoPor
  const cursos = ler('src/routes/cursos.ts')
  check(/router\.get\('\/livros', requireAuth, requireArea\('cursos', 'ver'\)/.test(cursos)
    && (cursos.match(/requireArea\('cursos', 'editar'\)/g) || []).length === 3
    && /validateBody\(livroSchema\)/.test(cursos) && /validateBody\(livroUpdateSchema\)/.test(cursos),
    'Cursos Internos: requireArea ver/editar + Zod', 'Cursos Internos sem permissão por área ou sem Zod')
  const dto = cursos.slice(cursos.indexOf('function livroPublico'), cursos.indexOf('function idDaRota'))
  check(cursos.includes('res.json(livros.map(livroPublico))') && dto.length > 0 && !dto.includes('criadoPor'),
    'Cursos Internos: saída em lista branca (sem criadoPor)', 'Cursos Internos devolve o autor interno do cadastro')
  check(/ehLinkPerfil\(s, MAX_URL_LIVRO\)/.test(ler('src/middleware/validate.ts')), 'links de livro só http/https', 'links de livro sem validação de protocolo')
}
check(/router\.post\('\/restore',[^\n]*criticalLimiter/.test(ler('src/routes/config.ts')), 'criticalLimiter no restore', 'restore sem criticalLimiter')
{
  // Restore substitui contas/cargos: só dev, com Zod, sem campos legados de senha,
  // e a conta dona preservada quando quem restaura não é o dono
  const cfg = ler('src/routes/config.ts')
  check(/router\.get\('\/backup', requireAuth, requireDev,/.test(cfg)
    && /router\.post\('\/restore', requireAuth, requireDev,[^\n]*validateBody\(restoreSchema\)/.test(cfg),
    'backup/restore só para dev, restore validado por Zod', 'backup/restore acessível a admin (escalada para dev) ou sem Zod')
  check(/for \(const c of body\.contas\) \{ delete c\.password; delete c\.senhaPadrao \}/.test(cfg),
    'restore descarta senhas legadas (login só pelo Discord)', 'restore aceita senha nas contas')
  check(/req\.user!\.contaId !== PROTECTED_OWNER_ID && donoAtual/.test(cfg),
    'restore por outro dev não altera a conta dona', 'restore permite sobrescrever a conta dona')
}
check(ler('src/middleware/rateLimiter.ts').includes('registrarInfracao'), 'rate limit alimenta o firewall', 'rate limit não pontua no firewall')

// 8. Headers HTTP
console.log('\n[8] Headers HTTP')
const headers = ler('src/middleware/securityHeaders.ts')
for (const [needle, nome] of [
  ['hsts:', 'HSTS'], ['Permissions-Policy', 'Permissions-Policy'], ['crossOriginOpenerPolicy', 'COOP'],
  ['crossOriginResourcePolicy', 'CORP'], ["frameAncestors: [\"'none'\"]", 'frame-ancestors none'],
  ["objectSrc:      [\"'none'\"]", 'object-src none'], ['forcarHttps', 'redirecionamento HTTPS'],
  ['no-store', 'Cache-Control no-store na API'],
]) check(headers.includes(needle), `${nome} configurado`, `${nome} ausente`)
check(!/scriptSrc:[^\n]*unsafe-(inline|eval)/.test(headers), 'script-src sem unsafe-inline/eval', 'script-src permite unsafe-inline/eval')
check(index.includes("app.use('/api', apiHeaders)"), 'apiHeaders aplicado em /api', 'apiHeaders não aplicado')

// 9. JWT
console.log('\n[9] JWT e sessões')
const jwtSrc = ler('src/security/jwt.ts')
check(jwtSrc.includes("algorithms: ['HS256']"), 'verificação fixa em HS256 (sem alg=none)', 'algoritmo JWT não fixado')
check(jwtSrc.includes('issuer: JWT_ISSUER') && jwtSrc.includes('audience: JWT_AUDIENCE'), 'iss/aud na emissão', 'JWT sem iss/aud')
check(jwtSrc.includes('clockTolerance') && jwtSrc.includes('maxAge'), 'clockTolerance/maxAge definidos', 'JWT sem clockTolerance/maxAge')
let jwtFora = 0
for (const f of walk(path.join(ROOT, 'src'))) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/')
  if (rel === 'src/security/jwt.ts') continue
  if (/\bjwt\.(sign|verify|decode)\(/.test(fs.readFileSync(f, 'utf8'))) { bad(`jwt.sign/verify fora de security/jwt.ts: ${rel}`); jwtFora++ }
}
if (jwtFora === 0) ok('emissão/verificação de JWT centralizada')
check(ler('src/middleware/auth.ts').includes('verificarToken'), 'requireAuth usa verificarToken', 'requireAuth não usa verificarToken')
check(ler('src/security/tokenBlacklist.ts').includes('iniciarPersistenciaRevogacoes') && index.includes('iniciarPersistenciaRevogacoes()'),
  'revogação de sessão persistente', 'revogação de sessão só em memória')
// Login SOMENTE pelo Discord: sem senha, state anti-CSRF, falha da API nunca exonera
{
  const discordTs = ler('src/discord.ts')
  const cb = authRoutes.slice(authRoutes.indexOf("router.get('/discord/callback'"))
  check(!/bcrypt|router\.(post|put)\('\/(login|solicitar|me\/senha)'/.test(authRoutes) && !/contas\/:id\/senha|bcrypt/.test(ler('src/routes/config.ts'))
    && !fs.existsSync(path.join(ROOT, 'src/security/bruteForce.ts')),
    'login/troca/redefinição de senha removidos (só Discord)', 'ainda existe login ou troca de senha')
  check(/crypto\.randomBytes\(32\)\.toString\('base64url'\)/.test(authRoutes) && /iguaisSeguro\(state, esperado\)/.test(cb)
    && /res\.clearCookie\(estadoCookie, estadoCookieOptions\)/.test(cb),
    'state do OAuth aleatório, comparado em tempo constante e de uso único', 'OAuth sem state seguro (CSRF no login)')
  check(/estadoCookieOptions = \{ httpOnly: true, secure: process\.env\.NODE_ENV === 'production', sameSite: 'lax' as const, path: '\/api\/auth\/discord' \}/.test(authRoutes),
    'cookie do state httpOnly, Secure em produção e de caminho restrito', 'cookie do state sem httpOnly/Secure/path')
  check(/res\.redirect\(303, `\/login\?\$\{q\}`\)/.test(authRoutes) && !/res\.redirect\([^)]*req\.(query|body|get)/.test(authRoutes),
    'redirecionamentos só para destinos fixos (sem open redirect)', 'redirect usa dado do usuário')
  check(/function voltarLogin\(res: Response[^]*?res\.clearCookie\(sessaoCookie, sessaoCookieOptions\)/.test(authRoutes),
    'login pelo Discord sem sucesso apaga a sessão anterior do navegador', 'login negado mantém a sessão de outra pessoa no navegador')
  check(/if \(corpo\.code === 10007\) \{ lembrarMembro\(discordId, null\); return \{ status: 'fora' \} \}/.test(discordTs) && (discordTs.match(/status: 'fora'/g) || []).length === 2
    && /situacao\?\.status === 'erro'\) \{ audit\('DISCORD_LOGIN_ERROR'/.test(cb),
    'só "membro desconhecido" (10007) conta como saída; erro da API não entra nem exonera', 'falha da API do Discord pode exonerar ou liberar acesso')
  check(/oauth2\/token\/revoke/.test(discordTs) && /scope: 'identify'/.test(discordTs) && !/refresh_token/.test(discordTs),
    'OAuth só com identify; token do usuário revogado e nunca guardado', 'OAuth guarda token ou pede escopo demais')
  check(/redirect: 'error'/.test(discordTs) && /AbortSignal\.timeout\(/.test(discordTs),
    'chamadas ao Discord com timeout e sem seguir redirecionamento', 'chamadas ao Discord sem timeout/redirect bloqueado')
  check(/exonerarConta\(data, conta, /.test(discordTs) && /conta\.membroArquivado = structuredClone\(membro\)/.test(ler('src/efetivo.ts')),
    'saída do servidor exonera arquivando os dados (não apaga)', 'saída do servidor apaga dados')
  const cfgAcesso = ler('src/routes/config.ts')
  {
    // Lista branca: só os campos que a tela usa (nada de senha legada, guildId/botId, ficha arquivada, setagem)
    const corpoConta = cfgAcesso.slice(cfgAcesso.indexOf('function contaPublica(c: Conta)'), cfgAcesso.indexOf('function contaPublica(c: Conta)') + 600)
    check(corpoConta.length > 0 && !/\.\.\.|password|senhaPadrao|sessaoVersao|guildId|botId|membroArquivado|cadastroSetagem|discordRoleIds/.test(corpoConta)
      && !/res\.json\(data\.contas\)|res\.json\(conta\)/.test(cfgAcesso),
      'lista/edição de contas por lista branca (sem senha legada, IDs do Discord nem ficha arquivada)', 'campos de senha expostos em /config/contas')
  }
  const listaPedidos = cfgAcesso.slice(cfgAcesso.indexOf("router.get('/solicitacoes-acesso'"), cfgAcesso.indexOf("router.post('/solicitacoes-acesso/:id/aprovar'"))
  check(/router\.post\('\/solicitacoes-acesso\/:id\/aprovar', requireAuth, adminOnly, hierarquiaLimiter, validateBody\(aprovarAcessoSchema\)/.test(cfgAcesso)
    && /map\(\(\{ id, username, nome, avatar, criadoEm, setagem \}\) =>/.test(listaPedidos) && !/discordId|canalTemp|mensagemTemp/.test(listaPedidos),
    'pedidos de acesso: só admin aprova (Zod) e a lista não expõe o ID do Discord', 'pedidos de acesso sem adminOnly/Zod ou com discordId')
  check(/\(payload\.sv \?\? 0\) !== \(conta\.sessaoVersao \?\? 0\)/.test(ler('src/middleware/auth.ts')) && /sv: conta\.sessaoVersao \?\? 0/.test(authRoutes)
    && /sessaoVersao = \(conta\.sessaoVersao \?\? 0\) \+ 1/.test(authRoutes),
    '"sair de todos" derruba todas as sessões da conta', '"sair de todos" mantém sessões antigas')
}
check(!/scope: configuredScope\(\) \? scopeKey/.test(authRoutes), 'IDs de servidor/bot não vão no JWT', 'JWT expõe scopeKey em claro')

// 10. Erros e vazamentos
console.log('\n[10] Tratamento de erros')
check(index.includes("res.status(500).json({ error: 'Erro interno do servidor' })"), 'erro 500 genérico', 'erro 500 não genérico')
check(index.includes("'entity.parse.failed'"), 'erros do parser JSON tratados como 4xx', 'erros do parser JSON caem no 500')
check(index.includes("app.use('/api', (_req: Request, res: Response)") && index.includes('Recurso não encontrado'), '404 genérico em /api', '404 de /api ausente')
let vaza = 0
for (const f of walk(path.join(ROOT, 'src'))) {
  const txt = fs.readFileSync(f, 'utf8')
  if (/json\(\{[^}]*\b(err|error|e)\.(stack|message)\b/.test(txt) || /json\(\{[^}]*stack\s*:/.test(txt)) {
    bad(`possível vazamento de erro interno em ${path.relative(ROOT, f)}`); vaza++
  }
}
if (vaza === 0) ok('nenhuma resposta ecoa err.message/stack')

// 11. Rotas autenticadas por padrão
console.log('\n[11] Rotas exigem requireAuth (exceto lista pública)')
const PUBLICAS = new Set([
  // Login pelo Discord (início e volta do OAuth): públicos por natureza (limitador próprio + state, conferidos acima)
  "auth.ts:router.get('/discord'", "auth.ts:router.get('/discord/callback'",
  // Restaura a sessão pelo cookie httpOnly: valida o token com requireAuth dentro do handler
  "auth.ts:router.post('/sessao'",
  "config.ts:router.get('/logo'",
])
let semAuth = 0
for (const nome of fs.readdirSync(path.join(ROOT, 'src/routes'))) {
  if (nome === 'public.ts') continue // diretório público: só campos públicos
  const txt = ler(`src/routes/${nome}`)
  if (/router\.use\(requireAuth/.test(txt)) continue
  for (const m of txt.matchAll(/router\.(get|post|put|patch|delete)\(('[^']*')[^\n]*/g)) {
    const chave = `${nome}:router.${m[1]}(${m[2]}`
    if (!m[0].includes('requireAuth') && !PUBLICAS.has(chave)) { bad(`rota sem requireAuth: ${chave}`); semAuth++ }
  }
}
if (semAuth === 0) ok('todas as rotas privadas exigem requireAuth')

// 12. Criptografia e redação
console.log('\n[12] Criptografia em repouso e redação de logs')
const cryptoSrc = ler('src/security/crypto.ts')
check(cryptoSrc.includes("'aes-256-gcm'") && cryptoSrc.includes('randomBytes(12)') && cryptoSrc.includes('getAuthTag'), 'AES-256-GCM com IV aleatório e tag', 'crypto.ts ausente/incompleto')
check(cryptoSrc.includes('timingSafeEqual'), 'comparação timing-safe disponível', 'sem comparação timing-safe')
const redactSrc = ler('src/security/redact.ts')
for (const [needle, nome] of [['REDACTED_JWT', 'JWT'], ['REDACTED_DISCORD_TOKEN', 'token de bot Discord'], ['REDACTED_WEBHOOK', 'webhook Discord'], ['REDACTED_DATABASE_URI', 'URI do Mongo']]) {
  check(redactSrc.includes(needle), `redação de ${nome}`, `sem redação de ${nome}`)
}
check(ler('src/config/env.ts').includes('protectConsole()'), 'console protegido por redação', 'console sem redação')
const chaveDados = env.DATA_ENCRYPTION_KEY || ''
if (chaveDados) {
  const v = chaveDados.trim()
  const bytes = /^[0-9a-f]{64}$/i.test(v) ? 32 : (/^[A-Za-z0-9+/_-]{43}=?$/.test(v) ? 32 : 0)
  check(bytes === 32, 'DATA_ENCRYPTION_KEY com 32 bytes', 'DATA_ENCRYPTION_KEY em formato inválido')
  check(v !== secret, 'DATA_ENCRYPTION_KEY diferente do JWT_SECRET', 'DATA_ENCRYPTION_KEY igual ao JWT_SECRET')
} else ok('DATA_ENCRYPTION_KEY não definida (criptografia de campos desativada — opcional)')
check(!exEnv.DATA_ENCRYPTION_KEY, '.env.example não expõe DATA_ENCRYPTION_KEY', '.env.example expõe DATA_ENCRYPTION_KEY')

// 13. Frontend: nada sensível no bundle
console.log('\n[13] Frontend sem segredos nem sourcemaps')
const FRONT = path.join(REPO, 'frontend')
for (const nome of fs.existsSync(FRONT) ? fs.readdirSync(FRONT).filter(n => n.startsWith('.env')) : []) {
  const vars = readEnv(path.join(FRONT, nome))
  const sens = Object.keys(vars).filter(k => /SECRET|TOKEN|PASSWORD|PRIVATE|MONGO|JWT|_KEY/i.test(k))
  check(sens.length === 0, `frontend/${nome} sem variáveis sensíveis`, `frontend/${nome} tem variável sensível (${sens.join(', ')})`)
}
const vite = (() => { try { return fs.readFileSync(path.join(FRONT, 'vite.config.ts'), 'utf8') } catch { return '' } })()
check(!/sourcemap\s*:\s*(true|'inline'|"inline"|'hidden')/.test(vite), 'Vite sem sourcemap em produção', 'Vite gera sourcemap')
// O .env da raiz (Discord) e o backend/.env ficam fora do bundle: Vite lê só frontend/ e só VITE_*
check(/envDir: import.meta.dirname,/.test(vite) && /envPrefix: 'VITE_',/.test(vite) && !/\bdefine\s*:/.test(vite) && !/loadEnv/.test(vite),
  'Vite lê .env só de frontend/ e só expõe VITE_*', 'Vite pode levar o .env da raiz/backend para o bundle')
{
  // Nenhum valor dos .env do servidor pode aparecer no build do frontend (valores nunca são impressos)
  const valores = [path.join(REPO, '.env'), path.join(ROOT, '.env')]
    .flatMap(f => Object.values(readEnv(f))).filter(v => typeof v === 'string' && v.length >= 12)
  const dist = path.join(FRONT, 'dist')
  const arquivos = fs.existsSync(dist)
    ? (function lista(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? lista(path.join(d, e.name)) : [path.join(d, e.name)]) })(dist).filter(f => /\.(js|html|css|json)$/.test(f))
    : []
  const vazou = arquivos.filter(f => { const t = fs.readFileSync(f, 'utf8'); return /DISCORD_(CLIENT_SECRET|BOT_TOKEN)/.test(t) || valores.some(v => t.includes(v)) })
  check(vazou.length === 0, 'build do frontend sem valores dos .env do servidor', `build do frontend contém segredo do servidor: ${vazou.map(f => path.relative(REPO, f)).join(', ')}`)
}
let frontSrcSecret = 0
const frontSrc = path.join(FRONT, 'src')
if (fs.existsSync(frontSrc)) {
  const walkFront = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walkFront(path.join(d, e.name)) : [path.join(d, e.name)])
  for (const f of walkFront(frontSrc).filter(f => /\.(tsx?|jsx?)$/.test(f))) {
    if (/import\.meta\.env\.VITE_\w*(SECRET|TOKEN|PASSWORD|PRIVATE|JWT|MONGO)/i.test(fs.readFileSync(f, 'utf8'))) {
      bad(`frontend lê variável sensível: ${path.relative(REPO, f)}`); frontSrcSecret++
    }
  }
}
if (frontSrcSecret === 0) ok('frontend não referencia variáveis sensíveis')
const dist = path.join(FRONT, 'dist')
if (fs.existsSync(dist)) {
  const walkDist = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walkDist(path.join(d, e.name)) : [path.join(d, e.name)])
  const maps = walkDist(dist).filter(f => f.endsWith('.map'))
  check(maps.length === 0, 'frontend/dist sem arquivos .map', `frontend/dist contém ${maps.length} sourcemap(s)`)
}

// 14. Hierarquia de cargos e cargo de dev
console.log('\n[14] Hierarquia de cargos e cargo de dev')
const accessTs  = ler('src/access.ts')
const efetivoTs = ler('src/efetivo.ts')
const cfgTs     = ler('src/routes/config.ts')
const membrosTs = ler('src/routes/membros.ts')

check(/export function isDev\(/.test(accessTs), 'access.ts define isDev', 'access.ts sem isDev')
check(/export function isAdmin\([^)]*\)[^{]*\{\s*\n\s*if \(isDev\(/.test(accessTs),
  'isAdmin herda de isDev (dev faz tudo)', 'isAdmin não trata dev como acesso total')
check(/export function podeAtribuirCargo\(/.test(accessTs) && /cargo\.dev\)\s*return false/.test(accessTs),
  'podeAtribuirCargo barra o cargo de dev', 'podeAtribuirCargo não barra o cargo de dev')
check(/export function cargoConcedeEditar\(/.test(accessTs),
  'cargo com "editar" é detectável (cargoConcedeEditar)', 'falta cargoConcedeEditar')

// Em podeGerenciar os guardas de dev vêm ANTES do atalho de admin — senão o admin passa por cima
const pg = efetivoTs.slice(efetivoTs.indexOf('export function podeGerenciar'))
const pDevAlvo = pg.indexOf('isDev(alvo, data)')
const pDevCargo = pg.indexOf('destino?.dev')
const pAdmin = pg.indexOf('isAdmin(ator, data)')
check(pDevAlvo > -1 && pDevCargo > -1 && pAdmin > -1 && pDevAlvo < pAdmin && pDevCargo < pAdmin,
  'podeGerenciar barra dev antes de liberar o admin', 'podeGerenciar libera o admin antes de checar dev')
check(/Somente administradores atribuem cargos com permissão de editar/.test(efetivoTs),
  'só admin/dev atribui cargo com "editar"', 'cargo com "editar" atribuível por não-admin')
check(/Você não pode gerenciar a si mesmo/.test(efetivoTs),
  'ninguém gerencia a si mesmo', 'falta o bloqueio de auto-gerenciamento')
check(/nivelHierarquia\(data, alvo\.cargoPermId\) <= meu/.test(efetivoTs),
  'cargo igual ou acima é bloqueado', 'cargo igual/superior não é bloqueado')

check(/function souDev\(/.test(cfgTs), 'config.ts checa dev nas rotas de cargo', 'config.ts sem checagem de dev')
const pontosDev = (cfgTs.match(/!souDev\(req, data\)/g) || []).length
check(pontosDev >= 3, `flag dev protegida ao criar, editar e excluir cargo (${pontosDev} pontos)`, 'flag dev pouco protegida em config.ts')
check(/podeAtribuirCargo\(autor, destino, data\)/.test(cfgTs),
  '/contas atribui cargo via podeAtribuirCargo', '/contas atribui cargo sem podeAtribuirCargo')
check(/!isDev\(autor, data\) && isDev\(conta, data\)/.test(cfgTs),
  'só dev edita a conta de um dev', 'conta de dev editável por admin')
check(/dev \|\| c\.dev !== true/.test(membrosTs),
  'cargo de dev fora da hierarquia exposta a não-devs', 'cargo de dev exposto na hierarquia')

// 15. Discord: login (OAuth), conferência de membro e o painel de hierarquia — nada mais
console.log('\n[15] Discord só para login, verificação de membro e painel de hierarquia')
{
  const arquivosSrc = []
  const varrer = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) varrer(p); else if (/\.ts$/.test(e.name)) arquivosSrc.push([path.relative(ROOT, p).replace(/\\/g, '/'), fs.readFileSync(p, 'utf8')])
  } }
  varrer(path.join(ROOT, 'src'))
  const fora = arquivosSrc.filter(([rel, txt]) => rel !== 'src/discord.ts' && rel !== 'src/config/env.ts' && /DISCORD_BOT_TOKEN|DISCORD_CLIENT_SECRET|Authorization: `Bot |discord\.com\/api/.test(txt))
  check(fora.length === 0, 'token do bot, segredo do app e API do Discord só em src/discord.ts', `Discord usado fora de discord.ts: ${fora.map(([r]) => r).join(', ')}`)
  check(!arquivosSrc.some(([, txt]) => /from 'discord\.js'/.test(txt)), 'sem cliente de bot (discord.js)', 'backend usa discord.js')
  const discordTs = ler('src/discord.ts')
  const chamadasApi = [...discordTs.matchAll(/\$\{API\}(\/[^`'"]*)/g)].map(m => m[1].replace(/\$\{[^}]+\}/g, ':id'))
  // Lista branca: login, leitura do servidor (cargos/canais/membros) e a mensagem do painel. Sem banir, sem mexer em cargos.
  const PERMITIDAS = ['/oauth2/token', '/oauth2/token/revoke', '/users/@me', '/guilds/:id/members/:id',
    '/guilds/:id?with_counts=true', '/guilds/:id/roles', '/guilds/:id/channels', '/guilds/:id/emojis', '/guilds/:id/members?limit=1000&after=:id',
    '/channels/:id/messages', '/channels/:id/messages/:id',
    // Setagem: responder cliques (botão/modal), trocar apelido e dar o cargo aprovado
    '/interactions/:id/:id/callback', '/webhooks/:id/:id/messages/@original', '/guilds/:id/members/:id/roles/:id',
    // Setagem: canal temporário do pedido (criar/apagar) e aviso no privado
    '/channels/:id', '/users/@me/channels',
    // Carteirinha: tópico do membro no fórum (criar ou responder nele)
    '/channels/:id/threads',
    // Logs: só LEITURA do registro de auditoria do servidor
    '/guilds/:id/audit-logs?limit=100',
    // Carteirinha: só LEITURA dos tópicos do fórum (escolher em qual postar)
    '/guilds/:id/threads/active', '/channels/:id/threads/archived/public?limit=50',
    // Rodapé dos painéis: emojis do PRÓPRIO bot (aplicação), nunca do servidor
    '/applications/:id/emojis', '/applications/:id/emojis/:id']
  check(chamadasApi.length > 0 && chamadasApi.every(c => PERMITIDAS.includes(c)),
    'bot só lê o servidor e faz o que os painéis/setagem precisam (sem banir nem mexer em cargos à toa)', `chamada inesperada à API do Discord: ${chamadasApi.join(', ')}`)
  // Escrita no Discord: PUT só para DAR cargo (patente/setor/advertência); DELETE só da própria mensagem de painel,
  // do canal temporário do pedido e para TIRAR cargo de membro (patente/setor/advertência antigos). Sem banir/expulsar.
  const deletes = [...discordTs.matchAll(/chamar\(`\$\{API\}([^`]*)`, \{\s*method: 'DELETE'/g)].map(m => m[1])
  check(deletes.length === 4 && deletes.includes('/channels/${canalId}/messages/${mensagemId}') && deletes.includes('/channels/${canalId}')
    && deletes.includes('/guilds/${cfg.guildId}/members/${discordId}/roles/${roleId}')
    && deletes.includes('/applications/${cfg.clientId}/emojis/${emoji.id}')
    && (discordTs.match(/method: 'DELETE'/g) || []).length === 4
    && !/init\('DELETE'\)/.test(discordTs) && (discordTs.match(/method: 'PUT'/g) || []).length === 1
    && /\/members\/\$\{discordId\}\/roles\/\$\{roleId\}`, \{\s*method: 'PUT'/.test(discordTs)
    && !/\/bans\/|\/prune/.test(discordTs),
    'bot só apaga o próprio painel/canal temporário, os próprios emojis do rodapé e só dá/tira cargos de membro (sem banir/expulsar)', 'bot faz DELETE ou PUT inesperado na API do Discord')
  // Emoji do rodapé: só emoji da APLICAÇÃO do bot, nome sempre du_<hash>; nunca emoji do servidor; imagem só data URL ou CDN do Discord
  const rodTs = ler('src/rodapeDiscord.ts')
  const emojiTs = discordTs.slice(discordTs.indexOf('export const NOME_EMOJI_RODAPE'), discordTs.indexOf('// ── Foto do membro'))
  check(emojiTs.includes('export const NOME_EMOJI_RODAPE = /^du_[a-f0-9]{16}$/')
    && emojiTs.includes('if (!NOME_EMOJI_RODAPE.test(nome) ||') && emojiTs.includes('if (!NOME_EMOJI_RODAPE.test(emoji.nome) ||')
    && !discordTs.includes('guildId}/emojis' + String.fromCharCode(96) + ', {')   // nunca cria/apaga emoji do SERVIDOR
    && rodTs.includes("fonte.startsWith('data:') ? bytesDoDataUrl(fonte) : await baixarFotoDiscord(fonte, 128)")
    && rodTs.includes('img.dados.length > MAX_BYTES_EMOJI') && rodTs.includes('NOME_EMOJI_RODAPE.test(e.nome)'),
    'rodapé: fotinha = emoji do próprio bot (du_<hash>), sem tocar nos emojis do servidor e sem baixar link de usuário', 'emoji do rodapé fora da regra')
  // Criar cargo: só em criarCargo, SEMPRE sem permissão nenhuma, e só para os cargos de advertência
  const criaCargo = discordTs.slice(discordTs.indexOf('export async function criarCargo'), discordTs.indexOf('// ── Gateway'))
  const setagemSrc = ler('src/setagem.ts')
  check((discordTs.match(/\/roles`, \{\s*method: 'POST'/g) || []).length === 1 && /permissions: '0'/.test(criaCargo) && /mentionable: false/.test(criaCargo)
    && (setagemSrc.match(/criarCargo\(/g) || []).length === 1 && /criarCargo\(cfg, NOMES_ADV\[n\], CORES_ADV\[n\]\)/.test(setagemSrc),
    'bot só cria cargos de advertência, sempre SEM permissão nenhuma', 'bot cria cargo com permissão ou fora das advertências')
  // Cargo com moderação/administração: pode ser CONFIGURADO em patente/setor, mas o bot NUNCA dá nem tira
  // (vai para "dar à mão"); advertência (que o bot dá sozinho) continua recusando cargo alto ao salvar.
  const rotasSet = ler('src/routes/setagem.ts')
  check(/async function cargosPerigosos/.test(setagemSrc)
    && setagemSrc.includes('const nome = perigosos.get(roleId)\n    if (nome !== undefined) { manuais.push(nome); continue }')
    && setagemSrc.includes('const nome = perigosos.get(r); if (nome !== undefined) { manuais.push(nome); continue }')
    && setagemSrc.includes('if (!perigosos.has(r)) anotar(await tirarCargo(')
    && /pode ser de advertência/.test(rotasSet) && /!r\.perigoso && !r\.integracao/.test(setagemSrc),
    'cargo com moderação nunca é dado nem tirado pelo bot (vai para "dar à mão"); advertência recusa cargo alto', 'bot pode entregar cargo com moderação/administração')
  // Patente/setor só mudam no Discord DEPOIS de aprovados (pedido de perfil validado contra a lista cadastrada)
  const membrosRotas = ler('src/routes/membros.ts')
  check(/valorDePerfilInvalido/.test(membrosRotas) && /valorDePerfilInvalido/.test(ler('src/routes/auth.ts'))
    && /sp\.status = 'aprovada'[\s\S]{0,400}aplicarPerfilNoDiscord|aplicarPerfilNoDiscord\(membro\.id, antes\)/.test(membrosRotas),
    'patente/setor pedidos só existem se cadastrados e só vão ao Discord após aprovação', 'pedido de perfil aplica patente/setor sem validar ou sem aprovação')
  // O canal apagado é sempre o guardado no pedido (criado pela setagem), nunca um vindo de quem clicou
  // Só 3 chamadas: canal guardado no pedido resolvido; canal que a própria sincronização acabou de criar
  // (pedido resolvido no meio); canal guardado no pedido de quem saiu do servidor
  const chamadasApagar = [...ler('src/setagem.ts').matchAll(/apagarCanalTemporario\(([^)]*)\)/g), ...ler('src/discord.ts').matchAll(/await apagarCanalTemporario\(([^)]*)\)/g)].map(m => m[1])
  check(chamadasApagar.length === 3 && chamadasApagar.includes('cfg, canal') && chamadasApagar.includes('cfg, canalCriado') && chamadasApagar.includes('cfg, canalDoPedido')
    && /const canal = sol\.setagem\?\.canalTemp/.test(ler('src/setagem.ts'))
    && /const canalCriado = canal !== sol\.setagem\.canalTemp \? canal : undefined/.test(ler('src/setagem.ts'))
    && /if \(pedidosFora\.includes\(s\.id\) && s\.setagem\?\.canalTemp\) canaisDosPedidosFora\.push\(s\.setagem\.canalTemp\)/.test(ler('src/discord.ts')),
    'só canais temporários criados pela setagem são apagados', 'setagem pode apagar outro canal')
  // Gateway: só para receber cliques, sem intents, e só do servidor da unidade
  check(/intents: 0/.test(discordTs) && /if \(i && i\.guildId === cfg\.guildId\)/.test(discordTs) && /FECHAMENTOS_FATAIS/.test(discordTs),
    'Gateway sem intents, só interações do servidor da unidade', 'Gateway aceita interações de outros servidores ou pede intents')
  // Setagem: rotas com área, aprovação/configuração presas ao poder de quem aprova, cargos perigosos recusados
  const setRotas = ler('src/routes/setagem.ts')
  const setTs = ler('src/setagem.ts')
  check([...setRotas.matchAll(/router\.(get|post|put|patch|delete)\([^\n]*/g)].every(m => /requireAuth, requireArea\('setagem', '(ver|editar)'\)/.test(m[0]))
    && /router\.put\('\/', requireAuth, requireArea\('setagem', 'editar'\), hierarquiaLimiter, validateBody\(setagemSchema\)/.test(setRotas),
    'setagem: login + área setagem, Zod e limitador', 'rota da setagem sem permissão/Zod/limitador')
  // Configurar: patente só liga a cargo do site que quem configura pode atribuir. Aprovar no site: idem (podeAtribuir).
  // Aprovar no Discord: usa o cargo ligado à patente (já limitado ao configurar) ou o padrão.
  check(/podeAtribuirCargo\(autor, cargo, data\)/.test(setRotas) && /const podeAtribuir = \(cargo: CargoPermissao\) => \{[^\n]*podeAtribuirCargo\(a, cargo, d\)/.test(ler('src/routes/config.ts'))
    && /aprovarPedido\(id, \{ por: nomeDaConta\(peekData\(\), req\.user!\.contaId\), cargoPermId, podeAtribuir \}\)/.test(ler('src/routes/config.ts'))
    && /if \(cargo && op\.podeAtribuir && !op\.podeAtribuir\(cargo\)\)/.test(setTs) && /if \(cargo\.perigoso\)/.test(setRotas)
    && /const PERMISSOES_PERIGOSAS = \[0x8n/.test(discordTs),
    'setagem não dá cargo acima do poder de quem configura/aprova nem cargo de moderação no Discord', 'setagem permite escalada de cargo')
  check(/ESPERA_ENVIO_MS = 30_000/.test(setTs) && /const CODINOME = \/\^\[\\p\{L\}\\p\{N\}\]/.test(setTs) && /if \(conta\?\.exonerado\)/.test(setTs)
    && !/darCargo\(/.test(setTs.slice(0, setTs.indexOf('// ── Decisões')))
    && /if \(!ehAprovador\(cfg, s, i\)\)/.test(setTs) && /if \(sol\.discordId === i\.usuario\.id\)/.test(setTs) && /c\.porId !== i\.usuario\.id/.test(setTs),
    'pedido de set: limite, validação, cargo só na aprovação; só aprovador avalia, nunca o próprio pedido; só quem digitou confirma a correção', 'pedido de set sem limite/validação ou avaliação sem conferir quem clicou')
  check(/if \(conta\.cadastroSetagem\) \{ body\.codinome = conta\.cadastroSetagem\.codinome; body\.passaporte = conta\.cadastroSetagem\.passaporte \}/.test(ler('src/routes/auth.ts')),
    'cadastro inicial mantém codinome/passaporte aprovados na setagem', 'cadastro inicial deixa trocar dados aprovados na setagem')
  check(/allowed_mentions: \{ parse: \[\] \}/.test(discordTs), 'painel não notifica ninguém (allowed_mentions vazio)', 'painel pode pingar @everyone/membros')
  // CDN: só o ícone/banner do servidor (repassados pelo backend: a URL leva o ID do servidor)
  const cdn = [...discordTs.matchAll(/chamar\(`\$\{CDN\}[^`]*`/g)].map(m => m[0])
  check(cdn.length === 1 && /icons' : 'banners'/.test(cdn[0]), 'bot só baixa do CDN o ícone/banner do servidor', 'download inesperado do CDN do Discord')
  const servRotas = ler('src/routes/servidor.ts')
  check(/router\.get\('\/', requireAuth, requireArea\('servidor', 'ver'\)/.test(servRotas) && /router\.get\('\/membros', requireAuth, requireArea\('servidor', 'editar'\)/.test(servRotas)
    && /router\.post\('\/atualizar', requireAuth, requireArea\('servidor', 'editar'\), hierarquiaLimiter/.test(servRotas),
    'página do servidor: login + área; lista de membros (IDs do Discord) só com editar', 'dados do servidor sem permissão')
  check(!/iconeHash:|bannerHash:|guildId|botAvatar/.test(servRotas) && /temIcone: Boolean\(info\??\.iconeHash\)/.test(servRotas),
    'página do servidor não expõe o ID do servidor/bot (ícone e banner via backend)', 'página do servidor expõe ID do servidor/bot')
  const hierRotas = ler('src/routes/hierarquia.ts')
  check([...hierRotas.matchAll(/router\.(get|post|put|patch|delete)\([^\n]*/g)].every(m => /requireAuth, requireArea\('hierarquia', '(ver|editar)'\)/.test(m[0]))
    && /router\.put\('\/', requireAuth, requireArea\('hierarquia', 'editar'\), hierarquiaLimiter, validateBody\(hierarquiaSchema\)/.test(hierRotas),
    'painel de hierarquia: login + área hierarquia, Zod e limitador ao salvar', 'rota do painel de hierarquia sem permissão/Zod/limitador')
  const hierTs = ler('src/hierarquia.ts')
  check(/const imagemOk = \(v: string \| null\) => !v \|\| \(v\.startsWith\('data:'\) \? Boolean\(imagemEnviada\(v\)\) : ehLinkImagem\(v\)\)/.test(hierRotas)
    && /imagemEnviada\(valor: string, maxBytes = MAX_IMAGEM_BYTES\)/.test(hierTs) && /dados\.length > maxBytes/.test(hierTs) && /ASSINATURAS\.find/.test(hierTs),
    'imagens do painel: upload conferido pelos bytes (PNG/JPG/GIF/WEBP, 1 MB) ou link http/https', 'imagem do painel aceita sem conferir os bytes/protocolo')
  check(/if \(body\.versao !== atual\.versao\)/.test(hierRotas) && /res\.status\(409\)/.test(hierRotas),
    'edição simultânea do painel: versão conferida (409), nada sobrescrito', 'painel de hierarquia sem controle de edição simultânea')
  check(/<@!\?\(\\d\{17,20\}\)>/.test(hierRotas) && /bot: \{ nome: info\.botNome \}/.test(hierRotas) && !/mensagemId: h\.mensagemId/.test(hierRotas),
    'prévia do painel no site sem IDs do Discord (menções viram nomes; sem foto/ID do bot)', 'prévia do painel expõe IDs do Discord')
  // Várias hierarquias: criar com Zod, limitador e teto; ID da rota conferido; excluir só extra e só a mensagem do próprio painel
  check(/router\.post\('\/paineis', requireAuth, requireArea\('hierarquia', 'editar'\), hierarquiaLimiter, validateBody\(novaHierarquiaSchema\)/.test(hierRotas)
    && /router\.put\('\/paineis\/:id', requireAuth, requireArea\('hierarquia', 'editar'\), hierarquiaLimiter, validateBody\(hierarquiaSchema\)/.test(hierRotas)
    && /router\.delete\('\/paineis\/:id', requireAuth, requireArea\('hierarquia', 'editar'\), hierarquiaLimiter/.test(hierRotas)
    && /extras\.length >= MAX_PAINEIS_EXTRAS/.test(hierRotas) && /String\(id\) !== bruto/.test(hierRotas)
    && /if \(id === 0\) \{ res\.status\(400\)/.test(hierRotas) && /apagarMensagem\(cfg, h\.canalId, h\.mensagemId\)/.test(hierRotas)
    && /if \(!h2\) \{ esquecerPainel\(pid\); await apagarMensagem\(cfg, atual\.canalId, id\)/.test(hierTs),
    'várias hierarquias: criar com Zod/limitador/teto, ID conferido, excluir só extra e só a própria mensagem', 'hierarquias extras sem validação/limite ou apagando mensagem alheia')
  // Auditoria 2026-10-29: anexo só do próprio registro; aprovação pelo Discord presa ao poder de quem aprova;
  // patente nunca escolhida no cadastro; readmissão só admin; foto do Discord sem IDs na saída
  {
    const arqTs = ler('src/routes/arquivos.ts'), authTs = ler('src/routes/auth.ts'), membrosTs = ler('src/routes/membros.ts')
    check(/if \(!m\.expiraEm && !doRegistro\.has\(id\)\) return null/.test(arqTs)
      && ['boletins', 'inqueritos', 'relatorios'].every(a => new RegExp(`conferirArquivos\\(body\\.arquivos, '${a}', \\w+\\.arquivos\\.map\\(a => a\\.id\\)\\)`).test(ler(`src/routes/${a}.ts`))),
      'anexo só do próprio registro (não dá para apagar arquivo de outro registro citando o ID)', 'registro aceita anexo de outro registro')
    check(/const r = await aprovarPedido\(solId, \{ por: nome, podeAtribuir \}\)/.test(setagemSrc) && /podeAtribuirCargo\(aprovador, cargo, d\)/.test(setagemSrc)
      && /cargoSimples\(c\) && palavras\(c\.nome\) === palavras\(p\.nome\)/.test(ler('src/data.ts')),
      'aprovar set no Discord: cargo do site com admin/editar só se quem aprova pode atribuí-lo; ligação automática só a cargo simples', 'aprovação pelo Discord dá cargo acima do poder de quem aprova')
    check(/body\.patenteInterna = conta\.cadastroSetagem\?\.patente \|\| membro\?\.patenteInterna/.test(authTs)
      && /Só um administrador pode retirar uma exoneração/.test(membrosTs),
      'cadastro inicial não deixa escolher a patente; retirar exoneração só admin', 'patente escolhida no cadastro ou readmissão sem ser admin')
    const publicTs = ler('src/routes/public.ts'), fotoTs = ler('src/fotoPublica.ts')
    check(/avatar: fotoSemIds\(m\.id, safeAvatar/.test(ler('src/modules/ranking/service.ts')) && /avatarAtual: fotoSemIds\(m\.id, avatarAtual\(conta\)\)/.test(membrosTs)
      && /ehDoDiscord\(url\) \? `\/api\/public\/foto\/\$\{chaveDaFoto\(membroId\)\}`/.test(fotoTs) && /createHmac\('sha256', segredoFoto\(\)\)/.test(fotoTs) && /\.env\.JWT_SECRET\)/.test(fotoTs)
      && /router\.get\('\/foto\/:chave'[\s\S]{0,200}\/\^\[A-Za-z0-9_-\]\{22\}\$\//.test(publicTs),
      'foto do Discord sai como link opaco do site (sem ID do servidor/pessoa)', 'URL do CDN do Discord (com IDs) exposta')
  }
  // Carga: ritmo das chamadas ao Discord (≤40/s, ≤8 simultâneas, respeita o limite por rota e o 429 global)
  check(/const MAX_POR_SEGUNDO = 40\b/.test(discordTs) && /const MAX_SIMULTANEAS = 8\b/.test(discordTs)
    && /if \(daApi && !\(await aguardarVez\(rota\)\)\) return new Response\(null, \{ status: 429 \}\)/.test(discordTs)
    && /x-ratelimit-remaining/.test(discordTs) && /x-ratelimit-global/.test(discordTs)
    && /const consultandoMembro = new Map/.test(discordTs) && /MAX_BYTES_FOTOS = 40 \* 1024 \* 1024/.test(discordTs),
    'Discord: ritmo controlado (40/s, 8 simultâneas, limite por rota/429 global) e caches com teto', 'chamadas ao Discord sem controle de ritmo/cache')
  {
    const indexTs = ler('src/index.ts')
    check(/process\.on\('unhandledRejection'/.test(indexTs) && /process\.once\('uncaughtException'[\s\S]{0,200}closeData\(\)/.test(indexTs),
      'erro inesperado não derruba o site; erro fatal grava os dados antes de sair', 'sem proteção contra promessa rejeitada/erro fatal')
  }
  // Protocolo: trocar o livro só com "editar"; link só de flipbook do Heyzine (único embed liberado na CSP)
  const protRotas = ler('src/routes/protocolo.ts')
  check([...protRotas.matchAll(/router\.(get|post|put|patch|delete)\([^\n]*/g)].every(m => /requireAuth, requireArea\('protocolo', '(ver|editar)'\)/.test(m[0]))
    && /router\.put\('\/', requireAuth, requireArea\('protocolo', 'editar'\), hierarquiaLimiter, validateBody\(protocoloSchema\)/.test(protRotas)
    && /router\.post\('\/publicar', requireAuth, requireArea\('protocolo', 'editar'\), hierarquiaLimiter/.test(protRotas)
    // Painel: só a mensagem do próprio bot; botão é LINK (style 5) para o livro já validado; rodapé padrão; sem ID da mensagem na saída
    && /\{ type: 2, style: 5, label: 'Abrir o protocolo', url: p\.flipbook/.test(ler('src/protocoloPainel.ts')) && /rodapeV2\(/.test(ler('src/protocoloPainel.ts'))
    && /publicarV2\(cfg, p\.canalId, p\.mensagemId,/.test(ler('src/protocoloPainel.ts')) && !/mensagemId: p\.mensagemId/.test(protRotas)
    && /erroDasImagens\(imagens, p => \['topo', 'titulo', 'passos', 'botao', 'fim'\]\.includes\(p\)\)/.test(protRotas)
    && ler('src/middleware/validate.ts').includes('export const FLIPBOOK_HEYZINE = /^https:\\/\\/heyzine\\.com\\/flip-book\\/[A-Za-z0-9_-]{3,80}(\\.html)?$/')
    && /frameSrc:\s+\["'self'", 'https:\/\/heyzine\.com'\]/.test(ler('src/middleware/securityHeaders.ts')),
    'protocolo: trocar o livro exige editar; só flipbook https do Heyzine (CSP sem outros frames)', 'protocolo aceita outro site no iframe ou sem permissão')
  // Imagens soltas nos painéis: até 4, posição conhecida, upload conferido pelos bytes ou link http/https (nas duas rotas)
  check(/if \(imagens\.some\(i => !\(i\.url\.startsWith\('data:'\) \? imagemEnviada\(i\.url\) : ehLinkImagem\(i\.url\)\)\)\)/.test(hierTs)
    && /export const MAX_IMAGENS_PAINEL = 4/.test(hierTs) && /imagens\.slice\(0, MAX_IMAGENS_PAINEL\)/.test(hierTs)
    && /const erroImagens = erroDasImagens\(imagens,/.test(hierRotas) && /const erroImagens = erroDasImagens\(imagens,/.test(ler('src/routes/setagem.ts'))
    && /posicao: z\.string\(\)\.regex\(\/\^\(topo\|titulo\|passos\|texto\|botao\|fim\|cargo:\\d\{17,20\}\)\$\//.test(ler('src/middleware/validate.ts'))
    && /posicao: `bloco:\$\{n\}`/.test(hierRotas),
    'imagens soltas dos painéis: até 4, posição validada, bytes/protocolo conferidos; prévia sem ID do cargo', 'imagem solta de painel sem validação')
  check(!/console\.(log|warn|error)\([^)]*(botToken|clientSecret|accessToken)/.test(discordTs), 'tokens do Discord nunca vão para o log', 'token do Discord logado')
  check(!/\/api\/mensagens/.test(ler('src/index.ts')), 'rota antiga do bot (mensagens) removida', 'rota antiga do bot ainda montada')
  // Carteirinha no fórum: só quem edita a área; PNG conferido pelos bytes; ID do tópico nunca sai da API
  const cartRotas = ler('src/routes/carteira.ts')
  check([...cartRotas.matchAll(/router\.(get|post|put|patch|delete)\([^\n]*/g)].every(m => /requireAuth, requireArea\('carteira', '(ver|editar)'\)/.test(m[0])
      && (/requireArea\('carteira', 'editar'\)/.test(m[0]) || /router\.get\('\/(membros|foto\/:membroId)'/.test(m[0])))
    && /router\.post\('\/postar', requireAuth, requireArea\('carteira', 'editar'\), hierarquiaLimiter, validateBody\(carteiraPostarSchema\)/.test(cartRotas)
    && /dados\.subarray\(0, 8\)\.equals\(PNG\)/.test(cartRotas) && /dados\.length <= MAX_PNG/.test(cartRotas)
    && !/res\.json\([^)]*(topicoId|discordThreadId)/.test(cartRotas),
    'carteirinha no fórum: editar a área, PNG conferido, sem expor o tópico', 'rota da carteirinha sem permissão/validação ou expõe o tópico')
  // Fotos: qualquer imagem/PDF é convertida no navegador; logo só PNG/JPEG/WEBP conferido (sem SVG)
  const validateLogo = ler('src/middleware/validate.ts')
  const logoBloco = validateLogo.slice(validateLogo.indexOf('export const logoSchema'), validateLogo.indexOf('export const logoSchema') + 400)
  const fotoFe = ler('../frontend/src/lib/imagemArquivo.ts')
  check(!/svg|<svg/i.test(logoBloco.replace(/\/\/[^\n]*/g, '')) && ler('src/routes/config.ts').includes('if (!imagemEnviada(logo, 2 * 1024 * 1024))')
    && fotoFe.includes('isEvalSupported: false') && fotoFe.includes('enableXfa: false') && fotoFe.includes("canvas.toDataURL(formato, qualidade)"),
    'fotos: PDF/qualquer imagem convertidos no navegador (pdf.js sem eval); logo só PNG/JPEG/WEBP conferido', 'logo aceita SVG ou PDF/imagem sem conversão')
  // Logs: área própria; saída sem IDs (Discord/conta) nem IP; avatar por chave opaca; registro do Discord só lido (GET)
  const logsTs = ler('src/logs.ts')
  const logsRotas = ler('src/routes/logs.ts')
  const saidaLogs = logsTs.slice(logsTs.indexOf('export function listarLogs'), logsTs.indexOf('export function categoriasDosLogs'))
  check([...logsRotas.matchAll(/router\.(get|post|put|patch|delete)\([^\n]*/g)].every(m => /requireAuth, requireArea\('logs', 'ver'\)/.test(m[0]) && m[1] === 'get')
    && /ator: \{ nome: e\.ator\.nome, avatar: chaveAvatar\(e\.ator\) \}/.test(saidaLogs) && !/discordId|contaId:|\bip\b/.test(saidaLogs)
    && /createHmac\('sha256', SEGREDO_AVATAR\)/.test(logsTs) && /\/\^\[A-Za-z0-9_-\]\{22\}\$\//.test(logsRotas) && /baixarFotoDiscord\(url\)/.test(logsRotas)
    && /audit-logs\?limit=100`, comBot\(cfg\)\)/.test(discordTs) && /criptografar\(texto, AAD\)/.test(logsTs) && /MAX_ENTRADAS = 5000/.test(logsTs)
    && /try \{ ouvinte\?\.\(event, req, entry\.detail \? redact\(entry\.detail\) : null\) \} catch/.test(ler('src/security/audit.ts')),
    'logs: área "logs", só leitura, sem IDs/IP na saída, avatar opaco, arquivo cifrado e com teto', 'logs expõem IDs/IP, sem área própria ou registro do Discord com escrita')
  // Solicitações no site: refazer/recusar pedido de set só admin, Zod, motivo sem menções
  const cfgRotas = ler('src/routes/config.ts')
  check(cfgRotas.includes("router.post('/solicitacoes-acesso/:id/corrigir', requireAuth, adminOnly, hierarquiaLimiter, validateBody(corrigirAcessoSchema)")
    && cfgRotas.includes("router.delete('/solicitacoes-acesso/:id', requireAuth, adminOnly, validateBody(reprovarAcessoSchema)")
    && (cfgRotas.match(/\.replace\(\/\[@`\]\/g, ''\)/g) || []).length >= 2,
    'solicitações: refazer/recusar pedido de set só por admin, com Zod e motivo sem menções', 'refazer/recusar pedido sem admin/Zod ou com menção no privado')
  // Sigla do sistema anterior nunca escrita no código (migração usa SIGLA_ANTIGA montada por partes)
  const sigla = String.fromCharCode(78) + 'PD'
  check(!arquivosSrc.some(([, txt]) => txt.includes(sigla)) && ler('src/data.ts').includes('export const SIGLA_ANTIGA = String.fromCharCode(78)'),
    'nenhuma sigla do sistema anterior escrita no código (migração montada por partes)', 'sigla do sistema anterior escrita no código')
  // Vínculo conta ↔ efetivo: nunca reativa exonerado, conta desativada ou sem aprovação
  const setagemVinc = ler('src/setagem.ts')
  check(setagemVinc.includes('if (conta.exonerado || !conta.ativo || !conta.cargoPermId) continue'),
    'vínculo conta ↔ efetivo ignora exonerados, desativados e não aprovados', 'vínculo ao efetivo pode reativar exonerado')
  // Carteirinha menciona só o dono dela (nunca @everyone/cargos)
  check(discordTs.includes("allowed_mentions: marcado ? { parse: [], users: [marcado] } : { parse: [] }") && discordTs.includes("mencionar && ehSnowflake(mencionar)"),
    "carteirinha no fórum menciona só o dono (sem @everyone/cargos)", "post da carteirinha pode mencionar além do dono")
  // Tópico escolhido à mão: precisa ser do fórum configurado (conferido no Discord) e nunca cria outro no lugar
  check(cartRotas.includes('if (!topicos.some(t => t.id === topicoId))') && discordTs.includes('t.parent_id === forumId')
    && discordTs.includes('if (soNoTopico) return') && cartRotas.includes('if (!topicoId && alvo'),
    'carteirinha: tópico escolhido só do fórum configurado, sem criar outro e sem trocar o do membro', 'carteirinha posta em canal vindo do navegador sem conferir')
  // Preenchimento automático: lista branca sem IDs/links; foto só data URL conferida ou avatar do CDN do Discord (sem SSRF)
  const listaCart = cartRotas.slice(cartRotas.indexOf("router.get('/membros'"), cartRotas.indexOf("router.get('/foto"))
  check(listaCart.length > 0 && !/discordId:|discordThreadId:|avatar:|foto:|\.\.\.m\b|\.\.\.conta/.test(listaCart)
    && cartRotas.includes('imagemEnviada(foto, 4 * 1024 * 1024)') && cartRotas.includes('baixarFotoDiscord(foto)')
    && discordTs.includes('if (!URL_FOTO_DISCORD.test(url)) return Promise.resolve(undefined)')
    && discordTs.includes('const URL_FOTO_DISCORD = /^https:\\/\\/cdn\\.discordapp\\.com\\/'),
    'carteirinha automática: lista sem IDs/links e foto só do site ou do CDN de avatar do Discord', 'carteirinha automática expõe dados ou baixa link qualquer')
}

// Resultado
const acoesTs = ler('src/routes/acoes.ts')
check(/const autor = data\.contas\.find\(c => c\.id === req\.user!\.contaId\)/.test(acoesTs) &&
  /comandante: responsavel/.test(acoesTs) && !/comandante: body\.comandante/.test(acoesTs),
  'responsável da apreensão definido pela sessão', 'cliente pode forjar responsável da apreensão')

console.log('\n[Dono] Conta dona')
const accessExtTs = ler('src/access.ts')
check(/export function ehDono\(conta: Conta\): boolean \{\s*return conta\.id === PROTECTED_OWNER_ID\s*\}/.test(accessExtTs),
  'dono é só a conta 1 (nenhum ID externo vira dono)', 'dono definido por algo além da conta 1')
{
  const dataDono = ler('src/data.ts')
  check(!/bcrypt|password|SENHA_PADRAO/.test(dataDono) && /DISCORD_DONO_ID/.test(dataDono),
    'conta dona sem senha: entra só pelo Discord (DISCORD_DONO_ID)', 'conta dona ainda tem senha padrão')
  const discordDono = ler('src/discord.ts')
  check(/if \(discordId === cfg\.donos\[0\]\) return data\.contas\.find\(c => c\.id === PROTECTED_OWNER_ID\)/.test(discordDono)
    && /c\.id !== PROTECTED_OWNER_ID && c\.discordId === discordId/.test(discordDono),
    'só o 1º ID de DISCORD_DONO_ID entra na conta dona (discordId gravado não basta)', 'outro Discord pode entrar na conta dona')
  // Fora do servidor: SÓ os (no máx. 2) donos do .env — nenhuma outra lista libera acesso
  check(/export const MAX_DONOS = 2\b/.test(discordDono) && /\.slice\(0, MAX_DONOS\)/.test(discordDono)
    && /return cfg\.donos\.includes\(discordId\)/.test(discordDono) && !/process\.env\.DISCORD_ACESSO_LIVRE|e\.DISCORD_ACESSO_LIVRE\)/.test(discordDono)
    && /no máximo 2 IDs/.test(ler('src/config/env.ts')),
    'só até 2 donos entram sem estar no servidor (mais que 2 derruba o boot)', 'mais pessoas podem entrar sem estar no servidor')
}

console.log('\n[ADV] Advertências')
{
  const mem = ler('src/routes/membros.ts')
  const del = mem.slice(mem.indexOf("router.delete('/:id/advertencia/:nivel'"), mem.indexOf("router.delete('/:id/advertencia/:nivel'") + 900)
  check(/requireAuth, requireArea\('membros', 'editar'\)/.test(del) && /podeGerenciar\(/.test(del) && /nivel !== 1 && nivel !== 2 && nivel !== 3/.test(del),
    'retirar ADV exige editar membros, hierarquia e nível válido', 'retirar ADV sem permissão/hierarquia/validação')
  check(!/\bdata\.cargosAdv/.test(ler('src/routes/public.ts')) && !/\bdata\.cargosAdv/.test(mem),
    'IDs dos cargos de ADV não saem em rotas públicas nem na lista de membros', 'IDs dos cargos de ADV expostos')
}

console.log('\n[Registro] Tópico/canal do registro no Discord')
{
  const mem = ler('src/routes/membros.ts')
  check(/discordThreadId: _t, registroCanal: _r, \.\.\.publico/.test(mem),
    'lista de membros não expõe discordThreadId nem registroCanal', 'membros expõem IDs do Discord')
  check(/discordThreadId: _t, registroCanal: _r, \.\.\.membroPublico/.test(ler('src/routes/auth.ts')),
    'edição do próprio perfil não devolve IDs do Discord', 'perfil devolve IDs do Discord')
}

console.log('\n[QRU] Tipo convencional × fechado')
{
  const cfg = ler('src/routes/config.ts')
  check(/router\.put\('\/qrus\/tipo', requireAuth, requireArea\('configuracoes', 'editar'\), validateBody\(tipoQruSchema\)/.test(cfg),
    'trocar tipo do QRU exige editar configurações + Zod', 'troca de tipo do QRU sem permissão/Zod')
  check(/router\.get\('\/qrus\/tipos', requireAuth, requireAprovado/.test(cfg),
    'tipos de QRU só para conta aprovada', 'tipos de QRU sem autenticação')
  check(/qrusFechados\?\.includes\(nome\)/.test(ler('src/qrus.ts')),
    'tipo guardado em lista (sem objeto indexado pelo nome → sem __proto__)', 'tipo de QRU indexado pelo nome')
  const ac = ler('src/routes/acoes.ts')
  check(/tipoDoQru\(data, body\.qru\) !== body\.tipo/.test(ac) && /comandante: responsavel/.test(ac),
    'apreensão só com QRU existente do tipo certo; responsável = conta logada', 'apreensão aceita QRU/responsável de fora')
  check(/function acaoPublica/.test(ac) && !/res\.(status\(\d+\)\.)?json\((novaAcao|acao)\)/.test(ac),
    'apreensões saem da API sem discordId dos participantes', 'apreensão devolvida crua (discordId de participante)')
}

console.log('\n[Ranking] Histórico de rankings')
{
  const pub = ler('src/routes/public.ts')
  const trecho = pub.slice(pub.indexOf("router.get('/ranking-historico'"), pub.indexOf("router.get('/ranking-historico'") + 900)
  check(/linhas\.map\(l => \(\{ nome: l\.nome, total: l\.total \}\)\)/.test(trecho) && !/discordId|passaporte/.test(trecho),
    'histórico público só com nome e total (lista branca)', 'histórico público expõe passaporte/discordId')
}

console.log('\n[Termos] Aceite dos termos de uso')
const authTs = ler('src/routes/auth.ts')
check(/router\.post\('\/me\/termos', requireAuth, validateBody\(termosAceiteSchema\)/.test(authTs),
  'aceite dos termos exige login e corpo validado por Zod', 'aceite dos termos sem requireAuth/Zod')
const aceiteTs = authTs.slice(authTs.indexOf("router.post('/me/termos'"))
check(/c\.id === req\.user!\.contaId/.test(aceiteTs.slice(0, 900)) && !/req\.body[^\n]*contaId/.test(aceiteTs.slice(0, 900)),
  'aceite grava só na conta da sessão', 'aceite pode gravar em outra conta')
check(/versao !== TERMOS_VERSAO/.test(aceiteTs) && /audit\('TERMOS_ACEITOS'/.test(aceiteTs),
  'aceite só da versão vigente e auditado', 'aceite de versão antiga ou sem auditoria')
// A versão vigente precisa passar na validação do aceite (senão ninguém consegue aceitar)
const versaoTermos = (ler('src/termos.ts').match(/TERMOS_VERSAO = '([^']+)'/) || [])[1]
const regexAceite = (ler('src/middleware/validate.ts').match(/termosAceiteSchema = z\.object\(\{ versao: z\.string\(\)\.regex\(\/(.+?)\/\)/) || [])[1]
const versaoFront = (fs.existsSync(path.join(REPO, 'frontend/src/content/termos.ts'))
  ? fs.readFileSync(path.join(REPO, 'frontend/src/content/termos.ts'), 'utf8') : '').match(/versao: '([^']+)'/)?.[1]
check(versaoTermos && regexAceite && new RegExp(regexAceite).test(versaoTermos) && versaoFront === versaoTermos,
  'versão dos termos válida e igual no backend e no frontend', 'versão dos termos inválida ou diferente entre backend e frontend')
const termoFront =fs.existsSync(path.join(REPO, 'frontend/src/components/ui/TermoAceite.tsx'))
  ? fs.readFileSync(path.join(REPO, 'frontend/src/components/ui/TermoAceite.tsx'), 'utf8') : ''
check(termoFront && !/localStorage\.setItem\([^)]*token/i.test(termoFront),
  'popup de termos não guarda token no navegador', 'popup de termos ausente ou guarda token')
console.log('\n[Público] Devs e presença na tela inicial')
const publicTs = ler('src/routes/public.ts')
const rankingRouterTs = ler('src/modules/ranking/router.ts')
const chamadasPublicas = publicTs.match(/snapshot\([^()]*\)/g) || []
check(chamadasPublicas.length > 0 && chamadasPublicas.every(c => c.endsWith(', true)'))
  && /createRankingRouter\(true\)/.test(index) && /snapshot\(res\.locals\.filters\.period, publicView\)/.test(rankingRouterTs)
  && !/snapshot\(res\.locals\.filters\.period\)/.test(rankingRouterTs),
  'rotas públicas usam o snapshot público (dev fora do ranking)', 'rota pública usa o snapshot do painel')
check(/if \(!row \|\| devs\.has\(id\)\) continue/.test(ler('src/modules/ranking/service.ts')),
  'dev não pontua no ranking público', 'dev pontua no ranking público')
check(/online: null/.test(ler('src/modules/ranking/service.ts')),
  'sem bot: presença nunca é exposta (online null)', 'presença exposta sem bot')
console.log('\n[Anúncio] Foto enviada com link público')
const anuncioImgTs = ler('src/routes/anuncioImagem.ts')
check(/uploadRouter\.post\('\/imagem', requireAuth, requireArea\('anuncio', 'editar'\), validateBody\(anuncioImagemSchema\)/.test(anuncioImgTs),
  'envio de foto exige login, área anuncio/editar e Zod', 'envio de foto sem requireAuth/requireArea/Zod')
check(/confere: \(b: Buffer\)/.test(anuncioImgTs) && /TIPOS\[ext\]\.confere\(bytes\)/.test(anuncioImgTs) && !/svg/i.test(anuncioImgTs),
  'foto conferida pelos bytes (sem SVG)', 'foto aceita sem conferir os bytes ou aceita SVG')
check(/randomBytes\(18\)/.test(anuncioImgTs) && /'X-Content-Type-Options', 'nosniff'/.test(anuncioImgTs) && /sandbox/.test(anuncioImgTs),
  'link da foto com ID aleatório, nosniff e CSP sandbox', 'link da foto previsível ou sem nosniff/sandbox')
check(/app\.use\('\/img', anuncioImagemPublica\)/.test(index) && /anuncio\\\/imagem/.test(index),
  'foto pública fora de /api e envio no limite de upload', 'rota da foto fora do lugar ou sem uploadLimiter')
console.log('\n[Avisos] Saída campo a campo')
check(/\.map\(\(\{ id, titulo, mensagem, autor, criadoEm \}\)/.test(ler('src/routes/avisos.ts')),
  'avisos listados campo a campo (sem IDs do Discord)', 'avisos saem crus (com IDs do Discord)')
console.log('\n[DU] Relatórios, Boletins, Inquéritos, Galeria e arquivos')
const arquivosTs = ler('src/routes/arquivos.ts')
// Corpo até 50 MB (vídeo da árvore); por tipo: 10 MB (vídeo só na árvore, até 50 MB e 1 minuto)
// Permissão conferida ANTES do express.raw (não recebe 50 MB de quem não pode enviar)
check(/router\.post\('\/', requireAuth,[\s\S]{0,400}contaPode\(peekData\(\), req\.user!\.contaId, area, 'editar'\)[\s\S]{0,200}next\(\)\s*\},\s*\n\s*express\.raw\(\{ type: 'application\/octet-stream', limit: MAX_BYTES_VIDEO \}\)/.test(arquivosTs)
  && arquivosTs.includes("if (bytes.length > (area === 'arvore' && tipo.video ? MAX_BYTES_VIDEO : MAX_BYTES_ARQUIVO)) { res.status(413)")
  && /contaPode\(peekData\(\), req\.user!\.contaId, area, 'editar'\)/.test(arquivosTs) && /AREAS_ARQUIVO\.includes\(area\)/.test(arquivosTs),
  'envio de arquivo exige login, área/editar e limite de tamanho', 'envio de arquivo sem login/permissão/limite')
check(/tipo\.confere\(bytes\)/.test(arquivosTs) && !/svg|html?['"]/i.test(arquivosTs.slice(arquivosTs.indexOf('const TIPOS'), arquivosTs.indexOf('function limparNome'))),
  'arquivo conferido pelos bytes (sem SVG/HTML)', 'arquivo aceito sem conferir bytes ou aceita SVG/HTML')
check(/router\.get\('\/:id', requireAuth/.test(arquivosTs) && /contaPode\(peekData\(\), req\.user!\.contaId, doc\.area, 'ver'\)/.test(arquivosTs)
  && /'X-Content-Type-Options', 'nosniff'/.test(arquivosTs) && /sandbox/.test(arquivosTs) && /randomBytes\(18\)/.test(arquivosTs),
  'download exige login + ver a área; ID aleatório, nosniff e CSP sandbox', 'download de arquivo sem permissão ou sem nosniff/sandbox')
check(/export function limparArquivosPendentes/.test(arquivosTs) && /meta\.expiraEm && Date\.parse\(meta\.expiraEm\) < agora\) pasta\.apagar/.test(arquivosTs)
  && /delete m\.expiraEm/.test(arquivosTs),
  'arquivo não vinculado é apagado pela limpeza periódica', 'arquivos órfãos nunca expiram')

console.log('\n[Dados] Armazenamento: memória + arquivo + MongoDB opcional (pedido do usuário, 2026-10-29)')
{
  const arm = ler('src/armazenamento.ts')
  const dataTs = ler('src/data.ts')
  const revogTs = ler('src/security/tokenBlacklist.ts')
  const bancoTs = ler('src/bancoDados.ts'), envTs = ler('src/config/env.ts')
  // Driver do MongoDB só em bancoDados.ts; documento vai compactado E cifrado; URI nunca no código/log
  const comMongo = []
  const varrerMongo = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) varrerMongo(p); else if (/\.ts$/.test(e.name) && /from 'mongodb'/.test(fs.readFileSync(p, 'utf8'))) comMongo.push(path.relative(ROOT, p).replace(/\\/g, '/'))
  } }
  varrerMongo(path.join(ROOT, 'src'))
  check(comMongo.length === 1 && comMongo[0] === 'src/bancoDados.ts' && /const uri = process\.env\.MONGODB_URI\?\.trim\(\)/.test(bancoTs)
    && !/mongodb(\+srv)?:\/\/[^\s'"`]*@/.test(bancoTs + dataTs + envTs),
    'MongoDB só em bancoDados.ts, URI só do .env (nunca no código)', 'MongoDB usado fora do módulo ou URI no código')
  check(/criptografiaDisponivel\(\)\s*\n?\s*\? \{ conteudo: criptografar\(gz, AAD\), formato: 'gzip\+aes'/.test(bancoTs) && /descriptografar\(doc\.conteudo, AAD\)/.test(bancoTs)
    && /Com MONGODB_URI, DATA_ENCRYPTION_KEY é obrigatória/.test(envTs),
    'dados no banco cifrados (AES-256-GCM) e compactados; chave obrigatória em produção', 'dados vão para o banco sem cifra')
  check(/MONGODB_URI sem TLS/.test(envTs) && /MONGODB_URI sem usuário e senha/.test(envTs) && /tlsAllowInvalidCertificates/.test(envTs)
    && /mongodb\(\?:\\\+srv\)\?:\\\/\\\/\[\^\\s\]\+\/gi, '\[REDACTED_DATABASE_URI\]'/.test(ler('src/security/redact.ts')),
    'conexão com o banco: TLS + usuário/senha em produção, certificado sempre verificado, URI apagada dos logs', 'conexão com o banco sem TLS/credenciais ou URI no log')
  check(/if \(cofre && doBanco === undefined\) \{[\s\S]{0,300}criarBackup\(\)/.test(dataTs) && /gravarAgora\(true\)   \/\/ reserva local igual ao banco/.test(dataTs),
    'primeira importação para o banco com backup cifrado; arquivo local segue como reserva', 'importação para o banco sem backup')
  check(/renameSync\(tmp, destino\)/.test(arm) && /mode: 0o600/.test(arm),
    'gravação atômica (temporário + rename) e arquivo só do dono (0600)', 'gravação de dados não atômica ou com permissão aberta')
  check(arm.includes('const ID_SEGURO = /^[A-Za-z0-9_-]{24}$/') && arm.includes("if (!ID_SEGURO.test(id)) throw"),
    'caminho de arquivo só com ID gerado pelo servidor (sem path traversal)', 'caminho de arquivo montado com texto livre')
  check(/const salvo = doBanco !== undefined \? JSON\.parse\(doBanco\) as Partial<DuData> : lerJson<Partial<DuData>>\(DATA_PATH\)/.test(dataTs) && !/catch \{\s*return JSON\.parse\(JSON\.stringify\(DEFAULT_DATA/.test(dataTs),
    'arquivo de dados corrompido não é sobrescrito com o padrão', 'arquivo corrompido pode ser zerado em silêncio')
  const gi = fs.readFileSync(path.join(REPO, '.gitignore'), 'utf8')
  check(['backend/data.json', 'backend/arquivos/', 'backend/anuncio-imagens/', 'backend/sessoes-revogadas.json'].every(p => gi.includes(p)),
    'dados locais fora do git', 'dados locais podem ser versionados')
  check(/const hash = hashIdentificador\(jti\)\n\s*guardar\(hash, expiresAt\)/.test(revogTs.replace(/\r\n/g, '\n')) && /JSON\.stringify\(\[\.\.\.blacklist\]/.test(revogTs),
    'sessões revogadas gravadas só como hash do jti', 'jti gravado em texto')
}
check(/app\.use\('\/api\/arquivos', \(req, res, next\) => \(req\.method === 'POST' \? arquivoLimiter/.test(index),
  'envio de arquivo com limitador próprio', 'envio de arquivo sem limitador')
// Árvore de investigação: área "arvore" em toda rota; escrita com Zod; fotos só arquivo da área ou link http/https
{
  const src = ler('src/routes/arvores.ts')
  const rotas = src.match(/router\.(get|post|put|patch|delete)\([^\n]+/g) || []
  check(rotas.length >= 12 && rotas.every(r => r.includes('requireAuth') && r.includes("requireArea('arvore'"))
    && rotas.filter(r => /router\.(post|put|patch)/.test(r)).every(r => r.includes('validateBody('))
    && rotas.filter(r => /router\.(post|put|patch|delete)/.test(r)).every(r => r.includes("requireArea('arvore', 'editar')"))
    && src.includes("conferirArquivos(ids, 'arvore', jaDoCard)") && !/contaId: m\.contaId/.test(src)
    && ler('src/middleware/validate.ts').includes("refine(ehLinkImagem, 'Link de imagem inválido (use http/https)')")
    && /noArvoreParcialSchema = z\.object\(camposNo\)\.partial\(\)/.test(ler('src/middleware/validate.ts')),
    'árvore: área própria, Zod, fotos conferidas (arquivo da área ou http/https), parcial sem apagar campos', 'rota da árvore sem área/Zod ou foto sem conferir')
  // Chat: link vira foto guardada copiada pelo NAVEGADOR (backend nunca busca link); fotos só saem junto com a árvore
  const fe = ler('../frontend/src/lib/imagemArquivo.ts')
  check(!['fetch(', 'axios', 'chamar(', 'https.get(', 'http.get('].some(t => src.includes(t)) && !src.includes('mensagens.splice(')
    && src.includes("arquivosDe(arvore.mensagens.map(m => (m.anexo && !('video' in m.anexo) ? m.anexo : null)))")
    && fe.includes("i.crossOrigin = 'anonymous'") && fe.includes('export async function arquivoDoLink'),
    'árvore: imagem de link copiada pelo navegador (sem SSRF); fotos do chat só saem ao apagar a árvore', 'árvore busca link no backend ou apaga foto do chat antes da hora')
  // Privacidade: toda árvore aberta por id passa por podeAcessar (404 a quem não participa); lista filtrada; só criador/admin escolhe pessoas
  check(src.includes("if (!arvore || !podeAcessar(data, req.user!.contaId, arvore)) { res.status(404)")
    && src.includes('lista(data).filter(a => podeAcessar(data, req.user!.contaId, a))')
    && src.includes("if (!podeGerenciar(data, req.user!.contaId, arvore)) { res.status(403)")
    && src.includes('isAdmin(conta, data) || !a.participantes || a.participantes.includes(contaId)')
    && src.split('carregar(req, res)').length - 1 >= 9,
    'árvore privada: só participantes (e admins) veem e mexem; só criador/admin escolhe as pessoas', 'árvore privada acessível por quem não participa')
  // Vídeo: duração lida dos bytes no servidor (até 1 min, 50 MB) e só na árvore; card só aceita imagem
  const arqTs = ler('src/routes/arquivos.ts')
  check(arqTs.includes('const segundos = duracaoMp4(bytes)') && arqTs.includes('segundos > MAX_SEGUNDOS_VIDEO + 0.5')
    && arqTs.includes('export const MAX_SEGUNDOS_VIDEO = 60') && arqTs.includes("if (area === 'arvore' && !tipo.imagem && !tipo.video)")
    && arqTs.includes("if (ext === 'mov' && area !== 'arvore')")
    && src.includes("if (refs.some(r => !r.mime.startsWith('image/') && !(aceitaVideo && r.mime.startsWith('video/')))) return null"),
    'vídeo: até 1 minuto (duração lida dos bytes), 50 MB, só na árvore; foto de card só imagem', 'vídeo sem limite de duração ou card aceitando vídeo')
}

for (const [arquivo, area, schema] of [
  ['relatorios', 'relatorios', 'relatorioSchema'], ['boletins', 'boletins', 'boletimSchema'],
  ['inqueritos', 'inqueritos', 'inqueritoSchema'], ['galeria', 'galeria', 'fotoGaleriaSchema'],
]) {
  const src = ler(`src/routes/${arquivo}.ts`)
  const rotas = src.match(/router\.(get|post|put|delete)\([^\n]+/g) || []
  check(rotas.length >= 4 && rotas.every(r => r.includes('requireAuth') && r.includes(`requireArea('${area}'`))
    && rotas.filter(r => /router\.(post|put)/.test(r)).every(r => r.includes(`validateBody(${schema})`)),
    `${arquivo}: toda rota com requireAuth + requireArea e escrita com Zod`, `${arquivo}: rota sem requireAuth/requireArea/Zod`)
  check(/function publico\(/.test(src) && !/res\.(status\(\d+\)\.)?json\((novo|nova|rel|bol|inq|foto)\)/.test(src) && !/autorContaId: [a-z]\.autorContaId/.test(src.slice(src.indexOf('function publico'), src.indexOf('function publico') + 600)),
    `${arquivo}: saída por DTO (sem autorContaId)`, `${arquivo}: devolve objeto cru do banco`)
  check(/conferirArquivos\(/.test(src) && /sincronizarArquivos\(/.test(src),
    `${arquivo}: anexos conferidos no banco antes de gravar`, `${arquivo}: confia nos anexos enviados pelo cliente`)
}
const relTs = ler('src/routes/relatorios.ts')
check(/r\.sigiloso \|\| envolvido\(r, conta\) \|\| canArea\(conta, data, 'relatorios_gestao', 'ver'\)/.test(relTs)
  && /\.filter\(r => podeVer\(r, conta, data\)\)/.test(relTs),
  'relatório sigiloso só para autor, citados e gestão', 'relatório sigiloso visível a todos')

console.log('\n[Auditoria] backups, alertas e validação')
{
  const authA = ler('src/routes/auth.ts')
  const envA = ler('src/config/env.ts')
  check(/if \(PROD && \(bruta === undefined \|\| bruta\.trim\(\) === ''\)\)/.test(envA),
    'DATA_ENCRYPTION_KEY obrigatória em produção', 'produção pode subir sem chave de criptografia')
  const bkp = ler('src/backupAutomatico.ts')
  check(/criptografar\(JSON\.stringify\(readData\(\)\), AAD\)/.test(bkp) && /MANTER = 14/.test(bkp) && /iniciarBackupAutomatico\(\)/.test(index),
    'backup automático diário criptografado com rotação', 'sem backup automático criptografado')
  const alertaTs = ler('src/security/alertas.ts')
  check(/u\.protocol === 'https:'/.test(alertaTs) && /redirect: 'error'/.test(alertaTs) && /redact\(mensagem\)/.test(alertaTs) && /JANELA_MS/.test(alertaTs),
    'alertas: webhook só https do .env, sem redirecionamento, texto redigido e com limite', 'alerta pode vazar dados ou virar SSRF/spam')
  check(/alertar\('firewall_ban'/.test(ler('src/security/firewall.ts')) && /alertar\('restauracao'/.test(ler('src/routes/config.ts')),
    'ban do firewall e restauração de backup geram alerta aos admins', 'eventos críticos sem alerta')
  for (const [rota, schema] of [["'/me/avatar'", 'avatarSchema'], ["'/me/banner'", 'bannerSchema'], ["'/me/membro'", 'vincularMembroSchema']]) {
    check(new RegExp(`router\\.put\\(${rota.replace(/\//g, '\\/')}, requireAuth,[^\\n]*validateBody\\(${schema}\\)`).test(authA),
      `${rota} validada por Zod`, `${rota} sem Zod`)
  }
}
console.log(`\n=== Resultado: ${passes} OK, ${failures} falha(s) ===\n`)
process.exit(failures > 0 ? 1 : 0)
