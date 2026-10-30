// IP real do visitante atrás de Cloudflare + proxy da hospedagem (trust proxy = proxyConfiavel)
const test = require('node:test')
const assert = require('node:assert')
const express = require('express')
const http = require('node:http')
const { proxyConfiavel, ipDeProxy } = require('../dist/security/proxyConfiavel')

async function ipVisto(xff) {
  const app = express()
  app.set('trust proxy', proxyConfiavel)
  app.get('/', (req, res) => res.send(req.ip))
  const srv = app.listen(0)
  try {
    const porta = srv.address().port
    return await new Promise((ok, erro) => {
      http.get({ host: '127.0.0.1', port: porta, path: '/', headers: xff ? { 'X-Forwarded-For': xff } : {} }, res => {
        let s = ''; res.on('data', d => (s += d)); res.on('end', () => ok(s))
      }).on('error', erro)
    })
  } finally { srv.close() }
}

test('Cloudflare + proxy da Discloud: req.ip é o visitante, não a Cloudflare', async () => {
  // visitante 200.10.20.30 → Cloudflare 104.16.5.5 → roteador da Discloud (conexão do 127.0.0.1)
  assert.strictEqual(await ipVisto('200.10.20.30, 104.16.5.5'), '200.10.20.30')
})

test('X-Forwarded-For forjado pelo visitante não muda o IP', async () => {
  // o visitante manda "1.1.1.1" à esquerda; a Cloudflare acrescenta o IP real dele
  assert.strictEqual(await ipVisto('1.1.1.1, 200.10.20.30, 104.16.5.5'), '200.10.20.30')
})

test('Sem Cloudflare (proxy direto, igual ao trust proxy = 1 de antes)', async () => {
  assert.strictEqual(await ipVisto('200.10.20.30'), '200.10.20.30')
  // IP público que não é da Cloudflare nunca é tratado como proxy
  assert.strictEqual(await ipVisto('9.9.9.9, 200.10.20.30'), '200.10.20.30')
})

test('ipDeProxy: só Cloudflare e rede interna', () => {
  for (const ip of ['104.16.5.5', '172.64.1.1', '2606:4700::1', '10.0.0.5', '192.168.1.1', '127.0.0.1', '::ffff:162.158.1.1']) assert.ok(ipDeProxy(ip), ip)
  for (const ip of ['200.10.20.30', '8.8.8.8', '2001:db8::1', 'lixo', '']) assert.ok(!ipDeProxy(ip), ip)
})
