import { Router, type Request, type Response, type NextFunction } from 'express'
import rateLimit from 'express-rate-limit'
import { readData, peekData, dataRevision, rankingPersistenceReady } from '../../data'
import { requireAuth } from '../../middleware/auth'
import { requireArea } from '../../middleware/roles'
import { LojaLimitada } from '../../middleware/rateLimiter'
import { audit } from '../../security/audit'
import { isAdmin, canArea } from '../../access'
import { belongsToScope, configuredScope, scopeKey } from './scope'
import { buildSnapshot, filtersSchema, listPage, publicMember, type Filters, type Snapshot } from './service'

let revision = -1
let cacheDay = ''
let cacheScope = ''
const snapshots = new Map<string, Snapshot>()
// Formatter reaproveitado: toLocaleDateString cria um Intl novo a cada chamada.
const fmtDia = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' })
/** `publico`: visão da tela inicial e do perfil público (sem devs). */
export function snapshot(period: Filters['period'], publico = false): Snapshot {
  const scope = configuredScope()!
  const key = scopeKey(scope)
  const today = fmtDia.format(new Date())
  if (revision !== dataRevision() || cacheDay !== today || key !== cacheScope) {
    snapshots.clear(); revision = dataRevision(); cacheDay = today; cacheScope = key
  }
  const chave = `${period}:${publico ? 'publico' : 'painel'}`
  let value = snapshots.get(chave)
  if (!value) {
    value = buildSnapshot(readData(), scope, period, new Date(), publico)
    snapshots.set(chave, value)
    audit('RANKING_RECALCULATED', undefined, `scope=${key}; period=${period}; revision=${revision}`)
  }
  return value
}
function available(_req: Request, res: Response, next: NextFunction) {
  if (!configuredScope() || !rankingPersistenceReady()) { res.status(503).json({ error: 'Módulo temporariamente indisponível.' }); return }
  res.setHeader('Cache-Control', 'private, no-store')
  next()
}
export function requireRankingScope(req: Request, res: Response, next: NextFunction) {
  const scope = configuredScope()
  if (!scope) { res.status(503).json({ error: 'Módulo temporariamente indisponível.' }); return }
  if (req.user?.scope !== scopeKey(scope)) {
    res.status(401).json({ error: 'Sua sessão precisa ser renovada. Entre novamente.' }); return
  }
  const data = readData()
  const account = data.contas.find(c => c.id === req.user?.contaId)
  if (!account || !belongsToScope(account, scope) || (!isAdmin(account, data) &&
    (!account.cargoPermId || account.onboarded === false || !data.membros.some(m => m.id === account.membroId && m.status !== 'Inativo' && belongsToScope(m, scope))))) {
    res.status(403).json({ error: 'Acesso negado.' }); return
  }
  next()
}
/** Discord ID, passaporte e cargos do Discord: só quem edita membros (igual a /api/membros). */
function podeVerIds(req: Request): boolean {
  const data = readData()
  const conta = data.contas.find(c => c.id === req.user?.contaId)
  return !!conta && canArea(conta, data, 'membros', 'editar')
}
const ocultarIds = <T extends object>(m: T): T => ({ ...m, discordId: null, internalId: '', discordRoles: [] })

export function createRankingRouter(publicView = false): Router {
  const router = Router()
  router.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false, store: new LojaLimitada(),
    message: { error: 'Muitas consultas. Aguarde um momento.' } }))
  router.use(available)
  if (!publicView) router.use(requireAuth, requireRankingScope)
  router.use((req, res, next) => {
    const parsed = filtersSchema.safeParse(req.query)
    if (!parsed.success) { res.status(400).json({ error: 'Filtros inválidos.' }); return }
    res.locals.filters = parsed.data
    next()
  })
  const memberPermission = publicView ? (_req: Request, _res: Response, next: NextFunction) => next() : requireArea('membros')
  router.get('/roles', (_req, res) => { res.json(snapshot(res.locals.filters.period, publicView).roles) })
  if (!publicView) router.get('/me', (req, res) => {
    const account = readData().contas.find(c => c.id === req.user?.contaId)
    res.json(snapshot(res.locals.filters.period, publicView).members.find(m => m.id === account?.membroId) ?? null)
  })
  router.get('/stats', (req, res) => {
    const value = snapshot(res.locals.filters.period, publicView)
    const account = !publicView ? peekData().contas.find(c => c.id === req.user?.contaId) : undefined
    res.json({ ...value.stats, position: value.members.find(m => m.id === account?.membroId)?.rank ?? null })
  })
  router.get('/members', memberPermission, (req, res) => {
    const value = snapshot(res.locals.filters.period, publicView)
    const page = listPage(value.members, res.locals.filters, publicView)
    const semIds = !publicView && !podeVerIds(req)
    res.json({ ...page, items: publicView ? page.items.map(publicMember) : semIds ? page.items.map(ocultarIds) : page.items, roles: value.roles })
    // Visita anônima (diretório público) não vai para o log de auditoria: tráfego sem login empurrava
    // os eventos de segurança reais para fora do arquivo (rotação)
    if (!publicView) audit('MEMBER_VIEW', req, `directory; scope=${scopeKey(configuredScope()!)}`)
  })
  router.get('/members/:id', memberPermission, (req, res) => {
    if (!/^\d{1,10}$/.test(String(req.params.id))) { res.status(400).json({ error: 'Membro inválido.' }); return }
    const row = snapshot(res.locals.filters.period, publicView).members.find(m => m.id === Number(req.params.id))
    if (!row) { res.status(404).json({ error: 'Membro não encontrado.' }); return }
    res.json(publicView ? publicMember(row) : podeVerIds(req) ? row : ocultarIds(row))
    if (!publicView) audit('MEMBER_VIEW', req, `member=${row.id}; scope=${scopeKey(configuredScope()!)}`)
  })
  router.get('/', (req, res) => {
    const value = snapshot(res.locals.filters.period, publicView)
    const page = listPage(value.ranking, res.locals.filters, publicView)
    // Ranking cards expose only the fields authorized for a ranking viewer. Profiles use member permission.
    const account = !publicView ? peekData().contas.find(c => c.id === req.user?.contaId) : undefined
    res.json({ ...page, items: publicView ? page.items.map(publicMember) : page.items.map(m => ({ ...m, discordId: null, internalId: '', activity: [], discordRoles: [] })),
      stats: { ...value.stats, position: value.members.find(m => m.id === account?.membroId)?.rank ?? null },
      roles: value.roles, period: res.locals.filters.period, revision: `${cacheDay}:${revision}` })
    audit('RANKING_VIEW', req, `scope=${scopeKey(configuredScope()!)}; period=${res.locals.filters.period}`)
  })
  return router
}
