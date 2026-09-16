export type Nivel = 'admin' | 'moderador' | 'membro' | 'view_only'
export type StatusMembro = 'Ativo' | 'Inativo' | 'Ausência'
export type ResultadoAcao = 'Vitória' | 'Derrota' | 'Empate'
export type ResultadoRecruita = 'Aprovado' | 'Reprovado'

export interface Membro {
  id: number
  badge: string
  passaporte: string
  policial: string
  patenteNPD: string
  patenteInterna: string
  status: StatusMembro
  entrada: string
  promocao: string
  adv1: boolean
  adv2: boolean
  adv3: boolean
  ordem?: number
  advertencias?: Advertencia[]
  // Calculados pelo backend a partir da conta vinculada
  contaId?: number | null
  cargoPermId?: number | null
  cargoNome?: string
  ausenteAte?: string | null
}

export interface Advertencia {
  nivel: 1 | 2 | 3
  motivo: string
  autor: string
  data: string
}

export interface CargoHierarquia {
  id: number
  nome: string
  admin: boolean
  posicao: number
}

export interface ParticipanteAcao {
  memberId: number
  patenteUnidade: string
}

export interface ParticipanteExterno {
  nome: string
  patente?: string
}

export interface Acao {
  id: number
  data: string
  qru: string
  resultado: ResultadoAcao
  participants: ParticipanteAcao[]
  participantesExtras?: ParticipanteExterno[]
  comandante?: string
  local?: string
  imagem?: string
  status?: 'pendente' | 'aprovada'
}

export interface Conta {
  id: number
  username: string
  nivel: Nivel
  ativo: boolean
  cargoPermId?: number | null
  discordId?: string
  discordUsername?: string
  onboarded?: boolean
  exonerado?: boolean
  exoneradoMotivo?: string
}

export interface CategoriaRecrutamento {
  id: number
  nome: string
  peso: number
}

export interface RecCfg {
  notaMinima: number
  categorias: CategoriaRecrutamento[]
}

export interface AvaliacaoIndividual {
  contaId: number
  username: string
  scores: Record<string, number>
  total: number
  observacoes?: string
  data: string
}

export interface Recruta {
  id: number
  nome: string
  data: string
  avaliacoes: AvaliacaoIndividual[]
  resultado?: ResultadoRecruita
  status: 'aberto' | 'fechado'
  observacoes?: string
}

export interface AuthUser {
  contaId: number
  username: string
  nivel: Nivel
}

export interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

export interface AcoesResponse {
  acoes: Acao[]
  total: number
  page: number
  limit: number
}
