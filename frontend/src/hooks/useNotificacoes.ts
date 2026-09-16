import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/lib/axios'
import { queryClient } from '@/lib/queryClient'

export type TipoNotificacao =
  | 'solicitacao' | 'aprovada' | 'recusada' | 'pendente_aprovacao'
  | 'promocao' | 'rebaixamento' | 'advertencia' | 'ausencia' | 'cadastro'
  | 'aviso' | 'fardamento' | 'recrutamento' | 'apreensao' | 'exoneracao' | 'membro'

export interface Notificacao {
  id: number
  tipo: TipoNotificacao
  titulo: string
  mensagem: string
  link?: string
  lida: boolean
  criadaEm: string
}

interface Resp { notificacoes: Notificacao[]; naoLidas: number }

const KEY = ['notificacoes']
const invalidar = () => queryClient.invalidateQueries({ queryKey: KEY })

export function useNotificacoes() {
  return useQuery<Resp>({
    queryKey: KEY,
    queryFn: async () => (await api.get<Resp>('/notificacoes')).data,
    refetchInterval: 20_000,
  })
}

export function useMarcarTodasLidas() {
  return useMutation({ mutationFn: () => api.put('/notificacoes/lidas'), onSuccess: invalidar })
}

export function useMarcarLida() {
  return useMutation({ mutationFn: (id: number) => api.put(`/notificacoes/${id}/lida`), onSuccess: invalidar })
}

export function useApagarNotificacao() {
  return useMutation({ mutationFn: (id: number) => api.delete(`/notificacoes/${id}`), onSuccess: invalidar })
}
