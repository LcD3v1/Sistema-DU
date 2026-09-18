import { Acao, Membro, FastData } from '../types'
import { readData, writeData, peekData } from '../data'

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
  // Com Discord vinculado: só a menção (o Discord já mostra o nome do servidor)
  return conta?.discordId ? `<@${conta.discordId}>` : nomeServidorOuPolicial(data, m)
}

function mencionarMembroQru(data: FastData, m: Membro): string {
  return [mencionarMembro(data, m), m.passaporte].filter(Boolean).join(' | ')
}

function mencionarConta(data: FastData, contaId: number | undefined, fallback: string): string {
  const conta = data.contas.find(c => c.id === contaId)
  const membro = conta?.membroId ? data.membros.find(m => m.id === conta.membroId) : undefined
  if (membro) return mencionarMembroQru(data, membro)
  if (conta?.discordId) return `<@${conta.discordId}>`
  return conta?.nomeServidor || conta?.discordUsername || conta?.username || fallback
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
 * O tópico salvo no membro ainda é válido? Só se existir e estiver no fórum de
 * registro configurado AGORA. Tópico de outro servidor/fórum (ex.: após trocar
 * de servidor) ou apagado → false. Falha temporária do Discord → lança (quem
 * chama não recria, para não duplicar tópico).
 */
async function topicoDeRegistroValido(data: FastData, threadId: string | undefined): Promise<boolean> {
  const forum = data.canais?.registro
  if (!threadId || !forum) return false
  const res = await discordFetch('GET', `/channels/${threadId}`)
  if (res.status === 403 || res.status === 404) return false
  if (!res.ok) throw new Error(`consultar tópico de registro: HTTP ${res.status}`)
  const canal = await res.json() as { parent_id?: string | null }
  return canal.parent_id === forum
}

/**
 * Grava onde o cadastro foi postado, sem sobrescrever gravações concorrentes.
 * Sem tópico (canal de texto sem permissão de criar tópico) guarda o canal,
 * para não repostar o cadastro a cada evento/reinício.
 */
function salvarTopico(membroId: number, threadId: string | undefined, canal: string): void {
  const fresco = readData()
  const alvo = fresco.membros.find(x => x.id === membroId)
  if (!alvo) return
  if (threadId) { alvo.discordThreadId = threadId; delete alvo.registroCanal }
  else { delete alvo.discordThreadId; alvo.registroCanal = canal }
  writeData(fresco)
}

// Uma verificação/criação por membro de cada vez → chamadas simultâneas (evento +
// reparo) esperam a mesma promessa em vez de criar dois tópicos.
const garantindo = new Map<number, Promise<string | undefined>>()

/** Garante o tópico de registro do membro no fórum atual; cria com o cadastro se faltar. */
function garantirTopicoRegistro(membroId: number): Promise<string | undefined> {
  const emAndamento = garantindo.get(membroId)
  if (emAndamento) return emAndamento
  const p = (async () => {
    // Lê de novo: outra chamada pode ter acabado de gravar o tópico
    const data = readData()
    const atual = data.membros.find(x => x.id === membroId)
    if (!atual) return undefined
    const canal = data.canais?.registro
    if (!canal) return undefined
    if (await topicoDeRegistroValido(data, atual.discordThreadId)) return atual.discordThreadId
    // Já postado direto neste canal (sem tópico) → não reposta
    if (!atual.discordThreadId && atual.registroCanal === canal) return undefined
    const conta = contaDoMembro(data, atual.id)
    const threadId = await postarRegistro(data, atual, conta?.discordId)
    salvarTopico(atual.id, threadId, canal)
    return threadId
  })().finally(() => garantindo.delete(membroId))
  garantindo.set(membroId, p)
  return p
}

/**
 * Posta um embed no tópico (canal) PESSOAL do membro no fórum de Registro.
 * Se o membro ainda não tem tópico, cria um e grava o ID no membro.
 * `ativo` define o ✅/❌ do título. O tópico nunca é apagado.
 */
async function postarNoTopico(data: FastData, m: Membro, embed: Embed, ativo: boolean): Promise<void> {
  if (!botConfigurado()) return
  const mentionIds = idsMencionaveis(data, m)
  const message = { content: `👤 ${mencionarMembro(data, m)}`, allowed_mentions: allowedMentions(mentionIds), embeds: [embed] }
  if (!data.canais?.registro) return
  // Tópico inválido (outro servidor/fórum ou apagado) → recria com o cadastro antes do evento
  const threadId = await garantirTopicoRegistro(m.id)
  if (!threadId) return
  // Mensagem e renomeação são independentes → em paralelo
  const [msg, titulo] = await Promise.allSettled([
    discord('POST', `/channels/${threadId}/messages`, message),
    discord('PATCH', `/channels/${threadId}`, { name: tituloRegistro(m, ativo) }),
  ])
  if (msg.status === 'rejected') throw msg.reason
  if (titulo.status === 'rejected') throw titulo.reason
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

export type AcaoAdvertencia = { tipo: 'aplicada' | 'retirada'; nivel: number } | { tipo: 'todas' }

/** Quadradinhos marcados agora, ex.: "ADV 1 · ADV 3" (ou "Nenhuma"). */
function advertenciasAtuais(m: Membro): string {
  const ativas = ([1, 2, 3] as const).filter(n => m[`adv${n}`]).map(n => `ADV ${n}`)
  return ativas.length ? ativas.join(' · ') : 'Nenhuma'
}

export async function postarAdvertencia(data: FastData, m: Membro, acao: AcaoAdvertencia, por: string, motivo?: string): Promise<void> {
  const atual = campo('Advertências atuais', advertenciasAtuais(m), false)
  await postarNoTopico(data, m, acao.tipo === 'aplicada' ? {
    title: `⚠️ ADVERTÊNCIA · ADV ${acao.nivel}`,
    description: `O membro está com **ADV ${acao.nivel}**.`,
    color: COR_ADVERTENCIA,
    fields: [
      campo('Membro', mencionarMembro(data, m), false),
      campo('Advertência', `ADV ${acao.nivel}`),
      campo('Aplicada por', por),
      campo('Motivo', motivo, false),
      atual,
    ],
    footer: rodape(),
    timestamp: agora(),
  } : acao.tipo === 'retirada' ? {
    title: `✅ ADV ${acao.nivel} RETIRADA`,
    description: `A advertência **ADV ${acao.nivel}** foi retirada do membro.`,
    color: COR_PROMOCAO,
    fields: [campo('Membro', mencionarMembro(data, m), false), campo('Retirada por', por), atual],
    footer: rodape(),
    timestamp: agora(),
  } : {
    title: '✅ ADVERTÊNCIAS REMOVIDAS',
    description: 'Todas as advertências do membro foram retiradas.',
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
      ...(acao.comandante ? [campo('Responsável', acao.comandante, false)] : []),
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
 * Idempotente: não posta de novo se o membro já tiver tópico VÁLIDO no fórum atual.
 */
export function tentarPostarRegistro(contaId: number): void {
  emSegundoPlano('postagem de registro', async () => {
    const data = readData()
    const conta = data.contas.find(c => c.id === contaId)
    if (!botConfigurado() || !data.canais?.registro) return
    if (!conta?.membroId || conta.onboarded === false || conta.exonerado) return
    if (conta.id !== 1 && !conta.cargoPermId) return   // só depois de aprovado
    const m = data.membros.find(x => x.id === conta.membroId)
    if (!m) return
    await garantirTopicoRegistro(m.id)
  })
}

/**
 * Aprovação (set liberado): posta NA HORA no canal de registro — cria o
 * cadastro se faltar e registra a aprovação no tópico do membro. Quem chama
 * aguarda (sem segundo plano), para o post sair junto com a aprovação.
 * Devolve true se postou.
 */
export async function postarAprovacao(contaId: number, cargo: string, por: string): Promise<boolean> {
  const data = readData()
  const conta = data.contas.find(c => c.id === contaId)
  if (!botConfigurado() || !data.canais?.registro) return false
  if (!conta?.membroId || conta.onboarded === false || conta.exonerado) return false
  const m = data.membros.find(x => x.id === conta.membroId)
  if (!m) return false
  await postarNoTopico(data, m, {
    title: '✅ APROVADO · Set liberado',
    description: 'Cadastro aprovado pelo comando da Unidade FAST.',
    color: COR_PROMOCAO,
    fields: [
      campo('Membro', mencionarMembro(data, m), false),
      campo('Cargo', cargo),
      campo('Aprovado por', por),
    ],
    footer: rodape(),
    timestamp: agora(),
  }, true)
  return true
}

/**
 * Recria o registro de todo membro APROVADO sem tópico válido no fórum atual
 * (ex.: depois de trocar de servidor ou de fórum). Chamado ao iniciar e ao
 * trocar o canal de registro. Um de cada vez, para respeitar o rate limit.
 */
let reparando: Promise<void> | null = null
let repararDeNovo = false

export function repararRegistros(): Promise<void> {
  // Já rodando → marca para repetir no fim (o fórum pode ter mudado no meio)
  if (reparando) { repararDeNovo = true; return reparando }
  reparando = (async () => {
    do {
      repararDeNovo = false
      await repararUmaVez()
    } while (repararDeNovo)
  })().finally(() => { reparando = null })
  return reparando
}

async function repararUmaVez(): Promise<void> {
  if (!botConfigurado() || !peekData().canais?.registro) return
  const alvos = peekData().contas
    .filter(c => c.membroId && c.onboarded !== false && !c.exonerado && (c.id === 1 || c.cargoPermId))
    .map(c => c.membroId as number)
  for (const membroId of alvos) {
    try { await garantirTopicoRegistro(membroId) } catch (err) {
      console.error('[FAST][DISCORD] reparar registro:', err instanceof Error ? err.message : err)
    }
  }
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
  mencionarId?: string,
): Promise<void> {
  // `allowed_mentions` com parse: [] é a trava: só o usuário escolhido é notificado.
  // Um @everyone/@here digitado na mensagem vira texto puro e não marca ninguém.
  const texto = [mencionarId ? `<@${mencionarId}>` : '', conteudo ?? ''].filter(Boolean).join(' ').trim()
  const form = new FormData()
  form.append('payload_json', JSON.stringify({
    ...(texto ? { content: cut(texto, 1900) } : {}),
    attachments: [{ id: 0, filename: arquivo }],
    allowed_mentions: allowedMentions(mencionarId ? [mencionarId] : []),
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
