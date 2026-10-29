import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { canArea } from '../access'
import { requireArea } from '../middleware/roles'
import { validateBody, avisoSchema } from '../middleware/validate'
import { audit } from '../security/audit'
import { readData, writeData, peekData } from '../data'
import { nomeDaConta } from '../registros'
import { Aviso } from '../types'
import { notificar, notificarArea } from '../notificacoes'

const router = Router()

// GET /api/avisos — lista + contagem de não vistos do usuário atual
router.get('/', requireAuth, (req: Request, res: Response): void => {
  const data = readData()
  const conta = data.contas.find(c => c.id === req.user!.contaId)
  if (!conta || !canArea(conta, data, 'avisos', 'ver')) { res.json({ avisos: [], naoVistos: 0 }); return }
  const lastSeen = conta.avisoLastSeen ?? 0
  // Campo a campo: o vínculo com a mensagem do Discord (IDs internos) não sai daqui
  const avisos = [...data.avisos].sort((a, b) => b.id - a.id)
    .map(({ id, titulo, mensagem, autor, criadoEm }) => ({ id, titulo, mensagem, autor, criadoEm }))
  const naoVistos = avisos.filter(a => a.id > lastSeen).length
  res.json({ avisos, naoVistos })
})

// POST /api/avisos — publica um aviso (comando)
router.post('/', requireAuth, requireArea('avisos', 'editar'), validateBody(avisoSchema), (req: Request, res: Response): void => {
  const { titulo, mensagem } = req.body as { titulo: string; mensagem: string }
  const data = readData()
  const novo: Aviso = {
    id: data.nextAvisoId,
    titulo,
    mensagem,
    autor: nomeDaConta(peekData(), req.user!.contaId),
    criadoEm: new Date().toISOString(),
  }
  data.avisos.push(novo)
  data.nextAvisoId++
  const resumo = mensagem.length > 140 ? mensagem.slice(0, 139) + '…' : mensagem
  notificarArea(data, 'avisos', [req.user!.contaId], 'aviso', `Novo aviso: ${titulo}`, `${resumo} — ${novo.autor}`, '/avisos')
  notificar(data, req.user!.contaId, 'aviso', 'Aviso publicado', `Seu aviso "${titulo}" foi publicado para a unidade.`, '/avisos')
  writeData(data)
  audit('AVISO_CREATED', req, `${titulo}`)
  res.status(201).json(novo)
})

// POST /api/avisos/marcar-lido — marca todos como vistos
router.post('/marcar-lido', requireAuth, (req: Request, res: Response): void => {
  const data = readData()
  const conta = data.contas.find(c => c.id === req.user!.contaId)
  if (conta) {
    conta.avisoLastSeen = data.avisos.reduce((m, a) => Math.max(m, a.id), 0)
    writeData(data)
  }
  res.json({ ok: true })
})

// DELETE /api/avisos/:id
router.delete('/:id', requireAuth, requireArea('avisos', 'editar'), (req: Request, res: Response): void => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
  const data = readData()
  const idx = data.avisos.findIndex(a => a.id === id)
  if (idx === -1) { res.status(404).json({ error: 'Aviso não encontrado' }); return }
  const [removido] = data.avisos.splice(idx, 1)
  writeData(data)
  audit('AVISO_DELETED', req, `ID: ${id}`)
  res.json({ ok: true })
})

export default router
