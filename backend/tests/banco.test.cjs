// Banco de dados (MongoDB) com uma coleção FALSA: importação do arquivo, leitura do banco, cifra,
// gravação em segundo plano (com banco fora do ar) e desligamento. Nada conecta a um banco de verdade.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'du-banco-'))
process.env.DATA_PATH = path.join(pasta, 'data.json')
process.env.DATA_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64url')   // chave só deste teste
delete process.env.MONGODB_URI
const { test, after } = require('node:test')
const assert = require('node:assert/strict')

after(() => fs.rmSync(pasta, { recursive: true, force: true }))

function reiniciar() {
  for (const k of Object.keys(require.cache)) if (k.includes(`${path.sep}dist${path.sep}`)) delete require.cache[k]
  return { dados: require('../dist/data'), banco: require('../dist/bancoDados') }
}
/** Coleção falsa com a mesma "cara" do driver (findOne/replaceOne). */
function colecaoFalsa() {
  const docs = new Map()
  const c = {
    docs, falhar: false, gravacoes: 0,
    async findOne(f) { return docs.get(f._id) ?? null },
    async replaceOne(f, d) { if (c.falhar) throw new Error('banco fora do ar'); c.gravacoes++; docs.set(f._id, { _id: f._id, ...d }) },
  }
  return c
}
const esperar = ms => new Promise(r => setTimeout(r, ms))

test('empacotar: compacta e CIFRA (sem texto legível); adulterado ou chave errada não abre', () => {
  const { banco } = reiniciar()
  const json = JSON.stringify({ contas: [{ username: 'segredo-do-teste' }], x: 'a'.repeat(5000) })
  const p = banco.empacotar(json)
  assert.equal(p.formato, 'gzip+aes')
  assert.ok(!p.conteudo.includes('segredo-do-teste'))
  assert.ok(p.conteudo.length < json.length)                       // compactado
  assert.equal(banco.desempacotar(p), json)
  const adulterado = { ...p, conteudo: p.conteudo.slice(0, -4) + 'AAAA' }
  assert.throws(() => banco.desempacotar(adulterado))
})

test('primeira vez: importa o arquivo atual para o banco (e cria backup cifrado); o arquivo continua', async () => {
  fs.writeFileSync(process.env.DATA_PATH, JSON.stringify({ membros: [{ id: 7, policial: 'Do arquivo' }], nextMemId: 8 }))
  const { dados, banco } = reiniciar()
  const col = colecaoFalsa()
  await dados.initData(banco.cofreDaColecao(col))
  assert.equal(col.docs.size, 1)
  const noBanco = JSON.parse(banco.desempacotar(col.docs.get('principal')))
  assert.equal(noBanco.membros[0].policial, 'Do arquivo')
  assert.ok(fs.existsSync(process.env.DATA_PATH))
  assert.ok(fs.readdirSync(path.join(pasta, 'backups')).some(f => f.endsWith('.json.enc')))
  await dados.closeData()
})

test('com dados no banco: o banco é a fonte da verdade (o arquivo vira cópia dele)', async () => {
  const { dados, banco } = reiniciar()
  const col = colecaoFalsa()
  await banco.cofreDaColecao(col).gravar(JSON.stringify({ membros: [{ id: 9, policial: 'Do banco' }], nextMemId: 10 }))
  fs.writeFileSync(process.env.DATA_PATH, JSON.stringify({ membros: [{ id: 1, policial: 'Arquivo velho' }] }))
  const antes = col.gravacoes
  await dados.initData(banco.cofreDaColecao(col))
  assert.equal(dados.readData().membros[0].policial, 'Do banco')
  assert.equal(JSON.parse(fs.readFileSync(process.env.DATA_PATH, 'utf8')).membros[0].policial, 'Do banco')   // reserva local atualizada
  assert.equal(col.gravacoes, antes)                                 // ler não regrava o banco
  await dados.closeData()
})

test('gravação: vai para o banco em segundo plano; banco fora = arquivo segue e tenta de novo até voltar', async () => {
  const { dados, banco } = reiniciar()
  const col = colecaoFalsa()
  await dados.initData(banco.cofreDaColecao(col))
  const d = dados.readData(); d.membros = [{ id: 1, policial: 'Versão 1' }]; dados.writeData(d)
  await esperar(50)
  assert.equal(JSON.parse(banco.desempacotar(col.docs.get('principal'))).membros[0].policial, 'Versão 1')
  assert.equal(dados.bancoEmDia(), true)

  col.falhar = true
  const d2 = dados.readData(); d2.membros = [{ id: 1, policial: 'Versão 2' }]; dados.writeData(d2)
  await esperar(1_200)                                                // passa o intervalo mínimo entre gravações
  assert.equal(dados.bancoEmDia(), false)
  assert.equal(JSON.parse(fs.readFileSync(process.env.DATA_PATH, 'utf8')).membros[0].policial, 'Versão 2')   // arquivo não espera o banco
  col.falhar = false
  await esperar(3_300)                                                // nova tentativa a cada 3 s
  assert.equal(dados.bancoEmDia(), true)
  assert.equal(JSON.parse(banco.desempacotar(col.docs.get('principal'))).membros[0].policial, 'Versão 2')
  await dados.closeData()
})

test('desligar: a última alteração chega ao banco antes de fechar', async () => {
  const { dados, banco } = reiniciar()
  const col = colecaoFalsa()
  let fechou = false
  await dados.initData(banco.cofreDaColecao(col, async () => { fechou = true }))
  const d = dados.readData(); d.membros = [{ id: 1, policial: 'Antes de desligar' }]; dados.writeData(d)
  await dados.closeData()
  assert.equal(JSON.parse(banco.desempacotar(col.docs.get('principal'))).membros[0].policial, 'Antes de desligar')
  assert.equal(fechou, true)
})
