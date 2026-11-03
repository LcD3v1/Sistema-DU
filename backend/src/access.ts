import { Conta, DuData, CargoPermissao } from './types'
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

export function getCargo(conta: Conta, data: DuData): CargoPermissao | undefined {
  return conta.cargoPermId ? data.cargosPermissao.find(c => c.id === conta.cargoPermId) : undefined
}

/** Conta dona: a conta 1 (criada no primeiro boot). Dono é sempre dev. */
export function ehDono(conta: Conta): boolean {
  return conta.id === PROTECTED_OWNER_ID
}

/** Máximo de pessoas em DISCORD_DONO_ID (entram sem estar no servidor). */
export const MAX_DONOS = 2

/** IDs de DISCORD_DONO_ID (separados por vírgula), sem repetição; só os 2 primeiros valem. */
export function idsDosDonos(valor: string | undefined): string[] {
  return [...new Set((valor ?? '').split(/[\s,;]+/).map(v => v.trim()).filter(v => /^\d{17,20}$/.test(v)))].slice(0, MAX_DONOS)
}

/**
 * Conta de um dos donos do .env: a conta 1 OU a conta ligada ao 2º ID de DISCORD_DONO_ID.
 * As duas são intocáveis (nunca exoneradas) e sempre dev, mesmo que alguém tire o cargo.
 */
export function ehContaDeDono(conta: Conta): boolean {
  if (ehDono(conta)) return true
  const donos = idsDosDonos(process.env.DISCORD_DONO_ID)
  return donos.length === MAX_DONOS && !!conta.discordId && conta.discordId === donos[1]
}

/**
 * Dev: poder total, um degrau acima do admin. Faz tudo e é o único que pode
 * conceder/retirar o próprio cargo de dev — nem admin promove alguém a dev.
 */
export function isDev(conta: Conta, data: DuData): boolean {
  if (ehContaDeDono(conta)) return true
  return getCargo(conta, data)?.dev === true
}

export function isAdmin(conta: Conta, data: DuData): boolean {
  if (isDev(conta, data)) return true
  return getCargo(conta, data)?.admin === true
}

/** O cargo concede "editar" em alguma área? */
export function cargoConcedeEditar(cargo: CargoPermissao): boolean {
  return Object.values(cargo.permissoes ?? {}).some(p => p?.editar === true)
}

/**
 * `autor` pode atribuir este cargo a alguém?
 * Cargo dev → só dev. Cargo com admin ou com "editar" → só admin/dev.
 */
export function podeAtribuirCargo(autor: Conta, cargo: CargoPermissao, data: DuData): boolean {
  if (isDev(autor, data)) return true
  if (cargo.dev) return false
  if (cargo.admin || cargoConcedeEditar(cargo)) return isAdmin(autor, data)
  return true
}

export function resolvePerms(conta: Conta, data: DuData): PermMap {
  if (isAdmin(conta, data)) return fullPermMap()
  const cargo = getCargo(conta, data)
  return cargo ? normalizePermMap(cargo.permissoes) : emptyPermMap()
}

export function canArea(conta: Conta, data: DuData, area: AreaId, mode: 'ver' | 'editar'): boolean {
  if (isAdmin(conta, data)) return true
  const perms = resolvePerms(conta, data)
  return Boolean(perms[area]?.[mode])
}

/** Regra comum de reset: conta ativa e admin/dev ou cargo autorizado explicitamente. */
export function podeZerarRankings(conta: Conta, data: DuData): boolean {
  return !conta.exonerado && conta.ativo !== false && canArea(conta, data, 'zerar_rankings', 'editar')
}
