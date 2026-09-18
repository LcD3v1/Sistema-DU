import { useQuery, useMutation, keepPreviousData } from '@tanstack/react-query'
import api from '@/lib/axios'
import { queryClient } from '@/lib/queryClient'
import type { Acao, AcoesResponse } from '@/types'
import type { MembroDiscord } from '@/hooks/useCarteira'

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
    // Troca de página/filtro mantém a lista anterior na tela enquanto carrega (sem piscar o loading)
    placeholderData: keepPreviousData,
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
    // participantesDiscord: @ do Discord; o servidor resolve o ID
    mutationFn: (body: Omit<Acao, 'id'> & { participantesDiscord?: string[] }) => api.post<Acao>('/acoes', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['acoes'] })
      queryClient.invalidateQueries({ queryKey: ['notificacoes'] })
    },
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

/** Todos do servidor do Discord (mesmo sem cadastro na unidade) para marcar como participante. */
export function useParticipantesServidor() {
  return useQuery<{ configurado: boolean; membros: MembroDiscord[] }>({
    queryKey: ['acoes', 'participantes'],
    queryFn: async () => (await api.get<{ configurado: boolean; membros: MembroDiscord[] }>('/acoes/participantes')).data,
    staleTime: 60_000,
  })
}
