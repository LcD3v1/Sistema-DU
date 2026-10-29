import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import { configuredScope } from '../modules/ranking/scope'
import { assinarToken } from '../security/jwt'
import { escopoDoToken } from '../security/escopo'
import { iguaisSeguro } from '../security/crypto'
import { requireAuth } from '../middleware/auth'
import { adminOnly } from '../middleware/roles'
import { discordLoginLimiter, sessaoLimiter, criticalLimiter } from '../middleware/rateLimiter'
import { validateBody, avatarSchema, bannerSchema, vincularMembroSchema, onboardingSchema, membroSelfSchema, nivelInicialSchema, termosAceiteSchema, personalizacaoSchema } from '../middleware/validate'
import { TERMOS_VERSAO } from '../termos'
import { Membro, LinkPerfil } from '../types'
import { revokeToken } from '../security/tokenBlacklist'
import { audit } from '../security/audit'
import { readData, writeData } from '../data'
import { vincularContasAoEfetivo, aplicarPerfilNoDiscord, valorDePerfilInvalido, setagemAtual } from '../setagem'
import { bloqueioDeAcesso, MOTIVO_SAIU_DO_SERVIDOR, hoje } from '../efetivo'
import { notificar, notificarAprovadores, notificarAdmins, notificarArea } from '../notificacoes'
import { CampoPerfil } from '../types'
import { avatarAtual, nivelDoMembro, aplicarCampoPerfil } from '../identidadeMembro'
import { imagemValida, ehLinkImagem } from '../security/imagem'
import { isAdmin, isDev, resolvePerms, PROTECTED_OWNER_ID } from '../access'
import { nomeDaConta, nomeDoMembro } from '../registros'
import {
  discordConfig, urlAutorizacao, usuarioDoCodigo, situacaoNoServidor, contaDoDiscord,
  acessoLivre, ehSegundoDono, cargoDev, usuarioLivre, exonerarPorSaida, atualizarDadosDoServidor,
} from '../discord'

const router = Router()

// Autenticação SOMENTE pelo Discord (OAuth2). Só entra quem está no servidor da unidade,
// exceto no máximo 2 donos (DISCORD_DONO_ID no .env): o 1º é a conta dona, o 2º tem cargo dev.
// Primeiro acesso vira pedido de acesso; o comando aprova em Configurações → Solicitações.

function lerCookie(req: Request, nome: string): string | undefined {
  return req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(`${nome}=`))?.slice(nome.length + 1)
}
// Sessão ao recarregar a página: o token fica num cookie httpOnly (JS não lê), SameSite=Strict,
// enviado só para /api/auth/sessao. Nada de token em localStorage/sessionStorage.
const sessaoCookie = 'du_sessao'
const sessaoCookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' as const, path: '/api/auth/sessao' }
const SESSAO_MAX_MS = 8 * 3600_000

// `state` do OAuth (anti-CSRF): cookie httpOnly só para /api/auth/discord. SameSite=Lax porque
// a volta do Discord é uma navegação vinda de outro site (Strict não enviaria o cookie).
const estadoCookie = 'du_oauth'
const estadoCookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/api/auth/discord' }
const ESTADO_MAX_MS = 10 * 60_000

function issueToken(conta: { id: number; username: string; nivel: string; sessaoVersao?: number }): string {
  const jti = crypto.randomUUID()
  // scope = hash do servidor configurado (se houver); iss/aud/exp em security/jwt.ts
  const payload: Record<string, unknown> = { contaId: conta.id, username: conta.username, nivel: conta.nivel, jti, sv: conta.sessaoVersao ?? 0 }
  const escopo = escopoDoToken(configuredScope())
  if (escopo) payload.scope = escopo
  return assinarToken(payload)
}

/** Volta para a tela de login com um motivo fixo (lista branca no frontend; nada vindo do usuário). */
type Motivo = 'exonerado' | 'saiu' | 'desativada' | 'ausente' | 'fora_do_servidor' | 'pendente' | 'erro' | 'cancelado' | 'indisponivel'
function voltarLogin(res: Response, motivo: Motivo, ate?: string): void {
  // Login pelo Discord que não terminou em sessão: apaga a sessão anterior deste navegador
  // (senão outra pessoa no mesmo computador "volta" logada na conta de quem entrou antes)
  res.clearCookie(sessaoCookie, sessaoCookieOptions)
  const q = new URLSearchParams({ reason: motivo })
  if (ate && /^\d{4}-\d{2}-\d{2}$/.test(ate)) q.set('ate', ate)
  res.redirect(303, `/login?${q}`)
}

// GET /api/auth/discord — começa o login: gera o `state` e manda para o Discord
router.get('/discord', discordLoginLimiter, (req: Request, res: Response): void => {
  const cfg = discordConfig()
  if (!cfg) { voltarLogin(res, 'indisponivel'); return }
  const state = crypto.randomBytes(32).toString('base64url')
  res.cookie(estadoCookie, state, { ...estadoCookieOptions, maxAge: ESTADO_MAX_MS })
  res.redirect(303, urlAutorizacao(cfg, state))
})

// GET /api/auth/discord/callback — volta do Discord (code + state)
router.get('/discord/callback', discordLoginLimiter, async (req: Request, res: Response): Promise<void> => {
  const cfg = discordConfig()
  const esperado = lerCookie(req, estadoCookie)
  res.clearCookie(estadoCookie, estadoCookieOptions)   // state é de uso único
  if (!cfg) { voltarLogin(res, 'indisponivel'); return }
  const { code, state, error } = req.query
  if (typeof error === 'string') { voltarLogin(res, 'cancelado'); return }
  if (typeof code !== 'string' || !/^[\w-]{1,256}$/.test(code) || typeof state !== 'string' || !iguaisSeguro(state, esperado)) {
    audit('DISCORD_LOGIN_DENIED', req, 'state/code inválido')
    voltarLogin(res, 'erro'); return
  }

  let usuario
  try { usuario = await usuarioDoCodigo(cfg, code) } catch { usuario = undefined }
  if (!usuario) { audit('DISCORD_LOGIN_ERROR', req, 'troca do code falhou'); voltarLogin(res, 'erro'); return }
  const discordId = usuario.id

  // 1. Conta já existente: estado da conta antes de qualquer outra coisa
  const antes = contaDoDiscord(readData(), cfg, discordId)
  if (antes?.exonerado) {
    audit('DISCORD_LOGIN_DENIED', req, `Exonerado: conta #${antes.id}`)
    voltarLogin(res, antes.exoneradoMotivo === MOTIVO_SAIU_DO_SERVIDOR ? 'saiu' : 'exonerado'); return
  }
  if (antes && !antes.ativo) { audit('DISCORD_LOGIN_DENIED', req, `Conta desativada #${antes.id}`); voltarLogin(res, 'desativada'); return }

  // 2. Precisa estar no servidor (exceto os até 2 donos do .env). Falha da API = não entra.
  const livre = acessoLivre(cfg, discordId)
  const situacao = livre ? undefined : await situacaoNoServidor(cfg, discordId)
  if (situacao?.status === 'erro') { audit('DISCORD_LOGIN_ERROR', req, 'consulta ao servidor falhou'); voltarLogin(res, 'erro'); return }

  // Daqui até writeData: sem await (dados relidos depois das consultas ao Discord)
  const data = readData()
  let conta = contaDoDiscord(data, cfg, discordId)

  // Segundo dono (2º ID de DISCORD_DONO_ID): conta própria criada na hora, com cargo dev, sem pedido
  if (!conta && ehSegundoDono(cfg, discordId)) {
    conta = { id: data.nextContaId++, username: usuarioLivre(data, usuario.username), nivel: 'admin', ativo: true,
      discordId, discordUsername: usuario.username, nomeServidor: usuario.nome, onboarded: false, cargoPermId: cargoDev(data).id }
    data.contas.push(conta)
    data.solicitacoesAcesso = data.solicitacoesAcesso.filter(s => s.discordId !== discordId)
    audit('DISCORD_ACCOUNT_CREATED', req, `Segundo dono: conta #${conta.id} (cargo dev)`)
  }

  if (!conta) {
    if (situacao?.status === 'fora') { audit('DISCORD_LOGIN_DENIED', req, 'fora do servidor, sem conta'); voltarLogin(res, 'fora_do_servidor'); return }
    if (!data.solicitacoesAcesso.some(s => s.discordId === discordId)) {
      if (data.solicitacoesAcesso.length >= 200) { voltarLogin(res, 'erro'); return }
      const nome = (situacao?.status === 'membro' && situacao.apelido) || usuario.nome
      data.solicitacoesAcesso.push({ id: data.nextSolAcessoId++, discordId, username: usuario.username, nome,
        ...(usuario.avatar ? { avatar: usuario.avatar } : {}), criadoEm: new Date().toISOString() })
      notificarAdmins(data, undefined, 'pendente_aprovacao', 'Pedido de acesso',
        `${nome} (@${usuario.username}) pediu acesso ao painel.`, '/configuracoes')
      writeData(data)
      audit('SIGNUP_REQUESTED', req, `Discord: @${usuario.username}`)
    }
    voltarLogin(res, 'pendente'); return
  }

  if (conta.exonerado) { voltarLogin(res, conta.exoneradoMotivo === MOTIVO_SAIU_DO_SERVIDOR ? 'saiu' : 'exonerado'); return }
  if (!conta.ativo) { voltarLogin(res, 'desativada'); return }
  if (situacao?.status === 'fora') {
    // Saiu do servidor: exonera agora (dados arquivados)
    if (exonerarPorSaida(data, cfg, conta)) writeData(data)
    voltarLogin(res, 'saiu'); return
  }

  conta.discordId = discordId
  conta.discordUsername = usuario.username
  if (situacao?.status === 'membro') atualizarDadosDoServidor(conta, situacao)
  else if (usuario.avatar && usuario.avatar !== conta.avatarServidor) atualizarDadosDoServidor(conta, { avatar: usuario.avatar })
  if (!conta.nomeServidor) conta.nomeServidor = usuario.nome
  vincularContasAoEfetivo(data)   // aprovada sem ficha em Membros → ganha a sua

  const bloqueioAcesso = bloqueioDeAcesso(conta, data)
  if (bloqueioAcesso?.codigo === 'AUSENTE') {
    writeData(data)
    audit('DISCORD_LOGIN_DENIED', req, `Em ausência até ${bloqueioAcesso.ate} — conta #${conta.id}`)
    voltarLogin(res, 'ausente', bloqueioAcesso.ate); return
  }
  writeData(data)

  const token = issueToken(conta)
  audit('DISCORD_LOGIN_SUCCESS', req, `Conta #${conta.id} (@${usuario.username})`)
  res.cookie(sessaoCookie, token, { ...sessaoCookieOptions, maxAge: SESSAO_MAX_MS })
  // O app chama POST /api/auth/sessao ao carregar e recebe o token pelo cookie
  res.redirect(303, '/dashboard')
})

// POST /api/auth/sessao — devolve a sessão do cookie httpOnly (recarregar a página sem novo login).
// Exige header próprio (bloqueia formulário/CSRF entre sites) e valida o token como qualquer rota.
router.post('/sessao', sessaoLimiter, (req: Request, res: Response): void => {
  const token = lerCookie(req, sessaoCookie)
  if (req.get('x-du-sessao') !== '1' || !token || token.length > 4096 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) {
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
    nome: nomeDaConta(data, conta.id),   // codinome (regra: é como a pessoa aparece em todo lugar)
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
    // Dados do pedido de set (Discord): pré-preenchem o cadastro
    cadastroSetagem: conta.cadastroSetagem ?? null,
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
  const body = req.body as { nivel: number; policial: string; badge: string; passaporte: string; patenteDPD: string; patenteInterna: string; codinome: string }
  // Pedido de set aprovado: codinome e passaporte são os aprovados pelo comando (não mudam aqui)
  if (conta.cadastroSetagem) { body.codinome = conta.cadastroSetagem.codinome; body.passaporte = conta.cadastroSetagem.passaporte }
  let membro = conta.membroId ? data.membros.find(m => m.id === conta.membroId) : undefined
  // Patente da unidade NUNCA vem do navegador (senão a pessoa se dava a patente que quisesse e, numa
  // aprovação qualquer depois, ganhava os cargos dela no Discord). Vale a aprovada: setagem → ficha atual →
  // ficha arquivada → a mais baixa cadastrada. Promoção só pelo fluxo de aprovação (Membros).
  const patentesDaUnidade = setagemAtual(data).patentes.map(p => p.nome)
  body.patenteInterna = conta.cadastroSetagem?.patente || membro?.patenteInterna || conta.membroArquivado?.patenteInterna
    || patentesDaUnidade[patentesDaUnidade.length - 1] || ''
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
      patenteDPD: body.patenteDPD, patenteInterna: body.patenteInterna, nivel: body.nivel,
      codinome: body.codinome,
      status: 'Ativo',
      entrada: hoje(),
      promocao: hoje(),
      adv1: false, adv2: false, adv3: false,
    } as Membro
    data.membros.push(membro)
    data.membrosOrder.push(membro.id)
    data.nextMemId++
    conta.membroId = membro.id
  } else {
    Object.assign(membro, { policial: body.policial, badge: body.badge, passaporte: body.passaporte, patenteDPD: body.patenteDPD, patenteInterna: body.patenteInterna, nivel: body.nivel, codinome: body.codinome })
  }
  conta.onboarded = true

  const resumo = `${nomeDoMembro(data, membro)}${membro.passaporte ? ` | ID ${membro.passaporte}` : ''}`
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
  audit('ONBOARDING_DONE', req, `Membro: ${nomeDoMembro(data, membro)} (#${membro.id})`)
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
    `${nomeDoMembro(data, membro)} pediu para atualizar o nível: ${atual} → ${nivel}.`, '/membros')
  writeData(data)
  audit('PERFIL_SOLICITADO', req, `Membro #${membro.id}: nivel=${nivel}`)
  res.status(202).json({ pendente: true, solicitacao: sol })
})

// GET /api/auth/me/opcoes-perfil — patentes e setores para os selects do perfil (só nomes, sem IDs do Discord)
router.get('/me/opcoes-perfil', requireAuth, (_req: Request, res: Response): void => {
  const s = setagemAtual(readData())
  res.json({ patentes: s.patentes.map(p => p.nome), setores: (s.setores ?? []).map(x => x.nome) })
})

// PUT /api/auth/me/membro-dados — o usuário PEDE alteração do próprio perfil;
// só passa a valer quando um superior aprovar (a conta dona aplica direto).
router.put('/me/membro-dados', requireAuth, validateBody(membroSelfSchema), (req: Request, res: Response): void => {
  const data = readData()
  const conta = data.contas.find(c => c.id === req.user!.contaId)
  if (!conta?.membroId) { res.status(400).json({ error: 'Nenhum perfil de membro vinculado' }); return }
  const membro = data.membros.find(m => m.id === conta.membroId)
  if (!membro) { res.status(404).json({ error: 'Membro não encontrado' }); return }

  const campos: CampoPerfil[] = ['nivel', 'policial', 'codinome', 'badge', 'passaporte', 'patenteDPD', 'patenteInterna', 'setor']
  const body = req.body as Partial<Record<CampoPerfil, string | number>>
  const alteracoes = campos
    .filter(k => body[k] !== undefined && String(body[k]) !== String(membro[k] ?? ''))
    .map(k => ({ campo: k, de: String(membro[k] ?? ''), para: String(body[k]) }))
  if (alteracoes.length === 0) { res.status(400).json({ error: 'Nenhuma alteração em relação ao perfil atual.' }); return }
  const invalido = alteracoes.map(a => valorDePerfilInvalido(data, a.campo, a.para)).find(Boolean)
  if (invalido) { res.status(400).json({ error: invalido }); return }

  if (conta.id === PROTECTED_OWNER_ID) {
    const antes = { patente: membro.patenteInterna, setor: membro.setor }
    for (const a of alteracoes) aplicarCampoPerfil(membro, a.campo, a.para)
    writeData(data)
    audit('PROFILE_SELF_EDITED', req, `Membro #${membro.id} (conta dona)`)
    if (alteracoes.some(a => ['patenteInterna', 'setor', 'codinome', 'passaporte'].includes(a.campo))) void aplicarPerfilNoDiscord(membro.id, antes)
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
    `${nomeDoMembro(data, membro)} pediu para alterar: ${alteracoes.map(a => a.campo).join(', ')}.`, '/membros')
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
  const nomes = new Map(data.membros.map(m => [m.id, nomeDoMembro(data, m)]))   // codinome (regra)
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
