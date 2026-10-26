import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { requireArea } from '../middleware/roles'
import { validateBody, mensagemDiscordSchema } from '../middleware/validate'
import { mensagemDiscordLimiter } from '../middleware/rateLimiter'
import { audit } from '../security/audit'
import { peekData } from '../data'
import { FastData } from '../types'
import { botConfigurado } from '../discord/forum'
import { canaisDeTexto, canalDeTextoValido, enviarPainel } from '../discord/mensagens'

const router = Router()

/** Quem assina no rodapé: menção (sem notificar) se tiver Discord, senão o nome. */
export function autorDiscord(data: Readonly<FastData>, contaId: number, fallback: string): string {
  const conta = data.contas.find(c => c.id === contaId)
  if (conta?.discordId) return `<@${conta.discordId}>`
  return conta?.nomeServidor || conta?.discordUsername || conta?.username || fallback
}

// GET /api/mensagens/canais — canais de texto/anúncio onde o bot pode postar (só id + nome)
router.get('/canais', requireAuth, requireArea('mensagens', 'ver'), async (_req: Request, res: Response): Promise<void> => {
  if (!botConfigurado()) { res.json({ botConfigurado: false, canais: [] }); return }
  try {
    res.json({ botConfigurado: true, canais: await canaisDeTexto() })
  } catch (err) {
    console.error('[DU][DISCORD] listar canais (mensagens):', err instanceof Error ? err.message : err)
    res.status(502).json({ error: 'Não foi possível consultar os canais do Discord.' })
  }
})

// POST /api/mensagens — o bot manda o painel da DU no canal escolhido
router.post('/', requireAuth, requireArea('mensagens', 'editar'), mensagemDiscordLimiter, validateBody(mensagemDiscordSchema),
  async (req: Request, res: Response): Promise<void> => {
    if (!botConfigurado()) { res.status(400).json({ error: 'Bot do Discord não configurado no servidor.' }); return }
    const { canalId, titulo, mensagem } = req.body as { canalId: string; titulo?: string; mensagem: string }
    try {
      // Só canais de texto/anúncio DESTE servidor (nunca um ID qualquer vindo do navegador)
      if (!await canalDeTextoValido(canalId)) {
        res.status(400).json({ error: 'Escolha um canal de texto do servidor.' }); return
      }
      const autor = autorDiscord(peekData(), req.user!.contaId, req.user!.username)
      await enviarPainel(canalId, { titulo, mensagem, rotulo: 'Comunicado', autor })
      audit('MENSAGEM_DISCORD_ENVIADA', req, `canal=${canalId}; caracteres=${mensagem.length}`)
      res.status(201).json({ ok: true })
    } catch (err) {
      console.error('[DU][DISCORD] enviar mensagem:', err instanceof Error ? err.message : err)
      res.status(502).json({ error: 'O Discord não aceitou a mensagem. Confira se o bot pode escrever nesse canal.' })
    }
  })

export default router
