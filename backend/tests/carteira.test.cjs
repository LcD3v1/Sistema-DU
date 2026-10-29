// Carteirinha no fórum do Discord: só quando clicam em Postar; 1º post cria o tópico do membro,
// os seguintes entram no mesmo tópico. API do Discord simulada.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'du-cart-'))
process.env.DATA_PATH = path.join(pasta, 'data.json')
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { makeData, guild } = require('./ranking-fixtures.cjs')

const BOT = '222222222222222222'
const FORUM = '560000000000000001'
const TEXTO = '560000000000000002'
const ARQUIVADO = '578000000000000001'   // tópico arquivado do fórum
let server, base, data
const chamadas = []
const topicos = new Map()            // id do tópico → mensagens
let proximo = 1
const PNG = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 3)]).toString('base64')

const fetchReal = globalThis.fetch
globalThis.fetch = async (url, init = {}) => {
  const u = String(url)
  if (u.startsWith('https://cdn.discordapp.com/')) {
    chamadas.push(`CDN ${u}`)
    return new Response(Buffer.from(PNG.split(',')[1], 'base64'), { status: 200, headers: { 'Content-Type': 'image/png' } })
  }
  if (!u.startsWith('https://discord.com/')) return fetchReal(url, init)
  const metodo = init.method ?? 'GET'
  const rota = u.replace('https://discord.com/api/v10', '')
  chamadas.push(`${metodo} ${rota}`)
  const json = (s, b) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
  if (rota === `/guilds/${guild}?with_counts=true`) return json(200, { id: guild, name: 'Detective Unit' })
  if (rota === `/guilds/${guild}/roles`) return json(200, [{ id: guild, name: '@everyone', position: 0, permissions: '0' }])
  if (rota === `/guilds/${guild}/emojis`) return json(200, [])
  if (rota === '/users/@me') return json(200, { id: BOT, username: 'Bot', avatar: null })
  if (rota === `/guilds/${guild}/channels`) return json(200, [{ id: FORUM, name: 'carteirinhas', type: 15, position: 0 }, { id: TEXTO, name: 'geral', type: 0, position: 1 }])
  if (rota === `/guilds/${guild}/threads/active`) return json(200, { threads: [...topicos.keys()].map(id => ({ id, parent_id: FORUM, name: topicos.get(id)[0]?.nome ?? 'Tópico' })).concat([{ id: '579999999999999999', parent_id: TEXTO, name: 'De outro canal' }]) })
  if (rota === `/channels/${FORUM}/threads/archived/public?limit=50`) return json(200, { threads: [{ id: ARQUIVADO, parent_id: FORUM, name: 'Carteirinhas antigas' }] })
  if (rota === `/channels/${FORUM}/threads` && metodo === 'POST') {
    const id = `57000000000000000${proximo++}`
    const p = JSON.parse(init.body.get('payload_json'))
    topicos.set(id, [{ nome: p.name, ...p.message, arquivo: init.body.get('files[0]').name }])
    return json(201, { id })
  }
  const m = rota.match(/^\/channels\/(\d+)\/messages$/)
  if (m && metodo === 'POST') {
    if (!topicos.has(m[1])) return json(404, { code: 10003 })
    topicos.get(m[1]).push(JSON.parse(init.body.get('payload_json')))
    return json(200, { id: '580000000000000001' })
  }
  return json(404, {})
}

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: 'test', JWT_SECRET: 'carteira-test-secret-with-enough-length-0123456789ab',
    DISCORD_CLIENT_ID: BOT, DISCORD_CLIENT_SECRET: 'segredo-teste', DISCORD_BOT_TOKEN: 'token-teste',
    DISCORD_GUILD_ID: guild, DISCORD_REDIRECT_URI: 'http://127.0.0.1/api/auth/discord/callback', DISCORD_DONO_ID: '333333333333333333',
  })
  data = Object.assign(makeData(), { solicitacoesAcesso: [], nextSolAcessoId: 1, nextContaId: 3 })
  data.cargosPermissao[0].admin = true                                // conta 1 admin; conta 2 Officer (sem a área)
  data.membros[0].codinome = 'Raven'
  const store = require('../dist/data')
  store.readData = () => structuredClone(data)
  store.peekData = () => data
  store.writeData = next => { data = structuredClone(next) }
  require('../dist/security/audit').audit = () => {}
  const express = require('express')
  const app = express()
  app.use(express.json({ limit: '5mb' }))
  app.use('/api/carteira', require('../dist/routes/carteira').default)
  app.use((_err, _req, res, _next) => res.status(500).json({ error: 'Erro interno do servidor' }))
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => { globalThis.fetch = fetchReal; return new Promise(r => server.close(r)).then(() => fs.rmSync(pasta, { recursive: true, force: true })) })

function token(contaId) {
  const { escopoDoToken } = require('../dist/security/escopo')
  const { configuredScope } = require('../dist/modules/ranking/scope')
  return require('../dist/security/jwt').assinarToken({ contaId, username: `c${contaId}`, nivel: 'admin', jti: `jti-${Math.random()}`, sv: 0, scope: escopoDoToken(configuredScope()) })
}
async function req(method, rota, contaId, body) {
  const res = await fetch(base + rota, { method, body: body ? JSON.stringify(body) : undefined,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(contaId ? { Authorization: `Bearer ${token(contaId)}` } : {}) } })
  return { status: res.status, body: await res.json().catch(() => null) }
}
async function zerar() { const rl = require('../dist/middleware/rateLimiter'); for (const ip of ['127.0.0.1', '::ffff:127.0.0.1']) await rl.hierarquiaLimiter.resetKey(ip) }

test('fórum: só quem edita a área; lista só canais do tipo fórum; recusa canal que não é fórum', async () => {
  assert.equal((await req('GET', '/api/carteira/forum')).status, 401)
  assert.equal((await req('GET', '/api/carteira/forum', 2)).status, 403)
  const r = await req('GET', '/api/carteira/forum', 1)
  assert.equal(r.status, 200); assert.deepEqual(r.body.foruns, [{ id: FORUM, nome: 'carteirinhas' }]); assert.equal(r.body.canalId, null)
  assert.equal((await req('PUT', '/api/carteira/forum', 1, { canalId: TEXTO })).status, 400)
  assert.equal((await req('PUT', '/api/carteira/forum', 1, { canalId: 'abc' })).status, 400)
  assert.equal((await req('PUT', '/api/carteira/forum', 2, { canalId: FORUM })).status, 403)
  assert.equal((await req('PUT', '/api/carteira/forum', 1, { canalId: FORUM })).status, 200)
  assert.equal(data.canais.carteira, FORUM)
})

test('postar: valida imagem e membro; 1º post cria o tópico; o seguinte entra no MESMO tópico', async () => {
  await zerar()
  assert.equal((await req('POST', '/api/carteira/postar', 2, { membroId: 1, imagem: PNG })).status, 403)
  assert.equal((await req('POST', '/api/carteira/postar', 1, { membroId: 1, imagem: 'data:image/png;base64,' + Buffer.from('nao e png').toString('base64') })).status, 400)
  assert.equal((await req('POST', '/api/carteira/postar', 1, { membroId: 1, imagem: 'data:image/svg+xml;base64,PHN2Zz4=' })).status, 400)
  assert.equal((await req('POST', '/api/carteira/postar', 1, { membroId: 999, imagem: PNG })).status, 404)
  const r1 = await req('POST', '/api/carteira/postar', 1, { membroId: 1, imagem: PNG })
  assert.equal(r1.status, 200); assert.equal(r1.body.novoTopico, true)
  assert.ok(!JSON.stringify(r1.body).match(/\d{17,20}/))                    // ID do tópico não sai
  const topico = data.membros[0].discordThreadId
  assert.ok(topico && topicos.has(topico))
  const [primeira] = topicos.get(topico)
  assert.equal(primeira.nome, 'Raven | P1'); assert.equal(primeira.arquivo, 'carteirinha-1.png')   // tópico pelo codinome (regra)
  assert.ok(primeira.content.startsWith('<@333333333333333333>\n'))                // menciona o dono da carteirinha
  assert.deepEqual(primeira.allowed_mentions, { parse: [], users: ['333333333333333333'] }) // só ele é notificado
  const r2 = await req('POST', '/api/carteira/postar', 1, { membroId: 1, imagem: PNG })
  assert.equal(r2.body.novoTopico, false); assert.equal(topicos.get(topico).length, 2)
  assert.equal(data.membros[0].discordThreadId, topico)
})

test('tópico apagado no Discord: cria outro; sem fórum configurado não posta', async () => {
  await zerar()
  topicos.delete(data.membros[0].discordThreadId)
  const r = await req('POST', '/api/carteira/postar', 1, { membroId: 1, imagem: PNG })
  assert.equal(r.status, 200); assert.equal(r.body.novoTopico, true)
  assert.equal((await req('PUT', '/api/carteira/forum', 1, { canalId: null })).status, 200)
  assert.equal((await req('POST', '/api/carteira/postar', 1, { membroId: 1, imagem: PNG })).status, 400)
})

const HASH = 'a'.repeat(32)
test('membros: dados completados pelo painel + pedido de set + Discord, sem IDs nem links', async () => {
  assert.equal((await req('GET', '/api/carteira/membros')).status, 401)
  data.membros[1].codinome = ''; data.membros[1].passaporte = ''
  const c2 = data.contas.find(c => c.membroId === data.membros[1].id)
  c2.cadastroSetagem = { codinome: 'Ghost', passaporte: '777', patente: 'Detective' }
  c2.avatarServidor = `https://cdn.discordapp.com/avatars/${'4'.repeat(18)}/${HASH}.png?size=128`
  const r = await req('GET', '/api/carteira/membros', 1)
  assert.equal(r.status, 200)
  const m1 = r.body.find(x => x.id === 1), m2 = r.body.find(x => x.id === data.membros[1].id)
  assert.equal(m1.codinome, 'Raven'); assert.equal(m1.registro, '0001'); assert.equal(m1.postadaNoForum, true); assert.equal(m1.aprovado, true)
  assert.equal(m2.codinome, 'Ghost'); assert.equal(m2.passaporte, '777'); assert.equal(m2.temFoto, true)
  const txt = JSON.stringify(r.body)
  assert.ok(!/d{17,20}/.test(txt) && !/https?:/.test(txt) && !/discordThreadId|discordId|avatar/.test(txt))
})

test('foto: data URL conferida pelos bytes; Discord só pelo CDN de avatar; link qualquer não é baixado', async () => {
  const c1 = data.contas.find(c => c.id === 1)
  c1.avatar = PNG; c1.avatarServidor = null
  let res = await fetch(base + '/api/carteira/foto/1', { headers: { Authorization: `Bearer ${token(1)}` } })
  assert.equal(res.status, 200); assert.equal(res.headers.get('content-type'), 'image/png'); assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  assert.equal((await fetch(base + '/api/carteira/foto/1')).status, 401)
  assert.equal((await req('GET', '/api/carteira/foto/abc', 1)).status, 400)
  assert.equal((await req('GET', '/api/carteira/foto/999', 1)).status, 404)
  const id2 = data.membros[1].id
  res = await fetch(base + `/api/carteira/foto/${id2}`, { headers: { Authorization: `Bearer ${token(1)}` } })
  assert.equal(res.status, 200)
  assert.ok(chamadas.some(c => c.startsWith('CDN ') && c.endsWith('?size=512')))
  const antes = chamadas.length
  c1.avatar = 'https://exemplo.com/foto.png'
  assert.equal((await req('GET', '/api/carteira/foto/1', 1)).status, 404)
  c1.avatar = 'data:image/svg+xml;base64,PHN2Zz4='
  assert.equal((await req('GET', '/api/carteira/foto/1', 1)).status, 404)
  assert.equal(chamadas.length, antes)                                      // nenhum download de link externo
})

test('postar num tópico escolhido do fórum: lista só tópicos do fórum; posta nele sem mudar o tópico do membro', async () => {
  await zerar()
  topicos.set(ARQUIVADO, [{ nome: 'Carteirinhas antigas' }])
  assert.equal((await req('PUT', '/api/carteira/forum', 1, { canalId: FORUM })).status, 200)
  assert.equal((await req('GET', '/api/carteira/topicos', 2)).status, 403)
  const r = await req('GET', '/api/carteira/topicos', 1)
  assert.equal(r.status, 200)
  assert.ok(r.body.topicos.some(t => t.id === ARQUIVADO))
  assert.ok(!r.body.topicos.some(t => t.nome === 'De outro canal'))           // tópico de outro canal fica de fora
  const doMembro = data.membros[0].discordThreadId
  const antes = topicos.get(ARQUIVADO).length
  const p = await req('POST', '/api/carteira/postar', 1, { membroId: 1, imagem: PNG, topicoId: ARQUIVADO })
  assert.equal(p.status, 200); assert.equal(p.body.novoTopico, false)
  assert.equal(topicos.get(ARQUIVADO).length, antes + 1)
  assert.equal(data.membros[0].discordThreadId, doMembro)                     // tópico do membro não muda
  // Tópico de outro canal ou inventado: recusado (nada é postado)
  await zerar()
  assert.equal((await req('POST', '/api/carteira/postar', 1, { membroId: 1, imagem: PNG, topicoId: '579999999999999999' })).status, 400)
  assert.equal((await req('POST', '/api/carteira/postar', 1, { membroId: 1, imagem: PNG, topicoId: 'abc' })).status, 400)
  // Tópico escolhido sumiu no Discord: avisa e NÃO cria outro no lugar
  const criados = chamadas.filter(c => c === `POST /channels/${FORUM}/threads`).length
  topicos.delete(ARQUIVADO)
  const sumiu = await req('POST', '/api/carteira/postar', 1, { membroId: 1, imagem: PNG, topicoId: ARQUIVADO })
  assert.equal(sumiu.status, 502)                                            // Discord não achou o tópico: avisa
  assert.equal(chamadas.filter(c => c === `POST /channels/${FORUM}/threads`).length, criados)
})
