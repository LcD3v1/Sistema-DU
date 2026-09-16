import { Router, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { requireAuth } from '../middleware/auth'
import { loginLimiter } from '../middleware/rateLimiter'
import { validateBody, onboardingSchema, membroSelfSchema } from '../middleware/validate'
import { Membro, Conta, FastData } from '../types'
import { revokeToken } from '../security/tokenBlacklist'
import { audit } from '../security/audit'
import { readData, writeData } from '../data'
import { tentarPostarRegistro } from '../discord/forum'
import { bloqueioDeAcesso } from '../efetivo'
import { notificar, notificarAprovadores, notificarAdmins, notificarArea } from '../notificacoes'
import { CampoPerfil } from '../types'
import { isAdmin, resolvePerms, PROTECTED_OWNER_ID, discordIdsDonos, garantirAcessoDono } from '../access'

const router = Router()

// Autenticação exclusivamente via Discord OAuth2 (sem login por senha).

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
router.get('/discord', loginLimiter, (_req: Request, res: Response): void => {
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
router.get('/discord/callback', loginLimiter, async (req: Request, res: Response): Promise<void> => {
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

    // Donos (DISCORD_OWNER_ID, aceita vários IDs separados por vírgula) têm
    // acesso total. O primeiro dono a entrar assume a conta id 1.
    const ehDono = discordIdsDonos().includes(me.id)
    if (!conta && ehDono) {
      const dono = data.contas.find(c => c.id === PROTECTED_OWNER_ID)
      if (dono && !dono.discordId) {
        dono.discordId = me.id
        dono.ativo = true
        conta = dono
        audit('DISCORD_ACCOUNT_CREATED', req, `Conta dona vinculada ao Discord ${me.username} (${me.id})`)
      }
    }

    // Dono já com conta: garante acesso total (inclusive se foi exonerado/desativado)
    if (conta && ehDono && garantirAcessoDono(conta, data)) {
      audit('ACCOUNT_UPDATED', req, `Acesso total garantido ao dono ${me.username} (${me.id})`)
    }

    // Exonerado → aviso específico
    if (conta?.exonerado) {
      audit('DISCORD_LOGIN_DENIED', req, `Exonerado — Discord: ${me.username} (${me.id})`)
      res.redirect(`${FRONTEND_URL}/login?reason=exonerado`)
      return
    }

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
        nivel,
        ativo: true,
        discordId: me.id,
        discordUsername: displayName,
        onboarded: false,   // completa o cadastro no primeiro acesso
      }
      data.contas.push(conta)
      data.nextContaId++
      if (ehDono) {
        garantirAcessoDono(conta, data)
        audit('DISCORD_ACCOUNT_CREATED', req, `Dono ${username} criado com acesso total`)
      }
      if (!ehDono) notificar(data, conta.id, 'cadastro', 'Bem-vindo à FAST!',
        'Preencha seu cadastro para enviá-lo ao comando. Após a aprovação, você recebe seu cargo e o acesso ao painel.', '/perfil')
      if (!ehDono) notificarAdmins(data, conta.id, 'pendente_aprovacao', 'Novo acesso pelo Discord',
        `${displayName} entrou pelo Discord e está preenchendo o cadastro.`, '/configuracoes')
      audit('DISCORD_ACCOUNT_CREATED', req, `Nova conta via Discord: ${username} | aguardando aprovação`)
    } else {
      conta.discordUsername = me.global_name || me.username
    }

    writeData(data)

    const bloqueio = bloqueioDeAcesso(conta, data)
    if (bloqueio?.codigo === 'AUSENTE') {
      audit('DISCORD_LOGIN_DENIED', req, `Em ausência até ${bloqueio.ate} — ${conta.username}`)
      res.redirect(`${FRONTEND_URL}/login?reason=ausente&ate=${bloqueio.ate}`)
      return
    }

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

// POST /api/auth/onboarding — primeiro acesso cria o perfil de membro e vincula
router.post('/onboarding', requireAuth, validateBody(onboardingSchema), (req: Request, res: Response): void => {
  const data = readData()
  const conta = data.contas.find(c => c.id === req.user!.contaId)
  if (!conta) { res.status(404).json({ error: 'Conta não encontrada' }); return }
  const body = req.body as { policial: string; badge: string; passaporte: string; patenteNPD: string; patenteInterna: string }

  let membro = conta.membroId ? data.membros.find(m => m.id === conta.membroId) : undefined
  const novo = !membro
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

  const resumo = `${membro.policial}${membro.passaporte ? ` | ID ${membro.passaporte}` : ''}`
  const aprovado = conta.id === PROTECTED_OWNER_ID || Boolean(conta.cargoPermId)
  if (aprovado) {
    notificar(data, conta.id, 'aprovada', 'Cadastro concluído',
      'Seu cadastro foi registrado e enviado ao seu canal da unidade.', '/perfil')
    if (novo) notificarArea(data, 'membros', [conta.id], 'membro', 'Novo membro na unidade', `${resumo} entrou para o efetivo.`, '/membros')
  } else {
    notificar(data, conta.id, 'solicitacao', 'Cadastro enviado',
      'Seu cadastro foi enviado. Você está aguardando a aprovação do comando.', '/perfil')
    notificarAdmins(data, conta.id, 'pendente_aprovacao', 'Cadastro aguardando aprovação',
      `${resumo} enviou o cadastro e aguarda aprovação.`, '/configuracoes')
  }
  writeData(data)
  audit('ONBOARDING_DONE', req, `Membro: ${membro.policial} (#${membro.id})`)
  if (novo) tentarPostarRegistro(conta.id)
  res.json({ ok: true, membroId: membro.id })
})

// PUT /api/auth/me/membro-dados — o usuário PEDE alteração do próprio perfil;
// só passa a valer quando um superior aprovar (a conta dona aplica direto).
router.put('/me/membro-dados', requireAuth, validateBody(membroSelfSchema), (req: Request, res: Response): void => {
  const data = readData()
  const conta = data.contas.find(c => c.id === req.user!.contaId)
  if (!conta?.membroId) { res.status(400).json({ error: 'Nenhum perfil de membro vinculado' }); return }
  const membro = data.membros.find(m => m.id === conta.membroId)
  if (!membro) { res.status(404).json({ error: 'Membro não encontrado' }); return }

  const campos: CampoPerfil[] = ['policial', 'badge', 'passaporte', 'patenteNPD', 'patenteInterna']
  const body = req.body as Partial<Record<CampoPerfil, string>>
  const alteracoes = campos
    .filter(k => body[k] !== undefined && String(body[k]) !== String(membro[k] ?? ''))
    .map(k => ({ campo: k, de: String(membro[k] ?? ''), para: String(body[k]) }))
  if (alteracoes.length === 0) { res.status(400).json({ error: 'Nenhuma alteração em relação ao perfil atual.' }); return }

  if (conta.id === PROTECTED_OWNER_ID) {
    for (const a of alteracoes) (membro as unknown as Record<string, unknown>)[a.campo] = a.para
    writeData(data)
    audit('PROFILE_SELF_EDITED', req, `Membro #${membro.id} (conta dona)`)
    res.json({ pendente: false, membro })
    return
  }

  // Uma solicitação pendente por membro: a nova substitui a anterior
  data.solicitacoesPerfil = data.solicitacoesPerfil.filter(sp => !(sp.membroId === membro.id && sp.status === 'pendente'))
  const sol = {
    id: data.nextSolPerfilId++,
    membroId: membro.id,
    contaId: conta.id,
    alteracoes,
    status: 'pendente' as const,
    criadoEm: new Date().toISOString(),
  }
  data.solicitacoesPerfil.push(sol)
  notificar(data, conta.id, 'solicitacao', 'Alteração de perfil enviada',
    'Sua solicitação de alteração de perfil foi enviada. Você está aguardando a aprovação de um superior.', '/perfil')
  notificarAprovadores(data, 'membros', membro.id, conta.id, 'pendente_aprovacao', 'Alteração de perfil aguardando aprovação',
    `${membro.policial} pediu para alterar: ${alteracoes.map(a => a.campo).join(', ')}.`, '/membros')
  writeData(data)
  audit('PERFIL_SOLICITADO', req, `Membro #${membro.id}: ${alteracoes.map(a => `${a.campo}=${a.para}`).join(', ')}`)
  res.status(202).json({ pendente: true, solicitacao: sol })
})

// GET /api/auth/me/solicitacao-perfil — solicitação pendente do próprio usuário (ou null)
router.get('/me/solicitacao-perfil', requireAuth, (req: Request, res: Response): void => {
  const sp = readData().solicitacoesPerfil
    .filter(x => x.contaId === req.user!.contaId)
    .sort((a, b) => b.id - a.id)[0]
  res.json(sp ?? null)
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
    if (data.contas.some(c => c.id !== conta.id && c.membroId === membroId)) {
      res.status(409).json({ error: 'Este perfil já está vinculado a outra conta.' }); return
    }
    conta.membroId = membroId
  }
  writeData(data)
  audit('PROFILE_MEMBER_LINKED', req, `membroId: ${conta.membroId ?? 'nenhum'}`)
  res.json({ ok: true, membroId: conta.membroId ?? null })
})

export default router
