// Setores (subunidades), patentes da DU e advertências com cargo no Discord. Discord simulado.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'du-setores-'))
process.env.DATA_PATH = path.join(pasta, 'data.json')
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { makeData, guild } = require('./ranking-fixtures.cjs')

const BOT = '222222222222222222'
const A = '333333333333333333'          // conta 1 (admin, dono)
const NOVO = '720000000000000001'
const CANAL = '510000000000000001'
const R_DET = '630000000000000001'       // patente Detective
const R_SD = '630000000000000002'        // patente Senior Detective
const R_COD = '630000000000000003'       // setor COD
const R_DNARC = '630000000000000004'     // setor DNARC
const R_ADMIN = '630000000000000005'     // cargo com Administrador
let server, base, data
let cargosServidor
const papeis = []                        // PUT/DELETE de cargo em membro
const criados = []                       // cargos criados (POST /roles)
const apelidos = []
let proximoCargo = 1

const fetchReal = globalThis.fetch
globalThis.fetch = async (url, init = {}) => {
  const u = String(url)
  if (!u.startsWith('https://discord.com/')) return fetchReal(url, init)
  const metodo = init.method ?? 'GET'
  const rota = u.replace('https://discord.com/api/v10', '')
  const json = (s, b) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
  if (rota === `/guilds/${guild}?with_counts=true`) return json(200, { id: guild, name: 'Detective Unit' })
  if (rota === `/guilds/${guild}/emojis`) return json(200, [])
  if (rota === '/users/@me') return json(200, { id: BOT, username: 'Bot', avatar: null })
  if (rota === `/guilds/${guild}/roles` && metodo === 'POST') {
    const corpo = JSON.parse(init.body)
    const id = `64000000000000000${proximoCargo++}`
    criados.push(corpo)
    cargosServidor.push({ id, name: corpo.name, position: 1, permissions: corpo.permissions })
    return json(200, { id })
  }
  if (rota === `/guilds/${guild}/roles`) return json(200, cargosServidor)
  if (rota === `/guilds/${guild}/channels`) return json(200, [{ id: CANAL, name: 'pedir-set', type: 0, position: 1 }])
  if (rota.startsWith(`/guilds/${guild}/members?`)) return json(403, { code: 50001 })
  const papel = rota.match(/^\/guilds\/\d+\/members\/(\d+)\/roles\/(\d+)$/)
  if (papel) { papeis.push(`${metodo} ${papel[1]} ${papel[2]}`); return new Response(null, { status: 204 }) }
  if (/^\/guilds\/\d+\/members\/\d+$/.test(rota) && metodo === 'PATCH') { apelidos.push(JSON.parse(init.body).nick); return json(200, {}) }
  if (/^\/guilds\/\d+\/members\/\d+$/.test(rota)) return json(200, { roles: [] })
  if (/^\/interactions\/\d+\/[\w.-]+\/callback$/.test(rota)) return new Response(null, { status: 204 })
  if (/^\/webhooks\//.test(rota)) return json(200, {})
  if (/^\/channels\/\d+\/messages/.test(rota)) return json(200, { id: '990000000000000001' })
  if (rota === '/users/@me/channels') return json(200, { id: '540000000000000001' })
  return json(404, {})
}

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: 'test', JWT_SECRET: 'setores-test-secret-with-enough-length-0123456789ab',
    DISCORD_CLIENT_ID: BOT, DISCORD_CLIENT_SECRET: 'segredo-teste', DISCORD_BOT_TOKEN: 'token-teste',
    DISCORD_GUILD_ID: guild, DISCORD_REDIRECT_URI: 'http://127.0.0.1/api/auth/discord/callback', DISCORD_DONO_ID: A,
  })
  cargosServidor = [
    { id: guild, name: '@everyone', position: 0, permissions: '0' },
    { id: R_DET, name: 'Detective', position: 2, permissions: '0' },
    { id: R_SD, name: 'Senior Detective', position: 3, permissions: '0' },
    { id: R_COD, name: 'COD', position: 2, permissions: '0' },
    { id: R_DNARC, name: 'DNARC', position: 2, permissions: '0' },
    { id: R_ADMIN, name: 'Staff', position: 5, permissions: '8' },
  ]
  data = Object.assign(makeData(), { solicitacoesAcesso: [], nextSolAcessoId: 1, nextContaId: 3 })
  data.cargosPermissao[0].admin = true
  const store = require('../dist/data')
  store.readData = () => structuredClone(data)
  store.peekData = () => data
  store.writeData = next => { data = structuredClone(next) }
  require('../dist/security/audit').audit = () => {}
  const express = require('express')
  const app = express()
  app.use(express.json({ limit: '5mb' }))
  app.use('/api/setagem', require('../dist/routes/setagem').default)
  app.use('/api/config', require('../dist/routes/config').default)
  app.use('/api/auth', require('../dist/routes/auth').default)
  app.use((_err, _req, res, _next) => res.status(500).json({ error: 'Erro interno do servidor' }))
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => { globalThis.fetch = fetchReal; return new Promise(r => server.close(r)).then(() => fs.rmSync(pasta, { recursive: true, force: true })) })

function token(contaId) {
  const { escopoDoToken } = require('../dist/security/escopo')
  const { configuredScope } = require('../dist/modules/ranking/scope')
  return require('../dist/security/jwt').assinarToken({ contaId, username: `c${contaId}`, nivel: 'admin', jti: `jti-${Math.random()}`, sv: 0, scope: escopoDoToken(configuredScope()) })
}
async function req(method, rota, contaId, body) {
  const res = await fetch(base + rota, { method, body: body ? JSON.stringify(body) : undefined,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(contaId ? { Authorization: `Bearer ${token(contaId)}` } : {}) } })
  return { status: res.status, body: await res.json().catch(() => null) }
}
async function zerar() { const rl = require('../dist/middleware/rateLimiter'); for (const ip of ['127.0.0.1', '::ffff:127.0.0.1']) await rl.hierarquiaLimiter.resetKey(ip) }
const esperar = () => new Promise(r => setTimeout(r, 50))
let n = 0
const modal = (usuario, campos) => require('../dist/discord').lerInteracao({
  id: `96000000000000${String(++n).padStart(4, '0')}`, token: `tok_${'y'.repeat(30)}${n}`, type: 5, guild_id: guild,
  member: { user: { id: usuario, username: `user${usuario.slice(-2)}` }, roles: [], permissions: '1024' },
  data: { custom_id: 'du:setagem:modal', components: Object.entries(campos).map(([k, v]) => ({ type: 18,
    component: k === 'patente' || k === 'setor' ? { type: 3, custom_id: k, values: [v] } : { type: 4, custom_id: k, value: v } })) },
})

test('cadastro único: 8 patentes da DU na ordem, mantém a existente (ID, prefixo, cargo) e cria COD, DNARC e COD/DNARC', () => {
  const { cadastrarPatentesESetores, setagemAtual } = require('../dist/setagem')
  const d = { setagem: { titulo: 'Solicitar set', modeloApelido: '', versao: 3, nextPatenteId: 2,
    patentes: [{ id: 1, nome: 'Investigator Trainee', prefixo: 'IT', roleIds: [R_DET], cargoPermId: 7 }] } }
  assert.equal(cadastrarPatentesESetores(d), true)
  const s = setagemAtual(d)
  assert.deepEqual(s.patentes.map(p => p.nome), ['Supervisor of Detectives', 'Chief of Detectives', 'Deputy Chief of Detectives', 'Investigative Coordinator',
    'Investigative Inspector', 'Senior Detective', 'Detective', 'Investigator Trainee'])
  assert.deepEqual(s.patentes.at(-1), { id: 1, nome: 'Investigator Trainee', prefixo: 'IT', roleIds: [R_DET], cargoPermId: 7 })
  assert.equal(new Set(s.patentes.map(p => p.id)).size, 8)
  assert.deepEqual(s.setores.map(x => x.nome), ['COD', 'DNARC', 'COD/DNARC'])
  assert.equal(cadastrarPatentesESetores(d), false)                          // só uma vez
})

test('setores: só quem edita a setagem; cargo perigoso recusado; o combinado COD/DNARC leva os 2 cargos', async () => {
  await zerar()
  data.setagem = { titulo: 'Solicitar set', modeloApelido: '', versao: 0, nextPatenteId: 3, canalId: CANAL,
    patentes: [{ id: 1, nome: 'Detective', prefixo: 'DET', roleIds: [R_DET] }, { id: 2, nome: 'Senior Detective', prefixo: 'SD', roleIds: [R_SD] }] }
  const setores = [{ id: null, nome: 'COD', roleIds: [R_COD] }, { id: null, nome: 'DNARC', roleIds: [R_DNARC] }, { id: null, nome: 'COD/DNARC', roleIds: [R_COD, R_DNARC] }]
  assert.equal((await req('PUT', '/api/setagem/setores', 2, { setores, versao: 0 })).status, 403)
  assert.equal((await req('PUT', '/api/setagem/setores', 1, { setores: [{ id: null, nome: 'X', roleIds: ['630000000000000099'] }], versao: 0 })).status, 400)   // cargo que não existe
  assert.equal((await req('PUT', '/api/setagem/setores', 1, { setores: [{ id: null, nome: '@everyone', roleIds: [] }], versao: 0 })).status, 400)
  assert.equal((await req('PUT', '/api/setagem/setores', 1, { setores: [...setores, setores[0]], versao: 0 })).status, 400)   // nome repetido
  const r = await req('PUT', '/api/setagem/setores', 1, { setores, versao: 0 })
  assert.equal(r.status, 200)
  assert.deepEqual(r.body.config.setores.map(x => [x.nome, x.roleIds]), [['COD', [R_COD]], ['DNARC', [R_DNARC]], ['COD/DNARC', [R_COD, R_DNARC]]])
  assert.equal((await req('PUT', '/api/setagem/setores', 1, { setores, versao: 0 })).status, 409)          // versão velha
  // Opções para os selects do perfil: só nomes
  const op = await req('GET', '/api/auth/me/opcoes-perfil', 2)
  assert.deepEqual(op.body, { patentes: ['Detective', 'Senior Detective'], setores: ['COD', 'DNARC', 'COD/DNARC'] })
})

test('modal pede o setor; aprovação dá os cargos da patente E do setor, só depois de aprovado', async () => {
  await zerar()
  const { tratarInteracao, setagemAtual } = require('../dist/setagem')
  const combinado = setagemAtual(data).setores.find(x => x.nome === 'COD/DNARC')
  await tratarInteracao(modal('720000000000000002', { codinome: 'Shade', passaporte: '556', patente: '1' }))
  // Setor é opcional: sem setor o pedido entra, sem setorId
  const semSetor = data.solicitacoesAcesso.find(x => x.discordId === '720000000000000002')
  assert.ok(semSetor && semSetor.setagem.setorId === undefined)
  // Setor que não existe é recusado
  await tratarInteracao(modal('720000000000000003', { codinome: 'Wisp', passaporte: '557', patente: '1', setor: '999' }))
  assert.equal(data.solicitacoesAcesso.some(x => x.discordId === '720000000000000003'), false)
  // Aprovar sem setor: só o cargo da patente
  const apSem = await req('POST', `/api/config/solicitacoes-acesso/${semSetor.id}/aprovar`, 1, {})
  assert.equal(apSem.status, 201)
  assert.deepEqual(papeis, ['PUT 720000000000000002 ' + R_DET])
  assert.equal(data.membros.find(m => m.codinome === 'Shade').setor, undefined)
  papeis.length = 0
  await zerar()
  await tratarInteracao(modal(NOVO, { codinome: 'Ghost', passaporte: '555', patente: '1', setor: String(combinado.id) }))
  const sol = data.solicitacoesAcesso.find(s => s.discordId === NOVO)
  assert.equal(sol.setagem.setorId, combinado.id)
  assert.equal(papeis.length, 0)                                            // nenhum cargo antes da aprovação
  const lista = await req('GET', '/api/config/solicitacoes-acesso', 1)
  assert.equal(lista.body.find(x => x.id === sol.id).setagem.setor, 'COD/DNARC')
  const ap = await req('POST', `/api/config/solicitacoes-acesso/${sol.id}/aprovar`, 1, {})
  assert.equal(ap.status, 201, JSON.stringify(ap.body))
  assert.deepEqual(papeis.sort(), [`PUT ${NOVO} ${R_COD}`, `PUT ${NOVO} ${R_DET}`, `PUT ${NOVO} ${R_DNARC}`].sort())
  const conta = data.contas.find(c => c.discordId === NOVO)
  const membro = data.membros.find(m => m.id === conta.membroId)
  assert.equal(membro.setor, 'COD/DNARC'); assert.equal(membro.patenteInterna, 'Detective'); assert.equal(conta.cadastroSetagem.setor, 'COD/DNARC')
})

test('perfil aprovado (promoção/setor): tira os cargos antigos, dá os novos e troca o apelido', async () => {
  papeis.length = 0; apelidos.length = 0
  const { aplicarPerfilNoDiscord } = require('../dist/setagem')
  const conta = data.contas.find(c => c.discordId === NOVO)
  const membro = data.membros.find(m => m.id === conta.membroId)
  membro.patenteInterna = 'Senior Detective'; membro.setor = 'COD'; membro.codinome = 'Ghost'; membro.passaporte = '555'
  assert.equal(await aplicarPerfilNoDiscord(membro.id, { patente: 'Detective', setor: 'COD/DNARC' }), 'ok')
  assert.deepEqual(papeis.sort(), [`DELETE ${NOVO} ${R_DET}`, `DELETE ${NOVO} ${R_DNARC}`, `PUT ${NOVO} ${R_COD}`, `PUT ${NOVO} ${R_SD}`].sort())
  assert.deepEqual(apelidos, ['SD Ghost | 555'])
  // Patente/setor inexistentes são recusados antes de aprovar
  const { valorDePerfilInvalido } = require('../dist/setagem')
  assert.ok(valorDePerfilInvalido(data, 'setor', 'Inventado')); assert.ok(valorDePerfilInvalido(data, 'patenteInterna', 'General'))
  assert.equal(valorDePerfilInvalido(data, 'setor', 'dnarc'), undefined); assert.equal(valorDePerfilInvalido(data, 'setor', ''), undefined)
})

test('advertências: cria os 3 cargos SEM permissão se faltarem (uma vez só) e sincroniza com a dashboard', async () => {
  await zerar(); papeis.length = 0
  const r = await req('POST', '/api/setagem/advertencias', 1)
  assert.equal(r.status, 200)
  assert.equal(criados.length, 3)
  assert.ok(criados.every(c => c.permissions === '0' && c.mentionable === false && c.hoist === false))
  const ids = r.body.config.advertencias
  assert.equal(ids.filter(Boolean).length, 3)
  assert.equal((await req('POST', '/api/setagem/advertencias', 2)).status, 403)
  await zerar()
  await req('POST', '/api/setagem/advertencias', 1)
  assert.equal(criados.length, 3)                                           // já existem: não cria de novo
  const { sincronizarAdvertencias } = require('../dist/setagem')
  const conta = data.contas.find(c => c.discordId === NOVO)
  const membro = data.membros.find(m => m.id === conta.membroId)
  membro.adv1 = true; membro.adv2 = false; membro.adv3 = true
  assert.equal(await sincronizarAdvertencias(membro.id), 'ok')
  assert.deepEqual(papeis.sort(), [`PUT ${NOVO} ${ids[0]}`, `DELETE ${NOVO} ${ids[1]}`, `PUT ${NOVO} ${ids[2]}`].sort())
  // Cargo de advertência apagado no Discord: recriado na próxima vez
  cargosServidor = cargosServidor.filter(c => c.id !== ids[1])
  require('../dist/discord').esquecerCacheDiscord()
  await sincronizarAdvertencias(membro.id)
  await esperar()
  assert.equal(criados.length, 4)
  // Cargo perigoso não pode ser de advertência
  await zerar()
  const cfgAtual = (await req('GET', '/api/setagem', 1)).body.config
  const ruim = await req('PUT', '/api/setagem', 1, { titulo: 'Solicitar set', descricao: null, categoriaId: null, canalId: CANAL, aprovadores: [],
    imagem: null, rodapeTexto: null, advertencias: [R_ADMIN, '', ''], versao: cfgAtual.versao,
    patentes: cfgAtual.patentes.map(p => ({ id: p.id, nome: p.nome, prefixo: p.prefixo, roleIds: p.roleIds, cargoPermId: null })) })
  assert.equal(ruim.status, 400)
})

test('Solicitações no site: pedir para refazer (motivo obrigatório, vai no privado) e recusar com motivo', async () => {
  await zerar()
  const { tratarInteracao } = require('../dist/setagem')
  const PESSOA = '720000000000000009'
  await tratarInteracao(modal(PESSOA, { codinome: 'Echo', passaporte: '901', patente: '1' }))
  const sol = data.solicitacoesAcesso.find(x => x.discordId === PESSOA)
  assert.ok(sol)
  assert.equal((await req('POST', `/api/config/solicitacoes-acesso/${sol.id}/corrigir`, 2, { motivo: 'Passaporte errado' })).status, 403)   // só admin
  assert.equal((await req('POST', `/api/config/solicitacoes-acesso/${sol.id}/corrigir`, 1, { motivo: 'x' })).status, 400)                  // motivo curto
  const r = await req('POST', `/api/config/solicitacoes-acesso/${sol.id}/corrigir`, 1, { motivo: 'Passaporte errado @everyone' })
  assert.equal(r.status, 200)
  const pedido = data.solicitacoesAcesso.find(x => x.id === sol.id)
  assert.equal(pedido.setagem.status, 'correcao'); assert.equal(pedido.setagem.motivoCorrecao, 'Passaporte errado everyone')   // sem @
  assert.equal((await req('POST', '/api/config/solicitacoes-acesso/99999/corrigir', 1, { motivo: 'Passaporte errado' })).status, 404)
  // Recusar com motivo (opcional) remove o pedido
  await zerar()
  assert.equal((await req('DELETE', `/api/config/solicitacoes-acesso/${sol.id}`, 1, { motivo: 'Fora do perfil da unidade' })).status, 200)
  assert.equal(data.solicitacoesAcesso.some(x => x.id === sol.id), false)
})

test('patentes: Supervisor of Detectives no topo (uma vez), mantendo as existentes; lista antiga de Configurações vira a da DU', () => {
  const { atualizarPatentesDu, setagemAtual } = require('../dist/setagem')
  const d = { migracaoSetores: true, patentes: ['Recruta', 'Soldado'], setagem: { titulo: 'x', modeloApelido: '', versao: 1, nextPatenteId: 9,
    patentes: [{ id: 3, nome: 'Chief of Detectives', prefixo: 'CHF', roleIds: ['1'] }, { id: 8, nome: 'Investigator Trainee', prefixo: 'IT', roleIds: [] }] } }
  assert.equal(atualizarPatentesDu(d), true)
  const nomes = setagemAtual(d).patentes.map(p => p.nome)
  assert.equal(nomes[0], 'Supervisor of Detectives'); assert.equal(nomes[1], 'Chief of Detectives'); assert.equal(nomes.length, 8)
  assert.deepEqual(setagemAtual(d).patentes[1], { id: 3, nome: 'Chief of Detectives', prefixo: 'CHF', roleIds: ['1'] })   // existente intacta
  assert.equal(d.patentes[0], 'Supervisor of Detectives'); assert.ok(!d.patentes.includes('Recruta'))
  assert.equal(atualizarPatentesDu(d), false)                                  // só uma vez
})

test('cargo alto (com moderação) pode ser configurado na patente, mas o bot NÃO entrega: avisa para dar à mão', async () => {
  await zerar(); papeis.length = 0
  const { tratarInteracao, setagemAtual } = require('../dist/setagem')
  const atual = setagemAtual(data)
  // Patente 1 com o cargo seguro + um cargo de Administrador
  const r = await req('PUT', '/api/setagem', 1, { titulo: 'Solicitar set', descricao: null, categoriaId: null, canalId: CANAL, aprovadores: [], imagem: null,
    rodapeTexto: null, versao: atual.versao, patentes: atual.patentes.map(p => ({ id: p.id, nome: p.nome, prefixo: p.prefixo, roleIds: p.id === 1 ? [R_DET, R_ADMIN] : p.roleIds, cargoPermId: null })) })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  const PESSOA = '720000000000000011'
  await tratarInteracao(modal(PESSOA, { codinome: 'Nova', passaporte: '9911', patente: '1' }))
  const sol = data.solicitacoesAcesso.find(x => x.discordId === PESSOA)
  await zerar()
  const ap = await req('POST', `/api/config/solicitacoes-acesso/${sol.id}/aprovar`, 1, {})
  assert.equal(ap.status, 201)
  assert.deepEqual(ap.body.cargosManuais, ['Staff'])
  assert.ok(papeis.includes(`PUT ${PESSOA} ${R_DET}`)); assert.ok(!papeis.some(p => p.endsWith(R_ADMIN)))   // Administrador nunca sai pelo bot
  // Advertência continua recusando cargo alto (o bot dá sozinho)
  await zerar()
  const a2 = setagemAtual(data)
  assert.equal((await req('PUT', '/api/setagem', 1, { titulo: 'Solicitar set', descricao: null, categoriaId: null, canalId: CANAL, aprovadores: [], imagem: null,
    rodapeTexto: null, versao: a2.versao, advertencias: [R_ADMIN, '', ''], patentes: a2.patentes.map(p => ({ id: p.id, nome: p.nome, prefixo: p.prefixo, roleIds: p.roleIds, cargoPermId: null })) })).status, 400)
})
