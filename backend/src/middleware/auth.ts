import type { DuData } from '../types'
import { Request, Response, NextFunction } from 'express'
import { verificarToken } from '../security/jwt'
import { escopoConfere } from '../security/escopo'
import { AuthPayload } from '../types'
import { isRevoked } from '../security/tokenBlacklist'
import { peekData } from '../data'
import { bloqueioDeAcesso, ehContaDona, MOTIVO_SAIU_DO_SERVIDOR } from '../efetivo'
import { configuredScope, scopeKey, belongsToScope } from '../modules/ranking/scope'

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload & { jti?: string; exp?: number }
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  // Mensagem única para ausente/inválido/expirado/revogado (não dá pistas)
  if (typeof header !== 'string' || !header.startsWith('Bearer ') || header.length > 4200) {
    res.status(401).json({ error: 'Não autenticado' })
    return
  }

  let payload: AuthPayload & { jti?: string; exp?: number }

  try {
    const token = header.slice(7)
    payload = verificarToken<typeof payload>(token)
    if (!payload || !Number.isSafeInteger(payload.contaId) || typeof payload.jti !== 'string' || !payload.exp) throw new Error('Invalid session')
  } catch {
    res.status(401).json({ error: 'Não autenticado' })
    return
  }

  // 1. Token explicitamente revogado (logout)?
  if (payload.jti && isRevoked(payload.jti)) {
    res.status(401).json({ error: 'Não autenticado' })
    return
  }

  // 2. Conta ainda existe e está ativa? (efeito imediato ao desativar)
  // Somente leitura, sem cópia do banco (roda em toda requisição)
  const data = peekData() as DuData
  const conta = data.contas.find(c => c.id === payload.contaId)
  const scope = configuredScope()
  if (scope && (!escopoConfere(payload.scope, scope) || (conta && !belongsToScope(conta, scope)))) {
    res.status(401).json({ error: 'Sua sessão precisa ser renovada. Entre novamente.' })
    return
  }
  // O token leva só o hash do escopo; internamente normaliza para o scopeKey
  // (usado por requireRankingScope). Nunca é devolvido ao cliente.
  if (scope) payload.scope = scopeKey(scope)
  if (conta?.exonerado) {
    // "saiu": a própria pessoa saiu do servidor do Discord (só ela recebe esta resposta)
    res.status(401).json({ error: 'EXONERADO', ...(conta.exoneradoMotivo === MOTIVO_SAIU_DO_SERVIDOR ? { reason: 'saiu' } : {}) })
    return
  }
  if (!conta || !conta.ativo) {
    res.status(401).json({ error: 'CONTA_DESATIVADA' })
    return
  }
  // "Sair de todos": tokens emitidos antes deixam de valer
  if ((payload.sv ?? 0) !== (conta.sessaoVersao ?? 0)) {
    res.status(401).json({ error: 'Não autenticado' })
    return
  }

  // 3. Em ausência aprovada → sem acesso até o fim do período
  const bloqueio = bloqueioDeAcesso(conta, data)
  if (bloqueio?.codigo === 'AUSENTE') {
    res.status(401).json({ error: 'AUSENTE', ate: bloqueio.ate })
    return
  }

  req.user = payload
  next()
}
