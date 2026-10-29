// Protocolo: trocar o livro (flipbook do Heyzine) do módulo.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'du-prot-'))
process.env.DATA_PATH = path.join(pasta, 'data.json')
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { makeData, guild } = require('./ranking-fixtures.cjs')

const secret = 'protocolo-test-secret-with-enough-length-0123456789'
let server, base, data

before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: secret, DISCORD_GUILD_ID: guild, DISCORD_CLIENT_ID: '222222222222222222' })
  data = makeData()
  data.cargosPermissao[0].admin = true                                       // conta 1 = admin
  data.cargosPermissao.find(c => c.id === 20).permissoes = { protocolo: { ver: true, editar: false } }   // conta 2 só lê
  const store = require('../dist/data')
  store.readData = () => structuredClone(data)
  store.peekData = () => data
  store.writeData = next => { data = structuredClone(next) }
  require('../dist/security/audit').audit = () => {}
  const express = require('express')
  const app = express()
  app.use(express.json())
  app.use('/api/protocolo', require('../dist/routes/protocolo').default)
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
async function req(method, contaId, body) {
  const res = await fetch(base + '/api/protocolo', { method, body: body ? JSON.stringify(body) : undefined,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(contaId ? { Authorization: `Bearer ${token(contaId)}` } : {}) } })
  return { status: res.status, body: await res.json().catch(() => null) }
}

test('protocolo: ler com "ver"; trocar o livro só com "editar" e só link de flipbook do Heyzine', async () => {
  assert.equal((await req('GET')).status, 401)
  const lido = await req('GET', 2)
  assert.equal(lido.status, 200)
  assert.equal(lido.body.flipbook, 'https://heyzine.com/flip-book/79e82a2e02.html')   // padrão
  assert.ok(lido.body.secoes.includes('Juramento'))

  const novo = { flipbook: 'https://heyzine.com/flip-book/abc123def.html', secoes: ['Capítulo 1', 'Capítulo 2', 'Capítulo 1'] }
  assert.equal((await req('PUT', 2, novo)).status, 403)                      // só ver
  for (const flipbook of [
    'http://heyzine.com/flip-book/abc123.html',                               // sem https
    'https://heyzine.com.evil.com/flip-book/abc123.html',
    'https://evil.com/flip-book/abc123.html',
    'javascript:alert(1)',
    'https://heyzine.com/flip-book/../../x',
  ]) assert.equal((await req('PUT', 1, { ...novo, flipbook })).status, 400, flipbook)
  assert.equal((await req('PUT', 1, { ...novo, extra: 1 })).status, 400)

  const r = await req('PUT', 1, novo)
  assert.equal(r.status, 200)
  assert.equal(r.body.flipbook, novo.flipbook)
  assert.deepEqual(r.body.secoes, ['Capítulo 1', 'Capítulo 2'])              // sem repetir
  assert.ok(r.body.atualizadoPor)
  assert.equal((await req('GET', 2)).body.flipbook, novo.flipbook)
  // Sem link .html também vale (Heyzine aceita os dois)
  assert.equal((await req('PUT', 1, { flipbook: 'https://heyzine.com/flip-book/meu-livro', secoes: [] })).status, 200)
  // Salvar tem limitador (12/min por IP, chama o Discord): zera antes da segunda leva
  const rl = require('../dist/middleware/rateLimiter')
  for (const ip of ['127.0.0.1', '::ffff:127.0.0.1']) await rl.hierarquiaLimiter.resetKey(ip)
  // Painel: posição de imagem de outro painel e link perigoso recusados; o painel sai na resposta sem ID da mensagem
  assert.equal((await req('PUT', 1, { ...novo, imagens: [{ posicao: 'cargo:123456789012345678', url: 'https://x.y/a.png' }] })).status, 400)
  assert.equal((await req('PUT', 1, { ...novo, imagens: [{ posicao: 'topo', url: 'javascript:alert(1)' }] })).status, 400)
  assert.equal((await req('PUT', 1, { ...novo, descricao: 'oi @everyone' })).status, 400)
  const comPainel = await req('PUT', 1, { ...novo, descricao: 'Leia tudo.', imagens: [{ posicao: 'topo', url: 'https://x.y/banner.png', lado: 'direita' }] })
  assert.equal(comPainel.status, 200)
  assert.equal(comPainel.body.painel.descricao, 'Leia tudo.'); assert.equal(comPainel.body.painel.imagens[0].lado, 'direita')
  assert.equal(comPainel.body.painel.publicado, false); assert.equal(comPainel.body.painel.canalId, null)
  // "Trocar livro" (sem os campos do painel) mantém o painel configurado
  const soLivro = await req('PUT', 1, { flipbook: 'https://heyzine.com/flip-book/outro.html', secoes: ['A'] })
  assert.equal(soLivro.body.painel.descricao, 'Leia tudo.'); assert.equal(soLivro.body.painel.imagens.length, 1)
})

test('painel do protocolo (V2): título, capítulos, botão de link para o livro, imagens e rodapé padrão', () => {
  const { montarPainelProtocolo } = require('../dist/protocoloPainel')
  const { componentes, anexos } = montarPainelProtocolo({ flipbook: 'https://heyzine.com/flip-book/abc.html', secoes: ['Intro', 'Fim*'],
    imagens: [{ posicao: 'topo', url: 'https://x.y/t.png' }] }, 'Detective Unit', '<:du_0123456789abcdef:123456789012345678>')
  const itens = componentes[0].components
  assert.equal(componentes[0].type, 17); assert.equal(componentes[0].accent_color, 0x8b5cf6)
  assert.equal(itens[0].type, 12)                                                          // imagem no topo
  assert.match(itens[1].content, /^# 📘 Protocolo Operacional\n/)
  assert.ok(itens.some(c => c.type === 10 && c.content.includes('**01** · Intro') && c.content.includes('Fim\\*')))   // capítulos (markdown escapado)
  const botao = itens.find(c => c.type === 1).components[0]
  assert.equal(botao.style, 5); assert.equal(botao.url, 'https://heyzine.com/flip-book/abc.html')   // link: não gera clique no bot
  assert.equal(itens.at(-1).content, '-# <:du_0123456789abcdef:123456789012345678> **Detective Unit**')   // rodapé padrão
  assert.deepEqual(anexos, [])
})
