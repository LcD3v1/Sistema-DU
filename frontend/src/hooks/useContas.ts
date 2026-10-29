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

// ── Pedidos de acesso (primeiro login pelo Discord) ──────────────────────────
export interface PedidoAcesso {
  id: number; username: string; nome: string; avatar: string | null; criadoEm: string
  /** Pedido de set feito no Discord (dados do modal) */
  setagem: {
    codinome: string; passaporte: string; apelido: string
    patente: { nome: string; cargoPermId: number | null } | null
    setor: string | null
    status: 'pendente' | 'correcao'; motivoCorrecao: string | null
  } | null
}

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
    mutationFn: ({ id, motivo }: { id: number; motivo?: string }) =>
      api.delete(`/config/solicitacoes-acesso/${id}`, { data: motivo ? { motivo } : {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config', 'solicitacoes-acesso'] }),
  })
}

/** Pedido de set: pede para a pessoa refazer o preenchimento (o motivo vai no privado do Discord). */
export function useCorrigirAcesso() {
  return useMutation({
    mutationFn: async ({ id, motivo }: { id: number; motivo: string }) =>
      (await api.post<{ ok: true; privado: 'ok' | 'fechado' | 'erro' }>(`/config/solicitacoes-acesso/${id}/corrigir`, { motivo })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config', 'solicitacoes-acesso'] }),
  })
}
