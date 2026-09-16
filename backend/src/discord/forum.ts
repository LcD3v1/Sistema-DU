import { Acao, Membro, FastData } from '../types'
import { readData, writeData } from '../data'

/**
 * Integração com fóruns do Discord via bot (API REST v10).
 *
 * - Registro:   cada cadastro concluído vira uma postagem no fórum configurado.
 * - Apreensões: cada ação aprovada vira uma postagem no fórum configurado.
 *
 * Tudo aqui é "best effort": falhas no Discord são logadas e NUNCA quebram a
 * requisição do painel. Os canais só aceitam o tipo Fórum (GUILD_FORUM = 15).
 */

const API = 'https://discord.com/api/v10'
export const GUILD_FORUM = 15

const COR_REGISTRO = 0xf5b301
const COR_EXONERACAO = 0xed4245
const COR_APREENSAO = 0x5865f2
const COR_PROMOCAO = 0x2ecc71
const COR_REBAIXAMENTO = 0xe67e22
const COR_ADVERTENCIA = 0xf1c40f
const COR_AUSENCIA = 0x3498db

export interface ForumChannel { id: string; name: string }

export function botConfigurado(): boolean {
  return Boolean(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_GUILD_ID)
}

async function discord<T>(method: string, route: string, body?: unknown): Promise<T> {
  const res = await fetch(API + route, {
    method,
    headers: {
      Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Discord ${method} ${route} → ${res.status} ${txt.slice(0, 300)}`)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

/** Lista apenas os canais do tipo Fórum do servidor configurado. */
export async function listarForuns(): Promise<ForumChannel[]> {
  const canais = await discord<{ id: string; name: string; type: number; position: number }[]>(
    'GET', `/guilds/${process.env.DISCORD_GUILD_ID}/channels`,
  )
  return canais
    .filter(c => c.type === GUILD_FORUM)
    .sort((a, b) => a.position - b.position)
    .map(c => ({ id: c.id, name: c.name }))
}

const rodape = () => ({ text: 'FAST · North Police Department' })
const agora = () => new Date().toISOString()
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const campo = (name: string, value: string | undefined, inline = true) =>
  ({ name, value: cut(value?.trim() || '—', 1024), inline })

function tituloRegistro(m: Membro, ok: boolean): string {
  return cut(`${ok ? '✅' : '❌'} - ${m.policial}${m.passaporte ? ` | ${m.passaporte}` : ''}`, 100)
}

/** Cria a postagem de registro e devolve o ID do tópico (thread). */
export async function postarRegistro(data: FastData, m: Membro, discordId?: string): Promise<string | undefined> {
  const forumId = data.canais?.registro
  if (!botConfigurado() || !forumId) return undefined
  const thread = await discord<{ id: string }>('POST', `/channels/${forumId}/threads`, {
    name: tituloRegistro(m, true),
    message: {
      allowed_mentions: { parse: [] },
      embeds: [{
        title: '📝 CADASTRO · Novo membro',
        description: 'Cadastro inicial confirmado no site.',
        color: COR_REGISTRO,
        fields: [
          campo('Nome', discordId ? `<@${discordId}>` : m.policial),
          campo('ID do jogador', m.passaporte),
          campo('Distintivo', m.badge),
          campo('Patente NPD', m.patenteNPD),
          campo('Patente interna', m.patenteInterna),
        ],
        footer: rodape(),
        timestamp: agora(),
      }],
    },
  })
  return thread.id
}

type Embed = Record<string, unknown>

/**
 * Posta um embed no tópico (canal) PESSOAL do membro no fórum de Registro.
 * Se o membro ainda não tem tópico, cria um e grava o ID no membro.
 * `ativo` define o ✅/❌ do título. O tópico nunca é apagado.
 */
async function postarNoTopico(data: FastData, m: Membro, embed: Embed, ativo: boolean): Promise<void> {
  if (!botConfigurado()) return
  if (m.discordThreadId) {
    await discord('POST', `/channels/${m.discordThreadId}/messages`, { allowed_mentions: { parse: [] }, embeds: [embed] })
    await discord('PATCH', `/channels/${m.discordThreadId}`, { name: tituloRegistro(m, ativo) })
    return
  }
  const forumId = data.canais?.registro
  if (!forumId) return
  const thread = await discord<{ id: string }>('POST', `/channels/${forumId}/threads`, {
    name: tituloRegistro(m, ativo),
    message: { allowed_mentions: { parse: [] }, embeds: [embed] },
  })
  const fresco = readData()
  const alvo = fresco.membros.find(x => x.id === m.id)
  if (alvo) { alvo.discordThreadId = thread.id; writeData(fresco) }
}

const fmtData = (iso: string) => { const [a, mes, d] = iso.slice(0, 10).split('-'); return `${d}/${mes}/${a}` }

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
      campo('Membro', m.policial, false),
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
      campo('Membro', m.policial, false),
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
      campo('Membro', m.policial, false),
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
    fields: [campo('Membro', m.policial, false), campo('Removidas por', por)],
    footer: rodape(),
    timestamp: agora(),
  }, true)
}

const ROTULO_CAMPO: Record<string, string> = {
  policial: 'Nome', badge: 'Distintivo', passaporte: 'ID do jogador', patenteNPD: 'Patente NPD', patenteInterna: 'Patente interna',
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
      campo('Membro', m.policial, false),
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
  const forumId = data.canais?.apreensoes
  if (!botConfigurado() || !forumId) return undefined
  const membros = new Map(data.membros.map(m => [m.id, m]))
  const participantes = [
    ...acao.participants.map(p => {
      const m = membros.get(p.memberId)
      return `• ${[p.patenteUnidade, m?.policial ?? `ID ${p.memberId}`].filter(Boolean).join(' ')}`
    }),
    ...(acao.participantesExtras ?? []).map(e => `• ${[e.patente, e.nome].filter(Boolean).join(' ')} (externo)`),
  ].join('\n')
  const [a, mes, d] = acao.data.split('-')
  const emoji = acao.resultado === 'Vitória' ? '✅' : acao.resultado === 'Derrota' ? '❌' : '➖'

  const embed: Record<string, unknown> = {
    title: `🚨 APREENSÃO · ${acao.qru}`,
    color: COR_APREENSAO,
    fields: [
      campo('Data', `${d}/${mes}/${a}`),
      campo('Resultado', `${emoji} ${acao.resultado}`),
      campo('QRU', acao.qru),
      campo('Local', acao.local),
      campo('Comandante', acao.comandante),
      campo('Aprovado por', aprovadoPor),
      campo(`Participantes (${acao.participants.length + (acao.participantesExtras?.length ?? 0)})`, participantes, false),
    ],
    footer: rodape(),
    timestamp: agora(),
  }
  if (acao.imagem && /^https?:\/\//.test(acao.imagem)) embed.image = { url: acao.imagem }

  const thread = await discord<{ id: string }>('POST', `/channels/${forumId}/threads`, {
    name: cut(`${emoji} ${acao.qru} | ${d}/${mes}/${a} | #${acao.id}`, 100),
    message: { allowed_mentions: { parse: [] }, embeds: [embed] },
  })
  return thread.id
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
