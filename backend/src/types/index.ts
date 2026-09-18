export type Nivel = 'admin' | 'moderador' | 'membro' | 'view_only'
export type StatusMembro = 'Ativo' | 'Inativo' | 'Ausência'
export type ResultadoAcao = 'Vitória' | 'Derrota' | 'Empate'
/** convencional = apreensão (sem vitória/derrota); fechado = ação (com vitória/derrota) */
export type TipoQru = 'convencional' | 'fechado'
export type ResultadoRecruita = 'Aprovado' | 'Reprovado'

export interface Membro {
  guildId?: string
  botId?: string
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
  discordThreadId?: string   // postagem no fórum de Registro
  registroCanal?: string     // canal de texto onde o cadastro foi postado sem tópico (evita repostar)
  advertencias?: Advertencia[]
  historicoCargos?: MudancaCargo[]
  nivel?: number                      // nível informado pelo próprio membro (fonte única)
}

export interface MudancaCargo {
  data: string                        // ISO
  tipo: 'promocao' | 'rebaixamento'
  de: string
  para: string
  por: string
}

export type NivelAdvertencia = 1 | 2 | 3

export interface Advertencia {
  nivel: NivelAdvertencia
  motivo: string
  autor: string
  data: string        // ISO
  removida?: boolean  // registro de retirada daquele nível (o histórico nunca é apagado)
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
  guildId?: string
  botId?: string
  id: number
  data: string
  qru: string
  tipo?: TipoQru              // ausente = registro antigo (tratado como fechado, tem resultado)
  resultado?: ResultadoAcao   // só em QRU fechado
  participants: ParticipanteAcao[]
  participantesExtras?: ParticipanteExterno[]
  comandante?: string
  local?: string
  imagem?: string
  status?: 'pendente' | 'aprovada'
  discordThreadId?: string   // postagem no fórum de Apreensões
  criadoPorContaId?: number
}

export interface Conta {
  guildId?: string
  botId?: string
  discordRoleIds?: string[]
  membroArquivado?: Membro
  id: number
  username: string
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
  nomeServidor?: string      // apelido no servidor do Discord da unidade
  avatarServidor?: string    // foto no servidor (URL do CDN do Discord)
  avatarServidorEm?: string  // quando a foto do servidor mudou
  avatarEm?: string          // quando a foto enviada no perfil mudou
  exonerado?: boolean        // perde o acesso e vê o aviso de exoneração ao entrar
  exoneradoEm?: string
  exoneradoMotivo?: string
  termosAceitos?: { versao: string; em: string }  // última versão dos termos aceita (ISO)
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
  dev?: boolean     // acima do admin: faz tudo. Só um dev concede/remove este cargo.
  permissoes: Record<string, PermArea>
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

export type StatusAusencia = 'pendente' | 'aprovada' | 'recusada' | 'encerrada'

export interface Ausencia {
  id: number
  memberId?: number
  nome: string
  dataInicio: string
  dataFim: string
  motivo: string
  criadoEm: string
  status?: StatusAusencia     // ausente em dados legados = 'aprovada'
  solicitadoPor?: string
  decididoPor?: string
  encerradaEm?: string
  encerradaPor?: string
  motivoRecusa?: string
  inicioNotificado?: boolean
}

export interface SituacaoAnuncio {
  id: number
  label: string
  titulo: string
  texto: string
}

export type TipoNotificacao =
  | 'solicitacao' | 'aprovada' | 'recusada' | 'pendente_aprovacao'
  | 'promocao' | 'rebaixamento' | 'advertencia' | 'ausencia' | 'cadastro'
  | 'aviso' | 'fardamento' | 'recrutamento' | 'apreensao' | 'exoneracao' | 'membro'

export interface Notificacao {
  id: number
  contaId: number
  tipo: TipoNotificacao
  titulo: string
  mensagem: string
  link?: string
  lida: boolean
  criadaEm: string
}

export type CampoPerfil = 'policial' | 'badge' | 'passaporte' | 'patenteNPD' | 'patenteInterna' | 'nivel'

export interface SolicitacaoPerfil {
  id: number
  membroId: number
  contaId: number
  alteracoes: { campo: CampoPerfil; de: string; para: string }[]
  status: 'pendente' | 'aprovada' | 'recusada'
  criadoEm: string
  decididoPor?: string
  decididoEm?: string
  motivoRecusa?: string
}

export interface CanaisDiscord {
  registro?: string     // ID do canal Fórum de registro
  apreensoes?: string   // ID do canal Fórum de apreensões
  carteira?: string     // ID do canal Fórum onde as carteirinhas são postadas
  rankingApreensoes?: string  // canal do painel de ranking de apreensões
}

/**
 * Painel fixo de ranking de apreensões: uma única mensagem no canal, EDITADA a
 * cada apreensão aprovada (nunca repostada). `resetadoEm` zera a contagem sem
 * apagar nada — as apreensões continuam no histórico, só saem deste placar.
 */
export interface PainelApreensoes {
  canalId?: string
  mensagemId?: string
  resetadoEm?: string     // ISO — só conta apreensões a partir daqui
  resetadoPor?: string
  resetadoEmData?: string
}

export interface FastData {
  membros: Membro[]
  acoes: Acao[]
  qrus: string[]
  qrusFechados?: string[]     // QRUs do tipo fechado (ação); as demais são convencionais
  anuncioSituacoes: SituacaoAnuncio[]
  recrutas: Recruta[]
  recCfg: RecCfg
  patentes: string[]
  cargos: string[]
  contas: Conta[]
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
  nextFardId: number
  nextCargoPermId: number
  nivelMigrado?: boolean   // flag: migração nível→cargos já executada
  logo: string
  membrosOrder: number[]
  canais: CanaisDiscord
  notificacoes: Notificacao[]
  nextNotifId: number
  solicitacoesPerfil: SolicitacaoPerfil[]
  nextSolPerfilId: number
  painelApreensoes?: PainelApreensoes
  cargosAdv?: CargosAdv
}

/** Cargos do Discord que espelham cada quadradinho de advertência (ID do cargo por nível). */
export type CargosAdv = Partial<Record<'1' | '2' | '3', string>>

export interface AuthPayload {
  scope?: string
  contaId: number
  username: string
  nivel: Nivel
}
