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
  avatar: string | null
  banner: string | null
  onboarded: boolean
  cargoPermId: number | null
  permissoes: PermMap | null
}

export function useMe() {
  return useQuery<Me>({
    queryKey: ['me'],
    queryFn: async () => (await api.get<Me>('/auth/me')).data,
  })
}

export interface OnboardingData {
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

export function useUpdateMeuMembro() {
  return useMutation({
    mutationFn: (body: Partial<OnboardingData>) => api.put('/auth/me/membro-dados', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] })
      queryClient.invalidateQueries({ queryKey: ['membros'] })
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
