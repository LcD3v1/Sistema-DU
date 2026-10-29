/**
 * Emissão/verificação de JWT centralizada.
 * HS256 fixo, issuer/audience, tolerância de relógio pequena, idade máxima.
 */
import jwt, { SignOptions } from 'jsonwebtoken'
import crypto from 'crypto'

export const JWT_ISSUER = 'du-api'
export const JWT_AUDIENCE = 'du-painel'
export const JWT_EXPIRACAO = '8h'
const MAX_IDADE_S = 8 * 3600
const TOLERANCIA_S = 30

/**
 * Exigir iss/aud? Padrão: sim em produção. Tokens sem essas claims (emitidos antes
 * desta versão ou em testes) só são aceitos fora de produção. Um token COM iss/aud
 * errados é sempre recusado.
 */
function exigirEmissor(): boolean {
  const v = process.env.JWT_EXIGIR_EMISSOR?.trim().toLowerCase()
  if (v === 'on' || v === 'true') return true
  if (v === 'off' || v === 'false') return process.env.NODE_ENV !== 'production'
  return process.env.NODE_ENV === 'production'
}

export function assinarToken(payload: Record<string, unknown>): string {
  const opts: SignOptions = {
    algorithm: 'HS256',
    expiresIn: JWT_EXPIRACAO,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  }
  if (typeof payload.jti !== 'string') opts.jwtid = crypto.randomUUID()
  return jwt.sign(payload, process.env.JWT_SECRET!, opts)
}

/** Lança erro se inválido. Retorna o payload decodificado. */
export function verificarToken<T extends object>(token: string): T {
  if (typeof token !== 'string' || token.length > 4096 || token.split('.').length !== 3) throw new Error('invalid')
  const payload = jwt.verify(token, process.env.JWT_SECRET!, {
    algorithms: ['HS256'],
    clockTolerance: TOLERANCIA_S,
    maxAge: MAX_IDADE_S + TOLERANCIA_S,
  }) as jwt.JwtPayload
  if (!payload || typeof payload !== 'object') throw new Error('invalid')
  const temClaims = payload.iss !== undefined || payload.aud !== undefined
  if (temClaims || exigirEmissor()) {
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
    if (payload.iss !== JWT_ISSUER || !aud.includes(JWT_AUDIENCE)) throw new Error('invalid')
  }
  return payload as T
}
