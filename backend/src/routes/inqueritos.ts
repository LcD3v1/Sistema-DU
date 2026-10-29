import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { requireArea } from '../middleware/roles'
import { validateBody, inqueritoSchema } from '../middleware/validate'
import { audit } from '../security/audit'
import { readData, writeData } from '../data'
import { notificarArea } from '../notificacoes'
import { conferirArquivos, sincronizarArquivos } from './arquivos'
import {
  idDaRota, nomeDaConta, investigadoresValidos, registrarAlteracao, camposAlterados, numeroPadrao, basePublica, erroArquivos,
} from '../registros'
import type { DuData, Inquerito } from '../types'

/**
 * Arquivo de Inquéritos — estante no mesmo modelo dos Cursos Internos, com
 * links e arquivos enviados do computador (PDFs, documentos, imagens…).
 * inqueritos/ver consulta; inqueritos/editar cria, edita, arquiva e exclui.
 */

const MAX_INQUERITOS = 2000

type CorpoInquerito = Omit<Inquerito, 'id' | 'arquivos' | 'autorContaId' | 'autorNome' | 'criadoEm' | 'atualizadoEm' | 'historico'>
  & { arquivos: string[] }

const ROTULOS = {
  numero: 'número', titulo: 'título', categoria: 'categoria', descricao: 'descrição', envolvidos: 'envolvidos',
  capa: 'capa', cor: 'cor', investigadores: 'investigadores', links: 'links', arquivos: 'arquivos',
} as const

const STATUS: Record<Inquerito['status'], string> = { em_andamento: 'Em andamento', concluido: 'Concluído', arquivado: 'Arquivado' }

const router = Router()

function publico(i: Inquerito) {
  return {
    ...basePublica(i),
    status: i.status, categoria: i.categoria, descricao: i.descricao, envolvidos: i.envolvidos, capa: i.capa, cor: i.cor,
  }
}

function numeroLivre(data: DuData, numero: string, exceto?: number): boolean {
  const n = numero.toLowerCase()
  return !data.inqueritos.some(i => i.id !== exceto && i.numero.toLowerCase() === n)
}

router.get('/', requireAuth, requireArea('inqueritos', 'ver'), (_req: Request, res: Response): void => {
  res.json([...readData().inqueritos].sort((a, b) => b.id - a.id).map(publico))
})

router.post('/', requireAuth, requireArea('inqueritos', 'editar'), validateBody(inqueritoSchema), async (req: Request, res: Response): Promise<void> => {
  const body = req.body as CorpoInquerito
  const arquivos = await conferirArquivos(body.arquivos, 'inqueritos')
  if (!arquivos) { erroArquivos(res); return }
  const data = readData()
  if (data.inqueritos.length >= MAX_INQUERITOS) { res.status(409).json({ error: `O arquivo chegou ao limite de ${MAX_INQUERITOS} inquéritos.` }); return }
  const investigadores = investigadoresValidos(data, body.investigadores)
  if (!investigadores) { res.status(400).json({ error: 'Investigador inválido.' }); return }

  const id = Math.max(data.nextInqueritoId, ...data.inqueritos.map(i => i.id + 1))
  const numero = body.numero || numeroPadrao('IP-DU', id)
  if (!numeroLivre(data, numero)) { res.status(409).json({ error: 'Já existe um inquérito com esse número.' }); return }
  const autorNome = nomeDaConta(data, req.user!.contaId)
  const novo: Inquerito = {
    id, numero, titulo: body.titulo, status: body.status, categoria: body.categoria, descricao: body.descricao,
    envolvidos: body.envolvidos, capa: body.capa, cor: body.cor, investigadores, links: body.links, arquivos,
    autorContaId: req.user!.contaId, autorNome, criadoEm: new Date().toISOString(), historico: [],
  }
  registrarAlteracao(novo, autorNome, 'criado')
  data.inqueritos.push(novo)
  data.nextInqueritoId = id + 1
  notificarArea(data, 'inqueritos', [req.user!.contaId], 'inquerito', 'Novo inquérito no arquivo', `${numero} · ${novo.titulo}`, '/inqueritos')
  writeData(data)
  await sincronizarArquivos([], arquivos)
  audit('INQUERITO_CREATED', req, `#${id}`)
  res.status(201).json(publico(novo))
})

router.put('/:id', requireAuth, requireArea('inqueritos', 'editar'), validateBody(inqueritoSchema), async (req: Request, res: Response): Promise<void> => {
  const id = idDaRota(req, res); if (id === undefined) return
  const body = req.body as CorpoInquerito
  const data = readData()
  const inq = data.inqueritos.find(i => i.id === id)
  if (!inq) { res.status(404).json({ error: 'Inquérito não encontrado' }); return }
  const investigadores = investigadoresValidos(data, body.investigadores)
  if (!investigadores) { res.status(400).json({ error: 'Investigador inválido.' }); return }
  const numero = body.numero || inq.numero
  if (!numeroLivre(data, numero, id)) { res.status(409).json({ error: 'Já existe um inquérito com esse número.' }); return }
  const arquivos = await conferirArquivos(body.arquivos, 'inqueritos', inq.arquivos.map(a => a.id))
  if (!arquivos) { erroArquivos(res); return }

  const antes = { ...inq }
  const depois: Partial<Inquerito> = {
    numero, titulo: body.titulo, categoria: body.categoria, descricao: body.descricao, envolvidos: body.envolvidos,
    capa: body.capa, cor: body.cor, investigadores, links: body.links, arquivos,
  }
  const mudou = camposAlterados(antes, depois, ROTULOS)
  Object.assign(inq, depois)
  const por = nomeDaConta(data, req.user!.contaId)
  if (body.status !== antes.status) {
    inq.status = body.status
    registrarAlteracao(inq, por, 'status', `${STATUS[antes.status]} → ${STATUS[body.status]}`)
  }
  if (mudou) registrarAlteracao(inq, por, 'editado', mudou)
  inq.atualizadoEm = new Date().toISOString()
  writeData(data)
  await sincronizarArquivos(antes.arquivos, arquivos)
  audit('INQUERITO_UPDATED', req, `#${id}`)
  res.json(publico(inq))
})

router.delete('/:id', requireAuth, requireArea('inqueritos', 'editar'), async (req: Request, res: Response): Promise<void> => {
  const id = idDaRota(req, res); if (id === undefined) return
  const data = readData()
  const inq = data.inqueritos.find(i => i.id === id)
  if (!inq) { res.status(404).json({ error: 'Inquérito não encontrado' }); return }
  data.inqueritos = data.inqueritos.filter(i => i.id !== id)
  // Boletins e relatórios vinculados perdem só o vínculo
  for (const b of data.boletins) if (b.inqueritoId === id) delete b.inqueritoId
  for (const r of data.relatorios) if (r.inqueritoId === id) delete r.inqueritoId
  writeData(data)
  await sincronizarArquivos(inq.arquivos, [])
  audit('INQUERITO_DELETED', req, `#${id}`)
  res.json({ ok: true })
})

export default router
