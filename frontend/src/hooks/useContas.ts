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
