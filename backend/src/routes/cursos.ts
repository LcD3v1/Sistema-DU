import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { requireArea } from '../middleware/roles'
import { validateBody, livroSchema, livroUpdateSchema } from '../middleware/validate'
import { audit } from '../security/audit'
import { readData, writeData } from '../data'
import { notificarArea } from '../notificacoes'
import { Livro } from '../types'

/**
 * Cursos Internos — biblioteca de livros. Cada livro é um link (PDF, Google Drive,
 * Docs, site…) que abre em outra aba; o backend nunca busca a URL (sem SSRF).
 * Guardado no documento de configuração (meta), por isso o teto de livros e a capa
 * só por link — nada de imagem enviada inchando o documento.
 */
const MAX_LIVROS = 300

const router = Router()

/** Saída da API: lista branca (sem criadoPor). */
function livroPublico(l: Livro) {
  return { id: l.id, titulo: l.titulo, autor: l.autor, descricao: l.descricao, categoria: l.categoria,
    url: l.url, capa: l.capa, cor: l.cor, criadoEm: l.criadoEm }
}

function idDaRota(req: Request, res: Response): number | undefined {
  const raw = String(req.params.id)
  const id = /^\d{1,9}$/.test(raw) ? parseInt(raw, 10) : NaN
  if (!Number.isInteger(id) || id < 1) { res.status(400).json({ error: 'ID inválido' }); return undefined }
  return id
}

// GET /api/cursos/livros — estante (mais recentes primeiro)
router.get('/livros', requireAuth, requireArea('cursos', 'ver'), (_req, res) => {
  const livros = [...(readData().livros ?? [])].sort((a, b) => b.id - a.id)
  res.json(livros.map(livroPublico))
})

// POST /api/cursos/livros — adiciona um livro pelo link
router.post('/livros', requireAuth, requireArea('cursos', 'editar'), validateBody(livroSchema), (req: Request, res: Response): void => {
  const data = readData()
  const livros = data.livros ?? []
  if (livros.length >= MAX_LIVROS) { res.status(409).json({ error: `A biblioteca chegou ao limite de ${MAX_LIVROS} livros.` }); return }
  const body = req.body as Omit<Livro, 'id' | 'criadoEm' | 'criadoPor'>
  const nextId = Math.max(data.nextLivroId ?? 1, ...livros.map(l => l.id + 1))
  const novo: Livro = {
    id: nextId,
    titulo: body.titulo, autor: body.autor, descricao: body.descricao, categoria: body.categoria,
    url: body.url, capa: body.capa, cor: body.cor,
    criadoEm: new Date().toISOString(),
    criadoPor: req.user!.username,
  }
  data.livros = [...livros, novo]
  data.nextLivroId = nextId + 1
  notificarArea(data, 'cursos', [req.user!.contaId], 'curso', 'Novo livro nos Cursos Internos',
    `"${novo.titulo}" foi adicionado à biblioteca.`, '/cursos')
  writeData(data)
  audit('CONFIG_UPDATED', req, `Livro adicionado: #${novo.id}`)
  res.status(201).json(livroPublico(novo))
})

// PUT /api/cursos/livros/:id — edita
router.put('/livros/:id', requireAuth, requireArea('cursos', 'editar'), validateBody(livroUpdateSchema), (req: Request, res: Response): void => {
  const id = idDaRota(req, res); if (id === undefined) return
  const data = readData()
  const livro = (data.livros ?? []).find(l => l.id === id)
  if (!livro) { res.status(404).json({ error: 'Livro não encontrado' }); return }
  const body = req.body as Partial<Omit<Livro, 'id' | 'criadoEm' | 'criadoPor'>>
  for (const campo of ['titulo', 'autor', 'descricao', 'categoria', 'url', 'capa', 'cor'] as const) {
    if (body[campo] !== undefined) livro[campo] = body[campo]!
  }
  writeData(data)
  audit('CONFIG_UPDATED', req, `Livro atualizado: #${id}`)
  res.json(livroPublico(livro))
})

// DELETE /api/cursos/livros/:id
router.delete('/livros/:id', requireAuth, requireArea('cursos', 'editar'), (req: Request, res: Response): void => {
  const id = idDaRota(req, res); if (id === undefined) return
  const data = readData()
  const antes = data.livros?.length ?? 0
  data.livros = (data.livros ?? []).filter(l => l.id !== id)
  if (data.livros.length === antes) { res.status(404).json({ error: 'Livro não encontrado' }); return }
  writeData(data)
  audit('CONFIG_UPDATED', req, `Livro removido: #${id}`)
  res.json({ ok: true })
})

export default router
