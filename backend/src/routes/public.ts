import { Router } from 'express'
import { readData, rankingPersistenceReady, dataRevision } from '../data'
import { snapshot } from '../modules/ranking/router'
import { configuredScope, belongsToScope } from '../modules/ranking/scope'
import { calcularRanking } from '../discord/painelApreensoes'

const router = Router()
// Compatibility for existing widgets. New clients use the paginated /public/directory API.
router.use((_req, res, next) => {
  if (!configuredScope() || !rankingPersistenceReady()) { res.status(503).json({ error: 'Diretório temporariamente indisponível.' }); return }
  res.setHeader('Cache-Control', 'no-store')
  next()
})
router.get('/ranking', (req, res) => {
  const window = String(req.query.window ?? 'all')
  if (!['all', '7', '15', '30'].includes(window) || Object.keys(req.query).some(k => k !== 'window')) {
    res.status(400).json({ error: 'Período inválido.' }); return
  }
  const value = snapshot(window === 'all' ? 'all' : `${window}d` as '7d' | '15d' | '30d')
  res.json({ window, winRate: value.stats.winRate, vitoriasTotais: value.stats.wins,
    acoesFechadas: value.stats.wins + value.stats.losses, totalApreensoes: value.stats.records,
    conquistas: value.stats.achievements,
    list: value.ranking.slice(0, 100).map(m => ({ memberId: m.id, badge: m.badge, name: m.name,
      role: m.role, patenteInterna: m.hierarchy, vitorias: m.wins, registros: m.records, rank: m.rank })) })
})
router.get('/membros', (_req, res) => {
  const value = snapshot('all')
  res.json({ total: value.members.length, grupos: value.roles.map(role => ({ patente: role.name,
    membros: value.members.filter(m => m.roleId === role.id).slice(0, 100).map(m => ({
      id: m.id, badge: m.badge, name: m.name, role: m.role, entrada: m.joinedAt, status: m.status,
    })) })).filter(g => g.membros.length) })
})
// GET /api/public/ranking-historico — rankings zerados no painel do Discord + o atual.
// Só nome e total (lista branca): sem passaporte, discordId ou IDs internos.
router.get('/ranking-historico', (_req, res) => {
  const data = readData()
  const atual = calcularRanking(data)
  res.json({
    atual: {
      inicio: data.painelApreensoes?.resetadoEm ?? null,
      total: atual.total,
      linhas: atual.linhas.map(l => ({ nome: l.nome, total: l.total })),
    },
    anteriores: [...(data.historicoRankings ?? [])].reverse().map(r => ({
      id: r.id, inicio: r.inicio ?? null, fim: r.fim, total: r.total,
      linhas: r.linhas.map(l => ({ nome: l.nome, total: l.total })),
    })),
  })
})

// GET /api/public/revisao — versão atual dos dados (o navegador atualiza tudo quando muda)
router.get('/revisao', (_req, res) => { res.json({ revisao: dataRevision() }) })

// GET /api/public/perfil/:slug — perfil público do membro (some quando exonerado/inativo)
router.get('/perfil/:slug', (req, res) => {
  const slug = String(req.params.slug).toLowerCase().slice(0, 80)
  const row = snapshot('all').members.find(m => m.slug === slug)
  if (!row) { res.status(404).json({ error: 'Perfil não encontrado.' }); return }

  const data = readData()
  const scope = configuredScope()!
  const membro = data.membros.find(m => m.id === row.id && belongsToScope(m, scope))
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  const desde = (dias: number) => { const d = new Date(`${hoje}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - dias + 1); return d.toISOString().slice(0, 10) }
  const minhas = data.acoes
    .filter(a => belongsToScope(a, scope) && (a.status ?? 'aprovada') === 'aprovada' && Array.isArray(a.participants)
      && a.participants.some(p => p.memberId === row.id) && a.data.slice(0, 10) <= hoje)
    .sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id)
  const contar = (dias: number) => minhas.filter(a => a.data.slice(0, 10) >= desde(dias)).length

  res.json({
    slug: row.slug, nome: row.name, avatar: row.avatar, badge: row.badge, nivel: row.level,
    cargo: row.hierarchy.replace(/^\(FAST\)\s*/i, ''), patente: row.role, membroDesde: row.joinedAt, status: row.status,
    apreensoes: { d7: contar(7), d15: contar(15), d30: contar(30), total: minhas.length },
    ultimasApreensoes: minhas.slice(0, 10).map(a => ({
      id: a.id, data: a.data.slice(0, 10), tipo: a.qru, local: '', resultado: a.resultado ?? 'Convencional', imagem: null,
    })),
    historicoCargos: [...(membro?.historicoCargos ?? [])].reverse().slice(0, 20)
      .map(({ data, tipo, de, para }) => ({ data, tipo, de, para })),
  })
})

export default router
