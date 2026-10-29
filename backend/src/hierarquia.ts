/**
 * Painéis de hierarquia no Discord: o principal + quantos extras a pessoa criar. Cada um é uma
 * mensagem do bot, num canal escolhido, que lista as pessoas por cargo do servidor (na ordem configurada). Atualiza sozinha a cada minuto:
 * quem perde o cargo sai do painel na próxima rodada; quem ganha, entra.
 *
 * Leve para o servidor:
 *  - cargos/canais/nome do servidor ficam em cache (1 min) em discord.ts;
 *  - cargos de cada pessoa também (reaproveita as consultas da verificação de saída);
 *  - a mensagem só é editada quando o conteúdo muda (hash do painel);
 *  - uma única atualização por vez (várias pessoas salvando juntas não duplicam nada).
 */
import crypto from 'crypto'
import { readData, writeData } from './data'
import { discordConfig, infoServidor, membrosComCargos, publicarV2, apagarMensagem, listagemCompletaDisponivel, DiscordConfig, EmbedPainel, InfoServidor, AnexoPainel } from './discord'
import { CargoHierarquia, DuData, Hierarquia, ImagemPainel } from './types'
import { ehLinkImagem } from './security/imagem'
import { emojiDoRodape } from './rodapeDiscord'

/** Cor de referência (fundo do Discord). Em Componentes V2 o container fica sem barra colorida de lado. */
const COR_SEM_LINHA = 0x2b2d31
const MAX_DESCRICAO = 3200   // Componentes V2: até 4000 caracteres somando todos os textos (os blocos somam "### " e "> ")

export const hierarquiaPadrao = (): Hierarquia => ({ titulo: 'Hierarquia', cargos: [], versao: 0 })
export const hierarquiaAtual = (data: Pick<DuData, 'hierarquia'>): Hierarquia => data.hierarquia ?? hierarquiaPadrao()

/** Teto de painéis extras (cada um é uma mensagem do bot atualizada a cada minuto). */
export const MAX_PAINEIS_EXTRAS = 50
type DadosPaineis = Pick<DuData, 'hierarquia' | 'hierarquiasExtras'>

/** Painel pelo id: 0 = principal; ≥ 1 = extra (undefined se não existir). */
export function painelPorId(data: DadosPaineis, id: number): Hierarquia | undefined {
  return id === 0 ? hierarquiaAtual(data) : (data.hierarquiasExtras ?? []).find(h => h.id === id)
}
/** Todos os painéis, o principal primeiro: [id, painel]. */
export function todosPaineis(data: DadosPaineis): [number, Hierarquia][] {
  return [[0, hierarquiaAtual(data)], ...(data.hierarquiasExtras ?? []).map(h => [h.id!, h] as [number, Hierarquia])]
}
/** Grava o painel no lugar dele (muta `data`). */
export function gravarPainel(data: DadosPaineis, id: number, h: Hierarquia): void {
  if (id === 0) { const { id: _sem, ...principal } = h; data.hierarquia = principal; return }
  data.hierarquiasExtras = (data.hierarquiasExtras ?? []).map(x => (x.id === id ? { ...h, id } : x))
}

/** Imagem enviada por upload (data URL) — conferida pelos bytes, máx. 1 MB. */
const MAX_IMAGEM_BYTES = 1024 * 1024
const ASSINATURAS: [string, (b: Buffer) => boolean][] = [
  ['png', b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ['jpg', b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['gif', b => b.subarray(0, 6).toString('latin1') === 'GIF87a' || b.subarray(0, 6).toString('latin1') === 'GIF89a'],
  ['webp', b => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP'],
]
const MIMES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }

/** Data URL de imagem → arquivo (extensão pelos bytes reais), ou undefined se não for imagem válida. */
export function imagemEnviada(valor: string, maxBytes = MAX_IMAGEM_BYTES): { ext: string; mime: string; dados: Buffer } | undefined {
  const m = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(valor)
  if (!m) return undefined
  const dados = Buffer.from(m[2], 'base64')
  if (!dados.length || dados.length > maxBytes) return undefined
  const ext = ASSINATURAS.find(([, confere]) => confere(dados))?.[0]
  return ext ? { ext, mime: MIMES[ext], dados } : undefined
}

/** Imagem no painel: link vai direto; upload vira anexo da mensagem (attachment://nome). */
function imagemDoPainel(valor: string | undefined, base: string): { url: string; anexo?: AnexoPainel } | undefined {
  if (!valor) return undefined
  if (!valor.startsWith('data:')) return { url: valor }
  const img = imagemEnviada(valor)
  if (!img) return undefined
  const nome = `${base}.${img.ext}`
  return { url: `attachment://${nome}`, anexo: { nome, mime: img.mime, dados: img.dados } }
}

/** Anexos (imagens enviadas por upload) que acompanham a mensagem do painel. */
export function anexosDoPainel(h: Hierarquia): AnexoPainel[] {
  // O rodapé usa emoji do bot (não anexo): vão anexadas a logo e as imagens soltas enviadas
  return [...[imagemDoPainel(h.logo, 'logo')].flatMap(i => (i?.anexo ? [i.anexo] : [])), ...galeriasDoPainel(h.imagens).anexos]
}

// ── Imagens soltas (hierarquia e setagem) ────────────────────────────────────
/** Até 4 por painel: cabe no limite de componentes do Discord e no tamanho do envio (5 MB). */
export const MAX_IMAGENS_PAINEL = 4

/** Confere as imagens soltas: quantidade, posição permitida e a imagem (upload pelos bytes ou link http/https). */
export function erroDasImagens(imagens: ImagemPainel[], posicaoOk: (posicao: string) => boolean): string | undefined {
  if (imagens.length > MAX_IMAGENS_PAINEL) return `No máximo ${MAX_IMAGENS_PAINEL} imagens por painel.`
  if (imagens.some(i => !posicaoOk(i.posicao))) return 'Posição de imagem inválida.'
  if (imagens.some(i => !(i.url.startsWith('data:') ? imagemEnviada(i.url) : ehLinkImagem(i.url)))) {
    return 'Imagem inválida: envie PNG, JPG, WEBP ou GIF (até 1 MB) ou cole um link http/https.'
  }
  return undefined
}

/**
 * Quadro transparente (PNG 1×1): o Discord não tem "imagem à esquerda/direita", então a imagem vai numa
 * galeria de 2 colunas ao lado deste quadro vazio — ela ocupa a metade escolhida.
 */
const QUADRO_VAZIO: AnexoPainel = {
  nome: 'espaco.png', mime: 'image/png',
  // 1×1 cinza + alfa, pixel com alfa 0 (totalmente transparente)
  dados: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'),
}

/**
 * Imagens soltas → galeria (type 12) em cada posição + anexos dos uploads.
 * Uma imagem sozinha na posição: largura toda, ou metade à esquerda/direita (`lado`).
 * Várias na mesma posição ficam lado a lado (o lado não se aplica).
 */
export function galeriasDoPainel(imagens: ImagemPainel[] = []): { em: (posicao: string) => unknown[]; anexos: AnexoPainel[] } {
  const porPosicao = new Map<string, { url: string; lado?: ImagemPainel['lado'] }[]>()
  const anexos: AnexoPainel[] = []
  imagens.slice(0, MAX_IMAGENS_PAINEL).forEach((img, i) => {
    const r = imagemDoPainel(img.url, `imagem-${i + 1}`)
    if (!r) return
    if (r.anexo) anexos.push(r.anexo)
    porPosicao.set(img.posicao, [...(porPosicao.get(img.posicao) ?? []), { url: r.url, lado: img.lado }])
  })
  const vazio = { media: { url: `attachment://${QUADRO_VAZIO.nome}` }, description: ' ' }
  let usaVazio = false
  const galerias = new Map<string, unknown[]>()
  for (const [posicao, lista] of porPosicao) {
    const items = lista.map(x => ({ media: { url: x.url } }))
    const lado = lista.length === 1 ? lista[0].lado : undefined
    if (lado === 'esquerda' || lado === 'direita') usaVazio = true
    galerias.set(posicao, [{ type: 12, items: lado === 'esquerda' ? [items[0], vazio] : lado === 'direita' ? [vazio, items[0]] : items }])
  }
  return { anexos: usaVazio ? [...anexos, QUADRO_VAZIO] : anexos, em: posicao => galerias.get(posicao) ?? [] }
}

/** Escapa a formatação do Discord (negrito, itálico, etc.) em textos configurados. */
const escapar = (t: string) => t.replace(/([\\*_~`|>#-])/g, '\\$1')

/**
 * Monta o painel. Cada pessoa aparece UMA vez, no cargo mais alto (ordem da lista) que ela tem.
 * Menções <@id> mostram o nome atual do Discord (sem notificar: allowed_mentions vazio).
 */
export function montarPainel(h: Hierarquia, membros: Map<string, string[]>, info: Pick<InfoServidor, 'nome' | 'botAvatar'>): EmbedPainel {
  const usados = new Set<string>()
  const grupos = h.cargos.map((c: CargoHierarquia) => {
    const ids = [...membros].filter(([id, cargos]) => !usados.has(id) && cargos.includes(c.roleId)).map(([id]) => id).sort()
    ids.forEach(id => usados.add(id))
    return { titulo: `${c.emoji ? `${c.emoji} ` : ''}**${escapar(c.nome)}**`, nome: `${c.emoji ? `${c.emoji} ` : ''}${escapar(c.nome)}`, ids, roleId: c.roleId }
  })
  // Cabe no limite do Discord: se passar, corta os nomes do fim de cada cargo com "+N"
  let porGrupo = Math.max(...grupos.map(g => g.ids.length), 1)
  const montar = (max: number) => grupos.map(g => {
    const lista = g.ids.slice(0, max).map(id => `<@${id}>`)
    if (g.ids.length > max) lista.push(`+${g.ids.length - max}`)
    return `${g.titulo}\n${lista.length ? lista.join('\n') : '*Vago*'}`
  }).join('\n\n')
  let descricao = montar(porGrupo)
  while (descricao.length > MAX_DESCRICAO && porGrupo > 1) { porGrupo = Math.floor(porGrupo * 0.8); descricao = montar(porGrupo) }
  // Blocos do painel V2 (mesmo corte de nomes da descrição, para caber no limite do Discord)
  const blocos = grupos.map(g => ({
    titulo: g.nome,   // só o nome do cargo (sem contador ao lado)
    membros: [...g.ids.slice(0, porGrupo).map(id => `<@${id}>`), ...(g.ids.length > porGrupo ? [`+${g.ids.length - porGrupo}`] : [])],
    vago: g.ids.length === 0,
    roleId: g.roleId,
  }))
  const total = usados.size
  const resumo = `${total} ${total === 1 ? 'membro' : 'membros'} · ${h.cargos.length} ${h.cargos.length === 1 ? 'cargo' : 'cargos'}`
  const logo = imagemDoPainel(h.logo, 'logo')
  // Rodapé: texto e foto configuráveis; sem configurar = nome do servidor e foto do bot
  const iconeRodape = imagemDoPainel(h.rodapeIcone, 'rodape')?.url ?? info.botAvatar
  return {
    title: h.titulo.slice(0, 256),
    description: descricao.slice(0, MAX_DESCRICAO) || '*Nenhum cargo configurado.*',
    color: COR_SEM_LINHA,
    ...(logo ? { thumbnail: { url: logo.url } } : {}),
    footer: { text: (h.rodapeTexto || info.nome || 'Servidor').slice(0, 2048), ...(iconeRodape ? { icon_url: iconeRodape } : {}) },
    blocos, resumo,
  }
}

/** Sobe quando o visual do painel muda: força a mensagem do Discord a ser refeita uma vez. */
const FORMATO_PAINEL = 'v2-grande-imagens-1'
/** Barra lateral do painel (roxo do tema). */
const COR_PAINEL = 0x8b5cf6

/**
 * Linha invisível (caractere braille em branco, que o Discord não apaga) em letra pequena: estica o
 * painel até a largura máxima, para a logo do topo ficar encostada na direita.
 */
export const ESTICAR_LARGURA = `-# ${'⠀'.repeat(70)}`

/** Escapa a formatação do Discord num texto livre (nome do rodapé). */
const semMarkdown = (t: string) => t.replace(/\n/g, ' ').replace(/[*_~`|>\\]/g, m => `\\${m}`)

/**
 * REGRA do rodapé de todos os painéis (igual ao rodapé de um embed): fotinha pequena + nome do servidor,
 * em letra pequena, no canto de baixo à esquerda:  "-# <emoji> **Nome**".
 * A fotinha é um emoji do próprio bot (rodapeDiscord.ts). Nada de miniatura grande à direita.
 */
export function rodapeV2(nome: string, emoji = ''): unknown {
  return { type: 10, content: `-# ${emoji ? `${emoji} ` : ''}**${semMarkdown(nome)}**` }
}
/** Horário que o Discord mostra no fuso de cada pessoa. */
export const horaDiscord = (d: Date, estilo: 'f' | 'R' = 'f') => `<t:${Math.floor(d.getTime() / 1000)}:${estilo}>`

/**
 * Painel em Componentes V2: título (logo à direita) · linha · cargos · linha · rodapé (nome e imagem à direita).
 * As linhas ficam SÓ entre o título e o conteúdo e entre o conteúdo e o rodapé.
 */
export function componentesDoPainel(e: EmbedPainel, emojiRodape = '', imagens: ImagemPainel[] = []): unknown[] {
  const linha = () => ({ type: 14, divider: true, spacing: 2 })
  const g = galeriasDoPainel(imagens)
  // Topo: só o título grande (sem contador). Com logo, uma linha invisível estica o painel até a largura
  // máxima do Discord — senão o quadro fica do tamanho do texto e a logo encosta no título em vez de ir para a direita
  const topo = [{ type: 10, content: `# ${e.title}` }, ...(e.thumbnail ? [{ type: 10, content: ESTICAR_LARGURA }] : [])]
  // Um bloco por cargo, em letra GRANDE: "## emoji Cargo · N" e os membros um por linha com a barrinha de citação
  const blocos = (e.blocos ?? []).map(b => ({
    texto: `## ${b.titulo}\n${b.vago ? '-# Vago' : b.membros.map(m => `> ${m}`).join('\n')}`,
    depois: b.roleId ? g.em(`cargo:${b.roleId}`) : [],
  }))
  // Trechos entre imagens: a imagem fica exatamente depois do cargo escolhido
  const trechos: string[][] = [[]]
  const imagensDosTrechos: unknown[][] = []
  for (const b of blocos) {
    trechos[trechos.length - 1].push(b.texto)
    if (b.depois.length) { imagensDosTrechos.push(b.depois); trechos.push([]) }
  }
  // Limite do Discord (40 componentes): ~12 fixos + imagens; com muitos cargos, junta vários num texto só
  const galerias = imagensDosTrechos.length + ['topo', 'titulo', 'fim'].filter(p => g.em(p).length).length
  const limite = Math.max(28 - galerias, trechos.length)
  let porTexto = 1
  const contar = (n: number) => trechos.reduce((s, t) => s + Math.ceil(t.length / n), 0)
  while (contar(porTexto) > limite) porTexto++
  const meio: unknown[] = []
  trechos.forEach((t, k) => {
    for (let i = 0; i < t.length; i += porTexto) meio.push({ type: 10, content: t.slice(i, i + porTexto).join('\n\n') })
    meio.push(...(imagensDosTrechos[k] ?? []))
  })
  return [{
    type: 17,
    accent_color: COR_PAINEL,
    components: [
      ...g.em('topo'),
      e.thumbnail ? { type: 9, components: topo, accessory: { type: 11, media: { url: e.thumbnail.url }, description: e.title.slice(0, 100) } } : topo.length > 1 ? { type: 10, content: topo.map(t => t.content).join('\n') } : topo[0],
      ...g.em('titulo'),
      linha(),
      ...(blocos.length ? meio : [{ type: 10, content: e.description }]),
      ...g.em('fim'),
      linha(),
      rodapeV2(e.footer.text, emojiRodape),
    ],
  }]
}

export interface EstadoPainel {
  ultimaAtualizacao?: string
  erro?: 'sem_acesso' | 'discord' | 'nao_configurado'
  modo?: 'todos' | 'contas'          // todos = intent ligada; contas = só quem tem conta no site
  previa?: EmbedPainel
}
const estados = new Map<number, EstadoPainel>()
const estadoDe = (id: number): EstadoPainel => { let e = estados.get(id); if (!e) estados.set(id, e = {}); return e }
export const estadoPainel = (id = 0): EstadoPainel => ({ ...estados.get(id) })

const ultimoHash = new Map<number, string>()
/** Painel excluído: esquece o estado (o próximo com o mesmo id começa do zero). */
export function esquecerPainel(id: number): void { estados.delete(id); ultimoHash.delete(id) }

let rodando: Promise<void> | undefined
let deNovo = false

/** Atualiza o painel agora (uma execução por vez; pedidos durante a execução viram UMA nova rodada). */
export function atualizarPainel(forcar = false): Promise<void> {
  if (rodando) { deNovo = true; return rodando }
  rodando = executar(forcar).finally(() => {
    rodando = undefined
    if (deNovo) { deNovo = false; void atualizarPainel(true) }
  })
  return rodando
}

async function executar(forcar: boolean): Promise<void> {
  const cfg = discordConfig()
  const prontos = todosPaineis(readData()).filter(([id, h]) => {
    if (cfg && h.canalId && h.cargos.length) return true
    estadoDe(id).erro = cfg ? undefined : 'nao_configurado'
    return false
  })
  if (!cfg || !prontos.length) return

  const info = await infoServidor(cfg)
  const contas = readData().contas.filter(c => c.discordId && !c.exonerado).map(c => c.discordId!)
  // Validade menor que o intervalo da rotina (60 s): cada rodada lê o Discord de novo (uma vez para todos os painéis)
  const membros = await membrosComCargos(cfg, contas, forcar ? 0 : 50_000)
  if (!info || !membros) { prontos.forEach(([id]) => { estadoDe(id).erro = 'discord' }); return }   // falha do Discord: painéis ficam como estão
  const modo = listagemCompletaDisponivel() ? 'todos' : 'contas'
  // Um painel por vez (cada um é uma mensagem; só é editada quando muda, e 429 do Discord espera e tenta de novo)
  for (const [pid] of prontos) await publicarPainel(cfg, pid, membros, info, modo, forcar)
}

async function publicarPainel(cfg: DiscordConfig, pid: number, membros: Map<string, string[]>, info: InfoServidor, modo: EstadoPainel['modo'], forcar: boolean): Promise<void> {
  const estado = estadoDe(pid)
  estado.modo = modo
  // Relê: a configuração pode ter mudado durante as consultas (outra pessoa salvou ou excluiu)
  const atual = painelPorId(readData(), pid)
  if (!atual?.canalId || !atual.cargos.length) return
  const embed = montarPainel(atual, membros, info)
  estado.previa = embed
  // Hash inclui as imagens enviadas: trocar a foto (mesmo nome de anexo) também atualiza
  const hash = crypto.createHash('sha256').update(JSON.stringify([FORMATO_PAINEL, atual.canalId, embed, atual.logo ?? '', atual.rodapeIcone ?? '', atual.imagens ?? []])).digest('hex')
  if (!forcar && hash === ultimoHash.get(pid) && atual.mensagemId) return

  // V2: o painel antigo (embed) é trocado por um novo na primeira publicação (publicarV2 apaga o antigo)
  const emoji = await emojiDoRodape(cfg, atual.rodapeIcone || info.botAvatar)
  const id = await publicarV2(cfg, atual.canalId, atual.mensagemId, componentesDoPainel(embed, emoji, atual.imagens), anexosDoPainel(atual))

  if (id === 'sem_acesso') { estado.erro = 'sem_acesso'; return }
  if (!id) { estado.erro = 'discord'; return }
  ultimoHash.set(pid, hash)
  estado.erro = undefined
  estado.ultimaAtualizacao = new Date().toISOString()
  if (id !== atual.mensagemId) {
    const data = readData()
    const h2 = painelPorId(data, pid)
    // Excluído enquanto publicava: a mensagem recém-criada não fica órfã no canal
    if (!h2) { esquecerPainel(pid); await apagarMensagem(cfg, atual.canalId, id); return }
    if (h2.canalId === atual.canalId) { gravarPainel(data, pid, { ...h2, mensagemId: id }); writeData(data) }
  }
}

let timer: NodeJS.Timeout | undefined
/** Depois de salvar: atualiza em ~1 s (várias gravações seguidas viram uma só atualização). */
export function agendarAtualizacao(): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = undefined; void atualizarPainel(true) }, 1000)
  timer.unref()
}

/** Rotina: a cada 1 minuto. */
export function iniciarPainelHierarquia(): void {
  const rodar = () => { atualizarPainel().catch(() => console.error('[DU] atualização do painel de hierarquia falhou')) }
  setTimeout(rodar, 20_000).unref()
  setInterval(rodar, 60_000).unref()
}
