import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/lib/axios'
import { queryClient } from '@/lib/queryClient'
import type { AvaliacaoIndividual, Recruta } from '@/types'

export function useRecrutos() {
  return useQuery<Recruta[]>({
    queryKey: ['recrutas'],
    queryFn: async () => (await api.get<Recruta[]>('/recrutas')).data,
  })
}

export function useRecruta(id: number) {
  return useQuery<Recruta>({
    queryKey: ['recrutas', id],
    queryFn: async () => (await api.get<Recruta>(`/recrutas/${id}`)).data,
    enabled: !!id,
  })
}

export function useCreateRecruta() {
  return useMutation({
    mutationFn: (body: { nome: string; data: string; observacoes?: string }) =>
      api.post<Recruta>('/recrutas', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recrutas'] }),
  })
}

export function useAvaliarRecruta(id: number) {
  return useMutation({
    mutationFn: (body: { scores: Record<string, number>; total: number; observacoes?: string }) =>
      api.post<AvaliacaoIndividual>(`/recrutas/${id}/avaliar`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recrutas', id] }),
  })
}

export function useFecharRecruta() {
  return useMutation({
    mutationFn: (id: number) => api.put<Recruta>(`/recrutas/${id}/fechar`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['recrutas'] })
      queryClient.invalidateQueries({ queryKey: ['recrutas', id] })
    },
  })
}

export function useDeleteRecruta() {
  return useMutation({
    mutationFn: (id: number) => api.delete(`/recrutas/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recrutas'] }),
  })
}
