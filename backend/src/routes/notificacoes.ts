import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { readData, writeData } from '../data'
import { VALIDADE_NOTIFICACAO_MS } from '../notificacoes'

const router = Router()

// GET /api/notificacoes — notificações do usuário (últimos 7 dias, mais recentes primeiro)
router.get('/', requireAuth, (req: Request, res: Response): void => {
  const limite = Date.now() - VALIDADE_NOTIFICACAO_MS
  const minhas = readData().notificacoes
    .filter(n => n.contaId === req.user!.contaId && new Date(n.criadaEm).getTime() >= limite)
    .sort((a, b) => b.id - a.id)
    .slice(0, 100)
  res.json({ notificacoes: minhas, naoLidas: minhas.filter(n => !n.lida).length })
})

// PUT /api/notificacoes/lidas — marca todas como lidas
router.put('/lidas', requireAuth, (req: Request, res: Response): void => {
  const data = readData()
  let mudou = false
  for (const n of data.notificacoes) {
    if (n.contaId === req.user!.contaId && !n.lida) { n.lida = true; mudou = true }
  }
  if (mudou) writeData(data)
  res.json({ ok: true })
})

// PUT /api/notificacoes/:id/lida
router.put('/:id/lida', requireAuth, (req: Request, res: Response): void => {
  const id = parseInt(String(req.params.id), 10)
  const data = readData()
  const n = data.notificacoes.find(x => x.id === id && x.contaId === req.user!.contaId)
  if (!n) { res.status(404).json({ error: 'Notificação não encontrada' }); return }
  if (!n.lida) { n.lida = true; writeData(data) }
  res.json({ ok: true })
})

// DELETE /api/notificacoes/:id
router.delete('/:id', requireAuth, (req: Request, res: Response): void => {
  const id = parseInt(String(req.params.id), 10)
  const data = readData()
  const antes = data.notificacoes.length
  data.notificacoes = data.notificacoes.filter(x => !(x.id === id && x.contaId === req.user!.contaId))
  if (data.notificacoes.length === antes) { res.status(404).json({ error: 'Notificação não encontrada' }); return }
  writeData(data)
  res.json({ ok: true })
})

export default router
