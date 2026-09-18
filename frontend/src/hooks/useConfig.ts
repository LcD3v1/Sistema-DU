import { useMe } from '@/hooks/useMe'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/lib/axios'
import { queryClient } from '@/lib/queryClient'
import type { RecCfg, TipoQru } from '@/types'

export function useQrus() {
  const { data: me } = useMe()
  return useQuery<string[]>({
    queryKey: ['config', 'qrus'],
    queryFn: async () => (await api.get<string[]>('/config/qrus')).data,
    // Rota exige conta aprovada: sem cargo não consulta (evita 403 repetidos)
    enabled: !!me && (me.admin || !!me.cargoPermId),
  })
}

/** Tipo de cada QRU (convencional × fechado). Invalida junto com ['config','qrus']. */
export function useQrusTipos() {
  const { data: me } = useMe()
  return useQuery<{ nome: string; tipo: TipoQru }[]>({
    queryKey: ['config', 'qrus', 'tipos'],
    queryFn: async () => (await api.get<{ nome: string; tipo: TipoQru }[]>('/config/qrus/tipos')).data,
    enabled: !!me && (me.admin || !!me.cargoPermId),
  })
}

export function useTipoQru() {
  return useMutation({
    mutationFn: ({ nome, tipo }: { nome: string; tipo: TipoQru }) =>
      api.put(`/config/qrus/${encodeURIComponent(nome)}/tipo`, { tipo }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config', 'qrus'] }),
  })
}

export function useAddQru() {
  return useMutation({
    mutationFn: ({ nome, tipo }: { nome: string; tipo: TipoQru }) => api.post('/config/qrus', { nome, tipo }),
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

export type CanalChave = 'registro' | 'apreensoes' | 'carteira' | 'rankingApreensoes'
export interface CanaisConfig {
  botConfigurado: boolean
  erro?: string
  canais: Partial<Record<CanalChave, string>>
  foruns: { id: string; name: string; type?: number; parentId?: string | null }[]
}

export function useCanais(enabled = true) {
  return useQuery<CanaisConfig>({
    queryKey: ['config', 'canais'],
    queryFn: async () => (await api.get<CanaisConfig>('/config/canais')).data,
    enabled,
  })
}

export function useUpdateCanais() {
  return useMutation({
    mutationFn: (body: Partial<Record<CanalChave, string | null>>) => api.put('/config/canais', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config', 'canais'] }),
  })
}

export type NivelAdvChave = '1' | '2' | '3'
export interface CargosAdvConfig {
  botConfigurado: boolean
  erro?: string
  podeGerenciar: boolean
  cargos: Partial<Record<NivelAdvChave, string>>
  roles: { id: string; nome: string; gerenciavel: boolean }[]
}

export function useCargosAdv(enabled = true) {
  return useQuery<CargosAdvConfig>({
    queryKey: ['config', 'cargos-adv'],
    queryFn: async () => (await api.get<CargosAdvConfig>('/config/cargos-adv')).data,
    enabled,
  })
}

export function useUpdateCargosAdv() {
  return useMutation({
    mutationFn: (body: Partial<Record<NivelAdvChave, string | null>>) => api.put<CargosAdvConfig>('/config/cargos-adv', body),
    onSuccess: r => queryClient.setQueryData(['config', 'cargos-adv'], r.data),
  })
}

export function useCriarCargosAdv() {
  return useMutation({
    mutationFn: () => api.post<CargosAdvConfig>('/config/cargos-adv/criar'),
    onSuccess: r => queryClient.setQueryData(['config', 'cargos-adv'], r.data),
  })
}
