// Painel de hierarquia no Discord (mensagem do bot editada sozinha). API do Discord simulada.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'du-hier-'))
process.env.DATA_PATH = path.join(pasta, 'data.json')
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { makeData, guild } = require('./ranking-fixtures.cjs')

const secret = 'hierarquia-test-secret-with-enough-length-0123456789'
const BOT = '222222222222222222'
const CANAL = '510000000000000001'
const CANAL_2 = '510000000000000002'
const R_CMD = '610000000000000001'      // cargo Commander
const R_OFF = '610000000000000002'      // cargo Officer
const R_OUTRO = '610000000000000003'
const A = '333333333333333333'          // conta 1 (fixture)
const B = '444444444444444444'          // conta 2 (fixture)
const C = '710000000000000001'          // sem conta no site
let server, base, data

// ── Discord simulado ────────────────────────────────────────────────────────
const cargosDe = new Map([[A, [R_CMD, R_OFF]], [B, [R_OFF]], [C, [R_OFF]]])
let intentLigada = true
let mensagens = new Map()                // id → corpo
let proximaMsg = 1
let canalProibido = false
const chamadas = []
const emojisApp = []                     // emojis do bot (fotinha do rodapé)
/** Lê o painel V2 (título · linha · cargos · linha · rodapé) nas mesmas partes do formato antigo, para conferir. */
function v2ParaPartes(corpo) {
  const itens = corpo.components[0].components.filter(c => c.type !== 12)   // galerias (imagens soltas) à parte
  const cab = itens[0], rod = itens.at(-1)
  const divisores = itens.map((c, i) => (c.type === 14 ? i : -1)).filter(i => i >= 0)
  const l1 = itens[divisores[0]], l2 = itens[divisores[1]]
  const conteudo = { content: itens.slice(divisores[0] + 1, divisores[1]).map(c => c.content).join('\n\n') }
  const tituloTxt = (cab.type === 9 ? cab.components[0].content : cab.content).split('\n')[0]
  // Rodapé (regra): "-# <emoji> **Nome**" — fotinha pequena + nome, embaixo à esquerda
  const rodM = /^-# (?:<a?:(\w+):\d+> )?\*\*(.*)\*\*$/.exec(rod.content)
  return {
    title: tituloTxt.replace(/^# /, ''),
    corPainel: corpo.components[0].accent_color,
    description: conteudo.content,
    ...(cab.type === 9 ? { thumbnail: { url: cab.accessory.media.url } } : {}),
    footer: { text: rodM[2], ...(rodM[1] ? { emoji: rodM[1] } : {}) },
    rodapeTipo: rod.type,
    linhas: [l1, l2].filter(x => x.type === 14 && x.divider === true).length,
  }
}

const fetchReal = globalThis.fetch
globalThis.fetch = async (url, init = {}) => {
  const u = String(url)
  if (u.startsWith('https://cdn.discordapp.com/')) {
    return new Response(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 5)]), { status: 200, headers: { 'Content-Type': 'image/png' } })
  }
  if (!u.startsWith('https://discord.com/')) return fetchReal(url, init)
  const metodo = init.method ?? 'GET'
  chamadas.push(`${metodo} ${u.replace('https://discord.com/api/v10', '')}`)
  const json = (s, b) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
  const rota = u.replace('https://discord.com/api/v10', '')
  if (rota === `/guilds/${guild}?with_counts=true`) return json(200, { id: guild, name: 'Detective Unit' })
  if (rota === `/guilds/${guild}/emojis`) return json(200, [])
  if (rota === `/applications/${BOT}/emojis` && (init.method ?? 'GET') === 'GET') return json(200, { items: emojisApp })
  if (rota === `/applications/${BOT}/emojis` && init.method === 'POST') {
    const corpoEmoji = JSON.parse(init.body); const id = `88000000000000000${emojisApp.length + 1}`
    emojisApp.push({ id, name: corpoEmoji.name, animated: false }); return json(201, { id })
  }
  if (rota === `/guilds/${guild}/roles`) return json(200, [
    { id: guild, name: '@everyone', position: 0 }, { id: R_CMD, name: 'Commander', position: 3, color: 1 },
    { id: R_OFF, name: 'Officer', position: 2 }, { id: R_OUTRO, name: 'Outro', position: 1 }, { id: '610000000000000009', name: 'BotRole', managed: true }])
  if (rota === `/guilds/${guild}/channels`) return json(200, [{ id: CANAL, name: 'hierarquia', type: 0 }, { id: CANAL_2, name: 'geral', type: 0 }, { id: '510000000000000003', name: 'voz', type: 2 }])
  if (rota === '/users/@me') return json(200, { id: BOT, username: 'Detective Unit', avatar: 'a'.repeat(32) })
  if (rota.startsWith(`/guilds/${guild}/members?`)) {
    if (!intentLigada) return json(403, { code: 50001, message: 'Missing Access' })
    return json(200, [...cargosDe].map(([id, roles]) => ({ user: { id }, roles })).concat([{ user: { id: BOT, bot: true }, roles: [R_CMD] }]))
  }
  const m = rota.match(/^\/guilds\/\d+\/members\/(\d+)$/)
  if (m) return cargosDe.has(m[1]) ? json(200, { roles: cargosDe.get(m[1]) }) : json(404, { code: 10007 })
  const msg = rota.match(/^\/channels\/(\d+)\/messages(?:\/(\d+))?$/)
  if (msg) {
    if (canalProibido) return json(403, { code: 50013 })
    if (metodo === 'DELETE') { mensagens.delete(msg[2]); return new Response(null, { status: 204 }) }
    const corpo = { ...JSON.parse(init.body.get('payload_json')), arquivos: [...init.body.keys()].filter(k => k.startsWith('files[')).map(k => init.body.get(k).name) }
    corpo.embeds = [v2ParaPartes(corpo)]
    if (metodo === 'POST') { const id = `90000000000000000${proximaMsg++}`; mensagens.set(id, corpo); return json(200, { id }) }
    if (metodo === 'PATCH') { if (!mensagens.has(msg[2])) return json(404, { code: 10008 }); mensagens.set(msg[2], corpo); return json(200, { id: msg[2] }) }
  }
  return json(404, {})
}

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: 'test', JWT_SECRET: secret,
    DISCORD_CLIENT_ID: BOT, DISCORD_CLIENT_SECRET: 'segredo-teste', DISCORD_BOT_TOKEN: 'token-teste',
    DISCORD_GUILD_ID: guild, DISCORD_REDIRECT_URI: 'http://127.0.0.1/api/auth/discord/callback', DISCORD_DONO_ID: A,
  })
  data = Object.assign(makeData(), { solicitacoesAcesso: [], nextSolAcessoId: 1, nextContaId: 3 })
  data.cargosPermissao[0].admin = true                                  // conta 1 = admin; conta 2 = Officer (sem a área)
  const store = require('../dist/data')
  store.readData = () => structuredClone(data)
  store.peekData = () => data
  store.writeData = next => { data = structuredClone(next) }
  require('../dist/security/audit').audit = () => {}
  const express = require('express')
  const app = express()
  app.use(express.json({ limit: '5mb' }))   // igual à rota de upload do site (index.ts)
  app.use('/api/hierarquia', require('../dist/routes/hierarquia').default)
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
async function zerar() { await require('../dist/middleware/rateLimiter').hierarquiaLimiter.resetKey('::ffff:127.0.0.1'); await require('../dist/middleware/rateLimiter').hierarquiaLimiter.resetKey('127.0.0.1') }
const cfgBase = (versao, extra = {}) => ({ titulo: 'Detective Unit', logo: null, rodapeTexto: null, rodapeIcone: null, canalId: CANAL, versao,
  cargos: [{ roleId: R_CMD, nome: 'Commander', emoji: '⭐' }, { roleId: R_OFF, nome: 'Officer' }], ...extra })
const espera = () => require('../dist/hierarquia').atualizarPainel(true)

test('montarPainel: ordem configurada, cada pessoa só no cargo mais alto, "Vago", sem linha, rodapé', () => {
  const { montarPainel } = require('../dist/hierarquia')
  const membros = new Map([[A, [R_CMD, R_OFF]], [B, [R_OFF]]])
  const e = montarPainel({ titulo: 'DU', cargos: [{ roleId: R_CMD, nome: 'Commander', emoji: '⭐' }, { roleId: R_OFF, nome: 'Off*cer' }, { roleId: R_OUTRO, nome: 'Outro' }], versao: 1, logo: 'https://x.y/l.png' },
    membros, { nome: 'Detective Unit', botAvatar: 'https://cdn.discordapp.com/avatars/1/a.png' })
  assert.equal(e.description, `⭐ **Commander**\n<@${A}>\n\n**Off\\*cer**\n<@${B}>\n\n**Outro**\n*Vago*`)
  assert.equal(e.color, 0x2b2d31)                                           // barra lateral some no tema escuro
  assert.deepEqual(e.footer, { text: 'Detective Unit', icon_url: 'https://cdn.discordapp.com/avatars/1/a.png' })
  assert.deepEqual(e.thumbnail, { url: 'https://x.y/l.png' })
  // Muitos membros: corta com "+N" dentro do limite do Discord
  const muitos = new Map(Array.from({ length: 300 }, (_, i) => [`8${String(i).padStart(17, '0')}`, [R_OFF]]))
  const grande = montarPainel({ titulo: 'DU', cargos: [{ roleId: R_OFF, nome: 'Officer' }], versao: 1 }, muitos, { nome: 'S' })
  assert.ok(grande.description.length <= 4000); assert.match(grande.description, /\n\+\d+$/)
})

test('permissões: sem a área não vê; só "editar" salva; anônimo não entra', async () => {
  await zerar()
  assert.equal((await req('GET', '/api/hierarquia')).status, 401)
  assert.equal((await req('GET', '/api/hierarquia', 2)).status, 403)
  assert.equal((await req('PUT', '/api/hierarquia', 2, cfgBase(0))).status, 403)
  const r = await req('GET', '/api/hierarquia', 1)
  assert.equal(r.status, 200); assert.equal(r.body.config.versao, 0)
  const d = await req('GET', '/api/hierarquia/discord', 1)
  assert.equal(d.status, 200)
  assert.equal(d.body.servidor, 'Detective Unit')
  assert.deepEqual(d.body.cargos.map(c => c.nome), ['Commander', 'Officer', 'Outro'])   // sem @everyone e cargo de bot
  assert.deepEqual(d.body.canais.map(c => c.nome), ['hierarquia', 'geral'])            // só canais de texto
  assert.ok(!JSON.stringify(d.body).includes(BOT) && !JSON.stringify(d.body).includes(guild))   // sem ID do bot/servidor
})

test('salvar: valida (cargo/canal do servidor, emoji, logo https, repetidos) e publica a mensagem', async () => {
  await zerar()
  for (const errado of [
    cfgBase(0, { canalId: '510000000000000099' }),
    cfgBase(0, { cargos: [{ roleId: '610000000000000099', nome: 'X' }] }),
    cfgBase(0, { cargos: [{ roleId: R_CMD, nome: 'A' }, { roleId: R_CMD, nome: 'B' }] }),
    cfgBase(0, { cargos: [{ roleId: R_CMD, nome: 'A', emoji: '<@123456789012345678>' }] }),
    cfgBase(0, { logo: 'data:image/png;base64,' + Buffer.from('nao e imagem de verdade').toString('base64') }),   // bytes não são PNG
    cfgBase(0, { rodapeIcone: 'data:image/png;base64,' + Buffer.alloc(1_100_000, 1).toString('base64') }),      // > 1 MB
    cfgBase(0, { rodapeIcone: 'file:///etc/passwd' }),
    cfgBase(0, { logo: 'javascript:alert(1)' }),
    { ...cfgBase(0), extra: 1 },
  ]) assert.equal((await req('PUT', '/api/hierarquia', 1, errado)).status, 400, JSON.stringify(errado).slice(0, 90))

  const r = await req('PUT', '/api/hierarquia', 1, cfgBase(0, { logo: 'https://exemplo.com/logo.png' }))
  assert.equal(r.status, 200); assert.equal(r.body.config.versao, 1)
  await espera()
  assert.equal(mensagens.size, 1)
  const [corpo] = [...mensagens.values()]
  assert.deepEqual(corpo.allowed_mentions, { parse: [] })                   // menções não notificam
  assert.equal(corpo.flags, 1 << 15)                                        // Componentes V2
  assert.equal(corpo.embeds[0].linhas, 2)                                   // linha só após o título e antes do rodapé
  assert.equal(corpo.embeds[0].footer.text, 'Detective Unit')
  assert.match(corpo.embeds[0].footer.emoji, /^du_[a-f0-9]{16}$/)                  // foto do bot vira emoji do bot no rodapé
  assert.equal(corpo.embeds[0].rodapeTipo, 10)                                         // uma linha de texto (sem miniatura grande)
  assert.match(corpo.embeds[0].description, new RegExp(`## Officer\\n> <@${B}>\\n> <@${C}>`))   // um bloco por cargo, sem contador ao lado; C sem conta aparece (intent ligada)
  assert.equal(corpo.embeds[0].corPainel, 0x8b5cf6)                                    // barra lateral roxa
  assert.ok(data.hierarquia.mensagemId)
})

test('atualização: só edita quando muda; quem perde o cargo sai; mensagem apagada é refeita', async () => {
  const { atualizarPainel } = require('../dist/hierarquia')
  chamadas.length = 0
  await atualizarPainel()                                                    // nada mudou
  assert.ok(!chamadas.some(c => c.startsWith('PATCH') || c.startsWith('POST')))
  cargosDe.set(B, [])                                                        // B perdeu o cargo
  require('../dist/discord').esquecerCacheDiscord()                         // = rodada seguinte (60 s depois)
  await atualizarPainel()
  assert.ok(chamadas.some(c => c.startsWith('PATCH')))
  const desc = [...mensagens.values()][0].embeds[0].description
  assert.ok(!desc.includes(B)); assert.ok(desc.includes(C))
  mensagens = new Map()                                                      // alguém apagou a mensagem no Discord
  await atualizarPainel(true)
  assert.equal(mensagens.size, 1)
  assert.equal(data.hierarquia.mensagemId, [...mensagens.keys()][0])
  // A prévia do site não leva IDs do Discord (menções viram nomes)
  const prev = (await req('GET', '/api/hierarquia', 1)).body.estado.previa
  assert.ok(!/\d{17,20}/.test(JSON.stringify(prev)), 'prévia com ID do Discord')
  assert.match(prev.texto, /@comando|@membro/)
  assert.equal(prev.rodape, 'Detective Unit')
})

test('edição simultânea: quem salva com versão velha recebe 409 e a versão nova (nada é sobrescrito)', async () => {
  await zerar()
  const v = data.hierarquia.versao
  const pessoa1 = req('PUT', '/api/hierarquia', 1, cfgBase(v, { titulo: 'Pessoa 1' }))
  const pessoa2 = req('PUT', '/api/hierarquia', 1, cfgBase(v, { titulo: 'Pessoa 2' }))
  const rs = await Promise.all([pessoa1, pessoa2])
  assert.deepEqual(rs.map(r => r.status).sort(), [200, 409])
  const perdeu = rs.find(r => r.status === 409)
  assert.equal(perdeu.body.config.versao, v + 1)
  assert.equal(data.hierarquia.titulo, rs.find(r => r.status === 200).body.config.titulo)
  assert.equal(data.hierarquia.versao, v + 1)
})

test('sem "Server Members Intent": usa só quem tem conta no site; bot sem acesso ao canal vira aviso', async () => {
  await zerar()
  intentLigada = false
  cargosDe.set(B, [R_OFF])
  await espera()
  const desc = [...mensagens.values()].at(-1).embeds[0].description
  assert.ok(desc.includes(A)); assert.ok(!desc.includes(C))                 // C não tem conta no site
  assert.equal((await req('GET', '/api/hierarquia', 1)).body.estado.modo, 'contas')
  canalProibido = true
  cargosDe.set(B, [])
  await espera()
  assert.equal((await req('GET', '/api/hierarquia', 1)).body.estado.erro, 'sem_acesso')
  canalProibido = false
  // Trocar de canal publica uma mensagem nova no canal novo
  const antes = mensagens.size
  assert.equal((await req('PUT', '/api/hierarquia', 1, cfgBase(data.hierarquia.versao, { canalId: CANAL_2 }))).status, 200)
  await espera()
  assert.equal(mensagens.size, antes + 1)
})

test('várias hierarquias: cria quantas quiser, cada uma no seu canal; excluir apaga só a mensagem dela', async () => {
  await zerar()
  intentLigada = true; canalProibido = false
  // Sem permissão de editar não cria; nome é obrigatório e sem campos a mais
  assert.equal((await req('POST', '/api/hierarquia/paineis', 2, { titulo: 'X' })).status, 403)
  assert.equal((await req('POST', '/api/hierarquia/paineis', 1, { titulo: '' })).status, 400)
  assert.equal((await req('POST', '/api/hierarquia/paineis', 1, { titulo: 'X', canalId: CANAL })).status, 400)
  const c1 = await req('POST', '/api/hierarquia/paineis', 1, { titulo: 'Oficiais' })
  const c2 = await req('POST', '/api/hierarquia/paineis', 1, { titulo: 'Comando' })
  assert.equal(c1.status, 201); assert.equal(c2.status, 201)
  const [id1, id2] = [c1.body.config.id, c2.body.config.id]
  assert.ok(id1 >= 1 && id2 > id1)
  assert.deepEqual(c2.body.paineis.map(p => p.id), [0, id1, id2])                  // principal sempre primeiro
  // IDs inválidos ou inexistentes
  for (const r of ['/paineis/abc', '/paineis/-1', '/paineis/01', `/paineis/${id2 + 50}`]) assert.equal((await req('GET', `/api/hierarquia${r}`, 1)).status, 404, r)
  assert.equal((await req('GET', `/api/hierarquia/paineis/${id1}`, 2)).status, 403)

  // Cada uma salva e publica separada (a principal continua no canal dela)
  await zerar()
  const principalAntes = data.hierarquia.mensagemId
  assert.equal((await req('PUT', `/api/hierarquia/paineis/${id1}`, 1, cfgBase(0, { titulo: 'Oficiais', canalId: CANAL, cargos: [{ roleId: R_OFF, nome: 'Officer' }] }))).status, 200)
  assert.equal((await req('PUT', `/api/hierarquia/paineis/${id2}`, 1, cfgBase(0, { titulo: 'Comando', canalId: CANAL_2, cargos: [{ roleId: R_CMD, nome: 'Commander' }] }))).status, 200)
  assert.equal((await req('PUT', `/api/hierarquia/paineis/${id2}`, 1, cfgBase(0, { titulo: 'Velha' }))).status, 409)   // versão velha
  await espera()
  const extra1 = data.hierarquiasExtras.find(h => h.id === id1), extra2 = data.hierarquiasExtras.find(h => h.id === id2)
  assert.ok(extra1.mensagemId && extra2.mensagemId && extra1.mensagemId !== extra2.mensagemId)
  assert.equal(data.hierarquia.mensagemId, principalAntes)                           // principal intacta
  assert.equal(mensagens.get(extra1.mensagemId).embeds[0].title, 'Oficiais')
  assert.ok(mensagens.get(extra2.mensagemId).embeds[0].description.includes(A))
  assert.ok(!mensagens.get(extra2.mensagemId).embeds[0].description.includes(B))   // B não é Commander
  const g = await req('GET', `/api/hierarquia/paineis/${id2}`, 1)
  assert.equal(g.body.config.titulo, 'Comando'); assert.equal(g.body.estado.previa.titulo, 'Comando')
  assert.ok(!/\d{17,20}/.test(JSON.stringify(g.body.estado.previa)) && !JSON.stringify(g.body).includes(extra2.mensagemId))   // sem IDs do Discord

  // Excluir: principal não sai; extra sai junto com a mensagem dela (e só a dela)
  await zerar()
  assert.equal((await req('DELETE', '/api/hierarquia/paineis/0', 1)).status, 400)
  assert.equal((await req('DELETE', `/api/hierarquia/paineis/${id1}`, 2)).status, 403)
  const msg1 = extra1.mensagemId
  const del = await req('DELETE', `/api/hierarquia/paineis/${id1}`, 1)
  assert.equal(del.status, 200); assert.deepEqual(del.body.paineis.map(p => p.id), [0, id2])
  await new Promise(r => setTimeout(r, 50))
  assert.ok(!mensagens.has(msg1)); assert.ok(mensagens.has(extra2.mensagemId)); assert.ok(mensagens.has(principalAntes))
  assert.equal((await req('PUT', `/api/hierarquia/paineis/${id1}`, 1, cfgBase(1))).status, 404)
  // Um id excluído não é reaproveitado
  const c3 = await req('POST', '/api/hierarquia/paineis', 1, { titulo: 'Nova' })
  assert.ok(c3.body.config.id > id2)
  // Limpa: os testes seguintes olham só o painel principal
  for (const id of [id2, c3.body.config.id]) assert.equal((await req('DELETE', `/api/hierarquia/paineis/${id}`, 1)).status, 200)
  await new Promise(r => setTimeout(r, 50))
  assert.deepEqual(data.hierarquiasExtras, [])
})

test('imagens soltas: em qualquer posição (topo, título, depois de um cargo, fim), validadas; painel em letra grande', async () => {
  await zerar()
  intentLigada = true; canalProibido = false
  const png = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 3)]).toString('base64')
  const v = () => data.hierarquia.versao
  for (const imagens of [
    [{ posicao: `cargo:${R_OUTRO}`, url: 'https://x.y/a.png' }],                  // cargo que não está no painel
    [{ posicao: 'lateral', url: 'https://x.y/a.png' }],                             // posição desconhecida
    [{ posicao: 'topo', url: 'javascript:alert(1)' }],
    [{ posicao: 'topo', url: 'data:image/png;base64,' + Buffer.from('falso').toString('base64') }],
    Array.from({ length: 5 }, () => ({ posicao: 'fim', url: 'https://x.y/a.png' })), // mais de 4
  ]) assert.equal((await req('PUT', '/api/hierarquia', 1, cfgBase(v(), { imagens }))).status, 400, JSON.stringify(imagens).slice(0, 80))

  const imagens = [{ posicao: 'topo', url: png }, { posicao: `cargo:${R_CMD}`, url: 'https://x.y/banner.png' }, { posicao: 'fim', url: 'https://x.y/fim.png' }]
  const r = await req('PUT', '/api/hierarquia', 1, cfgBase(v(), { imagens }))
  assert.equal(r.status, 200); assert.deepEqual(r.body.config.imagens.map(i => i.posicao), ['topo', `cargo:${R_CMD}`, 'fim'])
  await espera()
  const corpo = mensagens.get(data.hierarquia.mensagemId)
  const itens = corpo.components[0].components
  assert.equal(itens[0].type, 12); assert.equal(itens[0].items[0].media.url, 'attachment://imagem-1.png')   // upload vira anexo
  assert.deepEqual(corpo.arquivos, ['imagem-1.png'])
  const iCmd = itens.findIndex(c => c.type === 10 && c.content.startsWith('## ⭐ Commander'))
  assert.ok(iCmd > 0); assert.equal(itens[iCmd + 1].type, 12); assert.equal(itens[iCmd + 1].items[0].media.url, 'https://x.y/banner.png')   // logo depois do cargo
  assert.match(itens[iCmd + 2].content, /^## Officer/)
  assert.equal(itens.at(-3).type, 12); assert.equal(itens.at(-3).items[0].media.url, 'https://x.y/fim.png')   // fim: antes da linha do rodapé
  // Prévia do site: posição "depois do cargo" vira o número do bloco (sem ID do cargo)
  const prev = (await req('GET', '/api/hierarquia', 1)).body.estado.previa
  assert.deepEqual(prev.imagens.map(i => i.posicao), ['topo', 'bloco:0', 'fim'])
  assert.ok(!/\d{17,20}/.test(JSON.stringify(prev)))
  // Lado: imagem sozinha à direita = galeria [quadro transparente, imagem]; à esquerda = [imagem, quadro]
  assert.equal((await req('PUT', '/api/hierarquia', 1, cfgBase(v(), { imagens: [{ posicao: 'topo', url: 'https://x.y/d.png', lado: 'direita' }, { posicao: 'fim', url: 'https://x.y/e.png', lado: 'esquerda' }] }))).status, 200)
  assert.equal((await req('PUT', '/api/hierarquia', 1, cfgBase(v(), { imagens: [{ posicao: 'topo', url: 'https://x.y/d.png', lado: 'centro' }] }))).status, 400)
  await espera()
  const comLado = mensagens.get(data.hierarquia.mensagemId)
  const itensLado = comLado.components[0].components
  assert.deepEqual(itensLado[0].items.map(x => x.media.url), ['attachment://espaco.png', 'https://x.y/d.png'])
  assert.deepEqual(itensLado.at(-3).items.map(x => x.media.url), ['https://x.y/e.png', 'attachment://espaco.png'])
  assert.deepEqual(comLado.arquivos, ['espaco.png'])                                    // o quadro vai uma vez só
  assert.ok(!JSON.stringify(itensLado).includes(' membros ·') && !JSON.stringify(itensLado).includes(' membro ·'))   // sem contador
  // Sem imagens de novo: some tudo
  assert.equal((await req('PUT', '/api/hierarquia', 1, cfgBase(v()))).status, 200)
  await espera()
  assert.ok(!mensagens.get(data.hierarquia.mensagemId).components[0].components.some(c => c.type === 12))
})

test('imagens: logo e foto do rodapé por upload (anexo) ou link; texto do rodapé configurável', async () => {
  await zerar()
  intentLigada = true; canalProibido = false
  const png = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]).toString('base64')
  // Upload da logo + foto do rodapé por link + texto próprio
  let r = await req('PUT', '/api/hierarquia', 1, cfgBase(data.hierarquia.versao, { logo: png, rodapeIcone: 'http://exemplo.com/rodape.png', rodapeTexto: 'DU — Detroit' }))
  assert.equal(r.status, 200)
  await espera()
  let corpo = [...mensagens.values()].at(-1)
  assert.equal(corpo.embeds[0].thumbnail.url, 'attachment://logo.png')
  assert.deepEqual(corpo.arquivos, ['logo.png']); assert.deepEqual(corpo.attachments, [{ id: 0, filename: 'logo.png' }])
  assert.deepEqual(corpo.embeds[0].footer, { text: 'DU — Detroit' })                 // link externo: backend não baixa → só o nome
  // Prévia do site mostra as imagens configuradas (sem IDs)
  const prev = (await req('GET', '/api/hierarquia', 1)).body.estado.previa
  assert.equal(prev.logo, png); assert.equal(prev.rodapeIcone, 'http://exemplo.com/rodape.png'); assert.equal(prev.rodape, 'DU — Detroit')
  // Foto do rodapé por upload; logo por link; sem texto = nome do servidor
  r = await req('PUT', '/api/hierarquia', 1, cfgBase(data.hierarquia.versao, { logo: 'https://exemplo.com/logo.png', rodapeIcone: png }))
  assert.equal(r.status, 200)
  await espera()
  corpo = [...mensagens.values()].at(-1)
  assert.equal(corpo.embeds[0].thumbnail.url, 'https://exemplo.com/logo.png')
  assert.equal(corpo.embeds[0].footer.text, 'Detective Unit'); assert.match(corpo.embeds[0].footer.emoji, /^du_/)   // upload vira emoji do bot
  assert.deepEqual(corpo.arquivos, [])                                               // rodapé não é anexo; o anexo antigo da logo sai
  // Tudo opcional: sem imagens = sem anexos e foto do bot no rodapé
  r = await req('PUT', '/api/hierarquia', 1, cfgBase(data.hierarquia.versao))
  await espera()
  corpo = [...mensagens.values()].at(-1)
  assert.equal(corpo.embeds[0].thumbnail, undefined); assert.deepEqual(corpo.arquivos, []); assert.deepEqual(corpo.attachments, [])
  assert.match(corpo.embeds[0].footer.emoji, /^du_/)
})
