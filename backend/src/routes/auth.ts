import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import bcrypt from 'bcrypt'
import { configuredScope } from '../modules/ranking/scope'
import { assinarToken } from '../security/jwt'
import { escopoDoToken } from '../security/escopo'
import { requireAuth } from '../middleware/auth'
import { adminOnly } from '../middleware/roles'
import { loginLimiter, sessaoLimiter, solicitarAcessoLimiter, criticalLimiter } from '../middleware/rateLimiter'
import { validateBody, avatarSchema, bannerSchema, vincularMembroSchema, loginSchema, solicitarAcessoSchema, trocarSenhaSchema, onboardingSchema, membroSelfSchema, nivelInicialSchema, termosAceiteSchema, personalizacaoSchema } from '../middleware/validate'
import { TERMOS_VERSAO } from '../termos'
import { Membro, Conta, FastData, LinkPerfil } from '../types'
import { revokeToken } from '../security/tokenBlacklist'
import { audit } from '../security/audit'
import { readData, writeData } from '../data'
import { bloqueioDeAcesso } from '../efetivo'
import { bloqueio, registrarFalha, limparFalhas } from '../security/bruteForce'
import { alertar } from '../security/alertas'
import { notificar, notificarAprovadores, notificarAdmins, notificarArea } from '../notificacoes'
import { CampoPerfil } from '../types'
import { avatarAtual, nivelDoMembro, aplicarCampoPerfil } from '../identidadeMembro'
import { imagemValida, ehLinkImagem } from '../security/imagem'
import { isAdmin, isDev, resolvePerms, PROTECTED_OWNER_ID } from '../access'

const router = Router()

// Autenticação por usuário e senha (igual ao Sistema Tática): quem não tem conta
// pede o acesso na tela de login e o comando aprova em Configurações → Solicitações.

function lerCookie(req: Request, nome: string): string | undefined {
  return req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(`${nome}=`))?.slice(nome.length + 1)
}
// Sessão ao recarregar a página: o token fica num cookie httpOnly (JS não lê), SameSite=Strict,
// enviado só para /api/auth/sessao. Nada de token em localStorage/sessionStorage.
const sessaoCookie = 'fast_sessao'
const sessaoCookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' as const, path: '/api/auth/sessao' }
const SESSAO_MAX_MS = 8 * 3600_000

function issueToken(conta: { id: number; username: string; nivel: string; sessaoVersao?: number }): string {
  const jti = crypto.randomUUID()
  // scope = hash do servidor configurado (se houver); iss/aud/exp em security/jwt.ts
  const payload: Record<string, unknown> = { contaId: conta.id, username: conta.username, nivel: conta.nivel, jti, sv: conta.sessaoVersao ?? 0 }
  const escopo = escopoDoToken(configuredScope())
  if (escopo) payload.scope = escopo
  return assinarToken(payload)
}

// Hash fixo para comparar quando o usuário não existe: o tempo de resposta é o mesmo
// (não revela quais usuários existem).
const HASH_FALSO = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 12)
const mesmoUsuario = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

// POST /api/auth/login — usuário + senha
router.post('/login', loginLimiter, validateBody(loginSchema), async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body as { username: string; password: string }
  const espera = bloqueio(username)
  if (espera > 0) {
    audit('LOGIN_LOCKED', req, `Usuário: ${username}`)
    res.status(429).json({ error: `Muitas tentativas. Tente novamente em ${Math.ceil(espera / 60_000)} minuto(s).` }); return
  }

  const conta = readData().contas.find(c => mesmoUsuario(c.username, username))
  const senhaCorreta = await bcrypt.compare(password, conta?.password ?? HASH_FALSO)
  if (!conta?.password || !senhaCorreta) {
    // Só alerta para contas que existem (usuário inventado não vira spam de alerta)
    if (registrarFalha(username) && conta) {
      alertar('login_bloqueado', 'Conta bloqueada por tentativas de senha', `A conta "${conta.username}" recebeu 5 senhas erradas seguidas e ficou bloqueada por 15 min. IP: ${req.ip}`, conta.username)
    }
    audit('LOGIN_FAILED', req, `Usuário: ${username}`)
    res.status(401).json({ error: 'Usuário ou senha incorretos.' }); return
  }
  // Senha correta: só agora o estado da conta é revelado
  const data = readData()
  const atual = data.contas.find(c => c.id === conta.id)!
  if (atual.exonerado) {
    audit('LOGIN_FAILED', req, `Exonerado: ${atual.username}`)
    res.status(403).json({ error: 'Você foi exonerado da unidade.', reason: 'exonerado' }); return
  }
  if (!atual.ativo) {
    audit('LOGIN_FAILED', req, `Conta desativada: ${atual.username}`)
    res.status(403).json({ error: 'Conta desativada. Contate o comando.', reason: 'desativada' }); return
  }
  const bloqueioAcesso = bloqueioDeAcesso(atual, data)
  if (bloqueioAcesso?.codigo === 'AUSENTE') {
    audit('LOGIN_FAILED', req, `Em ausência até ${bloqueioAcesso.ate} — ${atual.username}`)
    res.status(403).json({ error: 'Você está em ausência.', reason: 'ausente', ate: bloqueioAcesso.ate }); return
  }

  limparFalhas(username)

  const token = issueToken(atual)
  audit('LOGIN_SUCCESS', req, `Usuário: ${atual.username}`)
  res.cookie(sessaoCookie, token, { ...sessaoCookieOptions, maxAge: SESSAO_MAX_MS })
  res.json({ token, contaId: atual.id, username: atual.username, nivel: atual.nivel })
})

// POST /api/auth/solicitar — pedido de acesso (público). O comando aprova e a conta é criada.
router.post('/solicitar', solicitarAcessoLimiter, validateBody(solicitarAcessoSchema), async (req: Request, res: Response): Promise<void> => {
  const { username, password, nome } = req.body as { username: string; password: string; nome: string }
  const senha = await bcrypt.hash(password, 12)
  // Sem await daqui até writeData
  const data = readData()
  if (data.contas.some(c => mesmoUsuario(c.username, username)) || data.solicitacoesAcesso.some(s => mesmoUsuario(s.username, username))) {
    res.status(409).json({ error: 'Esse usuário já está em uso. Escolha outro.' }); return
  }
  if (data.solicitacoesAcesso.length >= 200) {
    res.status(429).json({ error: 'Muitos pedidos aguardando aprovação. Tente novamente mais tarde.' }); return
  }
  data.solicitacoesAcesso.push({ id: data.nextSolAcessoId++, username, senha, nome, criadoEm: new Date().toISOString() })
  notificarAdmins(data, undefined, 'pendente_aprovacao', 'Pedido de acesso',
    `${nome} (@${username}) pediu acesso ao painel.`, '/configuracoes')
  writeData(data)
  audit('SIGNUP_REQUESTED', req, `Usuário: ${username}`)
  res.status(201).json({ ok: true })
})

// PUT /api/auth/me/senha — troca a própria senha (encerra a sessão atual)
router.put('/me/senha', requireAuth, criticalLimiter, validateBody(trocarSenhaSchema), async (req: Request, res: Response): Promise<void> => {
  const { senhaAtual, novaSenha } = req.body as { senhaAtual: string; novaSenha: string }
  const conta = readData().contas.find(c => c.id === req.user!.contaId)
  if (!conta?.password || !(await bcrypt.compare(senhaAtual, conta.password))) {
    audit('PASSWORD_CHANGED', req, 'Falha — senha atual incorreta')
    res.status(400).json({ error: 'Senha atual incorreta.' }); return
  }
  if (senhaAtual === novaSenha) { res.status(400).json({ error: 'A nova senha precisa ser diferente da atual.' }); return }
  const hash = await bcrypt.hash(novaSenha, 12)
  const data = readData()
  const alvo = data.contas.find(c => c.id === conta.id)
  if (!alvo) { res.status(404).json({ error: 'Conta não encontrada' }); return }
  alvo.password = hash
  delete alvo.senhaPadrao
  alvo.sessaoVersao = (alvo.sessaoVersao ?? 0) + 1   // derruba as sessões em outros aparelhos
  writeData(data)
  if (req.user!.jti && req.user!.exp) revokeToken(req.user!.jti, req.user!.exp * 1000)
  res.clearCookie(sessaoCookie, sessaoCookieOptions)
  audit('PASSWORD_CHANGED', req, 'Senha alterada')
  res.json({ ok: true })
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

// POST /api/auth/sair-de-todos — encerra a sessão em todos os aparelhos (inclusive este)
router.post('/sair-de-todos', requireAuth, criticalLimiter, (req: Request, res: Response): void => {
  const data = readData()
  const conta = data.contas.find(c => c.id === req.user!.contaId)
  if (!conta) { res.status(404).json({ error: 'Conta não encontrada' }); return }
  conta.sessaoVersao = (conta.sessaoVersao ?? 0) + 1
  writeData(data)
  audit('LOGOUT', req, 'Saiu de todos os aparelhos')
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
    links: conta.links ?? [],
    emojisPerfil: conta.emojisPerfil ?? [],
    onboarded: conta.onboarded !== false,
    cargoPermId: conta.cargoPermId ?? null,
    admin: isAdmin(conta, data),
    dev: isDev(conta, data),
    permissoes: resolvePerms(conta, data),
    termos: { atual: TERMOS_VERSAO, aceita: conta.termosAceitos?.versao ?? null },
    senhaPadrao: conta.senhaPadrao === true,
  })
})

// POST /api/auth/me/termos — registra o aceite da versão VIGENTE dos termos
// (Termos de Uso, Privacidade e Exclusividade). Só a própria conta, sem alvo.
router.post('/me/termos', requireAuth, validateBody(termosAceiteSchema), (req: Request, res: Response): void => {
  const { versao } = req.body as { versao: string }
  if (versao !== TERMOS_VERSAO) { res.status(409).json({ error: 'Os termos foram atualizados. Recarregue a página.' }); return }
  const data = readData()
  const conta = data.contas.find(c => c.id === req.user!.contaId)
  if (!conta) { res.status(404).json({ error: 'Conta não encontrada' }); return }
  if (conta.termosAceitos?.versao !== TERMOS_VERSAO) {
    conta.termosAceitos = { versao: TERMOS_VERSAO, em: new Date().toISOString() }
    writeData(data)
    audit('TERMOS_ACEITOS', req, `versão ${TERMOS_VERSAO}`)
  }
  res.json({ ok: true, aceita: TERMOS_VERSAO })
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
  const body = req.body as { nivel: number; policial: string; badge: string; passaporte: string; patenteNPD: string; patenteInterna: string; codinome: string }

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
      codinome: body.codinome,
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
    Object.assign(membro, { policial: body.policial, badge: body.badge, passaporte: body.passaporte, patenteNPD: body.patenteNPD, patenteInterna: body.patenteInterna, nivel: body.nivel, codinome: body.codinome })
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

// POST /api/auth/me/nivel/solicitar — PEDE a atualização do nível já informado.
// Só vale depois da aprovação de um superior (a conta dona aplica direto). Se já houver
// alteração de perfil pendente, o nível entra nela sem descartar os outros campos pedidos.
router.post('/me/nivel/solicitar', requireAuth, validateBody(nivelInicialSchema), (req: Request, res: Response): void => {
  const data = readData()
  const conta = data.contas.find(c => c.id === req.user!.contaId)
  const membro = conta?.membroId ? data.membros.find(m => m.id === conta.membroId) : undefined
  if (!conta || !membro) { res.status(400).json({ error: 'Nenhum perfil de membro vinculado' }); return }
  const atual = nivelDoMembro(membro)
  if (atual === null) { res.status(409).json({ error: 'Informe o seu nível primeiro.' }); return }
  const nivel = (req.body as { nivel: number }).nivel
  if (nivel === atual) { res.status(400).json({ error: 'Esse já é o seu nível atual.' }); return }

  if (conta.id === PROTECTED_OWNER_ID) {
    membro.nivel = nivel
    writeData(data)
    audit('PROFILE_SELF_EDITED', req, `Membro #${membro.id} (conta dona): nível ${atual}→${nivel}`)
    res.json({ pendente: false, nivel })
    return
  }

  const anterior = data.solicitacoesPerfil.find(sp => sp.membroId === membro.id && sp.status === 'pendente')
  const alteracoes = [
    ...(anterior?.alteracoes.filter(a => a.campo !== 'nivel') ?? []),
    { campo: 'nivel' as const, de: String(atual), para: String(nivel) },
  ]
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
  notificar(data, conta.id, 'solicitacao', 'Atualização de nível enviada',
    `Seu pedido para atualizar o nível para ${nivel} foi enviado. Você está aguardando a aprovação de um superior.`, '/perfil')
  notificarAprovadores(data, 'membros', membro.id, conta.id, 'pendente_aprovacao', 'Atualização de nível aguardando aprovação',
    `${membro.policial} pediu para atualizar o nível: ${atual} → ${nivel}.`, '/membros')
  writeData(data)
  audit('PERFIL_SOLICITADO', req, `Membro #${membro.id}: nivel=${nivel}`)
  res.status(202).json({ pendente: true, solicitacao: sol })
})

// PUT /api/auth/me/membro-dados — o usuário PEDE alteração do próprio perfil;
// só passa a valer quando um superior aprovar (a conta dona aplica direto).
router.put('/me/membro-dados', requireAuth, validateBody(membroSelfSchema), (req: Request, res: Response): void => {
  const data = readData()
  const conta = data.contas.find(c => c.id === req.user!.contaId)
  if (!conta?.membroId) { res.status(400).json({ error: 'Nenhum perfil de membro vinculado' }); return }
  const membro = data.membros.find(m => m.id === conta.membroId)
  if (!membro) { res.status(404).json({ error: 'Membro não encontrado' }); return }

  const campos: CampoPerfil[] = ['nivel', 'policial', 'codinome', 'badge', 'passaporte', 'patenteNPD', 'patenteInterna']
  const body = req.body as Partial<Record<CampoPerfil, string | number>>
  const alteracoes = campos
    .filter(k => body[k] !== undefined && String(body[k]) !== String(membro[k] ?? ''))
    .map(k => ({ campo: k, de: String(membro[k] ?? ''), para: String(body[k]) }))
  if (alteracoes.length === 0) { res.status(400).json({ error: 'Nenhuma alteração em relação ao perfil atual.' }); return }

  if (conta.id === PROTECTED_OWNER_ID) {
    for (const a of alteracoes) aplicarCampoPerfil(membro, a.campo, a.para)
    writeData(data)
    audit('PROFILE_SELF_EDITED', req, `Membro #${membro.id} (conta dona)`)
    const { discordThreadId: _t, registroCanal: _r, ...membroPublico } = membro
    res.json({ pendente: false, membro: membroPublico })
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
router.put('/me/avatar', requireAuth, validateBody(avatarSchema), (req: Request, res: Response): void => {
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
router.put('/me/banner', requireAuth, validateBody(bannerSchema), (req: Request, res: Response): void => {
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

// PUT /api/auth/me/personalizacao — links e emojis do próprio perfil (dados públicos)
router.put('/me/personalizacao', requireAuth, validateBody(personalizacaoSchema), (req: Request, res: Response): void => {
  const { links, emojis } = req.body as { links: LinkPerfil[]; emojis: string[] }
  const data = readData()
  const conta = data.contas.find(c => c.id === req.user!.contaId)
  if (!conta) { res.status(404).json({ error: 'Conta não encontrada' }); return }
  conta.links = links.map(l => ({ rotulo: l.rotulo, url: l.url, ...(l.emoji ? { emoji: l.emoji } : {}) }))
  conta.emojisPerfil = [...emojis]
  if (!conta.links.length) delete conta.links
  if (!conta.emojisPerfil.length) delete conta.emojisPerfil
  writeData(data)
  audit('PROFILE_SELF_EDITED', req, `personalização: ${links.length} link(s), ${emojis.length} emoji(s)`)
  res.json({ ok: true, links: conta.links ?? [], emojisPerfil: conta.emojisPerfil ?? [] })
})

// GET /api/auth/me/qrus — QRUs em que o próprio membro participou (com o boletim).
// Só as dele; campos filtrados (sem IDs do Discord, sem discordId de participantes).
router.get('/me/qrus', requireAuth, (req: Request, res: Response): void => {
  const data = readData()
  const conta = data.contas.find(c => c.id === req.user!.contaId)
  const membroId = conta?.membroId
  if (!membroId) { res.json([]); return }
  const nomes = new Map(data.membros.map(m => [m.id, m.policial]))
  const lista = data.acoes
    .filter(a => Array.isArray(a.participants) && a.participants.some(p => p.memberId === membroId))
    .sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id)
    .slice(0, 300)
    .map(a => ({
      id: a.id,
      data: a.data.slice(0, 10),
      qru: a.qru,
      tipo: a.tipo ?? 'fechado',   // registro antigo sem tipo = fechado
      resultado: a.resultado ?? null,
      local: a.local ?? '',
      comandante: a.comandante ?? '',
      imagem: a.imagem && ehLinkImagem(a.imagem) ? a.imagem : null,
      status: a.status ?? 'aprovada',
      participantes: [
        ...a.participants.map(p => ({ nome: nomes.get(p.memberId) ?? 'Ex-membro', patente: p.patenteUnidade ?? '' })),
        ...(a.participantesExtras ?? []).map(e => ({ nome: e.nome, patente: e.patente ?? '', externo: true })),
      ],
    }))
  res.json(lista)
})

// PUT /api/auth/me/membro — vincula (ou desvincula) o perfil de membro à conta
router.put('/me/membro', requireAuth, adminOnly, validateBody(vincularMembroSchema), (req: Request, res: Response): void => {
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
