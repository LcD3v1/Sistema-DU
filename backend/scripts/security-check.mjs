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

console.log('\n=== FAST — Verificação de Segurança ===\n')

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
for (const k of ['DISCORD_CLIENT_SECRET']) {
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
check(/router\.post\('\/discord\/exchange', trocaLoginLimiter/.test(authRoutes), 'trocaLoginLimiter em /discord/exchange', 'rate limit ausente em /discord/exchange')
check(/router\.post\('\/sessao', sessaoLimiter/.test(authRoutes), 'sessaoLimiter em /sessao', 'rate limit ausente em /sessao')
check(/httpOnly: true, [^\n]*sameSite: 'strict'[^\n]*path: '\/api\/auth\/sessao'/.test(authRoutes), 'cookie de sessão httpOnly + SameSite=Strict', 'cookie de sessão sem httpOnly/SameSite=Strict')
for (const rota of ["'/discord'", "'/discord/callback'"]) {
  check(new RegExp(`router\\.(get|post)\\(${rota.replace(/[/]/g, '\\/')}, loginLimiter`).test(authRoutes), `loginLimiter em ${rota}`, `loginLimiter ausente em ${rota}`)
}
check(/router\.post\('\/restore',[^\n]*criticalLimiter/.test(ler('src/routes/config.ts')), 'criticalLimiter no restore', 'restore sem criticalLimiter')
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
check(authRoutes.includes('iguaisSeguro(browserState(req)'), 'state OAuth comparado em tempo constante', 'state OAuth sem comparação timing-safe')
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
  "auth.ts:router.get('/discord'", "auth.ts:router.get('/discord/callback'", "auth.ts:router.post('/discord/exchange'",
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

// 15. Postagem da carteirinha no Discord
console.log('\n[15] Postagem da carteira no Discord')
const cartTs = ler('src/routes/carteira.ts')
const idxTs  = ler('src/index.ts')
const formTs = ler('src/discord/forum.ts')

check(/requireArea\('carteira', 'ver'\)/.test(cartTs) && /requireArea\('carteira', 'editar'\)/.test(cartTs),
  'carteira: leitura exige ver e postagem exige editar', 'carteira sem requireArea correto')
check(/validateBody\(carteiraPostSchema\)/.test(cartTs), 'corpo da postagem validado por Zod', 'postagem de carteira sem Zod')
// O tópico vem do cliente: sem esta conferência dava para postar em qualquer canal do servidor
check(/topicoPertenceAoForum\(topicoId, forumId\)/.test(cartTs),
  'tópico conferido contra o fórum configurado', 'tópico de carteira aceito sem conferir o fórum')
check(/parent_id === forumId/.test(formTs), 'topicoPertenceAoForum compara o canal pai', 'conferência do fórum não compara parent_id')
check(/89504e470d0a1a0a/.test(cartTs), 'anexo conferido pela assinatura PNG', 'anexo da carteira aceito sem checar assinatura')
check(/MAX_PNG_BYTES/.test(cartTs), 'tamanho do anexo limitado', 'anexo da carteira sem limite de tamanho')
check(idxTs.includes('carteira\\/postar'), 'postagem da carteira sob o limitador de upload', 'carteira/postar fora das rotas de upload')
check(!/err\.message/.test(cartTs.replace(/console\.error[^\n]*/g, '')),
  'carteira devolve erro genérico ao cliente', 'carteira vaza err.message na resposta')
check(/audit\('CARTEIRA_POSTADA'/.test(cartTs), 'postagem da carteira auditada', 'postagem da carteira sem auditoria')

// Menção de membro do Discord na carteira
const identTs = ler('src/discord/identidade.ts')
check(/router\.get\('\/membros', requireAuth, requireArea\('carteira', 'editar'\)/.test(cartTs),
  'lista de membros do Discord exige permissão de editar', 'lista de membros exposta sem exigir editar')
// O painel recebe só o @; o discordId de terceiros fica no servidor
check(/export interface MembroMencionavel \{ usuario: string; nome: string; avatar: string \}/.test(identTs),
  'DTO de membro não tem discordId', 'DTO de membro do Discord expõe id')
check(/\.map\(semId\)/.test(cartTs), 'rota de membros filtra o id com semId', 'rota de membros devolve objeto cru')
check(/mencionarUsuario/.test(cartTs) && !/mencionarId/.test(cartTs),
  'menção referenciada pelo @, não pelo id', 'menção ainda usa discordId vindo do cliente')
// parse: [] impede @everyone/@here e menção de cargo
check(/return users\.length > 0 \? \{ parse: \[\], users \} : \{ parse: \[\] \}/.test(formTs),
  'allowed_mentions bloqueia everyone/here e cargos', 'allowed_mentions permite menção ampla')
check(/allowed_mentions: allowedMentions\(mencionarId \? \[mencionarId\] : \[\]\)/.test(formTs),
  'postagem da carteira só menciona o usuário escolhido', 'postagem da carteira sem trava de menção')

// 16. Painel de ranking de apreensões (botões do Discord)
console.log('\n[16] Painel de apreensões no Discord')
const painelTs = ler('src/discord/painelApreensoes.ts')
const gwTs = ler('src/discord/gateway.ts')

check(painelTs.length > 0, 'painelApreensoes.ts presente', 'ausente: src/discord/painelApreensoes.ts')
// O clique chega do Discord: a permissão tem de ser conferida no handler
const hb = gwTs.slice(gwTs.indexOf('Events.InteractionCreate'))
check(/canArea\(conta, dados, 'pendentes', 'editar'\)/.test(hb),
  'atualização do painel exige editar em Aprovações', 'atualização sem checagem de permissão')
check(/conta\.exonerado \|\| conta\.ativo === false/.test(hb),
  'exonerado bloqueado nos botões do painel', 'exonerado pode usar os botões do painel')
const posPerm = hb.indexOf('podeZerarRankings(conta, dados)')
const posReset = hb.indexOf('resetarRanking(')
check(posPerm > -1 && posReset > -1 && posPerm < posReset,
  'permissão conferida antes de resetar', 'reset executado antes da checagem de permissão')
check(/canArea\(conta, data, 'zerar_rankings', 'editar'\)/.test(ler('src/access.ts')),
  'reset usa permissão específica compartilhada', 'reset sem permissão específica')
const resetServico = painelTs.slice(painelTs.indexOf('export async function resetarRanking'))
check(resetServico.indexOf('!podeZerarRankings(conta, data)') >= 0 &&
  resetServico.indexOf('!podeZerarRankings(conta, data)') < resetServico.indexOf('writeData(data)'),
  'serviço de reset revalida autorização antes de gravar', 'serviço de reset permite contornar autorização')
check(/audit\('UNAUTHORIZED_ACCESS'/.test(hb), 'clique negado é auditado', 'clique negado sem auditoria')
check(/audit\('RANKING_APREENSOES_RESETADO'/.test(painelTs), 'reset do ranking é auditado', 'reset do ranking sem auditoria')
// O placar é editado o tempo todo: não pode notificar ninguém
check(/allowed_mentions: \{ parse: \[\] \}/.test(painelTs),
  'painel não notifica ninguém (allowed_mentions vazio)', 'painel pode notificar em massa')
// Resetar não apaga apreensão: só move a data de corte
check(/resetadoEmData/.test(painelTs) && !/splice|filter\(a => a\.id !==/.test(painelTs),
  'reset não apaga apreensões, só move o corte', 'reset do ranking apaga dados')

// Resultado
const acoesTs = ler('src/routes/acoes.ts')
check(/const autor = data\.contas\.find\(c => c\.id === req\.user!\.contaId\)/.test(acoesTs) &&
  /comandante: responsavel/.test(acoesTs) && !/comandante: body\.comandante/.test(acoesTs),
  'responsável da apreensão definido pela sessão', 'cliente pode forjar responsável da apreensão')

console.log('\n[Acesso externo] Dispensa do servidor do Discord')
const accessExtTs = ler('src/access.ts')
check(/DISCORD_ACESSO_EXTERNO/.test(accessExtTs) && /\^\\d\{17,20\}\$/.test(accessExtTs),
  'lista de acesso externo só aceita IDs numéricos do Discord', 'lista de acesso externo sem validação de ID')
check(!/dispensaServidor|discordIdsAcessoExterno/.test(ler('src/middleware/auth.ts')) &&
  !/discordIdsAcessoExterno|dispensaServidor/.test(accessExtTs.slice(accessExtTs.indexOf('export function ehDono'), accessExtTs.indexOf('export function ehDono') + 300)),
  'acesso externo não vira dono nem pula as checagens do requireAuth', 'acesso externo concede privilégio além do servidor')
{
  const cb = ler('src/routes/auth.ts')
  const posDispensa = cb.indexOf('!dispensaServidor(me.id)')
  const posExonerado = cb.indexOf("reason=exonerado")
  check(posDispensa > -1 && posExonerado > posDispensa,
    'exonerado continua bloqueado mesmo com acesso externo', 'acesso externo pode contornar exoneração')
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
console.log(`\n=== Resultado: ${passes} OK, ${failures} falha(s) ===\n`)
process.exit(failures > 0 ? 1 : 0)
