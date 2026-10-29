import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { requireArea } from '../middleware/roles'
import { hierarquiaLimiter } from '../middleware/rateLimiter'
import { validateBody, hierarquiaSchema, novaHierarquiaSchema } from '../middleware/validate'
import { readData, writeData } from '../data'
import { audit } from '../security/audit'
import { ehLinkImagem } from '../security/imagem'
import { discordConfig, infoServidor, apagarMensagem, EmbedPainel } from '../discord'
import {
  estadoPainel, agendarAtualizacao, atualizarPainel, imagemEnviada,
  painelPorId, todosPaineis, gravarPainel, esquecerPainel, erroDasImagens, MAX_PAINEIS_EXTRAS,
} from '../hierarquia'
import { Hierarquia, ImagemPainel } from '../types'
import { nomeDaConta } from '../registros'

const router = Router()

/** Saída campo a campo (o ID da mensagem publicada não sai). */
function configPublica(id: number, h: Hierarquia) {
  return {
    id,
    titulo: h.titulo, logo: h.logo ?? null, canalId: h.canalId ?? null,
    rodapeTexto: h.rodapeTexto ?? null, rodapeIcone: h.rodapeIcone ?? null,
    cargos: h.cargos.map(c => ({ roleId: c.roleId, nome: c.nome, emoji: c.emoji ?? null })),
    imagens: (h.imagens ?? []).map(i => ({ posicao: i.posicao, url: i.url, lado: i.lado ?? null })),
    versao: h.versao, atualizadoPor: h.atualizadoPor ?? null, atualizadoEm: h.atualizadoEm ?? null,
    publicado: Boolean(h.mensagemId),
  }
}

/**
 * Prévia para o site SEM IDs do Discord: menções viram o nome de quem tem conta (ou "@membro")
 * e a foto do bot (URL com o ID do bot) não sai. Logo e foto do rodapé vêm da configuração
 * (enviadas ou link); sem foto do rodapé configurada, o site mostra o ícone padrão do bot.
 */
function previaSemIds(e: EmbedPainel | undefined, h: Hierarquia) {
  if (!e) return null
  const data = readData()
  const nomes = new Map(data.contas.filter(c => c.discordId).map(c => [c.discordId!, nomeDaConta(data, c.id)]))   // codinome (regra)
  return {
    titulo: e.title,
    texto: e.description.replace(/<@!?(\d{17,20})>/g, (_m, id: string) => `@${nomes.get(id) ?? 'membro'}`),
    resumo: e.resumo ?? null,
    blocos: (e.blocos ?? []).map(b => ({
      titulo: b.titulo, vago: b.vago,
      membros: b.membros.map(m => m.replace(/^<@!?(\d{17,20})>$/, (_m, id: string) => `@${nomes.get(id) ?? 'membro'}`)),
    })),
    logo: e.thumbnail ? (h.logo ?? null) : null,
    rodape: e.footer.text,
    rodapeIcone: h.rodapeIcone ?? null,
    // Imagens soltas: "depois do cargo" vira o número do bloco (o ID do cargo não sai na prévia)
    imagens: (h.imagens ?? []).flatMap(i => {
      if (!i.posicao.startsWith('cargo:')) return [{ posicao: i.posicao, url: i.url, lado: i.lado ?? null }]
      const n = (e.blocos ?? []).findIndex(b => `cargo:${b.roleId}` === i.posicao)
      return n >= 0 ? [{ posicao: `bloco:${n}`, url: i.url, lado: i.lado ?? null }] : []
    }),
  }
}

function estadoPublico(id: number, h: Hierarquia) {
  const e = estadoPainel(id)
  return { ultimaAtualizacao: e.ultimaAtualizacao ?? null, erro: e.erro ?? null, modo: e.modo ?? null, previa: previaSemIds(e.previa, h) }
}

/** Resposta padrão: o painel pedido + a lista de painéis (só id, título e se está publicado). */
function resposta(id: number) {
  const data = readData()
  const h = painelPorId(data, id)!
  return {
    config: configPublica(id, h), estado: estadoPublico(id, h), discordConfigurado: Boolean(discordConfig()),
    paineis: todosPaineis(data).map(([pid, p]) => ({ id: pid, titulo: p.titulo, publicado: Boolean(p.mensagemId) })),
  }
}

/** ID do painel na rota: inteiro ≥ 0 escrito por extenso (0 = principal) e que exista. */
function idDoPainel(req: Request, res: Response): number | undefined {
  const bruto = String(req.params.id)
  const id = parseInt(bruto, 10)
  if (!Number.isSafeInteger(id) || id < 0 || String(id) !== bruto || !painelPorId(readData(), id)) {
    res.status(404).json({ error: 'Hierarquia não encontrada.' }); return undefined
  }
  return id
}

// GET /api/hierarquia — painel principal + lista de painéis + situação
router.get('/', requireAuth, requireArea('hierarquia', 'ver'), (_req: Request, res: Response): void => {
  res.json(resposta(0))
})

// GET /api/hierarquia/discord — cargos, canais, nome do servidor e foto do bot (cache de 1 min)
router.get('/discord', requireAuth, requireArea('hierarquia', 'editar'), async (_req: Request, res: Response): Promise<void> => {
  const cfg = discordConfig()
  if (!cfg) { res.status(503).json({ error: 'Login pelo Discord não configurado no servidor.' }); return }
  const info = await infoServidor(cfg)
  if (!info) { res.status(502).json({ error: 'Não foi possível falar com o Discord agora. Tente de novo.' }); return }
  // Foto do bot não sai (a URL leva o ID do bot): o painel no Discord usa a foto; o site mostra só o nome
  res.json({ servidor: info.nome, bot: { nome: info.botNome }, cargos: info.cargos, canais: info.canais,
    emojis: info.emojis.filter(e => e.disponivel).map(e => ({ nome: e.nome, codigo: `<${e.animado ? 'a' : ''}:${e.nome}:${e.id}>`, url: e.url })) })
})

// GET /api/hierarquia/paineis/:id — um painel (0 = principal)
router.get('/paineis/:id', requireAuth, requireArea('hierarquia', 'ver'), (req: Request, res: Response): void => {
  const id = idDoPainel(req, res)
  if (id !== undefined) res.json(resposta(id))
})

/** Salva um painel. `versao` evita que uma pessoa apague sem ver a alteração de outra. */
async function salvar(req: Request, res: Response, id: number): Promise<void> {
  const body = req.body as { titulo: string; logo: string | null; canalId: string | null; versao: number
    rodapeTexto: string | null; rodapeIcone: string | null
    cargos: { roleId: string; nome: string; emoji?: string | null }[]; imagens?: ImagemPainel[] }
  if (!body.titulo) { res.status(400).json({ error: 'Informe o nome da unidade.' }); return }
  // Imagens soltas: "depois do cargo" só vale para um cargo deste painel
  const imagens = body.imagens ?? []
  const erroImagens = erroDasImagens(imagens, p => ['topo', 'titulo', 'fim'].includes(p) || body.cargos.some(c => p === `cargo:${c.roleId}`))
  if (erroImagens) { res.status(400).json({ error: erroImagens }); return }
  // Imagens opcionais: arquivo enviado (conferido pelos bytes, máx. 1 MB) ou link http/https
  const imagemOk = (v: string | null) => !v || (v.startsWith('data:') ? Boolean(imagemEnviada(v)) : ehLinkImagem(v))
  if (!imagemOk(body.logo)) { res.status(400).json({ error: 'Logo inválida: envie PNG, JPG, WEBP ou GIF (até 1 MB) ou cole um link http/https.' }); return }
  if (!imagemOk(body.rodapeIcone)) { res.status(400).json({ error: 'Foto do rodapé inválida: envie PNG, JPG, WEBP ou GIF (até 1 MB) ou cole um link http/https.' }); return }
  if (body.cargos.some(c => !c.nome)) { res.status(400).json({ error: 'Todo cargo precisa de um nome.' }); return }
  if (new Set(body.cargos.map(c => c.roleId)).size !== body.cargos.length) {
    res.status(400).json({ error: 'O mesmo cargo do Discord está repetido.' }); return
  }
  // Cargos e canal precisam existir no servidor (lista em cache)
  const cfg = discordConfig()
  const info = cfg ? await infoServidor(cfg) : undefined
  if (!info) { res.status(502).json({ error: 'Não foi possível conferir os cargos no Discord agora. Tente de novo.' }); return }
  if (body.canalId && !info.canais.some(c => c.id === body.canalId)) { res.status(400).json({ error: 'Canal não encontrado no servidor.' }); return }
  if (body.cargos.some(c => !info.cargos.some(r => r.id === c.roleId))) { res.status(400).json({ error: 'Cargo não encontrado no servidor.' }); return }

  // Daqui até writeData: sem await (conferência de versão e gravação são atômicas)
  const data = readData()
  const atual = painelPorId(data, id)
  if (!atual) { res.status(404).json({ error: 'Esta hierarquia foi excluída por outra pessoa.' }); return }
  if (body.versao !== atual.versao) {
    res.status(409).json({ error: `${atual.atualizadoPor ?? 'Outra pessoa'} alterou o painel enquanto você editava. Recarregamos a versão mais nova — confira e salve de novo.`,
      config: configPublica(id, atual) }); return
  }
  const nova: Hierarquia = {
    titulo: body.titulo,
    ...(body.logo ? { logo: body.logo } : {}),
    ...(body.rodapeTexto ? { rodapeTexto: body.rodapeTexto } : {}),
    ...(body.rodapeIcone ? { rodapeIcone: body.rodapeIcone } : {}),

    ...(body.canalId ? { canalId: body.canalId } : {}),
    // Mudou de canal: o painel é publicado de novo no canal novo
    ...(body.canalId && body.canalId === atual.canalId && atual.mensagemId ? { mensagemId: atual.mensagemId } : {}),
    cargos: body.cargos.map(c => ({ roleId: c.roleId, nome: c.nome, ...(c.emoji ? { emoji: c.emoji } : {}) })),
    ...(imagens.length ? { imagens: imagens.map(i => ({ posicao: i.posicao, url: i.url, ...(i.lado ? { lado: i.lado } : {}) })) } : {}),
    versao: atual.versao + 1,
    atualizadoPor: nomeDaConta(data, req.user!.contaId),
    atualizadoEm: new Date().toISOString(),
  }
  gravarPainel(data, id, nova)
  writeData(data)
  audit('CONFIG_UPDATED', req, `Painel de hierarquia "${nova.titulo}": ${nova.cargos.length} cargo(s), versão ${nova.versao}`)
  agendarAtualizacao()
  res.json(resposta(id))
}

// PUT /api/hierarquia — salva o painel principal
router.put('/', requireAuth, requireArea('hierarquia', 'editar'), hierarquiaLimiter, validateBody(hierarquiaSchema), (req: Request, res: Response): Promise<void> => salvar(req, res, 0))

// PUT /api/hierarquia/paineis/:id — salva qualquer painel (0 = principal)
router.put('/paineis/:id', requireAuth, requireArea('hierarquia', 'editar'), hierarquiaLimiter, validateBody(hierarquiaSchema), async (req: Request, res: Response): Promise<void> => {
  const id = idDoPainel(req, res)
  if (id !== undefined) await salvar(req, res, id)
})

// POST /api/hierarquia/paineis — cria uma hierarquia a mais (configurada depois, como a principal)
router.post('/paineis', requireAuth, requireArea('hierarquia', 'editar'), hierarquiaLimiter, validateBody(novaHierarquiaSchema), (req: Request, res: Response): void => {
  const data = readData()
  const extras = data.hierarquiasExtras ?? []
  if (extras.length >= MAX_PAINEIS_EXTRAS) { res.status(400).json({ error: `Limite de ${MAX_PAINEIS_EXTRAS} hierarquias extras atingido.` }); return }
  const id = Math.max(data.nextHierarquiaId ?? 1, ...extras.map(h => h.id! + 1))
  data.hierarquiasExtras = [...extras, {
    id, titulo: (req.body as { titulo: string }).titulo, cargos: [], versao: 0,
    atualizadoPor: nomeDaConta(data, req.user!.contaId), atualizadoEm: new Date().toISOString(),
  }]
  data.nextHierarquiaId = id + 1
  writeData(data)
  esquecerPainel(id)
  audit('CONFIG_UPDATED', req, `Hierarquia criada: "${(req.body as { titulo: string }).titulo}"`)
  res.status(201).json(resposta(id))
})

// DELETE /api/hierarquia/paineis/:id — exclui uma hierarquia extra (o principal não sai) e apaga a mensagem dela
router.delete('/paineis/:id', requireAuth, requireArea('hierarquia', 'editar'), hierarquiaLimiter, (req: Request, res: Response): void => {
  const id = idDoPainel(req, res)
  if (id === undefined) return
  if (id === 0) { res.status(400).json({ error: 'A hierarquia principal não pode ser excluída.' }); return }
  const data = readData()
  const h = painelPorId(data, id)!
  data.hierarquiasExtras = (data.hierarquiasExtras ?? []).filter(x => x.id !== id)
  writeData(data)
  esquecerPainel(id)
  audit('CONFIG_UPDATED', req, `Hierarquia excluída: "${h.titulo}"`)
  // Só a mensagem do PRÓPRIO painel (ID guardado ao publicar)
  const cfg = discordConfig()
  if (cfg && h.canalId && h.mensagemId) void apagarMensagem(cfg, h.canalId, h.mensagemId)
  res.json(resposta(0))
})

// POST /api/hierarquia/publicar — atualiza os painéis no Discord agora (resposta do principal)
router.post('/publicar', requireAuth, requireArea('hierarquia', 'editar'), hierarquiaLimiter, async (req: Request, res: Response): Promise<void> => {
  await atualizarPainel(true)
  audit('CONFIG_UPDATED', req, 'Painéis de hierarquia publicados manualmente')
  res.json(resposta(0))
})

// POST /api/hierarquia/paineis/:id/publicar — idem, respondendo com o painel pedido
router.post('/paineis/:id/publicar', requireAuth, requireArea('hierarquia', 'editar'), hierarquiaLimiter, async (req: Request, res: Response): Promise<void> => {
  const id = idDoPainel(req, res)
  if (id === undefined) return
  await atualizarPainel(true)
  audit('CONFIG_UPDATED', req, 'Painéis de hierarquia publicados manualmente')
  res.json(painelPorId(readData(), id) ? resposta(id) : resposta(0))
})

export default router
