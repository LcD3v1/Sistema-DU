// Anti-flood por conta (10 s de espera, sem banir) e firewall aceitando o envio de arquivo cru.
// Firewall ligado também para 127.0.0.1 (como em produção atrás do proxy).
const { test, before, after, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')

let server
before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: 'antiflood-test-secret-with-enough-length-0123456789', FIREWALL_ISENTAR_LOOPBACK: 'off' })
  require('../dist/security/audit').audit = () => {}
  const express = require('express')
  const { firewall } = require('../dist/security/firewall')
  const { antiFlood } = require('../dist/middleware/antiFlood')
  const app = express()
  app.use(firewall)
  app.use('/api', antiFlood)
  app.post('/api/arquivos', express.raw({ type: 'application/octet-stream' }), (req, res) => res.json({ bytes: req.body.length }))
  app.all('/api/arvores/:id', (_req, res) => res.json({ ok: true }))
  app.all('/api/membros', (_req, res) => res.json({ ok: true }))
  app.use((_req, res) => res.status(404).json({ error: 'Recurso não encontrado' }))
  server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)) })
})
after(() => { server?.close(); delete process.env.FIREWALL_ISENTAR_LOOPBACK })
beforeEach(() => { require('../dist/middleware/antiFlood').resetarAntiFlood(); require('../dist/security/firewall').resetarFirewall() })

const token = contaId => require('../dist/security/jwt').assinarToken({ contaId, username: `c${contaId}`, nivel: 'membro', jti: `jti-${Math.random()}`, sv: 0 })

function req(method, rota, { contaId, tipo, corpo } = {}) {
  return new Promise((ok, erro) => {
    const headers = { ...(tipo ? { 'Content-Type': tipo } : {}), ...(corpo ? { 'Content-Length': Buffer.byteLength(corpo) } : {}), ...(contaId ? { Authorization: `Bearer ${token(contaId)}` } : {}) }
    const r = http.request({ host: '127.0.0.1', port: server.address().port, method, path: rota, headers }, res => {
      let s = ''; res.on('data', d => (s += d)); res.on('end', () => ok({ status: res.statusCode, corpo: s ? JSON.parse(s) : null, espera: res.headers['retry-after'] }))
    })
    r.on('error', erro)
    if (corpo) r.write(corpo)
    r.end()
  })
}

test('upload de arquivo (bytes crus) passa pelo firewall; outro corpo não-JSON continua recusado', async () => {
  const up = await req('POST', '/api/arquivos?area=inqueritos&nome=laudo.pdf', { contaId: 1, tipo: 'application/octet-stream', corpo: '%PDF-1.4 teste' })
  assert.equal(up.status, 200)
  assert.equal(up.corpo.bytes, 14)
  const errado = await req('POST', '/api/membros', { contaId: 1, tipo: 'application/octet-stream', corpo: 'xx' })
  assert.equal(errado.status, 415)
  const textoEmArquivos = await req('PUT', '/api/arquivos', { contaId: 1, tipo: 'application/octet-stream', corpo: 'xx' })
  assert.equal(textoEmArquivos.status, 415)
})

test('flood de uma conta: aquela ação espera 10 s, sem atingir outra parte nem outra conta', async () => {
  let r
  for (let i = 0; i < 16; i++) r = await req('PUT', '/api/arvores/1', { contaId: 7, tipo: 'application/json', corpo: '{}' })
  assert.equal(r.status, 429)
  assert.match(r.corpo.error, /Espere 10 segundos/)
  assert.equal(r.espera, '10')
  // Continua em espera (não é ban: só aquela ação, por alguns segundos)
  assert.equal((await req('PUT', '/api/arvores/1', { contaId: 7, tipo: 'application/json', corpo: '{}' })).status, 429)
  // Outra parte do sistema e outra conta seguem normais
  assert.equal((await req('PUT', '/api/membros', { contaId: 7, tipo: 'application/json', corpo: '{}' })).status, 200)
  assert.equal((await req('PUT', '/api/arvores/1', { contaId: 8, tipo: 'application/json', corpo: '{}' })).status, 200)
})

test('conta logada não é banida pelo firewall por erros seguidos; visitante continua sendo', async () => {
  const { estadoFirewall } = require('../dist/security/firewall')
  process.env.FIREWALL_NAO_BANIR_PRIVADOS = 'off'   // 127.0.0.1 conta como IP comum neste teste
  try {
    for (let i = 0; i < 40; i++) await req('GET', '/api/nao-existe', { contaId: 9 })   // 404 em rajada, logado
    assert.equal(estadoFirewall().ipsBanidos, 0)
    for (let i = 0; i < 40; i++) await req('GET', '/api/nao-existe')                  // mesma rajada, sem login
    assert.equal(estadoFirewall().ipsBanidos, 1)
  } finally { delete process.env.FIREWALL_NAO_BANIR_PRIVADOS }
})
