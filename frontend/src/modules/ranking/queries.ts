import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/authStore'
import type { Member, Page, Period, Ranking } from './types'

export interface Filters { period: Period; search: string; role: string; page: number }
export function useDirectoryQuery<T>(path: string, filters: Filters, publicView: boolean, enabled = true) {
  const accountId = useAuthStore(s => s.user?.contaId)
  return useQuery<T>({
    queryKey: ['ranking-module', publicView ? 'public' : accountId, path, filters],
    queryFn: async ({ signal }) => (await api.get<T>(`${publicView ? '/public/directory' : '/ranking'}${path}`, {
      params: { ...filters, limit: 24 }, signal, timeout: 12_000,
    })).data,
    enabled, staleTime: 30_000, refetchInterval: 60_000, refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: (count, error) => count < 1 && !(isAxiosError(error) && [400, 401, 403, 404].includes(error.response?.status ?? 0)),
  })
}
export const useRanking = (filters: Filters, publicView: boolean, enabled = true) => useDirectoryQuery<Ranking>('', filters, publicView, enabled)
export const useDirectory = (filters: Filters, publicView: boolean, enabled = true) => useDirectoryQuery<Page>('/members', filters, publicView, enabled)
export const useMember = (id: number, period: Period, publicView: boolean) => useDirectoryQuery<Member>(`/members/${id}`, { period, search: '', role: '', page: 1 }, publicView)

/** Existing writes invalidate mounted directory queries immediately. */
export function useRankingInvalidation() {
  const client = useQueryClient()
  useEffect(() => client.getMutationCache().subscribe(event => {
    if (event.type === 'updated' && event.action.type === 'success') {
      void client.invalidateQueries({ queryKey: ['ranking-module'] })
    }
  }), [client])
}
export function errorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    if (error.response?.status === 403) return 'Você não tem permissão para consultar estes dados.'
    if (error.response?.status === 404) return 'Este membro não está mais no diretório ativo.'
    if (error.response?.status === 429) return 'Aguarde um momento antes de consultar novamente.'
  }
  return 'Não foi possível carregar os dados. Tente novamente em instantes.'
}
