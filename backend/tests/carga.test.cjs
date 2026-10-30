// Requisições simultâneas por IP e proteção de sobrecarga (servidor atrasado → recusa o não essencial).
const { test, before, after, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')

let server
const pendentes = []   // respostas segurando a rota lenta
before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: 'carga-test-secret-with-enough-length-0123456789abc' })
  const express = require('express')
  const { limiteConcorrente, protecaoSobrecarga } = require('../dist/middleware/cargaServidor')
  const app = express()
  app.use(protecaoSobrecarga)
  app.use(limiteConcorrente)
  app.get('/api/lenta', (_req, res) => { pendentes.push(res) })   // só responde quando o teste mandar
  app.post('/api/arquivos', (_req, res) => { pendentes.push(res) })
  app.get('/api/rapida', (_req, res) => res.json({ ok: true }))
  app.get('/pagina', (_req, res) => res.send('ok'))
  server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)) })
})
after(() => { for (const r of pendentes.splice(0)) r.end(); server?.close() })
beforeEach(() => { for (const r of pendentes.splice(0)) r.end(); require('../dist/middleware/cargaServidor').resetarCarga() })

const token = contaId => require('../dist/security/jwt').assinarToken({ contaId, username: `c${contaId}`, nivel: 'membro', jti: `jti-${Math.random()}`, sv: 0 })
const agente = new http.Agent({ keepAlive: false, maxSockets: 100 })
function req(method, rota, contaId) {
  return new Promise((ok, erro) => {
    const r = http.request({ host: '127.0.0.1', port: server.address().port, method, path: rota, agent: agente,
      headers: contaId ? { Authorization: `Bearer ${token(contaId)}` } : {} }, res => {
      let s = ''; res.on('data', d => (s += d)); res.on('end', () => ok({ status: res.statusCode, corpo: s }))
    })
    r.on('error', erro); r.end()
  })
}
const esperar = (cond) => new Promise(ok => { const t = setInterval(() => { if (cond()) { clearInterval(t); ok() } }, 5) })

test('rajada de requisições simultâneas do mesmo IP: passa do teto → 429; terminou → libera', async () => {
  const { MAX_SIMULTANEAS_IP } = require('../dist/middleware/cargaServidor')
  const presas = Array.from({ length: MAX_SIMULTANEAS_IP }, () => req('GET', '/api/lenta'))
  await esperar(() => pendentes.length === MAX_SIMULTANEAS_IP)
  assert.equal((await req('GET', '/api/rapida')).status, 429)
  for (const r of pendentes.splice(0)) r.json({ ok: true })
  await Promise.all(presas)
  assert.equal((await req('GET', '/api/rapida')).status, 200)
})

test('envios de arquivo simultâneos têm teto menor', async () => {
  const { MAX_ENVIOS_SIMULTANEOS_IP } = require('../dist/middleware/cargaServidor')
  const presos = Array.from({ length: MAX_ENVIOS_SIMULTANEOS_IP }, () => req('POST', '/api/arquivos'))
  await esperar(() => pendentes.length === MAX_ENVIOS_SIMULTANEOS_IP)
  const r = await req('POST', '/api/arquivos')
  assert.equal(r.status, 429)
  assert.match(r.corpo, /envios em andamento/)
  assert.equal((await req('GET', '/api/rapida')).status, 200)   // o resto continua funcionando
  for (const x of pendentes.splice(0)) x.json({ ok: true })
  await Promise.all(presos)
})

test('servidor atrasado: visitante da API espera; logado e páginas passam; muito atrasado só o 503', async () => {
  const { simularAtraso } = require('../dist/middleware/cargaServidor')
  simularAtraso(400)
  assert.equal((await req('GET', '/api/rapida')).status, 503)
  assert.equal((await req('GET', '/api/rapida', 5)).status, 200)
  assert.equal((await req('GET', '/pagina')).status, 200)
  simularAtraso(1500)
  assert.equal((await req('GET', '/api/rapida', 5)).status, 503)
  simularAtraso(0)
  assert.equal((await req('GET', '/api/rapida')).status, 200)
})
