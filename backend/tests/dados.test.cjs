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

test('conta dona: já vem criada (id 1, admin), SEM senha — entra só pelo Discord (DISCORD_DONO_ID)', async () => {
  const { dados } = reiniciar()
  await dados.initData()
  dados.ensureDefaultAdmin()
  const dono = dados.readData().contas.find(c => c.id === 1)
  assert.equal(dono.username, 'admin')
  assert.equal(dono.ativo, true)
  assert.equal(dono.password, undefined)
  assert.equal(dono.senhaPadrao, undefined)
  // Boot seguinte não duplica nem recria a conta dona
  dados.ensureDefaultAdmin()
  assert.equal(dados.readData().contas.filter(c => c.id === 1).length, 1)
  await dados.closeData()
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

test('backup automático: criptografado, legível só com a chave e com rotação dos 14 mais recentes', async () => {
  process.env.DATA_ENCRYPTION_KEY = require('node:crypto').randomBytes(32).toString('base64url')   // só para o teste
  const { dados } = reiniciar()
  await dados.initData()
  const backup = require('../dist/backupAutomatico')
  const arquivo = backup.criarBackup(new Date('2026-10-27T10:00:00Z'))
  const bruto = fs.readFileSync(arquivo, 'utf8')
  assert.match(bruto, /^enc:v1:/)
  assert.ok(!bruto.includes('exemplo.com/logo.png'))                      // conteúdo não fica legível
  assert.equal(backup.lerBackup(arquivo).logo, 'https://exemplo.com/logo.png')
  const chave = process.env.DATA_ENCRYPTION_KEY
  process.env.DATA_ENCRYPTION_KEY = require('node:crypto').randomBytes(32).toString('base64url')
  assert.throws(() => backup.lerBackup(arquivo))                           // outra chave não abre
  process.env.DATA_ENCRYPTION_KEY = chave
  for (let d = 1; d <= 20; d++) backup.criarBackup(new Date(Date.UTC(2026, 10, d, 3)))
  const restantes = fs.readdirSync(backup.PASTA_BACKUPS).sort()
  assert.equal(restantes.length, 14)
  assert.equal(restantes.at(-1), 'du-20261120-030000.json.enc')           // ficam os mais novos
  delete process.env.DATA_ENCRYPTION_KEY
})

test('migração do sistema anterior → DPD: campo renomeado, sigla trocada só nas patentes, cópia antes e roda uma vez', async () => {
  // Sigla e campo antigos montados por partes (não ficam escritos no código)
  const ANTIGA = String.fromCharCode(78) + 'PD'
  const CAMPO = `patente${ANTIGA}`
  // Arquivo no formato antigo + uma imagem em base64 que contém a sigla antiga por acaso
  const antigo = JSON.parse(fs.readFileSync(process.env.DATA_PATH, 'utf8'))
  const imagem = `data:image/png;base64,AAA${ANTIGA}xwAAA=`
  Object.assign(antigo, {
    membros: [{ id: 1, policial: 'Raven', badge: '1', passaporte: '10', [CAMPO]: `Officer ${ANTIGA}`, patenteInterna: `Sargento ${ANTIGA}`, status: 'Ativo',
      entrada: '2026-01-01', promocao: '2026-01-01', adv1: false, adv2: false, adv3: false }],
    solicitacoesPerfil: [{ id: 1, membroId: 1, contaId: 1, status: 'pendente', criadoEm: '2026-01-01', alteracoes: [{ campo: CAMPO, de: `${ANTIGA} Cabo`, para: `${ANTIGA} Sargento` }] }],
    patentes: [`Cadete ${ANTIGA}`, 'Recruta'], logo: imagem, migracaoDpd: undefined,
  })
  fs.writeFileSync(process.env.DATA_PATH, JSON.stringify(antigo))
  const { dados } = reiniciar()
  assert.equal(dados.SIGLA_ANTIGA, ANTIGA)
  await dados.initData()
  let copia = ''
  assert.equal(dados.migrarPatentesParaDpd(c => { copia = c }), true)
  assert.ok(copia.includes(`"${CAMPO}":"Officer ${ANTIGA}"`))                 // cópia ANTES de converter
  const d = dados.readData()
  assert.equal(d.membros[0].patenteDPD, 'Officer DPD'); assert.equal(d.membros[0][CAMPO], undefined)
  assert.equal(d.membros[0].patenteInterna, 'Sargento DPD')
  assert.deepEqual(d.solicitacoesPerfil[0].alteracoes[0], { campo: 'patenteDPD', de: 'DPD Cabo', para: 'DPD Sargento' })
  assert.deepEqual(d.patentes, ['Cadete DPD', 'Recruta'])
  assert.equal(d.logo, imagem)                                             // imagem/texto livre não muda
  assert.equal(dados.migrarPatentesParaDpd(() => { throw new Error('não devia copiar de novo') }), false)   // só uma vez
  await dados.closeData()
})

test('cargos de permissão = patentes da DU: renomeia os antigos (mesmo ID, contas e permissões), cria o que falta e liga as patentes', async () => {
  const antigo = JSON.parse(fs.readFileSync(process.env.DATA_PATH, 'utf8'))
  Object.assign(antigo, {
    cargosPermissao: [
      { id: 1, nome: '(DU) Commander', admin: true, permissoes: {} },
      { id: 6, nome: '(DU) Officer', permissoes: { relatorios: { ver: true, editar: true } } },
      { id: 7, nome: '(DU) Probationary', padrao: true, permissoes: {} },
    ],
    nextCargoPermId: 8,
    contas: [{ id: 1, username: 'dono', nivel: 'admin', ativo: true, cargoPermId: 1, membroId: 1 }, { id: 2, username: 'novo', nivel: 'membro', ativo: true, cargoPermId: 7 }],
    membros: [{ id: 1, policial: 'Raven', badge: '', passaporte: '1', patenteDPD: '', patenteInterna: '(DU) Commander', status: 'Ativo', entrada: '2026-01-01', promocao: '2026-01-01', adv1: false, adv2: false, adv3: false }],
    setagem: { titulo: 'x', modeloApelido: '', versao: 1, nextPatenteId: 3, patentes: [{ id: 1, nome: 'Detective Senior', prefixo: 'SD', roleIds: [] }, { id: 2, nome: 'Investigator Trainee', prefixo: 'IT', roleIds: [], cargoPermId: 7 }] },
  })
  fs.writeFileSync(process.env.DATA_PATH, JSON.stringify(antigo))
  const { dados } = reiniciar()
  await dados.initData()
  dados.ensureDuPermissionRoles()
  const d = dados.readData()
  assert.deepEqual(d.cargosPermissao.map(c => c.nome), ['Supervisor of Detectives', 'Chief of Detectives', 'Deputy Chief of Detectives',
    'Investigative Coordinator', 'Investigative Inspector', 'Senior Detective', 'Detective', 'Investigator Trainee'])
  const porNome = n => d.cargosPermissao.find(c => c.nome === n)
  assert.equal(porNome('Supervisor of Detectives').id, 1); assert.equal(porNome('Supervisor of Detectives').admin, true)   // mesmo cargo, acesso total
  assert.equal(porNome('Senior Detective').id, 6); assert.equal(porNome('Senior Detective').permissoes.relatorios.editar, true)  // permissões mantidas
  assert.equal(porNome('Investigator Trainee').id, 7); assert.equal(porNome('Investigator Trainee').padrao, true)
  assert.equal(d.contas[1].cargoPermId, 7)                                         // contas continuam no mesmo cargo
  assert.equal(d.membros[0].patenteInterna, 'Supervisor of Detectives')            // ficha acompanha o nome novo
  // "Detective Senior" = "Senior Detective", MAS esse cargo dá "editar": a ligação automática não acontece
  // (só um admin liga patente a cargo com poderes, conferido ao salvar a setagem)
  assert.equal(d.setagem.patentes[0].cargoPermId, undefined)
  assert.equal(d.setagem.patentes[1].cargoPermId, 7)                               // já ligada: não muda
  const antes = JSON.stringify(d)
  dados.ensureDuPermissionRoles()
  assert.equal(JSON.stringify(dados.readData()), antes)                            // roda de novo sem mudar nada
  await dados.closeData()
})
