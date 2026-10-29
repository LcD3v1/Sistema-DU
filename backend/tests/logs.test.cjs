// Logs do painel: eventos do site + registro de auditoria do Discord + entradas/saídas. Discord simulado.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'du-logs-'))
process.env.DATA_PATH = path.join(pasta, 'data.json')
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { makeData, guild } = require('./ranking-fixtures.cjs')

const BOT = '222222222222222222'
const A = '333333333333333333'
const MOD = '750000000000000001'
const ALVO = '750000000000000002'
const NOVATO = '750000000000000003'
const R_DET = '760000000000000001'
const CANAL = '770000000000000001'
const HASH = 'b'.repeat(32)
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)])
let server, base, data
let auditoria = { status: 200 }
let membros = [{ user: { id: ALVO, username: 'alvo' } }]
const cdn = []

const fetchReal = globalThis.fetch
globalThis.fetch = async (url, init = {}) => {
  const u = String(url)
  if (u.startsWith('https://cdn.discordapp.com/')) { cdn.push(u); return new Response(PNG, { status: 200, headers: { 'Content-Type': 'image/png' } }) }
  if (!u.startsWith('https://discord.com/')) return fetchReal(url, init)
  const rota = u.replace('https://discord.com/api/v10', '')
  const json = (s, b) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
  if (rota === `/guilds/${guild}?with_counts=true`) return json(200, { id: guild, name: 'Detective Unit' })
  if (rota === `/guilds/${guild}/emojis`) return json(200, [])
  if (rota === '/users/@me') return json(200, { id: BOT, username: 'Bot', avatar: null })
  if (rota === `/guilds/${guild}/roles`) return json(200, [{ id: guild, name: '@everyone', position: 0, permissions: '0' }, { id: R_DET, name: 'Detective', position: 1, permissions: '0' }])
  if (rota === `/guilds/${guild}/channels`) return json(200, [{ id: CANAL, name: 'geral', type: 0, position: 0 }])
  if (rota === `/guilds/${guild}/audit-logs?limit=100`) {
    if (auditoria.status !== 200) return json(auditoria.status, { code: 50013 })
    return json(200, {
      users: [{ id: MOD, username: 'moderador', global_name: 'Mod Chefe', avatar: HASH }, { id: ALVO, username: 'alvo', global_name: 'Fulano' }],
      audit_log_entries: [
        { id: '1200000000000000002', action_type: 25, user_id: MOD, target_id: ALVO, changes: [{ key: '$add', new_value: [{ id: R_DET, name: 'Detective' }] }] },
        { id: '1200000000000000001', action_type: 24, user_id: MOD, target_id: ALVO, reason: 'ajuste', changes: [{ key: 'nick', old_value: 'Velho', new_value: 'Novo' }] },
        { id: '1200000000000000003', action_type: 72, user_id: MOD, target_id: ALVO, options: { channel_id: CANAL, count: '1' } },
      ],
    })
  }
  if (rota.startsWith(`/guilds/${guild}/members?limit=1000`)) return json(200, membros)
  return json(404, {})
}

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: 'test', JWT_SECRET: 'logs-test-secret-with-enough-length-0123456789abcd',
    DISCORD_CLIENT_ID: BOT, DISCORD_CLIENT_SECRET: 'segredo-teste', DISCORD_BOT_TOKEN: 'token-teste',
    DISCORD_GUILD_ID: guild, DISCORD_REDIRECT_URI: 'http://127.0.0.1/api/auth/discord/callback', DISCORD_DONO_ID: A,
  })
  data = makeData()
  data.cargosPermissao[0].admin = true                         // conta 1 admin; conta 2 sem a área logs
  data.contas[0].avatar = 'data:image/png;base64,' + PNG.toString('base64')
  const store = require('../dist/data')
  store.readData = () => structuredClone(data)
  store.peekData = () => data
  store.writeData = next => { data = structuredClone(next) }
  require('../dist/logs').iniciarLogs()
  require('../dist/logs')._zerarLogs()
  const express = require('express')
  const app = express()
  app.use(express.json())
  app.use('/api/logs', require('../dist/routes/logs').default)
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
async function req(rota, contaId) {
  const res = await fetch(base + rota, { headers: contaId ? { Authorization: `Bearer ${token(contaId)}` } : {} })
  const tipo = res.headers.get('content-type') ?? ''
  return { status: res.status, tipo, body: tipo.includes('json') ? await res.json() : await res.arrayBuffer() }
}

test('site: ações viram logs por categoria com quem fez e o detalhe; eventos técnicos ficam de fora', async () => {
  const { audit } = require('../dist/security/audit')
  audit('MEMBRO_UPDATED', { ip: '1.2.3.4', headers: {}, user: { contaId: 1, username: 'comando' } }, 'Raven (#1)\nsetor: — → COD')
  audit('RANKING_VIEW', { ip: '1.2.3.4', headers: {}, user: { contaId: 1, username: 'comando' } }, 'x')
  audit('TOKEN_REFRESHED', undefined, 'x')
  assert.equal((await req('/api/logs')).status, 401)
  assert.equal((await req('/api/logs', 2)).status, 403)                    // sem a área "logs"
  const r = await req('/api/logs?origem=site', 1)
  assert.equal(r.status, 200)
  assert.equal(r.body.logs.length, 1)
  const [l] = r.body.logs
  assert.equal(l.categoria, 'Membros'); assert.equal(l.acao, 'Editou membro')
  assert.deepEqual(l.detalhes, ['Raven (#1)', 'setor: — → COD'])
  assert.ok(l.ator.nome && l.ator.avatar && !('contaId' in l.ator))
  assert.ok(!JSON.stringify(r.body).includes('1.2.3.4'))                // IP não sai
  // Avatar da conta (data URL) servido pelo backend, conferido pelos bytes
  const av = await req(`/api/logs/avatar/${l.ator.avatar}`, 1)
  assert.equal(av.status, 200); assert.equal(av.tipo, 'image/png')
  assert.equal((await req(`/api/logs/avatar/${l.ator.avatar}`, 2)).status, 403)
  assert.equal((await req('/api/logs/avatar/..%2F..%2Fetc', 1)).status, 400)
})

test('Discord: registro de auditoria vira logs legíveis (sem IDs) e não repete; avatar pelo backend', async () => {
  const { coletarDoDiscord } = require('../dist/logs')
  await coletarDoDiscord()
  await coletarDoDiscord()                                                // mesma rodada de novo: não duplica
  const r = await req('/api/logs?origem=discord', 1)
  const doRegistro = r.body.logs.filter(l => l.categoria !== 'Entradas e saídas')
  assert.deepEqual(doRegistro.map(l => l.acao), ['Apagou mensagem', 'Alterou cargos de membro', 'Alterou membro'])
  const cargos = doRegistro.find(l => l.acao === 'Alterou cargos de membro')
  assert.equal(cargos.ator.nome, 'Mod Chefe'); assert.equal(cargos.alvo, 'Fulano'); assert.equal(cargos.categoria, 'Membros do servidor')
  assert.deepEqual(cargos.detalhes, ['Cargo adicionado: @Detective'])
  assert.deepEqual(doRegistro.find(l => l.acao === 'Alterou membro').detalhes, ['Apelido: Velho → Novo', 'Motivo: ajuste'])
  assert.deepEqual(doRegistro.find(l => l.acao === 'Apagou mensagem').detalhes, ['Canal: #geral', 'Quantidade: 1'])
  assert.ok(!/\d{17,20}/.test(JSON.stringify(r.body)), 'nenhum ID do Discord na resposta')
  const av = await req(`/api/logs/avatar/${cargos.ator.avatar}`, 1)
  assert.equal(av.status, 200)
  assert.ok(cdn.some(u => u.startsWith(`https://cdn.discordapp.com/avatars/${MOD}/${HASH}.png`)))
  const cats = await req('/api/logs/categorias', 1)
  assert.ok(cats.body.categorias.some(c => c.origem === 'discord' && c.categoria === 'Mensagens'))
  assert.equal(cats.body.discord.erro, null)
})

test('Discord: quem entrou e saiu do servidor; sem permissão de ver o registro avisa', async () => {
  const { coletarDoDiscord } = require('../dist/logs')
  const { esquecerCacheDiscord } = require('../dist/discord')
  membros = [{ user: { id: NOVATO, username: 'novato', global_name: 'Novato' } }]   // ALVO saiu, NOVATO entrou
  esquecerCacheDiscord()
  await coletarDoDiscord()
  const r = await req('/api/logs?categoria=' + encodeURIComponent('Entradas e saídas'), 1)
  const acoes = r.body.logs.map(l => `${l.ator.nome}: ${l.acao}`)
  assert.ok(acoes.includes('Novato: Entrou no servidor'), acoes.join(' | '))
  assert.ok(acoes.some(a => a.endsWith('Saiu do servidor')), acoes.join(' | '))
  auditoria = { status: 403 }
  esquecerCacheDiscord()
  await coletarDoDiscord()
  assert.equal((await req('/api/logs/categorias', 1)).body.discord.erro, 'sem_acesso')
  // Busca e filtro por categoria
  assert.ok((await req('/api/logs?busca=apelido', 1)).body.logs.every(l => l.detalhes.join(' ').toLowerCase().includes('apelido')))
})
