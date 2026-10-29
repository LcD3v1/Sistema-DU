import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/lib/axios'
import { queryClient } from '@/lib/queryClient'
import type { ImagemPainel } from '@/lib/imagensPainel'

export interface PatenteSetagem { id: number | null; nome: string; prefixo: string; roleIds: string[]; cargoPermId: number | null }
/** Setor/subunidade: 1 ou 2 cargos do Discord (o combinado, ex.: COD/DNARC, leva os 2). */
export interface SetorSetagem { id: number | null; nome: string; roleIds: string[] }
export interface SetagemConfig {
  titulo: string
  descricao: string | null
  categoriaId: string | null      // categoria dos canais temporários dos pedidos
  canalId: string | null          // canal do painel
  aprovadores: string[]           // cargos do Discord que avaliam os pedidos
  imagem: string | null           // imagem do rodapé (upload ou link)
  rodapeTexto: string | null
  imagens: ImagemPainel[]         // imagens soltas: "topo" | "titulo" | "passos" | "texto" (antes do botão) | "botao" (depois dele) | "fim"
  modeloApelido: string
  patentes: PatenteSetagem[]
  setores: SetorSetagem[]
  advertencias: string[]          // cargos de ADV 1, 2 e 3 (vazio = criado automaticamente)
  versao: number
  atualizadoPor: string | null
  atualizadoEm: string | null
  publicado: boolean
}
export interface EstadoSetagem { erro: 'sem_acesso' | 'discord' | 'sem_canal' | 'sem_patentes' | 'nao_configurado' | null; ultimaAtualizacao: string | null; botConectado: boolean }

/** Motivo, em texto, de o painel não ter sido publicado. */
export const MOTIVO_ERRO_SETAGEM: Record<NonNullable<EstadoSetagem['erro']>, string> = {
  sem_acesso: 'O bot não tem permissão para postar no canal escolhido.',
  discord: 'O Discord não respondeu. Tente de novo em instantes.',
  sem_canal: 'Escolha o canal do painel e salve.',
  sem_patentes: 'Cadastre ao menos uma patente e salve.',
  nao_configurado: 'O Discord não está configurado no servidor (.env).',
}
export interface SetagemResp { config: SetagemConfig; estado: EstadoSetagem; pendentes: number; discordConfigurado: boolean }
export interface SetagemDiscord {
  categorias: { id: string; nome: string }[]
  canais: { id: string; nome: string; categoriaId: string | null }[]
  cargos: { id: string; nome: string; cor: number; bloqueado: boolean }[]
  cargosSite: { id: number; nome: string }[]
}
export type SalvarSetagem = Omit<SetagemConfig, 'atualizadoPor' | 'atualizadoEm' | 'publicado' | 'modeloApelido' | 'setores'>

const mesclar = (dados: Partial<SetagemResp>) =>
  queryClient.setQueryData(['setagem'], (a: SetagemResp | undefined) => (a ? { ...a, ...dados } : a))

export function useSetagem() {
  return useQuery<SetagemResp>({
    queryKey: ['setagem'],
    queryFn: async () => (await api.get<SetagemResp>('/setagem')).data,
    refetchInterval: 30_000,
  })
}

export function useSetagemDiscord(ativo: boolean) {
  return useQuery<SetagemDiscord>({
    queryKey: ['setagem', 'discord'],
    queryFn: async () => (await api.get<SetagemDiscord>('/setagem/discord')).data,
    enabled: ativo,
    staleTime: 60_000,
  })
}

export function useSalvarSetagem() {
  return useMutation({
    mutationFn: async (body: SalvarSetagem) => (await api.put<Pick<SetagemResp, 'config' | 'estado'>>('/setagem', body)).data,
    onSuccess: mesclar,
  })
}

export function usePublicarSetagem() {
  return useMutation({
    mutationFn: async () => (await api.post<Pick<SetagemResp, 'estado'>>('/setagem/publicar')).data,
    onSuccess: mesclar,
  })
}

/** Setores (Configurações → Setores): rota própria; a versão confere edição simultânea. */
export function useSalvarSetores() {
  return useMutation({
    mutationFn: async (body: { setores: SetorSetagem[]; versao: number }) => (await api.put<Pick<SetagemResp, 'config'>>('/setagem/setores', body)).data,
    onSuccess: mesclar,
  })
}

/** Confere os cargos de ADV 1, 2 e 3 no Discord e cria os que faltarem (sem permissão nenhuma). */
export function useCriarCargosAdvertencia() {
  return useMutation({
    mutationFn: async () => (await api.post<Pick<SetagemResp, 'config'>>('/setagem/advertencias')).data,
    onSuccess: mesclar,
  })
}

/** Patentes e setores para os selects (só nomes) — qualquer usuário logado. */
export function useOpcoesPerfil() {
  return useQuery<{ patentes: string[]; setores: string[] }>({
    queryKey: ['opcoes-perfil'],
    queryFn: async () => (await api.get('/auth/me/opcoes-perfil')).data,
    staleTime: 60_000,
  })
}
