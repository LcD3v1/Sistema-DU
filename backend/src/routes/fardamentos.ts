import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { requireArea } from '../middleware/roles'
import { validateBody, fardamentoSchema, fardamentoUpdateSchema } from '../middleware/validate'
import { audit } from '../security/audit'
import { readData, writeData } from '../data'
import { notificarArea } from '../notificacoes'
import { Fardamento } from '../types'

const router = Router()

// GET /api/fardamentos — lista todos
router.get('/', requireAuth, requireArea('fardamento', 'ver'), (_req, res) => {
  const data = readData()
  const sorted = [...data.fardamentos].sort((a, b) => b.id - a.id)
  res.json(sorted)
})

// POST /api/fardamentos — cria um fardamento
router.post('/', requireAuth, requireArea('fardamento', 'editar'), validateBody(fardamentoSchema), (req: Request, res: Response): void => {
  const data = readData()
  const body = req.body as Omit<Fardamento, 'id' | 'criadoEm'>
  const novo: Fardamento = {
    id: data.nextFardId,
    patente: body.patente,
    titulo: body.titulo ?? '',
    imagem: body.imagem,
    observacoes: body.observacoes ?? '',
    criadoEm: new Date().toISOString(),
  }
  data.fardamentos.push(novo)
  data.nextFardId++
  notificarArea(data, 'fardamento', [req.user!.contaId], 'fardamento', 'Novo fardamento',
    `Fardamento de ${novo.patente}${novo.titulo ? ` (${novo.titulo})` : ''} adicionado por ${req.user!.username}.`, '/fardamento')
  writeData(data)
  audit('CONFIG_UPDATED', req, `Fardamento criado: ${novo.patente}`)
  res.status(201).json(novo)
})

// PUT /api/fardamentos/:id — edita
router.put('/:id', requireAuth, requireArea('fardamento', 'editar'), validateBody(fardamentoUpdateSchema), (req: Request, res: Response): void => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
  const data = readData()
  const f = data.fardamentos.find(x => x.id === id)
  if (!f) { res.status(404).json({ error: 'Fardamento não encontrado' }); return }
  const body = req.body as Partial<Fardamento>
  if (body.patente !== undefined) f.patente = body.patente
  if (body.titulo !== undefined) f.titulo = body.titulo
  if (body.imagem !== undefined) f.imagem = body.imagem
  if (body.observacoes !== undefined) f.observacoes = body.observacoes
  writeData(data)
  audit('CONFIG_UPDATED', req, `Fardamento atualizado: #${id}`)
  res.json(f)
})

// DELETE /api/fardamentos/:id
router.delete('/:id', requireAuth, requireArea('fardamento', 'editar'), (req: Request, res: Response): void => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
  const data = readData()
  const before = data.fardamentos.length
  data.fardamentos = data.fardamentos.filter(x => x.id !== id)
  if (data.fardamentos.length === before) { res.status(404).json({ error: 'Fardamento não encontrado' }); return }
  writeData(data)
  audit('CONFIG_UPDATED', req, `Fardamento removido: #${id}`)
  res.json({ ok: true })
})

export default router
