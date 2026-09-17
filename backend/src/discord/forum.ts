import { Acao, Membro, FastData } from '../types'
import { readData, writeData } from '../data'

/**
 * Integração com fóruns do Discord via bot (API REST v10).
 *
 * - Registro:   cada cadastro concluído vira uma postagem no fórum configurado.
 * - Apreensões: cada ação aprovada vira uma postagem no fórum configurado.
 *
 * Tudo aqui é "best effort": falhas no Discord são logadas e NUNCA quebram a
 * requisição do painel. Aceita canais de texto/anúncio e canais com tópicos
 * (Fórum/Mídia).
 */

const API = 'https://discord.com/api/v10'
export const GUILD_TEXT = 0
export const GUILD_ANNOUNCEMENT = 5
export const GUILD_FORUM = 15
export const GUILD_MEDIA = 16
const GUILD_NEWS_THREAD = 10
const GUILD_PUBLIC_THREAD = 11
const POSTABLE_CHANNEL_TYPES = new Set([GUILD_TEXT, GUILD_ANNOUNCEMENT, GUILD_FORUM, GUILD_MEDIA])

const COR_REGISTRO = 0xf5b301
const COR_EXONERACAO = 0xed4245
const COR_APREENSAO = 0x5865f2
const COR_PROMOCAO = 0x2ecc71
const COR_REBAIXAMENTO = 0xe67e22
const COR_ADVERTENCIA = 0xf1c40f
const COR_AUSENCIA = 0x3498db

export interface ForumChannel { id: string; name: string; type: number; parentId?: string | null }

export function botConfigurado(): boolean {
  return Boolean(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_GUILD_ID)
}

const TIMEOUT_MS = 10_000
const MAX_TENTATIVAS_429 = 3
const esperar = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * fetch na API do Discord com timeout e respeito ao rate limit (429 → aguarda
 * retry_after e tenta de novo). 429 não processa a requisição, então repetir é seguro.
 */
export async function discordFetch(method: string, route: string, body?: unknown): Promise<Response> {
  for (let tentativa = 1; ; tentativa++) {
    const res = await fetch(API + route, {
      method,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (res.status !== 429 || tentativa >= MAX_TENTATIVAS_429) return res
    const info = await res.json().catch(() => ({})) as { retry_after?: number }
    const segundos = Number(info.retry_after ?? res.headers.get('retry-after') ?? 1)
    await esperar(Math.min(Math.max(Number.isFinite(segundos) ? segundos : 1, 0.05), 10) * 1000)
  }
}

async function discord<T>(method: string, route: string, body?: unknown): Promise<T> {
  const res = await discordFetch(method, route, body)
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Discord ${method} ${route} → ${res.status} ${txt.slice(0, 300)}`)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

/** Lista os canais do servidor onde o bot pode postar. Mantém o nome legado da função/API. */
type CanalGuild = { id: string; name: string; type: number; position: number; parent_id?: string | null }
const CANAIS_TTL_MS = 15_000
let canaisCache: { em: number; lista: Promise<CanalGuild[]> } | undefined

export async function listarForuns(): Promise<ForumChannel[]> {
  // Cache curto + chamadas simultâneas compartilham a mesma requisição
  if (!canaisCache || Date.now() - canaisCache.em > CANAIS_TTL_MS) {
    const lista = discord<CanalGuild[]>('GET', `/guilds/${process.env.DISCORD_GUILD_ID}/channels`)
    canaisCache = { em: Date.now(), lista }
    lista.catch(() => { if (canaisCache?.lista === lista) canaisCache = undefined })
  }
  const canais = await canaisCache.lista
  return canais
    .filter(c => POSTABLE_CHANNEL_TYPES.has(c.type))
    .sort((a, b) => a.position - b.position)
    .map(c => ({ id: c.id, name: c.name, type: c.type, parentId: c.parent_id ?? null }))
}

const rodape = () => ({ text: 'FAST · North Police Department' })
const agora = () => new Date().toISOString()
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const campo = (name: string, value: string | undefined, inline = true) =>
  ({ name, value: cut(value?.trim() || '—', 1024), inline })

function contaDoMembro(data: FastData, membroId: number) {
  return data.contas.find(c => c.membroId === membroId)
}

function nomeServidorOuPolicial(data: FastData, m: Membro): string {
  const conta = contaDoMembro(data, m.id)
  return conta?.nomeServidor || conta?.discordUsername || m.policial
}

function mencionarMembro(data: FastData, m: Membro): string {
  const conta = contaDoMembro(data, m.id)
  const nome = nomeServidorOuPolicial(data, m)
  return conta?.discordId ? `<@${conta.discordId}> ${nome}` : nome
}

function mencionarMembroQru(data: FastData, m: Membro): string {
  return [mencionarMembro(data, m), m.passaporte].filter(Boolean).join(' | ')
}

function mencionarConta(data: FastData, contaId: number | undefined, fallback: string): string {
  const conta = data.contas.find(c => c.id === contaId)
  const membro = conta?.membroId ? data.membros.find(m => m.id === conta.membroId) : undefined
  if (membro) return mencionarMembroQru(data, membro)
  const nome = conta?.nomeServidor || conta?.discordUsername || conta?.username || fallback
  return conta?.discordId ? `<@${conta.discordId}> ${nome}` : nome
}

function idsMencionaveis(data: FastData, ...membros: (Membro | undefined)[]): string[] {
  return [...new Set(membros
    .map(m => (m ? contaDoMembro(data, m.id)?.discordId : undefined))
    .filter((id): id is string => Boolean(id)))]
}

function allowedMentions(users: string[] = []) {
  return users.length > 0 ? { parse: [], users } : { parse: [] }
}

function tituloRegistro(m: Membro, ok: boolean): string {
  return cut(`${ok ? '✅' : '❌'} - ${m.policial}${m.passaporte ? ` | ${m.passaporte}` : ''}`, 100)
}

type CanalInfo = { id: string; name?: string; type: number }
// O tipo de um canal não muda: cache de 5 min economiza 1 chamada REST por postagem.
const CANAL_TTL_MS = 5 * 60_000
const canaisInfo = new Map<string, { em: number; canal: Promise<CanalInfo> }>()

async function obterCanal(channelId: string): Promise<CanalInfo> {
  const hit = canaisInfo.get(channelId)
  if (hit && Date.now() - hit.em < CANAL_TTL_MS) return hit.canal
  const canal = discord<CanalInfo>('GET', `/channels/${channelId}`)
  canaisInfo.set(channelId, { em: Date.now(), canal })
  canal.catch(() => { if (canaisInfo.get(channelId)?.canal === canal) canaisInfo.delete(channelId) })
  return canal
}

async function criarTopicoOuPostar(
  channelId: string,
  name: string,
  message: Record<string, unknown>,
): Promise<string | undefined> {
  const canal = await obterCanal(channelId)

  if (canal.type === GUILD_FORUM || canal.type === GUILD_MEDIA) {
    const thread = await discord<{ id: string }>('POST', `/channels/${channelId}/threads`, { name, message })
    return thread.id
  }

  if (canal.type === GUILD_TEXT || canal.type === GUILD_ANNOUNCEMENT) {
    try {
      const thread = await discord<{ id: string }>('POST', `/channels/${channelId}/threads`, {
        name,
        type: canal.type === GUILD_ANNOUNCEMENT ? GUILD_NEWS_THREAD : GUILD_PUBLIC_THREAD,
        auto_archive_duration: 1440,
      })
      await discord('POST', `/channels/${thread.id}/messages`, message)
      return thread.id
    } catch {
      await discord('POST', `/channels/${channelId}/messages`, message)
      return undefined
    }
  }

  throw new Error(`Canal ${channelId} não aceita postagem de texto.`)
}

async function postarMensagemNoCanal(
  channelId: string,
  threadName: string,
  message: Record<string, unknown>,
): Promise<string | undefined> {
  const canal = await obterCanal(channelId)

  if (canal.type === GUILD_TEXT || canal.type === GUILD_ANNOUNCEMENT) {
    const msg = await discord<{ id: string }>('POST', `/channels/${channelId}/messages`, message)
    return msg.id
  }

  if (canal.type === GUILD_FORUM || canal.type === GUILD_MEDIA) {
    const thread = await discord<{ id: string }>('POST', `/channels/${channelId}/threads`, { name: threadName, message })
    return thread.id
  }

  throw new Error(`Canal ${channelId} não aceita postagem de texto.`)
}

/** Cria a postagem de registro e devolve o ID do tópico (thread). */
export async function postarRegistro(data: FastData, m: Membro, discordId?: string): Promise<string | undefined> {
  const channelId = data.canais?.registro
  if (!botConfigurado() || !channelId) return undefined
  const mentionIds = idsMencionaveis(data, m)
  if (discordId && !mentionIds.includes(discordId)) mentionIds.push(discordId)
  return criarTopicoOuPostar(channelId, tituloRegistro(m, true), {
    content: `👤 ${mencionarMembro(data, m)}`,
    allowed_mentions: allowedMentions(mentionIds),
    embeds: [{
      title: '📝 CADASTRO · Novo membro',
      description: 'Cadastro inicial confirmado no site.',
      color: COR_REGISTRO,
      fields: [
        campo('Nome', mencionarMembro(data, m)),
        campo('ID do jogador', m.passaporte),
        campo('Distintivo', m.badge),
        campo('Patente NPD', m.patenteNPD),
        campo('Patente interna', m.patenteInterna),
      ],
      footer: rodape(),
      timestamp: agora(),
    }],
  })
}

type Embed = Record<string, unknown>

/**
 * Posta um embed no tópico (canal) PESSOAL do membro no fórum de Registro.
 * Se o membro ainda não tem tópico, cria um e grava o ID no membro.
 * `ativo` define o ✅/❌ do título. O tópico nunca é apagado.
 */
async function postarNoTopico(data: FastData, m: Membro, embed: Embed, ativo: boolean): Promise<void> {
  if (!botConfigurado()) return
  const mentionIds = idsMencionaveis(data, m)
  const message = { content: `👤 ${mencionarMembro(data, m)}`, allowed_mentions: allowedMentions(mentionIds), embeds: [embed] }
  if (m.discordThreadId) {
    // Mensagem e renomeação são independentes → em paralelo
    const [msg, titulo] = await Promise.allSettled([
      discord('POST', `/channels/${m.discordThreadId}/messages`, message),
      discord('PATCH', `/channels/${m.discordThreadId}`, { name: tituloRegistro(m, ativo) }),
    ])
    if (msg.status === 'rejected') throw msg.reason
    if (titulo.status === 'rejected') throw titulo.reason
    return
  }
  const channelId = data.canais?.registro
  if (!channelId) return
  const threadId = await criarTopicoOuPostar(channelId, tituloRegistro(m, ativo), message)
  if (!threadId) return
  const fresco = readData()
  const alvo = fresco.membros.find(x => x.id === m.id)
  if (alvo) { alvo.discordThreadId = threadId; writeData(fresco) }
}

const fmtData = (iso: string) => { const [a, mes, d] = iso.slice(0, 10).split('-'); return `${d}/${mes}/${a}` }
const fmtDataHoraIntl = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
})
const fmtDataHora = (date = new Date()) => fmtDataHoraIntl.format(date)

/**
 * Registra a exoneração no tópico do membro e troca o título para ❌.
 * O tópico NÃO é apagado — o histórico fica no Discord.
 */
export async function postarExoneracao(data: FastData, m: Membro, registradoPor: string, motivo?: string): Promise<void> {
  await postarNoTopico(data, m, {
    title: '⛔ EXONERAÇÃO · Desligamento registrado',
    description: 'Membro exonerado da Unidade FAST.',
    color: COR_EXONERACAO,
    fields: [
      campo('Membro', mencionarMembro(data, m), false),
      campo('Último cargo', m.patenteInterna || m.patenteNPD),
      campo('Registrado por', registradoPor),
      ...(motivo ? [campo('Motivo', motivo, false)] : []),
    ],
    footer: rodape(),
    timestamp: agora(),
  }, false)
}

export async function postarMudancaCargo(
  data: FastData, m: Membro, tipo: 'promocao' | 'rebaixamento', de: string, para: string, por: string, motivo?: string,
): Promise<void> {
  const promo = tipo === 'promocao'
  await postarNoTopico(data, m, {
    title: promo ? '⬆️ PROMOÇÃO · Novo cargo' : '⬇️ REBAIXAMENTO · Novo cargo',
    description: promo ? 'Membro promovido na Unidade FAST.' : 'Membro rebaixado na Unidade FAST.',
    color: promo ? COR_PROMOCAO : COR_REBAIXAMENTO,
    fields: [
      campo('Membro', mencionarMembro(data, m), false),
      campo('Cargo anterior', de),
      campo('Novo cargo', para),
      campo('Registrado por', por),
      ...(motivo ? [campo('Motivo', motivo, false)] : []),
    ],
    footer: rodape(),
    timestamp: agora(),
  }, true)
}

export async function postarAdvertencia(data: FastData, m: Membro, nivel: number | null, por: string, motivo?: string): Promise<void> {
  await postarNoTopico(data, m, nivel ? {
    title: `⚠️ ADVERTÊNCIA · Nível ${nivel}`,
    description: 'Advertência aplicada ao membro.',
    color: COR_ADVERTENCIA,
    fields: [
      campo('Membro', mencionarMembro(data, m), false),
      campo('Nível', `Advertência ${nivel}`),
      campo('Aplicada por', por),
      campo('Motivo', motivo, false),
    ],
    footer: rodape(),
    timestamp: agora(),
  } : {
    title: '✅ ADVERTÊNCIAS REMOVIDAS',
    description: 'As advertências do membro foram retiradas.',
    color: COR_PROMOCAO,
    fields: [campo('Membro', mencionarMembro(data, m), false), campo('Removidas por', por)],
    footer: rodape(),
    timestamp: agora(),
  }, true)
}

const ROTULO_CAMPO: Record<string, string> = {
  nivel: 'Nível', policial: 'Nome', badge: 'Distintivo', passaporte: 'ID do jogador', patenteNPD: 'Patente NPD', patenteInterna: 'Patente interna',
}

export async function postarPerfilAtualizado(
  data: FastData, m: Membro, alteracoes: { campo: string; de: string; para: string }[], solicitante: string, aprovadoPor: string,
): Promise<void> {
  await postarNoTopico(data, m, {
    title: '📝 PERFIL ATUALIZADO · Alteração aprovada',
    description: 'Dados do membro alterados após aprovação.',
    color: COR_REGISTRO,
    fields: [
      ...alteracoes.map(a => campo(ROTULO_CAMPO[a.campo] ?? a.campo, `${a.de || '—'} → **${a.para || '—'}**`, false)),
      campo('Solicitado por', solicitante),
      campo('Aprovado por', aprovadoPor),
    ],
    footer: rodape(),
    timestamp: agora(),
  }, true)
}

export async function postarAusencia(
  data: FastData, m: Membro, evento: 'aprovada' | 'retorno' | 'encerrada', dataInicio: string, dataFim: string, por: string, motivo?: string,
): Promise<void> {
  const meta = {
    aprovada:  { title: '🌙 AUSÊNCIA · Afastamento aprovado', description: 'O membro fica sem acesso ao painel durante o período.', color: COR_AUSENCIA },
    retorno:   { title: '🔙 RETORNO · Fim da ausência', description: 'Período encerrado — acesso ao painel restabelecido.', color: COR_PROMOCAO },
    encerrada: { title: '🔙 AUSÊNCIA ENCERRADA · Retorno antecipado', description: 'Ausência retirada — acesso ao painel restabelecido.', color: COR_PROMOCAO },
  }[evento]
  await postarNoTopico(data, m, {
    ...meta,
    fields: [
      campo('Membro', mencionarMembro(data, m), false),
      campo('Período', `${fmtData(dataInicio)} → ${fmtData(dataFim)}`),
      campo(evento === 'aprovada' ? 'Aprovada por' : 'Registrado por', por),
      ...(motivo ? [campo('Motivo', motivo, false)] : []),
    ],
    footer: rodape(),
    timestamp: agora(),
  }, true)
}

/** Cria a postagem de uma apreensão (ação aprovada). */
export async function postarApreensao(data: FastData, acao: Acao, aprovadoPor: string): Promise<string | undefined> {
  const channelId = data.canais?.apreensoes
  if (!botConfigurado() || !channelId) return undefined
  const membros = new Map(data.membros.map(m => [m.id, m]))
  const membrosAcao = acao.participants.map(p => membros.get(p.memberId)).filter((m): m is Membro => Boolean(m))
  const mentionIds = idsMencionaveis(data, ...membrosAcao)
  const responsavel = mencionarConta(data, acao.criadoPorContaId, '—')
  const aprovador = data.contas.find(c => c.username === aprovadoPor || c.discordUsername === aprovadoPor)
  if (aprovador?.discordId && !mentionIds.includes(aprovador.discordId)) mentionIds.push(aprovador.discordId)
  const participantes = [
    ...acao.participants.map(p => {
      const m = membros.get(p.memberId)
      return m ? mencionarMembroQru(data, m) : `ID ${p.memberId}`
    }),
    ...(acao.participantesExtras ?? []).map(e => `${[e.patente, e.nome].filter(Boolean).join(' ')} (externo)`),
  ].join('\n')
  const [a, mes, d] = acao.data.split('-')
  const dataQru = d && mes && a ? `${d}/${mes}/${a}` : fmtData(acao.data)

  const embed: Record<string, unknown> = {
    title: `🚓 APREENSÃO · ${acao.qru}`,
    description: `Apreensão aprovada e registrada no painel.\nRegistrado em **${fmtDataHora()}**.`,
    color: COR_PROMOCAO,
    fields: [
      campo('QRU', acao.qru),
      campo('Tipo', 'QRU convencional'),
      campo('Responsável pelo registro', responsavel),
      campo('Aprovado por', mencionarConta(data, aprovador?.id, aprovadoPor), false),
      campo('Participantes', participantes, false),
      campo('Data da QRU', dataQru),
      campo('Resultado', acao.resultado),
      ...(acao.local ? [campo('Local', acao.local, false)] : []),
      ...(acao.comandante ? [campo('Comandante', acao.comandante, false)] : []),
    ],
    footer: { text: `FAST - North Police Department · ${fmtDataHora()}` },
    timestamp: agora(),
  }
  if (acao.imagem && /^https?:\/\//.test(acao.imagem)) embed.image = { url: acao.imagem }

  return postarMensagemNoCanal(channelId, cut(`APREENSÃO · ${acao.qru} · #${acao.id}`, 100), {
    allowed_mentions: allowedMentions(mentionIds),
    embeds: [embed],
  })
}

/** Executa uma chamada ao Discord sem bloquear/derrubar a requisição. */
export function emSegundoPlano(rotulo: string, fn: () => Promise<void>): void {
  fn().catch(err => console.error(`[FAST][DISCORD] ${rotulo}:`, err instanceof Error ? err.message : err))
}

/**
 * Posta o registro da conta quando ela está APROVADA (tem cargo, ou é a dona)
 * e já concluiu o cadastro. Chamado ao concluir o cadastro e ao aprovar.
 * Idempotente: não posta de novo se o membro já tiver tópico.
 */
export function tentarPostarRegistro(contaId: number): void {
  emSegundoPlano('postagem de registro', async () => {
    const data = readData()
    const conta = data.contas.find(c => c.id === contaId)
    if (!conta?.membroId || conta.onboarded === false) return
    if (conta.id !== 1 && !conta.cargoPermId) return
    const m = data.membros.find(x => x.id === conta.membroId)
    if (!m || m.discordThreadId) return
    const threadId = await postarRegistro(data, m, conta.discordId)
    if (!threadId) return
    const fresco = readData()
    const alvo = fresco.membros.find(x => x.id === m.id)
    if (alvo) { alvo.discordThreadId = threadId; writeData(fresco) }
  })
}

// ── Carteirinhas ───────────────────────────────────────────────────────────────
// O fórum fica salvo em `data.canais.carteira`; dentro dele o usuário escolhe,
// a cada postagem, em qual tópico (post do fórum) a carteira vai.

export interface TopicoForum { id: string; name: string; arquivado: boolean }

type ThreadApi = { id: string; name: string; parent_id?: string | null; thread_metadata?: { archived?: boolean } }

/**
 * Tópicos de um fórum: os ativos (do servidor, filtrados pelo pai) e os
 * arquivados públicos. Ordena os ativos primeiro e remove repetidos.
 */
export async function listarTopicosForum(forumId: string): Promise<TopicoForum[]> {
  const ativos = await discord<{ threads: ThreadApi[] }>(
    'GET', `/guilds/${process.env.DISCORD_GUILD_ID}/threads/active`).catch(() => ({ threads: [] as ThreadApi[] }))
  const arquivados = await discord<{ threads: ThreadApi[] }>(
    'GET', `/channels/${forumId}/threads/archived/public?limit=50`).catch(() => ({ threads: [] as ThreadApi[] }))

  const out = new Map<string, TopicoForum>()
  for (const t of ativos.threads ?? []) {
    if (t.parent_id === forumId) out.set(t.id, { id: t.id, name: t.name, arquivado: false })
  }
  for (const t of arquivados.threads ?? []) {
    if (!out.has(t.id)) out.set(t.id, { id: t.id, name: t.name, arquivado: true })
  }
  return [...out.values()].sort((a, b) => Number(a.arquivado) - Number(b.arquivado) || a.name.localeCompare(b.name))
}

/** O tópico existe e pertence mesmo ao fórum informado? Evita postar em canal arbitrário. */
export async function topicoPertenceAoForum(topicoId: string, forumId: string): Promise<boolean> {
  try {
    const t = await discord<ThreadApi>('GET', `/channels/${topicoId}`)
    return t.parent_id === forumId
  } catch { return false }
}

/** Envia um PNG como anexo para um tópico. Lança em caso de falha (o chamador trata). */
export async function postarImagemNoTopico(
  topicoId: string,
  arquivo: string,
  png: Buffer,
  conteudo?: string,
): Promise<void> {
  const form = new FormData()
  form.append('payload_json', JSON.stringify({
    ...(conteudo ? { content: cut(conteudo, 1900) } : {}),
    attachments: [{ id: 0, filename: arquivo }],
    allowed_mentions: allowedMentions(),
  }))
  form.append('files[0]', new Blob([new Uint8Array(png)], { type: 'image/png' }), arquivo)

  const res = await fetch(`${API}/channels/${topicoId}/messages`, {
    method: 'POST',
    signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
    body: form,
  })
  if (!res.ok) throw new Error(`Discord POST carteira → ${res.status}`)
}
