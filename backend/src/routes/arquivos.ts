import express, { Router, Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import { peekData } from '../data'
import { pastaDeArquivos } from '../armazenamento'
import { requireAuth } from '../middleware/auth'
import { canArea } from '../access'
import { audit } from '../security/audit'
import type { ArquivoRef, DuData } from '../types'
import type { AreaId } from '../permAreas'
import { duracaoMp4 } from '../security/video'

/**
 * Arquivos enviados do computador (PDF, documentos, planilhas, imagens…) para
 * Inquéritos, Boletins, Relatórios, Cursos Internos e Galeria.
 *
 *  - corpo cru (application/octet-stream), nada de base64 inchando o JSON;
 *  - o tipo é conferido pelos BYTES (assinatura do arquivo), não só pelo nome;
 *  - o ID é aleatório (144 bits) e o download exige login + permissão de VER a área
 *    do registro dono do arquivo;
 *  - o download sai como anexo (imagem inline) com nosniff e CSP que não roda nada;
 *  - arquivo enviado e não salvo em nenhum registro é apagado pela limpeza periódica (`expiraEm`).
 */

export const MAX_BYTES_ARQUIVO = 10 * 1024 * 1024
/** Vídeo da árvore de investigação: até 50 MB e no máximo 1 minuto (duração lida dos bytes). */
export const MAX_BYTES_VIDEO = 50 * 1024 * 1024
export const MAX_SEGUNDOS_VIDEO = 60
const EXPIRA_PENDENTE_MS = 6 * 60 * 60 * 1000
export const ID_ARQUIVO_REGEX = /^[A-Za-z0-9_-]{24}$/
export const AREAS_ARQUIVO = ['inqueritos', 'boletins', 'relatorios', 'cursos', 'galeria', 'arvore'] as const
export type AreaArquivo = typeof AREAS_ARQUIVO[number]

const comeca = (b: Buffer, ...bytes: number[]) => bytes.every((x, i) => b[i] === x)
const ehZip = (b: Buffer) => comeca(b, 0x50, 0x4b, 0x03, 0x04)
const ehOle = (b: Buffer) => comeca(b, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)
const ehTexto = (b: Buffer) => !b.subarray(0, 8192).includes(0)

/** Tipos aceitos: extensão → mime + conferência dos bytes. */
const TIPOS: Record<string, { mime: string; confere: (b: Buffer) => boolean; imagem?: boolean; video?: boolean }> = {
  pdf:  { mime: 'application/pdf', confere: b => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  png:  { mime: 'image/png', imagem: true, confere: b => comeca(b, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) },
  jpg:  { mime: 'image/jpeg', imagem: true, confere: b => comeca(b, 0xff, 0xd8, 0xff) },
  jpeg: { mime: 'image/jpeg', imagem: true, confere: b => comeca(b, 0xff, 0xd8, 0xff) },
  gif:  { mime: 'image/gif', imagem: true, confere: b => /^GIF8[79]a$/.test(b.subarray(0, 6).toString('latin1')) },
  webp: { mime: 'image/webp', imagem: true, confere: b => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', confere: ehZip },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', confere: ehZip },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', confere: ehZip },
  odt:  { mime: 'application/vnd.oasis.opendocument.text', confere: ehZip },
  ods:  { mime: 'application/vnd.oasis.opendocument.spreadsheet', confere: ehZip },
  zip:  { mime: 'application/zip', confere: ehZip },
  doc:  { mime: 'application/msword', confere: ehOle },
  xls:  { mime: 'application/vnd.ms-excel', confere: ehOle },
  ppt:  { mime: 'application/vnd.ms-powerpoint', confere: ehOle },
  txt:  { mime: 'text/plain', confere: ehTexto },
  csv:  { mime: 'text/csv', confere: ehTexto },
  mp3:  { mime: 'audio/mpeg', confere: b => b.subarray(0, 3).toString('latin1') === 'ID3' || comeca(b, 0xff, 0xfb) || comeca(b, 0xff, 0xf3) },
  mp4:  { mime: 'video/mp4', video: true, confere: b => b.subarray(4, 8).toString('latin1') === 'ftyp' },
  mov:  { mime: 'video/quicktime', video: true, confere: b => b.subarray(4, 8).toString('latin1') === 'ftyp' || ['moov', 'mdat', 'wide', 'free'].includes(b.subarray(4, 8).toString('latin1')) },
}

/** Nome exibido: sem caminho, sem caracteres de controle, até 120 caracteres. */
function limparNome(bruto: string): string {
  const base = bruto.split(/[\\/]/).pop() ?? ''
  // eslint-disable-next-line no-control-regex
  return base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').replace(/\s+/g, ' ').trim().slice(-120)
}

interface ArquivoMeta {
  area: AreaArquivo
  nome: string
  ext: string
  mime: string
  tamanho: number
  contaId: number
  criadoEm: string
  expiraEm?: string    // presente = ainda não vinculado a nenhum registro
}

const pasta = pastaDeArquivos<ArquivoMeta>('arquivos')

/** Apaga os arquivos enviados que nunca foram salvos em nenhum registro. */
export function limparArquivosPendentes(): void {
  const agora = Date.now()
  for (const { id, meta } of pasta.listar()) {
    if (meta.expiraEm && Date.parse(meta.expiraEm) < agora) pasta.apagar(id)
  }
}
setInterval(() => {
  try { limparArquivosPendentes() } catch (err) { console.error('[DU][ARQUIVOS] limpeza:', err instanceof Error ? err.message : err) }
}, 30 * 60 * 1000).unref()

const contaPode = (data: Readonly<DuData>, contaId: number, area: AreaId, modo: 'ver' | 'editar') => {
  const conta = data.contas.find(c => c.id === contaId)
  return Boolean(conta && canArea(conta, data as DuData, area, modo))
}

/**
 * Confere os arquivos de um registro antes de salvar: cada ID precisa existir, ter sido enviado
 * para a mesma área e ser DESTE registro — recém-enviado (ainda não vinculado) ou já presente em
 * `jaDoRegistro` (os anexos atuais do registro). Sem isso, alguém citava o ID do anexo de OUTRO
 * registro no seu e, ao apagar/editar o seu, o arquivo do outro era apagado.
 * Devolve as referências com os dados do banco (nunca confia em nome/tamanho do cliente) ou null.
 */
export async function conferirArquivos(ids: string[], area: AreaArquivo, jaDoRegistro: string[] = []): Promise<ArquivoRef[] | null> {
  const unicos = [...new Set(ids)]
  if (unicos.length === 0) return []
  if (unicos.some(id => !ID_ARQUIVO_REGEX.test(id))) return null
  const doRegistro = new Set(jaDoRegistro)
  const refs: ArquivoRef[] = []
  for (const id of unicos) {
    const m = pasta.meta(id)
    if (!m || m.area !== area) return null
    if (!m.expiraEm && !doRegistro.has(id)) return null   // já pertence a outro registro
    refs.push({ id, nome: m.nome, mime: m.mime, tamanho: m.tamanho })
  }
  return refs
}

/** Depois de gravar: vincula os novos (some a expiração) e apaga os que saíram do registro. */
export async function sincronizarArquivos(antes: ArquivoRef[], depois: ArquivoRef[]): Promise<void> {
  const ficam = new Set(depois.map(a => a.id))
  const sairam = antes.map(a => a.id).filter(id => !ficam.has(id))
  try {
    for (const id of ficam) {
      const m = pasta.meta(id)
      if (m?.expiraEm) { delete m.expiraEm; pasta.atualizar(id, m) }
    }
    for (const id of sairam) pasta.apagar(id)
  } catch (err) {
    console.error('[DU][ARQUIVOS] sincronizar:', err instanceof Error ? err.message : err)
  }
}

const router = Router()

// POST /api/arquivos?area=inqueritos&nome=laudo.pdf  (corpo: bytes do arquivo)
router.post('/', requireAuth,
  // Permissão ANTES de receber o corpo: sem isso, qualquer conta logada fazia o servidor guardar até 50 MB por envio
  (req: Request, res: Response, next: NextFunction): void => {
    const area = String(req.query.area ?? '') as AreaArquivo
    if (!AREAS_ARQUIVO.includes(area)) { res.status(400).json({ error: 'Área inválida' }); return }
    if (!contaPode(peekData(), req.user!.contaId, area, 'editar')) { res.status(403).json({ error: 'Acesso negado' }); return }
    next()
  },
  express.raw({ type: 'application/octet-stream', limit: MAX_BYTES_VIDEO }),
  async (req: Request, res: Response): Promise<void> => {
    const area = String(req.query.area ?? '') as AreaArquivo
    const nome = limparNome(String(req.query.nome ?? ''))
    const ext = (nome.match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? '').toLowerCase()
    const tipo = Object.prototype.hasOwnProperty.call(TIPOS, ext) ? TIPOS[ext] : undefined
    const bytes = Buffer.isBuffer(req.body) ? req.body : null
    if (!nome || !tipo) { res.status(400).json({ error: 'Tipo de arquivo não permitido.' }); return }
    if (!bytes || bytes.length < 4) { res.status(400).json({ error: 'Arquivo vazio.' }); return }
    if (!tipo.confere(bytes)) { res.status(400).json({ error: 'O conteúdo do arquivo não corresponde à extensão.' }); return }
    // Árvore de investigação: só imagem e vídeo; vídeo até 50 MB e 1 minuto. Outras áreas: até 10 MB (vídeo .mov só na árvore).
    if (area === 'arvore' && !tipo.imagem && !tipo.video) { res.status(400).json({ error: 'Na árvore, envie só imagem ou vídeo (MP4/MOV).' }); return }
    if (ext === 'mov' && area !== 'arvore') { res.status(400).json({ error: 'Tipo de arquivo não permitido.' }); return }
    if (bytes.length > (area === 'arvore' && tipo.video ? MAX_BYTES_VIDEO : MAX_BYTES_ARQUIVO)) { res.status(413).json({ error: 'Arquivo grande demais.' }); return }
    if (area === 'arvore' && tipo.video) {
      const segundos = duracaoMp4(bytes)
      if (segundos === undefined) { res.status(400).json({ error: 'Não foi possível ler a duração do vídeo. Envie em MP4.' }); return }
      if (segundos > MAX_SEGUNDOS_VIDEO + 0.5) { res.status(400).json({ error: `O vídeo tem ${Math.round(segundos)} s: o máximo é 1 minuto.` }); return }
    }
    try {
      const id = crypto.randomBytes(18).toString('base64url')
      const agora = new Date()
      pasta.salvar(id, bytes, { area, nome, ext, mime: tipo.mime, tamanho: bytes.length, contaId: req.user!.contaId,
        criadoEm: agora.toISOString(), expiraEm: new Date(agora.getTime() + EXPIRA_PENDENTE_MS).toISOString() })
      audit('ARQUIVO_ENVIADO', req, `area=${area}; bytes=${bytes.length}; tipo=${ext}`)
      const ref: ArquivoRef = { id, nome, mime: tipo.mime, tamanho: bytes.length }
      res.status(201).json(ref)
    } catch (err) {
      console.error('[DU][ARQUIVOS] salvar:', err instanceof Error ? err.message : err)
      res.status(500).json({ error: 'Não foi possível salvar o arquivo.' })
    }
  })

// GET /api/arquivos/:id — download (login + permissão de ver a área do arquivo)
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id)
  if (!ID_ARQUIVO_REGEX.test(id)) { res.status(404).json({ error: 'Arquivo não encontrado' }); return }
  try {
    const doc = pasta.meta(id)
    if (!doc || !contaPode(peekData(), req.user!.contaId, doc.area, 'ver')) { res.status(404).json({ error: 'Arquivo não encontrado' }); return }
    const imagem = Boolean(TIPOS[doc.ext]?.imagem)
    res.setHeader('Content-Type', doc.mime)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
    res.setHeader('Content-Disposition', `${imagem ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(doc.nome)}`)
    res.setHeader('Cache-Control', 'private, max-age=3600')
    res.end(pasta.bytes(id))
  } catch (err) {
    console.error('[DU][ARQUIVOS] ler:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Não foi possível abrir o arquivo.' })
  }
})

export default router
