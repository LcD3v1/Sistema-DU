import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/lib/axios'
import { queryClient } from '@/lib/queryClient'

export interface Aviso {
  id: number
  titulo: string
  mensagem: string
  autor: string
  criadoEm: string
}
export interface AvisosResp {
  avisos: Aviso[]
  naoVistos: number
}

export function useAvisos() {
  return useQuery<AvisosResp>({
    queryKey: ['avisos'],
    queryFn: async () => (await api.get<AvisosResp>('/avisos')).data,
    refetchInterval: 30_000,
  })
}

export function useCreateAviso() {
  return useMutation({
    mutationFn: (body: { titulo: string; mensagem: string }) => api.post('/avisos', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['avisos'] }),
  })
}

export function useDeleteAviso() {
  return useMutation({
    mutationFn: (id: number) => api.delete(`/avisos/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['avisos'] }),
  })
}

export function useMarcarAvisosLidos() {
  return useMutation({
    mutationFn: () => api.post('/avisos/marcar-lido'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['avisos'] }),
  })
}
