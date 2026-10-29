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
  patenteDPD: string
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
  setor?: string                      // setor/subunidade (ex.: COD, DNARC) — nome do setor da setagem
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
  password?: string   // LEGADO (login por senha removido): nunca lido nem sai da API
  senhaPadrao?: boolean   // LEGADO
  sessaoVersao?: number   // sobe ao "sair de todos": invalida tokens antigos
  cadastroSetagem?: { codinome: string; passaporte: string; patente: string; setor?: string }  // dados da setagem (pré-preenchem o cadastro)
  topicoRegistro?: string    // tópico da pessoa no fórum de registro (setagem); nunca sai da API
  imagensAnuncio?: (string | null)[]  // 2 fotos salvas do Gerar anúncio ("/img/<id>.<ext>"), para colar no boletim do RP
}

/** Pedido de acesso criado no primeiro login pelo Discord; o comando aprova e vira conta. */
export interface SolicitacaoAcesso {
  id: number
  discordId?: string  // ausente só em pedidos antigos (login por senha), que não podem mais ser aprovados
  username: string    // usuário do Discord
  nome: string        // nome de exibição do Discord
  avatar?: string     // foto do Discord (URL do CDN)
  senha?: string      // LEGADO
  criadoEm: string
  setagem?: DadosSetagem   // pedido feito pelo botão "Solicitar set" no Discord
}

export interface LinkPerfil {
  rotulo: string
  url: string        // só http/https (security/perfil.ts)
  emoji?: string
}

/** Arquivo enviado do computador (PDF, documento, imagem…). Bytes ficam na coleção avulsa `arquivos`. */
// ── Árvore de investigação (quadro de vínculos) ─────────────────────────────
/** Foto de um card: arquivo enviado (área "arvore") OU link http/https. */
export type FotoArvore = { arquivo: ArquivoRef } | { url: string }
export type LadoArvore = 'cima' | 'direita' | 'baixo' | 'esquerda'
export interface NoArvore {
  id: number
  x: number; y: number               // posição no quadro
  nome: string; apelido: string; telefone: string; funcao: string; faccao: string
  endereco: string; veiculo: string; observacoes: string; status: string
  foto: FotoArvore | null
  fotos: FotoArvore[]                // fotos extras
  criadoPor: string; atualizadoEm: string
}
/** Cada ponta da linha liga num CARD (de + lado) ou num PONTO de outra linha (deLig + deT, 0–1 ao longo dela). */
export interface LigacaoArvore {
  id: number
  de: number | null; deLado: LadoArvore | null; deLig?: number | null; deT?: number | null
  para: number | null; paraLado: LadoArvore | null; paraLig?: number | null; paraT?: number | null
  cor: string                        // #rrggbb (padrão branco)
  rotulo: string
  curva: { dx: number; dy: number } | null   // deslocamento do meio da linha (arrastável)
}
/** Anexo do chat: foto/vídeo enviado (arquivo), imagem por link ou link de vídeo (aberto por quem recebe). */
export type AnexoArvore = FotoArvore | { video: string }
export interface MensagemArvore { id: number; contaId: number; autor: string; texto: string; em: string; anexo?: AnexoArvore }
export interface Arvore {
  id: number
  nome: string
  descricao: string
  inqueritoId: number | null
  nos: NoArvore[]; nextNoId: number
  ligacoes: LigacaoArvore[]; nextLigacaoId: number
  mensagens: MensagemArvore[]; nextMensagemId: number
  versao: number                      // sobe a cada mudança (o quadro dos outros atualiza)
  participantes?: number[]            // contas que veem a árvore (sem o campo = árvore antiga, aberta); admins veem todas
  investigacaoId?: number             // pedido do Registro de Investigação que gerou a árvore
  criadoPorId?: number
  criadoPor: string; criadoEm: string; atualizadoPor: string; atualizadoEm: string
}

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
  | 'relatorio' | 'boletim' | 'inquerito' | 'galeria' | 'seguranca' | 'investigacao'

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

export type CampoPerfil = 'policial' | 'badge' | 'passaporte' | 'patenteDPD' | 'patenteInterna' | 'nivel' | 'codinome' | 'setor'

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

export interface DuData {
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
  migracaoDpd?: boolean    // flag: patentes já convertidas para o formato DPD
  migracaoSetores?: boolean  // flag: patentes da DU e setores (COD, DNARC, COD/DNARC) já cadastrados
  patentesDuVersao?: number  // versão da lista de patentes da DU já aplicada (2 = com Supervisor of Detectives)
  logo: string
  membrosOrder: number[]
  canais: CanaisDiscord
  notificacoes: Notificacao[]
  nextNotifId: number
  solicitacoesPerfil: SolicitacaoPerfil[]
  nextSolPerfilId: number
  solicitacoesAcesso: SolicitacaoAcesso[]
  nextSolAcessoId: number
  livros?: Livro[]          // Cursos Internos: biblioteca (guardada no documento de configuração)
  nextLivroId?: number
  relatorios: Relatorio[]
  boletins: Boletim[]
  inqueritos: Inquerito[]
  arvores?: Arvore[]               // árvores de investigação (quadro de vínculos)
  nextArvoreId?: number
  registrosInvestigacao?: RegistroInvestigacao[]   // pedidos do módulo Registro de Investigação
  nextRegistroInvestigacaoId?: number
  galeria: FotoGaleria[]
  nextRelatorioId: number
  nextBoletimId: number
  nextInqueritoId: number
  nextFotoId: number
  painelApreensoes?: PainelApreensoes
  historicoRankings?: RankingArquivado[]
  cargosAdv?: CargosAdv
  protocolo?: Protocolo                  // livro (flipbook) do módulo Protocolo
  hierarquia?: Hierarquia                // painel principal (id 0)
  hierarquiasExtras?: Hierarquia[]       // painéis a mais, cada um com id ≥ 1
  nextHierarquiaId?: number
  setagem?: Setagem
}

export type MotivoInvestigacao = 'investigacao' | 'coleta_info' | 'info' | 'outro'
export type LocalInvestigacao = 'capital' | 'detroit' | 'ambas'
export type AprovacaoInvestigacao = 'pendente' | 'autorizada' | 'negada'
export type AndamentoInvestigacao = 'aguardando' | 'em_andamento' | 'pausada' | 'concluida' | 'cancelada'

/** Mudança de andamento feita pelo responsável ou por um participante. */
export interface MudancaAndamento { em: string; por: string; de: AndamentoInvestigacao; para: AndamentoInvestigacao; nota?: string }

/**
 * Pedido de investigação (privado): quem registra é o responsável e marca os participantes
 * (membros da unidade, inclusive ele mesmo). A gestão decide a aprovação; o andamento só o
 * responsável e os participantes mudam.
 */
export interface RegistroInvestigacao {
  id: number
  nome: string
  data: string                        // YYYY-MM-DD
  hora?: string                       // HH:MM (pedidos antigos podem não ter)
  participantes: number[]             // IDs de membros
  motivo: MotivoInvestigacao
  detalhes: string
  local: LocalInvestigacao
  aprovacao: AprovacaoInvestigacao
  andamento: AndamentoInvestigacao
  autorContaId: number
  autorNome: string
  criadoEm: string
  decididoPor?: string
  decididoEm?: string
  observacao?: string                 // nota da decisão (ex.: por que foi negada)
  arvoreId?: number                   // árvore de investigação criada na aprovação (responsável + participantes)
  historico: MudancaAndamento[]
}

/** Livro do módulo Protocolo: flipbook do Heyzine (único embed permitido pela CSP) + capítulos mostrados acima. */
export interface Protocolo {
  flipbook: string
  secoes: string[]
  // Painel no Discord (mensagem do bot com os capítulos e o botão que abre o livro)
  canalId?: string
  mensagemId?: string
  descricao?: string
  imagens?: ImagemPainel[]
  atualizadoPor?: string
  atualizadoEm?: string
}

/** Cargos do Discord que espelham cada quadradinho de advertência (ID do cargo por nível). */
export type CargosAdv = Partial<Record<'1' | '2' | '3', string>>

export interface AuthPayload {
  scope?: string
  sv?: number   // versão de sessão da conta quando o token foi emitido
  contaId: number
  username: string
  nivel: Nivel
}

/** Um cargo do servidor do Discord exibido no painel de hierarquia (a ordem da lista é a posição). */
export interface CargoHierarquia {
  roleId: string     // cargo do Discord
  nome: string       // nome exibido no painel
  emoji?: string     // "logo" do cargo no painel (emoji)
}

/**
 * Painel de hierarquia: mensagem do bot num canal do Discord, editada sozinha
 * (a cada minuto) conforme os cargos do servidor. `versao` controla edições simultâneas.
 */
/**
 * Imagem solta num painel V2, na posição escolhida: "topo", "titulo" (depois do título),
 * "cargo:<roleId>" (depois de um cargo da hierarquia), "passos"/"texto"/"botao" (setagem: depois do passo a passo, antes e depois do botão) ou "fim" (antes do rodapé).
 * `url`: upload (data URL, conferido pelos bytes) ou link http/https.
 */
export interface ImagemPainel {
  posicao: string
  url: string
  lado?: 'esquerda' | 'direita'   // ausente = largura toda; esquerda/direita = metade do painel
}

export interface Hierarquia {
  id?: number                // painéis extras (o principal não guarda id: é o 0)
  imagens?: ImagemPainel[]
  titulo: string             // nome da unidade (título do painel)
  logo?: string              // logo (miniatura do painel): imagem enviada (data URL) ou link http/https
  rodapeTexto?: string       // texto do rodapé (padrão: nome do servidor)
  rodapeIcone?: string       // foto do rodapé: imagem enviada ou link (padrão: foto do bot)
  canalId?: string           // canal onde o painel é publicado
  mensagemId?: string        // mensagem do painel (editada a cada mudança)
  cargos: CargoHierarquia[]
  versao: number
  atualizadoPor?: string
  atualizadoEm?: string
}

/** Patente da setagem: prefixo do apelido + cargo do Discord dado na aprovação (+ cargo do site opcional). */
export interface PatenteSetagem {
  id: number
  nome: string
  prefixo: string
  roleIds: string[]   // 1 ou 2 cargos do Discord dados na aprovação
  roleId?: string     // LEGADO (antes era um cargo só): lido como roleIds
  cargoPermId?: number
}

/** Setor / subunidade (ex.: COD, DNARC ou o combinado COD/DNARC): 1 ou 2 cargos do Discord dados na aprovação. */
export interface SetorSetagem {
  id: number
  nome: string
  roleIds: string[]
}

/** Dados enviados pela pessoa no modal "Solicitar set" do Discord. */
export interface DadosSetagem {
  codinome: string
  passaporte: string
  patenteId: number
  setorId?: number    // setor escolhido no modal (quando há setores configurados)
  apelido: string     // apelido aplicado no servidor (modelo com prefixo/codinome/ID)
  em: string
  status?: 'pendente' | 'correcao'   // correcao = quem aprova pediu para refazer o preenchimento
  motivoCorrecao?: string
  correcaoPor?: string
  canalTemp?: string     // canal temporário do pedido (apagado ao aprovar/reprovar)
  mensagemTemp?: string  // painel do pedido nesse canal
}

/**
 * Setagem: painel com botão no Discord (canal escolhido) → modal com codinome, passaporte e patente.
 * O apelido muda na hora; o cargo do Discord e o acesso ao site só depois da aprovação no site.
 */
export interface Setagem {
  titulo: string
  descricao?: string
  categoriaId?: string           // categoria onde os canais temporários dos pedidos são criados
  forumRegistroId?: string       // fórum onde cada membro aprovado ganha um tópico com o cadastro e toda atualização
  canalId?: string               // canal do painel "Solicitar set"
  mensagemId?: string
  aprovadores?: string[]         // cargos do Discord que aprovam/reprovam/pedem correção
  imagem?: string                // imagem do rodapé (à direita): upload ou link; vazio = foto do bot
  rodapeTexto?: string           // texto do rodapé; vazio = nome do servidor
  imagens?: ImagemPainel[]       // imagens soltas no painel, cada uma na posição escolhida
  modeloApelido: string          // ex.: "{prefixo} {codinome} | {id}"
  patentes: PatenteSetagem[]
  nextPatenteId: number
  setores?: SetorSetagem[]       // setores/subunidades (select do modal e da dashboard)
  nextSetorId?: number
  advertencias?: string[]        // cargos do Discord de ADV 1, 2 e 3 (criados automaticamente se faltarem)
  versao: number
  atualizadoPor?: string
  atualizadoEm?: string
}
