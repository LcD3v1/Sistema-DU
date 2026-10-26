import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { requireArea } from '../middleware/roles'
import { validateBody, fotoGaleriaSchema } from '../middleware/validate'
import { audit } from '../security/audit'
import { readData, writeData } from '../data'
import { isAdmin } from '../access'
import { conferirArquivos, sincronizarArquivos } from './arquivos'
import { idDaRota, nomeDaConta, erroArquivos } from '../registros'
import type { FastData, FotoGaleria } from '../types'

/**
 * Galeria da DU — fotos de operações, atividades e registros da unidade.
 * galeria/ver vê; galeria/editar publica e edita/exclui as PRÓPRIAS fotos (admin: todas).
 * A foto vem de um link http/https ou de um arquivo enviado (routes/arquivos.ts).
 */

const MAX_FOTOS = 3000

const router = Router()

function publico(f: FotoGaleria, contaId: number, data: FastData) {
  const conta = data.contas.find(c => c.id === contaId)
  return {
    id: f.id, imagem: f.imagem, arquivo: f.arquivo ?? null, titulo: f.titulo, descricao: f.descricao,
    categoria: f.categoria, data: f.data, autorNome: f.autorNome, criadoEm: f.criadoEm,
    podeEditar: f.autorContaId === contaId || Boolean(conta && isAdmin(conta, data)),
  }
}

type CorpoFoto = Omit<FotoGaleria, 'id' | 'arquivo' | 'autorContaId' | 'autorNome' | 'criadoEm'> & { arquivo: string }

router.get('/', requireAuth, requireArea('galeria', 'ver'), (req: Request, res: Response): void => {
  const data = readData()
  res.json([...data.galeria].sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id).map(f => publico(f, req.user!.contaId, data)))
})

router.post('/', requireAuth, requireArea('galeria', 'editar'), validateBody(fotoGaleriaSchema), async (req: Request, res: Response): Promise<void> => {
  const body = req.body as CorpoFoto
  const arquivos = await conferirArquivos(body.arquivo ? [body.arquivo] : [], 'galeria')
  if (!arquivos || (arquivos[0] && !arquivos[0].mime.startsWith('image/'))) { erroArquivos(res); return }
  const data = readData()
  if (data.galeria.length >= MAX_FOTOS) { res.status(409).json({ error: `A galeria chegou ao limite de ${MAX_FOTOS} fotos.` }); return }
  const id = Math.max(data.nextFotoId, ...data.galeria.map(f => f.id + 1))
  const nova: FotoGaleria = {
    id, imagem: body.imagem, ...(arquivos[0] ? { arquivo: arquivos[0] } : {}),
    titulo: body.titulo, descricao: body.descricao, categoria: body.categoria, data: body.data,
    autorContaId: req.user!.contaId, autorNome: nomeDaConta(data, req.user!.contaId), criadoEm: new Date().toISOString(),
  }
  data.galeria.push(nova)
  data.nextFotoId = id + 1
  writeData(data)
  await sincronizarArquivos([], arquivos)
  audit('FOTO_CREATED', req, `#${id}`)
  res.status(201).json(publico(nova, req.user!.contaId, data))
})

router.put('/:id', requireAuth, requireArea('galeria', 'editar'), validateBody(fotoGaleriaSchema), async (req: Request, res: Response): Promise<void> => {
  const id = idDaRota(req, res); if (id === undefined) return
  const body = req.body as CorpoFoto
  const data = readData()
  const foto = data.galeria.find(f => f.id === id)
  if (!foto) { res.status(404).json({ error: 'Foto não encontrada' }); return }
  if (!publico(foto, req.user!.contaId, data).podeEditar) { res.status(403).json({ error: 'Só quem publicou edita esta foto.' }); return }
  const arquivos = await conferirArquivos(body.arquivo ? [body.arquivo] : [], 'galeria')
  if (!arquivos || (arquivos[0] && !arquivos[0].mime.startsWith('image/'))) { erroArquivos(res); return }
  const antes = foto.arquivo ? [foto.arquivo] : []
  Object.assign(foto, { imagem: body.imagem, titulo: body.titulo, descricao: body.descricao, categoria: body.categoria, data: body.data })
  if (arquivos[0]) foto.arquivo = arquivos[0]; else delete foto.arquivo
  writeData(data)
  await sincronizarArquivos(antes, arquivos)
  audit('FOTO_UPDATED', req, `#${id}`)
  res.json(publico(foto, req.user!.contaId, data))
})

router.delete('/:id', requireAuth, requireArea('galeria', 'editar'), async (req: Request, res: Response): Promise<void> => {
  const id = idDaRota(req, res); if (id === undefined) return
  const data = readData()
  const foto = data.galeria.find(f => f.id === id)
  if (!foto) { res.status(404).json({ error: 'Foto não encontrada' }); return }
  if (!publico(foto, req.user!.contaId, data).podeEditar) { res.status(403).json({ error: 'Só quem publicou exclui esta foto.' }); return }
  data.galeria = data.galeria.filter(f => f.id !== id)
  writeData(data)
  await sincronizarArquivos(foto.arquivo ? [foto.arquivo] : [], [])
  audit('FOTO_DELETED', req, `#${id}`)
  res.json({ ok: true })
})

export default router
