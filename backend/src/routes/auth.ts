import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import { configuredScope } from '../modules/ranking/scope'
import { assinarToken } from '../security/jwt'
import { escopoDoToken } from '../security/escopo'
import { iguaisSeguro } from '../security/crypto'
import { requireAuth } from '../middleware/auth'
import { adminOnly } from '../middleware/roles'
import { loginLimiter, trocaLoginLimiter, sessaoLimiter } from '../middleware/rateLimiter'
import { validateBody, onboardingSchema, membroSelfSchema, nivelInicialSchema } from '../middleware/validate'
import { Membro, Conta, FastData } from '../types'
import { revokeToken } from '../security/tokenBlacklist'
import { audit } from '../security/audit'
import { readData, writeData } from '../data'
import { tentarPostarRegistro } from '../discord/forum'
import { bloqueioDeAcesso } from '../efetivo'
import { buscarMembroServidor, aplicarIdentidade } from '../discord/identidade'
import { verificarBotNoServidor } from '../discord/acessoServidor'
import { notificar, notificarAprovadores, notificarAdmins, notificarArea } from '../notificacoes'
import { CampoPerfil } from '../types'
import { avatarAtual, nivelDoMembro, aplicarCampoPerfil } from '../identidadeMembro'
import { imagemValida } from '../security/imagem'
import { isAdmin, resolvePerms, PROTECTED_OWNER_ID, discordIdsDonos, garantirAcessoDono } from '../access'

const router = Router()

// Autenticação exclusivamente via Discord OAuth2 (sem login por senha).

// ── Discord OAuth ────────────────────────────────────────────────
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'
const DISCORD_AUTHORIZE = 'https://discord.com/api/oauth2/authorize'
const DISCORD_TOKEN = 'https://discord.com/api/oauth2/token'
const DISCORD_ME = 'https://discord.com/api/users/@me'
const oauthStates = new Set<string>()
const loginCodes = new Map<string, { token: string; contaId: number; username: string; nivel: string; binding: string }>()
const stateCookie = 'fast_oauth_state'
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/api/auth' }
function lerCookie(req: Request, nome: string): string | undefined {
  return req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(`${nome}=`))?.slice(nome.length + 1)
}
function browserState(req: Request): string | undefined { return lerCookie(req, stateCookie) }
// Sessão ao recarregar a página: o token fica num cookie httpOnly (JS não lê), SameSite=Strict,
// enviado só para /api/auth/sessao. Nada de token em localStorage/sessionStorage.
const sessaoCookie = 'fast_sessao'
const sessaoCookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' as const, path: '/api/auth/sessao' }
const SESSAO_MAX_MS = 8 * 3600_000

function discordConfigured(): boolean {
  return !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET && process.env.DISCORD_REDIRECT_URI)
}

function issueToken(conta: { id: number; username: string; nivel: string }): string {
  const jti = crypto.randomUUID()
  // scope = hash do servidor+bot (IDs não ficam legíveis no payload); iss/aud/exp em security/jwt.ts
  const payload: Record<string, unknown> = { contaId: conta.id, username: conta.username, nivel: conta.nivel, jti }
  const escopo = escopoDoToken(configuredScope())
  if (escopo) payload.scope = escopo
  return assinarToken(payload)
}
// Teto de states pendentes (evita encher memória com /discord em massa)
const MAX_OAUTH_PENDENTES = 5_000

// GET /api/auth/discord — inicia o fluxo
router.get('/discord', loginLimiter, (_req: Request, res: Response): void => {
  if (!discordConfigured()) {
    res.redirect(`${FRONTEND_URL}/login?reason=discord_off`)
    return
  }
  if (oauthStates.size >= MAX_OAUTH_PENDENTES) {
    res.redirect(`${FRONTEND_URL}/login?reason=discord_erro`)
    return
  }
  const state = crypto.randomUUID()
  oauthStates.add(state)
  setTimeout(() => oauthStates.delete(state), 10 * 60 * 1000).unref()
  res.cookie(stateCookie, state, { ...cookieOptions, maxAge: 10 * 60 * 1000 })

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
  if (typeof code !== 'string' || typeof state !== 'string' || code.length > 512 || !oauthStates.has(state) || !iguaisSeguro(browserState(req), state)) {
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

    // Donos (DISCORD_OWNER_ID, aceita vários IDs separados por vírgula) têm
    // acesso total. O primeiro dono a entrar assume a conta id 1.
    const ehDono = discordIdsDonos().includes(me.id)

    // Vínculo com o servidor: o bot precisa estar no servidor da unidade e a
    // pessoa precisa fazer parte dele. Donos passam (evita ficar trancado fora).
    let membroServidor: Awaited<ReturnType<typeof buscarMembroServidor>>
    if (!ehDono) {
      let botPresente = false
      try { botPresente = await verificarBotNoServidor() } catch (err) {
        console.error('[FAST][DISCORD] verificar bot no servidor:', err instanceof Error ? err.message : err)
        res.redirect(`${FRONTEND_URL}/login?reason=discord_erro`); return
      }
      if (!botPresente) {
        audit('DISCORD_LOGIN_DENIED', req, `Bot fora do servidor — Discord: ${me.username} (${me.id})`)
        res.redirect(`${FRONTEND_URL}/login?reason=bot_fora_servidor`); return
      }
      try { membroServidor = await buscarMembroServidor(me.id) } catch (err) {
        console.error('[FAST][DISCORD] verificar membro do servidor:', err instanceof Error ? err.message : err)
        res.redirect(`${FRONTEND_URL}/login?reason=discord_erro`); return
      }
      if (!membroServidor) {
        audit('DISCORD_LOGIN_DENIED', req, `Não faz parte do servidor — Discord: ${me.username} (${me.id})`)
        res.redirect(`${FRONTEND_URL}/login?reason=fora_servidor`); return
      }
    } else {
      // Dono: identidade do servidor é opcional (não bloqueia o acesso)
      try { membroServidor = await buscarMembroServidor(me.id) } catch (err) {
        console.error('[FAST][DISCORD] identidade no servidor:', err instanceof Error ? err.message : err)
      }
    }

    // Sem await daqui até writeData: evita sobrescrever gravações concorrentes
    const data = readData()
    let conta = data.contas.find(c => c.discordId === me.id)
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

    // Nome e foto iguais aos do servidor da unidade
    if (membroServidor) aplicarIdentidade(conta, membroServidor)

    writeData(data)

    const bloqueio = bloqueioDeAcesso(conta, data)
    if (bloqueio?.codigo === 'AUSENTE') {
      audit('DISCORD_LOGIN_DENIED', req, `Em ausência até ${bloqueio.ate} — ${conta.username}`)
      res.redirect(`${FRONTEND_URL}/login?reason=ausente&ate=${bloqueio.ate}`)
      return
    }

    const token = issueToken(conta)
    audit('DISCORD_LOGIN_SUCCESS', req, `Usuário: ${conta.username} | Discord: ${me.username}`)
    const loginCode = crypto.randomBytes(32).toString('hex')
    loginCodes.set(loginCode, { token, contaId: conta.id, username: conta.username, nivel: conta.nivel, binding: state })
    setTimeout(() => loginCodes.delete(loginCode), 60_000).unref()
    res.redirect(`${FRONTEND_URL}/auth/discord#code=${loginCode}`)
  } catch {
    audit('DISCORD_LOGIN_ERROR', req)
    res.redirect(`${FRONTEND_URL}/login?reason=discord_erro`)
  }
})

// POST /api/auth/logout
router.post('/discord/exchange', trocaLoginLimiter, (req, res): void => {
  const code = req.body?.code
  const session = typeof code === 'string' && code.length <= 128 ? loginCodes.get(code) : undefined
  if (!session || !iguaisSeguro(browserState(req), session.binding)) {
    res.status(400).json({ error: 'Login inválido ou expirado' }); return
  }
  loginCodes.delete(code)
  res.clearCookie(stateCookie, cookieOptions)
  res.cookie(sessaoCookie, session.token, { ...sessaoCookieOptions, maxAge: SESSAO_MAX_MS })
  const { binding: _binding, ...result } = session
  res.json(result)
})

// POST /api/auth/sessao — devolve a sessão do cookie httpOnly (recarregar a página sem novo login).
// Exige header próprio (bloqueia formulário/CSRF entre sites) e valida o token como qualquer rota.
router.post('/sessao', sessaoLimiter, (req: Request, res: Response): void => {
  const token = lerCookie(req, sessaoCookie)
  if (req.get('x-fast-sessao') !== '1' || !token || token.length > 4096 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) {
    res.status(204).end(); return
  }
  // Se o token não valer mais (revogado, exonerado, conta desativada…), o cookie é apagado
  res.clearCookie(sessaoCookie, sessaoCookieOptions)
  req.headers.authorization = `Bearer ${token}`
  requireAuth(req, res, () => {
    const data = readData()
    const conta = data.contas.find(c => c.id === req.user!.contaId)
    if (!conta) { res.status(204).end(); return }
    const restante = Math.max(0, (req.user!.exp ?? 0) * 1000 - Date.now())
    res.cookie(sessaoCookie, token, { ...sessaoCookieOptions, maxAge: Math.min(restante, SESSAO_MAX_MS) })
    res.json({ token, contaId: conta.id, username: conta.username, nivel: conta.nivel })
  })
})

router.post('/logout', requireAuth, (req: Request, res: Response): void => {
  const user = req.user!
  if (user.jti && user.exp) {
    revokeToken(user.jti, user.exp * 1000)
  }
  audit('LOGOUT', req)
  res.clearCookie(sessaoCookie, sessaoCookieOptions)
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
    nomeServidor: conta.nomeServidor ?? conta.discordUsername ?? conta.username,
    avatarServidor: conta.avatarServidor ?? null,
    avatar: conta.avatar ?? null,
    avatarAtual: avatarAtual(conta),
    nivelMembro: nivelDoMembro(conta.membroId ? data.membros.find(m => m.id === conta.membroId) : undefined),
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
  // Cadastro já concluído: alterações só pelo fluxo de aprovação
  if (conta.onboarded !== false && conta.membroId && data.membros.some(m => m.id === conta.membroId)) {
    res.status(409).json({ error: 'Cadastro já concluído. Envie uma alteração de perfil para aprovação.' }); return
  }
  const body = req.body as { nivel: number; policial: string; badge: string; passaporte: string; patenteNPD: string; patenteInterna: string }

  let membro = conta.membroId ? data.membros.find(m => m.id === conta.membroId) : undefined
  const novo = !membro
  if (!membro) {
    if (conta.membroArquivado && !data.membros.some(m => m.id === conta.membroArquivado!.id)) {
      membro = { ...conta.membroArquivado, ...body, status: 'Ativo' }
      data.membros.push(membro)
      data.membrosOrder.push(membro.id)
      conta.membroId = membro.id
      delete conta.membroArquivado
    }
  }
  if (!membro) {
    membro = {
      id: data.nextMemId,
      badge: body.badge, passaporte: body.passaporte, policial: body.policial,
      patenteNPD: body.patenteNPD, patenteInterna: body.patenteInterna, nivel: body.nivel,
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
    Object.assign(membro, { policial: body.policial, badge: body.badge, passaporte: body.passaporte, patenteNPD: body.patenteNPD, patenteInterna: body.patenteInterna, nivel: body.nivel })
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

// POST /api/auth/me/nivel — informa o nível pela primeira vez (obrigatório).
// Depois de informado, só muda por solicitação aprovada (alteração de perfil).
router.post('/me/nivel', requireAuth, validateBody(nivelInicialSchema), (req: Request, res: Response): void => {
  const data = readData()
  const conta = data.contas.find(c => c.id === req.user!.contaId)
  const membro = conta?.membroId ? data.membros.find(m => m.id === conta.membroId) : undefined
  if (!membro) { res.status(400).json({ error: 'Nenhum perfil de membro vinculado' }); return }
  if (nivelDoMembro(membro) !== null) {
    res.status(409).json({ error: 'Seu nível já foi informado. Para alterar, envie uma alteração de perfil para aprovação.' }); return
  }
  membro.nivel = (req.body as { nivel: number }).nivel
  writeData(data)
  audit('PROFILE_SELF_EDITED', req, `Membro #${membro.id}: nível informado ${membro.nivel}`)
  res.json({ ok: true, nivel: membro.nivel })
})

// PUT /api/auth/me/membro-dados — o usuário PEDE alteração do próprio perfil;
// só passa a valer quando um superior aprovar (a conta dona aplica direto).
router.put('/me/membro-dados', requireAuth, validateBody(membroSelfSchema), (req: Request, res: Response): void => {
  const data = readData()
  const conta = data.contas.find(c => c.id === req.user!.contaId)
  if (!conta?.membroId) { res.status(400).json({ error: 'Nenhum perfil de membro vinculado' }); return }
  const membro = data.membros.find(m => m.id === conta.membroId)
  if (!membro) { res.status(404).json({ error: 'Membro não encontrado' }); return }

  const campos: CampoPerfil[] = ['nivel', 'policial', 'badge', 'passaporte', 'patenteNPD', 'patenteInterna']
  const body = req.body as Partial<Record<CampoPerfil, string | number>>
  const alteracoes = campos
    .filter(k => body[k] !== undefined && String(body[k]) !== String(membro[k] ?? ''))
    .map(k => ({ campo: k, de: String(membro[k] ?? ''), para: String(body[k]) }))
  if (alteracoes.length === 0) { res.status(400).json({ error: 'Nenhuma alteração em relação ao perfil atual.' }); return }

  if (conta.id === PROTECTED_OWNER_ID) {
    for (const a of alteracoes) aplicarCampoPerfil(membro, a.campo, a.para)
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
  if (avatar !== null && (!imagemValida(avatar) || avatar.length > 2_500_000)) {
    res.status(400).json({ error: 'Imagem inválida ou muito grande. Envie um arquivo (máx ~2MB) ou cole um link http/https.' }); return
  }
  const data = readData()
  const conta = data.contas.find(c => c.id === req.user!.contaId)
  if (!conta) { res.status(404).json({ error: 'Conta não encontrada' }); return }
  if (avatar === null) { delete conta.avatar; delete conta.avatarEm } else { conta.avatar = avatar; conta.avatarEm = new Date().toISOString() }
  writeData(data)
  res.json({ ok: true })
})

// PUT /api/auth/me/banner — chave de preset/tier OU data URL OU null
router.put('/me/banner', requireAuth, (req: Request, res: Response): void => {
  const { banner } = req.body as { banner: string | null }
  if (banner !== null) {
    if (typeof banner !== 'string') { res.status(400).json({ error: 'Banner inválido.' }); return }
    const isData = imagemValida(banner)
    const isKey = !isData && banner.length <= 40 && /^[\w.-]+$/.test(banner)
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
router.put('/me/membro', requireAuth, adminOnly, (req: Request, res: Response): void => {
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
