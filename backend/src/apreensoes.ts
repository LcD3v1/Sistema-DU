import { DuData, Acao } from './types'
import { nomeDeExibicao } from './registros'

/** Placar de apreensões (só cálculo; o painel não posta no Discord). */

const TZ = 'America/Sao_Paulo'
const diaSP = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(d)

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
function apreensoesValidas(data: DuData) {
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
export function calcularRanking(data: DuData): ResumoApreensoes {
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
      nome: nomeDeExibicao(conta, membro),
      discordId: conta?.discordId,
      passaporte: membro.passaporte || '',
      total,
    })
  }
  linhas.sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'))

  return { linhas, total: acoes.length }
}
