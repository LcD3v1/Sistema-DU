import { useAuthStore } from '@/store/authStore'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/lib/axios'
import { queryClient } from '@/lib/queryClient'
import type { Nivel } from '@/types'
import type { PermMap } from '@/lib/permAreas'

export interface Me {
  contaId: number
  username: string
  nivel: Nivel
  membroId: number | null
  discordUsername: string | null
  nomeServidor: string
  avatarServidor: string | null
  avatarAtual: string | null
  nivelMembro: number | null
  avatar: string | null
  banner: string | null
  onboarded: boolean
  cargoPermId: number | null
  admin: boolean
  permissoes: PermMap | null
}

export function useMe() {
  const token = useAuthStore(s => s.token)
  return useQuery<Me>({
    queryKey: ['me'],
    queryFn: async () => (await api.get<Me>('/auth/me')).data,
    enabled: !!token,
  })
}

export interface OnboardingData {
  nivel: number
  policial: string
  badge?: string
  passaporte?: string
  patenteNPD?: string
  patenteInterna?: string
}

export function useOnboarding() {
  return useMutation({
    mutationFn: (body: OnboardingData) => api.post('/auth/onboarding', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] })
      queryClient.invalidateQueries({ queryKey: ['membros'] })
    },
  })
}

export interface MinhaSolicitacaoPerfil {
  id: number
  alteracoes: { campo: string; de: string; para: string }[]
  status: 'pendente' | 'aprovada' | 'recusada'
  criadoEm: string
  decididoPor?: string
  motivoRecusa?: string
}

export function useMinhaSolicitacaoPerfil() {
  return useQuery<MinhaSolicitacaoPerfil | null>({
    queryKey: ['me', 'solicitacao-perfil'],
    queryFn: async () => (await api.get<MinhaSolicitacaoPerfil | null>('/auth/me/solicitacao-perfil')).data,
    refetchInterval: 30_000,
  })
}

/** Envia alteração de perfil — fica pendente até um superior aprovar. */
export function useUpdateMeuMembro() {
  return useMutation({
    mutationFn: (body: Partial<OnboardingData>) => api.put<{ pendente: boolean }>('/auth/me/membro-dados', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] })
      queryClient.invalidateQueries({ queryKey: ['membros'] })
      queryClient.invalidateQueries({ queryKey: ['notificacoes'] })
    },
  })
}

export function useLinkMembro() {
  return useMutation({
    mutationFn: (membroId: number | null) => api.put('/auth/me/membro', { membroId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  })
}

export function useSetAvatar() {
  return useMutation({
    mutationFn: (avatar: string | null) => api.put('/auth/me/avatar', { avatar }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  })
}

export function useSetBanner() {
  return useMutation({
    mutationFn: (banner: string | null) => api.put('/auth/me/banner', { banner }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  })
}

/** Informa o nível pela primeira vez (obrigatório). */
export function useInformarNivel() {
  return useMutation({
    mutationFn: (nivel: number) => api.post('/auth/me/nivel', { nivel }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] })
      queryClient.invalidateQueries({ queryKey: ['membros'] })
    },
  })
}
