// Login SOMENTE pelo Discord (OAuth2) + saída do servidor = exoneração. API do Discord simulada.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'du-login-'))
process.env.DATA_PATH = path.join(pasta, 'data.json')
process.env.DATA_ENCRYPTION_KEY = require('node:crypto').randomBytes(32).toString('base64url')   // só para o teste
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { makeData, guild } = require('./ranking-fixtures.cjs')

const secret = 'login-test-secret-with-enough-length-0123456789abcdef'
const DONO = '333333333333333333'        // conta 1 (fixture)
const OPERADOR = '444444444444444444'    // conta 2 (fixture)
const NOVO = '555555555555555555'        // ainda sem conta
const DONO2 = '666666666666666666'       // 2º ID de DISCORD_DONO_ID (conta própria, cargo dev)
const ESTRANHO = '777777777777777777'    // fora do servidor, sem conta
let server, base, data

// ── Discord simulado ────────────────────────────────────────────────────────
const noServidor = new Set([OPERADOR, NOVO])
let discordFora = false                  // simula a API do Discord fora do ar
const codigos = new Map()                // code → usuário
const chamadas = []
const fetchReal = globalThis.fetch
globalThis.fetch = async (url, init = {}) => {
  const u = String(url)
  if (!u.startsWith('https://discord.com/')) return fetchReal(url, init)
  chamadas.push({ url: u, auth: init.headers?.Authorization ?? '' })
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  if (u.endsWith('/oauth2/token/revoke')) return json(200, {})
  if (u.endsWith('/oauth2/token')) {
    const code = new URLSearchParams(String(init.body)).get('code')
    return codigos.has(code) ? json(200, { access_token: `at-${code}`, token_type: 'Bearer' }) : json(400, { error: 'invalid_grant' })
  }
  if (u.endsWith('/users/@me')) {
    const code = String(init.headers.Authorization).replace('Bearer at-', '')
    const id = codigos.get(code)
    return json(200, { id, username: `user${id.slice(0, 4)}`, global_name: `Nome ${id.slice(0, 4)}`, avatar: null })
  }
  const m = u.match(/\/guilds\/(\d+)\/members\/(\d+)$/)
  if (m) {
    if (discordFora) return json(500, { message: 'erro' })
    if (m[1] !== guild) return json(404, { code: 10004 })
    return noServidor.has(m[2]) ? json(200, { nick: `Apelido ${m[2].slice(0, 4)}`, avatar: null, roles: [] }) : json(404, { code: 10007, message: 'Unknown Member' })
  }
  return json(404, {})
}

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: 'test', JWT_SECRET: secret,
    DISCORD_CLIENT_ID: '222222222222222222', DISCORD_CLIENT_SECRET: 'segredo-do-app-de-teste', DISCORD_BOT_TOKEN: 'token-do-bot-de-teste',
    DISCORD_GUILD_ID: guild, DISCORD_REDIRECT_URI: 'http://127.0.0.1/api/auth/discord/callback',
    DISCORD_DONO_ID: `${DONO}, ${DONO2}`, DISCORD_ACESSO_LIVRE: ESTRANHO,   // variável antiga: precisa ser ignorada
  })
  data = Object.assign(makeData(), { solicitacoesAcesso: [], nextSolAcessoId: 1, nextContaId: 3 })
  data.cargosPermissao[0].admin = true
  const store = require('../dist/data')
  store.readData = () => structuredClone(data)
  store.peekData = () => data
  store.writeData = next => { data = structuredClone(next) }
  require('../dist/security/audit').audit = () => {}
  const express = require('express')
  const app = express()
  app.use(express.json())
  app.use('/api/auth', require('../dist/routes/auth').default)
  app.use('/api/config', require('../dist/routes/config').default)
  app.use((_err, _req, res, _next) => res.status(500).json({ error: 'Erro interno do servidor' }))
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => { globalThis.fetch = fetchReal; return new Promise(resolve => server.close(resolve)).then(() => fs.rmSync(pasta, { recursive: true, force: true })) })

async function zerarLimites() {
  const rl = require('../dist/middleware/rateLimiter')
  for (const ip of ['127.0.0.1', '::ffff:127.0.0.1', '::1']) {
    await rl.discordLoginLimiter.resetKey(ip); await rl.criticalLimiter.resetKey(ip); await rl.sessaoLimiter.resetKey(ip)
  }
}
const cookieDe = (res, nome) => (res.headers.getSetCookie?.() ?? []).find(c => c.startsWith(`${nome}=`))

/** Faz o fluxo completo: /discord → (Discord) → /callback. Devolve o destino e o token (se entrou). */
async function entrar(discordId, { estado } = {}) {
  const ini = await fetch(`${base}/api/auth/discord`, { redirect: 'manual' })
  const cookie = cookieDe(ini, 'du_oauth')
  const state = new URL(ini.headers.get('location')).searchParams.get('state')
  const code = `code-${Math.random().toString(36).slice(2)}`
  codigos.set(code, discordId)
  const volta = await fetch(`${base}/api/auth/discord/callback?code=${code}&state=${estado ?? state}`,
    { redirect: 'manual', headers: { Cookie: cookie.split(';')[0] } })
  const destino = volta.headers.get('location')
  const sessao = cookieDe(volta, 'du_sessao')
  let token
  if (sessao && !/du_sessao=;/.test(sessao)) {
    const r = await fetch(`${base}/api/auth/sessao`, { method: 'POST', headers: { Cookie: sessao.split(';')[0], 'X-DU-Sessao': '1' } })
    token = r.status === 200 ? (await r.json()).token : undefined
  }
  return { status: volta.status, destino, sessao, token }
}
async function req(method, rota, auth, body) {
  const res = await fetch(base + rota, { method, body: body ? JSON.stringify(body) : undefined,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(auth ? { Authorization: `Bearer ${auth}` } : {}) } })
  return { status: res.status, body: await res.json().catch(() => null) }
}

test('início do login: manda ao Discord com state aleatório em cookie httpOnly/Lax de caminho restrito', async () => {
  await zerarLimites()
  const r = await fetch(`${base}/api/auth/discord`, { redirect: 'manual' })
  assert.equal(r.status, 303)
  const destino = new URL(r.headers.get('location'))
  assert.equal(destino.origin, 'https://discord.com')
  assert.equal(destino.searchParams.get('scope'), 'identify')
  assert.equal(destino.searchParams.get('redirect_uri'), process.env.DISCORD_REDIRECT_URI)
  assert.match(destino.searchParams.get('state'), /^[\w-]{43}$/)
  assert.ok(!r.headers.get('location').includes(process.env.DISCORD_CLIENT_SECRET))
  const c = cookieDe(r, 'du_oauth')
  assert.match(c, /HttpOnly/i); assert.match(c, /SameSite=Lax/i); assert.match(c, /Path=\/api\/auth\/discord/)
})

test('volta do Discord: state errado/ausente ou cancelado não entra', async () => {
  await zerarLimites()
  const errado = await entrar(OPERADOR, { estado: 'x'.repeat(43) })
  assert.equal(errado.destino, '/login?reason=erro'); assert.equal(errado.token, undefined)
  const semCookie = await fetch(`${base}/api/auth/discord/callback?code=abc&state=${'y'.repeat(43)}`, { redirect: 'manual' })
  assert.equal(semCookie.headers.get('location'), '/login?reason=erro')
  const cancelado = await fetch(`${base}/api/auth/discord/callback?error=access_denied`, { redirect: 'manual' })
  assert.equal(cancelado.headers.get('location'), '/login?reason=cancelado')
})

test('login por senha não existe mais', async () => {
  await zerarLimites()
  for (const [m, rota] of [['POST', '/api/auth/login'], ['POST', '/api/auth/solicitar'], ['PUT', '/api/auth/me/senha'], ['PUT', '/api/config/contas/2/senha']]) {
    assert.equal((await req(m, rota, undefined, { username: 'comando', password: 'x' })).status, 404, rota)
  }
})

test('membro do servidor entra; sessão em cookie seguro; token do usuário do Discord é revogado', async () => {
  await zerarLimites()
  chamadas.length = 0
  const r = await entrar(OPERADOR)
  assert.equal(r.destino, '/dashboard')
  assert.match(r.sessao, /HttpOnly/i); assert.match(r.sessao, /SameSite=Strict/i); assert.match(r.sessao, /Path=\/api\/auth\/sessao/)
  assert.equal(require('jsonwebtoken').verify(r.token, secret, { algorithms: ['HS256'] }).contaId, 2)
  assert.equal((await req('GET', '/api/auth/me', r.token)).status, 200)
  assert.equal(data.contas[1].nomeServidor, 'Apelido 4444')                  // apelido do servidor
  assert.ok(chamadas.some(c => c.url.endsWith('/oauth2/token/revoke')))
  assert.ok(chamadas.some(c => c.url.includes('/members/') && c.auth.startsWith('Bot ')))
})

test('dono (DISCORD_DONO_ID) entra na conta 1 mesmo fora do servidor e sem consultar o servidor', async () => {
  await zerarLimites()
  chamadas.length = 0
  const r = await entrar(DONO)
  assert.equal(r.destino, '/dashboard')
  assert.equal(require('jsonwebtoken').decode(r.token).contaId, 1)
  assert.ok(!chamadas.some(c => c.url.includes('/members/')))
})

test('API do Discord fora do ar: ninguém entra e ninguém é exonerado', async () => {
  await zerarLimites()
  discordFora = true
  const r = await entrar(OPERADOR)
  assert.equal(r.destino, '/login?reason=erro'); assert.equal(r.token, undefined)
  await require('../dist/discord').verificarSaidasDoServidor()
  assert.notEqual(data.contas[1].exonerado, true)
  discordFora = false
})

test('primeiro acesso: vira pedido (sem duplicar); fora do servidor não pede (a antiga lista livre não vale mais)', async () => {
  await zerarLimites()
  assert.equal((await entrar(NOVO)).destino, '/login?reason=pendente')
  assert.equal((await entrar(NOVO)).destino, '/login?reason=pendente')
  // Login que não termina em sessão apaga a sessão anterior do navegador (computador compartilhado)
  const pendente = await entrar(NOVO)
  assert.match(pendente.sessao ?? '', /^du_sessao=;/); assert.equal(pendente.token, undefined)
  assert.equal(data.solicitacoesAcesso.filter(s => s.discordId === NOVO).length, 1)
  assert.ok(data.notificacoes.some(n => n.contaId === 1 && n.tipo === 'pendente_aprovacao'))
  assert.equal((await entrar(ESTRANHO)).destino, '/login?reason=fora_do_servidor')
  assert.ok(!data.solicitacoesAcesso.some(s => s.discordId === ESTRANHO))

  const admin = (await entrar(DONO)).token
  const operador = (await entrar(OPERADOR)).token
  assert.equal((await req('GET', '/api/config/solicitacoes-acesso', operador)).status, 403)
  const lista = await req('GET', '/api/config/solicitacoes-acesso', admin)
  assert.deepEqual(Object.keys(lista.body[0]).sort(), ['avatar', 'criadoEm', 'id', 'nome', 'setagem', 'username'])   // sem discordId
  const pedido = data.solicitacoesAcesso.find(s => s.discordId === NOVO)
  assert.equal((await req('POST', `/api/config/solicitacoes-acesso/${pedido.id}/aprovar`, operador, {})).status, 403)
  const aprovado = await req('POST', `/api/config/solicitacoes-acesso/${pedido.id}/aprovar`, admin, { cargoPermId: 20 })
  assert.equal(aprovado.status, 201); assert.equal(aprovado.body.onboarded, false)
  assert.equal(data.contas.find(c => c.discordId === NOVO).cargoPermId, 20)
  // Pedido simples também vira membro na hora (nome do Discord até completar o cadastro)
  const contaNova = data.contas.find(c => c.discordId === NOVO)
  assert.ok(data.membros.some(m => m.id === contaNova.membroId && m.status === 'Ativo'))

  const novo = await entrar(NOVO)
  assert.equal(novo.destino, '/dashboard')
  assert.equal(require('jsonwebtoken').decode(novo.token).contaId, aprovado.body.id)
  // Pedido antigo (senha, sem Discord) não pode ser aprovado
  data.solicitacoesAcesso.push({ id: 99, username: 'antigo', nome: 'Antigo', senha: '$2b$12$x', criadoEm: new Date().toISOString() })
  assert.equal((await req('POST', '/api/config/solicitacoes-acesso/99/aprovar', admin, {})).status, 409)
  data.solicitacoesAcesso = data.solicitacoesAcesso.filter(s => s.id !== 99)
})

test('saiu do servidor: exonerado (dados arquivados), sessão aberta cai e não volta sozinho', async () => {
  await zerarLimites()
  const token = (await entrar(OPERADOR)).token
  assert.equal((await req('GET', '/api/auth/me', token)).status, 200)
  noServidor.delete(OPERADOR)
  // Pedido de quem saiu antes da aprovação é descartado
  const PEDE_E_SAI = '999999999999999999'
  noServidor.add(PEDE_E_SAI)
  assert.equal((await entrar(PEDE_E_SAI)).destino, '/login?reason=pendente')
  noServidor.delete(PEDE_E_SAI)
  await require('../dist/discord').verificarSaidasDoServidor()
  const conta = data.contas.find(c => c.id === 2)
  assert.equal(conta.exonerado, true); assert.equal(conta.ativo, false)
  assert.equal(conta.membroArquivado.id, 2)                                    // ficha guardada, não apagada
  assert.ok(!data.membros.some(m => m.id === 2))
  assert.ok(!data.solicitacoesAcesso.some(s => s.discordId === PEDE_E_SAI))
  assert.ok(data.notificacoes.some(n => n.contaId === 1 && n.tipo === 'exoneracao'))
  const me = await req('GET', '/api/auth/me', token)
  assert.equal(me.status, 401); assert.deepEqual(me.body, { error: 'EXONERADO', reason: 'saiu' })
  assert.equal((await entrar(OPERADOR)).destino, '/login?reason=saiu')
  noServidor.add(OPERADOR)                                                       // voltou ao servidor
  assert.equal((await entrar(OPERADOR)).destino, '/login?reason=saiu')            // só o admin readmite
})

test('saiu do servidor descoberto no próprio login também exonera; dono nunca é exonerado', async () => {
  await zerarLimites()
  const novo = data.contas.find(c => c.discordId === NOVO)
  noServidor.delete(NOVO)
  assert.equal((await entrar(NOVO)).destino, '/login?reason=saiu')
  assert.equal(data.contas.find(c => c.id === novo.id).exonerado, true)          // sem ficha de membro: exonera mesmo assim
  await require('../dist/discord').verificarSaidasDoServidor()
  assert.notEqual(data.contas[0].exonerado, true)
  assert.equal((await entrar(DONO)).destino, '/dashboard')
})

test('donos: só 2 IDs entram fora do servidor; o 2º ganha conta própria com cargo dev e nunca é exonerado', async () => {
  await zerarLimites()
  const { idsDosDonos } = require('../dist/discord')
  assert.deepEqual(idsDosDonos(`${DONO}, ${DONO2},${ESTRANHO} lixo`), [DONO, DONO2])   // 3º ID é ignorado
  chamadas.length = 0
  const r = await entrar(DONO2)                                                   // fora do servidor
  assert.equal(r.destino, '/dashboard')
  assert.ok(!chamadas.some(c => c.url.includes('/members/')))
  const conta = data.contas.find(c => c.discordId === DONO2)
  assert.notEqual(conta.id, 1)                                                    // não é a conta dona
  assert.equal(data.cargosPermissao.find(c => c.id === conta.cargoPermId).dev, true)
  assert.equal(require('jsonwebtoken').decode(r.token).contaId, conta.id)
  assert.equal((await req('GET', '/api/auth/me', r.token)).body.dev, true)
  assert.equal(data.contas.filter(c => c.discordId === DONO2).length, 1)
  await entrar(DONO2)
  assert.equal(data.contas.filter(c => c.discordId === DONO2).length, 1)           // não duplica
  await require('../dist/discord').verificarSaidasDoServidor()
  assert.notEqual(data.contas.find(c => c.discordId === DONO2).exonerado, true)
  // Mais de 2 IDs: o servidor não sobe
  const { spawnSync } = require('node:child_process')
  const boot = spawnSync(process.execPath, ['-e', "require('./dist/config/env')"], { cwd: path.join(__dirname, '..'),
    env: { ...process.env, DISCORD_DONO_ID: `${DONO},${DONO2},${ESTRANHO}` }, encoding: 'utf8' })
  assert.equal(boot.status, 1)
  assert.match(boot.stderr, /no máximo 2/)
})

test('sessões: "sair de todos" derruba todos os aparelhos; lista de contas sem campos de senha', async () => {
  await zerarLimites()
  const a = (await entrar(DONO)).token
  const b = (await entrar(DONO)).token
  assert.equal((await req('POST', '/api/auth/sair-de-todos', a, {})).status, 200)
  assert.equal((await req('GET', '/api/auth/me', a)).status, 401)
  assert.equal((await req('GET', '/api/auth/me', b)).status, 401)
  data.contas[0].password = '$2b$12$legado'                                       // campo legado de versões antigas
  const admin = (await entrar(DONO)).token
  const contas = await req('GET', '/api/config/contas', admin)
  assert.equal(contas.status, 200)
  assert.ok(!/"password"|"sessaoVersao"|"senhaPadrao"|"temSenha"|\$2[aby]\$/.test(JSON.stringify(contas.body)))
})

test('backup/restore: só dev; dev que não é o dono não altera a conta dona; senhas legadas não entram', async () => {
  await zerarLimites()
  // readmite o operador para os próximos passos
  Object.assign(data.contas[1], { exonerado: undefined, ativo: true, cargoPermId: 10 })
  delete data.contas[1].exonerado
  let op = (await entrar(OPERADOR)).token
  const golpe = structuredClone(data)
  golpe.cargosPermissao.find(c => c.id === 10).dev = true
  assert.equal((await req('GET', '/api/config/backup', op)).status, 403)
  assert.equal((await req('POST', '/api/config/restore', op, golpe)).status, 403)
  assert.notEqual(data.cargosPermissao.find(c => c.id === 10).dev, true)

  data.cargosPermissao.push({ id: 30, nome: 'Dev', dev: true, permissoes: {} })
  data.contas[1].cargoPermId = 30
  op = (await entrar(OPERADOR)).token
  const tomada = structuredClone(data)
  tomada.contas[0].ativo = false
  tomada.contas[0].discordId = ESTRANHO
  tomada.contas[1].password = '$2b$12$' + 'a'.repeat(53)
  assert.equal((await req('POST', '/api/config/restore', op, { contas: 'x', membros: [], acoes: [] })).status, 400)
  assert.equal((await req('POST', '/api/config/restore', op, tomada)).status, 200)
  assert.equal(data.contas.find(c => c.id === 1).ativo, true)
  assert.equal(data.contas.find(c => c.id === 1).discordId, DONO)
  assert.equal(data.contas.find(c => c.id === 2).password, undefined)
})
