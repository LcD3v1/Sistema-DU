import { CampoPerfil, Conta, Membro } from './types'

/**
 * REGRA: patente, nível e avatar têm UMA fonte só. Todos os módulos leem daqui,
 * então qualquer alteração aprovada aparece imediatamente em todos eles.
 */

/** Avatar atual da conta: vale a troca MAIS RECENTE (foto do servidor ou enviada no perfil). */
export function avatarAtual(conta?: Conta | null): string | null {
  if (!conta) return null
  const servidor = conta.avatarServidor || null
  const enviado = conta.avatar || null
  if (servidor && enviado) {
    return (conta.avatarEm ?? '') > (conta.avatarServidorEm ?? '') ? enviado : servidor
  }
  return servidor || enviado
}

/** Nível do membro: o informado por ele. Sem informação, ainda não há nível. */
export function nivelDoMembro(m?: Membro | null): number | null {
  return m && Number.isInteger(m.nivel) && (m.nivel as number) > 0 ? (m.nivel as number) : null
}

/** Aplica um campo de perfil aprovado no membro (converte o nível para número). */
export function aplicarCampoPerfil(membro: Membro, campo: CampoPerfil, valor: string): void {
  if (campo === 'nivel') { membro.nivel = parseInt(valor, 10); return }
  membro[campo] = valor
}
