import helmet from 'helmet'
import { Request, Response, NextFunction, RequestHandler } from 'express'

// CSP/HSTS apenas em produção (em dev o Vite precisa de mais liberdades)
const isProd = process.env.NODE_ENV === 'production'

export const securityHeaders: RequestHandler = helmet({
  // Content Security Policy
  contentSecurityPolicy: isProd ? {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'"],
      scriptSrcAttr:  ["'none'"],
      styleSrc:       ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:        ["'self'", 'https://fonts.gstatic.com'],
      // Fotos podem vir de qualquer link http/https (validado no backend); só imagens, scripts seguem bloqueados
      imgSrc:         ["'self'", 'data:', 'blob:', 'https:', 'http:'],
      mediaSrc:       ["'self'", 'data:', 'blob:'], // vídeo/áudio do login
      connectSrc:     ["'self'"],
      // Flipbook do Protocolo (Heyzine) é o único embed de terceiro permitido.
      frameSrc:       ["'self'", 'https://heyzine.com'],
      childSrc:       ["'self'", 'https://heyzine.com'],
      workerSrc:      ["'self'", 'blob:'],
      manifestSrc:    ["'self'"],
      objectSrc:      ["'none'"],
      baseUri:        ["'self'"],
      formAction:     ["'self'"],
      frameAncestors: ["'none'"], // o próprio painel não pode ser embutido (anti-clickjacking)
      upgradeInsecureRequests: [],
    },
  } : false,

  // HTTP Strict Transport Security (HTTPS obrigatório por 1 ano)
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,

  frameguard: { action: 'deny' },
  noSniff: true,
  hidePoweredBy: true,
  referrerPolicy: { policy: 'no-referrer' },
  // Isola a janela (anti tabnabbing/XS-Leaks) e impede outros sites de embutirem nossos recursos
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  // COEP desligado: exigiria CORP em fotos de qualquer URL (requisito do projeto)
  crossOriginEmbedderPolicy: false,
  originAgentCluster: true,
  dnsPrefetchControl: { allow: false },
  ieNoOpen: true,
  xssFilter: true, // X-XSS-Protection: 0 (desliga o filtro legado, que é explorável)
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
})

// Permissions-Policy (não coberto pelo Helmet): nega APIs sensíveis do navegador
const PERMISSIONS_POLICY = [
  'accelerometer=()', 'ambient-light-sensor=()', 'autoplay=(self)', 'battery=()', 'bluetooth=()',
  'camera=()', 'display-capture=()', 'document-domain=()', 'encrypted-media=()', 'fullscreen=(self "https://heyzine.com")',
  'geolocation=()', 'gyroscope=()', 'hid=()', 'idle-detection=()', 'interest-cohort=()', 'magnetometer=()',
  'microphone=()', 'midi=()', 'payment=()', 'picture-in-picture=()', 'publickey-credentials-get=()',
  'screen-wake-lock=()', 'serial=()', 'usb=()', 'xr-spatial-tracking=()', 'browsing-topics=()',
].join(', ')

export function permissionsPolicy(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Permissions-Policy', PERMISSIONS_POLICY)
  next()
}

/** Respostas da API: nunca em cache, CSP mínima (JSON não precisa carregar nada). */
export function apiHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
  next()
}

/**
 * HTTPS obrigatório em produção: redireciona só quando o proxy informa
 * explicitamente X-Forwarded-Proto=http (sem o header não redireciona → sem loop).
 * Desligável com FORCAR_HTTPS=off.
 */
export function forcarHttps(req: Request, res: Response, next: NextFunction): void {
  if (!isProd || process.env.FORCAR_HTTPS === 'off') { next(); return }
  const proto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim().toLowerCase()
  const fixa = process.env.PUBLIC_URL?.trim().match(/^https?:\/\/([\w.-]+(:\d+)?)\/?$/i)?.[1]
  const host = fixa ?? req.get('host') ?? ''
  if (proto === 'http' && /^[\w.-]+(:\d+)?$/.test(host) && req.path !== '/health') {
    if (req.method === 'GET' || req.method === 'HEAD') {
      res.redirect(301, `https://${host}${req.originalUrl.startsWith('/') ? req.originalUrl : '/'}`)
    } else {
      res.status(403).json({ error: 'HTTPS obrigatório' })
    }
    return
  }
  next()
}
