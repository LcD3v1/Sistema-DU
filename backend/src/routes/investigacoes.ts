import { Router, Request, Response } from 'express'
import { canArea, isAdmin } from '../access'
import { requireAuth } from '../middleware/auth'
import { requireArea } from '../middleware/roles'
import { validateBody, registroInvestigacaoSchema, aprovacaoInvestigacaoSchema, andamentoInvestigacaoSchema } from '../middleware/validate'
import { audit } from '../security/audit'
import { readData, writeData } from '../data'
import { notificar, notificarQuemAprova } from '../notificacoes'
import { contaDoMembro } from '../efetivo'
import { idDaRota, nomeDaConta, nomeDoMembro, investigadoresValidos } from '../registros'
import type {
  AndamentoInvestigacao, AprovacaoInvestigacao, Conta, DuData, LocalInvestigacao, MotivoInvestigacao, RegistroInvestigacao,
} from '../types'

/**
 * Registro de Investigação — pedido para abrir uma investigação, com nome, data, participantes
 * (membros marcados por @, inclusive quem pede), motivo e local (Capital, Detroit ou as duas).
 *
 * PRIVADO: cada pessoa só vê os pedidos que registrou ou em que foi marcada. Ver TODOS = acesso
 * total (admin) ou investigacoes_gestao/ver. Pedido que a pessoa não pode ver responde 404.
 *   investigacoes/editar         → registra pedidos e (se responsável/participante) muda o andamento
 *   investigacoes_gestao/editar  → autoriza/nega e exclui; na aprovação o andamento vira "em andamento" e nasce a
 *                                  árvore de investigação (privada: responsável + participantes)
 * O andamento SÓ o responsável (quem registrou) e os participantes mudam, e só depois de autorizado.
 */

const MAX_REGISTROS = 5000
const MAX_HISTORICO = 60
const MAX_ARVORES = 200      // mesmo teto de routes/arvores.ts

const MOTIVO: Record<MotivoInvestigacao, string> = { investigacao: 'Investigação', coleta_info: 'Coleta de info', info: 'Info', outro: 'Outro' }
const LOCAL: Record<LocalInvestigacao, string> = { capital: 'Capital', detroit: 'Detroit', ambas: 'Capital e Detroit' }
const APROVACAO: Record<AprovacaoInvestigacao, string> = { pendente: 'Pendente', autorizada: 'Autorizada', negada: 'Negada' }
const ANDAMENTO: Record<AndamentoInvestigacao, string> = {
  aguardando: 'Aguardando início', em_andamento: 'Em andamento', pausada: 'Pausada', concluida: 'Concluída', cancelada: 'Cancelada',
}

const router = Router()

const fmt = (d: string) => d.split('-').reverse().join('/')
/** Data e horário da investigação (pedidos antigos sem horário: só a data). */
const quando = (r: RegistroInvestigacao) => r.hora ? `${fmt(r.data)} às ${r.hora}` : fmt(r.data)

/** Pedidos gravados antes da separação aprovação/andamento (campo único "status"). */
function normalizar(r: RegistroInvestigacao): RegistroInvestigacao {
  const antigo = (r as unknown as { status?: string }).status
  if (!r.aprovacao) {
    r.aprovacao = antigo === 'negada' ? 'negada' : antigo === 'autorizada' || antigo === 'concluida' ? 'autorizada' : 'pendente'
    r.andamento = antigo === 'concluida' ? 'concluida' : 'aguardando'
  }
  r.andamento ??= 'aguardando'
  r.historico ??= []
  delete (r as unknown as { status?: string }).status
  return r
}

const ehResponsavel = (conta: Conta, r: RegistroInvestigacao) => r.autorContaId === conta.id
const ehParticipante = (conta: Conta, r: RegistroInvestigacao) => Boolean(conta.membroId && r.participantes.includes(conta.membroId))
const veTodos = (conta: Conta, data: DuData) => canArea(conta, data, 'investigacoes_gestao', 'ver')
const podeVer = (conta: Conta, data: DuData, r: RegistroInvestigacao) => veTodos(conta, data) || ehResponsavel(conta, r) || ehParticipante(conta, r)

/** Saída campo a campo: participantes pelo codinome (regra) + ID (passaporte); sem autorContaId. */
function publico(data: DuData, conta: Conta, r: RegistroInvestigacao) {
  return {
    id: r.id, nome: r.nome, data: r.data, hora: r.hora ?? null, motivo: r.motivo, detalhes: r.detalhes, local: r.local,
    aprovacao: r.aprovacao, andamento: r.andamento,
    participantes: r.participantes.map(id => {
      const m = data.membros.find(x => x.id === id)
      return { id, codinome: m ? nomeDoMembro(data, m) : 'Desconhecido', passaporte: m?.passaporte ?? '' }
    }),
    autorNome: r.autorNome, criadoEm: r.criadoEm,
    decididoPor: r.decididoPor ?? null, decididoEm: r.decididoEm ?? null, observacao: r.observacao ?? null,
    historico: r.historico.map(h => ({ em: h.em, por: h.por, de: h.de, para: h.para, nota: h.nota ?? null })),
    // Árvore só aparece para quem está nela ou é admin (mesma regra de routes/arvores.ts)
    arvoreId: r.arvoreId && (isAdmin(conta, data) || ehResponsavel(conta, r) || ehParticipante(conta, r)) ? r.arvoreId : null,
    souResponsavel: ehResponsavel(conta, r),
    podeAtualizar: r.aprovacao === 'autorizada' && (ehResponsavel(conta, r) || ehParticipante(conta, r)),
  }
}

/** Avisa o responsável e os participantes (menos quem fez a ação). */
function avisarEnvolvidos(data: DuData, r: RegistroInvestigacao, exceto: number, titulo: string, mensagem: string): void {
  const contas = new Set<number>([r.autorContaId])
  for (const membroId of r.participantes) { const c = contaDoMembro(data, membroId)?.id; if (c) contas.add(c) }
  contas.delete(exceto)
  for (const c of contas) notificar(data, c, 'investigacao', titulo, mensagem, '/investigacoes')
}

/** Carrega o pedido e a conta; 404 também quando a pessoa não pode ver (não revela que existe). */
function carregar(req: Request, res: Response): { data: DuData; conta: Conta; reg: RegistroInvestigacao } | undefined {
  const id = idDaRota(req, res); if (id === undefined) return undefined
  const data = readData()
  const conta = data.contas.find(c => c.id === req.user!.contaId)
  const reg = (data.registrosInvestigacao ?? []).find(r => r.id === id)
  if (!conta || !reg || !podeVer(conta, data, reg)) { res.status(404).json({ error: 'Registro não encontrado' }); return undefined }
  return { data, conta, reg: normalizar(reg) }
}

// GET /api/investigacoes — os pedidos que a pessoa pode ver (mais recentes primeiro)
router.get('/', requireAuth, requireArea('investigacoes', 'ver'), (req: Request, res: Response): void => {
  const data = readData()
  const conta = data.contas.find(c => c.id === req.user!.contaId)
  if (!conta) { res.status(404).json({ error: 'Conta não encontrada' }); return }
  res.json([...(data.registrosInvestigacao ?? [])]
    .filter(r => podeVer(conta, data, r))
    .sort((a, b) => b.id - a.id)
    .map(r => publico(data, conta, normalizar(r))))
})

// POST /api/investigacoes — registra um pedido de investigação (aprovação pendente)
router.post('/', requireAuth, requireArea('investigacoes', 'editar'), validateBody(registroInvestigacaoSchema), (req: Request, res: Response): void => {
  const body = req.body as Pick<RegistroInvestigacao, 'nome' | 'data' | 'hora' | 'participantes' | 'motivo' | 'detalhes' | 'local'>
  if (!body.nome) { res.status(400).json({ error: 'Dê um nome à investigação.' }); return }
  if (body.motivo === 'outro' && !body.detalhes) { res.status(400).json({ error: 'Descreva o motivo.' }); return }
  const data = readData()
  const conta = data.contas.find(c => c.id === req.user!.contaId)
  if (!conta) { res.status(404).json({ error: 'Conta não encontrada' }); return }
  const lista = (data.registrosInvestigacao ??= [])
  if (lista.length >= MAX_REGISTROS) { res.status(409).json({ error: `O registro chegou ao limite de ${MAX_REGISTROS} pedidos.` }); return }
  const participantes = investigadoresValidos(data, body.participantes)
  if (!participantes) { res.status(400).json({ error: 'Participante inválido.' }); return }

  const id = Math.max(data.nextRegistroInvestigacaoId ?? 1, ...lista.map(r => r.id + 1))
  const autorNome = nomeDaConta(data, conta.id)
  const novo: RegistroInvestigacao = {
    id, nome: body.nome, data: body.data, hora: body.hora, participantes, motivo: body.motivo, detalhes: body.detalhes, local: body.local,
    aprovacao: 'pendente', andamento: 'aguardando', autorContaId: conta.id, autorNome, criadoEm: new Date().toISOString(), historico: [],
  }
  lista.push(novo)
  data.nextRegistroInvestigacaoId = id + 1
  const resumo = `${novo.nome} · ${quando(novo)} · ${MOTIVO[novo.motivo]} · ${LOCAL[novo.local]}`
  avisarEnvolvidos(data, novo, conta.id, 'Você foi marcado numa investigação', `${autorNome} marcou você: ${resumo}`)
  notificarQuemAprova(data, 'investigacoes_gestao', [conta.id], 'pendente_aprovacao', 'Pedido de investigação', `${autorNome} pediu: ${resumo}`, '/pendentes')
  writeData(data)
  audit('INVESTIGACAO_REGISTRADA', req, `#${id} | ${participantes.length} participante(s)`)
  res.status(201).json(publico(data, conta, novo))
})

// GET /api/investigacoes/aprovacoes — módulo "Aprovar investigações": só quem aprova (todos os pedidos)
router.get('/aprovacoes', requireAuth, requireArea('investigacoes_gestao', 'editar'), (req: Request, res: Response): void => {
  const data = readData()
  const conta = data.contas.find(c => c.id === req.user!.contaId)
  if (!conta) { res.status(404).json({ error: 'Conta não encontrada' }); return }
  res.json([...(data.registrosInvestigacao ?? [])].sort((a, b) => b.id - a.id).map(r => publico(data, conta, normalizar(r))))
})

/**
 * Árvore de investigação do pedido aprovado: privada, com o responsável e as contas dos participantes
 * (ativas, não exoneradas). Quem criou a árvore = o responsável. Devolve undefined no limite de árvores.
 */
function criarArvore(data: DuData, reg: RegistroInvestigacao, por: string): number | undefined {
  const arvores = (data.arvores ??= [])
  if (arvores.length >= MAX_ARVORES) return undefined
  const contas = [reg.autorContaId, ...reg.participantes.map(m => contaDoMembro(data, m)?.id)]
    .filter((id): id is number => typeof id === 'number' && data.contas.some(c => c.id === id && c.ativo !== false && !c.exonerado))
  const id = data.nextArvoreId ?? Math.max(0, ...arvores.map(a => a.id)) + 1
  const em = new Date().toISOString()
  arvores.push({
    id, nome: reg.nome.slice(0, 80), descricao: `${MOTIVO[reg.motivo]} · ${LOCAL[reg.local]} · ${quando(reg)}`, inqueritoId: null,
    nos: [], nextNoId: 1, ligacoes: [], nextLigacaoId: 1, mensagens: [], nextMensagemId: 1, versao: 1,
    participantes: [...new Set(contas)], criadoPorId: reg.autorContaId, investigacaoId: reg.id,
    criadoPor: reg.autorNome, criadoEm: em, atualizadoPor: por, atualizadoEm: em,
  })
  data.nextArvoreId = id + 1
  return id
}

// PUT /api/investigacoes/:id/aprovacao — quem aprova autoriza ou nega um pedido pendente.
// Autorizada: o andamento já vira "em andamento" e nasce a árvore de investigação dos envolvidos.
router.put('/:id/aprovacao', requireAuth, requireArea('investigacoes_gestao', 'editar'), validateBody(aprovacaoInvestigacaoSchema), (req: Request, res: Response): void => {
  const ctx = carregar(req, res); if (!ctx) return
  const { data, conta, reg } = ctx
  const { aprovacao, observacao } = req.body as { aprovacao: Exclude<AprovacaoInvestigacao, 'pendente'>; observacao: string }
  if (reg.aprovacao !== 'pendente') { res.status(400).json({ error: 'Este pedido já foi avaliado.' }); return }

  const por = nomeDaConta(data, conta.id)
  if (aprovacao === 'autorizada') {
    const arvoreId = criarArvore(data, reg, por)
    if (arvoreId === undefined) { res.status(409).json({ error: `Limite de ${MAX_ARVORES} árvores atingido — apague uma árvore antiga antes de autorizar.` }); return }
    reg.arvoreId = arvoreId
    reg.historico = [...reg.historico, { em: new Date().toISOString(), por, de: reg.andamento, para: 'em_andamento' as const, nota: 'Início automático na aprovação' }].slice(-MAX_HISTORICO)
    reg.andamento = 'em_andamento'
  }
  reg.aprovacao = aprovacao
  reg.decididoPor = por
  reg.decididoEm = new Date().toISOString()
  if (observacao) reg.observacao = observacao
  const titulo = `Investigação ${APROVACAO[aprovacao].toLowerCase()}`
  const extra = aprovacao === 'autorizada' ? ' Já está em andamento e a árvore de investigação foi criada.' : ''
  avisarEnvolvidos(data, reg, conta.id, titulo, `"${reg.nome}" foi ${APROVACAO[aprovacao].toLowerCase()} por ${por}${observacao ? `. ${observacao}` : '.'}${extra}`)
  writeData(data)
  audit('INVESTIGACAO_STATUS', req, `#${reg.id} → ${aprovacao}${reg.arvoreId ? ` (árvore #${reg.arvoreId})` : ''}`)
  res.json(publico(data, conta, reg))
})

// PUT /api/investigacoes/:id/andamento — SÓ o responsável e os participantes, depois de autorizada
router.put('/:id/andamento', requireAuth, requireArea('investigacoes', 'editar'), validateBody(andamentoInvestigacaoSchema), (req: Request, res: Response): void => {
  const ctx = carregar(req, res); if (!ctx) return
  const { data, conta, reg } = ctx
  const { andamento, nota } = req.body as { andamento: AndamentoInvestigacao; nota: string }
  if (!ehResponsavel(conta, reg) && !ehParticipante(conta, reg)) { res.status(403).json({ error: 'Só o responsável e os participantes mudam o andamento.' }); return }
  if (reg.aprovacao !== 'autorizada') { res.status(400).json({ error: 'A investigação ainda não foi autorizada.' }); return }
  if (reg.andamento === andamento) { res.status(400).json({ error: `A investigação já está ${ANDAMENTO[andamento].toLowerCase()}.` }); return }

  const por = nomeDaConta(data, conta.id)
  reg.historico = [...reg.historico, { em: new Date().toISOString(), por, de: reg.andamento, para: andamento, ...(nota ? { nota } : {}) }].slice(-MAX_HISTORICO)
  reg.andamento = andamento
  avisarEnvolvidos(data, reg, conta.id, 'Andamento da investigação', `${por} mudou "${reg.nome}" para ${ANDAMENTO[andamento].toLowerCase()}${nota ? `: ${nota}` : '.'}`)
  writeData(data)
  audit('INVESTIGACAO_STATUS', req, `#${reg.id} andamento → ${andamento}`)
  res.json(publico(data, conta, reg))
})

// DELETE /api/investigacoes/:id — só a gestão
router.delete('/:id', requireAuth, requireArea('investigacoes_gestao', 'editar'), (req: Request, res: Response): void => {
  const ctx = carregar(req, res); if (!ctx) return
  const { data, reg } = ctx
  data.registrosInvestigacao = (data.registrosInvestigacao ?? []).filter(r => r.id !== reg.id)
  writeData(data)
  audit('INVESTIGACAO_EXCLUIDA', req, `#${reg.id}`)
  res.json({ ok: true })
})

export default router
