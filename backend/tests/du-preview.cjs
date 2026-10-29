// Prévia local do painel da DU com dados SINTÉTICOS (sem Mongo e sem Discord).
// Usa as rotas reais de Relatórios, Boletins, Inquéritos e Galeria sobre dados em memória;
// o login pelo Discord é simulado (botão "Entrar com Discord" entra direto como comando); pedidos de acesso são os reais; /me e arquivos são simulados. Requer `npm run build` no backend e no frontend.
//   node tests/du-preview.cjs   →   http://127.0.0.1:4173
const path = require('node:path')
const crypto = require('node:crypto')
const express = require('express')
const jwt = require('jsonwebtoken')

const secret = 'preview-only-not-a-real-credential-0123456789abcdef'
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = secret
process.env.DATA_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64url')   // só da prévia
delete process.env.DISCORD_BOT_TOKEN

const { scopeKey, configuredScope } = require('../dist/modules/ranking/scope')
const scope = configuredScope() ?? { guildId: '', botId: '' }
const membro = (id, policial, codinome, cargo, badge) => ({ id, policial, codinome, badge, passaporte: String(10000 + id), patenteDPD: 'Detective',
  patenteInterna: cargo, status: 'Ativo', entrada: '2026-08-01', promocao: '2026-10-01', adv1: false, adv2: false, adv3: false })
const todas = Object.fromEntries(require('../dist/permAreas').PERM_AREAS.map(a => [a.id, { ver: true, editar: true }]))
let data = {
  membros: [membro(1, 'Peter Wolf', 'Raven', '(DU) Commander', '1001'), membro(2, 'Ana Torres', 'Viper', '(DU) Senior', '2044'),
    membro(3, 'Marcus Reed', 'Ghost', '(DU) Officer', '3120'), membro(4, 'Lia Moreau', 'Echo', '(DU) Probationary', '4210')],
  contas: [{ id: 1, username: 'comando', nivel: 'admin', ativo: true, onboarded: true, membroId: 1, cargoPermId: 10, nomeServidor: 'Peter Wolf' }],
  solicitacoesAcesso: [{ id: 1, discordId: '900000000000000001', username: 'lia.moreau', nome: 'Lia Moreau', criadoEm: '2026-10-26T20:00:00Z' }],
  nextSolAcessoId: 2, nextContaId: 2,
  cargosPermissao: [{ id: 10, nome: '(DU) Commander', admin: true, permissoes: todas }],
  acoes: [], patentes: [], membrosOrder: [1, 2, 3, 4], ausencias: [], notificacoes: [], nextNotifId: 1, canais: {}, avisos: [],
  fardamentos: [], solicitacoesPerfil: [], nextMemId: 5, livros: [], nextLivroId: 1,
  relatorios: [], boletins: [], inqueritos: [], galeria: [], nextRelatorioId: 1, nextBoletimId: 1, nextInqueritoId: 1, nextFotoId: 1,
}
let revisao = 1
const store = require('../dist/data')
store.readData = () => structuredClone(data)
store.peekData = () => data
store.writeData = next => { data = structuredClone(next); revisao++ }
store.dataRevision = () => revisao
require('../dist/security/audit').audit = () => {}

// Arquivos em memória (o real usa a coleção avulsa do Mongo)
const arquivosReais = require('../dist/routes/arquivos')
const memoria = new Map()
arquivosReais.conferirArquivos = async ids => ids.every(id => memoria.has(id)) ? ids.map(id => { const { nome, mime, tamanho } = memoria.get(id); return { id, nome, mime, tamanho } }) : null
arquivosReais.sincronizarArquivos = async () => {}

const token = jwt.sign({ contaId: 1, username: 'comando', nivel: 'admin', scope: scopeKey(scope), jti: crypto.randomUUID() }, secret, { expiresIn: '12h' })
const me = { contaId: 1, username: 'comando', nivel: 'admin', membroId: 1, discordUsername: 'comando', nomeServidor: 'Peter Wolf', avatarServidor: null,
  avatarAtual: null, nivelMembro: 42, avatar: null, banner: null, links: [], emojisPerfil: [], onboarded: true, cargoPermId: 10, admin: true, dev: false,
  permissoes: todas, termos: { atual: require('../dist/termos').TERMOS_VERSAO, aceita: require('../dist/termos').TERMOS_VERSAO } }

const app = express()
app.post('/api/arquivos', express.raw({ type: 'application/octet-stream', limit: '10mb' }), (q, r) => {
  const id = crypto.randomBytes(18).toString('base64url'); const nome = String(q.query.nome)
  const mime = /\.pdf$/i.test(nome) ? 'application/pdf' : /\.png$/i.test(nome) ? 'image/png' : /\.jpe?g$/i.test(nome) ? 'image/jpeg' : 'application/octet-stream'
  memoria.set(id, { nome, mime, tamanho: q.body.length, bytes: q.body }); r.status(201).json({ id, nome, mime, tamanho: q.body.length })
})
app.get('/api/arquivos/:id', (q, r) => { const a = memoria.get(q.params.id); if (!a) return r.status(404).end(); r.type(a.mime).send(a.bytes) })
app.use(express.json({ limit: '5mb' }))
// Sem o cookie do login real, a prévia abre na tela de login
// Login pelo Discord simulado: entra direto como comando
app.get('/api/auth/discord', (_q, r) => { r.cookie('du_sessao', '1', { httpOnly: true, sameSite: 'strict', path: '/api/auth/sessao' }); r.redirect(303, '/dashboard') })
app.post('/api/auth/sessao', (q, r) => /du_sessao=/.test(q.headers.cookie ?? '') ? r.json({ token, contaId: 1, username: 'comando', nivel: 'admin' }) : r.status(204).end())
app.get('/api/auth/me', (_q, r) => r.json(me))
app.get('/api/auth/me/solicitacao-perfil', (_q, r) => r.json(null))
app.put('/api/auth/me/banner', (q, r) => { me.banner = q.body.banner; revisao++; r.json({ ok: true }) })
app.get('/api/membros', (_q, r) => r.json(data.membros.map(m => ({ ...m, cargoNome: m.patenteInterna, contaId: m.id === 1 ? 1 : null }))))
app.get('/api/config/logo', (_q, r) => r.json({ logo: '' }))
app.get('/api/public/revisao', (_q, r) => r.json({ revisao }))
app.get('/api/notificacoes', (_q, r) => r.json({ notificacoes: [], naoLidas: 0 }))
app.get('/api/avisos', (_q, r) => r.json({ avisos: [], naoVistos: 0 }))
app.get('/api/ausencias', (_q, r) => r.json([]))
app.get('/api/cursos/livros', (_q, r) => r.json([]))
app.use('/api/auth', require('../dist/routes/auth').default)
app.get('/api/config/cargos-permissao', (_q, r) => r.json(data.cargosPermissao))
app.use('/api/config', require('../dist/routes/config').default)
app.use('/api/relatorios', require('../dist/routes/relatorios').default)
app.use('/api/boletins', require('../dist/routes/boletins').default)
app.use('/api/inqueritos', require('../dist/routes/inqueritos').default)
app.use('/api/galeria', require('../dist/routes/galeria').default)
app.use('/api', (_q, r) => r.json([]))
const frontend = path.resolve(__dirname, '../../frontend/dist')
app.use(express.static(frontend))
app.use((_q, r) => r.sendFile(path.join(frontend, 'index.html')))

const PORT = Number(process.env.PORT) || 4173
app.listen(PORT, '127.0.0.1', () => console.log(`[DU] prévia em http://127.0.0.1:${PORT}`))
