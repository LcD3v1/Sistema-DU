import { Router, Request, Response } from 'express'
import { canArea } from '../access'
import { requireAuth } from '../middleware/auth'
import { requireArea } from '../middleware/roles'
import { validateBody, ausenciaSchema, recusarSchema } from '../middleware/validate'
import { audit } from '../security/audit'
import { readData, writeData, peekData } from '../data'
import { Ausencia, DuData } from '../types'
import { hoje, statusAusencia, podeGerenciar, verificarAusencias, contaDoMembro } from '../efetivo'
import { notificar, notificarAprovadores } from '../notificacoes'

const fmt = (d: string) => d.split('-').reverse().join('/')

/** Avisa o membro da ausência e quem pediu (se forem pessoas diferentes). */
function avisarEnvolvidos(data: DuData, aus: Ausencia, titulo: string, mensagem: string): void {
  const doMembro = aus.memberId ? contaDoMembro(data, aus.memberId)?.id : undefined
  const solicitante = data.contas.find(c => c.username === aus.solicitadoPor)?.id
  notificar(data, doMembro, 'ausencia', titulo, mensagem, '/ausencias')
  if (solicitante && solicitante !== doMembro) notificar(data, solicitante, 'ausencia', titulo, mensagem, '/ausencias')
}

/**
 * Fluxo de ausência:
 *   registrar (pendente) → aprovar (aprovada: sem acesso ao painel no período)
 *   → fim do período (encerrada automaticamente) ou "retirar ausência" antes.
 * Cada evento é postado no tópico pessoal do membro no fórum de Registro.
 */
import { nomeDoMembro, nomeDaConta } from '../registros'
const router = Router()

function carregar(req: Request, res: Response): { data: DuData; aus: Ausencia } | undefined {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return undefined }
  const data = readData()
  const aus = data.ausencias.find(a => a.id === id)
  if (!aus) { res.status(404).json({ error: 'Ausência não encontrada' }); return undefined }
  const membro = data.membros.find(m => m.id === aus.memberId)
  const negado = membro && podeGerenciar(data, req.user!.contaId, membro)
  if (negado) { res.status(403).json({ error: negado }); return undefined }
  return { data, aus }
}

// GET /api/ausencias — lista todas (mais recentes primeiro)
router.get('/', requireAuth, (req, res) => {
  const data = readData()
  const conta = data.contas.find(c => c.id === req.user!.contaId)!
  const sorted = data.ausencias.filter(a => canArea(conta, data, 'ausencias', 'ver') || a.memberId === conta.membroId || a.solicitadoPor === conta.username)
    .map(a => ({ ...a, status: statusAusencia(a) }))
    .sort((a, b) => b.dataInicio.localeCompare(a.dataInicio))
  res.json(sorted)
})

// POST /api/ausencias — solicita uma ausência (fica pendente de aprovação)
router.post('/', requireAuth, validateBody(ausenciaSchema), (req: Request, res: Response): void => {
  const data = readData()
  const body = req.body as Omit<Ausencia, 'id' | 'criadoEm'> & { memberId: number }

  const membro = data.membros.find(m => m.id === body.memberId)
  if (!membro) { res.status(400).json({ error: 'Selecione um membro da unidade.' }); return }
  // Para outra pessoa só quem gerencia ausências e está acima dela na hierarquia
  const solicitante = data.contas.find(c => c.id === req.user!.contaId)
  if (!solicitante) { res.status(404).json({ error: 'Conta não encontrada' }); return }
  if (membro.id !== solicitante.membroId) {
    if (!canArea(solicitante, data, 'ausencias', 'editar')) { res.status(403).json({ error: 'Você só pode solicitar ausência para si mesmo.' }); return }
    const negado = podeGerenciar(data, solicitante.id, membro)
    if (negado) { res.status(403).json({ error: negado }); return }
  }

  const nova: Ausencia = {
    id: data.nextAusId,
    memberId: membro.id,
    nome: nomeDoMembro(data, membro),   // codinome (regra)
    dataInicio: body.dataInicio,
    dataFim: body.dataFim,
    motivo: body.motivo ?? '',
    criadoEm: new Date().toISOString(),
    status: 'pendente',
    solicitadoPor: req.user!.username,
  }

  data.ausencias.push(nova)
  data.nextAusId++
  const periodo = `${fmt(nova.dataInicio)} a ${fmt(nova.dataFim)}`
  notificar(data, req.user!.contaId, 'solicitacao', 'Solicitação de ausência enviada',
    `Sua solicitação de ausência (${periodo}) foi enviada. Você está aguardando a aprovação.`, '/ausencias')
  const doMembro = contaDoMembro(data, membro.id)?.id
  if (doMembro && doMembro !== req.user!.contaId) {
    notificar(data, doMembro, 'solicitacao', 'Ausência solicitada para você',
      `${nomeDaConta(peekData(), req.user!.contaId)} solicitou uma ausência em seu nome (${periodo}). Aguardando aprovação.`, '/ausencias')
  }
  notificarAprovadores(data, 'ausencias', membro.id, req.user!.contaId, 'pendente_aprovacao', 'Ausência aguardando aprovação',
    membro.id === solicitante.membroId
      ? `${nomeDoMembro(data, membro)} solicitou ausência (${periodo}).`
      : `${nomeDaConta(peekData(), req.user!.contaId)} solicitou ausência para ${nomeDoMembro(data, membro)} (${periodo}).`, '/ausencias')
  writeData(data)

  audit('AUSENCIA_CREATED', req, `${nova.nome} | ${nova.dataInicio} → ${nova.dataFim} | pendente`)
  res.status(201).json(nova)
})

// PUT /api/ausencias/:id/aprovar — aprova: membro fica sem acesso durante o período
router.put('/:id/aprovar', requireAuth, requireArea('ausencias', 'editar'), (req: Request, res: Response): void => {
  const ctx = carregar(req, res); if (!ctx) return
  const { data, aus } = ctx
  if (statusAusencia(aus) !== 'pendente') { res.status(400).json({ error: 'Esta ausência não está pendente.' }); return }
  if (aus.dataFim < hoje()) { res.status(400).json({ error: 'O período desta ausência já terminou.' }); return }

  const membro = data.membros.find(m => m.id === aus.memberId)

  aus.status = 'aprovada'
  aus.decididoPor = nomeDaConta(peekData(), req.user!.contaId)
  avisarEnvolvidos(data, aus, 'Ausência aprovada',
    `Sua ausência (${fmt(aus.dataInicio)} a ${fmt(aus.dataFim)}) foi aprovada por ${aus.decididoPor}. Durante o período você fica sem acesso ao painel.`)
  writeData(data)
  verificarAusencias()   // já marca o status "Ausência" se começa hoje

  audit('AUSENCIA_APROVADA', req, `#${aus.id} ${aus.nome} | ${aus.dataInicio} → ${aus.dataFim}`)
  res.json(aus)
})

// PUT /api/ausencias/:id/recusar
router.put('/:id/recusar', requireAuth, requireArea('ausencias', 'editar'), validateBody(recusarSchema), (req: Request, res: Response): void => {
  const ctx = carregar(req, res); if (!ctx) return
  const { data, aus } = ctx
  if (statusAusencia(aus) !== 'pendente') { res.status(400).json({ error: 'Esta ausência não está pendente.' }); return }
  const { motivo } = req.body as { motivo?: string }
  aus.status = 'recusada'
  aus.decididoPor = nomeDaConta(peekData(), req.user!.contaId)
  if (motivo) aus.motivoRecusa = motivo
  avisarEnvolvidos(data, aus, 'Ausência recusada',
    `Sua solicitação de ausência (${fmt(aus.dataInicio)} a ${fmt(aus.dataFim)}) foi recusada por ${aus.decididoPor}${motivo ? `. Motivo: ${motivo}` : '.'}`)
  writeData(data)
  audit('AUSENCIA_RECUSADA', req, `#${aus.id} ${aus.nome}`)
  res.json(aus)
})

// PUT /api/ausencias/:id/encerrar — retira a ausência antes do fim (acesso volta na hora)
router.put('/:id/encerrar', requireAuth, requireArea('ausencias', 'editar'), (req: Request, res: Response): void => {
  const ctx = carregar(req, res); if (!ctx) return
  const { data, aus } = ctx
  if (statusAusencia(aus) !== 'aprovada') { res.status(400).json({ error: 'Só é possível retirar uma ausência aprovada.' }); return }

  aus.status = 'encerrada'
  aus.encerradaEm = new Date().toISOString()
  aus.encerradaPor = nomeDaConta(peekData(), req.user!.contaId)
  const membro = data.membros.find(m => m.id === aus.memberId)
  if (membro && membro.status === 'Ausência') membro.status = 'Ativo'
  avisarEnvolvidos(data, aus, 'Ausência retirada',
    `Sua ausência foi retirada por ${aus.encerradaPor}. O acesso ao painel foi liberado.`)
  writeData(data)

  audit('AUSENCIA_ENCERRADA', req, `#${aus.id} ${aus.nome} — retirada manualmente`)
  res.json(aus)
})

// DELETE /api/ausencias/:id — apaga o registro (não posta no Discord)
router.delete('/:id', requireAuth, requireArea('ausencias', 'editar'), (req: Request, res: Response): void => {
  const ctx = carregar(req, res); if (!ctx) return
  const { data, aus } = ctx
  data.ausencias = data.ausencias.filter(a => a.id !== aus.id)
  const membro = data.membros.find(m => m.id === aus.memberId)
  if (membro && membro.status === 'Ausência' && statusAusencia(aus) === 'aprovada') membro.status = 'Ativo'
  writeData(data)

  audit('AUSENCIA_DELETED', req, `ID: ${aus.id} | ${aus.nome}`)
  res.json({ ok: true })
})

export default router
