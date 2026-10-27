// Arquivos (imagens do anúncio, escopo) numa pasta temporária, apagada no fim
const pastaTeste = require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'du-ranking-'))
process.env.DATA_PATH = require('node:path').join(pastaTeste, 'data.json')
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { buildSnapshot, winRate, periodStart, filtersSchema, listPage, publicMember } = require('../dist/modules/ranking/service')
const { bindDataScope, scopeKey } = require('../dist/modules/ranking/scope')
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
test('QRU convencional (sem resultado) pontua, mas não conta vitória nem derrota', () => {
  const data = makeData()
  const conv = action(1, [1]); delete conv.resultado; conv.tipo = 'convencional'
  const semTipo = action(2, [1]); delete semTipo.resultado   // registro antigo sem resultado → fora
  data.acoes = [conv, semTipo]
  const row = build(data).members.find(m => m.id === 1)
  assert.equal(row.points, 1); assert.equal(row.wins, 0); assert.equal(row.losses, 0)
  assert.equal(row.activity[0].result, 'Convencional')
})
test('visão pública: dev aparece em Membros, fora do ranking e dos totais; o painel continua com todos', () => {
  const data = makeData()   // conta 1 é a dona → dev
  const pub = buildSnapshot(data, scope, 'all', now, true)
  const devPub = pub.members.find(m => m.id === 1)
  assert.ok(devPub)                                   // aparece em Membros da tela inicial
  assert.equal(devPub.records, 0); assert.equal(devPub.rank, null)   // sem pontuação pública
  assert.equal(pub.ranking.some(m => m.id === 1), false)
  assert.equal(pub.stats.records, 2)   // ação 2 só tinha o dev
  assert.equal(pub.stats.losses, 0)
  assert.equal(pub.ranking[0].rank, 1)
  const painel = build(data)
  assert.equal(painel.members.some(m => m.id === 1), true)
  assert.equal(painel.stats.records, 3)
  // cargo marcado como dev: aparece em Membros, mas sai do ranking
  data.cargosPermissao[1].dev = true
  const comCargoDev = buildSnapshot(data, scope, 'all', now, true)
  assert.equal(comCargoDev.members.some(m => m.id === 2), true)
  assert.equal(comCargoDev.ranking.some(m => m.id === 2), false)
})
test('presença: sem o bot acompanhando, o público recebe online null (sem bolinha)', () => {
  assert.equal(publicMember(build().members[1]).online, null)
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
  const data = makeData(); data.cargosPermissao[1].nome = '(DU) Officer'
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
test('escopo: a pasta de dados vincula o servidor uma vez e recusa troca de guild ou bot', async () => {
  bindDataScope(scope)
  bindDataScope(scope)
  assert.throws(() => bindDataScope({ ...scope, guildId: 'foreign' }), /outro servidor/)
  assert.throws(() => bindDataScope({ ...scope, botId: 'foreign' }), /outro servidor/)
  const path = require('node:path')
  assert.deepEqual(JSON.parse(require('node:fs').readFileSync(path.join(pastaTeste, 'escopo.json'), 'utf8')), scope)
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
  app.use('/api/acoes', require('../dist/routes/acoes').default)
  app.use('/api/anuncio', require('../dist/routes/anuncioImagem').uploadRouter)
  app.use('/img', require('../dist/routes/anuncioImagem').publicoRouter)
  app.use('/api/avisos', require('../dist/routes/avisos').default)
  global.setInterval = originalInterval
  app.use((_err, _req, res, _next) => res.status(500).json({ error: 'Erro interno do servidor' }))
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => { timers.forEach(clearInterval); return new Promise(resolve => server.close(resolve)).then(() => require('node:fs').rmSync(pastaTeste, { recursive: true, force: true })) })

test('responsável da apreensão vem da sessão, nunca do nome enviado pelo cliente', async () => {
  const original = structuredClone(data)
  try {
    data.nextAcId = 900
    data.contas[0].nomeServidor = 'Oficial do servidor'
    data.qrus = ['QRU-1', 'Registradora']
    data.qrusFechados = ['QRU-1']
    const postar = body => fetch(base + '/api/acoes', {
      method: 'POST', headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: '2026-09-17', participants: [], ...body }),
    })
    // Tipo tem que bater com o QRU; convencional não tem resultado; fechado exige
    assert.equal((await postar({ qru: 'QRU-1', tipo: 'convencional' })).status, 400)
    assert.equal((await postar({ qru: 'Registradora', tipo: 'convencional', resultado: 'Vitória' })).status, 400)
    assert.equal((await postar({ qru: 'QRU-1', tipo: 'fechado' })).status, 400)
    assert.equal((await postar({ qru: 'Inexistente', tipo: 'convencional' })).status, 400)
    const response = await postar({ qru: 'QRU-1', tipo: 'fechado', resultado: 'Vitória', comandante: 'Outra pessoa' })
    assert.equal(response.status, 201)
    const created = await response.json()
    assert.equal(created.comandante, 'Oficial do servidor')
    assert.equal(created.criadoPorContaId, 1)
    assert.equal(data.acoes.find(a => a.id === 900).comandante, 'Oficial do servidor')
    // discordId de participante do servidor nunca sai da API
    data.acoes.find(a => a.id === 900).participantesExtras = [{ nome: 'Visitante', discordId: '123456789012345678' }]
    const lista = await get('/api/acoes?limit=200')
    assert.equal(lista.status, 200)
    assert.ok(!JSON.stringify(lista.body).includes('123456789012345678'))
    assert.equal(lista.body.acoes.find(a => a.id === 900).participantesExtras[0].nome, 'Visitante')
    const conv = await postar({ qru: 'Registradora', tipo: 'convencional' })
    assert.equal(conv.status, 201)
    const convBody = await conv.json()
    assert.equal(convBody.tipo, 'convencional')
    assert.equal(convBody.resultado, undefined)
    data.cargosPermissao.find(c => c.id === 20).permissoes = { registrar_acao: { ver: true, editar: true } }
    const members = await get('/api/membros', token(2))
    assert.equal(members.status, 200)
    const officer = members.body.find(m => m.id === 1)
    assert.equal(officer.nomeServidor, 'Oficial do servidor')
    assert.equal(officer.discordId, undefined)
  } finally {
    data = original; revision++
  }
})

test('placar de apreensões conta só as aprovadas e a rota pública expõe só nome e total', async () => {
  const original = structuredClone(data)
  const { calcularRanking } = require('../dist/apreensoes')
  try {
    const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
    data.acoes = [{ id: 1, data: hoje, qru: 'X', tipo: 'convencional', participants: [{ memberId: 1, patenteUnidade: '' }],
      status: 'aprovada', aprovadaEm: new Date(Date.now() - 60_000).toISOString() },
      { id: 2, data: hoje, qru: 'X', tipo: 'convencional', participants: [{ memberId: 1, patenteUnidade: '' }], status: 'pendente' }]
    delete data.painelApreensoes; delete data.historicoRankings
    assert.equal(calcularRanking(data).total, 1)
    // Corte (reset antigo gravado) tira do placar o que foi aprovado antes dele
    data.painelApreensoes = { resetadoEm: new Date().toISOString() }
    assert.equal(calcularRanking(data).total, 0)
    const pub = await get('/api/public/ranking-historico', null)
    assert.equal(pub.status, 200)
    assert.equal(pub.body.atual.total, 0)
    for (const l of pub.body.atual.linhas) assert.deepEqual(Object.keys(l).sort(), ['nome', 'total'])
  } finally {
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
  // o público não conta ações só de devs, então nunca passa do total do painel
  assert.ok(response.body.stats.records <= stats.body.records)
  assert.equal(response.body.items.some(m => m.id === 1), false)   // conta dona (dev) fora do ranking da tela inicial
  const membros = await get('/api/public/directory/members?limit=100', null)
  assert.equal(membros.body.items.some(m => m.id === 1), true)       // …mas aparece em Membros
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

// ── Imagem do Gerar anúncio ──────────────────────────────────────────────────
const { decodificarImagem, MAX_BYTES_IMAGEM } = require('../dist/routes/anuncioImagem')
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
test('anúncio: imagem é conferida pelos bytes, não só pelo tipo declarado', () => {
  assert.equal(decodificarImagem(`data:image/png;base64,${PNG_1PX}`).ext, 'png')
  const html = Buffer.from('<html><script>alert(1)</script></html>').toString('base64')
  assert.equal(decodificarImagem(`data:image/png;base64,${html}`), null)          // HTML disfarçado
  assert.equal(decodificarImagem(`data:image/jpeg;base64,${PNG_1PX}`), null)       // tipo trocado
  assert.equal(decodificarImagem(`data:image/svg+xml;base64,${PNG_1PX}`), null)    // SVG pode ter script
  const grande = Buffer.alloc(MAX_BYTES_IMAGEM + 1); Buffer.from(PNG_1PX, 'base64').copy(grande)
  assert.equal(decodificarImagem(`data:image/png;base64,${grande.toString('base64')}`), null)
})
test('anúncio: envio exige login e a permissão de editar anúncio; link público recusa IDs inválidos', async () => {
  const enviar = auth => fetch(base + '/api/anuncio/imagem', { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: JSON.stringify({ imagem: `data:image/png;base64,${PNG_1PX}` }) })
  assert.equal((await enviar(null)).status, 401)
  assert.equal((await enviar(token(2))).status, 403)        // cargo sem a área "anuncio"
  const ok = await enviar(token(1))                           // dono passa
  assert.equal(ok.status, 201)
  const { caminho } = await ok.json()
  assert.match(caminho, /^\/img\/[A-Za-z0-9_-]{24}\.png$/)
  assert.equal((await (await enviar(token(1))).json()).caminho, caminho)   // mesma foto reaproveita o link
  const img = await fetch(base + caminho)
  assert.equal(img.status, 200)
  assert.equal(img.headers.get('x-content-type-options'), 'nosniff')
  assert.equal((await fetch(base + caminho.replace('.png', '.gif'))).status, 404)   // extensão errada
  for (const p of ['/img/../../etc', '/img/curto.png', '/img/AAAAAAAAAAAAAAAAAAAAAAAA.svg', '/img/AAAAAAAAAAAAAAAAAAAAAAAA.png.html'])
    assert.equal((await fetch(base + p)).status, 404, p)
})

// ── Avisos (registros antigos podem ter o vínculo com uma mensagem do Discord) ──
test('avisos: listagem não expõe o vínculo com a mensagem do Discord', async () => {
  data.avisos = [{ id: 1, titulo: 'T', mensagem: 'M', autor: 'a', criadoEm: '2026-09-18T00:00:00Z',
    discord: { canalId: '555555555555555555', mensagemId: '666666666666666666' } }]
  const res = await get('/api/avisos', token(1))
  assert.equal(res.status, 200)
  assert.equal(res.body.avisos[0].discord, undefined)
  assert.ok(!JSON.stringify(res.body).includes('666666666666666666'))
})

// ── QRUs: qualquer nome, inclusive repetido ───────────────────────────────────
test('QRU: aceita acento, símbolos e nome repetido; remove uma ocorrência por vez', async () => {
  const antigo = { qrus: data.qrus, fechados: data.qrusFechados }
  data.qrus = []; data.qrusFechados = []
  const req = (method, path, body) => fetch(base + '/api/config' + path, { method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token(1)}` }, body: JSON.stringify(body) })
  try {
    const nome = 'Tentativa de homicídio contra ofc / 2ª vez (#1)'
    assert.equal((await req('POST', '/qrus', { nome, tipo: 'fechado' })).status, 201)
    assert.equal((await req('POST', '/qrus', { nome, tipo: 'fechado' })).status, 201)   // repetido
    assert.equal((await req('POST', '/qrus', { nome: 'Fuga', tipo: 'convencional' })).status, 201)
    assert.deepEqual(data.qrus, [nome, nome, 'Fuga'])
    assert.equal((await req('POST', '/qrus', { nome: '   ', tipo: 'convencional' })).status, 400)
    assert.equal((await req('PUT', '/qrus/reorder', { qrus: ['Fuga', nome, nome] })).status, 200)
    assert.equal((await req('PUT', '/qrus/reorder', { qrus: ['Fuga', 'Fuga', nome] })).status, 400)  // não troca itens
    assert.equal((await req('POST', '/qrus/remover', { nome })).status, 200)
    assert.deepEqual(data.qrus, ['Fuga', nome])
    assert.ok(data.qrusFechados.includes(nome))                  // ainda sobra um → tipo mantido
    assert.equal((await req('POST', '/qrus/remover', { nome })).status, 200)
    assert.ok(!data.qrusFechados.includes(nome))
  } finally { data.qrus = antigo.qrus; data.qrusFechados = antigo.fechados }
})
