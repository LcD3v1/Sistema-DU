import { Router, Request, Response } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { requireAuth } from '../middleware/auth'
import { loginLimiter, criticalLimiter } from '../middleware/rateLimiter'
import { validateBody, loginSchema, changePasswordSchema, solicitacaoSchema, onboardingSchema, membroSelfSchema } from '../middleware/validate'
import { Membro, Conta, FastData } from '../types'
import { checkLockout, recordFailed, clearAttempts } from '../security/bruteForce'
import { revokeToken } from '../security/tokenBlacklist'
import { audit } from '../security/audit'
import { readData, writeData } from '../data'
import { isAdmin, resolvePerms } from '../access'

const router = Router()

// POST /api/auth/login
router.post(
  '/login',
  loginLimiter,
  validateBody(loginSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { username, password } = req.body as { username: string; password: string }

    // Verificar bloqueio por força bruta
    const lockout = checkLockout(username)
    if (lockout.locked) {
      const mins = Math.ceil((lockout.remainingMs ?? 0) / 60000)
      audit('LOGIN_LOCKED', req, `Conta bloqueada: ${username}`)
      res.status(429).json({
        error: `Conta bloqueada por excesso de tentativas. Tente novamente em ${mins} minuto(s).`,
      })
      return
    }

    const data = readData()
    const conta = data.contas.find(c => c.username.toLowerCase() === username.toLowerCase())

    // Timing-safe: sempre faz bcrypt para não revelar se usuário existe
    const hash = conta?.password ?? '$2b$12$invalidsalthashusedtopreventtimingattackXXXXXXXXXXXXXX'
    const senhaCorreta = await bcrypt.compare(password, hash)

    if (!conta || !conta.ativo || !senhaCorreta) {
      const remaining = recordFailed(username)
      audit('LOGIN_FAILED', req, `Usuário: ${username} | Restantes: ${remaining}`)
      // Mensagem genérica — não revelar se conta existe ou está desativada
      res.status(401).json({ error: 'Credenciais inválidas' })
      return
    }

    clearAttempts(username)

    const jti = crypto.randomUUID()
    const token = jwt.sign(
      { contaId: conta.id, username: conta.username, nivel: conta.nivel, jti },
      process.env.JWT_SECRET!,
      { expiresIn: '8h' },
    )

    audit('LOGIN_SUCCESS', req, `Usuário: ${conta.username} | Nível: ${conta.nivel}`)

    res.json({
      token,
      user: { contaId: conta.id, username: conta.username, nivel: conta.nivel },
    })
  },
)

// ── Discord OAuth ────────────────────────────────────────────────
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'
const DISCORD_AUTHORIZE = 'https://discord.com/api/oauth2/authorize'
const DISCORD_TOKEN = 'https://discord.com/api/oauth2/token'
const DISCORD_ME = 'https://discord.com/api/users/@me'
const oauthStates = new Set<string>()

function discordConfigured(): boolean {
  return !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET && process.env.DISCORD_REDIRECT_URI)
}

function issueToken(conta: { id: number; username: string; nivel: string }): string {
  const jti = crypto.randomUUID()
  return jwt.sign(
    { contaId: conta.id, username: conta.username, nivel: conta.nivel, jti },
    process.env.JWT_SECRET!,
    { expiresIn: '8h' },
  )
}

// GET /api/auth/discord — inicia o fluxo
router.get('/discord', (_req: Request, res: Response): void => {
  if (!discordConfigured()) {
    res.redirect(`${FRONTEND_URL}/login?reason=discord_off`)
    return
  }
  const state = crypto.randomUUID()
  oauthStates.add(state)
  setTimeout(() => oauthStates.delete(state), 10 * 60 * 1000)

  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID!,
    redirect_uri: process.env.DISCORD_REDIRECT_URI!,
    response_type: 'code',
    scope: 'identify',
    state,
    prompt: 'consent',
  })
  res.redirect(`${DISCORD_AUTHORIZE}?${params.toString()}`)
})

// GET /api/auth/discord/callback — Discord retorna aqui
router.get('/discord/callback', async (req: Request, res: Response): Promise<void> => {
  if (!discordConfigured()) { res.redirect(`${FRONTEND_URL}/login?reason=discord_off`); return }

  const { code, state } = req.query as { code?: string; state?: string }
  if (!code || !state || !oauthStates.has(state)) {
    res.redirect(`${FRONTEND_URL}/login?reason=discord_erro`)
    return
  }
  oauthStates.delete(state)

  try {
    const tokenRes = await fetch(DISCORD_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI!,
      }),
    })
    if (!tokenRes.ok) throw new Error('token exchange failed')
    const tokenJson = await tokenRes.json() as { access_token: string }

    const meRes = await fetch(DISCORD_ME, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    })
    if (!meRes.ok) throw new Error('user fetch failed')
    const me = await meRes.json() as { id: string; username: string; global_name?: string }

    const data = readData()
    let conta = data.contas.find(c => c.discordId === me.id)

    // Conta vinculada porém desativada → nega
    if (conta && !conta.ativo) {
      audit('DISCORD_LOGIN_DENIED', req, `Conta inativa — Discord: ${me.username} (${me.id})`)
      res.redirect(`${FRONTEND_URL}/login?reason=discord_nao_vinculado`)
      return
    }

    // Sem vínculo → auto-cadastra (a menos que DISCORD_AUTO_CREATE=false)
    if (!conta) {
      const autoCreate = (process.env.DISCORD_AUTO_CREATE ?? 'true') !== 'false'
      if (!autoCreate) {
        audit('DISCORD_LOGIN_DENIED', req, `Sem vínculo — Discord: ${me.username} (${me.id})`)
        res.redirect(`${FRONTEND_URL}/login?reason=discord_nao_vinculado`)
        return
      }
      const displayName = me.global_name || me.username
      const base = displayName.toLowerCase().replace(/[^a-z0-9._-]/g, '') || `discord_${me.id.slice(-6)}`
      let username = base
      let n = 1
      while (data.contas.some(c => c.username.toLowerCase() === username.toLowerCase())) username = `${base}${n++}`
      const nivel = (process.env.DISCORD_DEFAULT_NIVEL || 'membro') as 'admin' | 'moderador' | 'membro' | 'view_only'
      conta = {
        id: data.nextContaId,
        username,
        password: await bcrypt.hash(crypto.randomUUID(), 12),
        nivel,
        ativo: true,
        discordId: me.id,
        discordUsername: displayName,
      }
      data.contas.push(conta)
      data.nextContaId++
      audit('DISCORD_ACCOUNT_CREATED', req, `Nova conta via Discord: ${username} | nível: ${nivel}`)
    } else {
      conta.discordUsername = me.global_name || me.username
    }

    writeData(data)

    const token = issueToken(conta)
    audit('DISCORD_LOGIN_SUCCESS', req, `Usuário: ${conta.username} | Discord: ${me.username}`)
    res.redirect(`${FRONTEND_URL}/auth/discord?token=${encodeURIComponent(token)}&contaId=${conta.id}&username=${encodeURIComponent(conta.username)}&nivel=${conta.nivel}`)
  } catch {
    audit('DISCORD_LOGIN_ERROR', req)
    res.redirect(`${FRONTEND_URL}/login?reason=discord_erro`)
  }
})

// POST /api/auth/logout
router.post('/logout', requireAuth, (req: Request, res: Response): void => {
  const user = req.user!
  if (user.jti && user.exp) {
    revokeToken(user.jti, user.exp * 1000)
  }
  audit('LOGOUT', req)
  res.json({ ok: true })
})

// GET /api/auth/me
router.get('/me', requireAuth, (req: Request, res: Response): void => {
  const data = readData()
  const conta = data.contas.find(c => c.id === req.user!.contaId)

  if (!conta || !conta.ativo) {
    res.status(401).json({ error: 'CONTA_DESATIVADA' })
    return
  }

  res.json({
    contaId: conta.id,
    username: conta.username,
    nivel: conta.nivel,
    membroId: conta.membroId ?? null,
    discordUsername: conta.discordUsername ?? null,
    avatar: conta.avatar ?? null,
    banner: conta.banner ?? null,
    onboarded: conta.onboarded !== false,
    cargoPermId: conta.cargoPermId ?? null,
    admin: isAdmin(conta, data),
    permissoes: resolvePerms(conta, data),
  })
})

// POST /api/auth/solicitar — pessoa pede cadastro (público)
router.post('/solicitar', loginLimiter, validateBody(solicitacaoSchema), async (req: Request, res: Response): Promise<void> => {
  const { username, password, nome } = req.body as { username: string; password: string; nome: string }
  const data = readData()
  const u = username.toLowerCase()
  if (data.contas.some(c => c.username.toLowerCase() === u)) { res.status(409).json({ error: 'Usuário já existe.' }); return }
  if (data.solicitacoes.some(s => s.username.toLowerCase() === u)) { res.status(409).json({ error: 'Já existe uma solicitação com esse usuário.' }); return }
  data.solicitacoes.push({
    id: data.nextSolId,
    username: username.trim(),
    senha: await bcrypt.hash(password, 12),
    nome: nome.trim(),
    criadoEm: new Date().toISOString(),
  })
  data.nextSolId++
  writeData(data)
  audit('SIGNUP_REQUESTED', req, `Usuário: ${username} | Nome: ${nome}`)
  res.status(201).json({ ok: true })
})

// POST /api/auth/onboarding — primeiro acesso cria o perfil de membro e vincula
router.post('/onboarding', requireAuth, validateBody(onboardingSchema), (req: Request, res: Response): void => {
  const data = readData()
  const conta = data.contas.find(c => c.id === req.user!.contaId)
  if (!conta) { res.status(404).json({ error: 'Conta não encontrada' }); return }
  const body = req.body as { policial: string; badge: string; passaporte: string; patenteNPD: string; patenteInterna: string }

  let membro = conta.membroId ? data.membros.find(m => m.id === conta.membroId) : undefined
  if (!membro) {
    membro = {
      id: data.nextMemId,
      badge: body.badge, passaporte: body.passaporte, policial: body.policial,
      patenteNPD: body.patenteNPD, patenteInterna: body.patenteInterna,
      status: 'Ativo',
      entrada: new Date().toISOString().slice(0, 10),
      promocao: new Date().toISOString().slice(0, 10),
      adv1: false, adv2: false, adv3: false,
    } as Membro
    data.membros.push(membro)
    data.membrosOrder.push(membro.id)
    data.nextMemId++
    conta.membroId = membro.id
  } else {
    Object.assign(membro, { policial: body.policial, badge: body.badge, passaporte: body.passaporte, patenteNPD: body.patenteNPD, patenteInterna: body.patenteInterna })
  }
  conta.onboarded = true
  writeData(data)
  audit('ONBOARDING_DONE', req, `Membro: ${membro.policial} (#${membro.id})`)
  res.json({ ok: true, membroId: membro.id })
})

// PUT /api/auth/me/membro-dados — usuário edita o próprio perfil de membro
router.put('/me/membro-dados', requireAuth, validateBody(membroSelfSchema), (req: Request, res: Response): void => {
  const data = readData()
  const conta = data.contas.find(c => c.id === req.user!.contaId)
  if (!conta?.membroId) { res.status(400).json({ error: 'Nenhum perfil de membro vinculado' }); return }
  const membro = data.membros.find(m => m.id === conta.membroId)
  if (!membro) { res.status(404).json({ error: 'Membro não encontrado' }); return }
  const allowed: (keyof Membro)[] = ['policial', 'badge', 'passaporte', 'patenteNPD', 'patenteInterna']
  const body = req.body as Partial<Membro>
  allowed.forEach(k => { if (k in body) (membro as unknown as Record<string, unknown>)[k] = body[k] })
  writeData(data)
  audit('PROFILE_SELF_EDITED', req, `Membro #${membro.id}`)
  res.json(membro)
})

// PUT /api/auth/me/avatar — foto de perfil (data URL) ou null p/ remover
router.put('/me/avatar', requireAuth, (req: Request, res: Response): void => {
  const { avatar } = req.body as { avatar: string | null }
  if (avatar !== null && (typeof avatar !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,/.test(avatar) || avatar.length > 2_500_000)) {
    res.status(400).json({ error: 'Imagem inválida ou muito grande (máx ~2MB).' }); return
  }
  const data = readData()
  const conta = data.contas.find(c => c.id === req.user!.contaId)
  if (!conta) { res.status(404).json({ error: 'Conta não encontrada' }); return }
  if (avatar === null) delete conta.avatar; else conta.avatar = avatar
  writeData(data)
  res.json({ ok: true })
})

// PUT /api/auth/me/banner — chave de preset/tier OU data URL OU null
router.put('/me/banner', requireAuth, (req: Request, res: Response): void => {
  const { banner } = req.body as { banner: string | null }
  if (banner !== null) {
    const isData = /^data:image\/(png|jpeg|webp|gif);base64,/.test(banner)
    const isKey = typeof banner === 'string' && banner.length <= 40 && /^[\w.-]+$/.test(banner)
    if (!isData && !isKey) { res.status(400).json({ error: 'Banner inválido.' }); return }
    if (isData && banner.length > 3_500_000) { res.status(400).json({ error: 'Imagem muito grande (máx ~3MB).' }); return }
  }
  const data = readData()
  const conta = data.contas.find(c => c.id === req.user!.contaId)
  if (!conta) { res.status(404).json({ error: 'Conta não encontrada' }); return }
  if (banner === null) delete conta.banner; else conta.banner = banner
  writeData(data)
  res.json({ ok: true })
})

// PUT /api/auth/me/membro — vincula (ou desvincula) o perfil de membro à conta
router.put('/me/membro', requireAuth, (req: Request, res: Response): void => {
  const { membroId } = req.body as { membroId: number | null }
  const data = readData()
  const conta = data.contas.find(c => c.id === req.user!.contaId)
  if (!conta) { res.status(404).json({ error: 'Conta não encontrada' }); return }

  if (membroId === null || membroId === undefined) {
    delete conta.membroId
  } else {
    if (!data.membros.some(m => m.id === membroId)) {
      res.status(400).json({ error: 'Membro não encontrado' }); return
    }
    conta.membroId = membroId
  }
  writeData(data)
  audit('PROFILE_MEMBER_LINKED', req, `membroId: ${conta.membroId ?? 'nenhum'}`)
  res.json({ ok: true, membroId: conta.membroId ?? null })
})

// PUT /api/auth/change-password
router.put(
  '/change-password',
  requireAuth,
  criticalLimiter,
  validateBody(changePasswordSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { currentPassword, newPassword } = req.body as {
      currentPassword: string
      newPassword: string
    }

    const data = readData()
    const conta = data.contas.find(c => c.id === req.user!.contaId)

    if (!conta) {
      res.status(404).json({ error: 'Conta não encontrada' })
      return
    }

    const senhaCorreta = await bcrypt.compare(currentPassword, conta.password)
    if (!senhaCorreta) {
      audit('PASSWORD_CHANGED', req, 'Falha — senha atual incorreta')
      res.status(401).json({ error: 'Senha atual incorreta' })
      return
    }

    if (newPassword === currentPassword) {
      res.status(400).json({ error: 'A nova senha deve ser diferente da atual' })
      return
    }

    conta.password = await bcrypt.hash(newPassword, 12)
    writeData(data)

    // Revogar token atual — obriga novo login com nova senha
    if (req.user!.jti && req.user!.exp) {
      revokeToken(req.user!.jti, req.user!.exp * 1000)
    }

    audit('PASSWORD_CHANGED', req, 'Senha alterada com sucesso')
    res.json({ ok: true, message: 'Senha alterada. Faça login novamente.' })
  },
)

export default router
