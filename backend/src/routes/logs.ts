import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { requireArea } from '../middleware/roles'
import { peekData } from '../data'
import { listarLogs, categoriasDosLogs, avatarDaChave, erroDiscordLogs } from '../logs'
import { avatarAtual } from '../identidadeMembro'
import { imagemEnviada } from '../hierarquia'
import { baixarFotoDiscord, discordConfig } from '../discord'

/**
 * Logs do site e do servidor do Discord. Só quem tem a área "logs" (ver) — admins incluídos.
 * Saída em lista branca (sem IDs do Discord/conta); avatar por chave opaca, servido pelo backend.
 */
const router = Router()

const ORIGENS = new Set(['site', 'discord'])
const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

// GET /api/logs?origem=site|discord&categoria=...&busca=...&antes=<id>
router.get('/', requireAuth, requireArea('logs', 'ver'), (req: Request, res: Response): void => {
  const origem = texto(req.query.origem, 10)
  const antes = parseInt(texto(req.query.antes, 12), 10)
  const lista = listarLogs({
    ...(ORIGENS.has(origem) ? { origem: origem as 'site' | 'discord' } : {}),
    ...(texto(req.query.categoria, 60) ? { categoria: texto(req.query.categoria, 60) } : {}),
    ...(texto(req.query.busca, 100) ? { busca: texto(req.query.busca, 100) } : {}),
    ...(Number.isSafeInteger(antes) && antes > 0 ? { antesDe: antes } : {}),
    limite: 100,
  })
  res.json({ logs: lista, temMais: lista.length === 100 })
})

// GET /api/logs/categorias — categorias existentes (filtros) e a situação da leitura do Discord
router.get('/categorias', requireAuth, requireArea('logs', 'ver'), (_req: Request, res: Response): void => {
  res.json({ categorias: categoriasDosLogs(), discord: { configurado: Boolean(discordConfig()), erro: erroDiscordLogs } })
})

// GET /api/logs/avatar/:chave — foto de quem fez a ação (enviada no site ou do CDN do Discord)
router.get('/avatar/:chave', requireAuth, requireArea('logs', 'ver'), async (req: Request, res: Response): Promise<void> => {
  const chave = String(req.params.chave)
  if (!/^[A-Za-z0-9_-]{22}$/.test(chave)) { res.status(400).json({ error: 'Chave inválida' }); return }
  const ref = avatarDaChave(chave)
  if (!ref) { res.status(404).json({ error: 'Recurso não encontrado' }); return }
  let url = ref.url
  // Só leitura: peekData (sem copiar o banco inteiro a cada foto da lista)
  if (ref.contaId) url = avatarAtual(peekData().contas.find(c => c.id === ref.contaId)) ?? undefined
  let img: { dados: Buffer; mime: string } | undefined
  if (url?.startsWith('data:')) { const e = imagemEnviada(url, 4 * 1024 * 1024); img = e && { dados: e.dados, mime: e.mime } }
  else if (url) img = await baixarFotoDiscord(url)
  if (!img) { res.status(404).json({ error: 'Recurso não encontrado' }); return }
  res.setHeader('Content-Type', img.mime)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cache-Control', 'private, max-age=600')
  res.send(img.dados)
})

export default router
