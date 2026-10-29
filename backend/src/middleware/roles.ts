import { Request, Response, NextFunction } from 'express'
import { peekData } from '../data'
import type { DuData } from '../types'
import { isAdmin, isDev, canArea } from '../access'
import { AreaId } from '../permAreas'

/**
 * Exige poder de dev (conta dona ou cargo com dev=true). Para o que equivale a dev:
 * backup completo (leva os hashes de senha) e restauração (substitui contas e cargos).
 */
export function requireDev(req: Request, res: Response, next: NextFunction): void {
  const user = req.user
  if (!user) { res.status(401).json({ error: 'Não autenticado' }); return }
  const data = peekData() as DuData
  const conta = data.contas.find(c => c.id === user.contaId)
  if (conta && isDev(conta, data)) { next(); return }
  res.status(403).json({ error: 'Acesso negado' })
}

/** Exige acesso total (conta dona ou cargo com admin=true). */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = req.user
  if (!user) { res.status(401).json({ error: 'Não autenticado' }); return }
  const data = peekData() as DuData
  const conta = data.contas.find(c => c.id === user.contaId)
  if (conta && isAdmin(conta, data)) { next(); return }
  res.status(403).json({ error: 'Acesso negado — requer cargo de administrador' })
}

/** Exige permissão em uma área específica (ver/editar) conforme o cargo. */
export function requireArea(area: AreaId, mode: 'ver' | 'editar' = 'ver') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user
    if (!user) { res.status(401).json({ error: 'Não autenticado' }); return }
    const data = peekData() as DuData
    const conta = data.contas.find(c => c.id === user.contaId)
    if (conta && canArea(conta, data, area, mode)) { next(); return }
    res.status(403).json({ error: `Acesso negado — sem permissão de ${mode} em "${area}"` })
  }
}

// Compatibilidade: adminOnly continua existindo, agora significando "acesso total".
export const adminOnly = requireAdmin

/** Conta aprovada: tem cargo de permissão ou é admin/dono. Contas recém-criadas (sem cargo) não passam. */
export function requireAprovado(req: Request, res: Response, next: NextFunction): void {
  const user = req.user
  if (!user) { res.status(401).json({ error: 'Não autenticado' }); return }
  const data = peekData() as DuData
  const conta = data.contas.find(c => c.id === user.contaId)
  if (conta && (isAdmin(conta, data) || Boolean(conta.cargoPermId && data.cargosPermissao.some(c => c.id === conta.cargoPermId)))) { next(); return }
  res.status(403).json({ error: 'Acesso negado' })
}

/** Exige permissão em PELO MENOS uma das áreas informadas. */
export function requireAlgumaArea(areas: AreaId[], mode: 'ver' | 'editar' = 'ver') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user
    if (!user) { res.status(401).json({ error: 'Não autenticado' }); return }
    const data = peekData() as DuData
    const conta = data.contas.find(c => c.id === user.contaId)
    if (conta && areas.some(a => canArea(conta, data, a, mode))) { next(); return }
    res.status(403).json({ error: 'Acesso negado' })
  }
}
