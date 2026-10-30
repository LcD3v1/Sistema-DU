/**
 * Conta logada que fez a requisição — só pela assinatura do token (security/jwt.ts) e a lista de
 * revogados, SEM tocar nos dados. Usado ANTES das rotas: anti-flood por conta e para não banir no
 * firewall quem está logado (o requireAuth continua sendo quem libera ou nega o acesso).
 * Resultado guardado na própria requisição (o token é conferido uma vez só).
 */
import { Request } from 'express'
import { verificarToken } from './jwt'
import { isRevoked } from './tokenBlacklist'

const CACHE = Symbol('contaDaRequisicao')
type ComCache = Request & { [CACHE]?: number | null }

export function contaDaRequisicao(req: Request): number | undefined {
  const r = req as ComCache
  if (r[CACHE] !== undefined) return r[CACHE] ?? undefined
  let conta: number | null = null
  const header = req.headers.authorization
  if (typeof header === 'string' && header.startsWith('Bearer ') && header.length <= 4200) {
    try {
      const p = verificarToken<{ contaId?: unknown; jti?: unknown }>(header.slice(7))
      if (Number.isSafeInteger(p.contaId) && typeof p.jti === 'string' && !isRevoked(p.jti)) conta = p.contaId as number
    } catch { /* token inválido/expirado = visitante */ }
  }
  r[CACHE] = conta
  return conta ?? undefined
}
