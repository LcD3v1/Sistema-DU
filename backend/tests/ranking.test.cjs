const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { buildSnapshot, winRate, periodStart, filtersSchema, listPage, publicMember } = require('../dist/modules/ranking/service')
const { bindDatabaseScope, scopeKey } = require('../dist/modules/ranking/scope')
const { scope, guild, bot, member, action, makeData } = require('./ranking-fixtures.cjs')
const now = new Date('2026-09-17T16:00:00Z')

test('segurança: usuário comum não pode assumir outro perfil', async () => {
  const res = await fetch(base + '/api/auth/me/membro', {
    method: 'PUT', headers: { Authorization: `Bearer ${token(2)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ membroId: 3 }),
  })
  assert.equal(res.status, 403)
  assert.equal(data.contas[1].membroId, 2)
})

test('segurança: sem permissão não recebe dados privados de terceiros', async () => {
  const old = data.cargosPermissao[1].permissoes.membros.ver
  data.cargosPermissao[1].permissoes.membros.ver = false
  try {
    const result = await get('/api/membros', token(2))
    assert.equal(result.status, 200)
    const other = result.body.find(m => m.id === 1)
    for (const field of ['passaporte', 'discordId', 'advertencias', 'historicoCargos', 'contaId']) assert.equal(other[field], undefined)
    assert.equal(result.body.find(m => m.id === 2).passaporte, 'P2')
  } finally { data.cargosPermissao[1].permissoes.membros.ver = old }
})

test('segurança: OAuth vinculado ao navegador e troca única sem JWT na URL', async () => {
  process.env.DISCORD_CLIENT_SECRET = 'test-only'
  process.env.DISCORD_REDIRECT_URI = 'http://localhost/api/auth/discord/callback'
  process.env.DISCORD_OWNER_ID = '333333333333333333'
  const originalFetch = global.fetch
  try {
    const start = await originalFetch(base + '/api/auth/discord', { redirect: 'manual' })
    const state = new URL(start.headers.get('location')).searchParams.get('state')
    const cookie = start.headers.get('set-cookie').split(';')[0]
    assert.match(start.headers.get('set-cookie'), /HttpOnly/i)
    const denied = await originalFetch(base + `/api/auth/discord/callback?code=fake&state=${state}`, { redirect: 'manual' })
    assert.match(denied.headers.get('location'), /reason=discord_erro/)
    global.fetch = async (url, options) => {
      if (String(url) === 'https://discord.com/api/oauth2/token') return new Response(JSON.stringify({ access_token: 'synthetic-test-token' }))
      if (String(url) === 'https://discord.com/api/users/@me') return new Response(JSON.stringify({ id: '333333333333333333', username: 'comando' }))
      return originalFetch(url, options)
    }
    const callback = await originalFetch(base + `/api/auth/discord/callback?code=fake&state=${state}`, { redirect: 'manual', headers: { Cookie: cookie } })
    const location = new URL(callback.headers.get('location'))
    assert.equal(location.search, '')
    assert.ok(!location.href.includes('token='))
    const code = new URLSearchParams(location.hash.slice(1)).get('code')
    assert.ok(code)
    const exchange = (binding) => originalFetch(base + '/api/auth/discord/exchange', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: binding }, body: JSON.stringify({ code }),
    })
    assert.equal((await exchange('')).status, 400)
    const valid = await exchange(cookie)
    assert.equal(valid.status, 200)
    const session = await valid.json()
    assert.equal(jwt.verify(session.token, secret).contaId, 1)
    assert.equal(session.binding, undefined)
    assert.equal((await exchange(cookie)).status, 400)
  } finally {
    global.fetch = originalFetch
    delete process.env.DISCORD_CLIENT_SECRET
    delete process.env.DISCORD_OWNER_ID
  }
})

test('segurança: logs removem segredos e DTO público descarta campos desconhecidos', () => {
  const { redact } = require('../dist/security/redact')
  const text = redact(`${secret} mongodb://user:synthetic-password@host/db Bearer abc.def.ghi ${token()}`)
  for (const value of [secret, 'synthetic-password', 'abc.def.ghi', 'eyJ']) assert.ok(!text.includes(value))
  assert.equal(publicMember({ ...build().members[0], password: 'synthetic' }).password, undefined)
})
const build = (data = makeData(), period = 'all') => buildSnapshot(data, scope, period, now)

test('Win Rate: vitórias / (vitórias + derrotas), incluindo zero', () => {
  assert.equal(winRate(0, 0), 0)
  assert.equal(winRate(15, 6), 71)
  assert.equal(winRate(0, 2), 0)
  assert.equal(winRate(4, 0), 100)
  assert.equal(build().members[0].winRate, 50) // Empate does not affect the denominator.
})
test('ranking ordenado por pontos, vitórias e posições únicas', () => {
  const rows = build().ranking
  assert.deepEqual(rows.map(m => m.id), [1, 2, 3])
  assert.deepEqual(rows.map(m => m.rank), [1, 2, 3])
})
test('desempate por data e depois ID é independente da ordem no banco', () => {
  const data = makeData()
  data.acoes = [action(1, [2, 3]), action(2, [1], { data: '2026-09-16' })]
  data.membros.reverse()
  assert.deepEqual(build(data).ranking.map(m => m.id), [1, 2, 3])
})
test('desempate favorece vitórias e Win Rate real', () => {
  const data = makeData()
  data.acoes = [action(1, [1, 2, 3]), action(2, [1], { resultado: 'Derrota' }),
    action(3, [2], { resultado: 'Empate' }), action(4, [3])]
  assert.deepEqual(build(data).ranking.map(m => m.id), [3, 2, 1])
})
test('7/15/30 dias usam dias inclusivos no fuso da unidade', () => {
  assert.equal(periodStart('7d', now), '2026-09-11')
  assert.equal(periodStart('15d', now), '2026-09-03')
  assert.equal(periodStart('30d', now), '2026-08-19')
  assert.equal(periodStart('7d', new Date('2026-09-17T01:00:00Z')), '2026-09-10')
  const data = makeData()
  data.acoes = ['2026-09-17', '2026-09-11', '2026-09-10', '2026-09-03', '2026-08-19', '2026-08-18']
    .map((date, i) => action(i, [1], { data: date }))
  assert.deepEqual(['all', '7d', '15d', '30d'].map(p => build(data, p).stats.records), [6, 2, 4, 5])
})
test('mudança de período altera registros, conquistas e posições', () => {
  const data = makeData()
  data.acoes = [action(1, [1]), action(2, [2], { data: '2026-08-01' }), action(3, [2], { data: '2026-08-02' })]
  assert.equal(build(data).ranking[0].id, 2)
  assert.equal(build(data, '7d').ranking[0].id, 1)
  assert.equal(build(data, '7d').stats.achievements, 1)
})
test('não conta ações pendentes, futuras ou resultados inválidos; legado aprovado é aceito', () => {
  const data = makeData()
  data.acoes = [action(1, [1], { status: 'pendente' }), action(2, [1], { data: '2099-01-01' }),
    action(3, [1], { resultado: '???' }), action(4, [1], { status: undefined })]
  assert.equal(build(data).stats.records, 1)
})
test('participante duplicado não duplica pontuação', () => {
  const data = makeData(); data.acoes = [action(1, [1, 1, 1])]
  assert.equal(build(data).ranking[0].points, 1)
})
test('membro sem atividade e sem nível informado tem nível 0, WR zero e posição nula', () => {
  const row = build().members.find(m => m.id === 4)
  assert.equal(row.level, 0); assert.equal(row.winRate, 0); assert.equal(row.rank, null)
  assert.equal(row.achievements.length, 0)
})
test('inativos, removidos, contas desativadas e exonerados não entram no ranking ativo', () => {
  for (const kind of ['inativo', 'removido', 'desativado', 'exonerado']) {
    const data = makeData()
    if (kind === 'inativo') data.membros[0].status = 'Inativo'
    if (kind === 'removido') data.membros.shift()
    if (kind === 'desativado') data.contas[0].ativo = false
    if (kind === 'exonerado') data.contas[0].exonerado = true
    assert.equal(build(data).ranking.some(m => m.id === 1), false, kind)
    assert.equal(data.acoes.length, 3)
  }
})
test('isolamento: linhas e atividades de outra guild/bot nunca aparecem', () => {
  const data = makeData()
  data.membros.push(member(99, { guildId: 'foreign' }))
  data.acoes.push(action(99, [1, 99], { guildId: 'foreign' }), action(100, [1], { botId: 'foreign' }))
  data.contas.push({ id: 99, membroId: 4, guildId: 'foreign', ativo: true })
  const value = build(data)
  assert.equal(value.members.some(m => m.id === 99 || m.id === 4), false)
  assert.equal(value.stats.records, 3)
  assert.equal(value.ranking[0].records, 3)
})
test('hierarquia usa ordem configurada, não ordem alfabética', () => {
  const data = makeData(); data.cargosPermissao[0].nome = 'Zulu'; data.cargosPermissao[1].nome = 'Alpha'
  assert.deepEqual(build(data).roles.slice(0, 2).map(r => r.name), ['Zulu', 'Alpha'])
  data.cargosPermissao.reverse()
  assert.equal(build(data).members[0].id, 2)
})
test('patente interna equivalente reutiliza o cargo configurado sem duplicar grupos', () => {
  const data = makeData(); data.cargosPermissao[1].nome = '(FAST) Officer'
  const value = build(data)
  assert.equal(value.roles.length, 2)
  assert.equal(value.members.find(m => m.id === 3).roleId, '20')
})
test('datas inválidas e registros incompletos não quebram o ranking', () => {
  const data = makeData()
  data.acoes.push(action(40, [1], { data: '2026-02-31' }), action(41, [1], { participants: undefined }))
  assert.equal(build(data).stats.records, 3)
})
test('pesquisa por nome, Discord ID, ID interno e cargo; metacaracteres são texto', () => {
  const rows = build().members
  for (const search of ['Membro 1', '333333333333333333', 'P1', 'Commander']) {
    assert.equal(listPage(rows, filtersSchema.parse({ search })).items[0].id, 1)
  }
  assert.equal(listPage(rows, filtersSchema.parse({ search: '.*' })).total, 0)
  assert.equal(listPage(rows, filtersSchema.parse({ search: 'P1' }), true).total, 0)
})
test('paginação e filtro de cargo não recalculam posições', () => {
  const rows = build().ranking
  const page = listPage(rows, filtersSchema.parse({ page: 2, limit: 1 }))
  assert.equal(page.items[0].rank, 2)
  assert.equal(page.total, 3); assert.equal(page.pages, 3)
  assert.equal(listPage(rows, filtersSchema.parse({ role: '20' })).items[0].rank, 2)
  assert.deepEqual(listPage(rows, filtersSchema.parse({ page: 999 })).items, [])
})
test('validação rejeita tenant no navegador, injection, períodos e limites inválidos', () => {
  for (const query of [{ guild_id: guild }, { bot_id: bot }, { tenant_id: 'other' }, { limit: 101 }, { page: 0 },
    { period: '365d' }, { search: 'x'.repeat(101) }, { search: { $ne: '' } }, { page: '1 OR 1=1' }]) {
    assert.equal(filtersSchema.safeParse(query).success, false)
  }
})
test('Top 3 contém no máximo três IDs únicos e não inventa participantes', () => {
  assert.equal(new Set(build().ranking.slice(0, 3).map(m => m.id)).size, 3)
  const data = makeData(); data.acoes = []
  assert.deepEqual(build(data).ranking, [])
})
test('conquistas derivam de atividades válidas; nível é o informado pelo membro; perfil tem histórico limitado', () => {
  const data = makeData(); data.acoes = Array.from({ length: 30 }, (_, i) => action(i + 1, [1]))
  data.membros.find(m => m.id === 1).nivel = 48
  const row = build(data).ranking[0]
  assert.equal(row.level, 48); assert.equal(row.activity.length, 20)
  assert.deepEqual(row.achievements.map(a => a.id), ['first-record', 'ten-wins', 'twenty-five-records'])
})
test('avatar inválido tem fallback e projeção pública não expõe identidade privada', () => {
  const data = makeData(); data.contas[0].avatarServidor = 'javascript:alert(1)'
  const row = build(data).members[0]
  assert.equal(row.avatar, null)
  const preview = publicMember(row)
  assert.equal(preview.discordId, null); assert.equal(preview.internalId, '')
  assert.deepEqual(preview.activity, []); assert.deepEqual(preview.discordRoles, [])
})
test('migration vincula banco uma vez e recusa troca de guild ou bot', async () => {
  let stored
  const db = { collection: () => ({ updateOne: async (_filter, update) => { stored ??= update.$setOnInsert }, findOne: async () => stored }) }
  await bindDatabaseScope(db, scope)
  await bindDatabaseScope(db, scope)
  await assert.rejects(bindDatabaseScope(db, { ...scope, guildId: 'foreign' }), /outro servidor/)
  await assert.rejects(bindDatabaseScope(db, { ...scope, botId: 'foreign' }), /outro servidor/)
  assert.deepEqual(stored, scope)
})

let server, base, data, revision = 0
const auditEvents = []
const timers = []
const jwt = require('jsonwebtoken')
const secret = 'local-test-only-not-a-real-credential-123456789'
function token(id = 1, tokenScope = scopeKey(scope)) {
  return jwt.sign({ contaId: id, username: 'test', nivel: 'membro', scope: tokenScope, jti: require('node:crypto').randomUUID() }, secret, { expiresIn: '1h' })
}
async function get(path, auth = token()) {
  const res = await fetch(base + path, { headers: auth ? { Authorization: `Bearer ${auth}` } : {} })
  return { status: res.status, body: await res.json(), headers: res.headers }
}
before(async () => {
  process.env.NODE_ENV = 'test'
  process.env.DISCORD_EXIGIR_SERVIDOR = 'off'
  process.env.DISCORD_GUILD_ID = guild; process.env.DISCORD_CLIENT_ID = bot; process.env.JWT_SECRET = secret
  delete process.env.DISCORD_BOT_TOKEN
  data = makeData()
  data.acoes.forEach(a => { a.data = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }) })
  const store = require('../dist/data')
  store.readData = () => structuredClone(data)
  store.peekData = () => data
  store.writeData = next => { data = structuredClone(next); revision++ }
  store.dataRevision = () => revision
  require('../dist/security/audit').audit = (...args) => auditEvents.push(args)
  require('../dist/discord/forum').emSegundoPlano = () => {}
  const express = require('express')
  const app = express()
  const originalInterval = global.setInterval
  global.setInterval = (...args) => { const timer = originalInterval(...args); timers.push(timer); return timer }
  const { createRankingRouter } = require('../dist/modules/ranking/router')
  app.use('/api/ranking', createRankingRouter())
  app.use('/api/public/directory', createRankingRouter(true))
  app.use('/api/public', require('../dist/routes/public').default)
  app.use(express.json())
  app.use('/api/membros', require('../dist/routes/membros').default)
  app.use('/api/auth', require('../dist/routes/auth').default)
  app.use('/api/config', require('../dist/routes/config').default)
  global.setInterval = originalInterval
  app.use((_err, _req, res, _next) => res.status(500).json({ error: 'Erro interno do servidor' }))
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => { timers.forEach(clearInterval); return new Promise(resolve => server.close(resolve)) })

test('canal do ranking permanece salvo após consulta e pode ser desvinculado', async () => {
  const original = structuredClone(data)
  const forum = require('../dist/discord/forum')
  const originalConfigured = forum.botConfigurado
  const originalList = forum.listarForuns
  const channelId = '444444444444444444'
  const registro = '555555555555555555'
  forum.botConfigurado = () => true
  forum.listarForuns = async () => [{ id: channelId, name: 'ranking', type: 0 }]
  data.canais = { registro }
  const save = value => fetch(base + '/api/config/canais', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ rankingApreensoes: value }),
  })
  try {
    const saved = await save(channelId)
    assert.equal(saved.status, 200)
    assert.deepEqual((await saved.json()).canais, { registro, rankingApreensoes: channelId })
    assert.deepEqual((await get('/api/config/canais')).body.canais, { registro, rankingApreensoes: channelId })
    assert.equal((await save('invalid')).status, 400)
    assert.equal((await get('/api/config/canais')).body.canais.rankingApreensoes, channelId)
    assert.equal((await save(null)).status, 200)
    assert.deepEqual((await get('/api/config/canais')).body.canais, { registro })
  } finally {
    forum.botConfigurado = originalConfigured
    forum.listarForuns = originalList
    data = original; revision++
  }
})
test('API requer autenticação e sessão da guild/bot correta mesmo com segredo compartilhado', async () => {
  assert.equal((await get('/api/ranking', null)).status, 401)
  assert.equal((await get('/api/ranking', token(1, 'foreign:' + bot))).status, 401)
  assert.equal((await get('/api/ranking', token(1, guild + ':foreign'))).status, 401)
  assert.equal((await get('/api/ranking', token(1, undefined))).status, 200)
  const legacy = jwt.sign({ contaId: 1, username: 'test' }, secret)
  assert.equal((await get('/api/ranking', legacy)).status, 401)
})
test('API impede conta estrangeira, inativa ou sem aprovação', async () => {
  const previous = structuredClone(data)
  data.contas[1].guildId = 'foreign'
  assert.equal((await get('/api/ranking', token(2))).status, 401)
  delete data.contas[1].guildId; data.contas[1].ativo = false
  assert.equal((await get('/api/ranking', token(2))).status, 401)
  data.contas[1].ativo = true; data.contas[1].cargoPermId = undefined
  assert.equal((await get('/api/ranking', token(2))).status, 403)
  data = previous; revision++
})
test('API aplica permissão de membros e bloqueia IDOR', async () => {
  const permission = data.cargosPermissao[1].permissoes.membros.ver
  data.cargosPermissao[1].permissoes.membros.ver = false
  assert.equal((await get('/api/ranking/members', token(2))).status, 403)
  assert.equal((await get('/api/ranking/members/1', token(2))).status, 403)
  data.cargosPermissao[1].permissoes.membros.ver = permission
  assert.equal((await get('/api/ranking/members/999')).status, 404)
  assert.equal((await get('/api/ranking/members/1abc')).status, 400)
  assert.equal((await get('/api/ranking?guild_id=foreign')).status, 400)
})
test('API Guild A nunca recebe membro/ação Guild B, nem via perfil', async () => {
  data.membros.push(member(99, { guildId: 'foreign', policial: 'SECRET_GUILD_B' }))
  data.acoes.push(action(99, [99, 1], { guildId: 'foreign' })); revision++
  const response = await get('/api/ranking')
  assert.equal(response.status, 200)
  assert.equal(JSON.stringify(response.body).includes('SECRET_GUILD_B'), false)
  assert.equal((await get('/api/ranking/members/99')).status, 404)
  assert.equal((await get('/api/public/directory/members/99', null)).status, 404)
})
test('API cache é invalidado após registro/alteração de membro', async () => {
  const before = await get('/api/ranking')
  data.acoes.push(action(200, [2], { data: new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }) })); revision++
  const after = await get('/api/ranking')
  assert.equal(after.body.stats.records, before.body.stats.records + 1)
  assert.notEqual(after.body.revision, before.body.revision)
  assert.equal(after.headers.get('cache-control'), 'private, no-store')
  assert.ok(after.headers.get('ratelimit'))
})
test('API pública preserva preview, paginação e remove detalhes privados', async () => {
  const response = await get('/api/public/directory?limit=1', null)
  assert.equal(response.status, 200); assert.equal(response.body.items.length, 1)
  assert.equal(response.body.items[0].discordId, null)
  assert.deepEqual(response.body.items[0].activity, [])
  const stats = await get('/api/ranking/stats')
  assert.equal(stats.body.records, response.body.stats.records)
  assert.equal((await get('/api/public/ranking?window=invalid', null)).status, 400)
})
test('auditoria registra consultas e recálculos sem credenciais', async () => {
  assert.equal((await get('/api/ranking/members/1')).status, 200)
  for (const event of ['RANKING_VIEW', 'MEMBER_VIEW', 'RANKING_RECALCULATED']) assert.ok(auditEvents.some(a => a[0] === event))
  assert.equal(JSON.stringify(auditEvents.map(a => [a[0], a[2]])).includes(secret), false)
})
test('saída preserva snapshot/histórico; readmissão recupera o mesmo ID', async () => {
  const original = structuredClone(data)
  const { exonerarMembro } = require('../dist/efetivo')
  const { writeData } = require('../dist/data')
  const account = data.contas.find(c => c.id === 2)
  const historyCount = data.acoes.length
  exonerarMembro(data, data.membros.find(m => m.id === 2), 'Teste', 'Saiu do Discord')
  writeData(data)
  assert.equal(account.membroArquivado.id, 2)
  assert.equal(data.acoes.length, historyCount)
  assert.equal((await get('/api/ranking/members/2')).status, 404)
  const restored = await fetch(base + '/api/membros/exonerados/2/retirar', { method: 'POST', headers: { Authorization: `Bearer ${token()}` } })
  assert.equal(restored.status, 200)
  const onboard = await fetch(base + '/api/auth/onboarding', { method: 'POST', headers: { Authorization: `Bearer ${token(2)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ nivel: 12, policial: 'Operador Teste', badge: '22', passaporte: '222', patenteNPD: 'Officer', patenteInterna: 'Officer' }) })
  assert.equal(onboard.status, 200, await onboard.text())
  assert.equal(data.contas.find(c => c.id === 2).membroId, 2)
  assert.equal(data.membros.filter(m => m.id === 2).length, 1)
  assert.equal(data.acoes.length, historyCount)
  data = original; revision++
})
test('configuração indisponível retorna erro seguro', async () => {
  delete process.env.DISCORD_GUILD_ID
  assert.equal((await get('/api/ranking')).status, 503)
  process.env.DISCORD_GUILD_ID = guild
})
test('falha de persistência suspende as consultas sem vazar detalhes do banco', async () => {
  const store = require('../dist/data')
  store.rankingPersistenceReady = () => false
  const response = await get('/api/ranking')
  assert.equal(response.status, 503)
  assert.deepEqual(response.body, { error: 'Módulo temporariamente indisponível.' })
  assert.equal((await get('/api/public/ranking', null)).status, 503)
  store.rankingPersistenceReady = () => true
})
