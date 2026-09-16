import { Ausencia, Conta, FastData, Membro } from './types'
import { readData, writeData } from './data'
import { isAdmin, getCargo, PROTECTED_OWNER_ID, discordIdsDonos } from './access'
import { audit } from './security/audit'
import { postarAusencia, postarExoneracao, emSegundoPlano } from './discord/forum'
import { notificar } from './notificacoes'

/**
 * Regras do efetivo: hierarquia de cargos, ausências e exoneração.
 *
 * Hierarquia: a ORDEM de `data.cargosPermissao` é a hierarquia — índice 0 é o
 * cargo mais alto. Ir para um índice menor = promoção; maior = rebaixamento.
 */

const TZ = 'America/Sao_Paulo'

/** Data de hoje (YYYY-MM-DD) no fuso da unidade. */
export function hoje(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ })
}

/** Conta dona: id 1 ou Discord listado em DISCORD_OWNER_ID. */
export function ehContaDona(conta: Conta | undefined): boolean {
  if (!conta) return false
  return conta.id === PROTECTED_OWNER_ID || (!!conta.discordId && discordIdsDonos().includes(conta.discordId))
}

export const statusAusencia = (a: Ausencia) => a.status ?? 'aprovada'

/** Ausência aprovada em andamento hoje para o membro, se houver. */
export function ausenciaAtivaDoMembro(data: FastData, membroId: number | undefined): Ausencia | undefined {
  if (!membroId) return undefined
  const d = hoje()
  return data.ausencias.find(a =>
    a.memberId === membroId && statusAusencia(a) === 'aprovada' && a.dataInicio <= d && a.dataFim >= d)
}

/** Motivo pelo qual a conta não pode acessar o painel agora (ou undefined). */
export function bloqueioDeAcesso(conta: Conta, data: FastData): { codigo: 'EXONERADO' } | { codigo: 'AUSENTE'; ate: string } | undefined {
  if (ehContaDona(conta)) return undefined
  if (conta.exonerado) return { codigo: 'EXONERADO' }
  const aus = ausenciaAtivaDoMembro(data, conta.membroId)
  if (aus) return { codigo: 'AUSENTE', ate: aus.dataFim }
  return undefined
}

/** Posição do cargo na hierarquia (0 = topo). Sem cargo = abaixo de todos. */
export function nivelHierarquia(data: FastData, cargoPermId: number | undefined): number {
  if (!cargoPermId) return Number.MAX_SAFE_INTEGER
  const i = data.cargosPermissao.findIndex(c => c.id === cargoPermId)
  return i === -1 ? Number.MAX_SAFE_INTEGER : i
}

export const contaDoMembro = (data: FastData, membroId: number) => data.contas.find(c => c.membroId === membroId)

/**
 * Quem não é administrador só gerencia membros ABAIXO do próprio cargo, e só
 * atribui cargos abaixo do próprio (nunca um cargo de acesso total).
 */
export function podeGerenciar(data: FastData, atorId: number, membro: Membro, cargoDestinoId?: number): string | undefined {
  const ator = data.contas.find(c => c.id === atorId)
  if (!ator) return 'Conta não encontrada'
  if (isAdmin(ator, data)) return undefined
  const alvo = contaDoMembro(data, membro.id)
  if (alvo?.id === ator.id) return 'Você não pode gerenciar a si mesmo.'
  if (ehContaDona(alvo)) return 'Não é possível gerenciar um dono do sistema.'
  const meu = nivelHierarquia(data, ator.cargoPermId)
  if (alvo && nivelHierarquia(data, alvo.cargoPermId) <= meu) {
    return 'Você só pode gerenciar membros abaixo do seu cargo.'
  }
  if (cargoDestinoId !== undefined) {
    const destino = data.cargosPermissao.find(c => c.id === cargoDestinoId)
    if (destino?.admin) return 'Somente administradores atribuem cargos de acesso total.'
    if (nivelHierarquia(data, cargoDestinoId) <= meu) return 'Você só pode atribuir cargos abaixo do seu.'
  }
  return undefined
}

/**
 * Exonera: tira o membro do efetivo do painel, bloqueia a conta (que vê o aviso
 * de exoneração ao entrar) e registra no tópico pessoal do Discord (❌).
 * Muta `data` — o chamador grava com writeData.
 */
export function exonerarMembro(data: FastData, membro: Membro, por: string, motivo: string): Conta | undefined {
  const conta = contaDoMembro(data, membro.id)
  if (ehContaDona(conta)) throw new Error('Um dono do sistema não pode ser exonerado.')

  data.membros = data.membros.filter(m => m.id !== membro.id)
  data.membrosOrder = data.membrosOrder.filter(id => id !== membro.id)
  data.ausencias.forEach(a => {
    if (a.memberId === membro.id && ['pendente', 'aprovada'].includes(statusAusencia(a))) {
      a.status = 'encerrada'; a.encerradaEm = new Date().toISOString(); a.encerradaPor = por
    }
  })
  if (conta) {
    conta.exonerado = true
    conta.exoneradoEm = new Date().toISOString()
    conta.exoneradoMotivo = motivo
    conta.ativo = false
    delete conta.cargoPermId
    delete conta.membroId
  }
  const snapshot = structuredClone(data)
  emSegundoPlano('exoneração', () => postarExoneracao(snapshot, membro, por, motivo))
  return conta
}

/**
 * Rotina periódica das ausências:
 *  - ausência aprovada que começou → status do membro "Ausência";
 *  - ausência aprovada que terminou → encerra, status "Ativo" e posta o retorno.
 */
export function verificarAusencias(): void {
  const data = readData()
  const d = hoje()
  let mudou = false

  for (const a of data.ausencias) {
    if (statusAusencia(a) !== 'aprovada' || !a.memberId) continue
    const m = data.membros.find(x => x.id === a.memberId)

    if (a.dataFim < d) {
      a.status = 'encerrada'
      a.encerradaEm = new Date().toISOString()
      a.encerradaPor = 'Sistema (fim do período)'
      mudou = true
      if (m) {
        const outra = data.ausencias.some(o => o !== a && o.memberId === m.id && statusAusencia(o) === 'aprovada' && o.dataInicio <= d && o.dataFim >= d)
        if (!outra && m.status === 'Ausência') m.status = 'Ativo'
        notificar(data, contaDoMembro(data, m.id)?.id, 'ausencia', 'Ausência encerrada',
          'Seu período de ausência terminou. O acesso ao painel foi liberado — bem-vindo de volta!', '/ausencias')
        const snap = structuredClone(data)
        const aus = { ...a }
        emSegundoPlano('retorno de ausência', () => postarAusencia(snap, m, 'retorno', aus.dataInicio, aus.dataFim, 'Sistema (automático)'))
      }
      audit('AUSENCIA_ENCERRADA', undefined, `#${a.id} ${a.nome} — fim do período`)
    } else if (a.dataInicio <= d && m && m.status !== 'Ausência') {
      m.status = 'Ausência'
      mudou = true
    }
  }
  if (mudou) writeData(data)
}

/** Nome do cargo atual do membro (cargo de permissão da conta, ou o texto salvo). */
export function nomeCargoAtual(data: FastData, membro: Membro): string {
  const conta = contaDoMembro(data, membro.id)
  const cargo = conta ? getCargo(conta, data) : undefined
  return cargo?.nome || membro.patenteInterna || 'Sem cargo'
}
