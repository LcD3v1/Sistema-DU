import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { AuthPayload } from '../types'
import { isRevoked } from '../security/tokenBlacklist'
import { readData } from '../data'
import { bloqueioDeAcesso } from '../efetivo'

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload & { jti?: string; exp?: number }
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token ausente' })
    return
  }

  let payload: AuthPayload & { jti?: string; exp?: number }

  try {
    const token = header.slice(7)
    payload = jwt.verify(token, process.env.JWT_SECRET!) as typeof payload
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' })
    return
  }

  // 1. Token explicitamente revogado (logout)?
  if (payload.jti && isRevoked(payload.jti)) {
    res.status(401).json({ error: 'Token revogado' })
    return
  }

  // 2. Conta ainda existe e está ativa? (efeito imediato ao desativar)
  // readData() é rápido — lê do cache em memória (espelho do MongoDB)
  const data = readData()
  const conta = data.contas.find(c => c.id === payload.contaId)
  if (conta?.exonerado) {
    res.status(401).json({ error: 'EXONERADO' })
    return
  }
  if (!conta || !conta.ativo) {
    res.status(401).json({ error: 'CONTA_DESATIVADA' })
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
