import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/lib/axios'
import { queryClient } from '@/lib/queryClient'

export interface Fardamento {
  id: number
  patente: string
  titulo: string
  imagem: string
  observacoes: string
  criadoEm: string
}

export function useFardamentos() {
  return useQuery<Fardamento[]>({
    queryKey: ['fardamentos'],
    queryFn: async () => (await api.get<Fardamento[]>('/fardamentos')).data,
  })
}

const invalidate = () => queryClient.invalidateQueries({ queryKey: ['fardamentos'] })

export interface FardamentoInput {
  patente: string
  titulo?: string
  imagem: string
  observacoes?: string
}

export function useCreateFardamento() {
  return useMutation({
    mutationFn: (body: FardamentoInput) => api.post('/fardamentos', body),
    onSuccess: invalidate,
  })
}

export function useUpdateFardamento() {
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<FardamentoInput>) =>
      api.put(`/fardamentos/${id}`, body),
    onSuccess: invalidate,
  })
}

export function useDeleteFardamento() {
  return useMutation({
    mutationFn: (id: number) => api.delete(`/fardamentos/${id}`),
    onSuccess: invalidate,
  })
}
