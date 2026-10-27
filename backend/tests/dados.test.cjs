// Persistência em arquivo (sem MongoDB): data.json, escopo da instalação e sessões revogadas.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test, after } = require('node:test')
const assert = require('node:assert/strict')

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'du-dados-'))
process.env.DATA_PATH = path.join(pasta, 'data.json')
process.env.DISCORD_GUILD_ID = '111111111111111111'
process.env.DISCORD_CLIENT_ID = '222222222222222222'
after(() => fs.rmSync(pasta, { recursive: true, force: true }))

/** Carrega os módulos do zero (simula reiniciar o servidor). */
function reiniciar() {
  for (const k of Object.keys(require.cache)) if (k.includes(`${path.sep}dist${path.sep}`)) delete require.cache[k]
  return { dados: require('../dist/data'), sessoes: require('../dist/security/tokenBlacklist') }
}

test('dados: cria o arquivo, grava de forma atômica e sobrevive a reinício', async () => {
  let { dados } = reiniciar()
  await dados.initData()
  assert.ok(fs.existsSync(process.env.DATA_PATH))
  const d = dados.readData()
  d.logo = 'https://exemplo.com/logo.png'
  d.relatorios.push({ id: 1, titulo: 'Persistido' })
  dados.writeData(d)
  assert.equal(dados.readData().logo, 'https://exemplo.com/logo.png')    // cache na hora
  await dados.closeData()                                                // grava o pendente
  assert.equal(JSON.parse(fs.readFileSync(process.env.DATA_PATH, 'utf8')).relatorios[0].titulo, 'Persistido')
  assert.ok(!fs.readdirSync(pasta).some(f => f.endsWith('.tmp')))       // sem temporário sobrando

  ;({ dados } = reiniciar())
  await dados.initData()
  assert.equal(dados.readData().logo, 'https://exemplo.com/logo.png')
  assert.equal(dados.readData().relatorios.length, 1)
  assert.equal(dados.readData().boletins.length, 0)                      // campos padrão continuam
})

test('dados: arquivo corrompido derruba o boot em vez de recomeçar por cima', async () => {
  const original = fs.readFileSync(process.env.DATA_PATH)
  fs.writeFileSync(process.env.DATA_PATH, '{"membros": [')
  try {
    const { dados } = reiniciar()
    await assert.rejects(dados.initData())
    assert.equal(fs.readFileSync(process.env.DATA_PATH, 'utf8'), '{"membros": [')
  } finally {
    fs.writeFileSync(process.env.DATA_PATH, original)
  }
})

test('escopo: a pasta de dados fica presa ao servidor/app da primeira subida', async () => {
  const escopo = JSON.parse(fs.readFileSync(path.join(pasta, 'escopo.json'), 'utf8'))
  assert.deepEqual(escopo, { guildId: '111111111111111111', botId: '222222222222222222' })
  process.env.DISCORD_GUILD_ID = '999999999999999999'
  try {
    const { dados } = reiniciar()
    await assert.rejects(dados.initData(), /outro servidor/)
  } finally {
    process.env.DISCORD_GUILD_ID = '111111111111111111'
  }
})

test('sessões: logout sobrevive a reinício, só com o hash do jti e só as válidas', async () => {
  let { sessoes } = reiniciar()
  await sessoes.iniciarPersistenciaRevogacoes()
  sessoes.revokeToken('jti-valido', Date.now() + 60_000)
  sessoes.revokeToken('jti-vencido', Date.now() - 1000)
  await sessoes.encerrarPersistenciaRevogacoes()
  const bruto = fs.readFileSync(path.join(pasta, 'sessoes-revogadas.json'), 'utf8')
  assert.ok(!bruto.includes('jti-valido'))                               // nunca o jti em texto
  assert.equal(JSON.parse(bruto).length, 1)

  ;({ sessoes } = reiniciar())
  assert.equal(sessoes.isRevoked('jti-valido'), false)
  await sessoes.iniciarPersistenciaRevogacoes()
  assert.equal(sessoes.isRevoked('jti-valido'), true)
  assert.equal(sessoes.isRevoked('jti-vencido'), false)
})
