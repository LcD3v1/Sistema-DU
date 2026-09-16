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
  status: 'pendente' | 'aprovada' | 'recusada' | 'encerrada'
  solicitadoPor?: string
  decididoPor?: string
  encerradaPor?: string
  motivoRecusa?: string
}
export type AusenciaInput = { memberId: number; nome: string; dataInicio: string; dataFim: string; motivo: string }

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ausencias'] })
      queryClient.invalidateQueries({ queryKey: ['notificacoes'] })
    },
  })
}

function invalidarAusencias() {
  queryClient.invalidateQueries({ queryKey: ['ausencias'] })
  queryClient.invalidateQueries({ queryKey: ['notificacoes'] })
  queryClient.invalidateQueries({ queryKey: ['membros'] })
}

export function useAprovarAusencia() {
  return useMutation({ mutationFn: (id: number) => api.put(`/ausencias/${id}/aprovar`), onSuccess: invalidarAusencias })
}

export function useRecusarAusencia() {
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo?: string }) => api.put(`/ausencias/${id}/recusar`, { motivo }),
    onSuccess: invalidarAusencias,
  })
}

export function useEncerrarAusencia() {
  return useMutation({ mutationFn: (id: number) => api.put(`/ausencias/${id}/encerrar`), onSuccess: invalidarAusencias })
}

export function useDeleteAusencia() {
  return useMutation({
    mutationFn: (id: number) => api.delete(`/ausencias/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ausencias'] }),
  })
}

export type AusenciaStatus = 'pendente' | 'ativa' | 'programada' | 'encerrada' | 'recusada'

export function statusAusencia(a: Ausencia): AusenciaStatus {
  if (a.status === 'pendente') return 'pendente'
  if (a.status === 'recusada') return 'recusada'
  if (a.status === 'encerrada') return 'encerrada'
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  if (a.dataFim < hoje) return 'encerrada'
  if (a.dataInicio > hoje) return 'programada'
  return 'ativa'
}
