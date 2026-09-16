import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/lib/axios'
import { queryClient } from '@/lib/queryClient'

export interface Solicitacao {
  id: number
  username: string
  nome: string
  criadoEm: string
}

export function useSolicitacoes(enabled = true) {
  return useQuery<Solicitacao[]>({
    queryKey: ['config', 'solicitacoes'],
    queryFn: async () => (await api.get<Solicitacao[]>('/config/solicitacoes')).data,
    enabled,
  })
}

export function useAprovarSolicitacao() {
  return useMutation({
    mutationFn: ({ id, cargoPermId }: { id: number; cargoPermId: number | null }) =>
      api.post(`/config/solicitacoes/${id}/aprovar`, { cargoPermId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config', 'solicitacoes'] })
      queryClient.invalidateQueries({ queryKey: ['config', 'contas'] })
    },
  })
}

export function useRejeitarSolicitacao() {
  return useMutation({
    mutationFn: (id: number) => api.delete(`/config/solicitacoes/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config', 'solicitacoes'] }),
  })
}
