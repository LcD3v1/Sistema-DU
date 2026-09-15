import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/lib/axios'
import { queryClient } from '@/lib/queryClient'

export interface Ausencia {
  id: number
  memberId?: number
  nome: string
  dataInicio: string
  dataFim: string
  motivo: string
  criadoEm: string
}
export type AusenciaInput = Omit<Ausencia, 'id' | 'criadoEm'>

export function useAusencias() {
  return useQuery<Ausencia[]>({
    queryKey: ['ausencias'],
    queryFn: async () => (await api.get<Ausencia[]>('/ausencias')).data,
    refetchInterval: 60_000,
  })
}

export function useCreateAusencia() {
  return useMutation({
    mutationFn: (body: AusenciaInput) => api.post<Ausencia>('/ausencias', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ausencias'] }),
  })
}

export function useDeleteAusencia() {
  return useMutation({
    mutationFn: (id: number) => api.delete(`/ausencias/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ausencias'] }),
  })
}

export type AusenciaStatus = 'ativa' | 'programada' | 'encerrada'

export function statusAusencia(a: Ausencia): AusenciaStatus {
  const hoje = new Date().toISOString().slice(0, 10)
  if (a.dataFim < hoje) return 'encerrada'
  if (a.dataInicio > hoje) return 'programada'
  return 'ativa'
}
