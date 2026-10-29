// Árvore de investigação: quadros, cards com fotos (arquivo/link), linhas, chat e versões.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'du-arvore-'))
process.env.DATA_PATH = path.join(pasta, 'data.json')
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { makeData } = require('./ranking-fixtures.cjs')

let server, base, data
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)])

before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: 'arvore-test-secret-with-enough-length-0123456789ab' })
  data = Object.assign(makeData(), { inqueritos: [{ id: 5, numero: 'INQ-005', titulo: 'Ballas', status: 'Aberto' }] })
  data.cargosPermissao[0].admin = true                     // conta 1 admin; conta 2 sem a área
  const store = require('../dist/data')
  store.readData = () => structuredClone(data)
  store.peekData = () => data
  store.writeData = next => { data = structuredClone(next) }
  require('../dist/security/audit').audit = () => {}
  const express = require('express')
  const app = express()
  app.use(express.json({ limit: '1mb' }))
  app.use('/api/arvores', require('../dist/routes/arvores').default)
  app.use('/api/arquivos', require('../dist/routes/arquivos').default)
  app.use((_err, _req, res, _next) => res.status(500).json({ error: 'Erro interno do servidor' }))
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => new Promise(r => server.close(r)).then(() => fs.rmSync(pasta, { recursive: true, force: true })))

function token(contaId) {
  const { escopoDoToken } = require('../dist/security/escopo')
  const { configuredScope } = require('../dist/modules/ranking/scope')
  return require('../dist/security/jwt').assinarToken({ contaId, username: `c${contaId}`, nivel: 'admin', jti: `jti-${Math.random()}`, sv: 0, scope: escopoDoToken(configuredScope()) })
}
async function req(method, rota, contaId, body, bruto) {
  const res = await fetch(base + rota, { method, body: bruto ?? (body ? JSON.stringify(body) : undefined),
    headers: { ...(bruto ? { 'Content-Type': 'application/octet-stream' } : body ? { 'Content-Type': 'application/json' } : {}), ...(contaId ? { Authorization: `Bearer ${token(contaId)}` } : {}) } })
  return { status: res.status, body: await res.json().catch(() => null) }
}
const card = (extra = {}) => ({ x: 100, y: 80, nome: 'Fulano', apelido: '', funcao: '', faccao: '', telefone: '', endereco: '', veiculo: '', status: '', observacoes: '', foto: null, fotos: [], ...extra })

let arvoreId
test('árvores: só quem tem a área; cria ligada a um inquérito existente', async () => {
  assert.equal((await req('GET', '/api/arvores')).status, 401)
  assert.equal((await req('GET', '/api/arvores', 2)).status, 403)
  assert.equal((await req('POST', '/api/arvores', 2, { nome: 'X', descricao: '', inqueritoId: null })).status, 403)
  assert.equal((await req('POST', '/api/arvores', 1, { nome: 'X', descricao: '', inqueritoId: 999 })).status, 400)
  assert.equal((await req('POST', '/api/arvores', 1, { nome: '<script>', descricao: '', inqueritoId: null })).status, 400)
  const r = await req('POST', '/api/arvores', 1, { nome: 'Ballas', descricao: 'Organograma', inqueritoId: 5 })
  assert.equal(r.status, 201)
  arvoreId = r.body.id
  assert.deepEqual(r.body.inquerito, { id: 5, numero: 'INQ-005', titulo: 'Ballas' })
  assert.equal((await req('GET', '/api/arvores', 1)).body.length, 1)
  assert.deepEqual((await req('GET', '/api/arvores/inqueritos', 1)).body, [{ id: 5, numero: 'INQ-005', titulo: 'Ballas' }])
})

test('cards: foto por link http/https ou arquivo enviado na área árvore; dados validados', async () => {
  const ruins = [card({ foto: { url: 'javascript:alert(1)' } }), card({ telefone: '<b>1</b>' }), card({ x: 1e9 }), card({ foto: { arquivo: 'naoexiste'.padEnd(24, 'x') } }), card({ nome: 'a`b' })]
  for (const c of ruins) assert.equal((await req('POST', `/api/arvores/${arvoreId}/nos`, 1, c)).status, 400, JSON.stringify(c).slice(0, 80))
  const comLink = await req('POST', `/api/arvores/${arvoreId}/nos`, 1, card({ foto: { url: 'https://i.imgur.com/a.png' }, telefone: '(11) 9 9999-0000' }))
  assert.equal(comLink.status, 201)
  // Upload na área árvore (bytes conferidos) → usado como foto do card
  const up = await req('POST', '/api/arquivos?area=arvore&nome=foto.png', 1, null, PNG)
  assert.equal(up.status, 201)
  const comArquivo = await req('POST', `/api/arvores/${arvoreId}/nos`, 1, card({ nome: 'Ciclano', x: 400, foto: { arquivo: up.body.id }, fotos: [{ url: 'https://i.imgur.com/b.png' }] }))
  assert.equal(comArquivo.status, 201)
  assert.equal(comArquivo.body.no.foto.arquivo.id, up.body.id); assert.equal(comArquivo.body.no.fotos.length, 1)
  assert.equal((await req('POST', `/api/arvores/${arvoreId}/nos`, 2, card())).status, 403)
  // Arquivo de outra área não serve
  const outra = await req('POST', '/api/arquivos?area=galeria&nome=f.png', 1, null, PNG)
  assert.equal((await req('POST', `/api/arvores/${arvoreId}/nos`, 1, card({ foto: { arquivo: outra.body.id } }))).status, 400)
  // Mover (posição) e editar dados
  const n = comLink.body.no.id
  assert.equal((await req('PATCH', `/api/arvores/${arvoreId}/nos/${n}`, 1, { x: 250, y: 300 })).status, 200)
  const ed = await req('PATCH', `/api/arvores/${arvoreId}/nos/${n}`, 1, { apelido: 'Lobo', faccao: 'Ballas' })
  assert.equal(ed.body.no.x, 250); assert.equal(ed.body.no.apelido, 'Lobo')
  assert.equal(ed.body.no.nome, 'Fulano'); assert.equal(ed.body.no.telefone, '(11) 9 9999-0000')   // mover/editar não apaga o resto
  assert.equal((await req('PATCH', `/api/arvores/${arvoreId}/nos/${n}`, 1, {})).status, 400)
  assert.equal((await req('PATCH', `/api/arvores/${arvoreId}/nos/999`, 1, { x: 1 })).status, 404)
})

test('linhas: entre cards da árvore, lados e cor validados, sem duplicar; remover card leva as linhas', async () => {
  const { nos } = (await req('GET', `/api/arvores/${arvoreId}`, 1)).body
  const [a, b] = nos
  const lig = { de: a.id, deLado: 'direita', para: b.id, paraLado: 'esquerda' }
  assert.equal((await req('POST', `/api/arvores/${arvoreId}/ligacoes`, 1, { ...lig, para: a.id })).status, 400)       // mesmo card
  assert.equal((await req('POST', `/api/arvores/${arvoreId}/ligacoes`, 1, { ...lig, deLado: 'diagonal' })).status, 400)
  assert.equal((await req('POST', `/api/arvores/${arvoreId}/ligacoes`, 1, { ...lig, cor: 'red' })).status, 400)
  assert.equal((await req('POST', `/api/arvores/${arvoreId}/ligacoes`, 1, { ...lig, para: 999 })).status, 404)
  const r = await req('POST', `/api/arvores/${arvoreId}/ligacoes`, 1, lig)
  assert.equal(r.status, 201); assert.equal(r.body.ligacao.cor, '#ffffff')                                            // branca por padrão
  assert.equal((await req('POST', `/api/arvores/${arvoreId}/ligacoes`, 1, lig)).status, 409)
  // Mesmo par em outros lados pode (várias linhas por card)
  assert.equal((await req('POST', `/api/arvores/${arvoreId}/ligacoes`, 1, { ...lig, deLado: 'baixo', paraLado: 'cima' })).status, 201)
  const cor = await req('PATCH', `/api/arvores/${arvoreId}/ligacoes/${r.body.ligacao.id}`, 1, { cor: '#8b5cf6', curva: { dx: 20, dy: -40 }, rotulo: 'irmão' })
  assert.deepEqual([cor.body.ligacao.cor, cor.body.ligacao.curva, cor.body.ligacao.rotulo], ['#8b5cf6', { dx: 20, dy: -40 }, 'irmão'])
  // Remover o card apaga as linhas dele e o arquivo da foto
  const arquivoId = b.foto.arquivo.id
  assert.equal((await req('DELETE', `/api/arvores/${arvoreId}/nos/${b.id}`, 1)).status, 200)
  const depois = (await req('GET', `/api/arvores/${arvoreId}`, 1)).body
  assert.equal(depois.ligacoes.length, 0); assert.equal(depois.nos.length, 1)
  assert.equal((await req('GET', `/api/arquivos/${arquivoId}`, 1)).status, 404)
})

test('chat da árvore e versão: quem está com o quadro aberto só recebe tudo de novo quando muda', async () => {
  const v = (await req('GET', `/api/arvores/${arvoreId}`, 1)).body.versao
  assert.deepEqual((await req('GET', `/api/arvores/${arvoreId}?versao=${v}`, 1)).body, { versao: v, igual: true })
  assert.equal((await req('POST', `/api/arvores/${arvoreId}/mensagens`, 1, { texto: '' })).status, 400)
  const m = await req('POST', `/api/arvores/${arvoreId}/mensagens`, 1, { texto: 'Placa do carro confirmada' })
  assert.equal(m.status, 201)
  assert.equal(m.body.mensagens.at(-1).texto, 'Placa do carro confirmada'); assert.equal(m.body.mensagens.at(-1).minha, true)
  assert.ok(m.body.versao > v)
  assert.ok(!JSON.stringify(m.body).includes('contaId'))
  // Anexos no chat: foto enviada (área árvore) ou link http/https; só anexo também vale
  const up = await req('POST', '/api/arquivos?area=arvore&nome=print.png', 1, null, PNG)
  const comFoto = await req('POST', `/api/arvores/${arvoreId}/mensagens`, 1, { texto: '', anexo: { arquivo: up.body.id } })
  assert.equal(comFoto.status, 201); assert.equal(comFoto.body.mensagens.at(-1).anexo.arquivo.id, up.body.id)
  const comLink = await req('POST', `/api/arvores/${arvoreId}/mensagens`, 1, { texto: 'olha isso', anexo: { url: 'https://i.imgur.com/c.png' } })
  assert.deepEqual(comLink.body.mensagens.at(-1).anexo, { url: 'https://i.imgur.com/c.png' })
  assert.equal((await req('POST', `/api/arvores/${arvoreId}/mensagens`, 1, { texto: 'x', anexo: { url: 'javascript:alert(1)' } })).status, 400)
  const outra = await req('POST', '/api/arquivos?area=galeria&nome=g.png', 1, null, PNG)
  assert.equal((await req('POST', `/api/arvores/${arvoreId}/mensagens`, 1, { texto: '', anexo: { arquivo: outra.body.id } })).status, 400)
  assert.equal((await req('POST', `/api/arvores/${arvoreId}/mensagens`, 1, { texto: '', anexo: null })).status, 400)   // vazio
  // Apagar a árvore leva os anexos do chat
  const anexoId = up.body.id
  // Apagar a árvore
  assert.equal((await req('DELETE', `/api/arvores/${arvoreId}`, 2)).status, 403)
  assert.equal((await req('DELETE', `/api/arvores/${arvoreId}`, 1)).status, 200)
  assert.equal((await req('GET', `/api/arvores/${arvoreId}`, 1)).status, 404)
  assert.equal((await req('GET', `/api/arquivos/${anexoId}`, 1)).status, 404)
})

test('privacidade: árvore só de quem criou + escolhidos; admin vê todas; antiga sem dono continua aberta', async () => {
  data.cargosPermissao[1].permissoes.arvore = { ver: true, editar: true }    // conta 2 (Officer) trabalha com árvores
  // Admin cria sozinho: o Officer não vê nem abre
  const doAdmin = (await req('POST', '/api/arvores', 1, { nome: 'Crips', descricao: '', inqueritoId: null, participantes: [] })).body
  assert.equal(doAdmin.privada, true); assert.deepEqual(doAdmin.participantes.map(p => p.id), [1])
  assert.ok(!(await req('GET', '/api/arvores', 2)).body.some(a => a.id === doAdmin.id))
  assert.equal((await req('GET', `/api/arvores/${doAdmin.id}`, 2)).status, 404)
  assert.equal((await req('POST', `/api/arvores/${doAdmin.id}/nos`, 2, card())).status, 404)
  // Officer cria a dele sozinho: admin vê mesmo assim (acesso total)
  const doOfficer = (await req('POST', '/api/arvores', 2, { nome: 'Vagos', descricao: '', inqueritoId: null })).body
  assert.deepEqual(doOfficer.participantes.map(p => p.id), [2])
  assert.ok((await req('GET', '/api/arvores', 1)).body.some(a => a.id === doOfficer.id))
  assert.equal((await req('GET', `/api/arvores/${doOfficer.id}`, 1)).status, 200)
  // Admin chama o Officer para a dele: agora os dois trabalham nela
  const ed = await req('PUT', `/api/arvores/${doAdmin.id}`, 1, { nome: 'Crips', descricao: '', inqueritoId: null, participantes: [2] })
  assert.deepEqual(ed.body.participantes.map(p => p.id).sort(), [1, 2])   // quem criou nunca sai
  assert.equal((await req('GET', `/api/arvores/${doAdmin.id}`, 2)).status, 200)
  // Participante que não criou não escolhe pessoas
  assert.equal((await req('PUT', `/api/arvores/${doAdmin.id}`, 2, { nome: 'Crips', descricao: '', inqueritoId: null, participantes: [] })).status, 403)
  // ...mas edita o resto
  assert.equal((await req('PUT', `/api/arvores/${doAdmin.id}`, 2, { nome: 'Crips 2', descricao: '', inqueritoId: null })).status, 200)
  assert.equal((await req('POST', '/api/arvores', 2, { nome: 'X', descricao: '', inqueritoId: null, participantes: [999] })).status, 400)
  const pessoas = (await req('GET', '/api/arvores/pessoas', 2)).body
  assert.ok(pessoas.some(p => p.voce && p.id === 2) && pessoas.every(p => !('discordId' in p)))
  // Árvore antiga (sem participantes) segue aberta para quem tem a área
  data.arvores.push({ id: 900, nome: 'Antiga', descricao: '', inqueritoId: null, nos: [], nextNoId: 1, ligacoes: [], nextLigacaoId: 1, mensagens: [], nextMensagemId: 1,
    versao: 1, criadoPor: 'x', criadoEm: '2026-01-01', atualizadoPor: 'x', atualizadoEm: '2026-01-01' })
  assert.equal((await req('GET', '/api/arvores/900', 2)).status, 200)
  assert.equal((await req('PUT', '/api/arvores/900', 2, { nome: 'Antiga', descricao: '', inqueritoId: null, participantes: [] })).status, 403)   // só admin fecha
})

test('linha saindo do meio de outra linha: liga em card ou em outra linha; apagar a linha leva as que saíam dela', async () => {
  const a = (await req('POST', '/api/arvores', 1, { nome: 'Linhas', descricao: '', inqueritoId: null })).body.id
  const n = []
  for (const x of [0, 400, 200]) n.push((await req('POST', `/api/arvores/${a}/nos`, 1, card({ x }))).body.no.id)
  const l1 = (await req('POST', `/api/arvores/${a}/ligacoes`, 1, { de: n[0], deLado: 'direita', para: n[1], paraLado: 'esquerda' })).body.ligacao
  assert.equal(l1.deLig, null)
  // Do meio da linha 1 até o card 3
  const l2 = await req('POST', `/api/arvores/${a}/ligacoes`, 1, { deLig: l1.id, deT: 0.5, para: n[2], paraLado: 'cima' })
  assert.equal(l2.status, 201); assert.equal(l2.body.ligacao.deLig, l1.id); assert.equal(l2.body.ligacao.de, null)
  // De uma linha para outra linha
  const l3 = await req('POST', `/api/arvores/${a}/ligacoes`, 1, { deLig: l2.body.ligacao.id, deT: 0.3, paraLig: l1.id, paraT: 0.8 })
  assert.equal(l3.status, 201)
  for (const ruim of [
    { de: n[0], deLado: 'direita', deLig: l1.id, deT: 0.5, para: n[2], paraLado: 'cima' },   // ponta dupla
    { deLig: l1.id, para: n[2], paraLado: 'cima' },                                           // sem o ponto
    { deLig: l1.id, deT: 1.5, para: n[2], paraLado: 'cima' },                                 // ponto fora da linha
    { de: n[0], para: n[2], paraLado: 'cima' },                                               // card sem lado
  ]) assert.equal((await req('POST', `/api/arvores/${a}/ligacoes`, 1, ruim)).status, 400, JSON.stringify(ruim))
  assert.equal((await req('POST', `/api/arvores/${a}/ligacoes`, 1, { deLig: 9999, deT: 0.5, para: n[2], paraLado: 'cima' })).status, 404)
  assert.equal((await req('POST', `/api/arvores/${a}/ligacoes`, 1, { deLig: l1.id, deT: 0.2, paraLig: l1.id, paraT: 0.9 })).status, 400)   // mesma linha
  assert.equal((await req('PATCH', `/api/arvores/${a}/ligacoes/${l2.body.ligacao.id}`, 1, { deLado: 'baixo' })).status, 400)            // ponta numa linha não tem lado
  // Apagar a linha 1 leva a 2 e a 3 (saíam dela)
  assert.equal((await req('DELETE', `/api/arvores/${a}/ligacoes/${l1.id}`, 1)).status, 200)
  assert.equal((await req('GET', `/api/arvores/${a}`, 1)).body.ligacoes.length, 0)
})

/** MP4 mínimo: ftyp + moov/mvhd com a duração pedida (timescale 1000) + dados. */
function mp4(segundos, versao = 0) {
  const caixa = (tipo, corpo) => { const c = Buffer.alloc(8); c.writeUInt32BE(8 + corpo.length); c.write(tipo, 4, 'latin1'); return Buffer.concat([c, corpo]) }
  const ftyp = caixa('ftyp', Buffer.from('isom\0\0\0\0isomiso2', 'latin1'))
  let mvhd
  if (versao === 1) {
    mvhd = Buffer.alloc(112); mvhd[0] = 1; mvhd.writeUInt32BE(1000, 20); mvhd.writeBigUInt64BE(BigInt(segundos * 1000), 24)
  } else {
    mvhd = Buffer.alloc(100); mvhd.writeUInt32BE(1000, 12); mvhd.writeUInt32BE(segundos * 1000, 16)
  }
  return Buffer.concat([ftyp, caixa('mdat', Buffer.alloc(256, 9)), caixa('moov', caixa('mvhd', mvhd))])
}

test('vídeo no chat: MP4/MOV de até 1 minuto (duração lida dos bytes) ou link de vídeo; card só aceita imagem', async () => {
  const { duracaoMp4 } = require('../dist/security/video')
  assert.equal(duracaoMp4(mp4(30)), 30); assert.equal(duracaoMp4(mp4(75, 1)), 75)
  assert.equal(duracaoMp4(Buffer.from('não é vídeo nenhum aqui')), undefined)
  const a = (await req('POST', '/api/arvores', 1, { nome: 'Vídeos', descricao: '', inqueritoId: null })).body.id
  // Até 1 minuto: aceito e toca no chat
  const curto = await req('POST', '/api/arquivos?area=arvore&nome=clipe.mp4', 1, null, mp4(45))
  assert.equal(curto.status, 201); assert.equal(curto.body.mime, 'video/mp4')
  const msg = await req('POST', `/api/arvores/${a}/mensagens`, 1, { texto: 'olha a fuga', anexo: { arquivo: curto.body.id } })
  assert.equal(msg.status, 201); assert.equal(msg.body.mensagens.at(-1).anexo.arquivo.mime, 'video/mp4')
  // .mov (iPhone) também
  assert.equal((await req('POST', '/api/arquivos?area=arvore&nome=iphone.mov', 1, null, mp4(20))).status, 201)
  // Mais de 1 minuto: recusado pelo servidor
  const longo = await req('POST', '/api/arquivos?area=arvore&nome=longo.mp4', 1, null, mp4(90))
  assert.equal(longo.status, 400); assert.match(longo.body.error, /1 minuto/)
  // Vídeo sem estrutura legível: recusado
  const ruim = Buffer.concat([Buffer.from([0, 0, 0, 16]), Buffer.from('ftypisom', 'latin1'), Buffer.alloc(40)])
  assert.equal((await req('POST', '/api/arquivos?area=arvore&nome=x.mp4', 1, null, ruim)).status, 400)
  // Na árvore só imagem/vídeo (PDF não); .mov fora da árvore não
  assert.equal((await req('POST', '/api/arquivos?area=arvore&nome=doc.pdf', 1, null, Buffer.from('%PDF-1.4 teste'))).status, 400)
  assert.equal((await req('POST', '/api/arquivos?area=galeria&nome=v.mov', 1, null, mp4(10))).status, 400)
  // Card: vídeo não serve como foto
  assert.equal((await req('POST', `/api/arvores/${a}/nos`, 1, card({ foto: { arquivo: curto.body.id } }))).status, 400)
  // Link de vídeo: vai como link para quem recebe abrir; só http/https
  const link = await req('POST', `/api/arvores/${a}/mensagens`, 1, { texto: '', anexo: { video: 'https://youtu.be/dQw4w9WgXcQ' } })
  assert.equal(link.status, 201); assert.deepEqual(link.body.mensagens.at(-1).anexo, { video: 'https://youtu.be/dQw4w9WgXcQ' })
  assert.equal((await req('POST', `/api/arvores/${a}/mensagens`, 1, { texto: '', anexo: { video: 'javascript:alert(1)' } })).status, 400)
  // Apagar a árvore leva o vídeo enviado
  assert.equal((await req('DELETE', `/api/arvores/${a}`, 1)).status, 200)
  assert.equal((await req('GET', `/api/arquivos/${curto.body.id}`, 1)).status, 404)
})
