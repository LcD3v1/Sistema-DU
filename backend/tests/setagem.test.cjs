// Setagem: painel V2, modal (novo/editar), canal temporário com Aprovar/Reprovar/Refazer, privado. Discord simulado.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'du-set-'))
process.env.DATA_PATH = path.join(pasta, 'data.json')
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { makeData, guild } = require('./ranking-fixtures.cjs')

const BOT = '222222222222222222'
const A = '333333333333333333'          // conta 1 (admin, dono)
const B = '444444444444444444'          // conta 2 (Officer)
const NOVO = '710000000000000001'
const OUTRO = '710000000000000002'
const QUALQUER = '710000000000000009'   // membro comum, sem cargo aprovador
const STAFF = '710000000000000008'      // tem o cargo aprovador
const CAT = '520000000000000001'
const CANAL = '510000000000000001'
const R_SGT = '610000000000000001'
const R_CB = '610000000000000002'
const R_ADMIN = '610000000000000003'     // cargo com Administrador
const R_APROVA = '610000000000000004'    // cargo aprovador
let server, base, data
const chamadas = []
const emojisApp = []                     // emojis do bot (fotinha do rodapé)
const respostas = []                     // callbacks de interação
const edicoes = []                       // edições da resposta "pensando…"
const mensagens = new Map()              // id → { canal, corpo }
const canaisCriados = []
const privados = []
let proximoCanal = 1

const fetchReal = globalThis.fetch
globalThis.fetch = async (url, init = {}) => {
  const u = String(url)
  if (u.startsWith('https://cdn.discordapp.com/')) {
    return new Response(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 5)]), { status: 200, headers: { 'Content-Type': 'image/png' } })
  }
  if (!u.startsWith('https://discord.com/')) return fetchReal(url, init)
  const metodo = init.method ?? 'GET'
  const rota = u.replace('https://discord.com/api/v10', '')
  chamadas.push(`${metodo} ${rota}`)
  const json = (s, b) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
  if (rota === `/guilds/${guild}?with_counts=true`) return json(200, { id: guild, name: 'Detective Unit' })
  if (rota === `/guilds/${guild}/emojis`) return json(200, [])
  if (rota === `/applications/${BOT}/emojis` && (init.method ?? 'GET') === 'GET') return json(200, { items: emojisApp })
  if (rota === `/applications/${BOT}/emojis` && init.method === 'POST') {
    const corpoEmoji = JSON.parse(init.body); const id = `88000000000000000${emojisApp.length + 1}`
    emojisApp.push({ id, name: corpoEmoji.name, animated: false }); return json(201, { id })
  }
  if (rota === '/users/@me') return json(200, { id: BOT, username: 'Bot', avatar: 'a'.repeat(32) })
  if (rota === `/guilds/${guild}/roles`) return json(200, [
    { id: guild, name: '@everyone', position: 0, permissions: '0' },
    { id: R_SGT, name: 'Sargento', position: 3, permissions: '1024' },
    { id: R_CB, name: 'Cabo', position: 2, permissions: '1024' },
    { id: R_APROVA, name: 'Recrutador', position: 4, permissions: '1024' },
    { id: R_ADMIN, name: 'Staff', position: 5, permissions: '8' }])
  if (rota === `/guilds/${guild}/channels` && metodo === 'POST') {
    const id = `53000000000000000${proximoCanal++}`; canaisCriados.push({ id, corpo: JSON.parse(init.body) }); return json(201, { id })
  }
  if (rota === `/guilds/${guild}/channels`) return json(200, [
    { id: CAT, name: 'PEDIDOS', type: 4, position: 0 },
    { id: CANAL, name: 'pedir-set', type: 0, position: 1 }])
  if (rota.startsWith(`/guilds/${guild}/members?`)) return json(403, { code: 50001 })
  if (/^\/guilds\/\d+\/members\/\d+\/roles\/\d+$/.test(rota) && metodo === 'PUT') return new Response(null, { status: 204 })
  if (/^\/guilds\/\d+\/members\/\d+$/.test(rota) && metodo === 'PATCH') return json(200, {})
  if (/^\/guilds\/\d+\/members\/\d+$/.test(rota)) return json(200, { roles: [] })
  if (rota === '/users/@me/channels' && metodo === 'POST') return json(200, { id: `54${JSON.parse(init.body).recipient_id.slice(2)}` })
  if (/^\/channels\/\d+$/.test(rota) && metodo === 'DELETE') return json(200, {})
  const msg = rota.match(/^\/channels\/(\d+)\/messages(?:\/(\d+))?$/)
  if (msg) {
    if (metodo === 'DELETE') { mensagens.delete(msg[2]); return new Response(null, { status: 204 }) }
    const corpo = JSON.parse(init.body.get('payload_json'))
    if (msg[1].startsWith('54')) { privados.push({ canal: msg[1], corpo }); return json(200, { id: '990000000000000001' }) }
    if (metodo === 'POST') { const id = `9000000000000000${String(mensagens.size + 10)}`; mensagens.set(id, { canal: msg[1], corpo }); return json(200, { id }) }
    if (!mensagens.has(msg[2])) return json(404, { code: 10008 })
    mensagens.set(msg[2], { canal: msg[1], corpo }); return json(200, { id: msg[2] })
  }
  if (/^\/interactions\/\d+\/[\w.-]+\/callback$/.test(rota)) { respostas.push(JSON.parse(init.body)); return new Response(null, { status: 204 }) }
  if (/^\/webhooks\/\d+\/[\w.-]+\/messages\/@original$/.test(rota)) { edicoes.push(JSON.parse(init.body).content); return json(200, {}) }
  return json(404, {})
}

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: 'test', JWT_SECRET: 'setagem-test-secret-with-enough-length-0123456789ab',
    DISCORD_CLIENT_ID: BOT, DISCORD_CLIENT_SECRET: 'segredo-teste', DISCORD_BOT_TOKEN: 'token-teste',
    DISCORD_GUILD_ID: guild, DISCORD_REDIRECT_URI: 'http://127.0.0.1/api/auth/discord/callback', DISCORD_DONO_ID: A,
  })
  data = Object.assign(makeData(), { solicitacoesAcesso: [], nextSolAcessoId: 1, nextContaId: 3 })
  data.cargosPermissao[0].admin = true                              // 10 = Commander (admin)
  data.cargosPermissao.push({ id: 30, nome: 'Recruta', padrao: true, permissoes: {} })
  const store = require('../dist/data')
  store.readData = () => structuredClone(data)
  store.peekData = () => data
  store.writeData = next => { data = structuredClone(next) }
  require('../dist/security/audit').audit = () => {}
  const express = require('express')
  const app = express()
  app.use(express.json({ limit: '5mb' }))
  app.use('/api/setagem', require('../dist/routes/setagem').default)
  app.use('/api/config', require('../dist/routes/config').default)   // aprovação: Configurações → Solicitações
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
const cfg = (versao, extra = {}) => ({ titulo: 'Solicitar set', descricao: null, categoriaId: CAT, canalId: CANAL, versao,
  aprovadores: [R_APROVA], imagem: null, rodapeTexto: null,
  patentes: [{ id: null, nome: 'Sargento', prefixo: 'SGT', roleIds: [R_SGT, R_APROVA], cargoPermId: 20 }, { id: null, nome: 'Cabo', prefixo: 'CB', roleIds: [R_CB], cargoPermId: null }], ...extra })
let n = 0
const interacao = (usuario, tipo, customId, campos = {}, { cargos = [], admin = false } = {}) => {
  const { lerInteracao } = require('../dist/discord')
  const d = { id: `95000000000000${String(++n).padStart(4, '0')}`, token: `tok_${'x'.repeat(30)}${n}`, type: tipo, guild_id: guild,
    member: { user: { id: usuario, username: `user${usuario.slice(-2)}`, global_name: `Nome ${usuario.slice(-2)}` }, roles: cargos, permissions: admin ? '8' : '1024' },
    data: tipo === 5 ? { custom_id: customId, components: Object.entries(campos).map(([k, v]) => ({ type: 18, component: k === 'patente' ? { type: 3, custom_id: k, values: [v] } : { type: 4, custom_id: k, value: v } })) }
      : { custom_id: customId } }
  return lerInteracao(d)
}
const tratar = i => require('../dist/setagem').tratarInteracao(i)
/** Todos os componentes (recursivo) de uma mensagem V2. */
const todos = comps => comps.flatMap(c => [c, ...todos(c.components ?? []), ...(c.accessory ? [c.accessory] : [])])
const pedidoDe = id => data.solicitacoesAcesso.find(s => s.discordId === id)

test('apelido: modelo com prefixo, codinome e ID; validação do modal', () => {
  const { montarApelido, validarPedido } = require('../dist/setagem')
  assert.equal(montarApelido('{prefixo} {codinome} | {id}', { prefixo: 'SGT', codinome: 'Raven', id: '123' }), 'SGT Raven | 123')
  const s = { modeloApelido: '{prefixo} {codinome} | {id}', patentes: [{ id: 1, nome: 'Sargento', prefixo: 'SGT', roleId: R_SGT }] }
  assert.equal(validarPedido(s, { codinome: 'Raven', passaporte: '123', patente: '1' }).apelido, 'SGT Raven | 123')
  for (const ruim of [{ codinome: '@everyone', passaporte: '1', patente: '1' }, { codinome: 'Ra`ven', passaporte: '1', patente: '1' }, { codinome: 'Raven', passaporte: '12a', patente: '1' },
    { codinome: 'Raven', passaporte: '1', patente: '9' }, { codinome: 'R', passaporte: '1', patente: '1' }, { codinome: 'Abcdefghijklmnopqrst', passaporte: '1234567890', patente: '1' }]) {
    assert.ok('erro' in validarPedido(s, ruim), JSON.stringify(ruim))
  }
})

test('interações: só eventos válidos; cargos e "Administrador" de quem clicou vêm do Discord', () => {
  const { lerInteracao } = require('../dist/discord')
  assert.equal(lerInteracao({ id: '1', token: 'x', type: 3 }), undefined)
  assert.equal(lerInteracao({ id: '950000000000000001', token: 'x'.repeat(40), type: 2, member: { user: { id: NOVO } }, data: { custom_id: 'a' } }), undefined)
  const i = interacao(STAFF, 3, 'du:set:aprovar:1', {}, { cargos: [R_APROVA], admin: false })
  assert.deepEqual(i.cargos, [R_APROVA]); assert.equal(i.administrador, false)
  assert.equal(interacao(QUALQUER, 3, 'x', {}, { admin: true }).administrador, true)
})

test('publicar antes de configurar avisa o motivo e não trava; modelo antigo "/" vira "|"', async () => {
  const { publicarSetagem, estadoSetagem, setagemAtual } = require('../dist/setagem')
  await publicarSetagem(true)
  assert.equal(estadoSetagem().erro, 'sem_canal')
  const antiga = setagemAtual({ setagem: { modeloApelido: '{prefixo} {codinome} / {id}', patentes: [{ id: 1, nome: 'X', prefixo: 'X', roleId: R_SGT }] } })
  assert.equal(antiga.modeloApelido, '{prefixo} {codinome} | {id}'); assert.deepEqual(antiga.patentes[0].roleIds, [R_SGT])
})

test('configuração: permissões, cargo perigoso, escalada de cargo, aprovadores, imagem e versão', async () => {
  await zerar()
  assert.equal((await req('GET', '/api/setagem')).status, 401)
  assert.equal((await req('GET', '/api/setagem', 2)).status, 403)
  const d = (await req('GET', '/api/setagem/discord', 1)).body
  assert.deepEqual(d.categorias.map(c => c.nome), ['PEDIDOS'])
  assert.equal(d.cargos.find(c => c.id === R_ADMIN).bloqueado, true)
  assert.ok(!JSON.stringify(d).includes(guild) && !JSON.stringify(d).includes(BOT))
  for (const ruim of [
    cfg(0, { categoriaId: CANAL }),                                                       // canal não é categoria
    cfg(0, { patentes: [{ id: null, nome: 'X', prefixo: 'X', roleIds: [R_CB, '610000000000000099'], cargoPermId: null }] }),   // cargo que não existe
    cfg(0, { patentes: [{ id: null, nome: 'X', prefixo: 'X', roleIds: [R_SGT, R_CB, R_APROVA], cargoPermId: null }] }),   // mais de 2 cargos
    cfg(0, { patentes: [{ id: null, nome: 'X', prefixo: 'X', roleIds: [R_SGT, R_SGT], cargoPermId: null }] }),   // cargo repetido
    cfg(0, { advertencias: [R_ADMIN, '', ''] }),                                          // advertência com cargo de Administrador
    { ...cfg(0), modeloApelido: '{codinome}' },                                            // modelo não é mais configurável
    cfg(0, { aprovadores: ['610000000000000099'] }),                                       // aprovador inexistente
    cfg(0, { imagem: 'javascript:alert(1)' }),
    cfg(0, { rodapeTexto: '@everyone' }),
  ]) assert.equal((await req('PUT', '/api/setagem', 1, ruim)).status, 400, JSON.stringify(ruim).slice(0, 120))
  data.cargosPermissao[1].permissoes.setagem = { ver: true, editar: true }
  assert.equal((await req('PUT', '/api/setagem', 2, cfg(0, { patentes: [{ id: null, nome: 'Sargento', prefixo: 'SGT', roleIds: [R_SGT], cargoPermId: 10 }] }))).status, 403)
  const r = await req('PUT', '/api/setagem', 1, cfg(0, { rodapeTexto: 'DU · Setagem' }))
  assert.equal(r.status, 200); assert.equal(r.body.config.versao, 1); assert.deepEqual(r.body.config.aprovadores, [R_APROVA])
  assert.deepEqual(r.body.config.patentes[0].roleIds, [R_SGT, R_APROVA]); assert.equal(r.body.config.modeloApelido, '{prefixo} {codinome} | {id}')
  assert.equal((await req('PUT', '/api/setagem', 1, cfg(0))).status, 409)
  // Painel em Componentes V2: botão + rodapé padrão (fotinha = emoji do bot + nome, embaixo à esquerda)
  const [painel] = [...mensagens.values()].map(m => m.corpo)
  assert.equal(painel.flags, 1 << 15); assert.equal(painel.embeds, undefined)
  const comps = todos(painel.components)
  assert.ok(comps.some(c => c.type === 2 && c.custom_id === 'du:setagem:abrir'))
  assert.ok(comps.some(c => c.type === 10 && /SGT Codinome \\?\| 12345/.test(c.content)))   // "|" escapado no markdown
  const rodape = painel.components[0].components.at(-1)
  assert.equal(rodape.type, 10); assert.match(rodape.content, /^-# <:du_[a-f0-9]{16}:\d+> \*\*DU · Setagem\*\*$/)
  // Linhas só entre o título e o conteúdo e entre o conteúdo e o rodapé
  const itens = painel.components[0].components
  // título · linha · passo a passo · apelido · botão · aviso · linha · rodapé
  assert.deepEqual(itens.map(c => (c.type === 14 ? (c.divider ? 'linha' : 'espaço') : c.type)), [10, 'linha', 10, 10, 1, 10, 'linha', 10])
  assert.match(itens[0].content, /^# Solicitar set\n/)
  assert.equal(painel.components[0].accent_color, 0x8b5cf6)
  assert.deepEqual(painel.allowed_mentions, { parse: [] })
})

test('painel da setagem: imagens soltas na posição escolhida (antes do botão), posição de hierarquia recusada', async () => {
  await zerar()
  const atuais = () => data.setagem.patentes.map(p => ({ id: p.id, nome: p.nome, prefixo: p.prefixo, roleIds: p.roleIds, cargoPermId: p.cargoPermId ?? null }))
  const salvarCom = imagens => req('PUT', '/api/setagem', 1, cfg(data.setagem.versao, { patentes: atuais(), imagens }))
  assert.equal((await salvarCom([{ posicao: `cargo:${R_SGT}`, url: 'https://x.y/a.png' }])).status, 400)
  assert.equal((await salvarCom([{ posicao: 'texto', url: 'file:///etc/passwd' }])).status, 400)
  const r = await salvarCom([{ posicao: 'texto', url: 'https://x.y/banner.png' }, { posicao: 'topo', url: 'https://x.y/topo.png' }, { posicao: 'botao', url: 'https://x.y/depois.png' }])
  assert.equal(r.status, 200); assert.equal(r.body.config.imagens.length, 3)
  const painel = mensagens.get(data.setagem.mensagemId).corpo
  const itens = painel.components[0].components
  assert.equal(itens[0].type, 12); assert.equal(itens[0].items[0].media.url, 'https://x.y/topo.png')
  const iBotao = itens.findIndex(c => c.type === 1)
  assert.equal(itens[iBotao - 1].type, 12); assert.equal(itens[iBotao - 1].items[0].media.url, 'https://x.y/banner.png')
  assert.equal(itens[iBotao + 1].type, 12); assert.equal(itens[iBotao + 1].items[0].media.url, 'https://x.y/depois.png')
  // Tira as imagens (os testes seguintes usam o painel sem elas)
  assert.equal((await salvarCom([])).status, 200)
  assert.ok(!mensagens.get(data.setagem.mensagemId).corpo.components[0].components.some(c => c.type === 12))
})

test('pedido: apelido e cargos só na aprovação; canal temporário privado com o painel do pedido; sem cargo antes da aprovação', async () => {
  chamadas.length = 0; edicoes.length = 0
  await tratar(interacao(NOVO, 5, 'du:setagem:modal', { codinome: 'Raven', passaporte: '12345', patente: '1' }))
  const p = pedidoDe(NOVO)
  assert.equal(p.setagem.apelido, 'SGT Raven | 12345'); assert.equal(p.setagem.status, 'pendente')
  assert.ok(!chamadas.includes(`PATCH /guilds/${guild}/members/${NOVO}`))                  // apelido só na aprovação
  assert.ok(!chamadas.some(c => c.startsWith('PUT')))
  // Canal temporário: na categoria, @everyone sem ver, cargo aprovador vê
  const canal = canaisCriados.at(-1)
  assert.equal(canal.corpo.parent_id, CAT); assert.equal(p.setagem.canalTemp, canal.id)
  assert.equal(canal.corpo.permission_overwrites.find(o => o.id === guild).deny, '1024')
  assert.ok(canal.corpo.permission_overwrites.some(o => o.id === R_APROVA && (BigInt(o.allow) & 0x400n)))
  assert.ok(!canal.corpo.permission_overwrites.some(o => o.id === NOVO))                  // quem pediu não vê a avaliação
  const painel = mensagens.get(p.setagem.mensagemTemp)
  assert.equal(painel.canal, canal.id); assert.equal(painel.corpo.flags, 1 << 15)
  const comps = todos(painel.corpo.components)
  assert.ok(comps.some(c => c.type === 10 && /\*\*Codinome:\*\* Raven/.test(c.content) && /\*\*Passaporte:\*\* 12345/.test(c.content)))
  assert.deepEqual(comps.filter(c => c.type === 2).map(c => c.label), ['Aprovar', 'Reprovar', 'Refazer preenchimento'])
  assert.match(edicoes.at(-1), /SGT Raven \| 12345/)
})

test('editar pedido: botão abre o modal preenchido; reenvio atualiza o MESMO pedido e canal; cadastro aprovado não pede', async () => {
  respostas.length = 0
  await tratar(interacao(NOVO, 3, 'du:setagem:abrir'))
  const modal = respostas.at(-1)
  assert.equal(modal.type, 9); assert.equal(modal.data.title, 'Editar pedido de set')
  assert.equal(modal.data.components[0].component.value, 'Raven'); assert.equal(modal.data.components[1].component.value, '12345')
  assert.equal(modal.data.components[2].component.options.find(o => o.default).value, '1')
  const canal = pedidoDe(NOVO).setagem.canalTemp
  require('../dist/setagem')                                     // espera de 30 s entre envios: simula o tempo passando
  const antes = canaisCriados.length
  const agora = Date.now; Date.now = () => agora() + 31_000
  await tratar(interacao(NOVO, 5, 'du:setagem:modal', { codinome: 'Raven', passaporte: '12345', patente: '2' }))
  Date.now = agora
  assert.equal(pedidoDe(NOVO).setagem.apelido, 'CB Raven | 12345')
  assert.equal(pedidoDe(NOVO).setagem.canalTemp, canal); assert.equal(canaisCriados.length, antes)   // mesmo canal
  assert.equal(data.solicitacoesAcesso.filter(s => s.discordId === NOVO).length, 1)
  await tratar(interacao(B, 3, 'du:setagem:abrir'))                                        // já tem cadastro
  assert.match(respostas.at(-1).data.content, /já possui cadastro/)
})

test('avaliar: só cargo aprovador/administrador/dono; ninguém avalia o próprio pedido', async () => {
  const id = pedidoDe(NOVO).id
  respostas.length = 0
  await tratar(interacao(QUALQUER, 3, `du:set:aprovar:${id}`))
  assert.match(respostas.at(-1).data.content, /não tem permissão/)
  await tratar(interacao(NOVO, 3, `du:set:aprovar:${id}`, {}, { cargos: [R_APROVA] }))
  assert.match(respostas.at(-1).data.content, /próprio pedido/)
  assert.ok(pedidoDe(NOVO))                                                               // nada foi aprovado
})

test('refazer preenchimento: motivo → confirmação → privado com botão para a setagem; pedido fica aguardando correção', async () => {
  const id = pedidoDe(NOVO).id
  respostas.length = 0; privados.length = 0
  await tratar(interacao(STAFF, 3, `du:set:corrigir:${id}`, {}, { cargos: [R_APROVA] }))
  assert.equal(respostas.at(-1).type, 9)
  await tratar(interacao(STAFF, 5, `du:set:motivo-corrigir:${id}`, { motivo: 'O passaporte não confere @everyone' }, { cargos: [R_APROVA] }))
  const conf = respostas.at(-1)
  assert.equal(conf.data.flags, 64); assert.match(conf.data.content, /NÃO é aprovado/)
  assert.ok(!conf.data.content.includes('@everyone'))                                     // menção removida do motivo
  assert.equal(privados.length, 0)                                                        // nada enviado antes de confirmar
  const confirmar = conf.data.components[0].components.find(c => c.label === 'Confirmar envio').custom_id
  // Outra pessoa não confirma a correção de quem digitou
  await tratar(interacao(QUALQUER, 3, confirmar, {}, { cargos: [R_APROVA] }))
  assert.match(respostas.at(-1).data.content, /expirou/)
  assert.equal(privados.length, 0)
  // Quem digitou confirma (precisa de um motivo novo, a confirmação anterior foi descartada)
  await tratar(interacao(STAFF, 5, `du:set:motivo-corrigir:${id}`, { motivo: 'O passaporte não confere' }, { cargos: [R_APROVA] }))
  const chave = respostas.at(-1).data.components[0].components[0].custom_id
  await tratar(interacao(STAFF, 3, chave, {}, { cargos: [R_APROVA] }))
  assert.equal(privados.length, 1)
  const dm = todos(privados[0].corpo.components)
  assert.equal(privados[0].corpo.flags, 1 << 15)
  assert.ok(dm.some(c => c.type === 10 && /O passaporte não confere/.test(c.content)))
  const link = dm.find(c => c.type === 2 && c.style === 5)
  assert.equal(link.url, `https://discord.com/channels/${guild}/${CANAL}`)
  assert.equal(pedidoDe(NOVO).setagem.status, 'correcao'); assert.ok(!data.contas.some(c => c.discordId === NOVO))
  assert.match(edicoes.at(-1), /privado/)
  // Painel do pedido mostra a correção
  const painel = todos(mensagens.get(pedidoDe(NOVO).setagem.mensagemTemp).corpo.components)
  assert.ok(painel.some(c => c.type === 10 && /Correção pedida por/.test(c.content)))
})

test('aprovar pelo Discord: conta com os dados, cargo da patente, aviso no privado e canal temporário apagado', async () => {
  const p = pedidoDe(NOVO)
  chamadas.length = 0; privados.length = 0
  await tratar(interacao(STAFF, 3, `du:set:aprovar:${p.id}`, {}, { cargos: [R_APROVA] }))
  const conta = data.contas.find(c => c.discordId === NOVO)
  assert.ok(conta); assert.equal(conta.cargoPermId, 30)                                  // Cabo não liga cargo do site → padrão
  assert.deepEqual(conta.cadastroSetagem, { codinome: 'Raven', passaporte: '12345', patente: 'Cabo' })
  // Aprovado = membro na hora (aparece em Membros), com os dados do pedido
  const membro = data.membros.find(m => m.id === conta.membroId)
  assert.ok(membro); assert.equal(membro.codinome, 'Raven'); assert.equal(membro.passaporte, '12345'); assert.equal(membro.patenteInterna, 'Cabo')
  assert.equal(membro.status, 'Ativo'); assert.ok(data.membrosOrder.includes(membro.id))
  assert.ok(data.notificacoes.some(n => n.titulo === 'Novo membro na unidade'))
  assert.ok(chamadas.includes(`PUT /guilds/${guild}/members/${NOVO}/roles/${R_CB}`))
  assert.ok(chamadas.includes(`PATCH /guilds/${guild}/members/${NOVO}`))                   // apelido troca na aprovação
  assert.equal(privados.length, 1)
  await new Promise(r => setTimeout(r, 5300))                                             // canal é apagado após 5 s
  assert.ok(chamadas.includes(`DELETE /channels/${p.setagem.canalTemp}`))
  // Segundo clique (outro aprovador ao mesmo tempo): já resolvido
  await tratar(interacao(STAFF, 3, `du:set:aprovar:${p.id}`, {}, { cargos: [R_APROVA] }))
  assert.match(respostas.at(-1).data.content, /já foi resolvido/)
})

test('reprovar pelo Discord: motivo no privado, pedido removido e canal apagado; pelo site também', async () => {
  const agora = Date.now; Date.now = () => agora() + 120_000
  await tratar(interacao(OUTRO, 5, 'du:setagem:modal', { codinome: 'Ghost', passaporte: '999', patente: '2' }))
  Date.now = agora
  const p = pedidoDe(OUTRO)
  privados.length = 0
  await tratar(interacao(A, 5, `du:set:motivo-reprovar:${p.id}`, { motivo: 'Não faz parte da unidade' }))   // dono avalia
  assert.ok(!pedidoDe(OUTRO))
  assert.ok(todos(privados[0].corpo.components).some(c => c.type === 10 && /Não faz parte da unidade/.test(c.content)))
  // Pelo site
  await zerar()
  data.solicitacoesAcesso.push({ id: 50, discordId: QUALQUER, username: 'q', nome: 'X', criadoEm: new Date().toISOString(),
    setagem: { codinome: 'Q', passaporte: '777', patenteId: 2, apelido: 'CB Q | 777', em: new Date().toISOString(), canalTemp: '530000000000000099' } })
  const lista = (await req('GET', '/api/config/solicitacoes-acesso', 1)).body
  const q = lista.find(x => x.id === 50)
  assert.equal(q.setagem.status, 'pendente'); assert.equal(q.setagem.codinome, 'Q'); assert.equal(q.setagem.patente.nome, 'Cabo')
  assert.ok(!JSON.stringify(lista).includes(QUALQUER))                                    // sem o ID do Discord
  assert.equal((await req('GET', '/api/config/solicitacoes-acesso', 2)).status, 403)       // só admin
  privados.length = 0
  assert.equal((await req('DELETE', '/api/config/solicitacoes-acesso/50', 1)).status, 200)
  assert.equal(privados.length, 1)                                                        // avisou no privado
  assert.equal((await req('DELETE', '/api/config/solicitacoes-acesso/50', 1)).status, 404)
  assert.equal((await req('GET', '/api/setagem/solicitacoes', 1)).status, 404)             // não fica mais na Setagem
})

test('aprovar em Configurações → Solicitações: dá os 2 cargos da patente; cargo do site limitado a quem aprova', async () => {
  await zerar()
  data.solicitacoesAcesso.push({ id: 60, discordId: '710000000000000077', username: 'z', nome: 'Z', criadoEm: new Date().toISOString(),
    setagem: { codinome: 'Zed', passaporte: '555', patenteId: 1, apelido: 'SGT Zed | 555', em: new Date().toISOString() } })
  assert.equal((await req('POST', '/api/config/solicitacoes-acesso/60/aprovar', 2, {})).status, 403)   // não é admin
  // Admin que não é dev não dá cargo de dev pelo pedido
  data.cargosPermissao.push({ id: 40, nome: 'Dev', dev: true, permissoes: {} })
  data.contas[1].cargoPermId = 10
  assert.equal((await req('POST', '/api/config/solicitacoes-acesso/60/aprovar', 2, { cargoPermId: 40 })).status, 403)
  chamadas.length = 0
  const r = await req('POST', '/api/config/solicitacoes-acesso/60/aprovar', 1, {})
  assert.equal(r.status, 201); assert.equal(r.body.cargoDiscord, 'ok')
  const conta = data.contas.find(c => c.id === r.body.id)
  assert.equal(conta.cargoPermId, 20)                                                      // cargo do site da patente
  assert.deepEqual(conta.cadastroSetagem, { codinome: 'Zed', passaporte: '555', patente: 'Sargento' })
  assert.equal(data.membros.find(m => m.id === conta.membroId)?.passaporte, '555')   // membro na hora também por Solicitações
  for (const role of [R_SGT, R_APROVA]) assert.ok(chamadas.includes(`PUT /guilds/${guild}/members/710000000000000077/roles/${role}`), role)
  assert.ok(!JSON.stringify(r.body).includes('password'))
})

test('vínculo conta ↔ efetivo: aprovada sem ficha ganha a sua; exonerada/sem cargo não; não duplica', () => {
  const { vincularContasAoEfetivo } = require('../dist/setagem')
  const d = {
    membros: [], membrosOrder: [], nextMemId: 5,
    cargosPermissao: [{ id: 7, nome: '(DU) Probationary' }],
    contas: [
      { id: 1, username: 'admin', ativo: true, cargoPermId: 7, nomeServidor: 'Vilão' },
      { id: 2, username: 'g', ativo: true, cargoPermId: 7, nomeServidor: 'SO. Peter Wolf | 4599', cadastroSetagem: { codinome: 'Peter Wolf', passaporte: '4599', patente: 'Senior Officer' } },
      { id: 3, username: 'x', ativo: true, cargoPermId: 7, exonerado: true },
      { id: 4, username: 'y', ativo: true },
      { id: 5, username: 'z', ativo: true, cargoPermId: 7, membroArquivado: { id: 2, policial: 'Antigo', codinome: 'A', badge: '9', passaporte: '1', patenteDPD: '', patenteInterna: 'X', status: 'Exonerado' } },
    ],
  }
  assert.equal(vincularContasAoEfetivo(d), 3)
  assert.equal(d.membros.length, 3); assert.deepEqual(d.membrosOrder.sort(), [2, 5, 6])
  const ficha2 = d.membros.find(m => m.id === d.contas[1].membroId)
  assert.equal(ficha2.codinome, 'Peter Wolf'); assert.equal(ficha2.passaporte, '4599'); assert.equal(ficha2.patenteInterna, 'Senior Officer')
  assert.equal(d.membros.find(m => m.id === d.contas[0].membroId).patenteInterna, '(DU) Probationary')
  assert.equal(d.contas[4].membroId, 2); assert.equal(d.membros.find(m => m.id === 2).status, 'Ativo'); assert.equal(d.contas[4].membroArquivado, undefined)
  assert.equal(d.contas[2].membroId, undefined); assert.equal(d.contas[3].membroId, undefined)
  assert.equal(vincularContasAoEfetivo(d), 0)                                  // já vinculadas: nada muda
})
