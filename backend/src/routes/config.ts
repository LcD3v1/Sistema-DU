import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { requireArea, adminOnly, requireAprovado, requireAlgumaArea } from '../middleware/roles'
import { criticalLimiter } from '../middleware/rateLimiter'
import {
  validateBody,
  qruSchema, patenteSchema, cargoSchema,
  updateContaSchema,
  logoSchema, recCfgSchema,
  reorderPatenteSchema, reorderQruSchema,
  situacaoAnuncioSchema, situacaoAnuncioUpdateSchema,
  cargoPermCreateSchema, cargoPermUpdateSchema,
  canaisSchema, reorderCargosSchema,
} from '../middleware/validate'
import { audit, readAuditLog } from '../security/audit'
import { readData, writeData } from '../data'
import { Conta, FastData, CargoPermissao } from '../types'
import { normalizePermMap } from '../permAreas'
import { isDev, podeAtribuirCargo } from '../access'
import { GUILD_ANNOUNCEMENT, GUILD_TEXT, botConfigurado, listarForuns, tentarPostarRegistro } from '../discord/forum'
import { notificar } from '../notificacoes'

const router = Router()

/** O autor da requisição é dev? (poder total, acima do admin) */
function souDev(req: Request, data: FastData): boolean {
  const autor = data.contas.find(c => c.id === req.user?.contaId)
  return Boolean(autor && isDev(autor, data))
}

// ── QRUs ──────────────────────────────────────────────────────────────────────

router.get('/qrus', requireAuth, requireAprovado, (_req, res) => res.json(readData().qrus))

router.post('/qrus', requireAuth, requireArea('configuracoes', 'editar'), validateBody(qruSchema), (req: Request, res: Response): void => {
  const { nome } = req.body as { nome: string }
  const data = readData()
  if (data.qrus.includes(nome)) { res.status(409).json({ error: 'QRU já existe' }); return }
  data.qrus.push(nome)
  writeData(data)
  audit('CONFIG_UPDATED', req, `QRU criado: ${nome}`)
  res.status(201).json(data.qrus)
})

router.put('/qrus/reorder', requireAuth, requireArea('configuracoes', 'editar'), validateBody(reorderQruSchema), (req: Request, res: Response): void => {
  const { qrus } = req.body as { qrus: string[] }
  const data = readData()
  const current = new Set(data.qrus)
  const next = qrus.map(q => String(q).slice(0, 50))
  const uniqueNext = new Set(next)

  if (next.length !== data.qrus.length || uniqueNext.size !== next.length || !next.every(q => current.has(q))) {
    res.status(400).json({ error: 'Lista de QRUs inválida para reordenação' })
    return
  }

  data.qrus = next
  writeData(data)
  audit('CONFIG_UPDATED', req, 'QRUs reordenados')
  res.json(data.qrus)
})

router.delete('/qrus/:nome', requireAuth, requireArea('configuracoes', 'editar'), (req: Request, res: Response): void => {
  const nome = String(req.params.nome).slice(0, 50)
  const data = readData()
  data.qrus = data.qrus.filter(q => q !== nome)
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
  res.json(data.contas)
})

router.put('/contas/:id', requireAuth, adminOnly, validateBody(updateContaSchema), (req: Request, res: Response): void => {
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
  if (conta.cargoPermId) tentarPostarRegistro(conta.id)
  res.json(conta)
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

// ── Canais do Discord ───────────────────────────────────────────────────────────

router.get('/canais', requireAuth, adminOnly, async (_req: Request, res: Response): Promise<void> => {
  const data = readData()
  if (!botConfigurado()) {
    res.json({ botConfigurado: false, canais: data.canais, foruns: [] }); return
  }
  try {
    res.json({ botConfigurado: true, canais: data.canais, foruns: await listarForuns() })
  } catch (err) {
    console.error('[FAST][DISCORD] listar canais:', err instanceof Error ? err.message : err)
    res.json({ botConfigurado: true, erro: 'Não foi possível listar os canais do servidor. Verifique o token do bot e o ID do servidor.', canais: data.canais, foruns: [] })
  }
})

router.put('/canais', requireAuth, adminOnly, validateBody(canaisSchema), async (req: Request, res: Response): Promise<void> => {
  if (!botConfigurado()) { res.status(400).json({ error: 'Bot do Discord não configurado no servidor.' }); return }
  const body = req.body as { registro?: string | null; apreensoes?: string | null }

  let foruns
  try { foruns = await listarForuns() } catch {
    res.status(502).json({ error: 'Não foi possível consultar o Discord.' }); return
  }
  const porId = new Map(foruns.map(f => [f.id, f]))
  for (const [chave, id] of Object.entries(body)) {
    const canal = id ? porId.get(id) : undefined
    if (id && !canal) {
      res.status(400).json({ error: `O canal selecionado em "${chave}" não é um canal de postagem acessível deste servidor.` }); return
    }
    if (chave === 'apreensoes' && canal && ![GUILD_TEXT, GUILD_ANNOUNCEMENT].includes(canal.type)) {
      res.status(400).json({ error: 'O canal de Apreensões precisa ser um canal de texto ou anúncio, não fórum.' }); return
    }
  }

  const data = readData()
  for (const chave of ['registro', 'apreensoes'] as const) {
    if (body[chave] === null) delete data.canais[chave]
    else if (body[chave]) data.canais[chave] = body[chave]
  }
  writeData(data)
  audit('CANAIS_UPDATED', req, `registro: ${data.canais.registro ?? '—'} | apreensões: ${data.canais.apreensoes ?? '—'}`)
  res.json({ canais: data.canais })
})

// ── Logo ──────────────────────────────────────────────────────────────────────

router.get('/logo', (_req, res) => res.json({ logo: readData().logo }))

router.put('/logo', requireAuth, requireArea('configuracoes', 'editar'), validateBody(logoSchema), (req: Request, res: Response): void => {
  const { logo } = req.body as { logo: string }
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

router.get('/backup', requireAuth, adminOnly, (req: Request, res: Response): void => {
  const data = readData()
  audit('BACKUP_DOWNLOADED', req)
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Content-Disposition', `attachment; filename="fast-backup-${new Date().toISOString().slice(0, 10)}.json"`)
  res.send(JSON.stringify(data, null, 2))
})

router.post('/restore', requireAuth, adminOnly, criticalLimiter, (req: Request, res: Response): void => {
  const body = req.body as Partial<FastData>

  const required: (keyof FastData)[] = ['membros', 'acoes', 'contas']
  if (!required.every(k => Array.isArray(body[k]))) {
    res.status(400).json({ error: 'Backup inválido — campos obrigatórios ausentes' }); return
  }

  // Descarta hashes de senha de backups antigos (login agora é só via Discord)
  for (const c of body.contas as (Conta & { password?: string })[]) delete c.password

  writeData(body as FastData)
  audit('RESTORE_EXECUTED', req, `Membros: ${body.membros?.length} | Ações: ${body.acoes?.length}`)
  res.json({ ok: true })
})

// ── Audit Log (admin only) ────────────────────────────────────────────────────

router.get('/audit-log', requireAuth, adminOnly, (req: Request, res: Response): void => {
  const limit = Math.min(500, Math.max(10, parseInt(String(req.query.limit || '100'), 10)))
  res.json(readAuditLog(limit))
})

export default router
