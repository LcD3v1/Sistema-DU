/**
 * Escopo da sessão (servidor + bot) no JWT sem expor IDs:
 * o token leva só um hash curto do scopeKey (payload do JWT é legível no navegador).
 */
import crypto from 'crypto'
import { RankingScope, scopeKey } from '../modules/ranking/scope'
import { iguaisSeguro } from './crypto'

export function escopoDoToken(scope: RankingScope | null | undefined): string | undefined {
  if (!scope) return undefined
  return crypto.createHash('sha256').update('fast-escopo:' + scopeKey(scope)).digest('base64url').slice(0, 22)
}

/**
 * Confere o escopo do token. Aceita o formato bruto antigo (IDs em claro) apenas fora
 * de produção (tokens de teste/legado); em produção só o hash.
 */
export function escopoConfere(valor: unknown, scope: RankingScope): boolean {
  if (iguaisSeguro(valor, escopoDoToken(scope))) return true
  return process.env.NODE_ENV !== 'production' && iguaisSeguro(valor, scopeKey(scope))
}
