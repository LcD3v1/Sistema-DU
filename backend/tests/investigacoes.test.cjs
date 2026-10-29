// Registro de Investigação: pedidos com participantes, motivo e local; decisão só pela gestão.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'du-inv-'))
process.env.DATA_PATH = path.join(pasta, 'data.json')
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { makeData, guild } = require('./ranking-fixtures.cjs')

const secret = 'investigacoes-test-secret-with-enough-length-0123456789'
let server, base, data

before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: secret, DISCORD_GUILD_ID: guild, DISCORD_CLIENT_ID: '222222222222222222' })
  data = makeData()
  data.membros[0].codinome = 'Falcão'
  data.cargosPermissao[0].admin = true                                       // conta 1 = admin (gestão)
  const conta = (id, cargo) => ({ id, username: 'c' + id, nivel: 'membro', ativo: true, onboarded: true, membroId: id, cargoPermId: cargo, discordId: String(id).repeat(18) })
  data.contas.push(conta(3, 30), conta(4, 40))
  data.cargosPermissao.find(c => c.id === 20).permissoes = { investigacoes: { ver: true, editar: true } }
  data.cargosPermissao.push({ id: 30, nome: 'Membro', permissoes: { investigacoes: { ver: true, editar: true } } })            // conta 3: fora do pedido
  data.cargosPermissao.push({ id: 40, nome: 'Supervisor', permissoes: { investigacoes: { ver: true, editar: true }, investigacoes_gestao: { ver: true, editar: false } } })   // conta 4: vê todas
  const store = require('../dist/data')
  store.readData = () => structuredClone(data)
  store.peekData = () => data
  store.writeData = next => { data = structuredClone(next) }
  require('../dist/security/audit').audit = () => {}
  const express = require('express')
  const app = express()
  app.use(express.json())
  app.use('/api/investigacoes', require('../dist/routes/investigacoes').default)
  app.use((_err, _req, res, _next) => res.status(500).json({ error: 'Erro interno do servidor' }))
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => new Promise(r => server.close(r)).then(() => fs.rmSync(pasta, { recursive: true, force: true })))

function token(contaId) {
  const { escopoDoToken } = require('../dist/security/escopo')
  const { configuredScope } = require('../dist/modules/ranking/scope')
  return require('../dist/security/jwt').assinarToken({ contaId, username: `c${contaId}`, nivel: 'membro', jti: `jti-${Math.random()}`, sv: 0, scope: escopoDoToken(configuredScope()) })
}
async function req(method, rota, contaId, body) {
  const res = await fetch(base + '/api/investigacoes' + rota, { method, body: body ? JSON.stringify(body) : undefined,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(contaId ? { Authorization: `Bearer ${token(contaId)}` } : {}) } })
  return { status: res.status, body: await res.json().catch(() => null) }
}

const pedido = { nome: 'Operação Corktown', data: '2026-10-29', hora: '21:30', participantes: [2, 1, 2], motivo: 'coleta_info', local: 'ambas' }

test('registro de investigação: validação, privacidade, aprovação da gestão e andamento só do responsável/participantes', async () => {
  assert.equal((await req('GET', '')).status, 401)
  for (const ruim of [
    { ...pedido, participantes: [] },
    { ...pedido, participantes: [999] },
    { ...pedido, local: 'Miami' },
    { ...pedido, motivo: 'qualquer' },
    { ...pedido, data: '29/10/2026' },
    { ...pedido, hora: '25:00' },
    { ...pedido, hora: '9h' },
    { ...pedido, hora: undefined },
    { ...pedido, nome: '   ' },
    { ...pedido, motivo: 'outro' },                                         // "outro" exige detalhes
    { ...pedido, extra: 1 },
  ]) assert.equal((await req('POST', '', 2, ruim)).status, 400, JSON.stringify(ruim))

  const criado = await req('POST', '', 2, pedido)                           // conta 2 = responsável
  assert.equal(criado.status, 201)
  assert.equal(criado.body.aprovacao, 'pendente')
  assert.equal(criado.body.andamento, 'aguardando')
  assert.equal(criado.body.hora, '21:30')
  assert.deepEqual(criado.body.participantes.map(p => p.id), [2, 1])        // sem repetir
  assert.deepEqual(criado.body.participantes.find(p => p.id === 1), { id: 1, codinome: 'Falcão', passaporte: 'P1' })
  assert.equal(criado.body.autorContaId, undefined)
  assert.ok(data.notificacoes.some(n => n.contaId === 1 && n.tipo === 'investigacao'))
  const id = criado.body.id

  // Privado: quem não é responsável/participante não vê nem consegue mexer (404, não revela que existe)
  assert.equal((await req('GET', '', 3)).body.length, 0)
  assert.equal((await req('PUT', `/${id}/andamento`, 3, { andamento: 'em_andamento' })).status, 404)
  assert.equal((await req('GET', '', 4)).body.length, 1)                    // gestão/ver: vê todas
  assert.equal((await req('GET', '', 1)).body.length, 1)                    // admin: vê todas

  // Andamento só depois de autorizada
  assert.equal((await req('PUT', `/${id}/andamento`, 2, { andamento: 'em_andamento' })).status, 400)
  // Aprovação só com gestão/editar
  assert.equal((await req('PUT', `/${id}/aprovacao`, 2, { aprovacao: 'autorizada' })).status, 403)
  assert.equal((await req('PUT', `/${id}/aprovacao`, 4, { aprovacao: 'autorizada' })).status, 403)
  assert.equal((await req('PUT', '/abc/aprovacao', 1, { aprovacao: 'autorizada' })).status, 400)
  assert.equal((await req('PUT', '/999/aprovacao', 1, { aprovacao: 'autorizada' })).status, 404)
  assert.equal((await req('PUT', `/${id}/aprovacao`, 1, { aprovacao: 'pendente' })).status, 400)
  const ok = await req('PUT', `/${id}/aprovacao`, 1, { aprovacao: 'autorizada', observacao: 'Pode seguir.' })
  assert.equal(ok.status, 200)
  assert.equal(ok.body.decididoPor, 'Falcão')
  assert.equal((await req('PUT', `/${id}/aprovacao`, 1, { aprovacao: 'negada' })).status, 400)   // já avaliado
  // Aprovada: já em andamento e com a árvore privada do responsável + participantes
  assert.equal(ok.body.andamento, 'em_andamento')
  const arvore = data.arvores.find(a => a.id === ok.body.arvoreId)
  assert.ok(arvore)
  assert.deepEqual([...arvore.participantes].sort(), [1, 2])
  assert.equal(arvore.criadoPorId, 2); assert.equal(arvore.investigacaoId, id)
  assert.equal((await req('GET', '', 2)).body[0].arvoreId, arvore.id)
  assert.equal((await req('GET', '', 4)).body[0].arvoreId, null)            // vê o pedido (gestão), mas não está na árvore
  // Módulo de aprovações: só quem aprova
  assert.equal((await req('GET', '/aprovacoes', 4)).status, 403)
  assert.equal((await req('GET', '/aprovacoes', 2)).status, 403)
  assert.equal((await req('GET', '/aprovacoes', 1)).body.length, 1)

  // Responsável e participante mudam o andamento; quem só vê (gestão) não
  const r1 = await req('PUT', `/${id}/andamento`, 2, { andamento: 'pausada', nota: 'Pausamos.' })
  assert.equal(r1.status, 200)
  assert.equal(r1.body.podeAtualizar, true)
  assert.equal((await req('PUT', `/${id}/andamento`, 2, { andamento: 'pausada' })).status, 400)
  assert.equal((await req('PUT', `/${id}/andamento`, 1, { andamento: 'em_andamento' })).status, 200)    // participante
  assert.equal((await req('PUT', `/${id}/andamento`, 4, { andamento: 'concluida' })).status, 403)
  assert.equal((await req('PUT', `/${id}/andamento`, 2, { andamento: 'qualquer' })).status, 400)
  const hist = (await req('GET', '', 2)).body[0].historico
  assert.deepEqual(hist.map(h => [h.de, h.para]), [['aguardando', 'em_andamento'], ['em_andamento', 'pausada'], ['pausada', 'em_andamento']])
  assert.equal(hist[1].nota, 'Pausamos.')
  assert.equal((await req('GET', '', 4)).body[0].podeAtualizar, false)

  // Pedido gravado no formato antigo (campo "status") ainda aparece certo
  data.registrosInvestigacao.push({ id: 50, nome: 'Antigo', data: '2026-10-01', participantes: [3], motivo: 'info', detalhes: '', local: 'capital',
    status: 'concluida', autorContaId: 3, autorNome: 'c3', criadoEm: '2026-10-01T00:00:00.000Z' })
  const antigo = (await req('GET', '', 3)).body.find(r => r.id === 50)
  assert.equal(antigo.aprovacao, 'autorizada'); assert.equal(antigo.andamento, 'concluida'); assert.equal(antigo.status, undefined) ; assert.equal(antigo.hora, null)

  assert.equal((await req('DELETE', `/${id}`, 2)).status, 403)
  assert.equal((await req('DELETE', `/${id}`, 1)).status, 200)
  assert.equal((await req('GET', '', 1)).body.length, 1)
})
