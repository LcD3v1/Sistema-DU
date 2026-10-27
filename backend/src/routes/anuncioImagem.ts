import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import { pastaDeArquivos } from '../armazenamento'
import { requireAuth } from '../middleware/auth'
import { requireArea } from '../middleware/roles'
import { validateBody, anuncioImagemSchema } from '../middleware/validate'
import { audit } from '../security/audit'

/**
 * Imagem do Gerar anúncio: o membro envia a foto e o sistema devolve um link fixo
 * (/img/<id>.<ext>) para colar no jogo. O jogo abre o link sem login, então:
 *  - o ID é aleatório (144 bits) — ninguém lista nem adivinha as imagens;
 *  - o conteúdo é conferido pelos bytes (não basta dizer que é PNG);
 *  - a resposta só serve a imagem, com nosniff e CSP que não roda nada.
 * Guardado na pasta anuncio-imagens e apagado pela limpeza depois de EXPIRA_DIAS sem uso.
 */

export const MAX_BYTES_IMAGEM = 3 * 1024 * 1024
const EXPIRA_DIAS = 90
const ID_REGEX = /^[A-Za-z0-9_-]{24}$/

const TIPOS = {
  png: { mime: 'image/png', confere: (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  jpg: { mime: 'image/jpeg', confere: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  gif: { mime: 'image/gif', confere: (b: Buffer) => /^GIF8[79]a$/.test(b.subarray(0, 6).toString('latin1')) },
  webp: { mime: 'image/webp', confere: (b: Buffer) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
} as const
type Ext = keyof typeof TIPOS

/** data:image/...;base64 → bytes conferidos; null se o tipo, o tamanho ou os bytes não baterem. */
export function decodificarImagem(dataUrl: string): { ext: Ext; bytes: Buffer } | null {
  const m = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (!m) return null
  const ext: Ext = m[1] === 'jpeg' || m[1] === 'jpg' ? 'jpg' : m[1] as Ext
  const bytes = Buffer.from(m[2], 'base64')
  if (bytes.length < 12 || bytes.length > MAX_BYTES_IMAGEM || !TIPOS[ext].confere(bytes)) return null
  return { ext, bytes }
}

interface ImagemMeta {
  ext: Ext; tamanho: number; hash: string; contaId: number; criadoEm: string
}

const pasta = pastaDeArquivos<ImagemMeta>('anuncio-imagens')

function limparImagensAntigas(): void {
  const limite = Date.now() - EXPIRA_DIAS * 86_400_000
  for (const { id, meta } of pasta.listar()) if (Date.parse(meta.criadoEm) < limite) pasta.apagar(id)
}
setInterval(() => {
  try { limparImagensAntigas() } catch (err) { console.error('[DU][ANUNCIO] limpeza:', err instanceof Error ? err.message : err) }
}, 6 * 60 * 60 * 1000).unref()

// ── Envio (painel, com login) ─────────────────────────────────────────────────
export const uploadRouter = Router()

uploadRouter.post('/imagem', requireAuth, requireArea('anuncio', 'editar'), validateBody(anuncioImagemSchema),
  async (req: Request, res: Response): Promise<void> => {
    const img = decodificarImagem(req.body.imagem)
    if (!img) { res.status(400).json({ error: 'Envie uma imagem PNG, JPG, WEBP ou GIF de até 3 MB.' }); return }
    try {
      // Mesma foto enviada de novo reaproveita o link (não duplica no banco)
      const hash = crypto.createHash('sha256').update(img.bytes).digest('hex')
      const existente = pasta.listar().find(a => a.meta.hash === hash && a.meta.ext === img.ext)
      const id = existente?.id ?? crypto.randomBytes(18).toString('base64url')
      if (existente) pasta.atualizar(id, { ...existente.meta, criadoEm: new Date().toISOString() })
      else pasta.salvar(id, img.bytes, { ext: img.ext, tamanho: img.bytes.length, hash, contaId: req.user!.contaId, criadoEm: new Date().toISOString() })
      audit('ANUNCIO_IMAGEM_ENVIADA', req, `bytes=${img.bytes.length}; tipo=${img.ext}${existente ? '; reaproveitada' : ''}`)
      res.status(201).json({ caminho: `/img/${id}.${img.ext}` })
    } catch (err) {
      console.error('[DU][ANUNCIO] salvar imagem:', err instanceof Error ? err.message : err)
      res.status(500).json({ error: 'Não foi possível salvar a imagem.' })
    }
  })

// ── Link público (/img/<id>.<ext>) ─────────────────────────────────────────────
export const publicoRouter = Router()

publicoRouter.get('/:arquivo', async (req: Request, res: Response): Promise<void> => {
  const [id, ext, ...resto] = String(req.params.arquivo).split('.')
  if (resto.length || !ID_REGEX.test(id ?? '') || !(ext in TIPOS)) { res.status(404).end(); return }
  try {
    const doc = pasta.meta(id)
    if (!doc || doc.ext !== ext) { res.status(404).end(); return }
    res.setHeader('Content-Type', TIPOS[doc.ext].mime)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
    res.setHeader('Content-Disposition', 'inline')
    // O jogo e outros sites precisam carregar a imagem (padrão do sistema é same-origin)
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable')
    res.end(pasta.bytes(id))
  } catch (err) {
    console.error('[DU][ANUNCIO] ler imagem:', err instanceof Error ? err.message : err)
    res.status(500).end()
  }
})
