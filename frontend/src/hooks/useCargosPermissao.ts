import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/lib/axios'
import { queryClient } from '@/lib/queryClient'
import type { PermMap } from '@/lib/permAreas'

export interface CargoPermissao {
  id: number
  nome: string
  padrao?: boolean
  admin?: boolean
  permissoes: PermMap
}

export function useCargosPermissao(enabled = true) {
  return useQuery<CargoPermissao[]>({
    queryKey: ['config', 'cargos-permissao'],
    queryFn: async () => (await api.get<CargoPermissao[]>('/config/cargos-permissao')).data,
    enabled,
  })
}

function invalidate() {
  queryClient.invalidateQueries({ queryKey: ['config', 'cargos-permissao'] })
  queryClient.invalidateQueries({ queryKey: ['me'] })
}

export function useCreateCargoPerm() {
  return useMutation({
    mutationFn: (body: { nome: string; admin?: boolean; permissoes: PermMap }) => api.post('/config/cargos-permissao', body),
    onSuccess: invalidate,
  })
}

export function useUpdateCargoPerm() {
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; nome?: string; padrao?: boolean; admin?: boolean; permissoes?: PermMap }) =>
      api.put(`/config/cargos-permissao/${id}`, body),
    onSuccess: invalidate,
  })
}

export function useDeleteCargoPerm() {
  return useMutation({
    mutationFn: (id: number) => api.delete(`/config/cargos-permissao/${id}`),
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['config', 'contas'] })
    },
  })
}
