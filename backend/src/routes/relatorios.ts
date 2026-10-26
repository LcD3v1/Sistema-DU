import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { requireArea } from '../middleware/roles'
import { validateBody, relatorioSchema } from '../middleware/validate'
import { audit } from '../security/audit'
import { readData, writeData } from '../data'
import { canArea } from '../access'
import { notificar } from '../notificacoes'
import { contaDoMembro } from '../efetivo'
import { conferirArquivos, sincronizarArquivos } from './arquivos'
import {
  idDaRota, nomeDaConta, investigadoresValidos, registrarAlteracao, camposAlterados, numeroPadrao, basePublica, erroArquivos,
} from '../registros'
import type { Conta, FastData, Relatorio } from '../types'

/**
 * Relatórios investigativos: cada investigador cadastra os relatórios das próprias
 * investigações (substitui o antigo "Cadastrar" de apreensões).
 *
 *  - relatorios/ver ........ consulta os relatórios da unidade (menos os sigilosos de outros)
 *  - relatorios/editar ..... cadastra e edita/exclui os próprios (autor ou investigador citado)
 *  - relatorios_gestao ..... vê sigilosos e edita/exclui qualquer relatório
 */

type CorpoRelatorio = Omit<Relatorio, 'id' | 'numero' | 'arquivos' | 'autorContaId' | 'autorNome' | 'criadoEm' | 'atualizadoEm' | 'historico' | 'inqueritoId' | 'boletimId'>
  & { arquivos: string[]; inqueritoId?: number | null; boletimId?: number | null }

const ROTULOS = {
  titulo: 'título', tipo: 'tipo', data: 'data', conteudo: 'conteúdo', investigadores: 'investigadores',
  inqueritoId: 'inquérito', boletimId: 'boletim', links: 'links', arquivos: 'arquivos', sigiloso: 'sigilo',
} as const

const router = Router()

function contaAtual(req: Request, data: FastData): Conta | undefined {
  return data.contas.find(c => c.id === req.user!.contaId)
}

/** Autor ou investigador citado. */
function envolvido(r: Relatorio, conta: Conta): boolean {
  return r.autorContaId === conta.id || (conta.membroId !== undefined && r.investigadores.includes(conta.membroId))
}

const gestor = (conta: Conta, data: FastData) => canArea(conta, data, 'relatorios_gestao', 'editar')
const podeVer = (r: Relatorio, conta: Conta, data: FastData) =>
  !r.sigiloso || envolvido(r, conta) || canArea(conta, data, 'relatorios_gestao', 'ver')
const podeEditar = (r: Relatorio, conta: Conta, data: FastData) =>
  gestor(conta, data) || (envolvido(r, conta) && canArea(conta, data, 'relatorios', 'editar'))

function publico(r: Relatorio, conta: Conta, data: FastData) {
  return {
    ...basePublica(r),
    tipo: r.tipo, data: r.data, conteudo: r.conteudo, sigiloso: r.sigiloso,
    inqueritoId: r.inqueritoId ?? null, boletimId: r.boletimId ?? null,
    podeEditar: podeEditar(r, conta, data),
  }
}

/** Vínculos opcionais precisam existir. */
function vinculosValidos(data: FastData, body: CorpoRelatorio): boolean {
  if (body.inqueritoId && !data.inqueritos.some(i => i.id === body.inqueritoId)) return false
  if (body.boletimId && !data.boletins.some(b => b.id === body.boletimId)) return false
  return true
}

function avisarInvestigadores(data: FastData, r: Relatorio, exceto: number, titulo: string) {
  for (const membroId of r.investigadores) {
    const conta = contaDoMembro(data, membroId)
    if (!conta || conta.id === exceto) continue
    notificar(data, conta.id, 'relatorio', titulo, `${r.numero} · ${r.titulo}`, '/relatorios')
  }
}

// GET /api/relatorios — consulta (filtros e busca ficam no cliente)
router.get('/', requireAuth, requireArea('relatorios', 'ver'), (req: Request, res: Response): void => {
  const data = readData()
  const conta = contaAtual(req, data)!
  const lista = data.relatorios.filter(r => podeVer(r, conta, data)).sort((a, b) => b.id - a.id)
  res.json(lista.map(r => publico(r, conta, data)))
})

// POST /api/relatorios — cadastra
router.post('/', requireAuth, requireArea('relatorios', 'editar'), validateBody(relatorioSchema), async (req: Request, res: Response): Promise<void> => {
  const body = req.body as CorpoRelatorio
  const arquivos = await conferirArquivos(body.arquivos, 'relatorios')
  if (!arquivos) { erroArquivos(res); return }
  const data = readData()
  const conta = contaAtual(req, data)!
  const investigadores = investigadoresValidos(data, body.investigadores)
  if (!investigadores) { res.status(400).json({ error: 'Investigador inválido.' }); return }
  if (!vinculosValidos(data, body)) { res.status(400).json({ error: 'Inquérito ou boletim vinculado não encontrado.' }); return }
  // Quem cadastra sempre aparece entre os responsáveis
  if (conta.membroId && !investigadores.includes(conta.membroId)) investigadores.unshift(conta.membroId)

  const id = Math.max(data.nextRelatorioId, ...data.relatorios.map(r => r.id + 1))
  const autorNome = nomeDaConta(data, conta.id)
  const novo: Relatorio = {
    id, numero: numeroPadrao('REL-DU', id),
    titulo: body.titulo, tipo: body.tipo, data: body.data, conteudo: body.conteudo,
    investigadores, links: body.links, arquivos, sigiloso: body.sigiloso,
    ...(body.inqueritoId ? { inqueritoId: body.inqueritoId } : {}),
    ...(body.boletimId ? { boletimId: body.boletimId } : {}),
    autorContaId: conta.id, autorNome, criadoEm: new Date().toISOString(), historico: [],
  }
  registrarAlteracao(novo, autorNome, 'criado')
  data.relatorios.push(novo)
  data.nextRelatorioId = id + 1
  avisarInvestigadores(data, novo, conta.id, 'Você foi citado em um relatório')
  writeData(data)
  await sincronizarArquivos([], arquivos)
  audit('RELATORIO_CREATED', req, `#${id}${novo.sigiloso ? ' (sigiloso)' : ''}`)
  res.status(201).json(publico(novo, conta, data))
})

// PUT /api/relatorios/:id — edita (autor/investigador com Editar, ou gestão)
router.put('/:id', requireAuth, requireArea('relatorios', 'ver'), validateBody(relatorioSchema), async (req: Request, res: Response): Promise<void> => {
  const id = idDaRota(req, res); if (id === undefined) return
  const body = req.body as CorpoRelatorio
  const data = readData()
  const conta = contaAtual(req, data)!
  const rel = data.relatorios.find(r => r.id === id)
  if (!rel || !podeVer(rel, conta, data)) { res.status(404).json({ error: 'Relatório não encontrado' }); return }
  if (!podeEditar(rel, conta, data)) { res.status(403).json({ error: 'Só o autor, os investigadores citados ou a gestão editam este relatório.' }); return }
  const investigadores = investigadoresValidos(data, body.investigadores)
  if (!investigadores) { res.status(400).json({ error: 'Investigador inválido.' }); return }
  if (!vinculosValidos(data, body)) { res.status(400).json({ error: 'Inquérito ou boletim vinculado não encontrado.' }); return }
  const arquivos = await conferirArquivos(body.arquivos, 'relatorios')
  if (!arquivos) { erroArquivos(res); return }

  const antes = { ...rel }
  const depois: Partial<Relatorio> = {
    titulo: body.titulo, tipo: body.tipo, data: body.data, conteudo: body.conteudo, investigadores,
    links: body.links, arquivos, sigiloso: body.sigiloso,
    inqueritoId: body.inqueritoId ?? undefined, boletimId: body.boletimId ?? undefined,
  }
  const mudou = camposAlterados(antes, depois, ROTULOS)
  Object.assign(rel, depois)
  if (!rel.inqueritoId) delete rel.inqueritoId
  if (!rel.boletimId) delete rel.boletimId
  rel.atualizadoEm = new Date().toISOString()
  registrarAlteracao(rel, nomeDaConta(data, conta.id), 'editado', mudou || undefined)
  writeData(data)
  await sincronizarArquivos(antes.arquivos, arquivos)
  audit('RELATORIO_UPDATED', req, `#${id}`)
  res.json(publico(rel, conta, data))
})

// DELETE /api/relatorios/:id
router.delete('/:id', requireAuth, requireArea('relatorios', 'ver'), async (req: Request, res: Response): Promise<void> => {
  const id = idDaRota(req, res); if (id === undefined) return
  const data = readData()
  const conta = contaAtual(req, data)!
  const rel = data.relatorios.find(r => r.id === id)
  if (!rel || !podeVer(rel, conta, data)) { res.status(404).json({ error: 'Relatório não encontrado' }); return }
  if (!podeEditar(rel, conta, data)) { res.status(403).json({ error: 'Sem permissão para excluir este relatório.' }); return }
  data.relatorios = data.relatorios.filter(r => r.id !== id)
  writeData(data)
  await sincronizarArquivos(rel.arquivos, [])
  audit('RELATORIO_DELETED', req, `#${id}`)
  res.json({ ok: true })
})

export default router
