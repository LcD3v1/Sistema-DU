// IMPORTANTE: valida variáveis de ambiente ANTES de qualquer outra coisa.
// Se JWT_SECRET estiver ausente/fraco/placeholder, o processo aborta aqui.
import { env } from './config/env'
import path from 'path'
import { existsSync } from 'fs'
import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import hpp from 'hpp'
import { securityHeaders, permissionsPolicy } from './middleware/securityHeaders'
import { globalLimiter, apiLimiter } from './middleware/rateLimiter'
import { sanitizeBody } from './middleware/sanitize'
import { audit } from './security/audit'
import { ensureDefaultAdmin } from './data'
import authRoutes from './routes/auth'
import publicRoutes from './routes/public'
import membrosRoutes from './routes/membros'
import acoesRoutes from './routes/acoes'
import configRoutes from './routes/config'
import recrutasRoutes from './routes/recrutas'
import ausenciasRoutes from './routes/ausencias'
import avisosRoutes from './routes/avisos'

const app = express()
const PROD = env.PROD

// ── Segurança: camada 1 — headers HTTP ───────────────────────────────────────
app.use(securityHeaders)
app.use(permissionsPolicy)

// ── Segurança: camada 2 — rate limiting global ────────────────────────────────
app.set('trust proxy', 1) // Necessário para rate limit funcionar atrás de proxy/CDN
app.use(globalLimiter)

// ── CORS (apenas desenvolvimento) ────────────────────────────────────────────
if (!PROD) {
  app.use(cors({
    origin: env.ALLOWED_ORIGIN,
    credentials: true,
  }))
}

// ── Parser + proteção contra HTTP Parameter Pollution ─────────────────────────
app.use(express.json({ limit: '5mb' }))
app.use(hpp())

// ── Sanitização de inputs ────────────────────────────────────────────────────
app.use(sanitizeBody)

// ── API routes com rate limit específico ─────────────────────────────────────
app.use('/api', apiLimiter)
app.use('/api/auth', authRoutes)
app.use('/api/public', publicRoutes)
app.use('/api/membros', membrosRoutes)
app.use('/api/acoes', acoesRoutes)
app.use('/api/config', configRoutes)
app.use('/api/recrutas', recrutasRoutes)
app.use('/api/ausencias', ausenciasRoutes)
app.use('/api/avisos', avisosRoutes)

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

// ── 404 para rotas de API não encontradas (não cai no fallback do SPA) ─────────
app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'Recurso não encontrado' })
})

// ── Serve frontend buildado ───────────────────────────────────────────────────
const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist')
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist, {
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
  app.use((_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.sendFile(path.join(frontendDist, 'index.html'))
  })
  console.log('[FAST] Servindo frontend de:', frontendDist)
} else {
  console.log('[FAST] Frontend dist não encontrado — rode: npm run build')
}

// ── Tratador global de erros ──────────────────────────────────────────────────
// Nunca vaza stack trace ao cliente; registra internamente para auditoria.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('[FAST][ERRO]', err?.message)
  if (!PROD && err?.stack) console.error(err.stack)
  try { audit('UNAUTHORIZED_ACCESS', req, `Erro não tratado: ${err?.message ?? 'desconhecido'}`) } catch { /* noop */ }
  if (res.headersSent) return
  res.status(500).json({ error: 'Erro interno do servidor' })
})

const PORT = parseInt(process.env.PORT || '3001', 10)

ensureDefaultAdmin().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[FAST] Sistema rodando em http://0.0.0.0:${PORT}`)
    console.log(`[FAST] Ambiente: ${PROD ? 'produção' : 'desenvolvimento'}`)
  })
}).catch(err => {
  console.error('[FAST] Erro ao inicializar:', err)
  process.exit(1)
})
