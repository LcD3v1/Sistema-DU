import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { modOrAdmin, adminOnly } from '../middleware/roles'
import { validateBody, membroSchema, membroUpdateSchema, reorderSchema } from '../middleware/validate'
import { audit } from '../security/audit'
import { readData, writeData } from '../data'
import { Membro } from '../types'

const router = Router()

router.get('/', requireAuth, (_req, res) => {
  const data = readData()
  const order = data.membrosOrder
  let membros = data.membros

  if (order.length > 0) {
    const orderMap = new Map(order.map((id, idx) => [id, idx]))
    membros = [...membros].sort((a, b) => {
      const ia = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999
      const ib = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999
      return ia - ib
    })
  }
  res.json(membros)
})

router.post('/', requireAuth, modOrAdmin, validateBody(membroSchema), (req: Request, res: Response): void => {
  const data = readData()
  const body = req.body as Omit<Membro, 'id'>

  const novoMembro: Membro = {
    id: data.nextMemId,
    badge:          body.badge,
    passaporte:     body.passaporte,
    policial:       body.policial,
    patenteNPD:     body.patenteNPD,
    patenteInterna: body.patenteInterna,
    status:         body.status,
    entrada:        body.entrada ?? new Date().toISOString().slice(0, 10),
    promocao:       body.promocao ?? new Date().toISOString().slice(0, 10),
    adv1: body.adv1,
    adv2: body.adv2,
    adv3: body.adv3,
  }

  data.membros.push(novoMembro)
  data.membrosOrder.push(novoMembro.id)
  data.nextMemId++
  writeData(data)

  audit('MEMBRO_CREATED', req, `ID: ${novoMembro.id} | Nome: ${novoMembro.policial}`)
  res.status(201).json(novoMembro)
})

router.put('/reorder', requireAuth, modOrAdmin, validateBody(reorderSchema), (req: Request, res: Response): void => {
  const { orderedIds } = req.body as { orderedIds: number[] }
  const data = readData()

  // Validar que todos os IDs pertencem a membros existentes
  const existingIds = new Set(data.membros.map(m => m.id))
  if (!orderedIds.every(id => existingIds.has(id))) {
    res.status(400).json({ error: 'orderedIds contém IDs inválidos' })
    return
  }

  data.membrosOrder = orderedIds
  writeData(data)
  res.json({ ok: true })
})

router.put('/:id', requireAuth, modOrAdmin, validateBody(membroUpdateSchema), (req: Request, res: Response): void => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }

  const data = readData()
  const idx = data.membros.findIndex(m => m.id === id)
  if (idx === -1) { res.status(404).json({ error: 'Membro não encontrado' }); return }

  const allowed: (keyof Membro)[] = [
    'badge','passaporte','policial','patenteNPD','patenteInterna',
    'status','entrada','promocao','adv1','adv2','adv3',
  ]
  const body = req.body as Partial<Membro>
  allowed.forEach(field => {
    if (field in body) {
      (data.membros[idx] as unknown as Record<string, unknown>)[field] = body[field]
    }
  })

  writeData(data)
  audit('MEMBRO_UPDATED', req, `ID: ${id}`)
  res.json(data.membros[idx])
})

router.delete('/:id', requireAuth, adminOnly, (req: Request, res: Response): void => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }

  const data = readData()
  const idx = data.membros.findIndex(m => m.id === id)
  if (idx === -1) { res.status(404).json({ error: 'Membro não encontrado' }); return }

  const nome = data.membros[idx].policial
  data.membros.splice(idx, 1)
  data.membrosOrder = data.membrosOrder.filter(oid => oid !== id)
  writeData(data)

  audit('MEMBRO_DELETED', req, `ID: ${id} | Nome: ${nome}`)
  res.json({ ok: true })
})

export default router
