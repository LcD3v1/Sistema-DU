// IMPORTANTE: valida variáveis de ambiente ANTES de qualquer outra coisa.
// Se JWT_SECRET estiver ausente/fraco/placeholder, o processo aborta aqui.
import { env } from './config/env'
import path from 'path'
import { existsSync, readFileSync } from 'fs'
import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import hpp from 'hpp'
import { securityHeaders, permissionsPolicy, apiHeaders, forcarHttps } from './middleware/securityHeaders'
import {
  globalLimiter, apiLimiter, mutationLimiter, uploadLimiter, publicLimiter, rankingLimiter, backupLimiter, revisaoLimiter,
} from './middleware/rateLimiter'
import { sanitizeBody } from './middleware/sanitize'
import { audit } from './security/audit'
import { firewall, registrarInfracao, PONTOS } from './security/firewall'
import { iniciarPersistenciaRevogacoes, encerrarPersistenciaRevogacoes } from './security/tokenBlacklist'
import { initData, closeData, ensureDefaultAdmin, ensureNivelMigration, ensureFastPermissionRoles } from './data'
import { iniciarGateway } from './discord/gateway'
import { emSegundoPlano, repararRegistros } from './discord/forum'
import { verificarAusencias } from './efetivo'
import { limparNotificacoesAntigas } from './notificacoes'
import { readData as lerDados, writeData as gravarDados } from './data'
import authRoutes from './routes/auth'
import publicRoutes from './routes/public'
import { createRankingRouter } from './modules/ranking/router'
import membrosRoutes from './routes/membros'
import acoesRoutes from './routes/acoes'
import configRoutes from './routes/config'
import recrutasRoutes from './routes/recrutas'
import ausenciasRoutes from './routes/ausencias'
import avisosRoutes from './routes/avisos'
import fardamentosRoutes from './routes/fardamentos'
import carteiraRoutes from './routes/carteira'
import notificacoesRoutes from './routes/notificacoes'
import mensagensRoutes from './routes/mensagens'
import { uploadRouter as anuncioImagemUpload, publicoRouter as anuncioImagemPublica } from './routes/anuncioImagem'

const app = express()
const PROD = env.PROD

// Exatamente 1 proxy (ShardCloud/cloudflared) → req.ip = IP real do cliente.
// Deve vir antes de firewall e rate limit (ambos usam req.ip).
app.set('trust proxy', 1)
app.disable('x-powered-by')
app.set('etag', false) // sem ETag nas respostas dinâmicas (estáticos têm o próprio)
app.set('query parser', 'simple') // sem objetos aninhados na query (?a[$ne]=1)

// ── Segurança: camada 0 — firewall (banimento por abuso, assinaturas de ataque) ─
app.use(firewall)

// ── Segurança: camada 1 — HTTPS + headers HTTP ───────────────────────────────
app.use(forcarHttps)
app.use(securityHeaders)
app.use(permissionsPolicy)

// ── Segurança: camada 2 — rate limiting global ────────────────────────────────
app.use(globalLimiter)

// ── CORS (apenas desenvolvimento) ────────────────────────────────────────────
if (!PROD) {
  app.use(cors({
    origin: env.ALLOWED_ORIGIN,
    credentials: true,
  }))
}

// ── Parser + proteção contra HTTP Parameter Pollution ─────────────────────────
// Corpo grande só nas rotas de upload; o resto fica limitado (evita abuso de memória/CPU)
const jsonGrande = express.json({ limit: '5mb' })
const jsonPadrao = express.json({ limit: '200kb' })
const ROTAS_UPLOAD = /^\/api\/(auth\/me\/(avatar|banner)|config\/(logo|restore)|fardamentos|carteira\/postar|anuncio\/imagem)(\/|$)/
app.use((req, res, next) => (ROTAS_UPLOAD.test(req.path) ? jsonGrande : jsonPadrao)(req, res, next))
app.use(hpp())

// ── Sanitização de inputs ────────────────────────────────────────────────────
app.use(sanitizeBody)

// ── API routes com rate limit específico ─────────────────────────────────────
app.use('/api', apiHeaders)
// Polling de revisão (a cada 4s por aba): limite próprio e folgado, fora dos limites geral/público
// para não banir quem abre várias abas ou divide IP (CGNAT)
// originalUrl: dentro de app.use('/api') o req.path é relativo ao ponto de montagem
const ehRevisao = (req: Request) => req.method === 'GET' && req.originalUrl.split('?')[0] === '/api/public/revisao'
app.use((req, res, next) => (ehRevisao(req) ? revisaoLimiter(req, res, next) : next()))
app.use('/api', (req, res, next) => (ehRevisao(req) ? next() : apiLimiter(req, res, next)))
app.use('/api', mutationLimiter) // só POST/PUT/PATCH/DELETE
app.use((req, res, next) => (ROTAS_UPLOAD.test(req.path) ? uploadLimiter(req, res, next) : next()))
app.use('/api/public', (req, res, next) => (ehRevisao(req) ? next() : publicLimiter(req, res, next))) // inclui /api/public/directory
app.use('/api/ranking', rankingLimiter)
app.use('/api/config/backup', backupLimiter)
app.use('/api/auth', authRoutes)
app.use('/api/public', publicRoutes)
app.use('/api/ranking', createRankingRouter())
app.use('/api/public/directory', createRankingRouter(true))
app.use('/api/membros', membrosRoutes)
app.use('/api/acoes', acoesRoutes)
app.use('/api/config', configRoutes)
app.use('/api/recrutas', recrutasRoutes)
app.use('/api/ausencias', ausenciasRoutes)
app.use('/api/avisos', avisosRoutes)
app.use('/api/fardamentos', fardamentosRoutes)
app.use('/api/carteira', carteiraRoutes)
app.use('/api/notificacoes', notificacoesRoutes)
app.use('/api/anuncio', anuncioImagemUpload)
app.use('/api/mensagens', mensagensRoutes)

// Link público das fotos do Gerar anúncio (o jogo abre sem login; limite: globalLimiter)
app.use('/img', anuncioImagemPublica)

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

// ── 404 para rotas de API não encontradas (não cai no fallback do SPA) ─────────
app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'Recurso não encontrado' })
})

/**
 * URL pública do site para as tags de prévia (og:image precisa ser absoluta).
 * Usa PUBLIC_URL se definido; senão deriva do host da requisição (validado).
 */
function urlDoSite(req: Request): string {
  const fixa = process.env.PUBLIC_URL?.trim().replace(/\/+$/, '')
  if (fixa && /^https?:\/\/[\w.-]+(:\d+)?$/i.test(fixa)) return fixa
  const host = req.get('host') ?? ''
  const proto = req.protocol === 'https' ? 'https' : 'http'
  return /^[\w.-]+(:\d+)?$/.test(host) ? `${proto}://${host}` : ''
}

// ── Serve frontend buildado ───────────────────────────────────────────────────
const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist')
if (existsSync(frontendDist)) {
  // index.html é entregue pela rota abaixo (com a URL do site nas tags de prévia)
  app.use(express.static(frontendDist, {
    index: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
        res.setHeader('Pragma', 'no-cache')
        res.setHeader('Expires', '0')
      } else if (/\.(js|css|woff2?|ttf|otf|eot)$/.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      } else {
        res.setHeader('Cache-Control', 'no-cache')
      }
    },
  }))
  const indexHtml = readFileSync(path.join(frontendDist, 'index.html'), 'utf-8')
  app.use((req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    const ambiente = process.env.AMBIENTE === 'local' ? 'local' : 'producao'
    res.type('html').send(indexHtml.replace(/__SITE_URL__/g, urlDoSite(req)).replace(/__AMBIENTE__/g, ambiente))
  })
  console.log('[FAST] Servindo frontend de:', frontendDist)
} else {
  console.log('[FAST] Frontend dist não encontrado — rode: npm run build')
}

// ── Tratador global de erros ──────────────────────────────────────────────────
// Nunca vaza stack trace ao cliente; registra internamente para auditoria.
// Erros do parser de corpo (JSON inválido, grande demais…) viram 4xx genérico,
// sem ecoar a mensagem (ela cita trechos do corpo enviado).
const ERROS_CORPO: Record<string, [number, string]> = {
  'entity.parse.failed': [400, 'Requisição inválida'],
  'entity.too.large': [413, 'Conteúdo muito grande'],
  'encoding.unsupported': [415, 'Requisição inválida'],
  'charset.unsupported': [415, 'Requisição inválida'],
  'entity.verify.failed': [400, 'Requisição inválida'],
  'request.aborted': [400, 'Requisição inválida'],
  'request.size.invalid': [400, 'Requisição inválida'],
  'stream.encoding.set': [500, 'Erro interno do servidor'],
  'parameters.too.many': [413, 'Conteúdo muito grande'],
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error & { type?: string; status?: number }, req: Request, res: Response, _next: NextFunction) => {
  const corpo = typeof err?.type === 'string' ? ERROS_CORPO[err.type] : undefined
  if (corpo) {
    // Só o tipo do erro é registrado (nunca a mensagem)
    try { registrarInfracao(req, `corpo_${err.type}`, PONTOS.CORPO_INVALIDO) } catch { /* noop */ }
    if (!res.headersSent) res.status(corpo[0]).json({ error: corpo[1] })
    return
  }
  // Mensagem/stack só no console fora de produção; em produção apenas o nome do erro
  console.error('[FAST][ERRO]', PROD ? (err?.name ?? 'Error') : err?.message)
  if (!PROD && err?.stack) console.error(err.stack)
  try { audit('UNAUTHORIZED_ACCESS', req, `Erro não tratado: ${err?.name ?? 'desconhecido'}`) } catch { /* noop */ }
  if (res.headersSent) return
  res.status(500).json({ error: 'Erro interno do servidor' })
})

// A hospedagem (Shard Cloud) injeta PORT; em produção sem PORT, usa 80
const PORT = parseInt(process.env.PORT || (PROD ? '80' : '3001'), 10)

async function iniciar(): Promise<void> {
  await initData()
  await iniciarPersistenciaRevogacoes() // logout sobrevive a reinícios
  ensureDefaultAdmin()
  ensureNivelMigration()
  ensureFastPermissionRoles()
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[FAST] Sistema rodando em http://0.0.0.0:${PORT} (porta ${process.env.PORT ? 'definida pela hospedagem/.env' : 'padrão'})`)
    console.log(`[FAST] Ambiente: ${PROD ? 'produção' : 'desenvolvimento'}`)
  })
  iniciarGateway()
  // Membros aprovados sem tópico válido no fórum de registro atual (ex.: troca de servidor)
  emSegundoPlano('reparar registros', repararRegistros)

  // Rotina (1 min): ausências (início/fim do período) e limpeza de notificações
  const rotina = () => {
    try { verificarAusencias() } catch (err) { console.error('[FAST] rotina de ausências:', err) }
    // Notificações com mais de 7 dias são apagadas
    try { const d = lerDados(); if (limparNotificacoesAntigas(d)) gravarDados(d) } catch (err) { console.error('[FAST] limpeza de notificações:', err) }
  }
  rotina()
  setInterval(rotina, 60_000)
}

// Desligamento limpo: espera as gravações pendentes no MongoDB.
for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sinal, () => { Promise.allSettled([closeData(), encerrarPersistenciaRevogacoes()]).finally(() => process.exit(0)) })
}

iniciar().catch(err => {
  console.error('[FAST] Erro ao inicializar:', err instanceof Error ? err.message : err)
  process.exit(1)
})
