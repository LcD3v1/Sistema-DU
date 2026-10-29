import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/lib/axios'
import { queryClient } from '@/lib/queryClient'
import type { ImagemPainel } from '@/lib/imagensPainel'

export interface CargoHierarquia { roleId: string; nome: string; emoji: string | null }
export interface HierarquiaConfig {
  id: number                    // 0 = principal; ≥ 1 = hierarquia extra
  titulo: string
  logo: string | null           // imagem enviada (data URL) ou link
  rodapeTexto: string | null    // vazio = nome do servidor
  rodapeIcone: string | null    // vazio = foto do bot
  canalId: string | null
  cargos: CargoHierarquia[]
  imagens: ImagemPainel[]       // imagens soltas: "topo" | "titulo" | "cargo:<roleId>" | "fim"
  versao: number
  atualizadoPor: string | null
  atualizadoEm: string | null
  publicado: boolean
}
export interface PreviaPainel {
  titulo: string; texto: string; logo: string | null; rodape: string; rodapeIcone: string | null
  resumo?: string | null
  blocos?: { titulo: string; membros: string[]; vago: boolean }[]
  imagens?: ImagemPainel[]      // "topo" | "titulo" | "bloco:<n>" (depois do bloco n) | "fim"
}
export interface EstadoPainel {
  ultimaAtualizacao: string | null
  erro: 'sem_acesso' | 'discord' | 'nao_configurado' | null
  modo: 'todos' | 'contas' | null
  previa: PreviaPainel | null
}
export interface PainelResumo { id: number; titulo: string; publicado: boolean }
export interface HierarquiaResp { config: HierarquiaConfig; estado: EstadoPainel; discordConfigurado: boolean; paineis: PainelResumo[] }
export interface DiscordServidor {
  servidor: string
  bot: { nome: string }
  cargos: { id: string; nome: string; cor: number; posicao: number }[]
  canais: { id: string; nome: string }[]
  emojis: { nome: string; codigo: string; url: string }[]
}
export type SalvarHierarquia = Omit<HierarquiaConfig, 'atualizadoPor' | 'atualizadoEm' | 'publicado'>

export const chavePainel = (id: number) => ['hierarquia', 'painel', id] as const
const guardar = (dados: HierarquiaResp) => queryClient.setQueryData(chavePainel(dados.config.id), dados)

export function useHierarquia(id: number) {
  return useQuery<HierarquiaResp>({
    queryKey: chavePainel(id),
    queryFn: async () => (await api.get<HierarquiaResp>(`/hierarquia/paineis/${id}`)).data,
    // Acompanha o painel (atualizado a cada minuto) e o que outras pessoas salvam
    refetchInterval: 30_000,
    retry: false,
  })
}

export function useDiscordServidor(ativo: boolean) {
  return useQuery<DiscordServidor>({
    queryKey: ['hierarquia', 'discord'],
    queryFn: async () => (await api.get<DiscordServidor>('/hierarquia/discord')).data,
    enabled: ativo,
    staleTime: 60_000,
  })
}

export function useSalvarHierarquia() {
  return useMutation({
    mutationFn: async ({ id, ...body }: SalvarHierarquia) => (await api.put<HierarquiaResp>(`/hierarquia/paineis/${id}`, body)).data,
    onSuccess: dados => {
      guardar(dados)
      // O servidor publica no Discord ~1 s depois de salvar: busca a prévia atualizada em seguida
      setTimeout(() => { void queryClient.invalidateQueries({ queryKey: chavePainel(dados.config.id), exact: true }) }, 2500)
    },
  })
}

export function usePublicarHierarquia() {
  return useMutation({
    mutationFn: async (id: number) => (await api.post<HierarquiaResp>(`/hierarquia/paineis/${id}/publicar`)).data,
    onSuccess: guardar,
  })
}

export function useCriarHierarquia() {
  return useMutation({
    mutationFn: async (titulo: string) => (await api.post<HierarquiaResp>('/hierarquia/paineis', { titulo })).data,
    onSuccess: guardar,
  })
}

export function useExcluirHierarquia() {
  return useMutation({
    mutationFn: async (id: number) => (await api.delete<HierarquiaResp>(`/hierarquia/paineis/${id}`)).data,
    onSuccess: (dados, id) => { queryClient.removeQueries({ queryKey: chavePainel(id), exact: true }); guardar(dados) },
  })
}
