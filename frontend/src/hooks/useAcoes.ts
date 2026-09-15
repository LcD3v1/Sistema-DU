import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/lib/axios'
import { queryClient } from '@/lib/queryClient'
import type { Acao, AcoesResponse } from '@/types'

interface AcoesFilter {
  qru?: string
  resultado?: string
  status?: 'pendente' | 'aprovada'
  page?: number
  limit?: number
}

export function useAcoes(filters: AcoesFilter = {}) {
  return useQuery<AcoesResponse>({
    queryKey: ['acoes', filters],
    queryFn: async () => {
      const { data } = await api.get<AcoesResponse>('/acoes', { params: filters })
      return data
    },
    refetchInterval: 60_000,
  })
}

export function useAllAcoes() {
  return useQuery<AcoesResponse>({
    queryKey: ['acoes', 'all'],
    queryFn: async () => {
      const { data } = await api.get<AcoesResponse>('/acoes', { params: { limit: 9999 } })
      return data
    },
    refetchInterval: 60_000,
  })
}

export function useCreateAcao() {
  return useMutation({
    mutationFn: (body: Omit<Acao, 'id'>) => api.post<Acao>('/acoes', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['acoes'] }),
  })
}

export function useApproveAcao() {
  return useMutation({
    mutationFn: (id: number) => api.put(`/acoes/${id}/aprovar`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['acoes'] }),
  })
}

export function useDeleteAcao() {
  return useMutation({
    mutationFn: (id: number) => api.delete(`/acoes/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['acoes'] }),
  })
}
