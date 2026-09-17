import { useQuery } from '@tanstack/react-query'
import api from '@/lib/axios'

export interface RankItem {
  rank: number
  memberId: number
  badge: string
  name: string
  role: string
  patenteInterna: string
  vitorias: number
  registros: number
}
export interface RankingResp {
  window: string
  winRate: number
  vitoriasTotais: number
  acoesFechadas: number
  totalApreensoes: number
  conquistas: number
  list: RankItem[]
}

export interface MembroPub {
  id: number
  badge: string
  name: string
  role: string
  entrada: string
  status: string
}
export interface GrupoMembros {
  patente: string
  membros: MembroPub[]
}
export interface MembrosResp {
  total: number
  grupos: GrupoMembros[]
}

export function usePublicRanking(win: string) {
  return useQuery<RankingResp>({
    queryKey: ['public-ranking', win],
    queryFn: async () => {
      const { data } = await api.get<RankingResp>(`/public/ranking?window=${win}`)
      return data
    },
  })
}

export function usePublicMembros() {
  return useQuery<MembrosResp>({
    queryKey: ['public-membros'],
    queryFn: async () => {
      const { data } = await api.get<MembrosResp>('/public/membros')
      return data
    },
  })
}
