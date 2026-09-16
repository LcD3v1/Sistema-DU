import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { requireArea } from '../middleware/roles'
import { validateBody, membroSchema, membroUpdateSchema, reorderSchema, promoverSchema, advertenciaSchema, exonerarSchema, recusarSchema } from '../middleware/validate'
import { audit } from '../security/audit'
import { readData, writeData } from '../data'
import { Membro, FastData, NivelAdvertencia } from '../types'
import { postarExoneracao, postarMudancaCargo, postarAdvertencia, postarPerfilAtualizado, emSegundoPlano } from '../discord/forum'
import { notificar, notificarArea } from '../notificacoes'
import { contaDoMembro, nivelHierarquia, podeGerenciar, exonerarMembro, nomeCargoAtual, ausenciaAtivaDoMembro, hoje } from '../efetivo'
import { PROTECTED_OWNER_ID } from '../access'

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
  res.json(membros.map(m => comVinculo(data, m)))
})

/** Acrescenta ao membro os dados da conta vinculada (cargo, ausência). */
function comVinculo(data: FastData, m: Membro) {
  const conta = contaDoMembro(data, m.id)
  const aus = ausenciaAtivaDoMembro(data, m.id)
  return {
    ...m,
    contaId: conta?.id ?? null,
    cargoPermId: conta?.cargoPermId ?? null,
    cargoNome: nomeCargoAtual(data, m),
    nomeServidor: conta?.nomeServidor ?? null,
    avatarServidor: conta?.avatarServidor ?? null,
    ausenteAte: aus?.dataFim ?? null,
  }
}

// GET /api/membros/hierarquia — cargos em ordem hierárquica (topo primeiro)
router.get('/hierarquia', requireAuth, (_req, res) => {
  const data = readData()
  res.json(data.cargosPermissao.map((c, i) => ({ id: c.id, nome: c.nome, admin: c.admin === true, posicao: i })))
})

function carregarMembro(req: Request, res: Response): { data: FastData; membro: Membro } | undefined {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return undefined }
  const data = readData()
  const membro = data.membros.find(m => m.id === id)
  if (!membro) { res.status(404).json({ error: 'Membro não encontrado' }); return undefined }
  return { data, membro }
}

// POST /api/membros/:id/promover — promoção OU rebaixamento conforme a hierarquia
router.post('/:id/promover', requireAuth, requireArea('promocoes', 'editar'), validateBody(promoverSchema), (req: Request, res: Response): void => {
  const ctx = carregarMembro(req, res); if (!ctx) return
  const { data, membro } = ctx
  const { cargoPermId, motivo } = req.body as { cargoPermId: number; motivo: string }

  const destino = data.cargosPermissao.find(c => c.id === cargoPermId)
  if (!destino) { res.status(400).json({ error: 'Cargo não encontrado' }); return }
  const negado = podeGerenciar(data, req.user!.contaId, membro, cargoPermId)
  if (negado) { res.status(403).json({ error: negado }); return }

  const conta = contaDoMembro(data, membro.id)
  if (conta?.id === PROTECTED_OWNER_ID) { res.status(400).json({ error: 'A conta dona tem acesso total fixo.' }); return }
  const cargoAtualId = conta?.cargoPermId ?? data.cargosPermissao.find(c => c.nome === membro.patenteInterna)?.id
  if (cargoAtualId === cargoPermId) { res.status(400).json({ error: 'O membro já possui esse cargo.' }); return }

  const tipo = nivelHierarquia(data, cargoPermId) < nivelHierarquia(data, cargoAtualId) ? 'promocao' : 'rebaixamento'
  const de = nomeCargoAtual(data, membro)

  if (conta) conta.cargoPermId = cargoPermId
  membro.patenteInterna = destino.nome
  membro.promocao = hoje()
  notificarArea(data, 'membros', [conta?.id, req.user!.contaId], tipo,
    tipo === 'promocao' ? `${membro.policial} foi promovido` : `${membro.policial} foi rebaixado`,
    `${de} → ${destino.nome} · por ${req.user!.username}`, '/membros')
  notificar(data, conta?.id, tipo,
    tipo === 'promocao' ? 'Você foi promovido!' : 'Você foi rebaixado',
    `${tipo === 'promocao' ? 'Promoção' : 'Rebaixamento'}: ${de} → ${destino.nome}${motivo ? ` · Motivo: ${motivo}` : ''}`, '/perfil')
  writeData(data)

  const por = req.user!.username
  audit(tipo === 'promocao' ? 'MEMBRO_PROMOVIDO' : 'MEMBRO_REBAIXADO', req, `${membro.policial} (#${membro.id}): ${de} → ${destino.nome}`)
  const snap = structuredClone(data)
  emSegundoPlano('promoção', () => postarMudancaCargo(snap, membro, tipo, de, destino.nome, por, motivo || undefined))
  res.json({ tipo, de, para: destino.nome, membro: comVinculo(data, membro) })
})

// POST /api/membros/:id/advertencia — define o nível de advertência (1–3)
router.post('/:id/advertencia', requireAuth, requireArea('membros', 'editar'), validateBody(advertenciaSchema), (req: Request, res: Response): void => {
  const ctx = carregarMembro(req, res); if (!ctx) return
  const { data, membro } = ctx
  const negado = podeGerenciar(data, req.user!.contaId, membro)
  if (negado) { res.status(403).json({ error: negado }); return }

  const { nivel, motivo } = req.body as { nivel: NivelAdvertencia; motivo: string }
  const por = req.user!.username
  membro.adv1 = nivel >= 1
  membro.adv2 = nivel >= 2
  membro.adv3 = nivel >= 3
  membro.advertencias = [...(membro.advertencias ?? []), { nivel, motivo, autor: por, data: new Date().toISOString() }]
  notificar(data, contaDoMembro(data, membro.id)?.id, 'advertencia', `Advertência nível ${nivel}`,
    `Você recebeu uma advertência nível ${nivel}. Motivo: ${motivo}`, '/perfil')
  writeData(data)

  audit('ADVERTENCIA_APLICADA', req, `${membro.policial} (#${membro.id}) nível ${nivel}: ${motivo}`)
  const snap = structuredClone(data)
  emSegundoPlano('advertência', () => postarAdvertencia(snap, membro, nivel, por, motivo))
  res.json(comVinculo(data, membro))
})

// DELETE /api/membros/:id/advertencia — retira as advertências (histórico é mantido)
router.delete('/:id/advertencia', requireAuth, requireArea('membros', 'editar'), (req: Request, res: Response): void => {
  const ctx = carregarMembro(req, res); if (!ctx) return
  const { data, membro } = ctx
  const negado = podeGerenciar(data, req.user!.contaId, membro)
  if (negado) { res.status(403).json({ error: negado }); return }

  membro.adv1 = false; membro.adv2 = false; membro.adv3 = false
  notificar(data, contaDoMembro(data, membro.id)?.id, 'aprovada', 'Advertências retiradas',
    'Suas advertências foram retiradas.', '/perfil')
  writeData(data)
  const por = req.user!.username
  audit('ADVERTENCIA_REMOVIDA', req, `${membro.policial} (#${membro.id})`)
  const snap = structuredClone(data)
  emSegundoPlano('remoção de advertência', () => postarAdvertencia(snap, membro, null, por))
  res.json(comVinculo(data, membro))
})

// ── Alterações de perfil (precisam de aprovação de um superior) ────────────────

// GET /api/membros/solicitacoes-perfil — pendentes que o usuário pode decidir
router.get('/solicitacoes-perfil', requireAuth, requireArea('membros', 'editar'), (req: Request, res: Response): void => {
  const data = readData()
  const lista = data.solicitacoesPerfil
    .filter(sp => sp.status === 'pendente')
    .map(sp => ({ sp, membro: data.membros.find(m => m.id === sp.membroId) }))
    .filter(({ membro }) => membro && !podeGerenciar(data, req.user!.contaId, membro))
    .map(({ sp, membro }) => ({
      ...sp,
      membroNome: membro!.policial,
      solicitante: data.contas.find(c => c.id === sp.contaId)?.discordUsername ?? data.contas.find(c => c.id === sp.contaId)?.username,
    }))
  res.json(lista)
})

function carregarSolicitacaoPerfil(req: Request, res: Response) {
  const id = parseInt(String(req.params.id), 10)
  const data = readData()
  const sp = data.solicitacoesPerfil.find(x => x.id === id)
  if (!sp || sp.status !== 'pendente') { res.status(404).json({ error: 'Solicitação não encontrada ou já decidida' }); return undefined }
  const membro = data.membros.find(m => m.id === sp.membroId)
  if (!membro) { res.status(404).json({ error: 'Membro não encontrado' }); return undefined }
  const negado = podeGerenciar(data, req.user!.contaId, membro)
  if (negado) { res.status(403).json({ error: negado }); return undefined }
  return { data, sp, membro }
}

// PUT /api/membros/solicitacoes-perfil/:id/aprovar — aplica as alterações
router.put('/solicitacoes-perfil/:id/aprovar', requireAuth, requireArea('membros', 'editar'), (req: Request, res: Response): void => {
  const ctx = carregarSolicitacaoPerfil(req, res); if (!ctx) return
  const { data, sp, membro } = ctx
  const por = req.user!.username
  for (const a of sp.alteracoes) (membro as unknown as Record<string, unknown>)[a.campo] = a.para
  sp.status = 'aprovada'
  sp.decididoPor = por
  sp.decididoEm = new Date().toISOString()
  notificar(data, sp.contaId, 'aprovada', 'Alteração de perfil aprovada',
    `Sua alteração de perfil foi aprovada por ${por} e já está valendo.`, '/perfil')
  writeData(data)

  audit('PERFIL_APROVADO', req, `${membro.policial} (#${membro.id}) — solicitação #${sp.id}`)
  const snap = structuredClone(data)
  const solicitante = data.contas.find(c => c.id === sp.contaId)?.username ?? '—'
  const alteracoes = sp.alteracoes
  emSegundoPlano('perfil atualizado', () => postarPerfilAtualizado(snap, membro, alteracoes, solicitante, por))
  res.json(comVinculo(data, membro))
})

// PUT /api/membros/solicitacoes-perfil/:id/recusar
router.put('/solicitacoes-perfil/:id/recusar', requireAuth, requireArea('membros', 'editar'), validateBody(recusarSchema), (req: Request, res: Response): void => {
  const ctx = carregarSolicitacaoPerfil(req, res); if (!ctx) return
  const { data, sp, membro } = ctx
  const { motivo } = req.body as { motivo?: string }
  sp.status = 'recusada'
  sp.decididoPor = req.user!.username
  sp.decididoEm = new Date().toISOString()
  if (motivo) sp.motivoRecusa = motivo
  notificar(data, sp.contaId, 'recusada', 'Alteração de perfil recusada',
    `Sua alteração de perfil foi recusada por ${sp.decididoPor}${motivo ? `. Motivo: ${motivo}` : '.'}`, '/perfil')
  writeData(data)
  audit('PERFIL_RECUSADO', req, `${membro.policial} (#${membro.id}) — solicitação #${sp.id}`)
  res.json({ ok: true })
})

// POST /api/membros/:id/exonerar — exonera, bloqueia o acesso e registra no Discord
router.post('/:id/exonerar', requireAuth, requireArea('membros', 'editar'), validateBody(exonerarSchema), (req: Request, res: Response): void => {
  const ctx = carregarMembro(req, res); if (!ctx) return
  const { data, membro } = ctx
  const negado = podeGerenciar(data, req.user!.contaId, membro)
  if (negado) { res.status(403).json({ error: negado }); return }

  const { motivo } = req.body as { motivo: string }
  try {
    exonerarMembro(data, membro, req.user!.username, motivo)
    notificarArea(data, 'membros', [req.user!.contaId], 'exoneracao', `${membro.policial} foi exonerado`,
      `Exonerado por ${req.user!.username}. Motivo: ${motivo}`, '/membros')
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Não foi possível exonerar.' }); return
  }
  writeData(data)
  audit('MEMBRO_EXONERADO', req, `${membro.policial} (#${membro.id}): ${motivo}`)
  res.json({ ok: true })
})

router.post('/', requireAuth, requireArea('membros', 'editar'), validateBody(membroSchema), (req: Request, res: Response): void => {
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
  notificarArea(data, 'membros', [req.user!.contaId], 'membro', 'Novo membro na unidade',
    `${novoMembro.policial} foi adicionado ao efetivo por ${req.user!.username}.`, '/membros')
  writeData(data)
  audit('MEMBRO_CREATED', req, `ID: ${novoMembro.id} | Nome: ${novoMembro.policial}`)
  res.status(201).json(novoMembro)
})

router.put('/reorder', requireAuth, requireArea('membros', 'editar'), validateBody(reorderSchema), (req: Request, res: Response): void => {
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

router.put('/:id', requireAuth, requireArea('membros', 'editar'), validateBody(membroUpdateSchema), (req: Request, res: Response): void => {
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

router.delete('/:id', requireAuth, requireArea('membros', 'editar'), (req: Request, res: Response): void => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }

  const data = readData()
  const idx = data.membros.findIndex(m => m.id === id)
  if (idx === -1) { res.status(404).json({ error: 'Membro não encontrado' }); return }

  const removido = data.membros[idx]
  const nome = removido.policial
  data.membros.splice(idx, 1)
  data.membrosOrder = data.membrosOrder.filter(oid => oid !== id)
  writeData(data)

  audit('MEMBRO_DELETED', req, `ID: ${id} | Nome: ${nome}`)
  if (removido.discordThreadId) {
    const por = req.user!.username
    emSegundoPlano('exoneração', () => postarExoneracao(data, removido, por))
  }
  res.json({ ok: true })
})

export default router
