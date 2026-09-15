import { Router, Request, Response } from 'express'
import { readData } from '../data'
import { Acao, Membro } from '../types'

const router = Router()

function isoDaysAgo(n: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

// GET /api/public/ranking?window=all|7|15|30
router.get('/ranking', (req: Request, res: Response): void => {
  const data = readData()
  const win = String(req.query.window ?? 'all')
  const from = win === 'all' ? null : isoDaysAgo(parseInt(win, 10) || 30)

  const aprovadas = data.acoes.filter(a => (a.status ?? 'aprovada') === 'aprovada')
  const acoes: Acao[] = from ? aprovadas.filter(a => a.data >= from) : aprovadas
  const fechadas = acoes.filter(a => a.resultado !== 'Empate')
  const vitoriasTotais = acoes.filter(a => a.resultado === 'Vitória').length
  const winRate = fechadas.length > 0 ? Math.round((vitoriasTotais / fechadas.length) * 100) : 0

  const list = data.membros
    .map((m: Membro) => {
      const mineAcoes = acoes.filter(a => a.participants.some(p => p.memberId === m.id))
      const vitorias = mineAcoes.filter(a => a.resultado === 'Vitória').length
      return {
        memberId: m.id,
        badge: m.badge,
        name: m.policial,
        role: m.patenteNPD,
        patenteInterna: m.patenteInterna,
        vitorias,
        registros: mineAcoes.length,
      }
    })
    .filter(x => x.registros > 0)
    .sort((a, b) => b.registros - a.registros || b.vitorias - a.vitorias)
    .map((x, i) => ({ ...x, rank: i + 1 }))

  const conquistas = list.filter(x => x.registros > 0 && x.vitorias === x.registros).length

  res.json({
    window: win,
    winRate,
    vitoriasTotais,
    acoesFechadas: fechadas.length,
    totalApreensoes: aprovadas.length,
    conquistas,
    list,
  })
})

// GET /api/public/perfis — avatar/banner por membro (da conta vinculada)
router.get('/perfis', (_req: Request, res: Response): void => {
  const data = readData()
  const perfis = data.contas
    .filter(c => c.membroId)
    .map(c => ({ membroId: c.membroId, avatar: c.avatar ?? null, banner: c.banner ?? null }))
  res.json(perfis)
})

// GET /api/public/membros — agrupado por patente interna
router.get('/membros', (_req: Request, res: Response): void => {
  const data = readData()

  // Ordem dos grupos segue a hierarquia configurada em data.patentes
  const patenteOrder = new Map<string, number>(data.patentes.map((p, i) => [p, i]))

  const membrosVisiveis = data.membros.filter(m => m.status !== 'Inativo')

  const grupos = new Map<string, Membro[]>()
  membrosVisiveis.forEach(m => {
    const key = m.patenteInterna || 'Sem patente'
    if (!grupos.has(key)) grupos.set(key, [])
    grupos.get(key)!.push(m)
  })

  const result = [...grupos.entries()]
    .sort((a, b) => (patenteOrder.get(a[0]) ?? 999) - (patenteOrder.get(b[0]) ?? 999))
    .map(([patente, membros]) => ({
      patente,
      membros: membros
        .sort((a, b) => a.policial.localeCompare(b.policial))
        .map(m => ({
          id: m.id,
          badge: m.badge,
          name: m.policial,
          role: m.patenteNPD,
          entrada: m.entrada,
          status: m.status,
        })),
    }))

  res.json({ total: membrosVisiveis.length, grupos: result })
})

export default router
