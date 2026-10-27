import { z } from 'zod'
import type { FastData } from '../../types'
import { belongsToScope, type RankingScope } from './scope'
import { avatarAtual, nivelDoMembro } from '../../identidadeMembro'
import { imagemValida } from '../../security/imagem'
import { isAdmin, isDev, PROTECTED_OWNER_ID } from '../../access'

export const filtersSchema = z.object({
  period: z.enum(['all', '7d', '15d', '30d']).default('all'),
  search: z.string().trim().max(100).default(''),
  role: z.string().max(120).default(''),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
}).strict()
export type Filters = z.infer<typeof filtersSchema>
export const winRate = (wins: number, losses: number) => wins + losses > 0 ? Math.round(wins / (wins + losses) * 100) : 0
const fmtDia = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' })
const day = (date: Date) => fmtDia.format(date)
function validDate(value: string): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return false
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value.slice(0, 10)
}
const RESULTADOS = new Set(['Vitória', 'Derrota', 'Empate'])
const roleName = (value: string) => value.replace(/^\(DU\)\s*/i, '').trim().toLocaleLowerCase('pt-BR')
export function periodStart(period: Filters['period'], now: Date): string {
  if (period === 'all') return ''
  const today = new Date(`${day(now)}T12:00:00Z`)
  today.setUTCDate(today.getUTCDate() - Number(period.slice(0, -1)) + 1)
  return today.toISOString().slice(0, 10)
}
function safeAvatar(value?: string): string | null {
  if (!value) return null
  return imagemValida(value) ? value : null
}
export function slugify(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}
export interface Achievement { id: string; name: string; earnedAt: string }
export interface Activity { id: number; date: string; type: string; result: string; points: number }
export interface MemberRow {
  id: number; name: string; discordId: string | null; badge: string; internalId: string
  avatar: string | null; role: string; roleId: string; hierarchy: string; level: number
  joinedAt: string; status: string; rank: number | null; points: number; wins: number
  losses: number; records: number; winRate: number; achievements: Achievement[]
  activity: Activity[]; achievedAt: string; discordRoles: string[]
  slug: string
}
export interface Snapshot {
  members: MemberRow[]; ranking: MemberRow[]
  roles: { id: string; name: string; order: number }[]
  stats: { wins: number; losses: number; winRate: number; records: number; achievements: number; activeMembers: number; activity: number }
}

/**
 * Ordered activities are aggregated on the backend; clients receive only bounded pages.
 * `ocultarDevs` (visão pública): o dev aparece em Membros, mas testa tudo, então fica fora
 * do ranking e dos totais — não pontua e ações em que só devs participaram não contam.
 */
export function buildSnapshot(data: FastData, scope: RankingScope, period: Filters['period'], now = new Date(), ocultarDevs = false): Snapshot {
  const accounts = new Map(data.contas.filter(c => belongsToScope(c, scope) && c.membroId).map(c => [c.membroId!, c]))
  const foreignLinks = new Set(data.contas.filter(c => c.membroId && !belongsToScope(c, scope)).map(c => c.membroId))
  const roles = data.cargosPermissao.map((role, order) => ({ id: String(role.id), name: role.nome, order }))
  const rows = new Map<number, MemberRow>()
  const devs = new Set<number>()
  const lifetime = new Map<number, number>()
  for (const m of data.membros) {
    if (!belongsToScope(m, scope)) continue
    const account = accounts.get(m.id)
    // A record explicitly linked to a foreign account is not a local unlinked member.
    if (!account && foreignLinks.has(m.id)) continue
    if (m.status === 'Inativo' || account?.exonerado || account?.ativo === false) continue
    if (ocultarDevs && account && isDev(account, data)) devs.add(m.id)
    // Conta ainda não aprovada (sem cargo ou cadastro incompleto) não aparece
    if (account && account.id !== PROTECTED_OWNER_ID && (account.onboarded === false || (!account.cargoPermId && !isAdmin(account, data)))) continue
    const configuredRole = roles.find(r => r.id === String(account?.cargoPermId))
      ?? roles.find(r => roleName(r.name) === roleName(m.patenteInterna || ''))
    const roleId = configuredRole?.id ?? `patente:${m.patenteInterna || 'Sem cargo'}`
    if (!roles.some(r => r.id === roleId)) {
      const order = data.patentes.indexOf(m.patenteInterna)
      roles.push({ id: roleId, name: m.patenteInterna || 'Sem cargo', order: data.cargosPermissao.length + (order < 0 ? data.patentes.length : order) })
    }
    rows.set(m.id, {
      id: m.id, name: account?.nomeServidor || m.policial || `Membro #${m.id}`, discordId: account?.discordId ?? null,
      badge: m.badge || '', internalId: m.passaporte || '', avatar: safeAvatar(avatarAtual(account) ?? undefined),
      role: m.patenteNPD || 'Sem cargo', roleId, hierarchy: configuredRole?.name ?? (m.patenteInterna || 'Sem cargo'),
      level: 1, joinedAt: m.entrada || '', status: m.status || 'Ativo', rank: null, points: 0,
      wins: 0, losses: 0, records: 0, winRate: 0, achievements: [], activity: [], achievedAt: '',
      discordRoles: [...(account?.discordRoleIds ?? [])],
      slug: '',
    })
  }
  const start = periodStart(period, now)
  const today = day(now)
  let wins = 0, losses = 0, records = 0
  const activities = data.acoes.filter(a => belongsToScope(a, scope) && (a.status ?? 'aprovada') === 'aprovada'
    && (a.tipo === 'convencional' || RESULTADOS.has(a.resultado ?? '')) && Array.isArray(a.participants)
    && validDate(a.data) && a.data.slice(0, 10) <= today)
    .sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id)
  for (const action of activities) {
    const ids = new Set(action.participants.map(p => p.memberId))
    if (devs.size && [...ids].every(id => devs.has(id))) continue
    for (const id of ids) lifetime.set(id, (lifetime.get(id) ?? 0) + 1)
    if (action.data.slice(0, 10) < start) continue
    records++
    if (action.resultado === 'Vitória') wins++
    if (action.resultado === 'Derrota') losses++
    for (const id of ids) {
      const row = rows.get(id)
      if (!row || devs.has(id)) continue
      row.records++
      row.points++ // 1 ponto por participação aprovada, como o ranking de registros da referência.
      if (action.resultado === 'Vitória') row.wins++
      if (action.resultado === 'Derrota') row.losses++
      row.achievedAt = action.data
      row.activity.unshift({ id: action.id, date: action.data, type: action.qru, result: action.resultado ?? 'Convencional', points: 1 })
      if (row.activity.length > 20) row.activity.pop()
      if (row.records === 1) row.achievements.push({ id: 'first-record', name: 'Primeiro registro', earnedAt: action.data })
      if (row.wins === 10 && action.resultado === 'Vitória') row.achievements.push({ id: 'ten-wins', name: '10 vitórias', earnedAt: action.data })
      if (row.records === 25) row.achievements.push({ id: 'twenty-five-records', name: '25 registros', earnedAt: action.data })
    }
  }
  // URL pública do perfil: nome em minúsculas sem acentos; homônimos recebem o ID
  const usados = new Map<string, number>()
  for (const row of [...rows.values()].sort((a, b) => a.id - b.id)) {
    const base = slugify(row.name) || `membro-${row.id}`
    usados.set(base, (usados.get(base) ?? 0) + 1)
    row.slug = usados.get(base)! > 1 ? `${base}-${row.badge ? slugify(row.badge) || row.id : row.id}` : base
  }
  const membroPorId = new Map(data.membros.map(m => [m.id, m]))
  for (const row of rows.values()) {
    row.winRate = winRate(row.wins, row.losses)
    const informado = nivelDoMembro(membroPorId.get(row.id))
    row.level = informado ?? 0   // nível informado pelo membro; 0 = ainda não informado
  }
  const ranking = [...rows.values()].filter(r => r.records > 0).sort((a, b) =>
    b.points - a.points || b.wins - a.wins ||
    (b.wins / Math.max(1, b.wins + b.losses) - a.wins / Math.max(1, a.wins + a.losses)) ||
    b.records - a.records || a.achievedAt.localeCompare(b.achievedAt) || a.id - b.id)
  ranking.forEach((row, index) => { row.rank = index + 1 })
  roles.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  const order = new Map(roles.map((r, i) => [r.id, i]))
  const members = [...rows.values()].sort((a, b) => (order.get(a.roleId)! - order.get(b.roleId)!) || a.id - b.id)
  return { members, ranking, roles, stats: {
    wins, losses, winRate: winRate(wins, losses), records,
    achievements: members.reduce((sum, m) => sum + m.achievements.length, 0),
    activeMembers: members.length, activity: ranking.length,
  } }
}
export function listPage(rows: MemberRow[], filters: Filters, publicView = false) {
  const term = filters.search.toLocaleLowerCase('pt-BR')
  const filtered = rows.filter(m => (!filters.role || m.roleId === filters.role) && (!term ||
    [m.name, m.badge, m.role, m.hierarchy, ...(publicView ? [] : [m.discordId, m.internalId])]
      .some(value => value?.toLocaleLowerCase('pt-BR').includes(term))))
  const offset = (filters.page - 1) * filters.limit
  return { items: filtered.slice(offset, offset + filters.limit), total: filtered.length,
    page: filters.page, limit: filters.limit, pages: Math.ceil(filtered.length / filters.limit) }
}
/** Public login preview keeps its existing visibility, but never exposes Discord IDs or private activity. */
export function publicMember(row: MemberRow) {
  return { id: row.id, name: row.name, badge: row.badge, avatar: row.avatar,
    role: row.role, roleId: row.roleId, hierarchy: row.hierarchy, level: row.level,
    joinedAt: row.joinedAt, status: row.status, rank: row.rank, points: row.points,
    wins: row.wins, losses: row.losses, records: row.records, winRate: row.winRate,
    achievements: row.achievements, achievedAt: row.achievedAt, slug: row.slug,
    online: null,   // sem bot: o painel não acompanha presença
    discordId: null, internalId: '', discordRoles: [], activity: [] }
}
