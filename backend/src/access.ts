import { Conta, FastData, CargoPermissao } from './types'
import { PermMap, AreaId, fullPermMap, emptyPermMap, normalizePermMap } from './permAreas'

/**
 * Controle de acesso baseado em CARGOS DE PERMISSÃO (substitui o antigo "nível").
 *
 * - A conta dona (id 1, o admin semeado) tem SEMPRE acesso total — à prova de bloqueio.
 * - Qualquer conta cujo cargo tenha `admin: true` também tem acesso total.
 * - Caso contrário, o acesso é exatamente o que o cargo define por área (ver/editar).
 * - Conta sem cargo: nenhum acesso (só o próprio perfil).
 */
export const PROTECTED_OWNER_ID = 1

/** IDs do Discord com acesso total (DISCORD_OWNER_ID, separados por vírgula). */
export function discordIdsDonos(): string[] {
  return (process.env.DISCORD_OWNER_ID ?? '')
    .split(/[,;\s]+/)
    .map(s => s.trim())
    .filter(s => /^\d{17,20}$/.test(s))
}

/**
 * Garante acesso total a uma conta de dono: atribui um cargo de acesso total
 * (o primeiro existente, ou cria "Administrador") e reativa a conta.
 * Muta `data` — o chamador grava. Retorna true se algo mudou.
 */
export function garantirAcessoDono(conta: Conta, data: FastData): boolean {
  let mudou = false
  if (!conta.ativo || conta.exonerado) {
    conta.ativo = true
    delete conta.exonerado; delete conta.exoneradoEm; delete conta.exoneradoMotivo
    mudou = true
  }
  if (conta.id === PROTECTED_OWNER_ID || isAdmin(conta, data)) return mudou
  let cargo = data.cargosPermissao.find(c => c.admin)
  if (!cargo) {
    cargo = { id: data.nextCargoPermId++, nome: 'Administrador', admin: true, padrao: false, permissoes: fullPermMap() }
    data.cargosPermissao.unshift(cargo)
  }
  conta.cargoPermId = cargo.id
  return true
}

export function getCargo(conta: Conta, data: FastData): CargoPermissao | undefined {
  return conta.cargoPermId ? data.cargosPermissao.find(c => c.id === conta.cargoPermId) : undefined
}

export function isAdmin(conta: Conta, data: FastData): boolean {
  if (conta.id === PROTECTED_OWNER_ID) return true
  return getCargo(conta, data)?.admin === true
}

export function resolvePerms(conta: Conta, data: FastData): PermMap {
  if (isAdmin(conta, data)) return fullPermMap()
  const cargo = getCargo(conta, data)
  return cargo ? normalizePermMap(cargo.permissoes) : emptyPermMap()
}

export function canArea(conta: Conta, data: FastData, area: AreaId, mode: 'ver' | 'editar'): boolean {
  if (isAdmin(conta, data)) return true
  const perms = resolvePerms(conta, data)
  return Boolean(perms[area]?.[mode])
}
