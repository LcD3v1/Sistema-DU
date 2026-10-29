import { AreaId } from './permAreas'
import { DuData, Notificacao, TipoNotificacao } from './types'
import { canArea, isAdmin, PROTECTED_OWNER_ID } from './access'
import { nivelHierarquia } from './efetivo'

/**
 * Notificações por usuário (o sininho do topo).
 * Ficam guardadas por 7 dias e depois são apagadas automaticamente.
 * As funções mutam `data` — o chamador grava com writeData.
 */

export const VALIDADE_NOTIFICACAO_MS = 7 * 24 * 60 * 60 * 1000

export function notificar(
  data: DuData, contaId: number | undefined, tipo: TipoNotificacao, titulo: string, mensagem: string, link?: string,
): void {
  if (!contaId || !data.contas.some(c => c.id === contaId)) return
  data.notificacoes.push({
    id: data.nextNotifId++,
    contaId, tipo, titulo, mensagem, link,
    lida: false,
    criadaEm: new Date().toISOString(),
  })
}

/**
 * Avisa quem pode decidir uma solicitação: contas ativas com permissão de
 * editar a área e acima do membro na hierarquia (admins sempre).
 */
export function notificarAprovadores(
  data: DuData, area: AreaId, membroId: number | undefined, excetoContaId: number | undefined,
  tipo: TipoNotificacao, titulo: string, mensagem: string, link?: string,
): void {
  const alvo = membroId ? data.contas.find(c => c.membroId === membroId) : undefined
  const nivelAlvo = nivelHierarquia(data, alvo?.cargoPermId)
  let avisados = 0
  for (const c of data.contas) {
    if (c.id === excetoContaId || c.id === alvo?.id || !recebeAvisos(c, data)) continue
    const admin = isAdmin(c, data)
    if (!admin && !canArea(c, data, area, 'editar')) continue
    if (!admin && alvo && nivelHierarquia(data, c.cargoPermId) >= nivelAlvo) continue
    notificar(data, c.id, tipo, titulo, mensagem, link)
    avisados++
  }
  // Ninguém acima na hierarquia: o pedido não pode ficar sem ninguém sabendo — avisa os admins
  if (avisados === 0) notificarAdmins(data, excetoContaId, tipo, titulo, mensagem, link)
}

/**
 * Avisa quem pode APROVAR um pedido da área: contas ativas com "editar" nela (admins sempre).
 * Use para pedidos que esperam decisão (setagem, investigação…) — "ver" não basta para aprovar.
 * Ninguém com a permissão: avisa os admins.
 */
export function notificarQuemAprova(
  data: DuData, area: AreaId, excetoContaIds: (number | undefined)[],
  tipo: TipoNotificacao, titulo: string, mensagem: string, link?: string,
): void {
  const excluir = new Set(excetoContaIds.filter((x): x is number => typeof x === 'number'))
  let avisados = 0
  for (const c of data.contas) {
    if (excluir.has(c.id) || !recebeAvisos(c, data)) continue
    if (!canArea(c, data, area, 'editar')) continue   // canArea já inclui admins
    notificar(data, c.id, tipo, titulo, mensagem, link)
    avisados++
  }
  if (avisados === 0) notificarAdmins(data, [...excluir][0], tipo, titulo, mensagem, link)
}

/** Conta que pode receber avisos: ativa, não exonerada; a dona só depois de vincular o Discord. */
function recebeAvisos(c: DuData['contas'][number], data: DuData): boolean {
  if (c.ativo === false || c.exonerado) return false
  if (c.id === PROTECTED_OWNER_ID && !c.discordId) return false
  return isAdmin(c, data) || Boolean(c.cargoPermId)
}

/**
 * Avisa todos que podem VER uma área (admins incluídos). Sem área = todos com
 * acesso ao painel (cargo ou admin). Ignora exonerados, inativos e sem cargo.
 */
export function notificarArea(
  data: DuData, area: AreaId | undefined, excetoContaIds: (number | undefined)[],
  tipo: TipoNotificacao, titulo: string, mensagem: string, link?: string,
): void {
  const excluir = new Set(excetoContaIds.filter((x): x is number => typeof x === 'number'))
  for (const c of data.contas) {
    if (excluir.has(c.id) || !recebeAvisos(c, data)) continue
    if (area && !canArea(c, data, area, 'ver')) continue
    notificar(data, c.id, tipo, titulo, mensagem, link)
  }
}

/** Avisa todos os administradores ativos (aprovação de cadastro é deles). */
export function notificarAdmins(
  data: DuData, excetoContaId: number | undefined, tipo: TipoNotificacao, titulo: string, mensagem: string, link?: string,
): void {
  for (const c of data.contas) {
    if (c.id === excetoContaId || !isAdmin(c, data) || !recebeAvisos(c, data)) continue
    notificar(data, c.id, tipo, titulo, mensagem, link)
  }
}

/** Remove notificações com mais de 7 dias. Retorna true se apagou alguma. */
export function limparNotificacoesAntigas(data: DuData): boolean {
  const limite = Date.now() - VALIDADE_NOTIFICACAO_MS
  const antes = data.notificacoes.length
  data.notificacoes = data.notificacoes.filter((n: Notificacao) => new Date(n.criadaEm).getTime() >= limite)
  return data.notificacoes.length !== antes
}
