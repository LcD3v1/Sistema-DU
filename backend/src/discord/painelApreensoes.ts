import { FastData, Acao, RankingArquivado } from '../types'
import { readData, writeData, peekData } from '../data'
import { audit } from '../security/audit'
import { podeZerarRankings } from '../access'
import { botConfigurado, discordFetch, emSegundoPlano } from './forum'

/**
 * Painel de ranking de apreensões no Discord.
 *
 * Uma ÚNICA mensagem por canal, criada quando o canal é escolhido e depois
 * sempre EDITADA — a cada apreensão aprovada o placar se reordena sozinho.
 * Dois botões: "Atualizar agora" e "Resetar ranking" (o reset exige permissão,
 * conferida em `gateway.ts` quando o clique chega).
 *
 * Resetar NÃO apaga apreensão nenhuma: só marca a data a partir da qual o
 * placar conta. O histórico do painel segue intacto.
 */

const COR = 0xf5b301
const TZ = 'America/Sao_Paulo'
const MAX_LINHAS = 15          // cabe no limite de descrição do embed com folga
const MEDALHAS = ['🥇', '🥈', '🥉']

export const ID_BOTAO_ATUALIZAR = 'apreensoes:atualizar'
export const ID_BOTAO_RESETAR = 'apreensoes:resetar'

const diaSP = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(d)
const MAX_HISTORICO = 500      // rankings arquivados guardados (os mais antigos saem)

interface LinhaRanking { nome: string; discordId?: string; passaporte: string; total: number }

/**
 * Quando a apreensão entrou no placar: hora da aprovação. Registro antigo (sem
 * `aprovadaEm`) usa o início do dia da QRU — assim um reset no meio do dia já
 * tira do placar tudo o que foi aprovado antes dele.
 */
function momentoNoPlacar(a: Acao): number {
  if (a.aprovadaEm) return Date.parse(a.aprovadaEm)
  return Date.parse(`${a.data.slice(0, 10)}T00:00:00-03:00`)
}

/** Apreensões aprovadas que contam para o placar (depois do último reset). */
function apreensoesValidas(data: FastData) {
  const corte = data.painelApreensoes?.resetadoEm ? Date.parse(data.painelApreensoes.resetadoEm) : NaN
  const hoje = diaSP(new Date())
  return data.acoes.filter(a =>
    (a.status ?? 'aprovada') === 'aprovada' &&
    Array.isArray(a.participants) && a.participants.length > 0 &&
    typeof a.data === 'string' && a.data.slice(0, 10) <= hoje &&
    (Number.isNaN(corte) || momentoNoPlacar(a) > corte))
}

export interface ResumoApreensoes {
  linhas: LinhaRanking[]
  total: number
}

/** Monta o placar: uma apreensão conta 1 para CADA participante. */
export function calcularRanking(data: FastData): ResumoApreensoes {
  const acoes = apreensoesValidas(data)
  const porMembro = new Map<number, number>()
  for (const a of acoes) {
    for (const id of new Set(a.participants.map(p => p.memberId))) {
      porMembro.set(id, (porMembro.get(id) ?? 0) + 1)
    }
  }

  const linhas: LinhaRanking[] = []
  for (const [memId, total] of porMembro) {
    const membro = data.membros.find(m => m.id === memId)
    if (!membro || membro.status === 'Inativo') continue
    const conta = data.contas.find(c => c.membroId === memId)
    if (conta?.exonerado || conta?.ativo === false) continue
    linhas.push({
      nome: conta?.nomeServidor || membro.policial || `Membro #${memId}`,
      discordId: conta?.discordId,
      passaporte: membro.passaporte || '',
      total,
    })
  }
  linhas.sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'))

  return { linhas, total: acoes.length }
}

const plural = (n: number) => `${n} apreens${n === 1 ? 'ão' : 'ões'}`

function montarEmbed(data: FastData) {
  const r = calcularRanking(data)
  const mes = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, month: 'long', year: 'numeric' })
    .format(new Date())

  const corpo = r.linhas.slice(0, MAX_LINHAS).map((l, i) => {
    const posicao = MEDALHAS[i] ?? `**${i + 1}.**`
    // Menção quando a conta está vinculada; senão o nome, nunca um ID solto.
    const quem = l.discordId ? `<@${l.discordId}>` : l.nome
    const passaporte = l.passaporte ? ` | ${l.passaporte}` : ''
    return `${posicao} ${quem}${passaporte} - ${plural(l.total)}`
  }).join('\n')

  const reset = data.painelApreensoes?.resetadoEmData
  const subtitulo = reset
    ? `Classificação desde ${reset.split('-').reverse().join('/')}`
    : `Classificação mensal · ${mes.charAt(0).toUpperCase()}${mes.slice(1)}`

  return {
    title: '🏆 RANKING DE APREENSÕES',
    color: COR,
    description: [
      `_${subtitulo}_`,
      '',
      corpo || '_Nenhuma apreensão registrada ainda._',
      '',
      `Total de apreensões: **${r.total}**`,
    ].join('\n').slice(0, 4000),
    footer: { text: 'DU · Detroit Police Department' },
    timestamp: new Date().toISOString(),
  }
}

const botoes = () => ([{
  type: 1,
  components: [
    { type: 2, style: 1, custom_id: ID_BOTAO_ATUALIZAR, label: 'Atualizar agora', emoji: { name: '🔄' } },
    { type: 2, style: 4, custom_id: ID_BOTAO_RESETAR, label: 'Resetar ranking', emoji: { name: '🟥' } },
  ],
}])

/** Corpo da mensagem. `allowed_mentions` vazio: o placar nunca notifica ninguém. */
function corpoMensagem(data: FastData) {
  return { embeds: [montarEmbed(data)], components: botoes(), allowed_mentions: { parse: [] } }
}

/**
 * Cria o painel no canal configurado (ou o recria se a mensagem sumiu) e
 * guarda o id da mensagem para as próximas edições.
 */
export async function publicarPainel(): Promise<void> {
  const data = readData()
  const canalId = data.canais?.rankingApreensoes
  if (!botConfigurado() || !canalId) return

  const res = await discordFetch('POST', `/channels/${canalId}/messages`, corpoMensagem(data))
  if (!res.ok) throw new Error(`Discord painel apreensões → ${res.status}`)
  const msg = await res.json() as { id: string }

  const atual = readData()
  atual.painelApreensoes = { ...atual.painelApreensoes, canalId, mensagemId: msg.id }
  writeData(atual)
}

/**
 * Reescreve o painel existente. Se a mensagem foi apagada no Discord (404),
 * publica de novo — o painel se conserta sozinho.
 */
export async function atualizarPainel(): Promise<void> {
  const data = readData()
  const canalId = data.canais?.rankingApreensoes
  const painel = data.painelApreensoes
  if (!botConfigurado() || !canalId) return
  if (!painel?.mensagemId || painel.canalId !== canalId) { await publicarPainel(); return }

  const res = await discordFetch('PATCH', `/channels/${canalId}/messages/${painel.mensagemId}`, corpoMensagem(data))
  if (res.status === 404 || res.status === 403) { await publicarPainel(); return }
  if (!res.ok) throw new Error(`Discord painel apreensões → ${res.status}`)
}

/** Atualiza sem nunca quebrar a requisição do painel (best effort, igual ao resto). */
export function atualizarPainelEmSegundoPlano(): void {
  if (!botConfigurado() || !peekData().canais?.rankingApreensoes) return
  emSegundoPlano('painel de apreensões', atualizarPainel)
}

/** Zera o placar a partir de agora. Não apaga apreensão nenhuma. */
export async function resetarRanking(contaId: number): Promise<void> {
  const data = readData()
  const conta = data.contas.find(c => c.id === contaId)
  if (!conta || !podeZerarRankings(conta, data)) {
    audit('UNAUTHORIZED_ACCESS', undefined, 'Reset de ranking negado')
    throw new Error('Acesso negado')
  }
  const por = conta.nomeServidor || conta.username
  const agora = new Date()
  // Guarda o placar que está sendo zerado no histórico de rankings (automático)
  const atual = calcularRanking(data)
  const arquivado: RankingArquivado = {
    id: (data.historicoRankings ?? []).reduce((max, r) => Math.max(max, r.id), 0) + 1,
    ...(data.painelApreensoes?.resetadoEm ? { inicio: data.painelApreensoes.resetadoEm } : {}),
    fim: agora.toISOString(),
    total: atual.total,
    linhas: atual.linhas.map(l => ({ nome: l.nome, total: l.total })),
  }
  data.historicoRankings = [...(data.historicoRankings ?? []), arquivado].slice(-MAX_HISTORICO)
  data.painelApreensoes = {
    ...data.painelApreensoes,
    resetadoEm: agora.toISOString(),
    resetadoEmData: diaSP(agora),
    resetadoPor: por,
  }
  writeData(data)
  audit('RANKING_APREENSOES_RESETADO', undefined, `Resetado por ${por}`)
  await atualizarPainel()
}
