import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { requireArea } from '../middleware/roles'
import { hierarquiaLimiter } from '../middleware/rateLimiter'
import { validateBody, protocoloSchema } from '../middleware/validate'
import { readData, writeData } from '../data'
import { audit } from '../security/audit'
import { nomeDaConta } from '../registros'
import { discordConfig, infoServidor } from '../discord'
import { erroDasImagens } from '../hierarquia'
import { protocoloAtual, publicarProtocolo, estadoPainelProtocolo } from '../protocoloPainel'
import { ImagemPainel, Protocolo } from '../types'

/**
 * Protocolo: o livro (flipbook do Heyzine) mostrado no módulo, os capítulos listados acima dele
 * e o painel no Discord (mensagem do bot com os capítulos e o botão que abre o livro).
 * Ler = área "protocolo" (ver); trocar o livro / configurar o painel = área "protocolo" (editar).
 */
const router = Router()

/** Saída campo a campo (o ID da mensagem publicada não sai). */
const publico = (p: Protocolo) => {
  const e = estadoPainelProtocolo()
  return {
    flipbook: p.flipbook, secoes: p.secoes, atualizadoPor: p.atualizadoPor ?? null, atualizadoEm: p.atualizadoEm ?? null,
    painel: {
      canalId: p.canalId ?? null, descricao: p.descricao ?? null,
      imagens: (p.imagens ?? []).map(i => ({ posicao: i.posicao, url: i.url, lado: i.lado ?? null })),
      publicado: Boolean(p.mensagemId), erro: e.erro ?? null, ultimaAtualizacao: e.ultimaAtualizacao ?? null,
    },
    discordConfigurado: Boolean(discordConfig()),
  }
}

// GET /api/protocolo — livro atual + painel
router.get('/', requireAuth, requireArea('protocolo', 'ver'), (_req: Request, res: Response): void => {
  res.json(publico(protocoloAtual(readData())))
})

// GET /api/protocolo/discord — canais de texto do servidor (escolher onde o painel fica)
router.get('/discord', requireAuth, requireArea('protocolo', 'editar'), async (_req: Request, res: Response): Promise<void> => {
  const cfg = discordConfig()
  if (!cfg) { res.status(503).json({ error: 'Discord não configurado no servidor.' }); return }
  const info = await infoServidor(cfg)
  if (!info) { res.status(502).json({ error: 'Não foi possível falar com o Discord agora. Tente de novo.' }); return }
  res.json({ canais: info.canais })
})

// PUT /api/protocolo — troca o livro (link do Heyzine), os capítulos e o painel do Discord
router.put('/', requireAuth, requireArea('protocolo', 'editar'), hierarquiaLimiter, validateBody(protocoloSchema), async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { flipbook: string; secoes: string[]; canalId?: string | null; descricao?: string | null; imagens?: ImagemPainel[] }
  // Imagens do painel: topo, depois do título, depois dos capítulos, logo depois do botão ou no fim
  const imagens = body.imagens ?? []
  const erroImagens = erroDasImagens(imagens, p => ['topo', 'titulo', 'passos', 'botao', 'fim'].includes(p))
  if (erroImagens) { res.status(400).json({ error: erroImagens }); return }
  if (body.canalId) {
    const cfg = discordConfig()
    const info = cfg ? await infoServidor(cfg) : undefined
    if (!info) { res.status(502).json({ error: 'Não foi possível conferir o canal no Discord agora. Tente de novo.' }); return }
    if (!info.canais.some(c => c.id === body.canalId)) { res.status(400).json({ error: 'Canal não encontrado no servidor.' }); return }
  }
  // Daqui até writeData: sem await
  const data = readData()
  const atual = protocoloAtual(data)
  // Campo do painel ausente no corpo = mantém o atual (a tela "Trocar livro" não manda os campos do painel)
  const canalId = body.canalId === undefined ? atual.canalId : (body.canalId ?? undefined)
  const descricao = body.descricao === undefined ? atual.descricao : (body.descricao?.trim() || undefined)
  const imgs = body.imagens === undefined ? (atual.imagens ?? []) : imagens
  const novo: Protocolo = {
    flipbook: body.flipbook,
    secoes: [...new Set(body.secoes.map(s => s.trim()).filter(Boolean))],
    ...(canalId ? { canalId } : {}),
    // Mesmo canal: edita a mensagem existente; canal novo: publica de novo
    ...(canalId && canalId === atual.canalId && atual.mensagemId ? { mensagemId: atual.mensagemId } : {}),
    ...(descricao ? { descricao } : {}),
    ...(imgs.length ? { imagens: imgs.map(i => ({ posicao: i.posicao, url: i.url, ...(i.lado ? { lado: i.lado } : {}) })) } : {}),
    atualizadoPor: nomeDaConta(data, req.user!.contaId),
    atualizadoEm: new Date().toISOString(),
  }
  data.protocolo = novo
  writeData(data)
  audit('CONFIG_UPDATED', req, `Protocolo: livro/painel salvo (${novo.secoes.length} capítulo(s))`)
  if (novo.canalId) await publicarProtocolo(true)
  res.json(publico(protocoloAtual(readData())))
})

// POST /api/protocolo/publicar — publica/atualiza o painel no Discord agora
router.post('/publicar', requireAuth, requireArea('protocolo', 'editar'), hierarquiaLimiter, async (req: Request, res: Response): Promise<void> => {
  await publicarProtocolo(true)
  audit('CONFIG_UPDATED', req, 'Painel do protocolo publicado manualmente')
  res.json(publico(protocoloAtual(readData())))
})

export default router
