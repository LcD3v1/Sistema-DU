import { FastData, CargoPermissao } from './types'
import { fullPermMap, normalizePermMap } from './permAreas'
import { bindDataScope, configuredScope } from './modules/ranking/scope'
import { auditRankingChanges } from './modules/ranking/auditChanges'
import { DATA_PATH, gravarAtomico, lerJson } from './armazenamento'

/**
 * Persistência em arquivo JSON (mesmo modelo do Sistema Tática, sem banco externo).
 *
 * O painel inteiro usa readData()/writeData() de forma síncrona. Os dados ficam
 * num cache em memória carregado do arquivo na inicialização (initData);
 * writeData atualiza o cache na hora e grava o arquivo inteiro de forma atômica
 * (temporário + rename) logo em seguida — rajadas de gravação viram uma só.
 */

const DEFAULT_DATA: FastData = {
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
  patentes: ['Recruta', 'Soldado', 'Cabo', 'Sargento', 'Tenente', 'Capitão', 'Major', 'Coronel'],
  cargos: ['Operador', 'Sniper', 'Médico de Campo', 'Líder de Esquadrão', 'Comandante'],
  contas: [],
  ausencias: [],
  avisos: [],
  fardamentos: [],
  cargosPermissao: [],
  anuncioSituacoes: [
    { id: 1, label: 'Área Restrita', titulo: 'D.P.D INFORMA:', texto: 'A área do [LOCAL] se encontra restrita pelas próximas horas, por estar sob atividade criminosa. Mantenham-se afastados — risco iminente de bala perdida! ESTE AVISO SERÁ ÚNICO! Att. [ASSINATURA]' },
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
  relatorios: [],
  boletins: [],
  inqueritos: [],
  galeria: [],
  nextRelatorioId: 1,
  nextBoletimId: 1,
  nextInqueritoId: 1,
  nextFotoId: 1,
}

const FAST_PERMISSION_ROLES = [
  '(DU) Commander',
  '(DU) Deputy Commander',
  '(DU) Coordinator',
  '(DU) Veteran',
  '(DU) Senior',
  '(DU) Officer',
  '(DU) Probationary',
] as const

function canonicalFastRoleName(nome: string) {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

let cache: FastData | undefined
// Cache serializado da revisão atual: JSON.parse é ~3x mais rápido que structuredClone
// e os dados já são JSON puro.
let cacheJson: string | undefined

function clone<T>(v: T): T { return structuredClone(v) }

/** Carrega os dados do arquivo (ou começa com os padrões). Chamar antes de subir o servidor. */
export async function initData(): Promise<void> {
  const scope = configuredScope()
  if (scope) bindDataScope(scope)
  // Arquivo corrompido derruba o boot de propósito: nunca recomeçar do zero por cima dos dados
  const salvo = lerJson<Partial<FastData>>(DATA_PATH)
  cache = { ...clone(DEFAULT_DATA), ...(salvo ?? {}) } as FastData
  cacheJson = undefined
  if (!salvo) {
    gravarAgora()
    console.log(`[DU][DADOS] Arquivo de dados criado em ${DATA_PATH}`)
  } else {
    console.log(`[DU][DADOS] Dados carregados de ${DATA_PATH}`)
  }
}

export function readData(): FastData {
  if (!cache) throw new Error('Dados ainda não carregados — initData() não foi chamado')
  cacheJson ??= JSON.stringify(cache)
  return JSON.parse(cacheJson) as FastData
}

/**
 * Leitura SEM cópia, para consultas somente-leitura em caminhos quentes.
 * NUNCA mutar o objeto retornado (nem passá-lo a writeData); para alterar use readData().
 */
export function peekData(): Readonly<FastData> {
  if (!cache) throw new Error('Dados ainda não carregados — initData() não foi chamado')
  return cache
}

let agendado: NodeJS.Immediate | NodeJS.Timeout | undefined
let revision = 0
let persistenceFailed = false
export function dataRevision(): number { return revision }
export function rankingPersistenceReady(): boolean { return !persistenceFailed }

export function writeData(data: FastData): void {
  if (cache) auditRankingChanges(cache, data)
  cacheJson = JSON.stringify(data)
  cache = JSON.parse(cacheJson) as FastData
  revision++
  agendado ??= setImmediate(gravarAgora)
}

function gravarAgora(): void {
  agendado = undefined
  if (!cache) return
  try {
    cacheJson ??= JSON.stringify(cache)
    gravarAtomico(DATA_PATH, cacheJson)
    persistenceFailed = false
  } catch (err) {
    persistenceFailed = true
    console.error('[DU][DADOS] Falha ao gravar o arquivo de dados:', err instanceof Error ? err.message : err)
    agendado = setTimeout(gravarAgora, 3000)
  }
}

/** Grava o que estiver pendente (desligamento limpo). */
export async function closeData(): Promise<void> {
  if (agendado) { clearTimeout(agendado as NodeJS.Timeout); clearImmediate(agendado as NodeJS.Immediate); gravarAgora() }
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

function defaultPermsForFastRole(nome: string) {
  if (nome === '(DU) Commander' || nome === '(DU) Deputy Commander') return fullPermMap()
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
export function ensureFastPermissionRoles(): void {
  const data = readData()
  let mudou = false

  const byName = (nome: string) => data.cargosPermissao.find(c => c.nome.toLowerCase() === nome.toLowerCase())
  const byFastRole = (nome: string) => {
    const canon = canonicalFastRoleName(nome)
    return data.cargosPermissao
      .filter(c => canonicalFastRoleName(c.nome) === canon)
      .sort((a, b) => a.id - b.id)
  }
  let commander = byName('(DU) Commander')
  const legacyAdmin = data.cargosPermissao.find(c => c.admin && c.nome.toLowerCase() === 'administrador')

  if (!commander && legacyAdmin) {
    legacyAdmin.nome = '(DU) Commander'
    legacyAdmin.admin = true
    legacyAdmin.permissoes = normalizePermMap(legacyAdmin.permissoes)
    commander = legacyAdmin
    mudou = true
  }

  for (const nome of FAST_PERMISSION_ROLES) {
    const equivalentes = byFastRole(nome)
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
        admin: nome === '(DU) Commander',
        padrao: nome === '(DU) Probationary',
        permissoes: defaultPermsForFastRole(nome),
      } satisfies CargoPermissao
      data.cargosPermissao.push(cargo)
      mudou = true
    } else {
      const normalized = normalizePermMap(cargo.permissoes)
      if (JSON.stringify(normalized) !== JSON.stringify(cargo.permissoes)) {
        cargo.permissoes = normalized
        mudou = true
      }
      if (nome === '(DU) Commander' && cargo.admin !== true) {
        cargo.admin = true
        mudou = true
      }
    }
  }

  const oficiais = FAST_PERMISSION_ROLES
    .map(nome => byName(nome))
    .filter((c): c is CargoPermissao => Boolean(c))
  const officialIds = new Set(oficiais.map(c => c.id))
  const outros = data.cargosPermissao.filter(c => !officialIds.has(c.id))
  const novaOrdem = [...oficiais, ...outros]
  if (novaOrdem.map(c => c.id).join(',') !== data.cargosPermissao.map(c => c.id).join(',')) {
    data.cargosPermissao = novaOrdem
    mudou = true
  }

  const probationary = byName('(DU) Probationary')
  if (probationary && !data.cargosPermissao.some(c => c.padrao)) {
    probationary.padrao = true
    mudou = true
  }

  if (mudou) {
    writeData(data)
    console.log('[DU] Cargos de permissão DU sincronizados.')
  }
}

/**
 * Garante a conta dona (id 1). Sem senha: ela é assumida no primeiro login
 * pelo primeiro Discord listado em DISCORD_OWNER_ID (aceita vários, separados por vírgula).
 */
export function ensureDefaultAdmin(): void {
  const data = readData()
  // Remove resíduos do antigo login por senha
  const legado = data as FastData & { solicitacoes?: unknown; nextSolId?: unknown }
  let mudou = 'solicitacoes' in legado || 'nextSolId' in legado
  delete legado.solicitacoes
  delete legado.nextSolId
  for (const c of data.contas as (FastData['contas'][number] & { password?: string })[]) {
    if ('password' in c) { delete c.password; mudou = true }
  }
  if (data.contas.length === 0) {
    data.contas.push({ id: 1, username: 'admin', nivel: 'admin', ativo: true })
    data.nextContaId = 2
    mudou = true
    console.log('[DU] Conta dona criada — será vinculada ao Discord de DISCORD_OWNER_ID no primeiro login.')
  }
  if (mudou) writeData(data)
  const dono = data.contas.find(c => c.id === 1)
  if (dono && !dono.discordId && !process.env.DISCORD_OWNER_ID) {
    console.warn('[DU][ATENÇÃO] A conta dona ainda não tem Discord vinculado e DISCORD_OWNER_ID não está definido — ninguém terá acesso de administrador.')
  }
}
