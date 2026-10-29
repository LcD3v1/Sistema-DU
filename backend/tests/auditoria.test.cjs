// Correções da auditoria de segurança (2026-10-29): cada teste reproduz o ataque e confere o bloqueio.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'du-audit-'))
process.env.DATA_PATH = path.join(pasta, 'data.json')
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { makeData, guild, bot } = require('./ranking-fixtures.cjs')

const secret = 'auditoria-test-secret-with-enough-length-0123456789'
const HASH = 'a'.repeat(32)
const URL_DISCORD = `https://cdn.discordapp.com/guilds/${guild}/users/444444444444444444/avatars/${HASH}.png`
let server, base, data

const fetchReal = globalThis.fetch
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://cdn.discordapp.com/')) {
    return new Response(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16, 1)]), { status: 200, headers: { 'Content-Type': 'image/png' } })
  }
  return fetchReal(url, init)
}

before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: secret, DISCORD_GUILD_ID: guild, DISCORD_CLIENT_ID: bot })
  data = makeData()
  data.cargosPermissao.find(c => c.id === 20).permissoes = { membros: { ver: true, editar: true } }   // conta 2: edita membros, não é admin
  data.contas[1].avatarServidor = URL_DISCORD
  data.contas.push(
    { id: 3, username: 'novo', nivel: 'membro', ativo: true, onboarded: false, membroId: 4, cargoPermId: 20 },
    { id: 4, username: 'exonerado', nivel: 'membro', ativo: false, exonerado: true, exoneradoEm: '2026-10-01T00:00:00.000Z', exoneradoMotivo: 'teste' },
  )
  const store = require('../dist/data')
  store.readData = () => structuredClone(data)
  store.peekData = () => data
  store.writeData = next => { data = structuredClone(next) }
  require('../dist/security/audit').audit = () => {}
  const express = require('express')
  const app = express()
  app.use(express.json())
  app.use('/api/membros', require('../dist/routes/membros').default)
  app.use('/api/auth', require('../dist/routes/auth').default)
  app.use('/api/public', require('../dist/routes/public').default)
  app.use((_err, _req, res, _next) => res.status(500).json({ error: 'Erro interno do servidor' }))
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => { globalThis.fetch = fetchReal; return new Promise(r => server.close(r)).then(() => fs.rmSync(pasta, { recursive: true, force: true })) })

function token(contaId) {
  const { escopoDoToken } = require('../dist/security/escopo')
  const { configuredScope } = require('../dist/modules/ranking/scope')
  return require('../dist/security/jwt').assinarToken({ contaId, username: `c${contaId}`, nivel: 'membro', jti: `jti-${Math.random()}`, sv: 0, scope: escopoDoToken(configuredScope()) })
}
async function req(method, rota, contaId, body) {
  const res = await fetch(base + rota, { method, body: body ? JSON.stringify(body) : undefined,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(contaId ? { Authorization: `Bearer ${token(contaId)}` } : {}) } })
  const tipo = res.headers.get('content-type') ?? ''
  return { status: res.status, tipo, body: tipo.includes('json') ? await res.json() : await res.arrayBuffer() }
}

test('cadastro inicial: a patente da unidade vem da ficha, nunca do navegador', async () => {
  const r = await req('POST', '/api/auth/onboarding', 3, { nivel: 10, policial: 'Fulano', patenteInterna: 'Commander', codinome: 'Corvo' })
  assert.equal(r.status, 200)
  const membro = data.membros.find(m => m.id === 4)
  assert.equal(membro.patenteInterna, 'Officer')          // continua a aprovada
  assert.equal(membro.codinome, 'Corvo')
})

test('retirar exoneração: só administrador (editor de membros comum recebe 403)', async () => {
  assert.equal((await req('POST', '/api/membros/exonerados/4/retirar', 2)).status, 403)
  assert.equal(data.contas.find(c => c.id === 4).exonerado, true)
  assert.equal((await req('POST', '/api/membros/exonerados/4/retirar', 1)).status, 200)
  assert.equal(data.contas.find(c => c.id === 4).exonerado, undefined)
})

test('criar ficha: quem não é admin não aplica advertência; patente fora da lista é recusada', async () => {
  data.setagem = { titulo: 'x', modeloApelido: '', versao: 1, nextPatenteId: 3, patentes: [{ id: 1, nome: 'Officer', prefixo: 'OF', roleIds: [] }] }
  const ficha = { badge: 'B9', passaporte: 'P9', policial: 'Nove', patenteDPD: 'Officer', patenteInterna: 'Officer', codinome: 'Nove', status: 'Ativo', adv1: true, adv2: false, adv3: false }
  assert.equal((await req('POST', '/api/membros', 2, ficha)).status, 403)
  assert.equal((await req('POST', '/api/membros', 2, { ...ficha, adv1: false, patenteInterna: 'Inventada' })).status, 400)
  assert.equal((await req('POST', '/api/membros', 2, { ...ficha, adv1: false })).status, 201)
})

test('foto do Discord sai como link opaco do site (sem ID do servidor/pessoa) e o link entrega a imagem', async () => {
  const lista = await req('GET', '/api/membros', 1)
  assert.equal(lista.status, 200)
  const m2 = lista.body.find(m => m.id === 2)
  assert.match(m2.avatarAtual, /^\/api\/public\/foto\/[A-Za-z0-9_-]{22}$/)
  assert.equal(m2.avatarServidor, m2.avatarAtual)
  const texto = JSON.stringify(lista.body)
  assert.ok(!texto.includes(guild) && !texto.includes('cdn.discordapp.com'), 'URL do Discord com IDs vazou')
  const foto = await req('GET', m2.avatarAtual)
  assert.equal(foto.status, 200); assert.equal(foto.tipo, 'image/png')
  assert.equal((await req('GET', '/api/public/foto/naoExiste_______________'.slice(0, 33))).status, 400)
  assert.equal((await req('GET', `/api/public/foto/${'x'.repeat(22)}`)).status, 404)
})

test('anexo de outro registro é recusado (não dá para apagar o arquivo de outro citando o ID)', async () => {
  const { conferirArquivos } = require('../dist/routes/arquivos')
  const { pastaDeArquivos } = require('../dist/armazenamento')
  const p = pastaDeArquivos('arquivos')
  const meta = { area: 'relatorios', nome: 'a.pdf', ext: 'pdf', mime: 'application/pdf', tamanho: 5, contaId: 1, criadoEm: new Date().toISOString() }
  p.salvar('ArquivoVinculadoAoOutro1', Buffer.from('%PDF-'), meta)                                   // já ligado a outro registro
  p.salvar('ArquivoRecemEnviado00001', Buffer.from('%PDF-'), { ...meta, expiraEm: new Date(Date.now() + 60_000).toISOString() })
  assert.equal(await conferirArquivos(['ArquivoVinculadoAoOutro1'], 'relatorios'), null)
  assert.equal((await conferirArquivos(['ArquivoVinculadoAoOutro1'], 'relatorios', ['ArquivoVinculadoAoOutro1'])).length, 1)   // o próprio registro mantém
  assert.equal((await conferirArquivos(['ArquivoRecemEnviado00001'], 'relatorios')).length, 1)
})
