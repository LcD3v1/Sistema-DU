import { useMutation, useQuery } from '@tanstack/react-query'
import api from '@/lib/axios'

export interface TopicoForum { id: string; name: string; arquivado: boolean }

export interface CarteiraForum {
  configurado: boolean
  forum: { id: string; nome: string | null } | null
  topicos: TopicoForum[]
}

/** Fórum salvo em Configurações → Canais e os tópicos onde a carteira pode ser postada. */
export function useCarteiraForum(enabled = true) {
  return useQuery<CarteiraForum>({
    queryKey: ['carteira', 'forum'],
    queryFn: async () => (await api.get<CarteiraForum>('/carteira/forum')).data,
    enabled,
    staleTime: 30_000,
  })
}

export function usePostarCarteira() {
  return useMutation({
    mutationFn: (body: { topicoId: string; imagem: string; mensagem?: string }) =>
      api.post('/carteira/postar', body),
  })
}
