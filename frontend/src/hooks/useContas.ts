import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/lib/axios'
import { queryClient } from '@/lib/queryClient'
import type { Conta } from '@/types'

export function useContas() {
  return useQuery<Conta[]>({
    queryKey: ['config', 'contas'],
    queryFn: async () => (await api.get<Conta[]>('/config/contas')).data,
  })
}

export function useUpdateConta() {
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; nivel?: string; ativo?: boolean; cargoPermId?: number | null }) =>
      api.put(`/config/contas/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config', 'contas'] }),
  })
}

export function useDeleteConta() {
  return useMutation({
    mutationFn: (id: number) => api.delete(`/config/contas/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config', 'contas'] }),
  })
}

export function useRedefinirSenha() {
  return useMutation({
    mutationFn: ({ id, novaSenha }: { id: number; novaSenha: string }) => api.put(`/config/contas/${id}/senha`, { novaSenha }),
  })
}

// ── Pedidos de acesso feitos na tela de login ─────────────────────────────────
export interface PedidoAcesso { id: number; username: string; nome: string; criadoEm: string }

export function usePedidosAcesso() {
  return useQuery<PedidoAcesso[]>({
    queryKey: ['config', 'solicitacoes-acesso'],
    queryFn: async () => (await api.get<PedidoAcesso[]>('/config/solicitacoes-acesso')).data,
  })
}

export function useAprovarAcesso() {
  return useMutation({
    mutationFn: ({ id, cargoPermId }: { id: number; cargoPermId: number | null }) =>
      api.post(`/config/solicitacoes-acesso/${id}/aprovar`, { cargoPermId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config', 'solicitacoes-acesso'] })
      queryClient.invalidateQueries({ queryKey: ['config', 'contas'] })
    },
  })
}

export function useRecusarAcesso() {
  return useMutation({
    mutationFn: (id: number) => api.delete(`/config/solicitacoes-acesso/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config', 'solicitacoes-acesso'] }),
  })
}
