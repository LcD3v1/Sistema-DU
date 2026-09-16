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
  password: string
  nivel: Nivel
  ativo: boolean
  discordId?: string
  discordUsername?: string
  avisoLastSeen?: number
  membroId?: number
  avatar?: string
  banner?: string
  onboarded?: boolean
  cargoPermId?: number
}

export interface PermArea {
  ver: boolean
  editar: boolean
}

export interface CargoPermissao {
  id: number
  nome: string
  padrao?: boolean
  admin?: boolean   // "acesso total" — administra o sistema (contas, cargos, aprovações)
  permissoes: Record<string, PermArea>
}

export interface Solicitacao {
  id: number
  username: string
  senha: string       // já com hash
  nome: string
  criadoEm: string
}

export interface Aviso {
  id: number
  titulo: string
  mensagem: string
  autor: string
  criadoEm: string
}

export interface Fardamento {
  id: number
  patente: string
  titulo: string
  imagem: string        // data URL (base64) ou URL
  observacoes: string
  criadoEm: string
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

export interface Ausencia {
  id: number
  memberId?: number
  nome: string
  dataInicio: string
  dataFim: string
  motivo: string
  criadoEm: string
}

export interface SituacaoAnuncio {
  id: number
  label: string
  titulo: string
  texto: string
}

export interface FastData {
  membros: Membro[]
  acoes: Acao[]
  qrus: string[]
  anuncioSituacoes: SituacaoAnuncio[]
  recrutas: Recruta[]
  recCfg: RecCfg
  patentes: string[]
  cargos: string[]
  contas: Conta[]
  solicitacoes: Solicitacao[]
  ausencias: Ausencia[]
  avisos: Aviso[]
  fardamentos: Fardamento[]
  cargosPermissao: CargoPermissao[]
  nextMemId: number
  nextAcId: number
  nextRecId: number
  nextContaId: number
  nextAusId: number
  nextSitId: number
  nextAvisoId: number
  nextSolId: number
  nextFardId: number
  nextCargoPermId: number
  nivelMigrado?: boolean   // flag: migração nível→cargos já executada
  logo: string
  membrosOrder: number[]
}

export interface AuthPayload {
  contaId: number
  username: string
  nivel: Nivel
}
