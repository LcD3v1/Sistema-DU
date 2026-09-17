import { Conta } from '../types'
import { botConfigurado, discordFetch } from './forum'

/**
 * Identidade do usuário NO SERVIDOR da unidade: apelido e foto do servidor
 * (não o nome/foto globais do Discord). Usada no topo e na dashboard.
 */

export interface MembroServidor {
  user: { id: string; username: string; global_name?: string | null; avatar?: string | null; discriminator?: string; bot?: boolean }
  nick?: string | null
  avatar?: string | null   // avatar específico do servidor
  roles?: string[]
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
  const res = await discordFetch('GET', `/guilds/${process.env.DISCORD_GUILD_ID}/members/${discordId}`)
  if (res.status === 404) return undefined
  if (!res.ok) throw new Error(`Discord membro ${discordId} → ${res.status}`)
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

// ── Lista de membros do servidor ──────────────────────────────────────────────

/**
 * Membro do servidor. `id` é o discordId e fica SÓ no backend — o painel recebe
 * apenas `usuario` (o @ do Discord, único) e usa ele como referência; o id é
 * resolvido aqui na hora de montar a menção.
 */
export interface MembroServidorLista { id: string; usuario: string; nome: string; avatar: string }

/** O que vai para o navegador: sem discordId. */
export interface MembroMencionavel { usuario: string; nome: string; avatar: string }

export const semId = (m: MembroServidorLista): MembroMencionavel =>
  ({ usuario: m.usuario, nome: m.nome, avatar: m.avatar })

const MEMBROS_TTL_MS = 60_000
const LIMITE_PAGINA = 1000
const TETO_MEMBROS = 10_000   // trava de segurança: não varre um servidor gigante sem fim
let cacheMembros: { em: number; lista: Promise<MembroServidorLista[]> } | undefined

async function buscarTodosMembros(): Promise<MembroServidorLista[]> {
  const guildId = process.env.DISCORD_GUILD_ID
  const out: MembroServidorLista[] = []
  let after = '0'
  while (out.length < TETO_MEMBROS) {
    const res = await discordFetch('GET', `/guilds/${guildId}/members?limit=${LIMITE_PAGINA}&after=${after}`)
    if (!res.ok) throw new Error(`Discord membros → ${res.status}`)
    const pagina = await res.json() as MembroServidor[]
    for (const m of pagina) {
      if (m.user?.bot) continue
      out.push({ id: m.user.id, usuario: m.user.username, nome: nomeDoMembro(m), avatar: avatarDoMembro(guildId!, m) })
    }
    if (pagina.length < LIMITE_PAGINA) break
    after = pagina[pagina.length - 1].user.id
  }
  return out.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/**
 * Todos os membros do servidor (sem bots), com cache curto — a paginação é cara
 * e a lista muda pouco. Chamadas simultâneas compartilham a mesma requisição.
 */
export function listarMembrosServidor(): Promise<MembroServidorLista[]> {
  if (!cacheMembros || Date.now() - cacheMembros.em > MEMBROS_TTL_MS) {
    const lista = buscarTodosMembros()
    cacheMembros = { em: Date.now(), lista }
    lista.catch(() => { if (cacheMembros?.lista === lista) cacheMembros = undefined })
  }
  return cacheMembros.lista
}
