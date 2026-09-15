import helmet from 'helmet'
import { RequestHandler } from 'express'

// Aplicado apenas em produção (em dev o Vite precisa de mais liberdades)
const isProd = process.env.NODE_ENV === 'production'

export const securityHeaders: RequestHandler = helmet({
  // Content Security Policy
  contentSecurityPolicy: isProd ? {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'"],
      styleSrc:       ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:        ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:         ["'self'", 'data:', 'blob:'],
      mediaSrc:       ["'self'", 'data:', 'blob:'], // vídeo/áudio do login
      connectSrc:     ["'self'"],
      // Flipbook do Protocolo (Heyzine) é o único embed de terceiro permitido.
      frameSrc:       ["'self'", 'https://heyzine.com'],
      childSrc:       ["'self'", 'https://heyzine.com'],
      objectSrc:      ["'none'"],
      baseUri:        ["'self'"],
      formAction:     ["'self'"],
      frameAncestors: ["'none'"], // o próprio painel não pode ser embutido (anti-clickjacking)
      upgradeInsecureRequests: [],
    },
  } : false,

  // HTTP Strict Transport Security (HTTPS obrigatório por 1 ano)
  hsts: isProd ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  } : false,

  // Previne clickjacking
  frameguard: { action: 'deny' },

  // Desativa sniffing de MIME type
  noSniff: true,

  // Desativa o header X-Powered-By (esconde Express)
  hidePoweredBy: true,

  // Referrer Policy
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

  // Desabilita cache em respostas da API (evita vazamento de dados sensíveis)
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },

  // Permissions Policy
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
})

// Header extra: Permissions-Policy (não coberto pelo Helmet padrão)
export function permissionsPolicy(
  _req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction,
): void {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=()',
  )
  next()
}
