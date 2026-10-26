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
  codinome?: string                   // codinome do investigador (destaque no perfil e na carteirinha)
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
  discordId?: string   // pessoa do servidor do Discord sem cadastro na unidade (só para mencionar; nunca sai da API)
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
  aprovadaEm?: string        // ISO — hora da aprovação (corte do reset do ranking)
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
  links?: LinkPerfil[]       // links personalizados do perfil (TikTok, Instagram, Twitch…) — públicos
  emojisPerfil?: string[]    // emojis de destaque ao lado do nome — públicos
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

export interface LinkPerfil {
  rotulo: string
  url: string        // só http/https (security/perfil.ts)
  emoji?: string
}

/** Arquivo enviado do computador (PDF, documento, imagem…). Bytes ficam na coleção avulsa `arquivos`. */
export interface ArquivoRef {
  id: string         // aleatório (144 bits) — só sai da API para quem vê o registro
  nome: string
  mime: string
  tamanho: number
}

/** Link extra de um registro (documento, evidência, vídeo…). */
export interface LinkRegistro {
  rotulo: string
  url: string        // só http/https (security/perfil.ts → ehLinkPerfil)
}

/** Histórico de alterações de um registro investigativo (teto de itens, nunca editado). */
export interface AlteracaoRegistro {
  em: string         // ISO
  por: string
  acao: 'criado' | 'editado' | 'status'
  detalhe?: string
}

export interface RegistroBase {
  id: number
  numero: string              // identificação exibida (ex.: BO-DU-2026-0001)
  titulo: string
  investigadores: number[]    // IDs de membros responsáveis
  links: LinkRegistro[]
  arquivos: ArquivoRef[]
  autorContaId: number        // interno — não sai da API
  autorNome: string
  criadoEm: string
  atualizadoEm?: string
  historico: AlteracaoRegistro[]
}

/** Relatório produzido por um investigador durante uma investigação. */
export interface Relatorio extends RegistroBase {
  tipo: string                // Campo, Vigilância, Entrevista, Análise…
  data: string                // YYYY-MM-DD
  conteudo: string
  inqueritoId?: number
  boletimId?: number
  sigiloso: boolean           // só autor, investigadores citados e gestão de relatórios veem
}

export type StatusBoletim = 'aberto' | 'em_investigacao' | 'concluido' | 'arquivado'

/** Boletim produzido pela unidade. */
export interface Boletim extends RegistroBase {
  status: StatusBoletim
  data: string                // YYYY-MM-DD (data dos fatos)
  local: string
  descricao: string
  observacoes: string
  imagens: string[]           // links http/https de imagens
  inqueritoId?: number
}

export type StatusInquerito = 'em_andamento' | 'concluido' | 'arquivado'

/** Inquérito do Arquivo de Inquéritos (mesmo modelo de estante dos Cursos Internos). */
export interface Inquerito extends RegistroBase {
  status: StatusInquerito
  categoria: string
  descricao: string
  envolvidos: string          // suspeitos, vítimas, testemunhas (texto livre)
  capa: string                // link de imagem ou ''
  cor: string
}

/** Foto da Galeria da DU. */
export interface FotoGaleria {
  id: number
  imagem: string              // link http/https; '' quando a foto foi enviada (arquivo)
  arquivo?: ArquivoRef
  titulo: string
  descricao: string
  categoria: string
  data: string                // YYYY-MM-DD
  autorContaId: number        // interno — não sai da API
  autorNome: string
  criadoEm: string
}

/** Livro da biblioteca de Cursos Internos: um link (PDF, Drive, Docs, site…) e/ou arquivos enviados. */
export interface Livro {
  id: number
  titulo: string
  autor: string
  descricao: string
  categoria: string
  url: string        // só http/https (security/perfil.ts → ehLinkPerfil) ou '' quando há arquivo
  arquivos?: ArquivoRef[]
  capa: string       // link http/https de imagem ou '' (capa gerada com título + cor)
  cor: string        // cor da capa gerada (#rrggbb)
  criadoEm: string
  criadoPor: string  // interno (auditoria) — não sai da API
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
  /** Cópia postada pelo bot no canal de avisos (para apagar junto). */
  discord?: { canalId: string; mensagemId: string }
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
  | 'aviso' | 'fardamento' | 'recrutamento' | 'apreensao' | 'exoneracao' | 'membro' | 'curso'
  | 'relatorio' | 'boletim' | 'inquerito' | 'galeria'

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

export type CampoPerfil = 'policial' | 'badge' | 'passaporte' | 'patenteNPD' | 'patenteInterna' | 'nivel' | 'codinome'

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
  avisos?: string       // canal de texto onde todo aviso publicado é repostado pelo bot
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

/** Ranking guardado automaticamente a cada reset do painel (histórico de rankings). */
export interface RankingArquivado {
  id: number
  inicio?: string         // ISO — reset anterior (ausente = desde o começo)
  fim: string             // ISO — momento do reset
  total: number           // apreensões no período
  linhas: { nome: string; total: number }[]
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
  livros?: Livro[]          // Cursos Internos: biblioteca (guardada no documento de configuração)
  nextLivroId?: number
  relatorios: Relatorio[]
  boletins: Boletim[]
  inqueritos: Inquerito[]
  galeria: FotoGaleria[]
  nextRelatorioId: number
  nextBoletimId: number
  nextInqueritoId: number
  nextFotoId: number
  painelApreensoes?: PainelApreensoes
  historicoRankings?: RankingArquivado[]
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
