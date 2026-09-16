import { Conta } from '../types'
import { botConfigurado } from './forum'

/**
 * Identidade do usuário NO SERVIDOR da unidade: apelido e foto do servidor
 * (não o nome/foto globais do Discord). Usada no topo e na dashboard.
 */

export interface MembroServidor {
  user: { id: string; username: string; global_name?: string | null; avatar?: string | null; discriminator?: string }
  nick?: string | null
  avatar?: string | null   // avatar específico do servidor
}

const CDN = 'https://cdn.discordapp.com'

export function avatarDoMembro(guildId: string, m: MembroServidor): string {
  if (m.avatar) return `${CDN}/guilds/${guildId}/users/${m.user.id}/avatars/${m.avatar}.png?size=128`
  if (m.user.avatar) return `${CDN}/avatars/${m.user.id}/${m.user.avatar}.png?size=128`
  const indice = Number((BigInt(m.user.id) >> 22n) % 6n)
  return `${CDN}/embed/avatars/${indice}.png`
}

export function nomeDoMembro(m: MembroServidor): string {
  return m.nick || m.user.global_name || m.user.username
}

/** Busca o membro no servidor pelo bot (REST). Retorna undefined se não estiver no servidor. */
export async function buscarMembroServidor(discordId: string): Promise<MembroServidor | undefined> {
  if (!botConfigurado()) return undefined
  const res = await fetch(`https://discord.com/api/v10/guilds/${process.env.DISCORD_GUILD_ID}/members/${discordId}`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
  })
  if (res.status === 404) return undefined
  if (!res.ok) throw new Error(`Discord membro ${discordId} → ${res.status}`)
  return await res.json() as MembroServidor
}

/** Aplica apelido/foto do servidor na conta. Retorna true se mudou algo. */
export function aplicarIdentidade(conta: Conta, m: MembroServidor): boolean {
  const nome = nomeDoMembro(m)
  const avatar = avatarDoMembro(process.env.DISCORD_GUILD_ID!, m)
  if (conta.nomeServidor === nome && conta.avatarServidor === avatar) return false
  conta.nomeServidor = nome
  conta.avatarServidor = avatar
  return true
}
