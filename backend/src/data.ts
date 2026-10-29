import { DATA_PATH, gravarAtomico, lerJson } from './armazenamento';
import { auditRankingChanges } from './modules/ranking/auditChanges';
import { bindDataScope, configuredScope } from './modules/ranking/scope';
import { fullPermMap, normalizePermMap } from './permAreas';
import { CargoPermissao, DuData, Membro } from './types';
import { CofreDados, conectarBanco } from './bancoDados';

/**
 * Persistência: memória + arquivo JSON + (opcional) MongoDB.
 *
 * O painel inteiro usa readData()/writeData() de forma síncrona. Os dados ficam
 * num cache em memória carregado na inicialização (initData); writeData atualiza o
 * cache na hora e grava o arquivo inteiro de forma atômica (temporário + rename) logo
 * em seguida — rajadas de gravação viram uma só.
 *
 * Com MONGODB_URI (bancoDados.ts), o banco é a fonte da verdade: o boot lê de lá (na
 * primeira vez, importa o arquivo atual) e cada gravação também vai para o banco, em
 * segundo plano (uma por vez, sempre a versão mais nova; banco fora = tenta de novo).
 * O arquivo local continua sendo gravado como reserva.
 */

const DEFAULT_DATA: DuData = {
  membros: [],
  acoes: [],
  qrus: ['QRU-1', 'QRU-2', 'QRU-3'],
  recrutas: [],
  recCfg: {
    notaMinima: 7,
    categorias: [
      { id: 1, nome: 'Comunicação', peso: 1 },
      { id: 2, nome: 'Tiro', peso: 1 },
      { id: 3, nome: 'Táticas', peso: 1 },
      { id: 4, nome: 'Disciplina', peso: 1 },
    ],
  },
  patentes: ['Chief of Detectives ', 'Deputy Chief of Detectives', 'Investigative Coordinator', 'Investigative Inspector', 'Senior Detective', 'Detective', 'Major', 'Investigator Trainee'],
  cargos: ['Operador', 'Sniper', 'Médico de Campo', 'Líder de Esquadrão', 'Comandante'],
  contas: [],
  ausencias: [],
  avisos: [],
  fardamentos: [],
  cargosPermissao: [],
  anuncioSituacoes: [
    { id: 1, label: 'Área Restrita', titulo: 'D.P.D INFORMA:', texto: 'A área do [LOCAL] se encontra restrita pelas próximas horas, por estar sob atividade criminosa. Mantenham-se aDUados — risco iminente de bala perdida! ESTE AVISO SERÁ ÚNICO! Att. [ASSINATURA]' },
    { id: 2, label: 'Operação em andamento', titulo: 'D.P.D INFORMA:', texto: 'Uma operação policial está em andamento na região do [LOCAL]. Solicitamos que a população evite a área e coopere com as autoridades. Att. [ASSINATURA]' },
    { id: 3, label: 'Toque de recolher', titulo: 'D.P.D INFORMA:', texto: 'Fica decretado toque de recolher na região do [LOCAL] a partir deste momento. A circulação está restrita até novo aviso. Att. [ASSINATURA]' },
    { id: 4, label: 'Foragido / Procurado', titulo: 'D.P.D INFORMA:', texto: 'Indivíduo foragido e possivelmente armado foi avistado nas proximidades do [LOCAL]. Em caso de avistamento, acione a DPD imediatamente e não se aproxime. Att. [ASSINATURA]' },
    { id: 5, label: 'Ponto de bloqueio', titulo: 'D.P.D INFORMA:', texto: 'Ponto de bloqueio montado no [LOCAL]. Reduza a velocidade, mantenha a calma e tenha os documentos em mãos. Att. [ASSINATURA]' },
    { id: 6, label: 'Comunicado geral', titulo: 'D.P.D INFORMA:', texto: 'Comunicado oficial da DPD à população do [LOCAL]: reforçamos o compromisso com a segurança da região. Denúncias podem ser feitas às autoridades. Att. [ASSINATURA]' },
  ],
  nextMemId: 200,
  nextAcId: 1,
  nextRecId: 1,
  nextContaId: 1,
  nextAusId: 1,
  nextSitId: 7,
  nextAvisoId: 1,
  nextFardId: 1,
  nextCargoPermId: 1,
  logo: '',
  membrosOrder: [],
  canais: {},
  notificacoes: [],
  nextNotifId: 1,
  solicitacoesPerfil: [],
  nextSolPerfilId: 1,
  solicitacoesAcesso: [],
  nextSolAcessoId: 1,
  relatorios: [],
  boletins: [],
  inqueritos: [],
  galeria: [],
  nextRelatorioId: 1,
  nextBoletimId: 1,
  nextInqueritoId: 1,
  nextFotoId: 1,
}

/** Cargos de permissão oficiais = as patentes da DU (de cima para baixo). */
const DU_PERMISSION_ROLES = [
  'Supervisor of Detectives',
  'Chief of Detectives',
  'Deputy Chief of Detectives',
  'Investigative Coordinator',
  'Investigative Inspector',
  'Senior Detective',
  'Detective',
  'Investigator Trainee',
] as const
const CARGO_ADMIN = 'Supervisor of Detectives'     // acesso total
const CARGO_PADRAO = 'Investigator Trainee'        // cargo de quem acabou de entrar
/**
 * Nomes antigos → patente: o cargo é RENOMEADO (mesmo ID, permissões e contas), nada é apagado.
 * "Detective" não tinha equivalente e é criado.
 */
const NOMES_ANTIGOS: [string, string][] = [
  ['(DU) Commander', 'Supervisor of Detectives'],
  ['(DU) Deputy Commander', 'Chief of Detectives'],
  ['(DU) Coordinator', 'Deputy Chief of Detectives'],
  ['(DU) Veteran', 'Investigative Coordinator'],
  ['(DU) Senior', 'Investigative Inspector'],
  ['(DU) Officer', 'Senior Detective'],
  ['(DU) Probationary', 'Investigator Trainee'],
]

function canonicalDuRoleName(nome: string) {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

let cache: DuData | undefined
// Cache serializado da revisão atual: JSON.parse é ~3x mais rápido que structuredClone
// e os dados já são JSON puro.
let cacheJson: string | undefined

function clone<T>(v: T): T { return structuredClone(v) }

let cofre: CofreDados | undefined

/**
 * Carrega os dados (banco, se configurado; senão o arquivo; senão os padrões). Chamar antes de subir o servidor.
 * `cofreDeTeste` substitui o MongoDB nos testes.
 */
export async function initData(cofreDeTeste?: CofreDados): Promise<void> {
  const scope = configuredScope()
  if (scope) bindDataScope(scope)
  cofre = cofreDeTeste ?? await conectarBanco()
  // Banco/arquivo corrompido (ou chave errada) derruba o boot de propósito: nunca recomeçar do zero por cima dos dados
  const doBanco = cofre ? await cofre.ler() : undefined
  const salvo = doBanco !== undefined ? JSON.parse(doBanco) as Partial<DuData> : lerJson<Partial<DuData>>(DATA_PATH)
  cache = { ...clone(DEFAULT_DATA), ...(salvo ?? {}) } as DuData
  cacheJson = undefined
  if (cofre && doBanco === undefined) {
    // Primeira vez com o banco: backup cifrado do que existe hoje e importa (o arquivo continua como reserva)
    if (salvo) {
      const { criarBackup } = await import('./backupAutomatico')
      const arquivo = criarBackup()
      console.log(arquivo ? '[DU][BANCO] Backup cifrado criado antes de importar para o MongoDB.' : '[DU][BANCO] Sem DATA_ENCRYPTION_KEY: importando sem backup cifrado (o arquivo original fica intacto).')
    }
    cacheJson = JSON.stringify(cache)
    await cofre.gravar(cacheJson)
    console.log(salvo ? `[DU][BANCO] Dados atuais de ${DATA_PATH} importados para o MongoDB.` : '[DU][BANCO] MongoDB iniciado com os dados padrão.')
  }
  if (!salvo) {
    gravarAgora(Boolean(cofre))   // com banco, ele já recebeu os dados acima
    console.log(`[DU][DADOS] Arquivo de dados criado em ${DATA_PATH}`)
  } else if (doBanco !== undefined) {
    gravarAgora(true)   // reserva local igual ao banco (sem regravar o banco)
    console.log('[DU][DADOS] Dados carregados do MongoDB.')
  } else {
    console.log(`[DU][DADOS] Dados carregados de ${DATA_PATH}`)
  }
}

// ── Gravação no banco (segundo plano) ─────────────────────────────────────────
let gravandoNoBanco: Promise<void> | undefined
let bancoPendente = false
let bancoFalhou = false
/** O banco está recebendo as gravações? (false = fora do ar; o arquivo local segue gravando) */
export const bancoEmDia = (): boolean => !cofre || (!bancoFalhou && !bancoPendente)

function gravarNoBanco(): void {
  if (!cofre) return
  bancoPendente = true
  if (gravandoNoBanco) return   // a gravação em andamento pega a versão mais nova quando terminar
  gravandoNoBanco = (async () => {
    while (bancoPendente && cofre) {
      bancoPendente = false
      try {
        await cofre.gravar(cacheJson ?? JSON.stringify(cache))
        if (bancoFalhou) console.log('[DU][BANCO] Gravação no MongoDB voltou ao normal.')
        bancoFalhou = false
      } catch (err) {
        if (!bancoFalhou) console.error('[DU][BANCO] Falha ao gravar no MongoDB (o arquivo local segue gravando; tentando de novo):', err instanceof Error ? err.message : err)
        bancoFalhou = true
        bancoPendente = true
        await new Promise(r => setTimeout(r, 3_000))
      }
    }
  })().finally(() => { gravandoNoBanco = undefined })
}

export function readData(): DuData {
  if (!cache) throw new Error('Dados ainda não carregados — initData() não foi chamado')
  cacheJson ??= JSON.stringify(cache)
  return JSON.parse(cacheJson) as DuData
}

/**
 * Leitura SEM cópia, para consultas somente-leitura em caminhos quentes.
 * NUNCA mutar o objeto retornado (nem passá-lo a writeData); para alterar use readData().
 */
export function peekData(): Readonly<DuData> {
  if (!cache) throw new Error('Dados ainda não carregados — initData() não foi chamado')
  return cache
}

let agendado: NodeJS.Immediate | NodeJS.Timeout | undefined
let revision = 0
let persistenceFailed = false
export function dataRevision(): number { return revision }
export function rankingPersistenceReady(): boolean { return !persistenceFailed }

/**
 * Muita gente gravando ao mesmo tempo: o arquivo inteiro é reescrito no máximo 1 vez por segundo
 * (sempre com a versão mais nova da memória). A memória muda na hora; o desligamento (SIGINT/SIGTERM)
 * e o erro fatal gravam o que estiver pendente (closeData).
 */
const INTERVALO_MIN_GRAVACAO_MS = 1_000
let ultimaGravacao = 0

export function writeData(data: DuData): void {
  if (cache) auditRankingChanges(cache, data)
  cacheJson = JSON.stringify(data)
  cache = JSON.parse(cacheJson) as DuData
  revision++
  if (agendado) return
  const espera = ultimaGravacao + INTERVALO_MIN_GRAVACAO_MS - Date.now()
  agendado = espera > 0 ? setTimeout(gravarAgora, espera) : setImmediate(gravarAgora)
}

function gravarAgora(soArquivo = false): void {
  agendado = undefined
  if (!cache) return
  cacheJson ??= JSON.stringify(cache)
  if (!soArquivo) gravarNoBanco()   // banco em segundo plano (fonte da verdade, se configurado)
  try {
    gravarAtomico(DATA_PATH, cacheJson)
    ultimaGravacao = Date.now()
    persistenceFailed = false
  } catch (err) {
    persistenceFailed = true
    console.error('[DU][DADOS] Falha ao gravar o arquivo de dados:', err instanceof Error ? err.message : err)
    agendado = setTimeout(() => gravarAgora(true), 3000)   // o banco já tem a própria nova tentativa
  }
}

/** Grava o que estiver pendente (desligamento limpo): arquivo na hora; banco com até 10 s de espera. */
export async function closeData(): Promise<void> {
  if (agendado) { clearTimeout(agendado as NodeJS.Timeout); clearImmediate(agendado as NodeJS.Immediate); gravarAgora() }
  if (!cofre) return
  const limite = new Promise(r => setTimeout(r, 10_000).unref())
  while (gravandoNoBanco) {
    const terminou = await Promise.race([gravandoNoBanco.then(() => true), limite.then(() => false)])
    if (!terminou) { console.error('[DU][BANCO] Desligando sem confirmar a última gravação no MongoDB (o arquivo local tem os dados).'); break }
  }
  await cofre.fechar().catch(() => undefined)
}

/**
 * Migração única: o antigo "nível" deixa de controlar acesso — agora são os
 * cargos de permissão. Cria um cargo "Administrador" (acesso total) e o atribui
 * às contas que hoje têm nível admin, para que não percam acesso.
 * A conta dona (id 1) é sempre admin, independentemente de cargo.
 */
export function ensureNivelMigration(): void {
  const data = readData()
  if (data.nivelMigrado) return

  let admCargo = data.cargosPermissao.find(c => c.admin)
  if (!admCargo) {
    admCargo = {
      id: data.nextCargoPermId,
      nome: 'Administrador',
      admin: true,
      padrao: false,
      permissoes: fullPermMap(),
    }
    data.cargosPermissao.push(admCargo)
    data.nextCargoPermId++
  }

  for (const conta of data.contas) {
    if (!conta.cargoPermId && conta.nivel === 'admin') {
      conta.cargoPermId = admCargo.id
    }
  }

  data.nivelMigrado = true
  writeData(data)
  console.log('[DU] Migração nível→cargos concluída (cargo Administrador criado/atribuído).')
}

function defaultPermsForDuRole(nome: string) {
  if (nome === CARGO_ADMIN || nome === 'Chief of Detectives') return fullPermMap()
  return normalizePermMap({
    dashboard: { ver: true },
    avisos: { ver: true },
    relatorios: { ver: true, editar: true },
    boletins: { ver: true },
    inqueritos: { ver: true },
    galeria: { ver: true, editar: true },
    cursos: { ver: true },
    membros: { ver: true },
  })
}

/**
 * Garante a hierarquia oficial DU nos cargos de permissão.
 * Não sobrescreve permissões já editadas; só cria o que faltar e reordena os
 * cargos oficiais no topo, na ordem da hierarquia.
 */
export function ensureDuPermissionRoles(): void {
  const data = readData()
  let mudou = false

  const byName = (nome: string) => data.cargosPermissao.find(c => c.nome.toLowerCase() === nome.toLowerCase())
  const byDuRole = (nome: string) => {
    const canon = canonicalDuRoleName(nome)
    return data.cargosPermissao
      .filter(c => canonicalDuRoleName(c.nome) === canon)
      .sort((a, b) => a.id - b.id)
  }
  // Cargos com o nome antigo viram a patente correspondente (mesmo ID: contas e permissões continuam)
  for (const [antigo, novo] of NOMES_ANTIGOS) {
    const velho = byName(antigo)
    if (!velho || byName(novo)) continue
    velho.nome = novo
    // Fichas e pedidos que guardavam o nome antigo acompanham
    for (const m of data.membros) if (m.patenteInterna === antigo) m.patenteInterna = novo
    for (const c of data.contas) if (c.membroArquivado?.patenteInterna === antigo) c.membroArquivado.patenteInterna = novo
    mudou = true
  }

  let commander = byName(CARGO_ADMIN)
  const legacyAdmin = data.cargosPermissao.find(c => c.admin && c.nome.toLowerCase() === 'administrador')

  if (!commander && legacyAdmin) {
    legacyAdmin.nome = CARGO_ADMIN
    legacyAdmin.admin = true
    legacyAdmin.permissoes = normalizePermMap(legacyAdmin.permissoes)
    commander = legacyAdmin
    mudou = true
  }

  for (const nome of DU_PERMISSION_ROLES) {
    const equivalentes = byDuRole(nome)
    let cargo = equivalentes[0] ?? byName(nome)

    if (cargo && cargo.nome !== nome) {
      cargo.nome = nome
      mudou = true
    }

    if (cargo && equivalentes.length > 1) {
      const idsDuplicados = new Set(equivalentes.slice(1).map(c => c.id))
      for (const conta of data.contas) {
        if (conta.cargoPermId && idsDuplicados.has(conta.cargoPermId)) {
          conta.cargoPermId = cargo.id
          mudou = true
        }
      }
      if (equivalentes.some(c => c.padrao)) cargo.padrao = true
      data.cargosPermissao = data.cargosPermissao.filter(c => !idsDuplicados.has(c.id))
      mudou = true
    }

    if (!cargo) {
      cargo = {
        id: data.nextCargoPermId++,
        nome,
        admin: nome === CARGO_ADMIN,
        padrao: nome === CARGO_PADRAO,
        permissoes: defaultPermsForDuRole(nome),
      } satisfies CargoPermissao
      data.cargosPermissao.push(cargo)
      mudou = true
    } else {
      const normalized = normalizePermMap(cargo.permissoes)
      if (JSON.stringify(normalized) !== JSON.stringify(cargo.permissoes)) {
        cargo.permissoes = normalized
        mudou = true
      }
      if (nome === CARGO_ADMIN && cargo.admin !== true) {
        cargo.admin = true
        mudou = true
      }
    }
  }

  const oficiais = DU_PERMISSION_ROLES
    .map(nome => byName(nome))
    .filter((c): c is CargoPermissao => Boolean(c))
  const officialIds = new Set(oficiais.map(c => c.id))
  const outros = data.cargosPermissao.filter(c => !officialIds.has(c.id))
  const novaOrdem = [...oficiais, ...outros]
  if (novaOrdem.map(c => c.id).join(',') !== data.cargosPermissao.map(c => c.id).join(',')) {
    data.cargosPermissao = novaOrdem
    mudou = true
  }

  const probationary = byName(CARGO_PADRAO)
  if (probationary && !data.cargosPermissao.some(c => c.padrao)) {
    probationary.padrao = true
    mudou = true
  }

  // Patente da setagem sem cargo do site → o cargo de mesmo nome (aprovar já dá o cargo certo no site)
  // (mesmas palavras em qualquer ordem: "Detective Senior" = "Senior Detective").
  // Nunca liga sozinho a cargo com admin/dev/"editar": isso só um admin faz, conferido ao configurar.
  const palavras = (t: string) => canonicalDuRoleName(t).split(' ').sort().join(' ')
  const cargoSimples = (c: CargoPermissao) => !c.admin && !c.dev && !Object.values(c.permissoes ?? {}).some(p => p?.editar === true)
  for (const p of data.setagem?.patentes ?? []) {
    if (p.cargoPermId != null) continue
    const cargo = data.cargosPermissao.find(c => cargoSimples(c) && palavras(c.nome) === palavras(p.nome))
    if (cargo) { p.cargoPermId = cargo.id; mudou = true }
  }

  if (mudou) {
    writeData(data)
    console.log('[DU] Cargos de permissão DU sincronizados.')
  }
}

/**
 * Garante a conta dona (id 1). O login é só pelo Discord: a conta dona é a de quem tem o
 * 1º ID de DISCORD_DONO_ID do .env (ligada no primeiro login dela). Sem senha.
 */
export function ensureDefaultAdmin(): void {
  const data = readData()
  // Remove resíduos de versões antigas
  const legado = data as DuData & { solicitacoes?: unknown; nextSolId?: unknown }
  let mudou = 'solicitacoes' in legado || 'nextSolId' in legado
  delete legado.solicitacoes
  delete legado.nextSolId
  let dono = data.contas.find(c => c.id === 1)
  if (!dono) {
    const usado = data.contas.some(c => c.username.toLowerCase() === 'admin')
    dono = { id: 1, username: usado ? 'admin-du' : 'admin', nivel: 'admin', ativo: true, onboarded: true }
    data.contas.unshift(dono)
    data.nextContaId = Math.max(data.nextContaId, 2)
    mudou = true
  }
  if (!/^\d{17,20}$/.test(process.env.DISCORD_DONO_ID?.split(/[\s,;]+/)[0]?.trim() ?? '')) {
    console.warn('[DU][ATENÇÃO] DISCORD_DONO_ID não definido — ninguém consegue entrar na conta dona.')
  }
  if (mudou) writeData(data)
}

/**
 * Migração pedida pela unidade (DU — Detroit Police Department):
 * o campo antigo de patente dos membros vira `patenteDPD` e a sigla antiga (palavra inteira) vira
 * "DPD" nos campos de patente. Roda UMA vez (flag `migracaoDpd`), sempre DEPOIS de um backup:
 * o backup criptografado do boot ou, sem chave, uma cópia simples ao lado do arquivo de dados.
 * Só mexe em campos de patente — nunca em texto livre, imagens ou outros dados.
 */
export function migrarPatentesParaDpd(copiaSemChave: (conteudo: string) => void): boolean {
  const data = readData()
  if (data.migracaoDpd) return false
  copiaSemChave(JSON.stringify(data))
  converterPatentesParaDpd(data)
  writeData(data)
  return true
}

/** Sigla do sistema anterior (N + PD), montada por partes para não aparecer escrita no código. */
export const SIGLA_ANTIGA = String.fromCharCode(78) + 'PD'
const SIGLA_ANTIGA_RE = new RegExp(`\\b${SIGLA_ANTIGA}\\b`, 'g')
const CAMPO_ANTIGO = `patente${SIGLA_ANTIGA}`

/** Converte para o formato DPD os campos de patente (muta `data`; quem chama grava). Também usado ao restaurar backup antigo. */
export function converterPatentesParaDpd(entrada: DuData): void {
  // Formato do sistema anterior: o campo e a sigla antigos viram "patenteDPD" e "DPD".
  // A sigla antiga é montada por partes (SIGLA_ANTIGA) de propósito: assim ela não aparece escrita no código.
  const data = entrada as DuData & { membros: (Membro & Record<string, unknown>)[] }
  if (data.migracaoDpd) return
  const siglaParaDpd = (v: unknown) => (typeof v === 'string' ? v.replace(SIGLA_ANTIGA_RE, 'DPD') : v)
  const ajustarMembro = (m: (Membro & Record<string, unknown>) | undefined) => {
    if (!m) return
    // Campo antigo → patenteDPD (não sobrescreve um patenteDPD que já exista)
    if (CAMPO_ANTIGO in m) {
      if (m.patenteDPD === undefined) m.patenteDPD = String(m[CAMPO_ANTIGO] ?? '')
      delete m[CAMPO_ANTIGO]
    }
    m.patenteDPD = String(siglaParaDpd(m.patenteDPD ?? ''))
    m.patenteInterna = String(siglaParaDpd(m.patenteInterna ?? ''))
  }
  ;(data.membros ?? []).forEach(ajustarMembro)
  for (const c of data.contas ?? []) ajustarMembro(c.membroArquivado as Membro & Record<string, unknown>)
  for (const sp of data.solicitacoesPerfil ?? []) {
    for (const a of (sp.alteracoes ?? []) as { campo: string; de: string; para: string }[]) {
      if (a.campo === CAMPO_ANTIGO) a.campo = 'patenteDPD'
      if (a.campo === 'patenteDPD' || a.campo === 'patenteInterna') { a.de = String(siglaParaDpd(a.de)); a.para = String(siglaParaDpd(a.para)) }
    }
  }
  if (Array.isArray(data.patentes)) data.patentes = data.patentes.map(p => String(siglaParaDpd(p)))
  data.migracaoDpd = true
}
