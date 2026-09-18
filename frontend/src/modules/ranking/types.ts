export type Period = 'all' | '7d' | '15d' | '30d'
export interface Member {
  id: number; name: string; discordId: string | null; badge: string; internalId: string
  avatar: string | null; role: string; roleId: string; hierarchy: string; level: number
  joinedAt: string; status: string; rank: number | null; points: number; wins: number
  losses: number; records: number; winRate: number; discordRoles: string[]
  achievements: { id: string; name: string; earnedAt: string }[]
  activity: { id: number; date: string; type: string; result: string; points: number }[]
  slug: string
  /** Só na API pública: online no Discord; null quando o bot não acompanha presença. */
  online?: boolean | null
}
export interface Role { id: string; name: string; order: number }
export interface Stats { wins: number; losses: number; winRate: number; records: number; achievements: number; activeMembers: number; activity: number; position: number | null }
export interface Page { items: Member[]; page: number; pages: number; total: number; limit: number; roles: Role[] }
export interface Ranking extends Page { stats: Stats; period: Period; revision: string }
