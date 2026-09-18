import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/lib/axios'
import { queryClient } from '@/lib/queryClient'
import type { Membro, CargoHierarquia, ContaExonerada } from '@/types'

export function useMembros() {
  return useQuery<Membro[]>({
    queryKey: ['membros'],
    queryFn: async () => {
      const { data } = await api.get<Membro[]>('/membros')
      return data
    },
    refetchInterval: 60_000,
  })
}

export function useMembrosExonerados(enabled = true) {
  return useQuery<ContaExonerada[]>({
    queryKey: ['membros', 'exonerados'],
    queryFn: async () => {
      const { data } = await api.get<ContaExonerada[]>('/membros/exonerados')
      return data
    },
    enabled,
    refetchInterval: enabled ? 60_000 : false,
  })
}

export function useCreateMembro() {
  return useMutation({
    mutationFn: (body: Omit<Membro, 'id'>) => api.post<Membro>('/membros', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['membros'] }),
  })
}

export function useUpdateMembro() {
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<Membro> & { id: number }) =>
      api.put<Membro>(`/membros/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['membros'] }),
  })
}

export function useDeleteMembro() {
  return useMutation({
    mutationFn: (id: number) => api.delete<{ ok: boolean; exonerado?: boolean }>(`/membros/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['membros'] }),
  })
}

export function useReorderMembros() {
  return useMutation({
    mutationFn: (orderedIds: number[]) => api.put('/membros/reorder', { orderedIds }),
  })
}

export function useHierarquia(enabled = true) {
  return useQuery<CargoHierarquia[]>({
    queryKey: ['membros', 'hierarquia'],
    queryFn: async () => (await api.get<CargoHierarquia[]>('/membros/hierarquia')).data,
    enabled,
  })
}

function invalidarEfetivo() {
  queryClient.invalidateQueries({ queryKey: ['membros'] })
  queryClient.invalidateQueries({ queryKey: ['membros', 'exonerados'] })
  queryClient.invalidateQueries({ queryKey: ['me'] })
  queryClient.invalidateQueries({ queryKey: ['config', 'contas'] })
}

export function usePromover() {
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; cargoPermId: number; motivo?: string }) =>
      api.post<{ tipo: 'promocao' | 'rebaixamento'; de: string; para: string }>(`/membros/${id}/promover`, body),
    onSuccess: invalidarEfetivo,
  })
}

export function useAdvertir() {
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; nivel: 1 | 2 | 3; motivo: string }) =>
      api.post<Membro>(`/membros/${id}/advertencia`, body),
    onSuccess: invalidarEfetivo,
  })
}

/** Retira só um nível (os outros quadradinhos continuam como estão). */
export function useRetirarAdvertencia() {
  return useMutation({
    mutationFn: ({ id, nivel }: { id: number; nivel: 1 | 2 | 3 }) => api.delete<Membro>(`/membros/${id}/advertencia/${nivel}`),
    onSuccess: invalidarEfetivo,
  })
}

export function useRemoverAdvertencias() {
  return useMutation({
    mutationFn: (id: number) => api.delete<Membro>(`/membros/${id}/advertencia`),
    onSuccess: invalidarEfetivo,
  })
}

export function useExonerar() {
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) => api.post(`/membros/${id}/exonerar`, { motivo }),
    onSuccess: invalidarEfetivo,
  })
}

export function useRetirarExoneracao() {
  return useMutation({
    mutationFn: (id: number) => api.post(`/membros/exonerados/${id}/retirar`),
    onSuccess: invalidarEfetivo,
  })
}
