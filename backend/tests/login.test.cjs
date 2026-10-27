// Login por usuário e senha + pedido de acesso (igual ao Sistema Tática). Dados em memória.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'du-login-'))
process.env.DATA_PATH = path.join(pasta, 'data.json')
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const bcrypt = require('bcrypt')
const { makeData } = require('./ranking-fixtures.cjs')

const secret = 'login-test-secret-with-enough-length-0123456789abcdef'
let server, base, data

before(async () => {
  process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = secret
  delete process.env.DISCORD_GUILD_ID; delete process.env.DISCORD_CLIENT_ID
  data = Object.assign(makeData(), { solicitacoesAcesso: [], nextSolAcessoId: 1, nextContaId: 3 })
  data.contas[0].password = bcrypt.hashSync('senha-do-comando', 4)
  data.contas[1].password = bcrypt.hashSync('senha-do-operador', 4)
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
after(() => new Promise(resolve => server.close(resolve)).then(() => fs.rmSync(pasta, { recursive: true, force: true })))

// Os testes passam do limite por IP de propósito em alguns pontos; zera entre etapas.
async function zerarLimites() {
  const rl = require('../dist/middleware/rateLimiter')
  for (const ip of ['127.0.0.1', '::ffff:127.0.0.1', '::1']) {
    await rl.loginLimiter.resetKey(ip); await rl.solicitarAcessoLimiter.resetKey(ip)
  }
}
async function post(rota, body, auth) {
  const res = await fetch(base + rota, { method: 'POST', body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) } })
  return { status: res.status, body: await res.json().catch(() => null), headers: res.headers }
}
async function req(method, rota, auth, body) {
  const res = await fetch(base + rota, { method, body: body ? JSON.stringify(body) : undefined,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(auth ? { Authorization: `Bearer ${auth}` } : {}) } })
  return { status: res.status, body: await res.json().catch(() => null) }
}
const entrar = (username, password) => post('/api/auth/login', { username, password })

test('login: senha errada e usuário inexistente dão a MESMA resposta; certo devolve sessão em cookie seguro', async () => {
  await zerarLimites()
  const errada = await entrar('comando', 'nao-e-essa')
  const inexistente = await entrar('ninguem', 'qualquer-coisa')
  assert.equal(errada.status, 401); assert.equal(inexistente.status, 401)
  assert.deepEqual(errada.body, inexistente.body)                         // não revela quem existe
  const ok = await entrar('COMANDO', 'senha-do-comando')                 // usuário sem diferenciar maiúsculas
  assert.equal(ok.status, 200)
  assert.equal(require('jsonwebtoken').verify(ok.body.token, secret, { algorithms: ['HS256'] }).contaId, 1)
  assert.ok(!JSON.stringify(ok.body).includes('$2'))                     // nada de hash na resposta
  const cookie = ok.headers.get('set-cookie')
  assert.match(cookie, /fast_sessao=/); assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Strict/i); assert.match(cookie, /Path=\/api\/auth\/sessao/)
  assert.equal((await post('/api/auth/login', { username: 'comando', password: 'x', extra: 1 })).status, 400)   // Zod estrito
})

test('login: 5 erros bloqueiam o usuário (mesmo com a senha certa depois); exonerado e inativo não entram', async () => {
  await zerarLimites()
  for (let i = 0; i < 5; i++) assert.equal((await entrar('operador', `errada-${i}`)).status, 401)
  const bloqueado = await entrar('operador', 'senha-do-operador')
  assert.equal(bloqueado.status, 429)
  require('../dist/security/bruteForce').limparFalhas('operador')
  data.contas[1].exonerado = true; data.contas[1].ativo = false
  const exonerado = await entrar('operador', 'senha-do-operador')
  assert.equal(exonerado.status, 403); assert.equal(exonerado.body.reason, 'exonerado')
  delete data.contas[1].exonerado
  assert.equal((await entrar('operador', 'senha-do-operador')).body.reason, 'desativada')
  data.contas[1].ativo = true
  // Senha errada para exonerado/inativo continua genérica (não revela o estado)
  assert.equal((await entrar('operador', 'errada')).status, 401)
})

test('pedido de acesso: público, validado, guarda só o hash; o comando aprova e a pessoa entra', async () => {
  await zerarLimites()
  assert.equal((await post('/api/auth/solicitar', { nome: 'Lia Moreau', username: 'lia', password: 'curta' })).status, 400)
  assert.equal((await post('/api/auth/solicitar', { nome: 'Lia', username: 'li a', password: 'senha-da-lia' })).status, 400)
  assert.equal((await post('/api/auth/solicitar', { nome: 'Lia', username: 'lia', password: 'senha-da-lia', cargoPermId: 10 })).status, 400)
  assert.equal((await post('/api/auth/solicitar', { nome: 'Lia Moreau', username: 'lia.moreau', password: 'senha-da-lia' })).status, 201)
  assert.equal((await post('/api/auth/solicitar', { nome: 'Outra', username: 'LIA.MOREAU', password: 'outra-senha' })).status, 409)
  assert.equal((await post('/api/auth/solicitar', { nome: 'Outra', username: 'comando', password: 'outra-senha' })).status, 409)
  const pedido = data.solicitacoesAcesso[0]
  assert.match(pedido.senha, /^\$2[aby]\$/); assert.ok(!JSON.stringify(data).includes('senha-da-lia'))

  // Sem conta aprovada ainda: não entra
  assert.equal((await entrar('lia.moreau', 'senha-da-lia')).status, 401)

  const admin = (await entrar('comando', 'senha-do-comando')).body.token
  const operador = (await entrar('operador', 'senha-do-operador')).body.token
  assert.equal((await req('GET', '/api/config/solicitacoes-acesso', operador)).status, 403)
  const lista = await req('GET', '/api/config/solicitacoes-acesso', admin)
  assert.equal(lista.status, 200)
  assert.deepEqual(Object.keys(lista.body[0]).sort(), ['criadoEm', 'id', 'nome', 'username'])
  assert.equal((await req('POST', `/api/config/solicitacoes-acesso/${pedido.id}/aprovar`, operador, {})).status, 403)
  assert.equal((await req('POST', `/api/config/solicitacoes-acesso/${pedido.id}/aprovar`, admin, { cargoPermId: 999 })).status, 400)
  const aprovado = await req('POST', `/api/config/solicitacoes-acesso/${pedido.id}/aprovar`, admin, { cargoPermId: 20 })
  assert.equal(aprovado.status, 201)
  assert.equal(aprovado.body.password, undefined); assert.equal(aprovado.body.onboarded, false)
  assert.equal(data.solicitacoesAcesso.length, 0)
  const contas = await req('GET', '/api/config/contas', admin)
  assert.ok(!JSON.stringify(contas.body).includes('$2'))                 // lista de contas sem hash

  await zerarLimites()
  const lia = await entrar('lia.moreau', 'senha-da-lia')
  assert.equal(lia.status, 200)
  assert.equal(data.contas.find(c => c.username === 'lia.moreau').cargoPermId, 20)
})

test('senha: troca exige a atual e encerra a sessão; admin redefine (menos a do dono)', async () => {
  await zerarLimites()
  const token = (await entrar('operador', 'senha-do-operador')).body.token
  assert.equal((await req('PUT', '/api/auth/me/senha', token, { senhaAtual: 'errada', novaSenha: 'nova-senha-123' })).status, 400)
  assert.equal((await req('PUT', '/api/auth/me/senha', token, { senhaAtual: 'senha-do-operador', novaSenha: 'curta' })).status, 400)
  assert.equal((await req('PUT', '/api/auth/me/senha', token, { senhaAtual: 'senha-do-operador', novaSenha: 'nova-senha-123' })).status, 200)
  assert.equal((await req('GET', '/api/auth/me', token)).status, 401)    // token antigo revogado
  assert.equal((await entrar('operador', 'senha-do-operador')).status, 401)
  const novo = (await entrar('operador', 'nova-senha-123')).body.token

  await zerarLimites()
  const admin = (await entrar('comando', 'senha-do-comando')).body.token
  assert.equal((await req('PUT', '/api/config/contas/2/senha', novo, { novaSenha: 'redefinida-123' })).status, 403)
  assert.equal((await req('PUT', '/api/config/contas/2/senha', admin, { novaSenha: 'redefinida-123' })).status, 200)
  assert.equal((await entrar('operador', 'redefinida-123')).status, 200)
  // Admin que não é o dono não mexe na senha do dono
  data.cargosPermissao[1].admin = true
  const outroAdmin = (await entrar('operador', 'redefinida-123')).body.token
  assert.equal((await req('PUT', '/api/config/contas/1/senha', outroAdmin, { novaSenha: 'tomada-123456' })).status, 403)
  data.cargosPermissao[1].admin = false
})
