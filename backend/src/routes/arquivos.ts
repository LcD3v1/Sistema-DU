import express, { Router, Request, Response } from 'express'
import crypto from 'crypto'
import { Binary } from 'mongodb'
import { colecaoAvulsa, peekData } from '../data'
import { requireAuth } from '../middleware/auth'
import { canArea } from '../access'
import { audit } from '../security/audit'
import type { ArquivoRef, FastData } from '../types'
import type { AreaId } from '../permAreas'

/**
 * Arquivos enviados do computador (PDF, documentos, planilhas, imagens…) para
 * Inquéritos, Boletins, Relatórios, Cursos Internos e Galeria.
 *
 *  - corpo cru (application/octet-stream), nada de base64 inchando o JSON;
 *  - o tipo é conferido pelos BYTES (assinatura do arquivo), não só pelo nome;
 *  - o ID é aleatório (144 bits) e o download exige login + permissão de VER a área
 *    do registro dono do arquivo;
 *  - o download sai como anexo (imagem inline) com nosniff e CSP que não roda nada;
 *  - arquivo enviado e não salvo em nenhum registro expira sozinho (TTL em `expiraEm`).
 */

export const MAX_BYTES_ARQUIVO = 10 * 1024 * 1024
const EXPIRA_PENDENTE_MS = 6 * 60 * 60 * 1000
export const ID_ARQUIVO_REGEX = /^[A-Za-z0-9_-]{24}$/
export const AREAS_ARQUIVO = ['inqueritos', 'boletins', 'relatorios', 'cursos', 'galeria'] as const
export type AreaArquivo = typeof AREAS_ARQUIVO[number]

const comeca = (b: Buffer, ...bytes: number[]) => bytes.every((x, i) => b[i] === x)
const ehZip = (b: Buffer) => comeca(b, 0x50, 0x4b, 0x03, 0x04)
const ehOle = (b: Buffer) => comeca(b, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)
const ehTexto = (b: Buffer) => !b.subarray(0, 8192).includes(0)

/** Tipos aceitos: extensão → mime + conferência dos bytes. */
const TIPOS: Record<string, { mime: string; confere: (b: Buffer) => boolean; imagem?: boolean }> = {
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
  mp4:  { mime: 'video/mp4', confere: b => b.subarray(4, 8).toString('latin1') === 'ftyp' },
}

/** Nome exibido: sem caminho, sem caracteres de controle, até 120 caracteres. */
function limparNome(bruto: string): string {
  const base = bruto.split(/[\\/]/).pop() ?? ''
  // eslint-disable-next-line no-control-regex
  return base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').replace(/\s+/g, ' ').trim().slice(-120)
}

interface ArquivoDoc {
  _id: string
  area: AreaArquivo
  nome: string
  ext: string
  mime: string
  tamanho: number
  dados: Binary
  contaId: number
  criadoEm: Date
  expiraEm?: Date      // presente = ainda não vinculado a nenhum registro
}

let indices: Promise<unknown> | undefined
function colecao() {
  const col = colecaoAvulsa<ArquivoDoc>('arquivos')
  if (col && !indices) {
    indices = col.createIndex({ expiraEm: 1 }, { expireAfterSeconds: 0 })
      .catch(err => { indices = undefined; console.error('[DU][ARQUIVOS] índice:', err instanceof Error ? err.message : err) })
  }
  return col
}

const contaPode = (data: Readonly<FastData>, contaId: number, area: AreaId, modo: 'ver' | 'editar') => {
  const conta = data.contas.find(c => c.id === contaId)
  return Boolean(conta && canArea(conta, data as FastData, area, modo))
}

/**
 * Confere os arquivos de um registro antes de salvar: cada ID precisa existir e
 * ter sido enviado para a mesma área. Devolve as referências com os dados do banco
 * (nunca confia em nome/tamanho vindos do cliente) ou null se algum não bate.
 */
export async function conferirArquivos(ids: string[], area: AreaArquivo): Promise<ArquivoRef[] | null> {
  const unicos = [...new Set(ids)]
  if (unicos.length === 0) return []
  if (unicos.some(id => !ID_ARQUIVO_REGEX.test(id))) return null
  const col = colecao()
  if (!col) return null
  const docs = await col.find({ _id: { $in: unicos }, area }, { projection: { nome: 1, mime: 1, tamanho: 1 } }).toArray()
  if (docs.length !== unicos.length) return null
  const porId = new Map(docs.map(d => [d._id, d]))
  return unicos.map(id => { const d = porId.get(id)!; return { id, nome: d.nome, mime: d.mime, tamanho: d.tamanho } })
}

/** Depois de gravar: vincula os novos (some a expiração) e apaga os que saíram do registro. */
export async function sincronizarArquivos(antes: ArquivoRef[], depois: ArquivoRef[]): Promise<void> {
  const col = colecao()
  if (!col) return
  const ficam = new Set(depois.map(a => a.id))
  const sairam = antes.map(a => a.id).filter(id => !ficam.has(id))
  try {
    if (ficam.size) await col.updateMany({ _id: { $in: [...ficam] } }, { $unset: { expiraEm: '' } })
    if (sairam.length) await col.deleteMany({ _id: { $in: sairam } })
  } catch (err) {
    console.error('[DU][ARQUIVOS] sincronizar:', err instanceof Error ? err.message : err)
  }
}

const router = Router()

// POST /api/arquivos?area=inqueritos&nome=laudo.pdf  (corpo: bytes do arquivo)
router.post('/', requireAuth,
  express.raw({ type: 'application/octet-stream', limit: MAX_BYTES_ARQUIVO }),
  async (req: Request, res: Response): Promise<void> => {
    const area = String(req.query.area ?? '') as AreaArquivo
    if (!AREAS_ARQUIVO.includes(area)) { res.status(400).json({ error: 'Área inválida' }); return }
    if (!contaPode(peekData(), req.user!.contaId, area, 'editar')) { res.status(403).json({ error: 'Acesso negado' }); return }
    const nome = limparNome(String(req.query.nome ?? ''))
    const ext = (nome.match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? '').toLowerCase()
    const tipo = Object.prototype.hasOwnProperty.call(TIPOS, ext) ? TIPOS[ext] : undefined
    const bytes = Buffer.isBuffer(req.body) ? req.body : null
    if (!nome || !tipo) { res.status(400).json({ error: 'Tipo de arquivo não permitido.' }); return }
    if (!bytes || bytes.length < 4) { res.status(400).json({ error: 'Arquivo vazio.' }); return }
    if (!tipo.confere(bytes)) { res.status(400).json({ error: 'O conteúdo do arquivo não corresponde à extensão.' }); return }
    const col = colecao()
    if (!col) { res.status(503).json({ error: 'Envio de arquivo indisponível no momento.' }); return }
    try {
      const id = crypto.randomBytes(18).toString('base64url')
      const agora = new Date()
      await col.insertOne({ _id: id, area, nome, ext, mime: tipo.mime, tamanho: bytes.length, dados: new Binary(bytes),
        contaId: req.user!.contaId, criadoEm: agora, expiraEm: new Date(agora.getTime() + EXPIRA_PENDENTE_MS) })
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
  const col = colecao()
  if (!col) { res.status(503).json({ error: 'Indisponível no momento.' }); return }
  try {
    const doc = await col.findOne({ _id: id })
    if (!doc || !contaPode(peekData(), req.user!.contaId, doc.area, 'ver')) { res.status(404).json({ error: 'Arquivo não encontrado' }); return }
    const imagem = Boolean(TIPOS[doc.ext]?.imagem)
    res.setHeader('Content-Type', doc.mime)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
    res.setHeader('Content-Disposition', `${imagem ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(doc.nome)}`)
    res.setHeader('Cache-Control', 'private, max-age=3600')
    res.end(Buffer.from(doc.dados.buffer))
  } catch (err) {
    console.error('[DU][ARQUIVOS] ler:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Não foi possível abrir o arquivo.' })
  }
})

export default router
