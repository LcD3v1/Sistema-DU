import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { requireArea, requireAprovado } from '../middleware/roles'
import { validateBody, membroSchema, membroUpdateSchema, reorderSchema, promoverSchema, advertenciaSchema, exonerarSchema, recusarSchema } from '../middleware/validate'
import { audit } from '../security/audit'
import { readData, writeData, peekData } from '../data'
import { Membro, DuData, NivelAdvertencia, CampoPerfil } from '../types'
import { notificar, notificarArea } from '../notificacoes'
import { avatarAtual, aplicarCampoPerfil } from '../identidadeMembro'
import { contaDoMembro, nivelHierarquia, podeGerenciar, exonerarMembro, nomeCargoAtual, ausenciaAtivaDoMembro, hoje } from '../efetivo'
import { canArea, isAdmin, isDev, PROTECTED_OWNER_ID } from '../access'
import { aplicarPerfilNoDiscord, sincronizarAdvertencias, valorDePerfilInvalido, exonerarNoDiscord, registrarNoForum, camposDasAlteracoes, COR_REGISTRO, ROTULO_CAMPO } from '../setagem'

import { nomeDoMembro, nomeDaConta } from '../registros'
import { fotoSemIds } from '../fotoPublica'
const router = Router()

/** Campos da ficha fora do perfil (status, datas, advertências) nos painéis do fórum de registro. */
const ROTULO_FICHA: Record<string, string> = { status: 'Status', entrada: 'Entrada', promocao: 'Última promoção', adv1: 'ADV 1', adv2: 'ADV 2', adv3: 'ADV 3' }

router.get('/', requireAuth, (req, res) => {
  const data = readData()
  const order = data.membrosOrder
  const conta = data.contas.find(c => c.id === req.user!.contaId)!
  const completo = canArea(conta, data, 'membros', 'ver') || canArea(conta, data, 'promocoes', 'ver')
  // Detalhes internos (motivo/autor de advertência, quem promoveu, Discord) só para quem edita
  const detalhes = canArea(conta, data, 'membros', 'editar')
  const aprovado = isAdmin(conta, data) || Boolean(conta.cargoPermId)
  // Conta sem cargo (recém-criada) só vê o próprio perfil; sem "ver membros", inativos ficam ocultos
  let membros = !aprovado
    ? data.membros.filter(m => m.id === conta.membroId)
    : completo ? data.membros : data.membros.filter(m => m.status !== 'Inativo' || m.id === conta.membroId)

  if (order.length > 0) {
    const orderMap = new Map(order.map((id, idx) => [id, idx]))
    membros = [...membros].sort((a, b) => {
      const ia = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999
      const ib = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999
      return ia - ib
    })
  }
  res.json(membros.map(m => m.id === conta.membroId || detalhes ? comVinculo(data, m) : completo ? semDetalhesInternos(comVinculo(data, m)) : ({
    id: m.id, policial: m.policial, codinome: m.codinome ?? '', badge: m.badge, patenteDPD: m.patenteDPD,
    nomeServidor: contaDoMembro(data, m.id)?.nomeServidor ?? null,
    discordUsername: contaDoMembro(data, m.id)?.discordUsername ?? null,
    patenteInterna: m.patenteInterna, status: m.status, entrada: m.entrada,
  })))
})

/** Acrescenta ao membro os dados da conta vinculada (cargo, ausência). */
function comVinculo(data: DuData, m: Membro) {
  const conta = contaDoMembro(data, m.id)
  const aus = ausenciaAtivaDoMembro(data, m.id)
  // IDs de servidor/bot/tópico do Discord nunca saem da API
  const { guildId: _g, botId: _b, discordThreadId: _t, registroCanal: _r, ...publico } = m
  return {
    ...publico,
    contaId: conta?.id ?? null,
    cargoPermId: conta?.cargoPermId ?? null,
    cargoNome: nomeCargoAtual(data, m),
    discordId: conta?.discordId ?? null,
    discordUsername: conta?.discordUsername ?? null,
    nomeServidor: conta?.nomeServidor ?? null,
    // Foto do CDN do Discord vira link opaco do site (a URL do Discord leva o ID do servidor e da pessoa)
    avatarServidor: fotoSemIds(m.id, conta?.avatarServidor),
    avatarAtual: fotoSemIds(m.id, avatarAtual(conta)),
    ausenteAte: aus?.dataFim ?? null,
  }
}

/** Visão de quem só tem "ver membros": sem motivo/autor de advertências, autor de promoções e Discord. */
function semDetalhesInternos<T extends ReturnType<typeof comVinculo>>(m: T) {
  const { discordId: _d, advertencias, historicoCargos, ...resto } = m
  return {
    ...resto,
    advertencias: advertencias?.map(a => ({ nivel: a.nivel, data: a.data, ...(a.removida ? { removida: true } : {}) })),
    historicoCargos: historicoCargos?.map(h => ({ data: h.data, tipo: h.tipo, de: h.de, para: h.para })),
  }
}

// GET /api/membros/hierarquia — cargos em ordem hierárquica (topo primeiro)
router.get('/hierarquia', requireAuth, requireAprovado, (req, res) => {
  const data = readData()
  const conta = data.contas.find(c => c.id === req.user!.contaId)
  const admin = Boolean(conta && isAdmin(conta, data))
  const dev = Boolean(conta && isDev(conta, data))
  res.json(data.cargosPermissao
    // Cargo de dev só aparece para um dev — ninguém mais pode concedê-lo.
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => dev || c.dev !== true)
    .map(({ c, i }) => (admin
      ? { id: c.id, nome: c.nome, admin: c.admin === true, dev: c.dev === true, posicao: i }
      : { id: c.id, nome: c.nome, posicao: i })))
})

// GET /api/membros/exonerados — contas bloqueadas por exoneração
router.get('/exonerados', requireAuth, requireArea('membros', 'editar'), (_req: Request, res: Response): void => {
  const data = readData()
  const lista = data.contas
    .filter(c => c.exonerado)
    .map(conta => {
      const membro = conta.membroId ? data.membros.find(m => m.id === conta.membroId) : undefined
      const cargo = conta.cargoPermId ? data.cargosPermissao.find(c => c.id === conta.cargoPermId) : undefined
      return {
        id: conta.id,
        username: conta.username,
        discordUsername: conta.discordUsername,
        discordId: conta.discordId,
        nomeServidor: conta.nomeServidor,
        exoneradoEm: conta.exoneradoEm,
        exoneradoMotivo: conta.exoneradoMotivo,
        membroId: conta.membroId ?? null,
        policial: membro?.policial ?? null,
        cargoNome: cargo?.nome ?? null,
      }
    })
    .sort((a, b) => String(b.exoneradoEm ?? '').localeCompare(String(a.exoneradoEm ?? '')))

  res.json(lista)
})

// POST /api/membros/exonerados/:id/retirar — readmite a conta e força novo cadastro/aprovação
router.post('/exonerados/:id/retirar', requireAuth, requireArea('membros', 'editar'), (req: Request, res: Response): void => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }

  const data = readData()
  const conta = data.contas.find(c => c.id === id)
  if (!conta) { res.status(404).json({ error: 'Conta não encontrada' }); return }
  if (conta.id === PROTECTED_OWNER_ID) { res.status(400).json({ error: 'A conta dona não pode passar por readmissão manual.' }); return }
  if (!conta.exonerado) { res.status(400).json({ error: 'Esta conta não está exonerada.' }); return }
  // A exoneração apaga o cargo (não sobra hierarquia para comparar): desfazer é decisão de administrador,
  // senão um editor de patente baixa readmitia quem um superior exonerou
  const ator = data.contas.find(c => c.id === req.user!.contaId)
  if (!ator || !isAdmin(ator, data)) {
    audit('PRIVILEGE_ESCALATION_ATTEMPT', req, `Readmissão da conta #${conta.id} sem ser administrador`)
    res.status(403).json({ error: 'Só um administrador pode retirar uma exoneração.' }); return
  }
  if (isDev(conta, data) && !isDev(ator, data)) { res.status(403).json({ error: 'Somente um dev pode readmitir esta conta.' }); return }

  delete conta.exonerado
  delete conta.exoneradoEm
  delete conta.exoneradoMotivo
  delete conta.cargoPermId
  delete conta.membroId
  conta.ativo = true
  conta.onboarded = false

  notificar(data, conta.id, 'cadastro', 'Exoneração retirada',
    'Sua exoneração foi retirada. Entre novamente e preencha o cadastro para solicitar set de novo.', '/perfil')
  writeData(data)
  audit('ACCOUNT_READMITTED', req, `Conta ${conta.username} (#${conta.id}) — exoneração retirada por ${nomeDaConta(peekData(), req.user!.contaId)}`)
  void registrarNoForum(conta.id, { titulo: 'READMISSÃO · Exoneração retirada', emoji: '↩️', cor: COR_REGISTRO.aviso, texto: 'Precisa refazer o cadastro e passar por nova aprovação.', por: nomeDaConta(peekData(), req.user!.contaId) })
  res.json({ ok: true })
})

function carregarMembro(req: Request, res: Response): { data: DuData; membro: Membro } | undefined {
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
  membro.historicoCargos = [...(membro.historicoCargos ?? []),
    { data: new Date().toISOString(), tipo, de, para: destino.nome, por: nomeDaConta(peekData(), req.user!.contaId) }]
  notificarArea(data, 'membros', [conta?.id, req.user!.contaId], tipo,
    tipo === 'promocao' ? `${nomeDoMembro(data, membro)} foi promovido` : `${nomeDoMembro(data, membro)} foi rebaixado`,
    `${de} → ${destino.nome} · por ${nomeDaConta(peekData(), req.user!.contaId)}`, '/membros')
  notificar(data, conta?.id, tipo,
    tipo === 'promocao' ? 'Você foi promovido!' : 'Você foi rebaixado',
    `${tipo === 'promocao' ? 'Promoção' : 'Rebaixamento'}: ${de} → ${destino.nome}${motivo ? ` · Motivo: ${motivo}` : ''}`, '/perfil')
  writeData(data)

  const por = nomeDaConta(peekData(), req.user!.contaId)
  audit(tipo === 'promocao' ? 'MEMBRO_PROMOVIDO' : 'MEMBRO_REBAIXADO', req, `${nomeDoMembro(data, membro)} (#${membro.id}): ${de} → ${destino.nome}`)
  void registrarNoForum(conta?.id, { titulo: tipo === 'promocao' ? 'PROMOÇÃO' : 'REBAIXAMENTO', emoji: tipo === 'promocao' ? '⬆️' : '⬇️',
    cor: tipo === 'promocao' ? COR_REGISTRO.aprovado : COR_REGISTRO.recusado, campos: [['Patente', `${de || '—'} → ${destino.nome}`]], ...(motivo ? { motivo } : {}), por })
  res.json({ tipo, de, para: destino.nome, membro: comVinculo(data, membro) })
})

// POST /api/membros/:id/advertencia — define o nível de advertência (1–3)
router.post('/:id/advertencia', requireAuth, requireArea('membros', 'editar'), validateBody(advertenciaSchema), (req: Request, res: Response): void => {
  const ctx = carregarMembro(req, res); if (!ctx) return
  const { data, membro } = ctx
  const negado = podeGerenciar(data, req.user!.contaId, membro)
  if (negado) { res.status(403).json({ error: negado }); return }

  // Cada quadradinho é independente: aplicar o ADV 2 não mexe no 1 nem no 3
  const { nivel, motivo } = req.body as { nivel: NivelAdvertencia; motivo: string }
  const campo = `adv${nivel}` as 'adv1' | 'adv2' | 'adv3'
  if (membro[campo]) { res.status(409).json({ error: `O membro já está com ADV ${nivel}.` }); return }
  const por = nomeDaConta(peekData(), req.user!.contaId)
  membro[campo] = true
  membro.advertencias = [...(membro.advertencias ?? []), { nivel, motivo, autor: por, data: new Date().toISOString() }]
  notificar(data, contaDoMembro(data, membro.id)?.id, 'advertencia', `Advertência ADV ${nivel}`,
    `Você recebeu a advertência ADV ${nivel}. Motivo: ${motivo}`, '/perfil')
  writeData(data)

  audit('ADVERTENCIA_APLICADA', req, `${nomeDoMembro(data, membro)} (#${membro.id}) ADV ${nivel}: ${motivo}`)
  void registrarNoForum(contaDoMembro(data, membro.id)?.id, { titulo: `ADVERTÊNCIA · ADV ${nivel}`, emoji: '⚠️', cor: COR_REGISTRO.recusado, motivo, por })
  void sincronizarAdvertencias(membro.id)   // cargo de advertência no Discord
  res.json(comVinculo(data, membro))
})

// DELETE /api/membros/:id/advertencia/:nivel — retira só aquele nível (o histórico é mantido)
router.delete('/:id/advertencia/:nivel', requireAuth, requireArea('membros', 'editar'), (req: Request, res: Response): void => {
  const nivel = parseInt(String(req.params.nivel), 10)
  if (nivel !== 1 && nivel !== 2 && nivel !== 3) { res.status(400).json({ error: 'Nível de advertência inválido' }); return }
  const ctx = carregarMembro(req, res); if (!ctx) return
  const { data, membro } = ctx
  const negado = podeGerenciar(data, req.user!.contaId, membro)
  if (negado) { res.status(403).json({ error: negado }); return }

  const campo = `adv${nivel}` as 'adv1' | 'adv2' | 'adv3'
  if (!membro[campo]) { res.status(409).json({ error: `O membro não está com ADV ${nivel}.` }); return }
  const por = nomeDaConta(peekData(), req.user!.contaId)
  membro[campo] = false
  membro.advertencias = [...(membro.advertencias ?? []),
    { nivel: nivel as NivelAdvertencia, motivo: `ADV ${nivel} retirada`, autor: por, data: new Date().toISOString(), removida: true }]
  notificar(data, contaDoMembro(data, membro.id)?.id, 'aprovada', `ADV ${nivel} retirada`,
    `Sua advertência ADV ${nivel} foi retirada.`, '/perfil')
  writeData(data)

  audit('ADVERTENCIA_REMOVIDA', req, `${nomeDoMembro(data, membro)} (#${membro.id}) ADV ${nivel}`)
  void registrarNoForum(contaDoMembro(data, membro.id)?.id, { titulo: `ADVERTÊNCIA · ADV ${nivel} retirada`, emoji: '✅', cor: COR_REGISTRO.aprovado, por })
  void sincronizarAdvertencias(membro.id)
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
  const por = nomeDaConta(peekData(), req.user!.contaId)
  audit('ADVERTENCIA_REMOVIDA', req, `${nomeDoMembro(data, membro)} (#${membro.id})`)
  void registrarNoForum(contaDoMembro(data, membro.id)?.id, { titulo: 'ADVERTÊNCIA · Todas retiradas', emoji: '✅', cor: COR_REGISTRO.aprovado, por })
  void sincronizarAdvertencias(membro.id)
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
      membroNome: nomeDoMembro(data, membro!),
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
  const por = nomeDaConta(peekData(), req.user!.contaId)
  const invalido = sp.alteracoes.map(a => valorDePerfilInvalido(data, a.campo, a.para)).find(Boolean)
  if (invalido) { res.status(409).json({ error: `${invalido} Recuse este pedido.` }); return }
  const antes = { patente: membro.patenteInterna, setor: membro.setor }
  for (const a of sp.alteracoes) aplicarCampoPerfil(membro, a.campo, a.para)
  sp.status = 'aprovada'
  sp.decididoPor = por
  sp.decididoEm = new Date().toISOString()
  notificar(data, sp.contaId, 'aprovada', 'Alteração de perfil aprovada',
    `Sua alteração de perfil foi aprovada por ${por} e já está valendo.`, '/perfil')
  writeData(data)

  audit('PERFIL_APROVADO', req, `${nomeDoMembro(data, membro)} (#${membro.id}) — solicitação #${sp.id}`)
  void registrarNoForum(sp.contaId, { titulo: 'ATUALIZAÇÃO · Perfil aprovado', emoji: '✅', cor: COR_REGISTRO.aprovado, texto: 'Alteração aprovada e já valendo.', campos: camposDasAlteracoes(sp.alteracoes), por })
  // Só depois de aprovado: patente/setor/apelido também mudam no Discord
  if (sp.alteracoes.some(a => ['patenteInterna', 'setor', 'codinome', 'passaporte'].includes(a.campo))) void aplicarPerfilNoDiscord(membro.id, antes)
  res.json(comVinculo(data, membro))
})

// PUT /api/membros/solicitacoes-perfil/:id/recusar
router.put('/solicitacoes-perfil/:id/recusar', requireAuth, requireArea('membros', 'editar'), validateBody(recusarSchema), (req: Request, res: Response): void => {
  const ctx = carregarSolicitacaoPerfil(req, res); if (!ctx) return
  const { data, sp, membro } = ctx
  const { motivo } = req.body as { motivo?: string }
  sp.status = 'recusada'
  sp.decididoPor = nomeDaConta(peekData(), req.user!.contaId)
  sp.decididoEm = new Date().toISOString()
  if (motivo) sp.motivoRecusa = motivo
  notificar(data, sp.contaId, 'recusada', 'Alteração de perfil recusada',
    `Sua alteração de perfil foi recusada por ${sp.decididoPor}${motivo ? `. Motivo: ${motivo}` : '.'}`, '/perfil')
  writeData(data)
  audit('PERFIL_RECUSADO', req, `${nomeDoMembro(data, membro)} (#${membro.id}) — solicitação #${sp.id}`)
  void registrarNoForum(sp.contaId, { titulo: 'ATUALIZAÇÃO · Pedido recusado', emoji: '❌', cor: COR_REGISTRO.recusado, texto: 'Nada foi alterado.', campos: camposDasAlteracoes(sp.alteracoes), ...(motivo ? { motivo } : {}), por: sp.decididoPor })
  res.json({ ok: true })
})

// POST /api/membros/:id/exonerar — exonera e bloqueia o acesso
router.post('/:id/exonerar', requireAuth, requireArea('membros', 'editar'), validateBody(exonerarSchema), (req: Request, res: Response): void => {
  const ctx = carregarMembro(req, res); if (!ctx) return
  const { data, membro } = ctx
  const negado = podeGerenciar(data, req.user!.contaId, membro)
  if (negado) { res.status(403).json({ error: negado }); return }

  const { motivo } = req.body as { motivo: string }
  let contaExonerada: { id: number; discordId?: string } | undefined
  try {
    contaExonerada = exonerarMembro(data, membro, nomeDaConta(peekData(), req.user!.contaId), motivo)
    notificarArea(data, 'membros', [req.user!.contaId], 'exoneracao', `${nomeDoMembro(data, membro)} foi exonerado`,
      `Exonerado por ${nomeDaConta(peekData(), req.user!.contaId)}. Motivo: ${motivo}`, '/membros')
  } catch (err) {
    // Só mensagens de regra de negócio conhecidas chegam ao cliente (nunca erro interno)
    const regra = err instanceof Error && /^Um dono do sistema não pode ser exonerado\.$/.test(err.message)
    res.status(400).json({ error: regra ? (err as Error).message : 'Não foi possível exonerar.' }); return
  }
  writeData(data)
  audit('MEMBRO_EXONERADO', req, `${nomeDoMembro(data, membro)} (#${membro.id}): ${motivo}`)
  // Discord: motivo no privado, cargos retirados e expulsão (em segundo plano; resultado vai para a auditoria)
  void registrarNoForum(contaExonerada?.id, { titulo: 'EXONERAÇÃO', emoji: '⛔', cor: COR_REGISTRO.recusado, motivo, por: nomeDaConta(peekData(), req.user!.contaId) })
  if (contaExonerada?.discordId) void exonerarNoDiscord(contaExonerada.discordId, motivo, nomeDoMembro(data, membro)).catch(() => {})
  res.json({ ok: true })
})

router.post('/', requireAuth, requireArea('membros', 'editar'), validateBody(membroSchema), (req: Request, res: Response): void => {
  const data = readData()
  const body = req.body as Omit<Membro, 'id'>
  // Mesmas regras da edição: patente/setor só da lista cadastrada; advertência só pelo fluxo próprio (ou admin)
  const invalido = (['setor', 'patenteInterna'] as const).map(c => valorDePerfilInvalido(data, c, body[c])).find(Boolean)
  if (invalido) { res.status(400).json({ error: invalido }); return }
  const ator = data.contas.find(c => c.id === req.user!.contaId)
  if (!(ator && isAdmin(ator, data)) && (body.adv1 || body.adv2 || body.adv3)) {
    res.status(403).json({ error: 'Advertências são aplicadas pela tela de advertência.' }); return
  }

  const novoMembro: Membro = {
    id: data.nextMemId,
    badge:          body.badge,
    passaporte:     body.passaporte,
    policial:       body.policial,
    patenteDPD:     body.patenteDPD,
    patenteInterna: body.patenteInterna,
    codinome:       body.codinome,
    status:         body.status,
    entrada:        body.entrada ?? hoje(),
    promocao:       body.promocao ?? hoje(),
    adv1: body.adv1,
    adv2: body.adv2,
    adv3: body.adv3,
  }

  data.membros.push(novoMembro)
  data.membrosOrder.push(novoMembro.id)
  data.nextMemId++
  notificarArea(data, 'membros', [req.user!.contaId], 'membro', 'Novo membro na unidade',
    `${nomeDoMembro(data, novoMembro)} foi adicionado ao efetivo por ${nomeDaConta(data, req.user!.contaId)}.`, '/membros')
  writeData(data)
  audit('MEMBRO_CREATED', req, `ID: ${novoMembro.id} | Nome: ${nomeDoMembro(data, novoMembro)}`)
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
  const negado = podeGerenciar(data, req.user!.contaId, data.membros[idx])
  if (negado) { res.status(403).json({ error: negado }); return }

  // Patente interna e advertências têm fluxos próprios (promover/advertência); só admin edita direto
  const ator = data.contas.find(c => c.id === req.user!.contaId)
  const allowed: (keyof Membro)[] = ator && isAdmin(ator, data)
    ? ['badge','passaporte','policial','codinome','patenteDPD','patenteInterna','setor','nivel','status','entrada','promocao','adv1','adv2','adv3']
    : ['badge','passaporte','policial','codinome','patenteDPD','setor','nivel','status','entrada','promocao']
  const body = req.body as Partial<Membro>
  const proibidos = (['patenteInterna', 'adv1', 'adv2', 'adv3'] as const).filter(f => f in body && !allowed.includes(f))
  if (proibidos.length) {
    res.status(403).json({ error: 'Patente interna e advertências são alteradas pelas telas de promoção e advertência.' }); return
  }
  const invalido = (['setor', 'patenteInterna'] as const).map(c => c in body ? valorDePerfilInvalido(data, c, body[c]) : undefined).find(Boolean)
  if (invalido) { res.status(400).json({ error: invalido }); return }
  const m = data.membros[idx]
  const antes = { patente: m.patenteInterna, setor: m.setor, codinome: m.codinome, passaporte: m.passaporte, adv: [m.adv1, m.adv2, m.adv3].join() }
  const valoresAntes = Object.fromEntries(allowed.map(f => [f, m[f]]))
  allowed.forEach(field => {
    if (field in body) {
      (data.membros[idx] as unknown as Record<string, unknown>)[field] = body[field]
    }
  })

  writeData(data)
  // Log: o que mudou em cada campo (para a página de Logs)
  const mudancas = allowed.filter(f => f in body && String(valoresAntes[f] ?? '') !== String(m[f] ?? '')).map(f => `${f}: ${String(valoresAntes[f] ?? '') || '—'} → ${String(m[f] ?? '') || '—'}`)
  audit('MEMBRO_UPDATED', req, [`${nomeDoMembro(data, m)} (#${id})`, ...mudancas].join('\n'))
  // Fórum de registro: toda alteração da ficha (aqui feita por quem cuida do efetivo) vai para o tópico da pessoa
  const mudados = allowed.filter(f => f in body && String(valoresAntes[f] ?? '') !== String(m[f] ?? ''))
  if (mudados.length) void registrarNoForum(contaDoMembro(data, id)?.id, {
    titulo: 'ATUALIZAÇÃO · Ficha editada', emoji: '✏️', cor: COR_REGISTRO.aviso, texto: 'Editada por quem cuida do efetivo.',
    por: nomeDaConta(peekData(), req.user!.contaId),
    campos: mudados.map(f => [ROTULO_CAMPO[f as CampoPerfil] ?? ROTULO_FICHA[f] ?? f, `${String(valoresAntes[f] ?? '') || '—'} → ${String(m[f] ?? '') || '—'}`]),
  })
  // Promoção/setor/apelido e advertências refletem no Discord
  if (antes.patente !== m.patenteInterna || antes.setor !== m.setor || antes.codinome !== m.codinome || antes.passaporte !== m.passaporte) {
    void aplicarPerfilNoDiscord(id, { patente: antes.patente, setor: antes.setor })
  }
  if (antes.adv !== [m.adv1, m.adv2, m.adv3].join()) void sincronizarAdvertencias(id)
  res.json(comVinculo(data, data.membros[idx]))
})

router.delete('/:id', requireAuth, requireArea('membros', 'editar'), (req: Request, res: Response): void => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }

  const data = readData()
  const idx = data.membros.findIndex(m => m.id === id)
  if (idx === -1) { res.status(404).json({ error: 'Membro não encontrado' }); return }
  const negado = podeGerenciar(data, req.user!.contaId, data.membros[idx])
  if (negado) { res.status(403).json({ error: negado }); return }

  const removido = data.membros[idx]
  const nome = nomeDoMembro(data, removido)
  // Com conta vinculada: vira exoneração (bloqueio total, dados guardados para readmissão)
  if (contaDoMembro(data, id)) {
    const exonerada = exonerarMembro(data, removido, nomeDaConta(peekData(), req.user!.contaId), 'Removido do efetivo')
    writeData(data)
    audit('MEMBRO_EXONERADO', req, `ID: ${id} | Nome: ${nome} | via remoção`)
    void registrarNoForum(exonerada?.id, { titulo: 'EXONERAÇÃO', emoji: '⛔', cor: COR_REGISTRO.recusado, motivo: 'Removido do efetivo', por: nomeDaConta(peekData(), req.user!.contaId) })
    if (exonerada?.discordId) void exonerarNoDiscord(exonerada.discordId, 'Removido do efetivo', nome).catch(() => {})
    res.json({ ok: true, exonerado: true }); return
  }
  data.membros.splice(idx, 1)
  data.membrosOrder = data.membrosOrder.filter(oid => oid !== id)
  writeData(data)

  audit('MEMBRO_DELETED', req, `ID: ${id} | Nome: ${nome}`)
  res.json({ ok: true })
})

export default router
