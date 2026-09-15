import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { modOrAdmin, noViewOnly } from '../middleware/roles'
import { validateBody, recrutaCreateSchema, avaliacaoRecrutaSchema } from '../middleware/validate'
import { audit } from '../security/audit'
import { readData, writeData } from '../data'
import { AvaliacaoIndividual, Recruta } from '../types'

const router = Router()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(r: any): Recruta {
  return {
    id: r.id,
    nome: r.nome,
    data: r.data,
    avaliacoes: r.avaliacoes ?? [],
    resultado: r.resultado,
    status: r.status ?? (r.resultado ? 'fechado' : 'aberto'),
    observacoes: r.observacoes,
  }
}

router.get('/', requireAuth, noViewOnly, (_req: Request, res: Response): void => {
  const data = readData()
  res.json(data.recrutas.map(normalize).sort((a, b) => b.id - a.id))
})

router.post('/', requireAuth, modOrAdmin, validateBody(recrutaCreateSchema), (req: Request, res: Response): void => {
  const body = req.body
  const data = readData()
  const novo: Recruta = {
    id:          data.nextRecId,
    nome:        body.nome,
    data:        body.data ?? new Date().toISOString().slice(0, 10),
    avaliacoes:  [],
    status:      'aberto',
    observacoes: body.observacoes || undefined,
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data.recrutas.push(novo as any)
  data.nextRecId++
  writeData(data)
  audit('RECRUTA_CREATED', req, `Nome: ${novo.nome}`)
  res.status(201).json(novo)
})

router.get('/:id', requireAuth, noViewOnly, (req: Request, res: Response): void => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
  const data = readData()
  const r = data.recrutas.find(r => r.id === id)
  if (!r) { res.status(404).json({ error: 'Candidato não encontrado' }); return }
  res.json(normalize(r))
})

router.post('/:id/avaliar', requireAuth, noViewOnly, validateBody(avaliacaoRecrutaSchema), (req: Request, res: Response): void => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
  const data = readData()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = data.recrutas.find(r => r.id === id) as any
  if (!r) { res.status(404).json({ error: 'Candidato não encontrado' }); return }
  const recruta = normalize(r)
  if (recruta.status === 'fechado') { res.status(400).json({ error: 'Avaliação encerrada' }); return }

  const user = req.user!
  if (recruta.avaliacoes.some((a: AvaliacaoIndividual) => a.contaId === user.contaId)) {
    res.status(400).json({ error: 'Você já avaliou este candidato' })
    return
  }

  const avaliacao: AvaliacaoIndividual = {
    contaId:     user.contaId,
    username:    user.username,
    scores:      req.body.scores,
    total:       req.body.total,
    observacoes: req.body.observacoes || undefined,
    data:        new Date().toISOString().slice(0, 10),
  }

  if (!r.avaliacoes) r.avaliacoes = []
  r.avaliacoes.push(avaliacao)
  writeData(data)
  audit('RECRUTA_AVALIADO', req, `ID: ${id} | Avaliador: ${user.username}`)
  res.status(201).json(avaliacao)
})

router.put('/:id/fechar', requireAuth, modOrAdmin, (req: Request, res: Response): void => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
  const data = readData()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = data.recrutas.find(r => r.id === id) as any
  if (!r) { res.status(404).json({ error: 'Candidato não encontrado' }); return }

  const avaliacoes: AvaliacaoIndividual[] = r.avaliacoes ?? []
  if (avaliacoes.length > 0) {
    const totalFinal = parseFloat((avaliacoes.reduce((s, a) => s + a.total, 0) / avaliacoes.length).toFixed(2))
    r.resultado = totalFinal >= data.recCfg.notaMinima ? 'Aprovado' : 'Reprovado'
  }
  r.status = 'fechado'
  writeData(data)
  audit('RECRUTA_FECHADO', req, `ID: ${id}`)
  res.json(normalize(r))
})

router.delete('/:id', requireAuth, modOrAdmin, (req: Request, res: Response): void => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
  const data = readData()
  const idx = data.recrutas.findIndex(r => r.id === id)
  if (idx === -1) { res.status(404).json({ error: 'Candidato não encontrado' }); return }
  data.recrutas.splice(idx, 1)
  writeData(data)
  audit('RECRUTA_DELETED', req, `ID: ${id}`)
  res.json({ ok: true })
})

export default router
