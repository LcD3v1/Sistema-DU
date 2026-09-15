import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/lib/axios'
import { queryClient } from '@/lib/queryClient'
import type { RecCfg } from '@/types'

export function useQrus() {
  return useQuery<string[]>({
    queryKey: ['config', 'qrus'],
    queryFn: async () => (await api.get<string[]>('/config/qrus')).data,
  })
}

export function useAddQru() {
  return useMutation({
    mutationFn: (nome: string) => api.post('/config/qrus', { nome }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config', 'qrus'] }),
  })
}

export function useDeleteQru() {
  return useMutation({
    mutationFn: (nome: string) => api.delete(`/config/qrus/${encodeURIComponent(nome)}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config', 'qrus'] }),
  })
}

export function useReorderQrus() {
  return useMutation({
    mutationFn: (qrus: string[]) => api.put('/config/qrus/reorder', { qrus }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config', 'qrus'] }),
  })
}

export function usePatentes() {
  return useQuery<string[]>({
    queryKey: ['config', 'patentes'],
    queryFn: async () => (await api.get<string[]>('/config/patentes')).data,
  })
}

export function useAddPatente() {
  return useMutation({
    mutationFn: (nome: string) => api.post('/config/patentes', { nome }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config', 'patentes'] }),
  })
}

export function useDeletePatente() {
  return useMutation({
    mutationFn: (nome: string) => api.delete(`/config/patentes/${encodeURIComponent(nome)}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config', 'patentes'] }),
  })
}

export function useReorderPatentes() {
  return useMutation({
    mutationFn: (patentes: string[]) => api.put('/config/patentes/reorder', { patentes }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config', 'patentes'] }),
  })
}

export function useCargos() {
  return useQuery<string[]>({
    queryKey: ['config', 'cargos'],
    queryFn: async () => (await api.get<string[]>('/config/cargos')).data,
  })
}

export function useAddCargo() {
  return useMutation({
    mutationFn: (nome: string) => api.post('/config/cargos', { nome }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config', 'cargos'] }),
  })
}

export function useDeleteCargo() {
  return useMutation({
    mutationFn: (nome: string) => api.delete(`/config/cargos/${encodeURIComponent(nome)}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config', 'cargos'] }),
  })
}

export function useLogo() {
  return useQuery<{ logo: string }>({
    queryKey: ['config', 'logo'],
    queryFn: async () => (await api.get<{ logo: string }>('/config/logo')).data,
  })
}

export function useUpdateLogo() {
  return useMutation({
    mutationFn: (logo: string) => api.put('/config/logo', { logo }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config', 'logo'] }),
  })
}

export interface SituacaoAnuncio {
  id: number
  label: string
  titulo: string
  texto: string
}
export type SituacaoInput = Omit<SituacaoAnuncio, 'id'>

export function useAnuncioSituacoes() {
  return useQuery<SituacaoAnuncio[]>({
    queryKey: ['config', 'anuncio-situacoes'],
    queryFn: async () => (await api.get<SituacaoAnuncio[]>('/config/anuncio-situacoes')).data,
  })
}

export function useAddSituacao() {
  return useMutation({
    mutationFn: (body: SituacaoInput) => api.post('/config/anuncio-situacoes', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config', 'anuncio-situacoes'] }),
  })
}

export function useUpdateSituacao() {
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<SituacaoInput> & { id: number }) =>
      api.put(`/config/anuncio-situacoes/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config', 'anuncio-situacoes'] }),
  })
}

export function useDeleteSituacao() {
  return useMutation({
    mutationFn: (id: number) => api.delete(`/config/anuncio-situacoes/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config', 'anuncio-situacoes'] }),
  })
}

export function useRecCfg() {
  return useQuery<RecCfg>({
    queryKey: ['config', 'recrutamento'],
    queryFn: async () => (await api.get<RecCfg>('/config/recrutamento')).data,
  })
}

export function useUpdateRecCfg() {
  return useMutation({
    mutationFn: (body: Partial<RecCfg>) => api.put('/config/recrutamento', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config', 'recrutamento'] }),
  })
}
