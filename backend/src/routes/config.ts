import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { requireArea, adminOnly, requireAprovado, requireAlgumaArea, requireDev } from '../middleware/roles'
import { criticalLimiter, hierarquiaLimiter } from '../middleware/rateLimiter'
import {
  validateBody,
  qruSchema, tipoQruSchema, removerQruSchema, patenteSchema, cargoSchema,
  updateContaSchema,
  logoSchema, recCfgSchema,
  reorderPatenteSchema, reorderQruSchema,
  situacaoAnuncioSchema, situacaoAnuncioUpdateSchema,
  cargoPermCreateSchema, cargoPermUpdateSchema, reorderCargosSchema,
  aprovarAcessoSchema, reprovarAcessoSchema, corrigirAcessoSchema, restoreSchema,
} from '../middleware/validate'
import { audit, readAuditLog } from '../security/audit'
import { alertar } from '../security/alertas'
import { readData, writeData, converterPatentesParaDpd, peekData } from '../data'
import { Conta, DuData, CargoPermissao, TipoQru } from '../types'
import { tipoDoQru, definirTipoQru } from '../qrus'
import { normalizePermMap } from '../permAreas'
import { isDev, podeAtribuirCargo, PROTECTED_OWNER_ID } from '../access'
import { notificar } from '../notificacoes'
import { criarContaDeSolicitacao, aprovarPedido, reprovarPedido, solicitarCorrecao, setagemAtual, registrarNoForum, aplicarPerfilNoDiscord, COR_REGISTRO } from '../setagem'
import { imagemEnviada } from '../hierarquia'

import { nomeDaConta } from '../registros'
const router = Router()

/**
 * Conta para a tela de Configurações — LISTA BRANCA (só o que a tela usa). Nunca sai: guildId/botId,
 * cargos do Discord, ficha arquivada (com tópico/canal do Discord), dados da setagem, senha legada nem
 * versão de sessão.
 */
function contaPublica(c: Conta) {
  return {
    id: c.id, username: c.username, nivel: c.nivel, ativo: c.ativo, cargoPermId: c.cargoPermId ?? null,
    discordId: c.discordId, discordUsername: c.discordUsername, nomeServidor: c.nomeServidor, onboarded: c.onboarded,
    exonerado: c.exonerado, exoneradoEm: c.exoneradoEm, exoneradoMotivo: c.exoneradoMotivo,
  }
}

/** O autor da requisição é dev? (poder total, acima do admin) */
function souDev(req: Request, data: DuData): boolean {
  const autor = data.contas.find(c => c.id === req.user?.contaId)
  return Boolean(autor && isDev(autor, data))
}

// ── QRUs ──────────────────────────────────────────────────────────────────────

router.get('/qrus', requireAuth, requireAprovado, (_req, res) => res.json(readData().qrus))

// Tipo de cada QRU (convencional = apreensão; fechado = ação com vitória/derrota)
router.get('/qrus/tipos', requireAuth, requireAprovado, (_req, res) => {
  const data = readData()
  res.json(data.qrus.map(nome => ({ nome, tipo: tipoDoQru(data, nome) })))
})

router.post('/qrus', requireAuth, requireArea('configuracoes', 'editar'), validateBody(qruSchema), (req: Request, res: Response): void => {
  const { nome, tipo } = req.body as { nome: string; tipo: TipoQru }
  const data = readData()
  // Nome repetido é aceito; o tipo é por nome, então repetidos compartilham o mesmo tipo
  data.qrus.push(nome)
  definirTipoQru(data, nome, tipo)
  writeData(data)
  audit('CONFIG_UPDATED', req, `QRU criado: ${nome} (${tipo})`)
  res.status(201).json(data.qrus)
})

// Nome no corpo (não na URL): aceita "/", "." e qualquer outro caractere
router.put('/qrus/tipo', requireAuth, requireArea('configuracoes', 'editar'), validateBody(tipoQruSchema), (req: Request, res: Response): void => {
  const { nome, tipo } = req.body as { nome: string; tipo: TipoQru }
  const data = readData()
  if (!data.qrus.includes(nome)) { res.status(404).json({ error: 'QRU não encontrado' }); return }
  definirTipoQru(data, nome, tipo)
  writeData(data)
  audit('CONFIG_UPDATED', req, `QRU ${nome} → ${tipo}`)
  res.json({ nome, tipo })
})

router.put('/qrus/reorder', requireAuth, requireArea('configuracoes', 'editar'), validateBody(reorderQruSchema), (req: Request, res: Response): void => {
  const { qrus } = req.body as { qrus: string[] }
  const data = readData()
  // Mesma lista, só em outra ordem (repetidos contam: compara as contagens de cada nome)
  const contagem = new Map<string, number>()
  for (const q of data.qrus) contagem.set(q, (contagem.get(q) ?? 0) + 1)
  for (const q of qrus) contagem.set(q, (contagem.get(q) ?? 0) - 1)
  const next = [...qrus]

  if (next.length !== data.qrus.length || [...contagem.values()].some(n => n !== 0)) {
    res.status(400).json({ error: 'Lista de QRUs inválida para reordenação' })
    return
  }

  data.qrus = next
  writeData(data)
  audit('CONFIG_UPDATED', req, 'QRUs reordenados')
  res.json(data.qrus)
})

// Remove UMA ocorrência (a última); o tipo só sai quando não sobra nenhuma com esse nome
router.post('/qrus/remover', requireAuth, requireArea('configuracoes', 'editar'), validateBody(removerQruSchema), (req: Request, res: Response): void => {
  const { nome } = req.body as { nome: string }
  const data = readData()
  const idx = data.qrus.lastIndexOf(nome)
  if (idx === -1) { res.status(404).json({ error: 'QRU não encontrado' }); return }
  data.qrus.splice(idx, 1)
  if (!data.qrus.includes(nome)) definirTipoQru(data, nome, 'convencional')   // tira da lista de fechados
  writeData(data)
  audit('CONFIG_UPDATED', req, `QRU removido: ${nome}`)
  res.json(data.qrus)
})

// ── Patentes ──────────────────────────────────────────────────────────────────

router.get('/patentes', requireAuth, requireAprovado, (_req, res) => res.json(readData().patentes))

router.post('/patentes', requireAuth, requireArea('configuracoes', 'editar'), validateBody(patenteSchema), (req: Request, res: Response): void => {
  const { nome } = req.body as { nome: string }
  const data = readData()
  data.patentes.push(nome)
  writeData(data)
  audit('CONFIG_UPDATED', req, `Patente criada: ${nome}`)
  res.status(201).json(data.patentes)
})

router.put('/patentes/reorder', requireAuth, requireArea('configuracoes', 'editar'), validateBody(reorderPatenteSchema), (req: Request, res: Response): void => {
  const { patentes } = req.body as { patentes: string[] }
  const data = readData()
  data.patentes = patentes.map(p => String(p).slice(0, 50))
  writeData(data)
  res.json(data.patentes)
})

router.delete('/patentes/:nome', requireAuth, adminOnly, (req: Request, res: Response): void => {
  const nome = String(req.params.nome).slice(0, 50)
  const data = readData()
  data.patentes = data.patentes.filter(p => p !== nome)
  writeData(data)
  audit('CONFIG_UPDATED', req, `Patente removida: ${nome}`)
  res.json(data.patentes)
})

// ── Cargos ────────────────────────────────────────────────────────────────────

router.get('/cargos', requireAuth, requireAprovado, (_req, res) => res.json(readData().cargos))

router.post('/cargos', requireAuth, requireArea('configuracoes', 'editar'), validateBody(cargoSchema), (req: Request, res: Response): void => {
  const { nome } = req.body as { nome: string }
  const data = readData()
  data.cargos.push(nome)
  writeData(data)
  audit('CONFIG_UPDATED', req, `Cargo criado: ${nome}`)
  res.status(201).json(data.cargos)
})

router.delete('/cargos/:nome', requireAuth, adminOnly, (req: Request, res: Response): void => {
  const nome = String(req.params.nome).slice(0, 50)
  const data = readData()
  data.cargos = data.cargos.filter(c => c !== nome)
  writeData(data)
  audit('CONFIG_UPDATED', req, `Cargo removido: ${nome}`)
  res.json(data.cargos)
})

// ── Situações de anúncio ────────────────────────────────────────────────────────

router.get('/anuncio-situacoes', requireAuth, requireAprovado, (_req, res) => res.json(readData().anuncioSituacoes))

router.post('/anuncio-situacoes', requireAuth, requireArea('configuracoes', 'editar'), validateBody(situacaoAnuncioSchema), (req: Request, res: Response): void => {
  const { label, titulo, texto } = req.body as { label: string; titulo: string; texto: string }
  const data = readData()
  const nova = { id: data.nextSitId, label, titulo, texto }
  data.anuncioSituacoes.push(nova)
  data.nextSitId++
  writeData(data)
  audit('CONFIG_UPDATED', req, `Situação de anúncio criada: ${label}`)
  res.status(201).json(data.anuncioSituacoes)
})

router.put('/anuncio-situacoes/:id', requireAuth, requireArea('configuracoes', 'editar'), validateBody(situacaoAnuncioUpdateSchema), (req: Request, res: Response): void => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
  const data = readData()
  const s = data.anuncioSituacoes.find(x => x.id === id)
  if (!s) { res.status(404).json({ error: 'Situação não encontrada' }); return }
  const { label, titulo, texto } = req.body as { label?: string; titulo?: string; texto?: string }
  if (label !== undefined) s.label = label
  if (titulo !== undefined) s.titulo = titulo
  if (texto !== undefined) s.texto = texto
  writeData(data)
  audit('CONFIG_UPDATED', req, `Situação de anúncio atualizada: ${s.label}`)
  res.json(data.anuncioSituacoes)
})

router.delete('/anuncio-situacoes/:id', requireAuth, requireArea('configuracoes', 'editar'), (req: Request, res: Response): void => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
  const data = readData()
  data.anuncioSituacoes = data.anuncioSituacoes.filter(x => x.id !== id)
  writeData(data)
  audit('CONFIG_UPDATED', req, `Situação de anúncio removida: ${id}`)
  res.json(data.anuncioSituacoes)
})

// ── Contas ────────────────────────────────────────────────────────────────────

router.get('/contas', requireAuth, adminOnly, (_req, res) => {
  const data = readData()
  // nome = codinome (regra); nomeServidor continua sendo o apelido do Discord
  res.json(data.contas.map(c => ({ ...contaPublica(c), nome: nomeDaConta(data, c.id) })))
})

router.put('/contas/:id', requireAuth, adminOnly, validateBody(updateContaSchema), async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }

  const data = readData()
  const conta = data.contas.find(c => c.id === id)
  if (!conta) { res.status(404).json({ error: 'Conta não encontrada' }); return }

  const autor = data.contas.find(c => c.id === req.user!.contaId)
  if (!autor) { res.status(403).json({ error: 'Acesso negado' }); return }
  // Só um dev gerencia a conta de um dev — nem o admin passa por cima disso.
  if (!isDev(autor, data) && isDev(conta, data)) {
    audit('PRIVILEGE_ESCALATION_ATTEMPT', req, `Tentativa de editar conta dev #${conta.id}`)
    res.status(403).json({ error: 'Acesso negado' }); return
  }

  // Admin não pode rebaixar a si mesmo
  if (id === req.user!.contaId && req.body.nivel && req.body.nivel !== 'admin') {
    audit('PRIVILEGE_ESCALATION_ATTEMPT', req, `Tentativa de auto-rebaixamento: ${conta.username}`)
    res.status(400).json({ error: 'Não é possível alterar o próprio nível' }); return
  }

  const { nivel, ativo, cargoPermId } = req.body as { nivel?: string; ativo?: boolean; cargoPermId?: number | null }
  const changes: string[] = []
  let aprovadoCom: string | undefined   // nome do cargo, se a conta foi aprovada agora

  if (nivel && ['admin', 'moderador', 'membro', 'view_only'].includes(nivel)) {
    changes.push(`nível: ${conta.nivel}→${nivel}`)
    conta.nivel = nivel as Conta['nivel']
  }
  if (typeof ativo === 'boolean') {
    changes.push(`ativo: ${conta.ativo}→${ativo}`)
    conta.ativo = ativo
    if (ativo && conta.exonerado) {
      // Readmissão: limpa a exoneração e refaz o cadastro no próximo acesso
      delete conta.exonerado
      delete conta.exoneradoEm
      delete conta.exoneradoMotivo
      conta.onboarded = false
      changes.push('readmitido')
      audit('ACCOUNT_READMITTED', req, `Conta ${conta.username} (#${conta.id})`)
    }
  }
  if (cargoPermId !== undefined) {
    if (cargoPermId === null) {
      delete conta.cargoPermId
      changes.push('cargo de permissão removido')
    } else if (data.cargosPermissao.some(c => c.id === cargoPermId)) {
      const destino = data.cargosPermissao.find(c => c.id === cargoPermId)!
      if (!podeAtribuirCargo(autor, destino, data)) {
        audit('PRIVILEGE_ESCALATION_ATTEMPT', req, `Tentativa de atribuir cargo #${cargoPermId} sem permissão`)
        res.status(403).json({ error: 'Acesso negado' }); return
      }
      if (!conta.cargoPermId) {
        aprovadoCom = data.cargosPermissao.find(c => c.id === cargoPermId)!.nome
        const nomeCargo = data.cargosPermissao.find(c => c.id === cargoPermId)!.nome
        notificar(data, conta.id, 'aprovada', 'Cadastro aprovado!',
          conta.onboarded === false
            ? `Seu acesso foi aprovado com o cargo ${nomeCargo}. Preencha seu cadastro para ele ser enviado ao seu canal da unidade.`
            : `Seu cadastro foi aprovado com o cargo ${nomeCargo} e enviado ao seu canal da unidade.`, '/dashboard')
      }
      conta.cargoPermId = cargoPermId
      changes.push(`cargo de permissão: #${cargoPermId}`)
    } else {
      res.status(400).json({ error: 'Cargo de permissão não encontrado' }); return
    }
  }

  writeData(data)
  audit('ACCOUNT_UPDATED', req, `ID: ${id} | ${changes.join(', ')}`)
  // Aprovada agora, com cadastro já preenchido: o Discord recebe os cargos da patente da ficha
  if (aprovadoCom && conta.membroId && conta.onboarded !== false && !conta.exonerado && conta.ativo) void aplicarPerfilNoDiscord(conta.membroId, {})
  res.json(contaPublica(conta))
})

// ── Pedidos de acesso (primeiro login pelo Discord ou pedido de set no Discord) ──

router.get('/solicitacoes-acesso', requireAuth, adminOnly, (_req, res) => {
  const data = readData()
  const { patentes, setores = [] } = setagemAtual(data)
  // Lista branca: sem o ID do Discord (só o usuário/nome que a pessoa mostra no Discord)
  res.json(data.solicitacoesAcesso.map(({ id, username, nome, avatar, criadoEm, setagem }) => {
    const patente = setagem ? patentes.find(p => p.id === setagem.patenteId) : undefined
    return {
      id, username, nome, avatar: avatar ?? null, criadoEm,
      // Pedido de set (Discord): dados do modal para quem aprova conferir
      setagem: setagem ? {
        codinome: setagem.codinome, passaporte: setagem.passaporte, apelido: setagem.apelido,
        patente: patente ? { nome: patente.nome, cargoPermId: patente.cargoPermId ?? null } : null,
        setor: setagem.setorId ? setores.find(x => x.id === setagem.setorId)?.nome ?? null : null,
        status: setagem.status ?? 'pendente', motivoCorrecao: setagem.motivoCorrecao ?? null,
      } : null,
    }
  }))
})

// Aprova: cria a conta ligada ao Discord da pessoa. Cargo opcional (senão o da patente ou o padrão).
// Pedido de set: dá os cargos da patente no Discord, avisa no privado e apaga o canal temporário.
router.post('/solicitacoes-acesso/:id/aprovar', requireAuth, adminOnly, hierarquiaLimiter, validateBody(aprovarAcessoSchema), async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
  const data = readData()
  const sol = data.solicitacoesAcesso.find(s => s.id === id)
  if (!sol) { res.status(404).json({ error: 'Pedido não encontrado' }); return }
  if (!sol.discordId) { res.status(409).json({ error: 'Pedido antigo (login por senha): recuse e peça para a pessoa entrar pelo Discord.' }); return }
  if (data.contas.some(c => c.discordId === sol.discordId)) {
    res.status(409).json({ error: 'Este Discord já tem uma conta.' }); return
  }
  const { cargoPermId } = req.body as { cargoPermId?: number | null }
  const autorId = req.user!.contaId
  // Cargo do site limitado ao que quem aprova pode atribuir
  const podeAtribuir = (cargo: CargoPermissao) => { const d = readData(); const a = d.contas.find(c => c.id === autorId); return Boolean(a && podeAtribuirCargo(a, cargo, d)) }

  if (sol.setagem) {
    const r = await aprovarPedido(id, { por: nomeDaConta(peekData(), req.user!.contaId), cargoPermId, podeAtribuir })
    if ('erro' in r) { res.status(r.status).json({ error: r.erro }); return }
    audit('SIGNUP_APPROVED', req, `Pedido de set #${id} → conta #${r.contaId} | cargos no Discord: ${r.cargoDiscord}`)
    const conta = readData().contas.find(c => c.id === r.contaId)!
    res.status(201).json({ ...contaPublica(conta), cargoDiscord: r.cargoDiscord, cargosManuais: r.cargosManuais }); return
  }

  const cargo = cargoPermId ? data.cargosPermissao.find(c => c.id === cargoPermId) : data.cargosPermissao.find(c => c.padrao && !c.admin)
  if (cargoPermId && !cargo) { res.status(400).json({ error: 'Cargo de permissão não encontrado' }); return }
  if (cargo && !podeAtribuir(cargo)) { res.status(403).json({ error: 'Você não pode atribuir este cargo.' }); return }
  const nova = criarContaDeSolicitacao(data, sol, cargo)
  writeData(data)
  audit('SIGNUP_APPROVED', req, `Usuário: ${nova.username} | Cargo: #${nova.cargoPermId ?? '—'}`)
  void registrarNoForum(nova.id, { titulo: 'ACESSO APROVADO · Novo membro', emoji: '✅', cor: COR_REGISTRO.aprovado, texto: 'Pedido de acesso aprovado.', por: nomeDaConta(peekData(), req.user!.contaId) })
  res.status(201).json(contaPublica(nova))
})

// POST /api/config/solicitacoes-acesso/:id/corrigir — pede para a pessoa refazer o pedido de set (motivo vai no privado)
router.post('/solicitacoes-acesso/:id/corrigir', requireAuth, adminOnly, hierarquiaLimiter, validateBody(corrigirAcessoSchema), async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
  if (!readData().solicitacoesAcesso.some(s => s.id === id && s.setagem)) { res.status(404).json({ error: 'Pedido de set não encontrado' }); return }
  const motivo = (req.body as { motivo: string }).motivo.replace(/[@`]/g, '').trim()
  const r = await solicitarCorrecao(id, nomeDaConta(peekData(), req.user!.contaId), motivo)
  if ('erro' in r) { res.status(r.status).json({ error: r.erro }); return }
  audit('CONFIG_UPDATED', req, `Pedido de set #${id}: correção pedida pelo site`)
  res.json({ ok: true, privado: r.privado })
})

router.delete('/solicitacoes-acesso/:id', requireAuth, adminOnly, validateBody(reprovarAcessoSchema), async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
  const data = readData()
  const sol = data.solicitacoesAcesso.find(s => s.id === id)
  if (!sol) { res.status(404).json({ error: 'Pedido não encontrado' }); return }
  if (sol.setagem) {
    // Pedido de set: aviso no privado e canal temporário apagado
    // Motivo vai no privado da pessoa: texto puro (sem menções/blocos de código)
    const motivo = ((req.body as { motivo?: string }).motivo ?? '').replace(/[@`]/g, '').trim()
    const r = await reprovarPedido(id, nomeDaConta(peekData(), req.user!.contaId), motivo)
    if ('erro' in r) { res.status(r.status).json({ error: r.erro }); return }
  } else {
    data.solicitacoesAcesso = data.solicitacoesAcesso.filter(s => s.id !== id)
    writeData(data)
  }
  audit('SIGNUP_REJECTED', req, `Pedido #${id}`)
  res.json({ ok: true })
})

router.delete('/contas/:id', requireAuth, adminOnly, (req: Request, res: Response): void => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }

  if (req.user!.contaId === id) {
    res.status(400).json({ error: 'Não é possível excluir sua própria conta' }); return
  }

  const data = readData()
  const idx = data.contas.findIndex(c => c.id === id)
  if (idx === -1) { res.status(404).json({ error: 'Conta não encontrada' }); return }

  const autor = data.contas.find(c => c.id === req.user!.contaId)
  if (!autor || (!isDev(autor, data) && isDev(data.contas[idx], data))) {
    audit('PRIVILEGE_ESCALATION_ATTEMPT', req, `Tentativa de excluir conta dev #${id}`)
    res.status(403).json({ error: 'Acesso negado' }); return
  }

  const username = data.contas[idx].username
  data.contas.splice(idx, 1)
  writeData(data)

  audit('ACCOUNT_DELETED', req, `Usuário: ${username}`)
  res.json({ ok: true })
})

// ── Cargos de permissão ─────────────────────────────────────────────────────────

router.get('/cargos-permissao', requireAuth, adminOnly, (_req, res) => {
  res.json(readData().cargosPermissao)
})

// PUT /cargos-permissao/reorder — define a hierarquia (primeiro = cargo mais alto)
router.put('/cargos-permissao/reorder', requireAuth, adminOnly, validateBody(reorderCargosSchema), (req: Request, res: Response): void => {
  const { ids } = req.body as { ids: number[] }
  const data = readData()
  const atuais = new Set(data.cargosPermissao.map(c => c.id))
  if (ids.length !== atuais.size || new Set(ids).size !== ids.length || !ids.every(id => atuais.has(id))) {
    res.status(400).json({ error: 'Lista de cargos inválida para reordenação' }); return
  }
  const porId = new Map(data.cargosPermissao.map(c => [c.id, c]))
  data.cargosPermissao = ids.map(id => porId.get(id)!)
  writeData(data)
  audit('CONFIG_UPDATED', req, `Hierarquia de cargos: ${data.cargosPermissao.map(c => c.nome).join(' > ')}`)
  res.json(data.cargosPermissao)
})

router.post('/cargos-permissao', requireAuth, adminOnly, validateBody(cargoPermCreateSchema), (req: Request, res: Response): void => {
  const { nome, admin, dev, permissoes } = req.body as { nome: string; admin?: boolean; dev?: boolean; permissoes: Record<string, { ver: boolean; editar: boolean }> }
  const data = readData()
  if (!souDev(req, data) && dev === true) {
    audit('PRIVILEGE_ESCALATION_ATTEMPT', req, `Tentativa de criar cargo dev: ${nome}`)
    res.status(403).json({ error: 'Acesso negado' }); return
  }
  if (data.cargosPermissao.some(c => c.nome.toLowerCase() === nome.toLowerCase())) {
    res.status(409).json({ error: 'Já existe um cargo com esse nome.' }); return
  }
  const novo: CargoPermissao = {
    id: data.nextCargoPermId,
    nome,
    padrao: false,
    admin: admin === true,
    dev: dev === true,
    permissoes: normalizePermMap(permissoes),
  }
  data.cargosPermissao.push(novo)
  data.nextCargoPermId++
  writeData(data)
  audit('CONFIG_UPDATED', req, `Cargo de permissão criado: ${nome}`)
  res.status(201).json(novo)
})

router.put('/cargos-permissao/:id', requireAuth, adminOnly, validateBody(cargoPermUpdateSchema), (req: Request, res: Response): void => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
  const data = readData()
  const cargo = data.cargosPermissao.find(c => c.id === id)
  if (!cargo) { res.status(404).json({ error: 'Cargo não encontrado' }); return }
  const { nome, padrao, admin, dev, permissoes } = req.body as { nome?: string; padrao?: boolean; admin?: boolean; dev?: boolean; permissoes?: Record<string, { ver: boolean; editar: boolean }> }

  // Cargo de dev: só um dev mexe nele ou concede/retira a marca de dev.
  if (!souDev(req, data) && (cargo.dev === true || dev !== undefined)) {
    audit('PRIVILEGE_ESCALATION_ATTEMPT', req, `Tentativa de alterar cargo dev #${id}`)
    res.status(403).json({ error: 'Acesso negado' }); return
  }

  if (nome !== undefined) {
    if (data.cargosPermissao.some(c => c.id !== id && c.nome.toLowerCase() === nome.toLowerCase())) {
      res.status(409).json({ error: 'Já existe um cargo com esse nome.' }); return
    }
    cargo.nome = nome
  }
  if (admin !== undefined) cargo.admin = admin
  if (dev !== undefined) cargo.dev = dev
  if (permissoes !== undefined) cargo.permissoes = normalizePermMap({ ...cargo.permissoes, ...permissoes })
  if (padrao !== undefined) {
    if (padrao) data.cargosPermissao.forEach(c => { c.padrao = c.id === id })
    else cargo.padrao = false
  }
  writeData(data)
  audit('CONFIG_UPDATED', req, `Cargo de permissão atualizado: ${cargo.nome}`)
  res.json(cargo)
})

router.delete('/cargos-permissao/:id', requireAuth, adminOnly, (req: Request, res: Response): void => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
  const data = readData()
  if (!souDev(req, data) && data.cargosPermissao.some(c => c.id === id && c.dev === true)) {
    audit('PRIVILEGE_ESCALATION_ATTEMPT', req, `Tentativa de remover cargo dev #${id}`)
    res.status(403).json({ error: 'Acesso negado' }); return
  }
  const before = data.cargosPermissao.length
  data.cargosPermissao = data.cargosPermissao.filter(c => c.id !== id)
  if (data.cargosPermissao.length === before) { res.status(404).json({ error: 'Cargo não encontrado' }); return }
  // Desvincula das contas que usavam este cargo
  data.contas.forEach(c => { if (c.cargoPermId === id) delete c.cargoPermId })
  writeData(data)
  audit('CONFIG_UPDATED', req, `Cargo de permissão removido: #${id}`)
  res.json({ ok: true })
})

// ── Logo ──────────────────────────────────────────────────────────────────────

router.get('/logo', (_req, res) => res.json({ logo: readData().logo }))

router.put('/logo', requireAuth, requireArea('configuracoes', 'editar'), validateBody(logoSchema), (req: Request, res: Response): void => {
  const { logo } = req.body as { logo: string }
  // Confere os bytes de verdade (assinatura PNG/JPEG/WEBP, até 2 MB)
  if (!imagemEnviada(logo, 2 * 1024 * 1024)) { res.status(400).json({ error: 'Imagem inválida' }); return }
  const data = readData()
  data.logo = logo
  writeData(data)
  audit('LOGO_UPDATED', req)
  res.json({ ok: true })
})

router.delete('/logo', requireAuth, requireArea('configuracoes', 'editar'), (_req, res) => {
  const data = readData()
  data.logo = ''
  writeData(data)
  audit('LOGO_DELETED', _req as Request)
  res.json({ ok: true })
})

// ── Recrutamento ──────────────────────────────────────────────────────────────

router.get('/recrutamento', requireAuth, requireAlgumaArea(['recrutamento', 'configuracoes'], 'ver'), (_req, res) => res.json(readData().recCfg))

router.put('/recrutamento', requireAuth, requireArea('configuracoes', 'editar'), validateBody(recCfgSchema), (req: Request, res: Response): void => {
  const data = readData()
  const { notaMinima, categorias } = req.body
  if (typeof notaMinima === 'number') data.recCfg.notaMinima = notaMinima
  if (Array.isArray(categorias)) data.recCfg.categorias = categorias
  writeData(data)
  audit('CONFIG_UPDATED', req, 'Configuração de recrutamento atualizada')
  res.json(data.recCfg)
})

// ── Backup / Restore ──────────────────────────────────────────────────────────

// Só dev: o arquivo leva todas as contas (inclusive dos devs e da conta dona)
router.get('/backup', requireAuth, requireDev, (req: Request, res: Response): void => {
  const data = readData()
  audit('BACKUP_DOWNLOADED', req)
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Content-Disposition', `attachment; filename="du-backup-${new Date().toISOString().slice(0, 10)}.json"`)
  res.send(JSON.stringify(data, null, 2))
})

// Só dev: restaurar substitui contas e cargos (um admin poderia se promover a dev pelo arquivo)
router.post('/restore', requireAuth, requireDev, criticalLimiter, validateBody(restoreSchema), (req: Request, res: Response): void => {
  const body = req.body as Partial<DuData> & { contas: Conta[] }

  // Login é só pelo Discord: campos legados de senha de backups antigos não entram.
  const atual = readData()
  const donoAtual = atual.contas.find(x => x.id === PROTECTED_OWNER_ID)
  for (const c of body.contas) { delete c.password; delete c.senhaPadrao }
  // A conta dona só é alterada pelo próprio dono:
  // para qualquer outro dev ela fica exatamente como está hoje.
  if (req.user!.contaId !== PROTECTED_OWNER_ID && donoAtual) {
    body.contas = [donoAtual, ...body.contas.filter(c => c.id !== PROTECTED_OWNER_ID)]
  }
  if (!Array.isArray(body.solicitacoesAcesso)) { body.solicitacoesAcesso = []; body.nextSolAcessoId = 1 }

  converterPatentesParaDpd(body as DuData)   // backup antigo já entra no formato DPD
  writeData(body as DuData)
  alertar('restauracao', 'Backup restaurado no painel', `${nomeDaConta(peekData(), req.user!.contaId)} restaurou um backup: todos os dados foram substituídos.`)
  audit('RESTORE_EXECUTED', req, `Membros: ${body.membros?.length} | Ações: ${body.acoes?.length}`)
  res.json({ ok: true })
})

// ── Audit Log (admin only) ────────────────────────────────────────────────────

router.get('/audit-log', requireAuth, adminOnly, (req: Request, res: Response): void => {
  const pedido = parseInt(String(req.query.limit ?? '100'), 10)
  const limit = Math.min(500, Math.max(10, Number.isSafeInteger(pedido) ? pedido : 100))
  res.json(readAuditLog(limit))
})

export default router
