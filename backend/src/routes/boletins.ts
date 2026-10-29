import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { requireArea } from '../middleware/roles'
import { validateBody, boletimSchema } from '../middleware/validate'
import { audit } from '../security/audit'
import { readData, writeData } from '../data'
import { notificarArea } from '../notificacoes'
import { conferirArquivos, sincronizarArquivos } from './arquivos'
import {
  idDaRota, nomeDaConta, investigadoresValidos, registrarAlteracao, camposAlterados, numeroPadrao, basePublica, erroArquivos,
} from '../registros'
import type { Boletim, DuData } from '../types'

/**
 * Boletins da unidade — registro e consulta, independente dos relatórios.
 * boletins/ver consulta; boletins/editar registra, edita e exclui.
 */

type CorpoBoletim = Omit<Boletim, 'id' | 'arquivos' | 'autorContaId' | 'autorNome' | 'criadoEm' | 'atualizadoEm' | 'historico' | 'inqueritoId'>
  & { arquivos: string[]; inqueritoId?: number | null }

const ROTULOS = {
  numero: 'número', titulo: 'título', data: 'data', local: 'local', investigadores: 'investigadores',
  descricao: 'descrição', observacoes: 'observações', imagens: 'imagens', links: 'links', arquivos: 'arquivos',
  inqueritoId: 'inquérito',
} as const

const STATUS: Record<Boletim['status'], string> = {
  aberto: 'Aberto', em_investigacao: 'Em investigação', concluido: 'Concluído', arquivado: 'Arquivado',
}

const router = Router()

function publico(b: Boletim) {
  return {
    ...basePublica(b),
    status: b.status, data: b.data, local: b.local, descricao: b.descricao, observacoes: b.observacoes,
    imagens: b.imagens, inqueritoId: b.inqueritoId ?? null,
  }
}

/** Número informado não pode repetir o de outro boletim. */
function numeroLivre(data: DuData, numero: string, exceto?: number): boolean {
  const n = numero.toLowerCase()
  return !data.boletins.some(b => b.id !== exceto && b.numero.toLowerCase() === n)
}

router.get('/', requireAuth, requireArea('boletins', 'ver'), (_req: Request, res: Response): void => {
  res.json([...readData().boletins].sort((a, b) => b.id - a.id).map(publico))
})

router.post('/', requireAuth, requireArea('boletins', 'editar'), validateBody(boletimSchema), async (req: Request, res: Response): Promise<void> => {
  const body = req.body as CorpoBoletim
  const arquivos = await conferirArquivos(body.arquivos, 'boletins')
  if (!arquivos) { erroArquivos(res); return }
  const data = readData()
  const investigadores = investigadoresValidos(data, body.investigadores)
  if (!investigadores) { res.status(400).json({ error: 'Investigador inválido.' }); return }
  if (body.inqueritoId && !data.inqueritos.some(i => i.id === body.inqueritoId)) { res.status(400).json({ error: 'Inquérito vinculado não encontrado.' }); return }

  const id = Math.max(data.nextBoletimId, ...data.boletins.map(b => b.id + 1))
  const numero = body.numero || numeroPadrao('BO-DU', id)
  if (!numeroLivre(data, numero)) { res.status(409).json({ error: 'Já existe um boletim com esse número.' }); return }
  const autorNome = nomeDaConta(data, req.user!.contaId)
  const novo: Boletim = {
    id, numero, titulo: body.titulo, status: body.status, data: body.data, local: body.local,
    investigadores, descricao: body.descricao, observacoes: body.observacoes, imagens: body.imagens,
    links: body.links, arquivos, ...(body.inqueritoId ? { inqueritoId: body.inqueritoId } : {}),
    autorContaId: req.user!.contaId, autorNome, criadoEm: new Date().toISOString(), historico: [],
  }
  registrarAlteracao(novo, autorNome, 'criado')
  data.boletins.push(novo)
  data.nextBoletimId = id + 1
  notificarArea(data, 'boletins', [req.user!.contaId], 'boletim', 'Novo boletim registrado', `${numero} · ${novo.titulo}`, '/boletins')
  writeData(data)
  await sincronizarArquivos([], arquivos)
  audit('BOLETIM_CREATED', req, `#${id}`)
  res.status(201).json(publico(novo))
})

router.put('/:id', requireAuth, requireArea('boletins', 'editar'), validateBody(boletimSchema), async (req: Request, res: Response): Promise<void> => {
  const id = idDaRota(req, res); if (id === undefined) return
  const body = req.body as CorpoBoletim
  const data = readData()
  const bol = data.boletins.find(b => b.id === id)
  if (!bol) { res.status(404).json({ error: 'Boletim não encontrado' }); return }
  const investigadores = investigadoresValidos(data, body.investigadores)
  if (!investigadores) { res.status(400).json({ error: 'Investigador inválido.' }); return }
  if (body.inqueritoId && !data.inqueritos.some(i => i.id === body.inqueritoId)) { res.status(400).json({ error: 'Inquérito vinculado não encontrado.' }); return }
  const numero = body.numero || bol.numero
  if (!numeroLivre(data, numero, id)) { res.status(409).json({ error: 'Já existe um boletim com esse número.' }); return }
  const arquivos = await conferirArquivos(body.arquivos, 'boletins', bol.arquivos.map(a => a.id))
  if (!arquivos) { erroArquivos(res); return }

  const antes = { ...bol }
  const depois: Partial<Boletim> = {
    numero, titulo: body.titulo, data: body.data, local: body.local, investigadores, descricao: body.descricao,
    observacoes: body.observacoes, imagens: body.imagens, links: body.links, arquivos,
    inqueritoId: body.inqueritoId ?? undefined,
  }
  const mudou = camposAlterados(antes, depois, ROTULOS)
  Object.assign(bol, depois)
  if (!bol.inqueritoId) delete bol.inqueritoId
  const por = nomeDaConta(data, req.user!.contaId)
  if (body.status !== antes.status) {
    bol.status = body.status
    registrarAlteracao(bol, por, 'status', `${STATUS[antes.status]} → ${STATUS[body.status]}`)
  }
  if (mudou) registrarAlteracao(bol, por, 'editado', mudou)
  bol.atualizadoEm = new Date().toISOString()
  writeData(data)
  await sincronizarArquivos(antes.arquivos, arquivos)
  audit('BOLETIM_UPDATED', req, `#${id}`)
  res.json(publico(bol))
})

router.delete('/:id', requireAuth, requireArea('boletins', 'editar'), async (req: Request, res: Response): Promise<void> => {
  const id = idDaRota(req, res); if (id === undefined) return
  const data = readData()
  const bol = data.boletins.find(b => b.id === id)
  if (!bol) { res.status(404).json({ error: 'Boletim não encontrado' }); return }
  data.boletins = data.boletins.filter(b => b.id !== id)
  // Relatórios que citavam o boletim perdem só o vínculo
  for (const r of data.relatorios) if (r.boletimId === id) delete r.boletimId
  writeData(data)
  await sincronizarArquivos(bol.arquivos, [])
  audit('BOLETIM_DELETED', req, `#${id}`)
  res.json({ ok: true })
})

export default router
