import { Request, Response, NextFunction } from 'express'
import { readData } from '../data'
import { isAdmin, canArea } from '../access'
import { AreaId } from '../permAreas'

/** Exige acesso total (conta dona ou cargo com admin=true). */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = req.user
  if (!user) { res.status(401).json({ error: 'Não autenticado' }); return }
  const data = readData()
  const conta = data.contas.find(c => c.id === user.contaId)
  if (conta && isAdmin(conta, data)) { next(); return }
  res.status(403).json({ error: 'Acesso negado — requer cargo de administrador' })
}

/** Exige permissão em uma área específica (ver/editar) conforme o cargo. */
export function requireArea(area: AreaId, mode: 'ver' | 'editar' = 'ver') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user
    if (!user) { res.status(401).json({ error: 'Não autenticado' }); return }
    const data = readData()
    const conta = data.contas.find(c => c.id === user.contaId)
    if (conta && canArea(conta, data, area, mode)) { next(); return }
    res.status(403).json({ error: `Acesso negado — sem permissão de ${mode} em "${area}"` })
  }
}

// Compatibilidade: adminOnly continua existindo, agora significando "acesso total".
export const adminOnly = requireAdmin
