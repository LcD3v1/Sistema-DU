import { Router, Request, Response } from 'express'
import { canArea, isAdmin } from '../access'
import { requireAuth } from '../middleware/auth'
import { requireArea } from '../middleware/roles'
import { validateBody, acaoSchema } from '../middleware/validate'
import { audit } from '../security/audit'
import { readData, writeData, peekData } from '../data'
import { Acao, ParticipanteAcao } from '../types'
import { notificar, notificarAprovadores } from '../notificacoes'
import { contaDoMembro } from '../efetivo'
import { tipoDoQru } from '../qrus'
import { nomeDaConta, nomeDoMembro } from '../registros'

/** Saída da API: sem IDs de servidor/bot/tópico e sem discordId dos participantes. */
function acaoPublica(acao: Acao) {
  const { guildId: _g, botId: _b, discordThreadId: _t, participantesExtras, ...resto } = acao
  return { ...resto, participantesExtras: (participantesExtras ?? []).map(e => ({ nome: e.nome, ...(e.patente ? { patente: e.patente } : {}) })) }
}

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
        return m ? `${p.patenteUnidade} ${nomeDoMembro(data, m)}` : `ID:${p.memberId}`
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
    rows.push([acao.id, acao.data, acao.qru, acao.resultado ?? 'Convencional', participantes].map(cell).join(','))
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

  // IDs de servidor/bot/tópico/participantes do Discord nunca saem da API
  res.json({ acoes: paginated.map(acaoPublica), total, page: pageNum, limit: limitNum })
})

router.post('/', requireAuth, requireArea('registrar_acao', 'editar'), validateBody(acaoSchema), async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Omit<Acao, 'id'>

  const data = readData()

  // QRU precisa existir e ser do tipo escolhido (convencional × fechado)
  if (!data.qrus.includes(body.qru) || tipoDoQru(data, body.qru) !== body.tipo) {
    res.status(400).json({ error: 'QRU inválido para o tipo selecionado.' }); return
  }

  // Validar que participantes existem
  const existingIds = new Set(data.membros.map(m => m.id))
  const invalidParticipants = body.participants.filter(p => !existingIds.has(p.memberId))
  if (invalidParticipants.length > 0) {
    res.status(400).json({ error: 'Participantes inválidos', ids: invalidParticipants.map(p => p.memberId) })
    return
  }

  const participants: ParticipanteAcao[] = [...body.participants]
  const autor = data.contas.find(c => c.id === req.user!.contaId)!
  const responsavel = nomeDaConta(data, autor.id)
  const novaAcao: Acao = {
    id: data.nextAcId,
    data: body.data,
    qru: body.qru,
    tipo: body.tipo,
    ...(body.tipo === 'fechado' ? { resultado: body.resultado } : {}),
    participants,
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
    `${nomeDaConta(peekData(), req.user!.contaId)} registrou uma apreensão (${novaAcao.qru}).`, '/acoes/pendentes')
  writeData(data)

  audit('ACAO_CREATED', req, `ID: ${novaAcao.id} | QRU: ${novaAcao.qru} | ${novaAcao.resultado ?? 'convencional'} | PENDENTE`)
  res.status(201).json(acaoPublica(novaAcao))
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
  if (!jaAprovada) acao.aprovadaEm = new Date().toISOString()
  if (!jaAprovada) {
    notificar(data, acao.criadoPorContaId, 'aprovada', 'Apreensão aprovada',
      `Sua apreensão (${acao.qru}) foi aprovada por ${nomeDaConta(peekData(), req.user!.contaId)} e enviada ao canal de apreensões.`, '/acoes/historico')
    const avisados = new Set<number | undefined>([acao.criadoPorContaId])
    for (const p of acao.participants) {
      const contaId = contaDoMembro(data, p.memberId)?.id
      if (!contaId || avisados.has(contaId)) continue
      avisados.add(contaId)
      notificar(data, contaId, 'apreensao', `Apreensão registrada · BO Nº ${acao.id}`,
        `Você participou da apreensão ${acao.qru}${acao.resultado ? ` (${acao.resultado})` : ''}, aprovada por ${nomeDaConta(peekData(), req.user!.contaId)}.`, '/acoes/historico')
    }
  }
  writeData(data)

  audit('ACAO_APPROVED', req, `ID: ${id} | QRU: ${acao.qru}`)
  res.json(acaoPublica(acao))
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
      `Sua apreensão (${removida.qru}) foi recusada por ${nomeDaConta(peekData(), req.user!.contaId)}.`, '/acoes/historico')
  }
  writeData(data)

  audit('ACAO_DELETED', req, `ID: ${id}`)
  res.json({ ok: true })
})

export default router
