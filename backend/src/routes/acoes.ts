import { Router, Request, Response } from 'express'
import { canArea, isAdmin } from '../access'
import { requireAuth } from '../middleware/auth'
import { requireArea } from '../middleware/roles'
import { validateBody, acaoSchema } from '../middleware/validate'
import { audit } from '../security/audit'
import { readData, writeData } from '../data'
import { Acao } from '../types'
import { postarApreensao, emSegundoPlano } from '../discord/forum'
import { atualizarPainelEmSegundoPlano } from '../discord/painelApreensoes'
import { notificar, notificarAprovadores } from '../notificacoes'
import { contaDoMembro } from '../efetivo'

const router = Router()

router.get('/export/csv', requireAuth, requireArea('historico', 'ver'), (_req: Request, res: Response): void => {
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
    const cell = (value: unknown) => {
      let text = String(value ?? '')
      if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text
      return '"' + text.replace(/"/g, '""') + '"'
    }
    rows.push([acao.id, acao.data, acao.qru, acao.resultado, participantes].map(cell).join(','))
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="acoes.csv"')
  res.send('﻿' + rows.join('\n'))
})

router.get('/', requireAuth, (req: Request, res: Response): void => {
  const data = readData()
  const { qru, resultado, status, page, limit } = req.query

  const VALID_RESULTADOS = ['Vitória', 'Derrota', 'Empate']
  const conta = data.contas.find(c => c.id === req.user!.contaId)!
  const completo = (['historico', 'pendentes', 'promocoes', 'estatisticas', 'dashboard'] as const).some(a => canArea(conta, data, a, 'ver'))
  let acoes = data.acoes.filter(a => completo || a.participants.some(p => p.memberId === conta.membroId)).sort((a, b) => b.id - a.id)

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

  // IDs de servidor/bot/tópico do Discord nunca saem da API
  const semIds = paginated.map(({ guildId: _g, botId: _b, discordThreadId: _t, ...acao }) => acao)
  res.json({ acoes: semIds, total, page: pageNum, limit: limitNum })
})

router.post('/', requireAuth, requireArea('registrar_acao', 'editar'), validateBody(acaoSchema), (req: Request, res: Response): void => {
  const body = req.body as Omit<Acao, 'id'>
  const data = readData()

  // Validar que participantes existem
  const existingIds = new Set(data.membros.map(m => m.id))
  const invalidParticipants = body.participants.filter(p => !existingIds.has(p.memberId))
  if (invalidParticipants.length > 0) {
    res.status(400).json({ error: 'Participantes inválidos', ids: invalidParticipants.map(p => p.memberId) })
    return
  }

  const autor = data.contas.find(c => c.id === req.user!.contaId)!
  const responsavel = autor.nomeServidor || autor.discordUsername || autor.username
  const novaAcao: Acao = {
    id: data.nextAcId,
    data: body.data,
    qru: body.qru,
    resultado: body.resultado,
    participants: body.participants,
    participantesExtras: body.participantesExtras ?? [],
    comandante: responsavel,
    local: body.local,
    imagem: body.imagem,
    status: 'pendente',
    criadoPorContaId: req.user!.contaId,
  }

  data.acoes.push(novaAcao)
  data.nextAcId++
  notificar(data, req.user!.contaId, 'solicitacao', 'Apreensão enviada',
    `Sua apreensão (${novaAcao.qru}) foi enviada. Você está aguardando a aprovação.`, '/acoes/historico')
  notificarAprovadores(data, 'pendentes', undefined, req.user!.contaId, 'pendente_aprovacao', 'Apreensão aguardando aprovação',
    `${req.user!.username} registrou uma apreensão (${novaAcao.qru}).`, '/acoes/pendentes')
  writeData(data)

  audit('ACAO_CREATED', req, `ID: ${novaAcao.id} | QRU: ${novaAcao.qru} | ${novaAcao.resultado} | PENDENTE`)
  res.status(201).json(novaAcao)
})

router.put('/:id/aprovar', requireAuth, requireArea('pendentes', 'editar'), (req: Request, res: Response): void => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }

  const data = readData()
  const acao = data.acoes.find(a => a.id === id)
  if (!acao) { res.status(404).json({ error: 'Ação não encontrada' }); return }
  const aprovador = data.contas.find(c => c.id === req.user!.contaId)
  if (acao.criadoPorContaId === req.user!.contaId && !(aprovador && isAdmin(aprovador, data))) {
    res.status(403).json({ error: 'Não é possível aprovar o próprio registro.' }); return
  }

  const jaAprovada = acao.status === 'aprovada'
  acao.status = 'aprovada'
  if (!jaAprovada) {
    notificar(data, acao.criadoPorContaId, 'aprovada', 'Apreensão aprovada',
      `Sua apreensão (${acao.qru}) foi aprovada por ${req.user!.username} e enviada ao canal de apreensões.`, '/acoes/historico')
    const avisados = new Set<number | undefined>([acao.criadoPorContaId])
    for (const p of acao.participants) {
      const contaId = contaDoMembro(data, p.memberId)?.id
      if (!contaId || avisados.has(contaId)) continue
      avisados.add(contaId)
      notificar(data, contaId, 'apreensao', `Apreensão registrada · BO Nº ${acao.id}`,
        `Você participou da apreensão ${acao.qru} (${acao.resultado}), aprovada por ${req.user!.username}.`, '/acoes/historico')
    }
  }
  writeData(data)

  audit('ACAO_APPROVED', req, `ID: ${id} | QRU: ${acao.qru}`)
  // O placar se reordena sozinho a cada apreensão aprovada.
  if (!jaAprovada) atualizarPainelEmSegundoPlano()
  if (!jaAprovada && !acao.discordThreadId) {
    const aprovadoPor = req.user!.username
    emSegundoPlano('postagem de apreensão', async () => {
      const threadId = await postarApreensao(readData(), acao, aprovadoPor)
      if (!threadId) return
      const fresco = readData()
      const alvo = fresco.acoes.find(a => a.id === id)
      if (alvo) { alvo.discordThreadId = threadId; writeData(fresco) }
    })
  }
  const { guildId: _g, botId: _b, discordThreadId: _t, ...acaoPublica } = acao
  res.json(acaoPublica)
})

router.delete('/:id', requireAuth, requireArea('pendentes', 'editar'), (req: Request, res: Response): void => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }

  const data = readData()
  const idx = data.acoes.findIndex(a => a.id === id)
  if (idx === -1) { res.status(404).json({ error: 'Ação não encontrada' }); return }

  const removida = data.acoes[idx]
  data.acoes.splice(idx, 1)
  if (removida.status === 'pendente') {
    notificar(data, removida.criadoPorContaId, 'recusada', 'Apreensão recusada',
      `Sua apreensão (${removida.qru}) foi recusada por ${req.user!.username}.`, '/acoes/historico')
  }
  writeData(data)

  audit('ACAO_DELETED', req, `ID: ${id}`)
  if ((removida.status ?? 'aprovada') === 'aprovada') atualizarPainelEmSegundoPlano()
  res.json({ ok: true })
})

export default router
