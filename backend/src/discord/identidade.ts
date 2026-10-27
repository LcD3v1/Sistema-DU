import { Conta } from '../types'

/**
 * Identidade do usuário NO SERVIDOR da unidade: apelido e foto do servidor
 * (não o nome/foto globais do Discord). Usada no topo e na dashboard.
 *
 * O painel não tem bot: o vínculo com o servidor é lido no login, com o token
 * OAuth da própria pessoa (escopo `guilds.members.read`).
 */

export interface MembroServidor {
  user: { id: string; username: string; global_name?: string | null; avatar?: string | null; discriminator?: string; bot?: boolean }
  nick?: string | null
  avatar?: string | null   // avatar específico do servidor
  roles?: string[]
}

const API = 'https://discord.com/api'
const CDN = 'https://cdn.discordapp.com'
const TIMEOUT_MS = 10_000

export function servidorConfigurado(): boolean {
  return /^\d{17,20}$/.test(process.env.DISCORD_GUILD_ID ?? '')
}

export function avatarDoMembro(guildId: string, m: MembroServidor): string {
  if (m.avatar) return `${CDN}/guilds/${guildId}/users/${m.user.id}/avatars/${m.avatar}.png?size=128`
  if (m.user.avatar) return `${CDN}/avatars/${m.user.id}/${m.user.avatar}.png?size=128`
  const indice = Number((BigInt(m.user.id) >> 22n) % 6n)
  return `${CDN}/embed/avatars/${indice}.png`
}

export function nomeDoMembro(m: MembroServidor): string {
  return m.nick || m.user.global_name || m.user.username
}

/**
 * Membro do servidor da unidade, lido com o token OAuth de quem está entrando.
 * Retorna undefined se a pessoa não fizer parte do servidor.
 */
export async function buscarMembroServidor(accessToken: string): Promise<MembroServidor | undefined> {
  if (!servidorConfigurado()) return undefined
  const res = await fetch(`${API}/users/@me/guilds/${process.env.DISCORD_GUILD_ID}/member`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (res.status === 404) return undefined
  if (!res.ok) throw new Error(`Discord membro do servidor → ${res.status}`)
  return await res.json() as MembroServidor
}

/** Aplica apelido/foto do servidor na conta. Retorna true se mudou algo. */
export function aplicarIdentidade(conta: Conta, m: MembroServidor): boolean {
  const nome = nomeDoMembro(m)
  const avatar = avatarDoMembro(process.env.DISCORD_GUILD_ID!, m)
  const roles = m.roles ? [...m.roles].sort() : conta.discordRoleIds
  if (conta.nomeServidor === nome && conta.avatarServidor === avatar && JSON.stringify(conta.discordRoleIds) === JSON.stringify(roles)) return false
  conta.nomeServidor = nome
  if (conta.avatarServidor !== avatar) conta.avatarServidorEm = new Date().toISOString()
  conta.avatarServidor = avatar
  if (roles) conta.discordRoleIds = roles
  return true
}
