import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { requireArea } from '../middleware/roles'
import { hierarquiaLimiter } from '../middleware/rateLimiter'
import { validateBody, carteiraForumSchema, carteiraPostarSchema } from '../middleware/validate'
import { readData, writeData } from '../data'
import { audit } from '../security/audit'
import { nomeDaConta, nomeDoMembro } from '../registros'
import { discordConfig, infoServidor, postarNoForum, baixarFotoDiscord, topicosDoForum } from '../discord'
import { contaDoMembro, nomeCargoAtual } from '../efetivo'
import { avatarAtual } from '../identidadeMembro'
import { imagemEnviada } from '../hierarquia'

/**
 * Carteirinha da DU no fórum do Discord. A imagem é gerada no navegador (canvas) e só vai para o
 * fórum quando alguém com "editar" na área carteira clica em Postar: o 1º post cria o tópico do
 * membro e os seguintes entram no MESMO tópico (histórico). Nada é postado automaticamente.
 * O ID do tópico fica no membro (discordThreadId) e nunca sai da API.
 */
const router = Router()

const MAX_PNG = 4 * 1024 * 1024
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** data:image/png;base64 → bytes, só se for PNG de verdade e até 4 MB. */
function pngEnviado(valor: string): Buffer | undefined {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(valor)
  if (!m) return undefined
  const dados = Buffer.from(m[1], 'base64')
  return dados.length > 0 && dados.length <= MAX_PNG && dados.subarray(0, 8).equals(PNG) ? dados : undefined
}

/**
 * Quem pode ter carteirinha: o efetivo do painel, com os dados COMPLETADOS pelo que o sistema já
 * sabe da pessoa (cadastro do site + pedido de set + Discord). Lista branca, sem IDs do Discord.
 */
router.get('/membros', requireAuth, requireArea('carteira', 'ver'), (_req: Request, res: Response): void => {
  const data = readData()
  const ordem = new Map(data.membrosOrder.map((id, i) => [id, i]))
  const lista = [...data.membros]
    .sort((a, b) => (ordem.get(a.id) ?? 1e9) - (ordem.get(b.id) ?? 1e9))
    .map(m => {
      const conta = contaDoMembro(data, m.id)
      const setagem = conta?.cadastroSetagem
      const foto = avatarAtual(conta)
      return {
        id: m.id,
        nome: m.policial || conta?.nomeServidor || '',
        codinome: m.codinome || setagem?.codinome || '',
        cargo: nomeCargoAtual(data, m) || m.patenteInterna || m.patenteDPD || setagem?.patente || '',
        distintivo: m.badge || '',
        passaporte: m.passaporte || setagem?.passaporte || '',
        registro: String(m.id).padStart(4, '0'),
        status: m.status,
        apelidoDiscord: conta?.nomeServidor ?? null,
        aprovado: Boolean(conta && !conta.exonerado && (conta.cargoPermId || conta.id === 1)),
        noDiscord: Boolean(conta?.discordId),
        // Foto automática: enviada no site ou a do Discord (link externo qualquer não é baixado)
        temFoto: Boolean(foto && (foto.startsWith('data:') || foto.startsWith('https://cdn.discordapp.com/'))),
        postadaNoForum: Boolean(m.discordThreadId),
      }
    })
  res.json(lista)
})

// GET /api/carteira/foto/:membroId — foto do membro para a carteirinha (passa pelo backend: sem ID do Discord no navegador)
router.get('/foto/:membroId', requireAuth, requireArea('carteira', 'ver'), async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.membroId)
  if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({ error: 'ID inválido' }); return }
  const data = readData()
  if (!data.membros.some(m => m.id === id)) { res.status(404).json({ error: 'Recurso não encontrado' }); return }
  const foto = avatarAtual(contaDoMembro(data, id))
  let img: { dados: Buffer; mime: string } | undefined
  if (foto?.startsWith('data:')) { const e = imagemEnviada(foto, 4 * 1024 * 1024); img = e && { dados: e.dados, mime: e.mime } }
  else if (foto) img = await baixarFotoDiscord(foto)
  if (!img) { res.status(404).json({ error: 'Recurso não encontrado' }); return }
  res.setHeader('Content-Type', img.mime)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cache-Control', 'private, max-age=300')
  res.send(img.dados)
})

// GET /api/carteira/forum — fórum configurado + fóruns do servidor para escolher
router.get('/forum', requireAuth, requireArea('carteira', 'editar'), async (_req: Request, res: Response): Promise<void> => {
  const cfg = discordConfig()
  const info = cfg ? await infoServidor(cfg) : undefined
  const canalId = readData().canais?.carteira ?? null
  res.json({
    canalId,
    foruns: (info?.todosCanais ?? []).filter(c => c.tipo === 'forum').map(c => ({ id: c.id, nome: c.nome })),
    discordConfigurado: Boolean(cfg),
  })
})

// GET /api/carteira/topicos — tópicos (posts) do fórum configurado, para escolher onde postar
router.get('/topicos', requireAuth, requireArea('carteira', 'editar'), async (_req: Request, res: Response): Promise<void> => {
  const cfg = discordConfig()
  const forumId = readData().canais?.carteira
  if (!cfg || !forumId) { res.json({ topicos: [] }); return }
  const topicos = await topicosDoForum(cfg, forumId)
  if (!topicos) { res.status(502).json({ error: 'Não foi possível ler os tópicos do fórum agora.' }); return }
  res.json({ topicos })
})

// PUT /api/carteira/forum — escolhe o fórum onde as carteirinhas são postadas
router.put('/forum', requireAuth, requireArea('carteira', 'editar'), validateBody(carteiraForumSchema), async (req: Request, res: Response): Promise<void> => {
  const { canalId } = req.body as { canalId: string | null }
  if (canalId) {
    const cfg = discordConfig()
    const info = cfg ? await infoServidor(cfg) : undefined
    if (!info) { res.status(502).json({ error: 'Não foi possível conferir o servidor no Discord agora.' }); return }
    if (!info.todosCanais.some(c => c.id === canalId && c.tipo === 'forum')) { res.status(400).json({ error: 'Escolha um canal do tipo fórum.' }); return }
  }
  const data = readData()
  data.canais = { ...(data.canais ?? {}) }
  if (canalId) data.canais.carteira = canalId
  else delete data.canais.carteira
  writeData(data)
  audit('CONFIG_UPDATED', req, `Carteirinha: fórum ${canalId ? 'definido' : 'removido'}`)
  res.json({ ok: true, canalId })
})

// POST /api/carteira/postar — posta a carteirinha (PNG) do membro no fórum
router.post('/postar', requireAuth, requireArea('carteira', 'editar'), hierarquiaLimiter, validateBody(carteiraPostarSchema), async (req: Request, res: Response): Promise<void> => {
  const { membroId, imagem, topicoId } = req.body as { membroId: number; imagem: string; topicoId?: string | null }
  const png = pngEnviado(imagem)
  if (!png) { res.status(400).json({ error: 'Imagem da carteirinha inválida (PNG até 4 MB).' }); return }
  const cfg = discordConfig()
  if (!cfg) { res.status(503).json({ error: 'Discord não configurado no servidor.' }); return }
  const data = readData()
  const forumId = data.canais?.carteira
  if (!forumId) { res.status(400).json({ error: 'Escolha antes o fórum das carteirinhas.' }); return }
  const membro = data.membros.find(m => m.id === membroId)
  if (!membro) { res.status(404).json({ error: 'Membro não encontrado' }); return }
  // Tópico escolhido à mão: só um tópico DESTE fórum (nunca um canal qualquer vindo do navegador)
  if (topicoId) {
    let topicos = await topicosDoForum(cfg, forumId)
    // Lista em cache (30 s) sem o tópico: pode ser um tópico novo — relê do Discord antes de recusar
    if (topicos && !topicos.some(t => t.id === topicoId)) topicos = await topicosDoForum(cfg, forumId, true)
    if (!topicos) { res.status(502).json({ error: 'Não foi possível conferir os tópicos do fórum agora.' }); return }
    if (!topicos.some(t => t.id === topicoId)) { res.status(400).json({ error: 'Esse tópico não é do fórum das carteirinhas. Atualize a lista.' }); return }
  }
  const autor = nomeDaConta(data, req.user!.contaId)
  // Texto puro (sem menções/formatação): nome, codinome e passaporte do membro
  const limpo = (t: string) => t.replace(/[@`*_~|<>#]/g, '').trim()
  // Regra: o membro aparece pelo codinome (tópico e texto do post)
  const nome = limpo(nomeDoMembro(data, membro))
  const topico = `${nome}${membro.passaporte ? ` | ${limpo(membro.passaporte)}` : ''}`
  const texto = `🪪 Carteirinha DU — ${nome}${membro.patenteInterna ? ` · ${limpo(membro.patenteInterna)}` : ''}\n-# Postada por ${limpo(autor)} em ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
  const r = await postarNoForum(cfg, forumId, topicoId ?? membro.discordThreadId, topico, texto,
    { nome: `carteirinha-${membro.id}.png`, mime: 'image/png', dados: png }, contaDoMembro(data, membro.id)?.discordId, Boolean(topicoId))
  if (r === 'sem_acesso') { res.status(502).json({ error: 'O bot não consegue postar nesse fórum. Confira as permissões do bot no canal.' }); return }
  if (!r) { res.status(502).json({ error: 'O Discord não respondeu. Tente de novo.' }); return }
  // Relê: grava o tópico no membro (pode ter mudado durante o envio). Tópico escolhido à mão não vira o do membro.
  const atual = readData()
  const alvo = atual.membros.find(m => m.id === membroId)
  if (!topicoId && alvo && alvo.discordThreadId !== r.topicoId) { alvo.discordThreadId = r.topicoId; writeData(atual) }
  audit('CARTEIRA_POSTADA', req, `Membro #${membroId} (${topicoId ? 'no tópico escolhido' : r.novo ? 'tópico novo' : 'no tópico do membro'})`)
  res.json({ ok: true, novoTopico: r.novo })
})

export default router
