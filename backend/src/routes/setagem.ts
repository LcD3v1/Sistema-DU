import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { requireArea } from '../middleware/roles'
import { hierarquiaLimiter } from '../middleware/rateLimiter'
import { validateBody, setagemSchema, setoresSchema } from '../middleware/validate'
import { readData, writeData } from '../data'
import { audit } from '../security/audit'
import { podeAtribuirCargo } from '../access'
import { nomeDaConta } from '../registros'
import { discordConfig, infoServidor, gatewayConectado } from '../discord'
import { setagemAtual, estadoSetagem, publicarSetagem, MODELO_PADRAO, garantirCargosAdvertencia } from '../setagem'
import { imagemEnviada, erroDasImagens } from '../hierarquia'
import { ehLinkImagem } from '../security/imagem'
import { Setagem, DuData, Conta, SetorSetagem, ImagemPainel } from '../types'

/**
 * Setagem: configuração do painel "Solicitar set" e aprovação dos pedidos.
 * Tudo exige a área "setagem" (ver = consultar; editar = configurar e aprovar).
 * Quem aprova só atribui cargos do site que poderia atribuir (podeAtribuirCargo) — inclusive
 * o cargo padrão ligado à patente; cargos do Discord com permissão de moderação são recusados.
 */
const router = Router()

/** Saída campo a campo (o ID da mensagem publicada não sai). */
function configPublica(s: Setagem) {
  return {
    titulo: s.titulo, descricao: s.descricao ?? null, categoriaId: s.categoriaId ?? null, canalId: s.canalId ?? null, forumRegistroId: s.forumRegistroId ?? null,
    aprovadores: s.aprovadores ?? [], imagem: s.imagem ?? null, rodapeTexto: s.rodapeTexto ?? null,
    imagens: (s.imagens ?? []).map(i => ({ posicao: i.posicao, url: i.url, lado: i.lado ?? null })),
    modeloApelido: s.modeloApelido,
    patentes: s.patentes.map(p => ({ id: p.id, nome: p.nome, prefixo: p.prefixo, roleIds: p.roleIds, cargoPermId: p.cargoPermId ?? null })),
    setores: (s.setores ?? []).map(x => ({ id: x.id, nome: x.nome, roleIds: x.roleIds })),
    advertencias: [0, 1, 2].map(n => s.advertencias?.[n] ?? ''),
    versao: s.versao, atualizadoPor: s.atualizadoPor ?? null, atualizadoEm: s.atualizadoEm ?? null, publicado: Boolean(s.mensagemId),
  }
}
const autorDe = (data: DuData, req: Request): Conta | undefined => data.contas.find(c => c.id === req.user!.contaId)

// GET /api/setagem — configuração + situação
router.get('/', requireAuth, requireArea('setagem', 'ver'), (_req: Request, res: Response): void => {
  const data = readData()
  const e = estadoSetagem()
  res.json({
    config: configPublica(setagemAtual(data)),
    estado: { erro: e.erro ?? null, ultimaAtualizacao: e.ultimaAtualizacao ?? null, botConectado: gatewayConectado() },
    pendentes: data.solicitacoesAcesso.filter(s => s.setagem).length,
    discordConfigurado: Boolean(discordConfig()),
  })
})

// GET /api/setagem/discord — categorias, canais e cargos do servidor + cargos do site que você pode atribuir
router.get('/discord', requireAuth, requireArea('setagem', 'editar'), async (req: Request, res: Response): Promise<void> => {
  const cfg = discordConfig()
  if (!cfg) { res.status(503).json({ error: 'Discord não configurado no servidor.' }); return }
  const info = await infoServidor(cfg)
  if (!info) { res.status(502).json({ error: 'Não foi possível falar com o Discord agora. Tente de novo.' }); return }
  const data = readData()
  const autor = autorDe(data, req)
  res.json({
    categorias: info.todosCanais.filter(c => c.tipo === 'categoria').map(c => ({ id: c.id, nome: c.nome })),
    canais: info.todosCanais.filter(c => c.tipo === 'texto' || c.tipo === 'anuncios').map(c => ({ id: c.id, nome: c.nome, categoriaId: c.categoriaId ?? null })),
    foruns: info.todosCanais.filter(c => c.tipo === 'forum').map(c => ({ id: c.id, nome: c.nome })),
    // Cargos com moderação/administração e de bots não podem ser dados pela setagem
    cargos: info.todosCargos.filter(r => !r.integracao).map(r => ({ id: r.id, nome: r.nome, cor: r.cor, bloqueado: r.perigoso })),
    cargosSite: autor ? data.cargosPermissao.filter(c => podeAtribuirCargo(autor, c, data)).map(c => ({ id: c.id, nome: c.nome })) : [],
  })
})

// PUT /api/setagem — salva (versão confere edição simultânea) e publica o painel
router.put('/', requireAuth, requireArea('setagem', 'editar'), hierarquiaLimiter, validateBody(setagemSchema), async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { titulo: string; descricao: string | null; categoriaId: string | null; canalId: string | null; forumRegistroId?: string | null; versao: number
    aprovadores: string[]; imagem: string | null; rodapeTexto: string | null; advertencias?: string[]; imagens?: ImagemPainel[]
    patentes: { id: number | null; nome: string; prefixo: string; roleIds: string[]; cargoPermId: number | null }[] }
  if (!body.titulo) { res.status(400).json({ error: 'Informe o título do painel.' }); return }
  if (body.patentes.some(p => !p.nome)) { res.status(400).json({ error: 'Toda patente precisa de nome.' }); return }
  if (new Set(body.patentes.map(p => p.nome.toLowerCase())).size !== body.patentes.length) { res.status(400).json({ error: 'Há patentes com o mesmo nome.' }); return }
  const cfg = discordConfig()
  const info = cfg ? await infoServidor(cfg) : undefined
  if (!info) { res.status(502).json({ error: 'Não foi possível conferir o servidor no Discord agora. Tente de novo.' }); return }
  const canal = body.canalId ? info.todosCanais.find(c => c.id === body.canalId && (c.tipo === 'texto' || c.tipo === 'anuncios')) : undefined
  if (body.canalId && !canal) { res.status(400).json({ error: 'Canal não encontrado no servidor.' }); return }
  if (body.categoriaId && !info.todosCanais.some(c => c.id === body.categoriaId && c.tipo === 'categoria')) { res.status(400).json({ error: 'Categoria não encontrada no servidor.' }); return }
  if (body.forumRegistroId && !info.todosCanais.some(c => c.id === body.forumRegistroId && c.tipo === 'forum')) { res.status(400).json({ error: 'Escolha um canal do tipo fórum para o registro.' }); return }
  if (body.imagem && !(body.imagem.startsWith('data:') ? imagemEnviada(body.imagem) : ehLinkImagem(body.imagem))) {
    res.status(400).json({ error: 'Imagem inválida: envie PNG, JPG, WEBP ou GIF (até 1 MB) ou cole um link http/https.' }); return
  }
  // Imagens soltas no painel: topo, depois do título, do passo a passo, antes/depois do botão ou no fim
  const imagens = body.imagens ?? []
  const erroImagens = erroDasImagens(imagens, p => ['topo', 'titulo', 'passos', 'texto', 'botao', 'fim'].includes(p))
  if (erroImagens) { res.status(400).json({ error: erroImagens }); return }
  for (const id of body.aprovadores) {
    if (!info.todosCargos.some(r => r.id === id)) { res.status(400).json({ error: 'Cargo aprovador não encontrado no servidor.' }); return }
  }
  for (const p of body.patentes) {
    for (const roleId of p.roleIds) {
      const cargo = info.todosCargos.find(r => r.id === roleId)
      if (!cargo || cargo.integracao) { res.status(400).json({ error: `Cargo do Discord da patente "${p.nome}" não encontrado.` }); return }
      // Cargo com moderação/administração pode ser configurado, mas o bot nunca entrega: quem aprova dá à mão
    }
  }

  for (const id of (body.advertencias ?? []).filter(Boolean)) {
    const cargo = info.todosCargos.find(r => r.id === id)
    if (!cargo || cargo.integracao) { res.status(400).json({ error: 'Cargo de advertência não encontrado no servidor.' }); return }
    if (cargo.perigoso) { res.status(400).json({ error: `O cargo @${cargo.nome} tem permissão de moderação/administração e não pode ser de advertência.` }); return }
  }

  // Daqui até writeData: sem await
  const data = readData()
  const atual = setagemAtual(data)
  if (body.versao !== atual.versao) {
    res.status(409).json({ error: `${atual.atualizadoPor ?? 'Outra pessoa'} alterou a setagem enquanto você editava. Recarregamos a versão mais nova — confira e salve de novo.`,
      config: configPublica(atual) }); return
  }
  const autor = autorDe(data, req)
  for (const p of body.patentes) {
    if (p.cargoPermId === null) continue
    const cargo = data.cargosPermissao.find(c => c.id === p.cargoPermId)
    if (!cargo) { res.status(400).json({ error: `Cargo do site da patente "${p.nome}" não encontrado.` }); return }
    // Quem configura não liga a patente a um cargo do site acima do que ele mesmo pode atribuir
    if (!autor || !podeAtribuirCargo(autor, cargo, data)) {
      audit('PRIVILEGE_ESCALATION_ATTEMPT', req, `Setagem: patente ligada ao cargo #${cargo.id} sem permissão`)
      res.status(403).json({ error: `Você não pode ligar a patente ao cargo ${cargo.nome}.` }); return
    }
  }
  let nextPatenteId = atual.nextPatenteId
  const nova: Setagem = {
    titulo: body.titulo,
    ...(body.descricao ? { descricao: body.descricao } : {}),
    ...(body.categoriaId ? { categoriaId: body.categoriaId } : {}),
    ...(body.canalId ? { canalId: body.canalId } : {}),
    // Fórum de registro: sem o campo no corpo (versão antiga do site) mantém o atual
    ...(body.forumRegistroId !== undefined ? (body.forumRegistroId ? { forumRegistroId: body.forumRegistroId } : {}) : (atual.forumRegistroId ? { forumRegistroId: atual.forumRegistroId } : {})),
    aprovadores: [...new Set(body.aprovadores)],
    ...(body.imagem ? { imagem: body.imagem } : {}),
    ...(body.rodapeTexto ? { rodapeTexto: body.rodapeTexto } : {}),
    ...(imagens.length ? { imagens: imagens.map(i => ({ posicao: i.posicao, url: i.url, ...(i.lado ? { lado: i.lado } : {}) })) } : {}),
    // Mesmo canal: edita a mensagem existente; canal novo: publica de novo
    ...(body.canalId && body.canalId === atual.canalId && atual.mensagemId ? { mensagemId: atual.mensagemId } : {}),
    modeloApelido: MODELO_PADRAO,   // apelido fixo: prefixo, codinome e ID
    // ID estável: pedidos pendentes continuam apontando para a mesma patente
    patentes: body.patentes.map(p => ({
      id: p.id !== null && atual.patentes.some(x => x.id === p.id) ? p.id : nextPatenteId++,
      nome: p.nome, prefixo: p.prefixo, roleIds: p.roleIds, ...(p.cargoPermId !== null ? { cargoPermId: p.cargoPermId } : {}),
    })),
    nextPatenteId: 0,
    setores: atual.setores ?? [], nextSetorId: atual.nextSetorId,
    advertencias: body.advertencias ? [0, 1, 2].map(n => body.advertencias![n] ?? '') : (atual.advertencias ?? []),
    versao: atual.versao + 1,
    atualizadoPor: nomeDaConta(data, req.user!.contaId),
    atualizadoEm: new Date().toISOString(),
  }
  nova.nextPatenteId = nextPatenteId
  data.setagem = nova
  writeData(data)
  audit('CONFIG_UPDATED', req, `Setagem: ${nova.patentes.length} patente(s), versão ${nova.versao}`)
  await publicarSetagem(true)
  const e = estadoSetagem()
  res.json({ config: configPublica(setagemAtual(readData())), estado: { erro: e.erro ?? null, ultimaAtualizacao: e.ultimaAtualizacao ?? null, botConectado: gatewayConectado() } })
})

// PUT /api/setagem/setores — setores/subunidades (Configurações → Setores): nome + 1–2 cargos do Discord
router.put('/setores', requireAuth, requireArea('setagem', 'editar'), hierarquiaLimiter, validateBody(setoresSchema), async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { setores: { id: number | null; nome: string; roleIds: string[] }[]; versao: number }
  if (new Set(body.setores.map(x => x.nome.toLowerCase())).size !== body.setores.length) { res.status(400).json({ error: 'Há setores com o mesmo nome.' }); return }
  const cfg = discordConfig()
  const info = cfg ? await infoServidor(cfg) : undefined
  if (!info) { res.status(502).json({ error: 'Não foi possível conferir o servidor no Discord agora. Tente de novo.' }); return }
  for (const x of body.setores) {
    for (const roleId of x.roleIds) {
      const cargo = info.todosCargos.find(r => r.id === roleId)
      if (!cargo || cargo.integracao) { res.status(400).json({ error: `Cargo do Discord do setor "${x.nome}" não encontrado.` }); return }
      // Cargo com moderação: configurável; o bot não entrega (aviso para dar à mão)
    }
  }
  // Daqui até writeData: sem await
  const data = readData()
  const atual = setagemAtual(data)
  if (body.versao !== atual.versao) {
    res.status(409).json({ error: `${atual.atualizadoPor ?? 'Outra pessoa'} alterou a setagem enquanto você editava. Recarregamos a versão mais nova — confira e salve de novo.`,
      config: configPublica(atual) }); return
  }
  let nextSetorId = atual.nextSetorId ?? 1
  // ID estável: pedidos pendentes continuam apontando para o mesmo setor
  const setores: SetorSetagem[] = body.setores.map(x => ({
    id: x.id !== null && (atual.setores ?? []).some(y => y.id === x.id) ? x.id : nextSetorId++, nome: x.nome, roleIds: x.roleIds,
  }))
  data.setagem = { ...atual, setores, nextSetorId, versao: atual.versao + 1, atualizadoPor: nomeDaConta(data, req.user!.contaId), atualizadoEm: new Date().toISOString() }
  writeData(data)
  audit('CONFIG_UPDATED', req, `Setagem: ${setores.length} setor(es), versão ${data.setagem.versao}`)
  await publicarSetagem(true)   // texto do painel cita o setor
  res.json({ config: configPublica(setagemAtual(readData())) })
})

// POST /api/setagem/advertencias — confere os cargos de ADV 1, 2 e 3 e CRIA os que faltarem (sem permissão nenhuma)
router.post('/advertencias', requireAuth, requireArea('setagem', 'editar'), hierarquiaLimiter, async (req: Request, res: Response): Promise<void> => {
  if (!discordConfig()) { res.status(503).json({ error: 'Discord não configurado no servidor.' }); return }
  const ids = await garantirCargosAdvertencia()
  if (!ids) { res.status(502).json({ error: 'Não consegui criar os cargos. O bot precisa de "Gerenciar cargos".' }); return }
  audit('CONFIG_UPDATED', req, 'Setagem: cargos de advertência conferidos')
  res.json({ config: configPublica(setagemAtual(readData())) })
})

// Pedidos de set: aprovados/reprovados em Configurações → Solicitações (routes/config.ts) ou no canal temporário do Discord

// POST /api/setagem/publicar — publica/edita o painel no Discord agora
router.post('/publicar', requireAuth, requireArea('setagem', 'editar'), hierarquiaLimiter, async (req: Request, res: Response): Promise<void> => {
  await publicarSetagem(true)
  audit('CONFIG_UPDATED', req, 'Setagem: painel publicado manualmente')
  const e = estadoSetagem()
  res.json({ estado: { erro: e.erro ?? null, ultimaAtualizacao: e.ultimaAtualizacao ?? null, botConectado: gatewayConectado() } })
})

export default router
