import { useEffect, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/lib/axios'
import { queryClient } from '@/lib/queryClient'

export interface CanalServidor { id: string; nome: string; tipo: string; topico: string | null; nsfw: boolean }
export interface CargoServidor {
  id: string; nome: string; cor: number; posicao: number; icone: string | null; emoji: string | null
  separado: boolean; mencionavel: boolean; integracao: boolean; membros: number | null
}
export interface EmojiServidor { id: string; nome: string; animado: boolean; disponivel: boolean; url: string }
export interface Servidor {
  nome: string
  descricao: string | null
  membros: number | null
  online: number | null
  impulsos: number
  nivelImpulso: number
  temIcone: boolean
  temBanner: boolean
  bot: string
  canais: { categoria: string | null; canais: CanalServidor[] }[]
  totalCanais: number
  cargos: CargoServidor[]
  emojis: EmojiServidor[]
  modoMembros: 'todos' | 'contas'
  lidoEm: string
}
export interface MembroServidor {
  discordId: string; nome: string; usuario: string; apelido: string | null; avatar: string | null
  cargos: string[]; entrouEm: string | null; temConta: boolean
}
export interface MeuServidor {
  configurado: boolean
  servidor?: string | null
  temIcone?: boolean
  membro?: boolean | null
  apelido?: string | null
  entrouEm?: string | null
  cargos?: { nome: string; cor: number; icone: string | null; emoji: string | null }[]
}

export function useServidor() {
  return useQuery<Servidor>({
    queryKey: ['servidor'],
    queryFn: async () => (await api.get<Servidor>('/servidor')).data,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
}

export function useMembrosServidor(ativo: boolean, busca: string) {
  return useQuery<{ total: number; modo: 'todos' | 'contas'; membros: MembroServidor[] }>({
    queryKey: ['servidor', 'membros', busca],
    queryFn: async () => (await api.get('/servidor/membros', { params: busca ? { q: busca } : {} })).data,
    enabled: ativo,
    staleTime: 60_000,
  })
}

export function useMeuServidor() {
  return useQuery<MeuServidor>({
    queryKey: ['servidor', 'eu'],
    queryFn: async () => (await api.get<MeuServidor>('/servidor/eu')).data,
    staleTime: 60_000,
  })
}

export function useAtualizarServidor() {
  return useMutation({
    mutationFn: async () => (await api.post<Servidor>('/servidor/atualizar')).data,
    onSuccess: dados => {
      queryClient.setQueryData(['servidor'], dados)
      void queryClient.invalidateQueries({ queryKey: ['servidor', 'membros'] })
    },
  })
}

/**
 * Ícone/banner do servidor: vêm pela API (com login) e viram uma URL blob: local.
 * A URL do Discord não é usada direto porque leva o ID do servidor.
 */
export function useImagemServidor(tipo: 'icone' | 'banner', ativo: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!ativo) return
    let atual: string | null = null
    let cancelado = false
    api.get(`/servidor/imagem/${tipo}`, { responseType: 'blob' })
      .then(r => {
        if (cancelado) return
        atual = URL.createObjectURL(r.data as Blob)
        setUrl(atual)
      })
      .catch(() => { /* sem imagem: mostra o padrão */ })
    return () => { cancelado = true; if (atual) URL.revokeObjectURL(atual) }
  }, [tipo, ativo])
  return ativo ? url : null
}
