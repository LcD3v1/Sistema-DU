import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { requireArea } from '../middleware/roles'
import { validateBody, carteiraPostSchema } from '../middleware/validate'
import { audit } from '../security/audit'
import { readData } from '../data'
import {
  botConfigurado, listarForuns, listarTopicosForum, topicoPertenceAoForum, postarImagemNoTopico,
} from '../discord/forum'
import { listarMembrosServidor, semId } from '../discord/identidade'

/**
 * Postagem da carteirinha no Discord.
 *
 * O FÓRUM fica salvo em `data.canais.carteira` (trocável em Configurações → Canais).
 * Dentro dele o usuário escolhe, a cada envio, o TÓPICO de destino. O tópico vem do
 * cliente, então é sempre conferido contra o fórum salvo antes de postar — sem isso
 * daria para usar o bot para publicar em qualquer canal do servidor.
 */

const router = Router()

// O corpo da rota já é limitado a 5mb (base64), o que dá ~3,7MB de PNG; este é o
// teto final, alinhado ao limite de anexo do Discord sem boost.
const MAX_PNG_BYTES = 4 * 1024 * 1024

// GET /api/carteira/forum — fórum configurado e seus tópicos
router.get('/forum', requireAuth, requireArea('carteira', 'ver'), async (_req: Request, res: Response): Promise<void> => {
  const forumId = readData().canais?.carteira
  if (!botConfigurado() || !forumId) {
    res.json({ configurado: false, forum: null, topicos: [] }); return
  }
  try {
    const forum = (await listarForuns()).find(f => f.id === forumId)
    res.json({
      configurado: true,
      // Só o nome vai para a tela; o ID do fórum já é conhecido de quem configura.
      forum: { id: forumId, nome: forum?.name ?? null },
      topicos: await listarTopicosForum(forumId),
    })
  } catch (err) {
    console.error('[FAST][CARTEIRA] listar tópicos:', err instanceof Error ? err.message : err)
    res.status(502).json({ error: 'Não foi possível consultar o Discord agora.' })
  }
})

// GET /api/carteira/membros — membros do servidor para escolher quem marcar.
// Exige 'editar': a lista traz discordId de terceiros (regra do CLAUDE.md).
router.get('/membros', requireAuth, requireArea('carteira', 'editar'), async (_req: Request, res: Response): Promise<void> => {
  if (!botConfigurado()) { res.json({ configurado: false, membros: [] }); return }
  try {
    // semId: o painel recebe o @ e o nome, nunca o discordId de terceiros
    res.json({ configurado: true, membros: (await listarMembrosServidor()).map(semId) })
  } catch (err) {
    console.error('[FAST][CARTEIRA] listar membros:', err instanceof Error ? err.message : err)
    res.status(502).json({ error: 'Não foi possível consultar os membros do Discord agora.' })
  }
})

// POST /api/carteira/postar — publica a carteira gerada no tópico escolhido
router.post('/postar', requireAuth, requireArea('carteira', 'editar'), validateBody(carteiraPostSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { topicoId, imagem, mensagem, mencionarUsuario } = req.body as
      { topicoId: string; imagem: string; mensagem?: string; mencionarUsuario?: string | null }

    const forumId = readData().canais?.carteira
    if (!botConfigurado() || !forumId) {
      res.status(400).json({ error: 'Nenhum fórum de carteira configurado.' }); return
    }

    const base64 = imagem.slice(imagem.indexOf(',') + 1)
    let png: Buffer
    try { png = Buffer.from(base64, 'base64') } catch { png = Buffer.alloc(0) }
    // Assinatura PNG: recusa qualquer outra coisa que tenha se disfarçado de data URL
    if (png.length < 8 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
      res.status(400).json({ error: 'Imagem inválida.' }); return
    }
    if (png.length > MAX_PNG_BYTES) {
      res.status(413).json({ error: 'Imagem grande demais para o Discord.' }); return
    }

    try {
      if (!await topicoPertenceAoForum(topicoId, forumId)) {
        audit('PRIVILEGE_ESCALATION_ATTEMPT', req, 'Tentativa de postar carteira fora do fórum configurado')
        res.status(400).json({ error: 'Tópico indisponível no fórum configurado.' }); return
      }
      // Resolve o @ para o discordId aqui dentro: só marca quem está mesmo no
      // servidor, e o painel nunca precisou conhecer o id.
      let marcar: string | undefined
      if (mencionarUsuario) {
        const alvo = (await listarMembrosServidor())
          .find(m => m.usuario.toLowerCase() === mencionarUsuario.toLowerCase())
        if (!alvo) { res.status(400).json({ error: 'Membro indisponível no servidor.' }); return }
        marcar = alvo.id
      }
      await postarImagemNoTopico(topicoId, `carteira-${Date.now()}.png`, png, mensagem, marcar)
    } catch (err) {
      console.error('[FAST][CARTEIRA] postar:', err instanceof Error ? err.message : err)
      res.status(502).json({ error: 'Não foi possível postar no Discord agora.' }); return
    }

    audit('CARTEIRA_POSTADA', req, `Carteira postada no Discord${mencionarUsuario ? ' com menção' : ''}`)
    res.json({ ok: true })
  })

export default router
