import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { requireArea } from '../middleware/roles'
import { validateBody, ausenciaSchema } from '../middleware/validate'
import { audit } from '../security/audit'
import { readData, writeData } from '../data'
import { Ausencia } from '../types'

const router = Router()

// GET /api/ausencias — lista todas (mais recentes primeiro)
router.get('/', requireAuth, (_req, res) => {
  const data = readData()
  const sorted = [...data.ausencias].sort((a, b) => b.dataInicio.localeCompare(a.dataInicio))
  res.json(sorted)
})

// POST /api/ausencias — registra uma ausência
router.post('/', requireAuth, validateBody(ausenciaSchema), (req: Request, res: Response): void => {
  const data = readData()
  const body = req.body as Omit<Ausencia, 'id' | 'criadoEm'>

  const nova: Ausencia = {
    id: data.nextAusId,
    memberId: body.memberId,
    nome: body.nome,
    dataInicio: body.dataInicio,
    dataFim: body.dataFim,
    motivo: body.motivo ?? '',
    criadoEm: new Date().toISOString(),
  }

  data.ausencias.push(nova)
  data.nextAusId++
  writeData(data)

  audit('AUSENCIA_CREATED', req, `${nova.nome} | ${nova.dataInicio} → ${nova.dataFim}`)
  res.status(201).json(nova)
})

// DELETE /api/ausencias/:id — remove/encerra uma ausência
router.delete('/:id', requireAuth, requireArea('ausencias', 'editar'), (req: Request, res: Response): void => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }

  const data = readData()
  const idx = data.ausencias.findIndex(a => a.id === id)
  if (idx === -1) { res.status(404).json({ error: 'Ausência não encontrada' }); return }

  const nome = data.ausencias[idx].nome
  data.ausencias.splice(idx, 1)
  writeData(data)

  audit('AUSENCIA_DELETED', req, `ID: ${id} | ${nome}`)
  res.json({ ok: true })
})

export default router
