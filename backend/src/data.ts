import fs from 'fs'
import path from 'path'
import { MongoClient, Db, AnyBulkWriteOperation, Document } from 'mongodb'
import { FastData, CargoPermissao } from './types'
import { fullPermMap, normalizePermMap } from './permAreas'
import { bindDatabaseScope, configuredScope } from './modules/ranking/scope'
import { auditRankingChanges } from './modules/ranking/auditChanges'

/**
 * Persistência em MongoDB.
 *
 * O painel inteiro usa readData()/writeData() de forma síncrona. Para manter
 * isso, os dados ficam num cache em memória carregado do Mongo na inicialização
 * (initData). writeData atualiza o cache na hora e persiste no Mongo em
 * segundo plano, numa fila serial que grava só o que mudou.
 *
 * Layout no banco:
 *  - uma coleção por lista com `id` (membros, contas, acoes...) — 1 documento por item
 *  - coleção `config`, documento `_id: 'meta'` com o restante (patentes, qrus, logo, contadores...)
 */

// Arquivo legado: importado para o Mongo uma única vez, se o banco estiver vazio.
const LEGACY_PATH = process.env.DATA_PATH
  ? path.resolve(process.env.DATA_PATH)
  : path.resolve(__dirname, '..', 'data.json')

const COLECOES = [
  'membros', 'acoes', 'recrutas', 'contas', 'ausencias',
  'avisos', 'fardamentos', 'cargosPermissao', 'anuncioSituacoes',
  'notificacoes', 'solicitacoesPerfil',
  'relatorios', 'boletins', 'inqueritos', 'galeria',
] as const
type Colecao = typeof COLECOES[number]
type ItemDoc = Document & { _id: number }
type MetaDoc = Document & { _id: string }

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

let db: Db | undefined
let client: MongoClient | undefined
let cache: FastData | undefined

// Último estado confirmado no banco (JSON por item) — base do diff.
const salvo: Record<Colecao, Map<number, string>> = Object.fromEntries(
  COLECOES.map(c => [c, new Map<number, string>()]),
) as Record<Colecao, Map<number, string>>
let metaSalvo = ''
// Cache serializado da revisão atual: JSON.parse é ~3x mais rápido que structuredClone
// e os dados já são JSON puro (é assim que vão/voltam do Mongo).
let cacheJson: string | undefined

function clone<T>(v: T): T { return structuredClone(v) }

function separar(data: FastData): { listas: Record<Colecao, { id: number }[]>; meta: Record<string, unknown> } {
  const meta: Record<string, unknown> = { ...data }
  const listas = {} as Record<Colecao, { id: number }[]>
  for (const c of COLECOES) {
    listas[c] = (data[c] ?? []) as { id: number }[]
    delete meta[c]
  }
  return { listas, meta }
}

/** Conecta ao Mongo e carrega (ou importa) os dados. Chamar antes de subir o servidor. */
export async function initData(): Promise<void> {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI não definido')
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 })
  await client.connect()
  db = client.db(process.env.MONGODB_DB || 'fast')
  const scope = configuredScope()
  if (scope) await bindDatabaseScope(db, scope)

  const metaDoc = await db.collection<MetaDoc>('config').findOne({ _id: 'meta' })
  if (!metaDoc) {
    let inicial: FastData = clone(DEFAULT_DATA)
    if (fs.existsSync(LEGACY_PATH)) {
      inicial = { ...inicial, ...JSON.parse(fs.readFileSync(LEGACY_PATH, 'utf-8')) }
      console.log(`[DU][DB] Banco vazio — importando dados de ${LEGACY_PATH}`)
    } else {
      console.log('[DU][DB] Banco vazio — iniciando com dados padrão')
    }
    cache = inicial
    await flush()
  } else {
    const { _id: _m, ...meta } = metaDoc
    const carregado = { ...clone(DEFAULT_DATA), ...meta } as FastData
    for (const c of COLECOES) {
      const docs = await db.collection<ItemDoc>(c).find().sort({ _id: 1 }).toArray()
      const itens = docs.map(({ _id, ...item }) => item)
      ;(carregado as unknown as Record<string, unknown>)[c] = itens
      for (const item of itens) salvo[c].set(item.id as number, JSON.stringify(item))
    }
    metaSalvo = JSON.stringify(separar(carregado).meta)
    cache = carregado
  }
  console.log(`[DU][DB] MongoDB conectado (banco "${db.databaseName}")`)
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

let gravando: Promise<void> | undefined
let pendente = false
let revision = 0
let persistenceFailed = false
export function dataRevision(): number { return revision }
export function rankingPersistenceReady(): boolean { return !persistenceFailed }

export function writeData(data: FastData): void {
  if (cache) auditRankingChanges(cache, data)
  cacheJson = JSON.stringify(data)
  cache = JSON.parse(cacheJson) as FastData
  revision++
  agendarFlush()
}

function agendarFlush(): void {
  pendente = true
  if (gravando) return
  gravando = (async () => {
    while (pendente) {
      pendente = false
      try { await flush(); persistenceFailed = false } catch (err) {
        persistenceFailed = true
        console.error('[DU][DB] Falha ao gravar no MongoDB:', err instanceof Error ? err.message : err)
        pendente = true
        await new Promise(r => setTimeout(r, 3000))
      }
    }
  })().finally(() => { gravando = undefined })
}

async function flush(): Promise<void> {
  if (!db || !cache) return
  const { listas, meta } = separar(cache)

  for (const c of COLECOES) {
    const atual = new Map(listas[c].map(item => [item.id, JSON.stringify(item)]))
    const ops: AnyBulkWriteOperation<ItemDoc>[] = []
    for (const [id, json] of atual) {
      if (salvo[c].get(id) !== json) {
        ops.push({ replaceOne: { filter: { _id: id }, replacement: JSON.parse(json), upsert: true } })
      }
    }
    for (const id of salvo[c].keys()) {
      if (!atual.has(id)) ops.push({ deleteOne: { filter: { _id: id } } })
    }
    if (ops.length) await db.collection<ItemDoc>(c).bulkWrite(ops, { ordered: false })
    salvo[c] = atual
  }

  const metaJson = JSON.stringify(meta)
  if (metaJson !== metaSalvo) {
    await db.collection<MetaDoc>('config').replaceOne(
      { _id: 'meta' }, meta, { upsert: true },
    )
    metaSalvo = metaJson
  }
}

/**
 * Coleção avulsa, fora do cache e do diff do FastData (não entra no readData/backup):
 * arquivos grandes, como as imagens enviadas no Gerar anúncio. null antes do initData.
 */
export function colecaoAvulsa<T extends Document>(nome: 'anuncioImagens' | 'arquivos') {
  return db ? db.collection<T>(nome) : null
}

/** Aguarda gravações pendentes e fecha a conexão (desligamento limpo). */
export async function closeData(): Promise<void> {
  while (gravando) await gravando
  await client?.close()
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
