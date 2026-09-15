import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { modOrAdmin, noViewOnly } from '../middleware/roles'
import { validateBody, acaoSchema } from '../middleware/validate'
import { audit } from '../security/audit'
import { readData, writeData } from '../data'
import { Acao } from '../types'

const router = Router()

router.get('/export/csv', requireAuth, modOrAdmin, (_req: Request, res: Response): void => {
  const data = readData()
  const membroMap = new Map(data.membros.map(m => [m.id, m]))

  const rows: string[] = ['ID,Data,QRU,Resultado,Participantes']
  const sorted = [...data.acoes].sort((a, b) => b.id - a.id)

  for (const acao of sorted) {
    const membersStr = acao.participants
      .map(p => {
        const m = membroMap.get(p.memberId)
        return m ? `${p.patenteUnidade} ${m.policial}` : `ID:${p.memberId}`
      })
      .join(' | ')

    const extrasStr = (acao.participantesExtras ?? [])
      .map(e => e.patente ? `${e.patente} ${e.nome} [EXT]` : `${e.nome} [EXT]`)
      .join(' | ')

    const participantes = [membersStr, extrasStr].filter(Boolean).join(' | ')
    rows.push([acao.id, acao.data, acao.qru, acao.resultado, `"${participantes}"`].join(','))
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="acoes.csv"')
  res.send('﻿' + rows.join('\n'))
})

router.get('/', requireAuth, (req: Request, res: Response): void => {
  const data = readData()
  const { qru, resultado, status, page, limit } = req.query

  const VALID_RESULTADOS = ['Vitória', 'Derrota', 'Empate']
  let acoes = [...data.acoes].sort((a, b) => b.id - a.id)

  if (qru && typeof qru === 'string') acoes = acoes.filter(a => a.qru === qru)
  if (resultado && typeof resultado === 'string' && VALID_RESULTADOS.includes(resultado)) {
    acoes = acoes.filter(a => a.resultado === resultado)
  }
  if (status === 'pendente') acoes = acoes.filter(a => a.status === 'pendente')
  else if (status === 'aprovada') acoes = acoes.filter(a => (a.status ?? 'aprovada') === 'aprovada')

  const pageNum = Math.max(1, parseInt(String(page || '1'), 10))
  const limitNum = Math.min(200, Math.max(1, parseInt(String(limit || '50'), 10)))
  const total = acoes.length
  const paginated = acoes.slice((pageNum - 1) * limitNum, pageNum * limitNum)

  res.json({ acoes: paginated, total, page: pageNum, limit: limitNum })
})

router.post('/', requireAuth, noViewOnly, validateBody(acaoSchema), (req: Request, res: Response): void => {
  const body = req.body as Omit<Acao, 'id'>
  const data = readData()

  // Validar que participantes existem
  const existingIds = new Set(data.membros.map(m => m.id))
  const invalidParticipants = body.participants.filter(p => !existingIds.has(p.memberId))
  if (invalidParticipants.length > 0) {
    res.status(400).json({ error: 'Participantes inválidos', ids: invalidParticipants.map(p => p.memberId) })
    return
  }

  const novaAcao: Acao = {
    id: data.nextAcId,
    data: body.data,
    qru: body.qru,
    resultado: body.resultado,
    participants: body.participants,
    participantesExtras: body.participantesExtras ?? [],
    comandante: body.comandante,
    local: body.local,
    imagem: body.imagem,
    status: 'pendente',
  }

  data.acoes.push(novaAcao)
  data.nextAcId++
  writeData(data)

  audit('ACAO_CREATED', req, `ID: ${novaAcao.id} | QRU: ${novaAcao.qru} | ${novaAcao.resultado} | PENDENTE`)
  res.status(201).json(novaAcao)
})

router.put('/:id/aprovar', requireAuth, modOrAdmin, (req: Request, res: Response): void => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }

  const data = readData()
  const acao = data.acoes.find(a => a.id === id)
  if (!acao) { res.status(404).json({ error: 'Ação não encontrada' }); return }

  acao.status = 'aprovada'
  writeData(data)

  audit('ACAO_APPROVED', req, `ID: ${id} | QRU: ${acao.qru}`)
  res.json(acao)
})

router.delete('/:id', requireAuth, modOrAdmin, (req: Request, res: Response): void => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }

  const data = readData()
  const idx = data.acoes.findIndex(a => a.id === id)
  if (idx === -1) { res.status(404).json({ error: 'Ação não encontrada' }); return }

  data.acoes.splice(idx, 1)
  writeData(data)

  audit('ACAO_DELETED', req, `ID: ${id}`)
  res.json({ ok: true })
})

export default router
