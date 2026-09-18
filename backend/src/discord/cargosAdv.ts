import { readData, writeData, peekData } from '../data'
import type { CargosAdv, Membro } from '../types'
import { botConfigurado, discordFetch } from './forum'

/**
 * Cargos de advertência no Discord: cada quadradinho (ADV 1, 2 e 3) do painel
 * espelha um cargo. Marcado → a pessoa tem o cargo; desmarcado → o bot tira.
 * Os níveis são independentes: tirar o 2 não mexe no 1 nem no 3.
 *
 * O bot cria sozinho `ADV FAST 1/2/3` quando ainda não há cargo configurado,
 * e o admin pode trocar por outros cargos em Configurações.
 */

export const NIVEIS_ADV = ['1', '2', '3'] as const
export type NivelAdvChave = typeof NIVEIS_ADV[number]

const NOME_PADRAO = (n: NivelAdvChave) => `ADV FAST ${n}`
const COR: Record<NivelAdvChave, number> = { '1': 0xF5C542, '2': 0xFB923C, '3': 0xD0453A }
const ADMINISTRATOR = 1n << 3n
const MANAGE_ROLES = 1n << 28n

interface RoleApi { id: string; name: string; position: number; managed: boolean; permissions: string }
export interface CargoServidor { id: string; nome: string; gerenciavel: boolean }
export interface InfoCargosAdv { cargos: CargosAdv; roles: CargoServidor[]; podeGerenciar: boolean }

const guild = () => process.env.DISCORD_GUILD_ID!

async function jsonOuErro<T>(res: Response, rotulo: string): Promise<T> {
  if (!res.ok) throw new Error(`${rotulo}: HTTP ${res.status}`)
  return res.json() as Promise<T>
}

/** Cargos do servidor + se o bot pode gerenciá-los (permissão e posição acima deles). */
async function lerServidor(): Promise<{ roles: RoleApi[]; podeGerenciar: boolean; topoBot: number }> {
  const [roles, eu] = await Promise.all([
    discordFetch('GET', `/guilds/${guild()}/roles`).then(r => jsonOuErro<RoleApi[]>(r, 'listar cargos')),
    discordFetch('GET', '/users/@me').then(r => jsonOuErro<{ id: string }>(r, 'identificar bot')),
  ])
  const bot = await discordFetch('GET', `/guilds/${guild()}/members/${eu.id}`).then(r => jsonOuErro<{ roles: string[] }>(r, 'ler bot'))
  const doBot = roles.filter(r => bot.roles.includes(r.id) || r.id === guild())
  const perms = doBot.reduce((acc, r) => acc | BigInt(r.permissions), 0n)
  const topoBot = Math.max(0, ...doBot.map(r => r.position))
  return { roles, podeGerenciar: (perms & (ADMINISTRATOR | MANAGE_ROLES)) !== 0n, topoBot }
}

const gerenciavel = (r: RoleApi, topoBot: number) => !r.managed && r.id !== guild() && r.position < topoBot

export async function infoCargosAdv(): Promise<InfoCargosAdv> {
  const { roles, podeGerenciar, topoBot } = await lerServidor()
  return {
    cargos: peekData().cargosAdv ?? {},
    podeGerenciar,
    roles: roles
      .filter(r => r.id !== guild() && !r.managed)
      .sort((a, b) => b.position - a.position)
      .map(r => ({ id: r.id, nome: r.name, gerenciavel: podeGerenciar && gerenciavel(r, topoBot) })),
  }
}

/** Valida que os IDs escolhidos existem no servidor e o bot consegue aplicá-los. */
export async function validarCargosEscolhidos(escolha: Partial<Record<NivelAdvChave, string | null>>): Promise<string | null> {
  const { roles, podeGerenciar, topoBot } = await lerServidor()
  if (!podeGerenciar) return 'O bot não tem a permissão "Gerenciar Cargos" no servidor.'
  const porId = new Map(roles.map(r => [r.id, r]))
  for (const n of NIVEIS_ADV) {
    const id = escolha[n]
    if (!id) continue
    const r = porId.get(id)
    if (!r || r.id === guild() || r.managed) return `O cargo escolhido para ADV ${n} não existe ou não pode ser atribuído.`
    if (!gerenciavel(r, topoBot)) return `O cargo de ADV ${n} está acima do cargo do bot. Suba o cargo do bot na lista de cargos do servidor.`
  }
  const ids = NIVEIS_ADV.map(n => escolha[n]).filter(Boolean)
  if (new Set(ids).size !== ids.length) return 'Use um cargo diferente para cada nível de advertência.'
  return null
}

/**
 * Garante um cargo para cada nível: reaproveita o configurado, senão um cargo
 * com o nome padrão, senão cria. Grava os IDs na configuração.
 */
export async function garantirCargosAdv(): Promise<void> {
  if (!botConfigurado()) return
  const { roles, podeGerenciar } = await lerServidor()
  const atuais = peekData().cargosAdv ?? {}
  const existe = (id?: string) => !!id && roles.some(r => r.id === id)
  const novos: CargosAdv = {}
  for (const n of NIVEIS_ADV) {
    if (existe(atuais[n])) continue
    const porNome = roles.find(r => r.name === NOME_PADRAO(n))
    if (porNome) { novos[n] = porNome.id; continue }
    if (!podeGerenciar) continue
    const criado = await discordFetch('POST', `/guilds/${guild()}/roles`, {
      name: NOME_PADRAO(n), color: COR[n], hoist: false, mentionable: false, permissions: '0',
    }).then(r => jsonOuErro<RoleApi>(r, `criar ${NOME_PADRAO(n)}`))
    novos[n] = criado.id
    console.log(`[FAST][DISCORD] Cargo "${NOME_PADRAO(n)}" criado.`)
  }
  if (!Object.keys(novos).length) return
  // Sem await daqui até writeData: não sobrescreve gravações concorrentes
  const data = readData()
  data.cargosAdv = { ...(data.cargosAdv ?? {}), ...novos }
  writeData(data)
}

/** Níveis que a conta deve ter agora (vazio se exonerada, inativa ou sem membro). */
function niveisDesejados(discordId: string): Set<NivelAdvChave> | null {
  const data = peekData()
  const conta = data.contas.find(c => c.discordId === discordId)
  if (!conta) return null
  const membro: Membro | undefined = conta.membroId ? data.membros.find(m => m.id === conta.membroId) : undefined
  const ativo = !!membro && !conta.exonerado && conta.ativo !== false
  return new Set(NIVEIS_ADV.filter(n => ativo && membro![`adv${n}` as 'adv1' | 'adv2' | 'adv3']))
}

/**
 * Deixa os cargos de ADV da pessoa iguais aos quadradinhos marcados. Lê o estado
 * no momento da execução, então cliques seguidos sempre convergem para o último.
 */
export async function sincronizarCargosAdv(discordId: string | undefined): Promise<void> {
  if (!discordId || !botConfigurado()) return
  const cargos = peekData().cargosAdv ?? {}
  if (!NIVEIS_ADV.some(n => cargos[n])) return
  const desejados = niveisDesejados(discordId)
  if (!desejados) return

  const res = await discordFetch('GET', `/guilds/${guild()}/members/${discordId}`)
  if (res.status === 404) return            // fora do servidor (ex.: acesso externo): nada a aplicar
  const membro = await jsonOuErro<{ roles: string[] }>(res, 'ler membro')
  const tem = new Set(membro.roles)

  for (const n of NIVEIS_ADV) {
    const roleId = cargos[n]
    if (!roleId) continue
    const quer = desejados.has(n)
    if (quer === tem.has(roleId)) continue
    const r = await discordFetch(quer ? 'PUT' : 'DELETE', `/guilds/${guild()}/members/${discordId}/roles/${roleId}`)
    if (!r.ok) throw new Error(`${quer ? 'aplicar' : 'retirar'} ADV ${n}: HTTP ${r.status}`)
  }
}

/** Cargo deixou de ser de advertência (trocado na configuração): tira de quem tinha. */
export async function retirarCargoDeTodos(roleId: string): Promise<void> {
  for (const conta of peekData().contas) {
    if (!conta.discordId) continue
    const r = await discordFetch('DELETE', `/guilds/${guild()}/members/${conta.discordId}/roles/${roleId}`)
    if (!r.ok && r.status !== 404) console.error(`[FAST][DISCORD] retirar cargo antigo de ADV: HTTP ${r.status}`)
  }
}

/** Corrige todo mundo (ao iniciar e ao trocar os cargos na configuração). */
export async function sincronizarTodosCargosAdv(): Promise<void> {
  for (const conta of peekData().contas) {
    if (!conta.discordId) continue
    try { await sincronizarCargosAdv(conta.discordId) } catch (err) {
      console.error('[FAST][DISCORD] sincronizar cargos de ADV:', err instanceof Error ? err.message : err)
    }
  }
}
