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

/** O painel nunca recebe o discordId — só o @ do Discord, que serve de referência. */
export interface MembroDiscord { usuario: string; nome: string; avatar: string }

/** Todos os membros do servidor do Discord (sem bots), para escolher quem marcar. */
export function useMembrosDiscord(enabled = true) {
  return useQuery<{ configurado: boolean; membros: MembroDiscord[] }>({
    queryKey: ['carteira', 'membros'],
    queryFn: async () => (await api.get<{ configurado: boolean; membros: MembroDiscord[] }>('/carteira/membros')).data,
    enabled,
    staleTime: 60_000,
  })
}

export function usePostarCarteira() {
  return useMutation({
    mutationFn: (body: { topicoId: string; imagem: string; mensagem?: string; mencionarUsuario?: string | null }) =>
      api.post('/carteira/postar', body),
  })
}
