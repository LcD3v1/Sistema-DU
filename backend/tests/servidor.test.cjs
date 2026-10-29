// Página "Servidor do Discord": tudo o que o bot lê, sem expor IDs do servidor/bot. API do Discord simulada.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'du-serv-'))
process.env.DATA_PATH = path.join(pasta, 'data.json')
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { makeData, guild } = require('./ranking-fixtures.cjs')

const BOT = '222222222222222222'
const A = '333333333333333333'      // conta 1 (admin)
const B = '444444444444444444'      // conta 2 (Officer, sem a área)
const C = '710000000000000001'      // no servidor, sem conta
const R_CMD = '610000000000000001'
const R_OFF = '610000000000000002'
const CAT = '520000000000000001'
const ICONE = 'a'.repeat(32)
let server, base, data
let intentLigada = true
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)])

const fetchReal = globalThis.fetch
globalThis.fetch = async (url, init = {}) => {
  const u = String(url)
  if (u.startsWith(`https://cdn.discordapp.com/icons/${guild}/${ICONE}.png`)) return new Response(PNG, { status: 200, headers: { 'Content-Type': 'image/png' } })
  if (!u.startsWith('https://discord.com/')) return fetchReal(url, init)
  const json = (s, b) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
  const rota = u.replace('https://discord.com/api/v10', '')
  const membro = (id, roles, extra = {}) => ({ user: { id, username: `u${id.slice(0, 3)}`, global_name: `Nome ${id.slice(0, 3)}`, avatar: 'b'.repeat(32) }, roles, joined_at: '2026-01-02T03:04:05.000Z', ...extra })
  if (rota === `/guilds/${guild}?with_counts=true`) return json(200, { id: guild, name: 'Detective Unit', description: 'Servidor da DU', icon: ICONE, banner: null,
    approximate_member_count: 42, approximate_presence_count: 7, premium_tier: 2, premium_subscription_count: 9, owner_id: A })
  if (rota === `/guilds/${guild}/roles`) return json(200, [
    { id: guild, name: '@everyone', position: 0 },
    { id: R_CMD, name: 'Commander', position: 3, color: 0xff0000, hoist: true, icon: 'c'.repeat(32) },
    { id: R_OFF, name: 'Officer', position: 2, unicode_emoji: '⭐' },
    { id: '610000000000000009', name: 'Bot', position: 1, managed: true }])
  if (rota === `/guilds/${guild}/channels`) return json(200, [
    { id: CAT, name: 'GERAL', type: 4, position: 0 },
    { id: '510000000000000001', name: 'chat', type: 0, position: 1, parent_id: CAT, topic: 'Conversa' },
    { id: '510000000000000002', name: 'Voz 1', type: 2, position: 2, parent_id: CAT },
    { id: '510000000000000003', name: 'avisos', type: 5, position: 0 },
    { id: '510000000000000004', name: 'thread-ignorado', type: 11, position: 3 }])
  if (rota === `/guilds/${guild}/emojis`) return json(200, [{ id: '800000000000000001', name: 'du', animated: false }, { id: '800000000000000002', name: 'gira', animated: true }])
  if (rota === '/users/@me') return json(200, { id: BOT, username: 'Detective Unit', avatar: 'd'.repeat(32) })
  if (rota.startsWith(`/guilds/${guild}/members?`)) {
    if (!intentLigada) return json(403, { code: 50001 })
    return json(200, [membro(A, [R_CMD, R_OFF], { nick: 'Comandante' }), membro(B, [R_OFF]), membro(C, [R_OFF]), { user: { id: BOT, bot: true }, roles: [] }])
  }
  const m = rota.match(/^\/guilds\/\d+\/members\/(\d+)$/)
  if (m) return m[1] === A ? json(200, membro(A, [R_CMD], { nick: 'Comandante' })) : json(404, { code: 10007 })
  return json(404, {})
}

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: 'test', JWT_SECRET: 'servidor-test-secret-with-enough-length-0123456789',
    DISCORD_CLIENT_ID: BOT, DISCORD_CLIENT_SECRET: 'segredo-teste', DISCORD_BOT_TOKEN: 'token-teste',
    DISCORD_GUILD_ID: guild, DISCORD_REDIRECT_URI: 'http://127.0.0.1/api/auth/discord/callback', DISCORD_DONO_ID: A,
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
  app.use('/api/servidor', require('../dist/routes/servidor').default)
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
async function get(rota, contaId) {
  const res = await fetch(base + rota, { headers: contaId ? { Authorization: `Bearer ${token(contaId)}` } : {} })
  const tipo = res.headers.get('content-type') ?? ''
  return { status: res.status, tipo, body: tipo.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) }
}

test('servidor: informações, todos os canais por categoria, cargos completos (com contagem) e emojis', async () => {
  assert.equal((await get('/api/servidor')).status, 401)
  assert.equal((await get('/api/servidor', 2)).status, 403)                 // sem a área
  const r = await get('/api/servidor', 1)
  assert.equal(r.status, 200)
  const s = r.body
  assert.equal(s.nome, 'Detective Unit'); assert.equal(s.descricao, 'Servidor da DU')
  assert.equal(s.membros, 42); assert.equal(s.online, 7); assert.equal(s.impulsos, 9); assert.equal(s.nivelImpulso, 2)
  assert.equal(s.temIcone, true); assert.equal(s.temBanner, false)
  assert.deepEqual(s.canais.map(g => [g.categoria, g.canais.map(c => `${c.tipo}:${c.nome}`)]),
    [[null, ['anuncios:avisos']], ['GERAL', ['texto:chat', 'voz:Voz 1']]])
  assert.equal(s.totalCanais, 3)
  const cmd = s.cargos.find(c => c.nome === 'Commander')
  assert.equal(cmd.membros, 1); assert.equal(cmd.separado, true); assert.match(cmd.icone, /role-icons/)
  assert.equal(s.cargos.find(c => c.nome === 'Officer').membros, 3)
  assert.equal(s.cargos.find(c => c.nome === 'Officer').emoji, '⭐')
  assert.equal(s.cargos.find(c => c.nome === 'Bot').integracao, true)
  assert.ok(!s.cargos.some(c => c.nome === '@everyone'))
  assert.deepEqual(s.emojis.map(e => e.url), ['https://cdn.discordapp.com/emojis/800000000000000001.png?size=64', 'https://cdn.discordapp.com/emojis/800000000000000002.gif?size=64'])
  assert.equal(s.modoMembros, 'todos')
  // Sem IDs do servidor, do bot nem do dono
  const txt = JSON.stringify(s)
  assert.ok(!txt.includes(guild) && !txt.includes(BOT) && !txt.includes(A) && !txt.includes(ICONE))
})

test('membros: lista com busca só para quem edita a área; mostra quem tem conta no site', async () => {
  data.cargosPermissao[1].permissoes.servidor = { ver: true, editar: false }
  assert.equal((await get('/api/servidor', 2)).status, 200)                 // ver
  assert.equal((await get('/api/servidor/membros', 2)).status, 403)         // ver ≠ editar
  const r = await get('/api/servidor/membros', 1)
  assert.equal(r.status, 200); assert.equal(r.body.total, 3)
  const a = r.body.membros.find(m => m.discordId === A)
  assert.equal(a.apelido, 'Comandante'); assert.equal(a.temConta, true); assert.equal(a.entrouEm, '2026-01-02T03:04:05.000Z')
  assert.equal(r.body.membros.find(m => m.discordId === C).temConta, false)
  assert.ok(!r.body.membros.some(m => m.discordId === BOT))                 // bots não entram
  assert.equal((await get('/api/servidor/membros?q=comand', 1)).body.total, 1)
})

test('eu: mostra o servidor da unidade e os cargos de quem está logado', async () => {
  const r = await get('/api/servidor/eu', 1)
  assert.equal(r.status, 200)
  assert.equal(r.body.servidor, 'Detective Unit'); assert.equal(r.body.membro, true); assert.equal(r.body.apelido, 'Comandante')
  assert.ok(r.body.cargos.some(c => c.nome === 'Commander'))
  assert.equal((await get('/api/servidor/eu')).status, 401)
})

test('imagens: ícone passa pelo backend (sem o ID do servidor na URL); banner exige a área', async () => {
  const r = await get('/api/servidor/imagem/icone', 2)
  assert.equal(r.status, 200); assert.equal(r.tipo, 'image/png'); assert.ok(r.body.equals(PNG))
  assert.equal((await get('/api/servidor/imagem/banner', 1)).status, 404)    // servidor sem banner
  assert.equal((await get('/api/servidor/imagem/../config', 1)).status, 404)
  assert.equal((await get('/api/servidor/imagem/outra', 1)).status, 404)
  delete data.cargosPermissao[1].permissoes.servidor
  assert.equal((await get('/api/servidor/imagem/banner', 2)).status, 403)
})

test('sem "Server Members Intent": contagens e lista só com quem tem conta no site', async () => {
  intentLigada = false
  require('../dist/discord').esquecerCacheDiscord()
  const s = (await get('/api/servidor', 1)).body
  assert.equal(s.modoMembros, 'contas')
  const lista = (await get('/api/servidor/membros', 1)).body
  assert.deepEqual(lista.membros.map(m => m.discordId), [A])                 // B saiu (404) e C não tem conta
})
