/**
 * Presença (online/offline) dos membros no servidor do Discord, vinda do gateway.
 * Fica só em memória — não vai para o banco nem para o backup — e é reconstruída
 * a cada conexão do bot. Sem o "Presence Intent" o mapa fica vazio e a presença
 * é tratada como desconhecida (o site não mostra a bolinha).
 */

const online = new Map<string, boolean>()
let ativa = false

/** Liga/desliga a presença (desligar limpa tudo: nada de estado velho). */
export function definirPresencaAtiva(valor: boolean): void {
  ativa = valor
  if (!valor) online.clear()
}

/** `status` do Discord: online, idle, dnd, offline ou invisible. */
export function registrarPresenca(discordId: string, status: string | null | undefined): void {
  if (!ativa || !/^\d{15,22}$/.test(discordId)) return
  online.set(discordId, !!status && status !== 'offline' && status !== 'invisible')
}

/** true/false quando o bot acompanha presença; null quando não sabe. */
export function estaOnline(discordId: string | null | undefined): boolean | null {
  if (!ativa || !discordId) return null
  return online.get(discordId) ?? false
}
