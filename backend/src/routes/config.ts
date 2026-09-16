import { Router, Request, Response } from 'express'
import bcrypt from 'bcrypt'
import { requireAuth } from '../middleware/auth'
import { requireArea, adminOnly } from '../middleware/roles'
import { criticalLimiter } from '../middleware/rateLimiter'
import {
  validateBody,
  qruSchema, patenteSchema, cargoSchema,
  createContaSchema, updateContaSchema,
  logoSchema, recCfgSchema,
  reorderPatenteSchema, reorderQruSchema,
  situacaoAnuncioSchema, situacaoAnuncioUpdateSchema,
  aprovarSolicitacaoSchema,
  cargoPermCreateSchema, cargoPermUpdateSchema,
} from '../middleware/validate'
import { audit, readAuditLog } from '../security/audit'
import { readData, writeData } from '../data'
import { Conta, FastData, CargoPermissao } from '../types'
import { normalizePermMap } from '../permAreas'

const router = Router()

// ── QRUs ──────────────────────────────────────────────────────────────────────

router.get('/qrus', requireAuth, (_req, res) => res.json(readData().qrus))

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

router.get('/patentes', requireAuth, (_req, res) => res.json(readData().patentes))

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

router.get('/cargos', requireAuth, (_req, res) => res.json(readData().cargos))

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

router.get('/anuncio-situacoes', requireAuth, (_req, res) => res.json(readData().anuncioSituacoes))

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

// ── Solicitações de cadastro ────────────────────────────────────────────────────

router.get('/solicitacoes', requireAuth, adminOnly, (_req, res) => {
  const data = readData()
  res.json(data.solicitacoes.map(({ senha: _s, ...rest }) => rest))
})

router.post('/solicitacoes/:id/aprovar', requireAuth, adminOnly, validateBody(aprovarSolicitacaoSchema), (req: Request, res: Response): void => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
  const data = readData()
  const idx = data.solicitacoes.findIndex(s => s.id === id)
  if (idx === -1) { res.status(404).json({ error: 'Solicitação não encontrada' }); return }
  const sol = data.solicitacoes[idx]
  if (data.contas.some(c => c.username.toLowerCase() === sol.username.toLowerCase())) {
    res.status(409).json({ error: 'Já existe uma conta com esse usuário.' }); return
  }
  const { cargoPermId } = req.body as { cargoPermId?: number | null }
  const cargoPadrao = data.cargosPermissao.find(c => c.padrao)
  const cargoId = cargoPermId ?? cargoPadrao?.id
  const nova: Conta = { id: data.nextContaId, username: sol.username, password: sol.senha, nivel: 'membro', ativo: true, onboarded: false }
  if (cargoId && data.cargosPermissao.some(c => c.id === cargoId)) nova.cargoPermId = cargoId
  data.contas.push(nova)
  data.nextContaId++
  data.solicitacoes.splice(idx, 1)
  writeData(data)
  audit('SIGNUP_APPROVED', req, `Usuário: ${nova.username} | Cargo: ${nova.cargoPermId ?? 'nenhum'}`)
  const { password: _p, ...semSenha } = nova
  res.status(201).json(semSenha)
})

router.delete('/solicitacoes/:id', requireAuth, adminOnly, (req: Request, res: Response): void => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
  const data = readData()
  const before = data.solicitacoes.length
  data.solicitacoes = data.solicitacoes.filter(s => s.id !== id)
  if (data.solicitacoes.length === before) { res.status(404).json({ error: 'Solicitação não encontrada' }); return }
  writeData(data)
  audit('SIGNUP_REJECTED', req, `ID: ${id}`)
  res.json({ ok: true })
})

// ── Contas ────────────────────────────────────────────────────────────────────

router.get('/contas', requireAuth, adminOnly, (_req, res) => {
  const data = readData()
  res.json(data.contas.map(({ password: _p, ...rest }) => rest))
})

router.post('/contas', requireAuth, adminOnly, validateBody(createContaSchema), async (req: Request, res: Response): Promise<void> => {
  const { username, password, cargoPermId } = req.body as { username: string; password: string; cargoPermId?: number | null }
  const data = readData()

  if (data.contas.some(c => c.username.toLowerCase() === username.toLowerCase())) {
    res.status(409).json({ error: 'Nome de usuário já existe' }); return
  }

  const novaConta: Conta = {
    id: data.nextContaId,
    username: username.trim(),
    password: await bcrypt.hash(password, 12),
    nivel: 'membro',
    ativo: true,
    onboarded: true,
  }
  if (cargoPermId && data.cargosPermissao.some(c => c.id === cargoPermId)) {
    novaConta.cargoPermId = cargoPermId
  }

  data.contas.push(novaConta)
  data.nextContaId++
  writeData(data)

  audit('ACCOUNT_CREATED', req, `Usuário: ${novaConta.username} | Nível: ${novaConta.nivel}`)
  const { password: _p, ...semSenha } = novaConta
  res.status(201).json(semSenha)
})

router.put('/contas/:id', requireAuth, adminOnly, validateBody(updateContaSchema), async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }

  const data = readData()
  const conta = data.contas.find(c => c.id === id)
  if (!conta) { res.status(404).json({ error: 'Conta não encontrada' }); return }

  // Admin não pode rebaixar a si mesmo
  if (id === req.user!.contaId && req.body.nivel && req.body.nivel !== 'admin') {
    audit('PRIVILEGE_ESCALATION_ATTEMPT', req, `Tentativa de auto-rebaixamento: ${conta.username}`)
    res.status(400).json({ error: 'Não é possível alterar o próprio nível' }); return
  }

  const { nivel, ativo, password, cargoPermId } = req.body as { nivel?: string; ativo?: boolean; password?: string; cargoPermId?: number | null }
  const changes: string[] = []

  if (nivel && ['admin', 'moderador', 'membro', 'view_only'].includes(nivel)) {
    changes.push(`nível: ${conta.nivel}→${nivel}`)
    conta.nivel = nivel as Conta['nivel']
  }
  if (typeof ativo === 'boolean') {
    changes.push(`ativo: ${conta.ativo}→${ativo}`)
    conta.ativo = ativo
  }
  if (password) {
    conta.password = await bcrypt.hash(password, 12)
    changes.push('senha alterada')
  }
  if (cargoPermId !== undefined) {
    if (cargoPermId === null) {
      delete conta.cargoPermId
      changes.push('cargo de permissão removido')
    } else if (data.cargosPermissao.some(c => c.id === cargoPermId)) {
      conta.cargoPermId = cargoPermId
      changes.push(`cargo de permissão: #${cargoPermId}`)
    } else {
      res.status(400).json({ error: 'Cargo de permissão não encontrado' }); return
    }
  }

  writeData(data)
  audit('ACCOUNT_UPDATED', req, `ID: ${id} | ${changes.join(', ')}`)
  const { password: _p, ...semSenha } = conta
  res.json(semSenha)
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

router.post('/cargos-permissao', requireAuth, adminOnly, validateBody(cargoPermCreateSchema), (req: Request, res: Response): void => {
  const { nome, admin, permissoes } = req.body as { nome: string; admin?: boolean; permissoes: Record<string, { ver: boolean; editar: boolean }> }
  const data = readData()
  if (data.cargosPermissao.some(c => c.nome.toLowerCase() === nome.toLowerCase())) {
    res.status(409).json({ error: 'Já existe um cargo com esse nome.' }); return
  }
  const novo: CargoPermissao = {
    id: data.nextCargoPermId,
    nome,
    padrao: false,
    admin: admin === true,
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
  const { nome, padrao, admin, permissoes } = req.body as { nome?: string; padrao?: boolean; admin?: boolean; permissoes?: Record<string, { ver: boolean; editar: boolean }> }

  if (nome !== undefined) {
    if (data.cargosPermissao.some(c => c.id !== id && c.nome.toLowerCase() === nome.toLowerCase())) {
      res.status(409).json({ error: 'Já existe um cargo com esse nome.' }); return
    }
    cargo.nome = nome
  }
  if (admin !== undefined) cargo.admin = admin
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

router.get('/recrutamento', requireAuth, (_req, res) => res.json(readData().recCfg))

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
  // Mascarar senhas no backup (não exportar hashes)
  const sanitized = {
    ...data,
    contas: data.contas.map(({ password: _p, ...rest }) => ({ ...rest, password: '[REDACTED]' })),
  }
  audit('BACKUP_DOWNLOADED', req)
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Content-Disposition', `attachment; filename="fast-backup-${new Date().toISOString().slice(0, 10)}.json"`)
  res.send(JSON.stringify(sanitized, null, 2))
})

router.post('/restore', requireAuth, adminOnly, criticalLimiter, (req: Request, res: Response): void => {
  const body = req.body as Partial<FastData>

  const required: (keyof FastData)[] = ['membros', 'acoes', 'contas']
  if (!required.every(k => Array.isArray(body[k]))) {
    res.status(400).json({ error: 'Backup inválido — campos obrigatórios ausentes' }); return
  }

  // Validar que contas no restore têm senhas (não aceitar o backup sanitizado como restore)
  const contasSemSenha = (body.contas as Conta[]).filter(c => !c.password || c.password === '[REDACTED]')
  if (contasSemSenha.length > 0) {
    res.status(400).json({ error: 'Backup não pode ser restaurado: senhas ausentes. Use um backup completo gerado pelo sistema.' })
    return
  }

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
