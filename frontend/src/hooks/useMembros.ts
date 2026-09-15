import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/lib/axios'
import { queryClient } from '@/lib/queryClient'
import type { Membro } from '@/types'

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
    mutationFn: (id: number) => api.delete(`/membros/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['membros'] }),
  })
}

export function useReorderMembros() {
  return useMutation({
    mutationFn: (orderedIds: number[]) => api.put('/membros/reorder', { orderedIds }),
  })
}
