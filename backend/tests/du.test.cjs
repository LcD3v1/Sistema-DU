// Testes dos módulos investigativos da DU: Relatórios, Boletins, Inquéritos, Galeria e arquivos.
// Mesmo esquema do ranking.test.cjs: dados em memória, sem Mongo e sem Discord.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const jwt = require('jsonwebtoken')
const { scopeKey } = require('../dist/modules/ranking/scope')
const { scope, guild, bot, makeData } = require('./ranking-fixtures.cjs')

const secret = 'test-secret-with-enough-length-for-ranking-security-0123456789'
let server, base, data

function token(id = 1) {
  return jwt.sign({ contaId: id, username: id === 1 ? 'comando' : 'operador', nivel: 'membro', scope: scopeKey(scope), jti: require('node:crypto').randomUUID() }, secret, { expiresIn: '1h' })
}
async function req(method, path, auth, body) {
  const res = await fetch(base + path, {
    method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const texto = await res.text()
  let json; try { json = JSON.parse(texto) } catch { json = texto }
  return { status: res.status, body: json }
}
const permitir = (areas) => {
  for (const [area, modo] of Object.entries(areas)) data.cargosPermissao[1].permissoes[area] = modo
}

before(async () => {
  process.env.NODE_ENV = 'test'
  process.env.DISCORD_EXIGIR_SERVIDOR = 'off'
  process.env.DISCORD_GUILD_ID = guild; process.env.DISCORD_CLIENT_ID = bot; process.env.JWT_SECRET = secret
  delete process.env.DISCORD_BOT_TOKEN
  data = Object.assign(makeData(), { relatorios: [], boletins: [], inqueritos: [], galeria: [],
    nextRelatorioId: 1, nextBoletimId: 1, nextInqueritoId: 1, nextFotoId: 1 })
  const store = require('../dist/data')
  store.readData = () => structuredClone(data)
  store.peekData = () => data
  store.writeData = next => { data = structuredClone(next) }
  require('../dist/security/audit').audit = () => {}
  const express = require('express')
  const app = express()
  app.use('/api/arquivos', require('../dist/routes/arquivos').default)
  app.use(express.json())
  app.use('/api/relatorios', require('../dist/routes/relatorios').default)
  app.use('/api/boletins', require('../dist/routes/boletins').default)
  app.use('/api/inqueritos', require('../dist/routes/inqueritos').default)
  app.use('/api/galeria', require('../dist/routes/galeria').default)
  app.use((_err, _req, res, _next) => res.status(500).json({ error: 'Erro interno do servidor' }))
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => new Promise(resolve => server.close(resolve)))

const relatorio = (extra = {}) => ({ titulo: 'Vigilância', tipo: 'Campo', data: '2026-10-20', conteudo: 'Fatos apurados.', ...extra })

test('relatórios: exigem login e a área; cadastro grava autor da sessão e numeração', async () => {
  assert.equal((await req('GET', '/api/relatorios', null)).status, 401)
  assert.equal((await req('GET', '/api/relatorios', token(2))).status, 403)
  permitir({ relatorios: { ver: true, editar: false } })
  assert.equal((await req('POST', '/api/relatorios', token(2), relatorio())).status, 403)
  permitir({ relatorios: { ver: true, editar: true } })
  const criado = await req('POST', '/api/relatorios', token(2), relatorio({ autorNome: 'Forjado' }))
  assert.equal(criado.status, 400)                                     // campo desconhecido (strict)
  const ok = await req('POST', '/api/relatorios', token(2), relatorio())
  assert.equal(ok.status, 201)
  assert.match(ok.body.numero, /^REL-DU-\d{4}-0001$/)
  assert.deepEqual(ok.body.investigadores, [2])                        // quem cadastra entra como responsável
  assert.equal(ok.body.autorContaId, undefined)
  assert.equal(ok.body.historico[0].acao, 'criado')
  assert.equal((await req('POST', '/api/relatorios', token(2), relatorio({ investigadores: [999] }))).status, 400)
  assert.equal((await req('POST', '/api/relatorios', token(2), relatorio({ arquivos: ['A'.repeat(24)] }))).status, 400)
})

test('relatórios: sigiloso só para autor/citados/gestão; terceiros não editam', async () => {
  const sig = await req('POST', '/api/relatorios', token(1), relatorio({ titulo: 'Sigiloso', sigiloso: true }))
  assert.equal(sig.status, 201)
  const doComando = await req('POST', '/api/relatorios', token(1), relatorio({ titulo: 'Aberto' }))
  const lista = await req('GET', '/api/relatorios', token(2))
  assert.ok(!lista.body.some(r => r.titulo === 'Sigiloso'))
  assert.ok(lista.body.some(r => r.titulo === 'Aberto' && r.podeEditar === false))
  assert.equal((await req('PUT', `/api/relatorios/${sig.body.id}`, token(2), relatorio())).status, 404)
  assert.equal((await req('PUT', `/api/relatorios/${doComando.body.id}`, token(2), relatorio())).status, 403)
  assert.equal((await req('DELETE', `/api/relatorios/${doComando.body.id}`, token(2))).status, 403)
  // citado no sigiloso passa a ver
  const editado = await req('PUT', `/api/relatorios/${sig.body.id}`, token(1), relatorio({ titulo: 'Sigiloso', sigiloso: true, investigadores: [1, 2] }))
  assert.equal(editado.status, 200)
  assert.equal(editado.body.historico.at(-1).acao, 'editado')
  assert.ok((await req('GET', '/api/relatorios', token(2))).body.some(r => r.titulo === 'Sigiloso'))
  assert.equal((await req('PUT', '/api/relatorios/abc', token(1), relatorio())).status, 400)
})

test('boletins: número único, status no histórico e vínculo some ao excluir inquérito', async () => {
  const bol = { titulo: 'Furto', data: '2026-10-21', descricao: 'Descrição', imagens: ['https://exemplo.com/a.png', 'https://exemplo.com/b.png'] }
  assert.equal((await req('POST', '/api/boletins', token(2), bol)).status, 403)
  assert.equal((await req('POST', '/api/boletins', token(1), { ...bol, imagens: ['javascript:alert(1)'] })).status, 400)
  const inq = await req('POST', '/api/inqueritos', token(1), { titulo: 'Caso X' })
  assert.equal(inq.status, 201)
  assert.match(inq.body.numero, /^IP-DU-\d{4}-0001$/)
  const a = await req('POST', '/api/boletins', token(1), { ...bol, numero: 'BO-77', inqueritoId: inq.body.id })
  assert.equal(a.status, 201)
  assert.equal(a.body.imagens.length, 2)
  assert.equal((await req('POST', '/api/boletins', token(1), { ...bol, numero: 'bo-77' })).status, 409)
  const st = await req('PUT', `/api/boletins/${a.body.id}`, token(1), { ...bol, numero: 'BO-77', status: 'em_investigacao', inqueritoId: inq.body.id })
  assert.equal(st.status, 200)
  assert.equal(st.body.historico.at(-1).acao, 'status')
  assert.equal((await req('DELETE', `/api/inqueritos/${inq.body.id}`, token(1))).status, 200)
  assert.equal(data.boletins.find(b => b.id === a.body.id).inqueritoId, undefined)
})

test('galeria: foto por link ou arquivo; só o autor (ou admin) edita/exclui', async () => {
  permitir({ galeria: { ver: true, editar: true } })
  const foto = { titulo: 'Briefing', data: '2026-10-22' }
  assert.equal((await req('POST', '/api/galeria', token(2), foto)).status, 400)            // sem imagem
  assert.equal((await req('POST', '/api/galeria', token(2), { ...foto, imagem: 'https://x.com/a.png', arquivo: 'A'.repeat(24) })).status, 400)
  const doComando = await req('POST', '/api/galeria', token(1), { ...foto, imagem: 'https://x.com/a.png' })
  assert.equal(doComando.status, 201)
  const lista = await req('GET', '/api/galeria', token(2))
  assert.equal(lista.body[0].podeEditar, false)
  assert.equal(lista.body[0].autorContaId, undefined)
  assert.equal((await req('DELETE', `/api/galeria/${doComando.body.id}`, token(2))).status, 403)
  assert.equal((await req('DELETE', `/api/galeria/${doComando.body.id}`, token(1))).status, 200)
})

test('arquivos: envio exige login + editar a área, confere os bytes e recusa SVG/HTML', async () => {
  const PNG = Buffer.from('89504E470D0A1A0A0000000D49484452', 'hex')
  const enviar = (auth, area, nome, bytes) => fetch(`${base}/api/arquivos?area=${area}&nome=${encodeURIComponent(nome)}`, {
    method: 'POST', body: bytes, headers: { 'Content-Type': 'application/octet-stream', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
  })
  assert.equal((await enviar(null, 'inqueritos', 'a.png', PNG)).status, 401)
  assert.equal((await enviar(token(1), 'config', 'a.png', PNG)).status, 400)            // área fora da lista
  assert.equal((await enviar(token(2), 'inqueritos', 'a.png', PNG)).status, 403)       // sem editar inquéritos
  assert.equal((await enviar(token(1), 'inqueritos', 'a.svg', Buffer.from('<svg onload=x>'))).status, 400)
  assert.equal((await enviar(token(1), 'inqueritos', 'a.html', Buffer.from('<script>'))).status, 400)
  assert.equal((await enviar(token(1), 'inqueritos', 'laudo.pdf', PNG)).status, 400)    // extensão não bate com os bytes
  assert.equal((await enviar(token(1), 'inqueritos', 'foto.png', PNG)).status, 503)     // passa; sem Mongo no teste
  for (const id of ['curto', '../../etc/passwd', 'A'.repeat(25)])
    assert.equal((await req('GET', `/api/arquivos/${encodeURIComponent(id)}`, token(1))).status, 404)
  assert.equal((await req('GET', `/api/arquivos/${'A'.repeat(24)}`, null)).status, 401)
})
