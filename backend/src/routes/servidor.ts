import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { requireArea } from '../middleware/roles'
import { hierarquiaLimiter } from '../middleware/rateLimiter'
import { readData, peekData } from '../data'
import { audit } from '../security/audit'
import { canArea } from '../access'
import {
  discordConfig, infoServidor, imagemDoServidor, membrosDoServidor, perfilEmCache, situacaoNoServidor,
  listagemCompletaDisponivel, esquecerCacheDiscord, InfoServidor, PerfilMembro,
} from '../discord'

/**
 * Servidor do Discord da unidade: tudo o que o bot lê (informações, canais, cargos, emojis e membros).
 * Nunca sai o ID do servidor nem do bot (ícone/banner passam pelo backend). A lista de membros, com o
 * ID do Discord de cada um, só para quem tem "editar" na área servidor.
 */
const router = Router()

const contasComDiscord = () => peekData().contas.filter(c => c.discordId && !c.exonerado).map(c => c.discordId!)

function resumo(info: InfoServidor, membros: Map<string, PerfilMembro> | undefined) {
  const porCargo = new Map<string, number>()
  for (const p of membros?.values() ?? []) for (const r of p.cargos) porCargo.set(r, (porCargo.get(r) ?? 0) + 1)
  const categorias = info.todosCanais.filter(c => c.tipo === 'categoria')
  const semCategoria = info.todosCanais.filter(c => c.tipo !== 'categoria' && !c.categoriaId)
  const canal = (c: InfoServidor['todosCanais'][number]) => ({ id: c.id, nome: c.nome, tipo: c.tipo, topico: c.topico ?? null, nsfw: c.nsfw })
  return {
    nome: info.nome,
    descricao: info.descricao ?? null,
    membros: info.membros ?? null,
    online: info.online ?? null,
    impulsos: info.impulsos,
    nivelImpulso: info.nivelImpulso,
    temIcone: Boolean(info.iconeHash),
    temBanner: Boolean(info.bannerHash),
    bot: info.botNome,
    canais: [
      ...(semCategoria.length ? [{ categoria: null, canais: semCategoria.map(canal) }] : []),
      ...categorias.map(cat => ({ categoria: cat.nome, canais: info.todosCanais.filter(c => c.categoriaId === cat.id).map(canal) })),
    ],
    totalCanais: info.todosCanais.filter(c => c.tipo !== 'categoria').length,
    cargos: info.todosCargos.map(r => ({
      id: r.id, nome: r.nome, cor: r.cor, posicao: r.posicao, icone: r.icone ?? null, emoji: r.emoji ?? null,
      separado: r.separado, mencionavel: r.mencionavel, integracao: r.integracao, membros: membros ? (porCargo.get(r.id) ?? 0) : null,
    })),
    emojis: info.emojis.map(e => ({ id: e.id, nome: e.nome, animado: e.animado, disponivel: e.disponivel, url: e.url })),
    // todos = intent ligada (contagens exatas); contas = só quem tem conta no site
    modoMembros: listagemCompletaDisponivel() ? 'todos' : 'contas',
    lidoEm: info.lidoEm,
  }
}

// GET /api/servidor — informações, canais, cargos e emojis (cache de 1 min)
router.get('/', requireAuth, requireArea('servidor', 'ver'), async (_req: Request, res: Response): Promise<void> => {
  const cfg = discordConfig()
  if (!cfg) { res.status(503).json({ error: 'Discord não configurado no servidor.' }); return }
  const info = await infoServidor(cfg)
  if (!info) { res.status(502).json({ error: 'Não foi possível falar com o Discord agora. Tente de novo.' }); return }
  const membros = await membrosDoServidor(cfg, contasComDiscord()).catch(() => undefined)
  res.json(resumo(info, membros))
})

// GET /api/servidor/membros?q= — lista de membros (com ID do Discord): só quem edita a área
router.get('/membros', requireAuth, requireArea('servidor', 'editar'), async (req: Request, res: Response): Promise<void> => {
  const cfg = discordConfig()
  if (!cfg) { res.status(503).json({ error: 'Discord não configurado no servidor.' }); return }
  const membros = await membrosDoServidor(cfg, contasComDiscord())
  if (!membros) { res.status(502).json({ error: 'Não foi possível falar com o Discord agora. Tente de novo.' }); return }
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase().slice(0, 60) : ''
  const comConta = new Set(contasComDiscord())
  const lista = [...membros]
    .filter(([, p]) => !q || [p.nome, p.usuario, p.apelido ?? ''].some(t => t.toLowerCase().includes(q)))
    .sort(([, a], [, b]) => (a.apelido || a.nome).localeCompare(b.apelido || b.nome, 'pt-BR'))
  res.json({
    total: lista.length,
    modo: listagemCompletaDisponivel() ? 'todos' : 'contas',
    membros: lista.slice(0, 300).map(([id, p]) => ({
      discordId: id, nome: p.nome, usuario: p.usuario, apelido: p.apelido ?? null, avatar: p.avatar ?? null,
      cargos: p.cargos, entrouEm: p.entrouEm ?? null, temConta: comConta.has(id),
    })),
  })
})

// GET /api/servidor/eu — o servidor da unidade do ponto de vista de quem está logado
router.get('/eu', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const cfg = discordConfig()
  const conta = peekData().contas.find(c => c.id === req.user!.contaId)
  if (!cfg || !conta) { res.json({ configurado: false }); return }
  const info = await infoServidor(cfg)
  // Cache de até 5 min (a rotina do painel renova a cada minuto): muita gente abrindo o site
  // ao mesmo tempo não vira uma consulta ao Discord por pessoa
  let perfil = conta.discordId ? perfilEmCache(conta.discordId, 5 * 60_000) : undefined
  let membro: boolean | null = perfil ? true : null
  if (!perfil && conta.discordId) {
    const s = await situacaoNoServidor(cfg, conta.discordId)
    membro = s.status === 'erro' ? null : s.status === 'membro'
    perfil = perfilEmCache(conta.discordId, 5 * 60_000)
  }
  const cargos = (perfil?.cargos ?? [])
    .map(id => info?.todosCargos.find(r => r.id === id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map(r => ({ nome: r.nome, cor: r.cor, icone: r.icone ?? null, emoji: r.emoji ?? null }))
  res.json({
    configurado: true,
    servidor: info?.nome ?? null,
    temIcone: Boolean(info?.iconeHash),
    membro,                                   // null = não deu para conferir agora
    apelido: perfil?.apelido ?? null,
    entrouEm: perfil?.entrouEm ?? null,
    cargos,
  })
})

// GET /api/servidor/imagem/(icone|banner) — imagem do servidor via backend (sem o ID na URL)
router.get('/imagem/:tipo', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const tipo = req.params.tipo
  if (tipo !== 'icone' && tipo !== 'banner') { res.status(404).json({ error: 'Recurso não encontrado' }); return }
  if (tipo === 'banner') {
    const data = readData()
    const conta = data.contas.find(c => c.id === req.user!.contaId)
    if (!conta || !canArea(conta, data, 'servidor', 'ver')) { res.status(403).json({ error: 'Acesso negado' }); return }
  }
  const cfg = discordConfig()
  const img = cfg ? await imagemDoServidor(cfg, tipo) : undefined
  if (!img) { res.status(404).json({ error: 'Recurso não encontrado' }); return }
  res.setHeader('Content-Type', img.mime)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cache-Control', 'private, max-age=600')
  res.send(img.dados)
})

// POST /api/servidor/atualizar — lê tudo de novo do Discord agora
router.post('/atualizar', requireAuth, requireArea('servidor', 'editar'), hierarquiaLimiter, async (req: Request, res: Response): Promise<void> => {
  const cfg = discordConfig()
  if (!cfg) { res.status(503).json({ error: 'Discord não configurado no servidor.' }); return }
  esquecerCacheDiscord()
  const info = await infoServidor(cfg, true)
  if (!info) { res.status(502).json({ error: 'Não foi possível falar com o Discord agora. Tente de novo.' }); return }
  const membros = await membrosDoServidor(cfg, contasComDiscord(), 0).catch(() => undefined)
  audit('CONFIG_UPDATED', req, 'Dados do servidor do Discord atualizados')
  res.json(resumo(info, membros))
})

export default router
