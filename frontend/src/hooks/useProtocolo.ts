import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/lib/axios'
import { queryClient } from '@/lib/queryClient'
import type { ImagemPainel } from '@/lib/imagensPainel'

/** Painel do protocolo no Discord (mensagem do bot com os capítulos e o botão que abre o livro). */
export interface PainelProtocolo {
  canalId: string | null
  descricao: string | null
  imagens: ImagemPainel[]
  publicado: boolean
  erro: 'sem_acesso' | 'discord' | 'sem_canal' | 'nao_configurado' | null
  ultimaAtualizacao: string | null
}
/** Livro do módulo Protocolo: flipbook do Heyzine + capítulos mostrados acima dele + painel do Discord. */
export interface Protocolo {
  flipbook: string; secoes: string[]; atualizadoPor: string | null; atualizadoEm: string | null
  painel: PainelProtocolo
  discordConfigurado: boolean
}
export type SalvarProtocolo = { flipbook: string; secoes: string[]; canalId?: string | null; descricao?: string | null; imagens?: ImagemPainel[] }

/** Igual ao backend: só flipbook do Heyzine (único site que a página deixa embutir). */
export const LINK_HEYZINE = /^https:\/\/heyzine\.com\/flip-book\/[A-Za-z0-9_-]{3,80}(\.html)?$/

/** Motivo de o painel não ter sido publicado (texto para a tela). */
export const MOTIVO_ERRO_PAINEL: Record<NonNullable<PainelProtocolo['erro']>, string> = {
  sem_acesso: 'o bot não consegue postar no canal (dê Ver canal, Enviar mensagens e Anexar arquivos).',
  discord: 'o Discord não respondeu. Tente de novo em instantes.',
  sem_canal: 'escolha o canal do painel.',
  nao_configurado: 'o Discord não está configurado no servidor (.env).',
}

export function useProtocolo() {
  return useQuery<Protocolo>({
    queryKey: ['protocolo'],
    queryFn: async () => (await api.get<Protocolo>('/protocolo')).data,
    staleTime: 60_000,
  })
}

export function useCanaisProtocolo(ativo: boolean) {
  return useQuery<{ canais: { id: string; nome: string }[] }>({
    queryKey: ['protocolo', 'discord'],
    queryFn: async () => (await api.get('/protocolo/discord')).data,
    enabled: ativo,
    staleTime: 60_000,
  })
}

export function useSalvarProtocolo() {
  return useMutation({
    mutationFn: async (body: SalvarProtocolo) => (await api.put<Protocolo>('/protocolo', body)).data,
    onSuccess: dados => queryClient.setQueryData(['protocolo'], dados),
  })
}

export function usePublicarProtocolo() {
  return useMutation({
    mutationFn: async () => (await api.post<Protocolo>('/protocolo/publicar')).data,
    onSuccess: dados => queryClient.setQueryData(['protocolo'], dados),
  })
}
