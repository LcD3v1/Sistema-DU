import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { requireArea } from '../middleware/roles'
import {
  validateBody, arvoreSchema, noArvoreSchema, noArvoreParcialSchema, ligacaoArvoreSchema, ligacaoArvoreParcialSchema, mensagemArvoreSchema,
} from '../middleware/validate'
import { readData, writeData, peekData } from '../data'
import { audit } from '../security/audit'
import { canArea, isAdmin } from '../access'
import { idDaRota, nomeDaConta } from '../registros'
import { notificar } from '../notificacoes'
import { conferirArquivos, sincronizarArquivos } from './arquivos'
import type { AnexoArvore, Arvore, ArquivoRef, DuData, FotoArvore, LigacaoArvore, NoArvore } from '../types'

/**
 * Árvore de investigação: quadros com cards (pessoas, com fotos e dados) ligados por linhas.
 * arvore/ver vê os quadros; arvore/editar cria, mexe nos cards/linhas e escreve no chat.
 * Fotos: arquivo enviado na área "arvore" (bytes conferidos em routes/arquivos.ts) ou link http/https.
 * Cada mudança sobe a "versao" do quadro — quem está com ele aberto atualiza sozinho.
 * Privacidade: cada árvore é de quem criou + as pessoas escolhidas; admins (cargos com acesso total) veem todas.
 * Árvore sem dono/participantes (criada antes da privacidade) continua aberta até alguém escolher as pessoas.
 * Quem não participa recebe 404 (nem sabe que a árvore existe).
 */
const router = Router()

const MAX_ARVORES = 200
const MAX_NOS = 300
const MAX_LIGACOES = 600
// Chat: nada é apagado enquanto a árvore existir (fotos incluídas); passou do teto, recusa novas
const MAX_MENSAGENS = 5000

type FotoEntrada = { arquivo: string } | { url: string }
const agora = () => new Date().toISOString()
const lista = (data: DuData) => (data.arvores ??= [])

/** Admin vê tudo; árvore antiga (sem participantes) é aberta; senão só quem participa. */
function podeAcessar(data: DuData, contaId: number, a: Arvore): boolean {
  const conta = data.contas.find(c => c.id === contaId)
  if (!conta) return false
  return isAdmin(conta, data) || !a.participantes || a.participantes.includes(contaId)
}
/** Quem escolhe as pessoas da árvore: quem criou ou admin. */
function podeGerenciar(data: DuData, contaId: number, a: Arvore): boolean {
  const conta = data.contas.find(c => c.id === contaId)
  return Boolean(conta && (isAdmin(conta, data) || (a.criadoPorId !== undefined && a.criadoPorId === contaId)))
}
/** Participantes válidos: contas ativas, não exoneradas; quem cria sempre entra. */
function participantesValidos(data: DuData, ids: number[], criador: number | undefined): number[] | null {
  const unicos = [...new Set([...(criador ? [criador] : []), ...ids])]
  if (unicos.some(id => !data.contas.some(c => c.id === id && c.ativo !== false && !c.exonerado))) return null
  return unicos
}
function carregar(req: Request, res: Response): { data: DuData; arvore: Arvore } | undefined {
  const id = idDaRota(req, res); if (id === undefined) return
  const data = readData()
  const arvore = lista(data).find(a => a.id === id)
  if (!arvore || !podeAcessar(data, req.user!.contaId, arvore)) { res.status(404).json({ error: 'Árvore não encontrada' }); return }
  return { data, arvore }
}
/** Remove linhas e, em cascata, as linhas que saíam delas. */
function removerLigacoes(arvore: Arvore, saem: (l: LigacaoArvore) => boolean): void {
  let fora = new Set(arvore.ligacoes.filter(saem).map(l => l.id))
  while (fora.size) {
    arvore.ligacoes = arvore.ligacoes.filter(l => !fora.has(l.id))
    const ids = fora
    fora = new Set(arvore.ligacoes.filter(l => (l.deLig != null && ids.has(l.deLig)) || (l.paraLig != null && ids.has(l.paraLig))).map(l => l.id))
  }
}
function idNumerico(raw: unknown, res: Response): number | undefined {
  const s = String(raw)
  const id = /^\d{1,9}$/.test(s) ? parseInt(s, 10) : NaN
  if (!Number.isInteger(id) || id < 1) { res.status(400).json({ error: 'ID inválido' }); return }
  return id
}
function tocar(data: DuData, arvore: Arvore, req: Request): void {
  arvore.versao++
  arvore.atualizadoPor = nomeDaConta(data, req.user!.contaId)
  arvore.atualizadoEm = agora()
}

/** Arquivos (área "arvore") referenciados por um card. */
const arquivosDe = (fotos: (FotoArvore | null)[]): ArquivoRef[] =>
  fotos.flatMap(f => (f && 'arquivo' in f ? [f.arquivo] : []))

/**
 * Confere as fotos vindas do cliente: arquivos têm de existir na área "arvore" (dados do banco, nunca do cliente).
 * Foto de card = só imagem; anexo do chat = imagem ou vídeo.
 */
async function resolverFotos(entrada: FotoEntrada[], aceitaVideo = false, jaDoCard: string[] = []): Promise<FotoArvore[] | null> {
  const ids = entrada.flatMap(f => ('arquivo' in f ? [f.arquivo] : []))
  const refs = await conferirArquivos(ids, 'arvore', jaDoCard)
  if (!refs) return null
  if (refs.some(r => !r.mime.startsWith('image/') && !(aceitaVideo && r.mime.startsWith('video/')))) return null
  return entrada.map(f => ('arquivo' in f ? { arquivo: refs.find(r => r.id === f.arquivo)! } : { url: f.url }))
}

// Saída campo a campo
function inqueritoDe(data: DuData, arvore: Arvore, contaId: number) {
  if (!arvore.inqueritoId) return null
  const conta = data.contas.find(c => c.id === contaId)
  const inq = data.inqueritos.find(i => i.id === arvore.inqueritoId)
  // Título do inquérito só para quem pode ver inquéritos
  if (!inq || !conta || !canArea(conta, data, 'inqueritos', 'ver')) return { id: arvore.inqueritoId, numero: null, titulo: null }
  return { id: inq.id, numero: inq.numero, titulo: inq.titulo }
}
const fotoPublica = (f: FotoArvore | null) => (f ? ('arquivo' in f ? { arquivo: f.arquivo } : { url: f.url }) : null)
const anexoPublico = (a: AnexoArvore | null) => (a && 'video' in a ? { video: a.video } : fotoPublica(a))
const noPublico = (n: NoArvore) => ({
  id: n.id, x: n.x, y: n.y, nome: n.nome, apelido: n.apelido, telefone: n.telefone, funcao: n.funcao, faccao: n.faccao,
  endereco: n.endereco, veiculo: n.veiculo, observacoes: n.observacoes, status: n.status,
  foto: fotoPublica(n.foto), fotos: n.fotos.map(fotoPublica), atualizadoEm: n.atualizadoEm,
})
const ligacaoPublica = (l: LigacaoArvore) => ({
  id: l.id, de: l.de ?? null, deLado: l.deLado ?? null, deLig: l.deLig ?? null, deT: l.deT ?? null,
  para: l.para ?? null, paraLado: l.paraLado ?? null, paraLig: l.paraLig ?? null, paraT: l.paraT ?? null,
  cor: l.cor, rotulo: l.rotulo, curva: l.curva,
})
function resumo(data: DuData, a: Arvore, contaId: number) {
  return {
    id: a.id, nome: a.nome, descricao: a.descricao, inquerito: inqueritoDe(data, a, contaId),
    totalNos: a.nos.length, totalLigacoes: a.ligacoes.length, versao: a.versao,
    privada: Boolean(a.participantes),
    participantes: (a.participantes ?? []).map(id => ({ id, nome: nomeDaConta(data, id), voce: id === contaId })),
    podeGerenciar: podeGerenciar(data, contaId, a),
    criadoPor: a.criadoPor, criadoEm: a.criadoEm, atualizadoPor: a.atualizadoPor, atualizadoEm: a.atualizadoEm,
  }
}
function completo(data: DuData, a: Arvore, contaId: number) {
  const conta = data.contas.find(c => c.id === contaId)
  return {
    ...resumo(data, a, contaId),
    podeEditar: Boolean(conta && canArea(conta, data, 'arvore', 'editar')),
    nos: a.nos.map(noPublico),
    ligacoes: a.ligacoes.map(ligacaoPublica),
    mensagens: a.mensagens.map(m => ({ id: m.id, autor: m.autor, texto: m.texto, em: m.em, anexo: anexoPublico(m.anexo ?? null), minha: m.contaId === contaId })),
  }
}

function inqueritoValido(data: DuData, inqueritoId: number | null, res: Response): boolean {
  if (inqueritoId !== null && !data.inqueritos.some(i => i.id === inqueritoId)) { res.status(400).json({ error: 'Inquérito não encontrado.' }); return false }
  return true
}

// ── Árvores ───────────────────────────────────────────────────────────────────

router.get('/', requireAuth, requireArea('arvore', 'ver'), (req: Request, res: Response): void => {
  const data = readData()
  res.json(lista(data).filter(a => podeAcessar(data, req.user!.contaId, a)).map(a => resumo(data, a, req.user!.contaId)).sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm)))
})

// Inquéritos para ligar a árvore (só número e título; só quem vê inquéritos)
router.get('/inqueritos', requireAuth, requireArea('arvore', 'editar'), (req: Request, res: Response): void => {
  const data = readData()
  const conta = data.contas.find(c => c.id === req.user!.contaId)
  if (!conta || !canArea(conta, data, 'inqueritos', 'ver')) { res.json([]); return }
  res.json(data.inqueritos.map(i => ({ id: i.id, numero: i.numero, titulo: i.titulo })))
})

// Pessoas que podem ser escolhidas para trabalhar na árvore (só nomes)
router.get('/pessoas', requireAuth, requireArea('arvore', 'editar'), (req: Request, res: Response): void => {
  const data = readData()
  res.json(data.contas
    .filter(c => c.ativo !== false && !c.exonerado && (c.cargoPermId || isAdmin(c, data)))
    .map(c => ({ id: c.id, nome: nomeDaConta(data, c.id), voce: c.id === req.user!.contaId, admin: isAdmin(c, data) }))
    .sort((a, b) => a.nome.localeCompare(b.nome)))
})

router.post('/', requireAuth, requireArea('arvore', 'editar'), validateBody(arvoreSchema), (req: Request, res: Response): void => {
  const body = req.body as { nome: string; descricao: string; inqueritoId: number | null; participantes?: number[] }
  const data = readData()
  if (lista(data).length >= MAX_ARVORES) { res.status(400).json({ error: `Limite de ${MAX_ARVORES} árvores atingido.` }); return }
  if (!inqueritoValido(data, body.inqueritoId, res)) return
  // Sempre privada: quem cria + quem foi escolhido (sozinho = só quem cria)
  const participantes = participantesValidos(data, body.participantes ?? [], req.user!.contaId)
  if (!participantes) { res.status(400).json({ error: 'Pessoa escolhida não encontrada ou sem acesso.' }); return }
  const autor = nomeDaConta(data, req.user!.contaId)
  const arvore: Arvore = {
    participantes, criadoPorId: req.user!.contaId,
    id: data.nextArvoreId ?? Math.max(0, ...lista(data).map(a => a.id)) + 1,
    nome: body.nome, descricao: body.descricao, inqueritoId: body.inqueritoId,
    nos: [], nextNoId: 1, ligacoes: [], nextLigacaoId: 1, mensagens: [], nextMensagemId: 1, versao: 1,
    criadoPor: autor, criadoEm: agora(), atualizadoPor: autor, atualizadoEm: agora(),
  }
  data.nextArvoreId = arvore.id + 1
  lista(data).push(arvore)
  for (const id of participantes) {
    if (id !== req.user!.contaId) notificar(data, id, 'investigacao', 'Você entrou numa árvore de investigação', `${autor} colocou você na árvore "${arvore.nome}".`, `/arvores/${arvore.id}`)
  }
  writeData(data)
  audit('ARVORE_CREATED', req, `${arvore.nome} (#${arvore.id})`)
  res.status(201).json(completo(data, arvore, req.user!.contaId))
})

router.get('/:id', requireAuth, requireArea('arvore', 'ver'), (req: Request, res: Response): void => {
  const ctx = carregar(req, res); if (!ctx) return
  // Quem já tem a versão atual recebe só a versão (o quadro aberto pergunta a cada poucos segundos)
  if (req.query.versao && String(req.query.versao) === String(ctx.arvore.versao)) { res.json({ versao: ctx.arvore.versao, igual: true }); return }
  res.json(completo(ctx.data, ctx.arvore, req.user!.contaId))
})

router.put('/:id', requireAuth, requireArea('arvore', 'editar'), validateBody(arvoreSchema), (req: Request, res: Response): void => {
  const ctx = carregar(req, res); if (!ctx) return
  const { data, arvore } = ctx
  const body = req.body as { nome: string; descricao: string; inqueritoId: number | null; participantes?: number[] }
  if (!inqueritoValido(data, body.inqueritoId, res)) return
  const antes = `${arvore.nome} | inquérito ${arvore.inqueritoId ?? '—'} | pessoas ${arvore.participantes?.length ?? 'todas'}`
  if (body.participantes !== undefined) {
    // Só quem criou ou admin escolhe as pessoas
    if (!podeGerenciar(data, req.user!.contaId, arvore)) { res.status(403).json({ error: 'Só quem criou a árvore ou um admin escolhe as pessoas.' }); return }
    const p = participantesValidos(data, body.participantes, arvore.criadoPorId)
    if (!p) { res.status(400).json({ error: 'Pessoa escolhida não encontrada ou sem acesso.' }); return }
    const novos = p.filter(id => !(arvore.participantes ?? []).includes(id) && id !== req.user!.contaId)
    arvore.participantes = p
    for (const id of novos) {
      notificar(data, id, 'investigacao', 'Você entrou numa árvore de investigação',
        `${nomeDaConta(data, req.user!.contaId)} colocou você na árvore "${arvore.nome}".`, `/arvores/${arvore.id}`)
    }
  }
  Object.assign(arvore, { nome: body.nome, descricao: body.descricao, inqueritoId: body.inqueritoId })
  tocar(data, arvore, req)
  writeData(data)
  audit('ARVORE_UPDATED', req, `Árvore #${arvore.id}\n${antes} → ${arvore.nome} | inquérito ${arvore.inqueritoId ?? '—'} | pessoas ${arvore.participantes?.length ?? 'todas'}`)
  res.json(completo(data, arvore, req.user!.contaId))
})

router.delete('/:id', requireAuth, requireArea('arvore', 'editar'), async (req: Request, res: Response): Promise<void> => {
  const ctx = carregar(req, res); if (!ctx) return
  const { data, arvore } = ctx
  const arquivos = [...arvore.nos.flatMap(n => arquivosDe([n.foto, ...n.fotos])), ...arquivosDe(arvore.mensagens.map(m => (m.anexo && !('video' in m.anexo) ? m.anexo : null)))]
  data.arvores = lista(data).filter(a => a.id !== arvore.id)
  writeData(data)
  await sincronizarArquivos(arquivos, [])
  audit('ARVORE_DELETED', req, `${arvore.nome} (#${arvore.id}) — ${arvore.nos.length} card(s)`)
  res.json({ ok: true })
})

// ── Cards ─────────────────────────────────────────────────────────────────────

router.post('/:id/nos', requireAuth, requireArea('arvore', 'editar'), validateBody(noArvoreSchema), async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Omit<NoArvore, 'id' | 'foto' | 'fotos' | 'criadoPor' | 'atualizadoEm'> & { foto: FotoEntrada | null; fotos: FotoEntrada[] }
  const fotos = await resolverFotos([...(body.foto ? [body.foto] : []), ...body.fotos])
  if (!fotos) { res.status(400).json({ error: 'Foto inválida: envie de novo.' }); return }
  // Daqui até writeData: sem await
  const ctx = carregar(req, res); if (!ctx) return
  const { data, arvore } = ctx
  if (arvore.nos.length >= MAX_NOS) { res.status(400).json({ error: `Limite de ${MAX_NOS} cards nesta árvore.` }); return }
  const autor = nomeDaConta(data, req.user!.contaId)
  const no: NoArvore = {
    ...body, id: arvore.nextNoId++, foto: body.foto ? fotos[0] : null, fotos: body.foto ? fotos.slice(1) : fotos,
    criadoPor: autor, atualizadoEm: agora(),
  }
  arvore.nos.push(no)
  tocar(data, arvore, req)
  writeData(data)
  await sincronizarArquivos([], arquivosDe([no.foto, ...no.fotos]))
  audit('ARVORE_UPDATED', req, `Árvore #${arvore.id}: card adicionado${no.nome ? ` (${no.nome})` : ''}`)
  res.status(201).json({ no: noPublico(no), versao: arvore.versao })
})

router.patch('/:id/nos/:noId', requireAuth, requireArea('arvore', 'editar'), validateBody(noArvoreParcialSchema), async (req: Request, res: Response): Promise<void> => {
  const noId = idNumerico(req.params.noId, res); if (noId === undefined) return
  const body = req.body as Partial<Omit<NoArvore, 'foto' | 'fotos'> & { foto: FotoEntrada | null; fotos: FotoEntrada[] }>
  let novasFotos: FotoArvore[] | undefined
  if (body.foto !== undefined || body.fotos !== undefined) {
    // Fotos que o card já tem continuam valendo (só leitura aqui; a permissão é conferida em carregar)
    const arvoreId = parseInt(String(req.params.id), 10)
    const card = (peekData() as DuData).arvores?.find(a => a.id === arvoreId)?.nos.find(n => n.id === noId)
    const jaDoCard = card ? arquivosDe([card.foto, ...card.fotos]).map(a => a.id) : []
    const r = await resolverFotos([...(body.foto ? [body.foto] : []), ...(body.fotos ?? [])], false, jaDoCard)
    if (!r) { res.status(400).json({ error: 'Foto inválida: envie de novo.' }); return }
    novasFotos = r
  }
  // Daqui até writeData: sem await
  const ctx = carregar(req, res); if (!ctx) return
  const { data, arvore } = ctx
  const no = arvore.nos.find(n => n.id === noId)
  if (!no) { res.status(404).json({ error: 'Card não encontrado' }); return }
  const antes = arquivosDe([no.foto, ...no.fotos])
  const { foto: _f, fotos: _fs, ...campos } = body
  const mudou = Object.keys(campos).filter(k => !['x', 'y'].includes(k) && String(no[k as keyof NoArvore] ?? '') !== String(campos[k as keyof typeof campos] ?? ''))
  Object.assign(no, campos)
  if (novasFotos) {
    // novasFotos = [foto principal (se veio)] + fotos extras (se vieram)
    if (body.foto !== undefined) no.foto = body.foto ? novasFotos[0] : null
    if (body.fotos !== undefined) no.fotos = novasFotos.slice(body.foto ? 1 : 0)
  }
  no.atualizadoEm = agora()
  tocar(data, arvore, req)
  writeData(data)
  if (novasFotos) await sincronizarArquivos(antes, arquivosDe([no.foto, ...no.fotos]))
  // Mover card não vira log (muito frequente); editar dados vira
  if (mudou.length || novasFotos) audit('ARVORE_UPDATED', req, `Árvore #${arvore.id}: card ${no.nome || `#${no.id}`} editado${mudou.length ? `\n${mudou.join(', ')}` : ''}${novasFotos ? '\nfotos' : ''}`)
  res.json({ no: noPublico(no), versao: arvore.versao })
})

router.delete('/:id/nos/:noId', requireAuth, requireArea('arvore', 'editar'), async (req: Request, res: Response): Promise<void> => {
  const noId = idNumerico(req.params.noId, res); if (noId === undefined) return
  const ctx = carregar(req, res); if (!ctx) return
  const { data, arvore } = ctx
  const no = arvore.nos.find(n => n.id === noId)
  if (!no) { res.status(404).json({ error: 'Card não encontrado' }); return }
  arvore.nos = arvore.nos.filter(n => n.id !== noId)
  removerLigacoes(arvore, l => l.de === noId || l.para === noId)   // linhas do card (e as que saíam delas) saem junto
  tocar(data, arvore, req)
  writeData(data)
  await sincronizarArquivos(arquivosDe([no.foto, ...no.fotos]), [])
  audit('ARVORE_UPDATED', req, `Árvore #${arvore.id}: card removido${no.nome ? ` (${no.nome})` : ''}`)
  res.json({ ok: true, versao: arvore.versao })
})

// ── Linhas ────────────────────────────────────────────────────────────────────

router.post('/:id/ligacoes', requireAuth, requireArea('arvore', 'editar'), validateBody(ligacaoArvoreSchema), (req: Request, res: Response): void => {
  const ctx = carregar(req, res); if (!ctx) return
  const { data, arvore } = ctx
  const body = req.body as Omit<LigacaoArvore, 'id'>
  // Cada ponta: card existente ou linha existente desta árvore
  for (const [no, lig] of [[body.de, body.deLig], [body.para, body.paraLig]] as const) {
    if (no != null && !arvore.nos.some(n => n.id === no)) { res.status(404).json({ error: 'Card não encontrado' }); return }
    if (lig != null && !arvore.ligacoes.some(l => l.id === lig)) { res.status(404).json({ error: 'Linha não encontrada' }); return }
  }
  if ((body.de != null && body.de === body.para) || (body.deLig != null && body.deLig === body.paraLig)) { res.status(400).json({ error: 'Ligue dois pontos diferentes.' }); return }
  if (arvore.ligacoes.length >= MAX_LIGACOES) { res.status(400).json({ error: `Limite de ${MAX_LIGACOES} linhas nesta árvore.` }); return }
  if (body.de != null && body.para != null && arvore.ligacoes.some(l => l.de === body.de && l.deLado === body.deLado && l.para === body.para && l.paraLado === body.paraLado)) {
    res.status(409).json({ error: 'Essa ligação já existe.' }); return
  }
  const ligacao: LigacaoArvore = { id: arvore.nextLigacaoId++, ...body }
  arvore.ligacoes.push(ligacao)
  tocar(data, arvore, req)
  writeData(data)
  res.status(201).json({ ligacao: ligacaoPublica(ligacao), versao: arvore.versao })
})

router.patch('/:id/ligacoes/:ligId', requireAuth, requireArea('arvore', 'editar'), validateBody(ligacaoArvoreParcialSchema), (req: Request, res: Response): void => {
  const ligId = idNumerico(req.params.ligId, res); if (ligId === undefined) return
  const ctx = carregar(req, res); if (!ctx) return
  const { data, arvore } = ctx
  const ligacao = arvore.ligacoes.find(l => l.id === ligId)
  if (!ligacao) { res.status(404).json({ error: 'Linha não encontrada' }); return }
  const corpo = req.body as Partial<LigacaoArvore>
  if ((corpo.deLado && ligacao.de == null) || (corpo.paraLado && ligacao.para == null)) { res.status(400).json({ error: 'Essa ponta está ligada numa linha, não num card.' }); return }
  Object.assign(ligacao, corpo)
  tocar(data, arvore, req)
  writeData(data)
  res.json({ ligacao: ligacaoPublica(ligacao), versao: arvore.versao })
})

router.delete('/:id/ligacoes/:ligId', requireAuth, requireArea('arvore', 'editar'), (req: Request, res: Response): void => {
  const ligId = idNumerico(req.params.ligId, res); if (ligId === undefined) return
  const ctx = carregar(req, res); if (!ctx) return
  const { data, arvore } = ctx
  if (!arvore.ligacoes.some(l => l.id === ligId)) { res.status(404).json({ error: 'Linha não encontrada' }); return }
  removerLigacoes(arvore, l => l.id === ligId)   // linhas que saíam desta também saem
  tocar(data, arvore, req)
  writeData(data)
  res.json({ ok: true, versao: arvore.versao })
})

// ── Chat / anotações da árvore ────────────────────────────────────────────────

router.post('/:id/mensagens', requireAuth, requireArea('arvore', 'editar'), validateBody(mensagemArvoreSchema), async (req: Request, res: Response): Promise<void> => {
  const { texto, anexo } = req.body as { texto: string; anexo?: FotoEntrada | { video: string } | null }
  // Link de vídeo segue como link (o servidor não abre); foto/vídeo enviado é conferido na área árvore
  const fotos: AnexoArvore[] | null = anexo && 'video' in anexo ? [{ video: anexo.video }] : anexo ? await resolverFotos([anexo], true) : []
  if (!fotos) { res.status(400).json({ error: 'Anexo inválido: envie de novo.' }); return }
  // Daqui até writeData: sem await
  const ctx = carregar(req, res); if (!ctx) return
  const { data, arvore } = ctx
  if (arvore.mensagens.length >= MAX_MENSAGENS) { res.status(400).json({ error: `O chat desta árvore chegou ao limite de ${MAX_MENSAGENS} mensagens.` }); return }
  arvore.mensagens.push({ id: arvore.nextMensagemId++, contaId: req.user!.contaId, autor: nomeDaConta(data, req.user!.contaId), texto, em: agora(), ...(fotos[0] ? { anexo: fotos[0] } : {}) })
  tocar(data, arvore, req)
  writeData(data)
  // Foto do chat fica guardada até a árvore ser apagada (DELETE /:id apaga tudo)
  await sincronizarArquivos([], arquivosDe([fotos[0] && !('video' in fotos[0]) ? fotos[0] : null]))
  res.status(201).json(completo(data, arvore, req.user!.contaId))
})

export default router
