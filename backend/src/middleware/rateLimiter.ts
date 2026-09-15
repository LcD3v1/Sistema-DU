import rateLimit from 'express-rate-limit'
import { audit } from '../security/audit'

const limiterMessage = (msg: string) => ({ error: msg })

// Geral: 300 req / 15 min por IP
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: limiterMessage('Muitas requisições. Tente novamente em alguns minutos.'),
})

// Login: 10 tentativas / 15 min por IP
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: limiterMessage('Muitas tentativas de login. Tente novamente em 15 minutos.'),
  handler(req, res, _next, options) {
    audit('RATE_LIMIT_HIT', req, `Login bloqueado por rate limit: ${req.ip}`)
    res.status(options.statusCode).json(options.message)
  },
})

// Ações críticas (restore, change-password): 5 / 15 min por IP
export const criticalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: limiterMessage('Limite de operações críticas atingido. Tente em 15 minutos.'),
})

// API geral: 150 req / 1 min por IP
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  message: limiterMessage('Muitas requisições à API. Tente em um minuto.'),
})
