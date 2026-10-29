/**
 * Integração com o Discord (sem biblioteca, só REST):
 *  - login por OAuth2 (escopo `identify`);
 *  - bot SEM permissões especiais, usado só para conferir se alguém continua no servidor
 *    (GET /guilds/{servidor}/members/{usuário}).
 *
 * Regra de acesso: só entra quem está no servidor da unidade — com exceção de no máximo DUAS
 * pessoas em DISCORD_DONO_ID (a 1ª entra na conta dona; a 2ª tem conta própria com cargo dev).
 * Quem sai do servidor é exonerado
 * (dados arquivados). Falha da API do Discord NUNCA exonera ninguém — só a resposta
 * "membro desconhecido" (código 10007) conta como saída.
 *
 * Tokens (bot e OAuth do usuário) nunca são guardados, logados nem devolvidos ao cliente.
 */
import { readData, writeData } from './data'
import { exonerarConta, MOTIVO_SAIU_DO_SERVIDOR } from './efetivo'
import { notificarAdmins } from './notificacoes'
import { audit } from './security/audit'
import { Conta, DuData, CargoPermissao } from './types'
import { PROTECTED_OWNER_ID } from './access'
import { fullPermMap } from './permAreas'
import { nomeDaConta } from './registros'

const API = 'https://discord.com/api/v10'
const SNOWFLAKE = /^\d{17,20}$/
const TIMEOUT_MS = 8000

export interface DiscordConfig {
  clientId: string
  clientSecret: string
  guildId: string
  botToken: string
  redirectUri: string
  /** Até 2 IDs: [0] = conta dona (conta 1); [1] = segundo dono (conta própria, cargo dev). */
  donos: string[]
}

/** Máximo de pessoas que entram sem estar no servidor. */
export const MAX_DONOS = 2

/** IDs de DISCORD_DONO_ID (separados por vírgula), sem repetição; só os 2 primeiros valem. */
export function idsDosDonos(valor: string | undefined): string[] {
  return [...new Set((valor ?? '').split(/[\s,;]+/).map(v => v.trim()).filter(v => SNOWFLAKE.test(v)))].slice(0, MAX_DONOS)
}

/** Configuração do login pelo Discord, ou undefined se faltar algo (login fica indisponível). */
export function discordConfig(): DiscordConfig | undefined {
  const e = process.env
  const clientId = e.DISCORD_CLIENT_ID?.trim() ?? ''
  const clientSecret = e.DISCORD_CLIENT_SECRET?.trim() ?? ''
  const guildId = e.DISCORD_GUILD_ID?.trim() ?? ''
  const botToken = e.DISCORD_BOT_TOKEN?.trim() ?? ''
  const publica = e.PUBLIC_URL?.trim().replace(/\/+$/, '')
  const redirectUri = e.DISCORD_REDIRECT_URI?.trim() || (publica ? `${publica}/api/auth/discord/callback` : '')
  if (!SNOWFLAKE.test(clientId) || !SNOWFLAKE.test(guildId) || !clientSecret || !botToken || !/^https?:\/\/[^\s]+$/i.test(redirectUri)) return undefined
  return { clientId, clientSecret, guildId, botToken, redirectUri, donos: idsDosDonos(e.DISCORD_DONO_ID) }
}

export const ehSnowflake = (v: unknown): v is string => typeof v === 'string' && SNOWFLAKE.test(v)

/** Liberado sem estar no servidor: SÓ as (até 2) pessoas de DISCORD_DONO_ID. */
export function acessoLivre(cfg: DiscordConfig, discordId: string): boolean {
  return cfg.donos.includes(discordId)
}

/** É o segundo dono (conta própria com cargo dev)? */
export const ehSegundoDono = (cfg: DiscordConfig, discordId: string) => cfg.donos.length === 2 && cfg.donos[1] === discordId

/** Nome de usuário único (contas antigas podem já usar o mesmo nome do Discord). */
export function usuarioLivre(data: DuData, base: string): string {
  const usado = (u: string) => data.contas.some(c => c.username.toLowerCase() === u.toLowerCase())
  if (!usado(base)) return base
  for (let n = 2; ; n++) { const u = `${base.slice(0, 28)}-${n}`; if (!usado(u)) return u }
}

/** Cargo de dev (cria se ainda não houver). Muta `data`. */
export function cargoDev(data: DuData): CargoPermissao {
  let cargo = data.cargosPermissao.find(c => c.dev === true)
  if (!cargo) {
    const id = Math.max(Number(data.nextCargoPermId) || 1, ...data.cargosPermissao.map(c => c.id + 1))
    cargo = { id, nome: 'Dev', dev: true, admin: true, padrao: false, permissoes: fullPermMap() }
    data.cargosPermissao.push(cargo)
    data.nextCargoPermId = id + 1
  }
  return cargo
}

export function urlAutorizacao(cfg: DiscordConfig, state: string): string {
  const q = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: 'code', scope: 'identify', state, prompt: 'none' })
  return `https://discord.com/oauth2/authorize?${q}`
}

// ── Ritmo das chamadas: nunca estourar o limite da API ──────────────────────────
// O Discord permite ~50 chamadas/s por bot (global) e um limite por rota, informado nos headers
// de cada resposta (x-ratelimit-remaining / reset-after). Aqui: no máximo 40/s e 8 ao mesmo tempo,
// esperando a rota "esvaziar" antes de chamar de novo e pausando tudo num 429 global.
// Respostas de interação (botões/modais) ficam de fora: não contam no limite global e têm 3 s de prazo.
const MAX_POR_SEGUNDO = 40
const MAX_SIMULTANEAS = 8
const MAX_ESPERA_MS = 15_000          // passou disso: desiste (429 local) em vez de prender a requisição
const MAX_ROTAS = 2_000
const janelaChamadas: number[] = []   // horários das chamadas do último segundo
let chamadasEmVoo = 0
let pausaGlobalAte = 0
const limitesPorRota = new Map<string, { restante: number; resetEm: number }>()
const dormir = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Rota para o limite: método + caminho, mantendo só o ID "principal" (servidor/canal/webhook/aplicação). */
function rotaDoLimite(url: string, metodo: string): string {
  const caminho = new URL(url).pathname.replace(/^\/api\/v\d+/, '')
  return `${metodo} ${caminho.replace(/\/\d{17,20}/g, (m, pos: number, s: string) => (/\/(guilds|channels|webhooks|applications)$/.test(s.slice(0, pos)) ? m : '/:id'))}`
}

/** Espera a vez de chamar. false = a espera passaria do teto (a chamada não é feita). */
async function aguardarVez(rota: string): Promise<boolean> {
  const limite = Date.now() + MAX_ESPERA_MS
  for (;;) {
    const agora = Date.now()
    while (janelaChamadas.length && agora - janelaChamadas[0] >= 1000) janelaChamadas.shift()
    const r = limitesPorRota.get(rota)
    const espera = Math.max(
      r && r.restante <= 0 && r.resetEm > agora ? r.resetEm - agora : 0,
      pausaGlobalAte - agora,
      janelaChamadas.length >= MAX_POR_SEGUNDO ? 1000 - (agora - janelaChamadas[0]) : 0,
      chamadasEmVoo >= MAX_SIMULTANEAS ? 25 : 0,
    )
    if (espera <= 0) {
      janelaChamadas.push(agora)
      chamadasEmVoo++
      if (r && r.restante > 0) r.restante--
      return true
    }
    if (agora + espera > limite) return false
    await dormir(espera)
  }
}

/** Guarda o limite que o Discord informou para a rota (e pausa tudo num 429 global). */
function registrarLimite(rota: string, res: Response, retryAfterS?: number): void {
  const h = (n: string) => res.headers?.get?.(n) ?? null
  const restante = h('x-ratelimit-remaining'), reset = h('x-ratelimit-reset-after')
  if (restante !== null && reset !== null && Number.isFinite(Number(restante)) && Number.isFinite(Number(reset))) {
    if (limitesPorRota.size >= MAX_ROTAS && !limitesPorRota.has(rota)) limitesPorRota.delete(limitesPorRota.keys().next().value!)
    limitesPorRota.set(rota, { restante: Number(restante), resetEm: Date.now() + Number(reset) * 1000 })
  }
  if (res.status === 429) {
    const ms = Math.min(Math.max(retryAfterS ?? (Number(h('retry-after')) || 1), 0.2), 60) * 1000
    if (h('x-ratelimit-global') === 'true' || h('x-ratelimit-scope') === 'global') pausaGlobalAte = Date.now() + ms
    else limitesPorRota.set(rota, { restante: 0, resetEm: Date.now() + ms })
  }
}

async function chamar(url: string, init: RequestInit, tentativas = 2): Promise<Response> {
  const daApi = url.startsWith(API) && !url.startsWith(API + '/interactions/')
  const rota = daApi ? rotaDoLimite(url, init.method ?? 'GET') : ''
  if (daApi && !(await aguardarVez(rota))) return new Response(null, { status: 429 })
  let res: Response
  try {
    res = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) })
  } finally {
    if (daApi) chamadasEmVoo--
  }
  if (res.status === 429) {
    const corpo = await res.clone().json().catch(() => ({})) as { retry_after?: number }
    if (daApi) registrarLimite(rota, res, Number(corpo.retry_after) || undefined)
    if (tentativas > 1) {
      if (!daApi) await dormir(Math.min(Math.max(Number(corpo.retry_after) || 1, 0.2), 10) * 1000)
      return chamar(url, init, tentativas - 1)   // da API: aguardarVez já espera o reset
    }
    return res
  }
  if (daApi) registrarLimite(rota, res)
  return res
}

export interface UsuarioDiscord { id: string; username: string; nome: string; avatar?: string }

/** Troca o `code` do OAuth pelo usuário do Discord. O token do usuário é revogado logo em seguida. */
export async function usuarioDoCodigo(cfg: DiscordConfig, code: string): Promise<UsuarioDiscord | undefined> {
  const auth = 'Basic ' + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')
  const tokenRes = await chamar(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: auth },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri }),
  })
  if (!tokenRes.ok) return undefined
  const { access_token: accessToken } = await tokenRes.json() as { access_token?: unknown }
  if (typeof accessToken !== 'string' || !accessToken) return undefined
  try {
    const meRes = await chamar(`${API}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!meRes.ok) return undefined
    const u = await meRes.json() as { id?: unknown; username?: unknown; global_name?: unknown; avatar?: unknown }
    if (!ehSnowflake(u.id) || typeof u.username !== 'string') return undefined
    const username = u.username.slice(0, 32)
    const nome = (typeof u.global_name === 'string' && u.global_name.trim() ? u.global_name.trim() : username).slice(0, 60)
    const avatar = typeof u.avatar === 'string' && /^(a_)?[0-9a-f]{32}$/.test(u.avatar) ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=256` : undefined
    return { id: u.id, username, nome, avatar }
  } finally {
    // Não precisamos mais do token do usuário (sem refresh token guardado)
    void chamar(`${API}/oauth2/token/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: auth },
      body: new URLSearchParams({ token: accessToken, token_type_hint: 'access_token' }),
    }, 1).catch(() => {})
  }
}

export type SituacaoServidor =
  | { status: 'membro'; apelido?: string; avatar?: string; cargos: string[] }
  | { status: 'fora' }
  | { status: 'erro' }

/** Perfil de um membro do servidor (cache em memória; alimentado por toda consulta ao Discord). */
export interface PerfilMembro {
  nome: string          // nome de exibição do Discord (ou usuário)
  usuario: string       // @usuário
  apelido?: string      // apelido no servidor
  avatar?: string       // foto do usuário (CDN)
  cargos: string[]
  entrouEm?: string     // ISO — quando entrou no servidor
  em: number            // quando foi lido
}

/**
 * Cache dos membros (discordId → perfil). O painel de hierarquia, a página do servidor e o
 * perfil usam o mesmo cache: o Discord é consultado no máximo uma vez por minuto.
 */
const cacheMembros = new Map<string, PerfilMembro>()
const MAX_CACHE_MEMBROS = 50_000
const HASH_IMAGEM = /^(a_)?[0-9a-f]{32}$/
const listaCargos = (v: unknown): string[] => Array.isArray(v) ? v.filter(ehSnowflake) : []

type MembroApi = { user?: { id?: unknown; username?: unknown; global_name?: unknown; avatar?: unknown; bot?: unknown }; nick?: unknown; roles?: unknown; joined_at?: unknown }
function lembrarMembro(discordId: string, m: MembroApi | null): PerfilMembro | undefined {
  cacheMembros.delete(discordId)
  if (!m) return undefined
  const u = m.user ?? {}
  const usuario = typeof u.username === 'string' ? u.username.slice(0, 32) : ''
  const perfil: PerfilMembro = {
    nome: (typeof u.global_name === 'string' && u.global_name.trim() ? u.global_name.trim() : usuario).slice(0, 60),
    usuario,
    ...(typeof m.nick === 'string' && m.nick.trim() ? { apelido: m.nick.trim().slice(0, 60) } : {}),
    ...(typeof u.avatar === 'string' && HASH_IMAGEM.test(u.avatar) ? { avatar: `https://cdn.discordapp.com/avatars/${discordId}/${u.avatar}.png?size=64` } : {}),
    cargos: listaCargos(m.roles),
    ...(typeof m.joined_at === 'string' && !Number.isNaN(Date.parse(m.joined_at)) ? { entrouEm: new Date(m.joined_at).toISOString() } : {}),
    em: Date.now(),
  }
  cacheMembros.set(discordId, perfil)
  if (cacheMembros.size > MAX_CACHE_MEMBROS) cacheMembros.delete(cacheMembros.keys().next().value!)
  return perfil
}

/** Perfil em cache (se ainda estiver fresco). */
export function perfilEmCache(discordId: string, maxIdadeMs = 60_000): PerfilMembro | undefined {
  const p = cacheMembros.get(discordId)
  return p && Date.now() - p.em < maxIdadeMs ? p : undefined
}

/** Consultas em andamento por pessoa: várias abas/pedidos ao mesmo tempo viram UMA chamada ao Discord. */
const consultandoMembro = new Map<string, Promise<SituacaoServidor>>()

/** A pessoa está no servidor da unidade? Consulta pelo bot. Qualquer falha = 'erro' (nunca 'fora'). */
export function situacaoNoServidor(cfg: DiscordConfig, discordId: string): Promise<SituacaoServidor> {
  if (!ehSnowflake(discordId)) return Promise.resolve({ status: 'erro' })
  const andamento = consultandoMembro.get(discordId)
  if (andamento) return andamento
  const p = consultarMembro(cfg, discordId).finally(() => consultandoMembro.delete(discordId))
  consultandoMembro.set(discordId, p)
  return p
}

async function consultarMembro(cfg: DiscordConfig, discordId: string): Promise<SituacaoServidor> {
  try {
    const res = await chamar(`${API}/guilds/${cfg.guildId}/members/${discordId}`, { headers: { Authorization: `Bot ${cfg.botToken}` } })
    if (res.ok) {
      const m = await res.json() as MembroApi & { avatar?: unknown }
      const perfil = lembrarMembro(discordId, m)!
      const avatar = typeof m.avatar === 'string' && HASH_IMAGEM.test(m.avatar)
        ? `https://cdn.discordapp.com/guilds/${cfg.guildId}/users/${discordId}/avatars/${m.avatar}.png?size=256` : undefined
      return { status: 'membro', apelido: perfil.apelido, avatar, cargos: perfil.cargos }
    }
    if (res.status === 404) {
      const corpo = await res.json().catch(() => ({})) as { code?: unknown }
      // 10007 = Unknown Member (não está no servidor). 10004 (servidor) / 10013 (usuário) etc. = configuração errada.
      if (corpo.code === 10007) { lembrarMembro(discordId, null); return { status: 'fora' } }
    }
    return { status: 'erro' }
  } catch {
    return { status: 'erro' }
  }
}

// ── Dados do servidor: tudo o que o bot consegue ler (cache de 1 min) ──────────────
// O bot lê o servidor e publica/edita SÓ a mensagem do painel de hierarquia. Nada além disso.

const comBot = (cfg: DiscordConfig): RequestInit => ({ headers: { Authorization: `Bot ${cfg.botToken}` } })
const CACHE_SERVIDOR_MS = 60_000
const CDN = 'https://cdn.discordapp.com'

/** Tipos de canal do Discord → nome usado no site. */
const TIPOS_CANAL: Record<number, string> = { 0: 'texto', 2: 'voz', 4: 'categoria', 5: 'anuncios', 13: 'palco', 15: 'forum', 16: 'midia' }

export interface CargoServidor {
  id: string; nome: string; cor: number; posicao: number
  icone?: string; emoji?: string; separado: boolean; mencionavel: boolean; integracao: boolean
  /** Tem permissão de moderação/administração (não pode ser dado pela setagem) */
  perigoso: boolean
}

// Administrador, expulsar, banir, gerenciar canais/servidor/cargos/webhooks/apelidos, moderar membros
const PERMISSOES_PERIGOSAS = [0x8n, 0x2n, 0x4n, 0x10n, 0x20n, 0x10000000n, 0x20000000n, 0x8000000n, 0x10000000000n]
function cargoPerigoso(permissoes: unknown): boolean {
  if (typeof permissoes !== 'string' || !/^\d{1,25}$/.test(permissoes)) return true   // sem saber = trata como perigoso
  const p = BigInt(permissoes)
  return PERMISSOES_PERIGOSAS.some(bit => (p & bit) !== 0n)
}
export interface CanalServidor { id: string; nome: string; tipo: string; posicao: number; categoriaId?: string; topico?: string; nsfw: boolean }
export interface EmojiServidor { id: string; nome: string; animado: boolean; disponivel: boolean; url: string }

export interface InfoServidor {
  nome: string
  descricao?: string
  membros?: number           // total aproximado
  online?: number            // presentes aproximado
  impulsos: number
  nivelImpulso: number
  iconeHash?: string         // fica no servidor (a URL leva o ID do servidor)
  bannerHash?: string
  botNome: string
  botAvatar?: string
  /** Cargos para o painel (sem @everyone e sem cargos de integração/bots) */
  cargos: { id: string; nome: string; cor: number; posicao: number }[]
  /** Canais onde o painel pode ser publicado (texto e anúncios) */
  canais: { id: string; nome: string }[]
  todosCargos: CargoServidor[]
  todosCanais: CanalServidor[]
  emojis: EmojiServidor[]
  lidoEm: string
}
let cacheServidor: { valor: InfoServidor; em: number } | undefined
let buscandoServidor: Promise<InfoServidor | undefined> | undefined

/**
 * Tudo do servidor: informações, cargos, canais (todos os tipos), emojis e o bot.
 * Cache de 1 min e uma única consulta em andamento por vez (várias pessoas ao mesmo tempo = 1 consulta).
 */
export function infoServidor(cfg: DiscordConfig, forcar = false): Promise<InfoServidor | undefined> {
  if (!forcar && cacheServidor && Date.now() - cacheServidor.em < CACHE_SERVIDOR_MS) return Promise.resolve(cacheServidor.valor)
  buscandoServidor ??= (async () => {
    try {
      const [g, r, c, e, b] = await Promise.all([
        chamar(`${API}/guilds/${cfg.guildId}?with_counts=true`, comBot(cfg)),
        chamar(`${API}/guilds/${cfg.guildId}/roles`, comBot(cfg)),
        chamar(`${API}/guilds/${cfg.guildId}/channels`, comBot(cfg)),
        chamar(`${API}/guilds/${cfg.guildId}/emojis`, comBot(cfg)),
        chamar(`${API}/users/@me`, comBot(cfg)),
      ])
      if (!g.ok || !r.ok || !c.ok || !b.ok) return cacheServidor?.valor
      const gj = await g.json() as { name?: unknown; description?: unknown; icon?: unknown; banner?: unknown; approximate_member_count?: unknown
        approximate_presence_count?: unknown; premium_tier?: unknown; premium_subscription_count?: unknown }
      const rj = await r.json() as { id?: unknown; name?: unknown; color?: unknown; position?: unknown; managed?: unknown; icon?: unknown
        unicode_emoji?: unknown; hoist?: unknown; mentionable?: unknown; permissions?: unknown }[]
      const cj = await c.json() as { id?: unknown; name?: unknown; type?: unknown; position?: unknown; parent_id?: unknown; topic?: unknown; nsfw?: unknown }[]
      const ej = e.ok ? await e.json() as { id?: unknown; name?: unknown; animated?: unknown; available?: unknown }[] : []
      const bj = await b.json() as { id?: unknown; username?: unknown; avatar?: unknown }
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

      const todosCargos: CargoServidor[] = rj.filter(x => ehSnowflake(x.id) && x.id !== cfg.guildId)
        .map(x => ({
          id: x.id as string, nome: String(x.name ?? '').slice(0, 100), cor: Number(x.color) || 0, posicao: Number(x.position) || 0,
          ...(typeof x.icon === 'string' && HASH_IMAGEM.test(x.icon) ? { icone: `${CDN}/role-icons/${x.id}/${x.icon}.png?size=64` } : {}),
          ...(typeof x.unicode_emoji === 'string' && x.unicode_emoji ? { emoji: x.unicode_emoji.slice(0, 16) } : {}),
          separado: x.hoist === true, mencionavel: x.mentionable === true, integracao: x.managed === true, perigoso: cargoPerigoso(x.permissions),
        }))
        .sort((a, z) => z.posicao - a.posicao)
      const todosCanais: CanalServidor[] = cj.filter(x => ehSnowflake(x.id) && typeof x.type === 'number' && TIPOS_CANAL[x.type])
        .map(x => ({
          id: x.id as string, nome: String(x.name ?? '').slice(0, 100), tipo: TIPOS_CANAL[x.type as number], posicao: Number(x.position) || 0,
          ...(ehSnowflake(x.parent_id) ? { categoriaId: x.parent_id } : {}),
          ...(typeof x.topic === 'string' && x.topic.trim() ? { topico: x.topic.trim().slice(0, 300) } : {}),
          nsfw: x.nsfw === true,
        }))
        .sort((a, z) => a.posicao - z.posicao)
      const valor: InfoServidor = {
        nome: String(gj.name ?? '').slice(0, 100),
        ...(typeof gj.description === 'string' && gj.description.trim() ? { descricao: gj.description.trim().slice(0, 300) } : {}),
        ...(num(gj.approximate_member_count) !== undefined ? { membros: num(gj.approximate_member_count) } : {}),
        ...(num(gj.approximate_presence_count) !== undefined ? { online: num(gj.approximate_presence_count) } : {}),
        impulsos: num(gj.premium_subscription_count) ?? 0,
        nivelImpulso: num(gj.premium_tier) ?? 0,
        ...(typeof gj.icon === 'string' && HASH_IMAGEM.test(gj.icon) ? { iconeHash: gj.icon } : {}),
        ...(typeof gj.banner === 'string' && HASH_IMAGEM.test(gj.banner) ? { bannerHash: gj.banner } : {}),
        botNome: String(bj.username ?? '').slice(0, 80),
        botAvatar: ehSnowflake(bj.id) && typeof bj.avatar === 'string' && HASH_IMAGEM.test(bj.avatar)
          ? `${CDN}/avatars/${bj.id}/${bj.avatar}.png?size=128` : undefined,
        cargos: todosCargos.filter(x => !x.integracao).map(({ id, nome, cor, posicao }) => ({ id, nome, cor, posicao })),
        canais: todosCanais.filter(x => x.tipo === 'texto' || x.tipo === 'anuncios').map(({ id, nome }) => ({ id, nome })),
        todosCargos,
        todosCanais,
        emojis: ej.filter(x => ehSnowflake(x.id) && typeof x.name === 'string')
          .map(x => ({ id: x.id as string, nome: String(x.name).slice(0, 32), animado: x.animated === true, disponivel: x.available !== false,
            url: `${CDN}/emojis/${x.id}.${x.animated === true ? 'gif' : 'png'}?size=64` })),
        lidoEm: new Date().toISOString(),
      }
      cacheServidor = { valor, em: Date.now() }
      return valor
    } catch {
      return cacheServidor?.valor
    } finally {
      buscandoServidor = undefined
    }
  })()
  return buscandoServidor
}

/** Ícone/banner do servidor (o site recebe pelo backend: a URL do CDN leva o ID do servidor). Cache de 10 min. */
const cacheImagens = new Map<string, { dados: Buffer; mime: string; em: number }>()
export async function imagemDoServidor(cfg: DiscordConfig, tipo: 'icone' | 'banner'): Promise<{ dados: Buffer; mime: string } | undefined> {
  const info = await infoServidor(cfg)
  const hash = tipo === 'icone' ? info?.iconeHash : info?.bannerHash
  if (!hash) return undefined
  const chave = `${tipo}:${hash}`
  const c = cacheImagens.get(chave)
  if (c && Date.now() - c.em < 10 * 60_000) return c
  try {
    const res = await chamar(`${CDN}/${tipo === 'icone' ? 'icons' : 'banners'}/${cfg.guildId}/${hash}.png?size=${tipo === 'icone' ? 256 : 1024}`, {})
    const mime = res.headers.get('content-type') ?? ''
    if (!res.ok || !/^image\/(png|jpeg|webp|gif)$/.test(mime)) return c
    const dados = Buffer.from(await res.arrayBuffer())
    if (dados.length > 5 * 1024 * 1024) return c
    for (const k of cacheImagens.keys()) if (k.startsWith(`${tipo}:`)) cacheImagens.delete(k)
    const novo = { dados, mime, em: Date.now() }
    cacheImagens.set(chave, novo)
    return novo
  } catch {
    return c
  }
}

/** Sem "Server Members Intent" o Discord recusa listar membros: lembra disso por 10 min. */
let listaBloqueadaAte = 0
export const listagemCompletaDisponivel = () => Date.now() >= listaBloqueadaAte

let listaCompletaEm = 0
/** Descarta o cache de membros e do servidor (próxima consulta relê tudo do Discord). */
export function esquecerCacheDiscord(): void {
  listaCompletaEm = 0
  cacheServidor = undefined
  for (const p of cacheMembros.values()) p.em = 0
}
let listando: Promise<boolean> | undefined
/** Lista todos os membros (com a intent ligada) e guarda no cache. No máximo 1 vez por minuto. */
function listarTodos(cfg: DiscordConfig, maxIdadeMs: number): Promise<boolean> {
  if (Date.now() - listaCompletaEm < maxIdadeMs) return Promise.resolve(true)
  listando ??= (async () => {
    const inicio = Date.now()   // idade conta do início da leitura (a rodada seguinte sempre relê)
    try {
      let depois = '0'
      const vistos = new Set<string>()
      for (let pagina = 0; pagina < 20; pagina++) {   // até 20 mil membros
        const res = await chamar(`${API}/guilds/${cfg.guildId}/members?limit=1000&after=${depois}`, comBot(cfg)).catch(() => undefined)
        if (!res || (!res.ok && res.status !== 403)) return false
        if (res.status === 403) { listaBloqueadaAte = Date.now() + 10 * 60_000; return false }
        const lote = await res.json() as MembroApi[]
        for (const m of lote) {
          if (!ehSnowflake(m.user?.id) || m.user?.bot === true) continue
          vistos.add(m.user.id)
          lembrarMembro(m.user.id, m)
        }
        const ultimo = lote[lote.length - 1]?.user?.id
        if (lote.length < 1000 || !ehSnowflake(ultimo)) break
        depois = ultimo
      }
      // Quem não veio na lista saiu do servidor
      for (const id of [...cacheMembros.keys()]) if (!vistos.has(id)) cacheMembros.delete(id)
      listaCompletaEm = inicio
      return true
    } finally {
      listando = undefined
    }
  })()
  return listando
}

/**
 * Membros do servidor (discordId → perfil). Com a intent ligada lista todo mundo; sem ela,
 * consulta só quem tem conta no site (`idsConhecidos`), aproveitando o cache.
 * Devolve undefined se o Discord falhar.
 */
export async function membrosDoServidor(cfg: DiscordConfig, idsConhecidos: string[], maxIdadeMs = 60_000): Promise<Map<string, PerfilMembro> | undefined> {
  if (listagemCompletaDisponivel()) {
    if (await listarTodos(cfg, maxIdadeMs)) return new Map(cacheMembros)
    if (listagemCompletaDisponivel()) return undefined   // falha do Discord (não é falta de intent)
  }
  const resultado = new Map<string, PerfilMembro>()
  for (const id of new Set(idsConhecidos.filter(ehSnowflake))) {
    const p = perfilEmCache(id, maxIdadeMs)
    if (p) { resultado.set(id, p); continue }
    const s = await situacaoNoServidor(cfg, id)
    if (s.status === 'erro') return undefined
    const novo = s.status === 'membro' ? cacheMembros.get(id) : undefined
    if (novo) resultado.set(id, novo)
    await new Promise(r => setTimeout(r, 150))
  }
  return resultado
}

/** Só os cargos de cada membro (usado pelo painel de hierarquia). */
export async function membrosComCargos(cfg: DiscordConfig, idsConhecidos: string[], maxIdadeMs = 60_000): Promise<Map<string, string[]> | undefined> {
  const membros = await membrosDoServidor(cfg, idsConhecidos, maxIdadeMs)
  return membros && new Map([...membros].map(([id, p]) => [id, p.cargos]))
}

export interface EmbedPainel {
  title: string
  description: string
  color: number
  thumbnail?: { url: string }
  footer: { text: string; icon_url?: string }
  /** Painel V2 organizado: um bloco por cargo (título + membros) e o resumo do topo. */
  blocos?: { titulo: string; membros: string[]; vago: boolean; roleId?: string }[]
  resumo?: string
}

/** Imagem enviada por upload, anexada à mensagem (os componentes a usam como attachment://nome). */
export interface AnexoPainel { nome: string; mime: string; dados: Buffer }

/** Conta ligada a este Discord: o ID do dono (.env) sempre cai na conta 1. */
export function contaDoDiscord(data: DuData, cfg: DiscordConfig, discordId: string): Conta | undefined {
  if (discordId === cfg.donos[0]) return data.contas.find(c => c.id === PROTECTED_OWNER_ID)

  return data.contas.find(c => c.id !== PROTECTED_OWNER_ID && c.discordId === discordId)
}

/**
 * Exonera quem saiu do servidor. Muta `data` (o chamador grava). Retorna true se exonerou.
 * Dono e lista de acesso livre nunca passam por aqui.
 */
export function exonerarPorSaida(data: DuData, cfg: DiscordConfig, conta: Conta): boolean {
  if (conta.id === PROTECTED_OWNER_ID || conta.exonerado || !conta.discordId || acessoLivre(cfg, conta.discordId)) return false
  exonerarConta(data, conta, 'Sistema (saída do servidor do Discord)', MOTIVO_SAIU_DO_SERVIDOR)
  const nome = nomeDaConta(data, conta.id)
  notificarAdmins(data, undefined, 'exoneracao', 'Membro saiu do servidor',
    `${nome} saiu do servidor do Discord e foi exonerado automaticamente.`, '/membros')
  audit('DISCORD_MEMBER_LEFT', undefined, `Conta #${conta.id} exonerada (saiu do servidor)`)
  return true
}

let verificando = false

/**
 * Rotina periódica: confere no Discord cada conta ligada (ativa, não exonerada, fora da lista
 * livre) e exonera quem saiu do servidor. Pedidos de acesso de quem saiu são descartados.
 * Uma requisição por vez (respeita o limite da API).
 */
export async function verificarSaidasDoServidor(): Promise<void> {
  const cfg = discordConfig()
  if (!cfg || verificando) return
  verificando = true
  try {
    const inicial = readData()
    const alvos = inicial.contas
      .filter(c => c.id !== PROTECTED_OWNER_ID && c.discordId && !c.exonerado && !acessoLivre(cfg, c.discordId))
      .map(c => ({ id: c.id, discordId: c.discordId! }))
    const pedidos = inicial.solicitacoesAcesso
      .filter(s => s.discordId && !acessoLivre(cfg, s.discordId))
      .map(s => ({ id: s.id, discordId: s.discordId! }))

    const sairam: number[] = []
    const atualizar = new Map<number, { apelido?: string; avatar?: string }>()
    for (const a of alvos) {
      const s = await situacaoNoServidor(cfg, a.discordId)
      if (s.status === 'fora') sairam.push(a.id)
      else if (s.status === 'membro') atualizar.set(a.id, s)
      await new Promise(r => setTimeout(r, 250))
    }
    const pedidosFora: number[] = []
    for (const p of pedidos) {
      if ((await situacaoNoServidor(cfg, p.discordId)).status === 'fora') pedidosFora.push(p.id)
      await new Promise(r => setTimeout(r, 250))
    }

    // Grava de uma vez, sobre os dados atuais (podem ter mudado durante as consultas)
    const data = readData()
    let mudou = false
    for (const id of sairam) {
      const conta = data.contas.find(c => c.id === id)
      if (conta && exonerarPorSaida(data, cfg, conta)) mudou = true
    }
    for (const [id, s] of atualizar) {
      const conta = data.contas.find(c => c.id === id)
      if (conta && atualizarDadosDoServidor(conta, s)) mudou = true
    }
    // Pedido de quem saiu do servidor some — junto com o canal temporário dele (ID guardado no pedido pela setagem)
    const canaisDosPedidosFora: string[] = []
    if (pedidosFora.length) {
      const antes = data.solicitacoesAcesso.length
      for (const s of data.solicitacoesAcesso) if (pedidosFora.includes(s.id) && s.setagem?.canalTemp) canaisDosPedidosFora.push(s.setagem.canalTemp)
      data.solicitacoesAcesso = data.solicitacoesAcesso.filter(s => !pedidosFora.includes(s.id))
      if (data.solicitacoesAcesso.length !== antes) mudou = true
    }
    if (mudou) writeData(data)
    for (const canalDoPedido of canaisDosPedidosFora) await apagarCanalTemporario(cfg, canalDoPedido)
  } finally {
    verificando = false
  }
}

/** Atualiza apelido/foto do servidor na conta. Retorna true se mudou algo. */
export function atualizarDadosDoServidor(conta: Conta, s: { apelido?: string; avatar?: string }): boolean {
  let mudou = false
  if (s.apelido && s.apelido !== conta.nomeServidor) { conta.nomeServidor = s.apelido; mudou = true }
  if (s.avatar && s.avatar !== conta.avatarServidor) {
    conta.avatarServidor = s.avatar
    conta.avatarServidorEm = new Date().toISOString()
    mudou = true
  }
  return mudou
}

// ── Interações (botão e modal da setagem) ──────────────────────────────────────────
// O bot recebe cliques pelo Gateway (conexão em tempo real, SEM intents: interações chegam
// mesmo assim). Só uma instância do site deve ficar conectada por bot (ver DISCORD_INTERACOES).

export interface Interacao {
  id: string
  token: string
  tipo: number                    // 3 = botão/menu, 5 = envio de modal
  guildId?: string
  usuario: { id: string; username: string; nome: string; avatar?: string }
  customId: string
  campos: Record<string, string>  // valores do modal (texto ou primeira opção do menu)
  cargos: string[]                // cargos de quem clicou (vem do Discord, não do navegador)
  administrador: boolean          // quem clicou tem "Administrador" no servidor
}

/** Lê os campos de um modal (componentes novos "Label" e linhas antigas). */
function camposDoModal(componentes: unknown): Record<string, string> {
  const campos: Record<string, string> = {}
  const visitar = (c: unknown, nivel: number) => {
    if (!c || typeof c !== 'object' || nivel > 4) return
    const o = c as { custom_id?: unknown; value?: unknown; values?: unknown; component?: unknown; components?: unknown }
    if (typeof o.custom_id === 'string' && o.custom_id.length <= 100) {
      if (typeof o.value === 'string') campos[o.custom_id] = o.value.slice(0, 200)
      else if (Array.isArray(o.values) && typeof o.values[0] === 'string') campos[o.custom_id] = o.values[0].slice(0, 100)
    }
    if (o.component) visitar(o.component, nivel + 1)
    if (Array.isArray(o.components)) for (const x of o.components.slice(0, 10)) visitar(x, nivel + 1)
  }
  if (Array.isArray(componentes)) for (const c of componentes.slice(0, 10)) visitar(c, 0)
  return campos
}

/** Converte o evento cru do Gateway numa interação validada (ou undefined). */
export function lerInteracao(d: unknown): Interacao | undefined {
  const i = d as { id?: unknown; token?: unknown; type?: unknown; guild_id?: unknown; member?: { user?: Record<string, unknown>; roles?: unknown; permissions?: unknown }; user?: Record<string, unknown>
    data?: { custom_id?: unknown; components?: unknown } }
  const u = i.member?.user ?? i.user
  if (!ehSnowflake(i.id) || typeof i.token !== 'string' || !/^[\w.-]{20,500}$/.test(i.token) || (i.type !== 3 && i.type !== 5)) return undefined
  if (!u || !ehSnowflake(u.id) || typeof i.data?.custom_id !== 'string') return undefined
  const usuario = typeof u.username === 'string' ? u.username.slice(0, 32) : ''
  return {
    id: i.id, token: i.token, tipo: i.type, ...(ehSnowflake(i.guild_id) ? { guildId: i.guild_id } : {}),
    usuario: {
      id: u.id, username: usuario,
      nome: (typeof u.global_name === 'string' && u.global_name.trim() ? u.global_name.trim() : usuario).slice(0, 60),
      ...(typeof u.avatar === 'string' && HASH_IMAGEM.test(u.avatar) ? { avatar: `${CDN}/avatars/${u.id}/${u.avatar}.png?size=256` } : {}),
    },
    customId: i.data.custom_id.slice(0, 100),
    campos: i.type === 5 ? camposDoModal(i.data.components) : {},
    cargos: listaCargos(i.member?.roles),
    administrador: typeof i.member?.permissions === 'string' && /^\d{1,25}$/.test(i.member.permissions) && (BigInt(i.member.permissions) & 0x8n) !== 0n,
  }
}

/** Responde à interação (abrir modal, mensagem só para a pessoa, "pensando…"). */
export async function responderInteracao(interacao: Pick<Interacao, 'id' | 'token'>, resposta: unknown): Promise<boolean> {
  try {
    const res = await chamar(`${API}/interactions/${interacao.id}/${interacao.token}/callback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(resposta),
    }, 1)
    return res.ok
  } catch { return false }
}

/** Troca o texto da resposta "pensando…" (só a pessoa vê). */
export async function editarResposta(cfg: DiscordConfig, token: string, conteudo: string): Promise<void> {
  try {
    await chamar(`${API}/webhooks/${cfg.clientId}/${token}/messages/@original`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: conteudo.slice(0, 1900), allowed_mentions: { parse: [] } }),
    })
  } catch { /* a pessoa vê "pensando…"; o pedido já foi registrado */ }
}

export type ResultadoMembro = 'ok' | 'sem_permissao' | 'erro'
const resultadoMembro = (res: Response): ResultadoMembro => (res.ok ? 'ok' : res.status === 403 ? 'sem_permissao' : 'erro')

/** Troca o apelido no servidor (precisa de "Gerenciar apelidos" e cargo do bot acima do da pessoa). */
export async function alterarApelido(cfg: DiscordConfig, discordId: string, apelido: string): Promise<ResultadoMembro> {
  if (!ehSnowflake(discordId)) return 'erro'
  try {
    const res = await chamar(`${API}/guilds/${cfg.guildId}/members/${discordId}`, {
      method: 'PATCH', headers: { Authorization: `Bot ${cfg.botToken}`, 'Content-Type': 'application/json', 'X-Audit-Log-Reason': 'Setagem' },
      body: JSON.stringify({ nick: apelido.slice(0, 32) }),
    })
    return resultadoMembro(res)
  } catch { return 'erro' }
}

/** Dá um cargo do servidor (precisa de "Gerenciar cargos" e cargo do bot acima dele). */
export async function darCargo(cfg: DiscordConfig, discordId: string, roleId: string): Promise<ResultadoMembro> {
  if (!ehSnowflake(discordId) || !ehSnowflake(roleId)) return 'erro'
  try {
    const res = await chamar(`${API}/guilds/${cfg.guildId}/members/${discordId}/roles/${roleId}`, {
      method: 'PUT', headers: { Authorization: `Bot ${cfg.botToken}`, 'X-Audit-Log-Reason': 'Setagem aprovada' },
    })
    if (res.ok) lembrarMembro(discordId, null)   // cargos mudaram: próxima consulta relê
    return resultadoMembro(res)
  } catch { return 'erro' }
}

/** Tira um cargo do membro (patente/setor/advertência antigos). Só cargos que o sistema configurou. */
export async function tirarCargo(cfg: DiscordConfig, discordId: string, roleId: string, motivo = 'Painel DU'): Promise<ResultadoMembro> {
  if (!ehSnowflake(discordId) || !ehSnowflake(roleId)) return 'erro'
  try {
    const res = await chamar(`${API}/guilds/${cfg.guildId}/members/${discordId}/roles/${roleId}`, {
      method: 'DELETE', headers: { Authorization: `Bot ${cfg.botToken}`, 'X-Audit-Log-Reason': encodeURIComponent(motivo.slice(0, 80)) },
    })
    if (res.ok || res.status === 404) lembrarMembro(discordId, null)
    return res.status === 404 ? 'ok' : resultadoMembro(res)
  } catch { return 'erro' }
}

/**
 * Cria um cargo SEM NENHUMA permissão (permissions "0", não mencionável, não separado na lista).
 * Usado só para os cargos de advertência que faltarem no servidor. Devolve o ID ou undefined.
 */
export async function criarCargo(cfg: DiscordConfig, nome: string, cor: number): Promise<string | undefined> {
  try {
    const res = await chamar(`${API}/guilds/${cfg.guildId}/roles`, {
      method: 'POST', headers: { Authorization: `Bot ${cfg.botToken}`, 'Content-Type': 'application/json', 'X-Audit-Log-Reason': 'Painel DU: cargos de advertencia' },
      body: JSON.stringify({ name: nome.slice(0, 100), permissions: '0', color: cor & 0xffffff, hoist: false, mentionable: false }),
    })
    if (!res.ok) return undefined
    const r = await res.json() as { id?: unknown }
    if (!ehSnowflake(r.id)) return undefined
    esquecerCacheDiscord()   // lista de cargos mudou
    return r.id
  } catch { return undefined }
}

// ── Gateway: conexão em tempo real só para receber interações ──────────────────────
const GATEWAY = 'wss://gateway.discord.gg/?v=10&encoding=json'
const FECHAMENTOS_FATAIS = new Set([4004, 4010, 4011, 4012, 4013, 4014])   // token inválido, intents etc.
interface EstadoGateway { ws?: WebSocket; batida?: NodeJS.Timeout; seq: number | null; ack: boolean; tentativas: number; parado: boolean }
let gateway: EstadoGateway | undefined
export const gatewayConectado = () => Boolean(gateway?.ws && gateway.ws.readyState === 1)

/**
 * Conecta o bot ao Gateway e repassa só INTERACTION_CREATE do servidor da unidade.
 * Reconecta sozinho (espera crescente); para de vez se o Discord recusar o token.
 */
export function iniciarGateway(cfg: DiscordConfig, aoInteragir: (i: Interacao) => void): void {
  if (gateway || typeof WebSocket === 'undefined') return
  const estado: EstadoGateway = { seq: null, ack: true, tentativas: 0, parado: false }
  gateway = estado
  const enviar = (op: number, d: unknown) => { try { estado.ws?.send(JSON.stringify({ op, d })) } catch { /* reconecta no close */ } }
  const conectar = () => {
    if (estado.parado) return
    const ws = new WebSocket(GATEWAY)
    estado.ws = ws
    ws.onmessage = ev => {
      let p: { op?: number; d?: unknown; s?: number | null; t?: string }
      try { p = JSON.parse(String(ev.data)) } catch { return }
      if (typeof p.s === 'number') estado.seq = p.s
      if (p.op === 10) {
        const intervalo = Math.max(1000, Number((p.d as { heartbeat_interval?: unknown })?.heartbeat_interval) || 41_250)
        clearInterval(estado.batida)
        estado.ack = true
        estado.batida = setInterval(() => {
          if (!estado.ack) { ws.close(4000); return }   // sem resposta: conexão morta
          estado.ack = false
          enviar(1, estado.seq)
        }, intervalo)
        estado.batida.unref()
        enviar(2, { token: cfg.botToken, intents: 0, properties: { os: 'linux', browser: 'du-painel', device: 'du-painel' } })
      } else if (p.op === 11) estado.ack = true
      else if (p.op === 1) enviar(1, estado.seq)
      else if (p.op === 7 || p.op === 9) ws.close(4000)
      else if (p.op === 0 && p.t === 'READY') estado.tentativas = 0
      else if (p.op === 0 && p.t === 'INTERACTION_CREATE') {
        const i = lerInteracao(p.d)
        if (i && i.guildId === cfg.guildId) { try { aoInteragir(i) } catch { /* nunca derruba a conexão */ } }
      }
    }
    ws.onclose = ev => {
      clearInterval(estado.batida)
      estado.ws = undefined
      if (FECHAMENTOS_FATAIS.has(ev.code)) {
        estado.parado = true
        console.error(`[DU] Gateway do Discord recusou a conexão (código ${ev.code}). Botões da setagem desativados.`)
        return
      }
      const espera = Math.min(60_000, 1000 * 2 ** Math.min(estado.tentativas++, 6))
      setTimeout(conectar, espera).unref()
    }
    ws.onerror = () => { /* o onclose cuida da reconexão */ }
  }
  conectar()
}

// ── Mensagens em Componentes V2, canal temporário e mensagem no privado (setagem) ──
/** Flag IS_COMPONENTS_V2: a mensagem é só componentes (sem content/embeds). */
export const FLAG_V2 = 1 << 15

const corpoV2 = (componentes: unknown[], anexos: AnexoPainel[]) => {
  const corpo = new FormData()
  corpo.append('payload_json', JSON.stringify({ flags: FLAG_V2, components: componentes, allowed_mentions: { parse: [] },
    attachments: anexos.map((a, i) => ({ id: i, filename: a.nome })) }))
  anexos.forEach((a, i) => corpo.append(`files[${i}]`, new Blob([new Uint8Array(a.dados)], { type: a.mime }), a.nome))
  return corpo
}

/** Apaga uma mensagem do PRÓPRIO bot (painel antigo trocado por um novo). */
export async function apagarMensagem(cfg: DiscordConfig, canalId: string, mensagemId: string): Promise<void> {
  if (!ehSnowflake(canalId) || !ehSnowflake(mensagemId)) return
  try { await chamar(`${API}/channels/${canalId}/messages/${mensagemId}`, { method: 'DELETE', headers: { Authorization: `Bot ${cfg.botToken}` } }, 1) } catch { /* já não existe */ }
}

/**
 * Publica (ou edita) uma mensagem V2 do bot. Se a mensagem antiga não puder virar V2 (era um
 * painel no formato antigo), publica uma nova e apaga a antiga. 'sem_acesso' = bot sem permissão.
 */
export async function publicarV2(cfg: DiscordConfig, canalId: string, mensagemId: string | undefined, componentes: unknown[], anexos: AnexoPainel[] = []): Promise<string | 'sem_acesso' | undefined> {
  if (!ehSnowflake(canalId)) return 'sem_acesso'
  const init = (method: string): RequestInit => ({ method, headers: { Authorization: `Bot ${cfg.botToken}` }, body: corpoV2(componentes, anexos) })
  try {
    if (mensagemId && ehSnowflake(mensagemId)) {
      const res = await chamar(`${API}/channels/${canalId}/messages/${mensagemId}`, init('PATCH'))
      if (res.ok) return mensagemId
      if (res.status === 403) return 'sem_acesso'
      if (res.status !== 404 && res.status !== 400) return undefined
    }
    const res = await chamar(`${API}/channels/${canalId}/messages`, init('POST'))
    if (res.status === 403 || res.status === 404) return 'sem_acesso'
    if (!res.ok) return undefined
    const m = await res.json() as { id?: unknown }
    if (!ehSnowflake(m.id)) return undefined
    if (mensagemId && mensagemId !== m.id) await apagarMensagem(cfg, canalId, mensagemId)   // painel antigo (formato velho)
    return m.id
  } catch {
    return undefined
  }
}

const VER_CANAL = 0x400n, ENVIAR = 0x800n, LINKS = 0x4000n, ANEXAR = 0x8000n, HISTORICO = 0x10000n

/**
 * Canal temporário de um pedido: privado (só o bot e os cargos aprovadores veem), na categoria
 * configurada. Devolve o ID ou undefined (sem permissão / categoria inválida).
 */
export async function criarCanalTemporario(cfg: DiscordConfig, nome: string, categoriaId: string, aprovadores: string[]): Promise<string | undefined> {
  if (!ehSnowflake(categoriaId)) return undefined
  const permissao = (v: bigint) => v.toString()
  const corpo = {
    name: nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 90) || 'set',
    type: 0, parent_id: categoriaId,
    permission_overwrites: [
      { id: cfg.guildId, type: 0, deny: permissao(VER_CANAL), allow: '0' },                                     // @everyone não vê
      { id: cfg.clientId, type: 1, allow: permissao(VER_CANAL | ENVIAR | LINKS | ANEXAR | HISTORICO), deny: '0' },  // o bot
      ...aprovadores.filter(ehSnowflake).map(id => ({ id, type: 0, allow: permissao(VER_CANAL | ENVIAR | HISTORICO), deny: '0' })),
    ],
  }
  try {
    const res = await chamar(`${API}/guilds/${cfg.guildId}/channels`, {
      method: 'POST', headers: { Authorization: `Bot ${cfg.botToken}`, 'Content-Type': 'application/json', 'X-Audit-Log-Reason': 'Setagem: pedido de set' },
      body: JSON.stringify(corpo),
    })
    if (!res.ok) return undefined
    const c = await res.json() as { id?: unknown }
    return ehSnowflake(c.id) ? c.id : undefined
  } catch { return undefined }
}

/** Apaga um canal temporário de pedido (só canais criados pela setagem, ID guardado no pedido). */
export async function apagarCanalTemporario(cfg: DiscordConfig, canalId: string): Promise<void> {
  if (!ehSnowflake(canalId)) return
  try { await chamar(`${API}/channels/${canalId}`, { method: 'DELETE', headers: { Authorization: `Bot ${cfg.botToken}`, 'X-Audit-Log-Reason': 'Setagem: pedido resolvido' } }, 1) } catch { /* já apagado */ }
}

/** Manda uma mensagem V2 no privado. 'fechado' = a pessoa não aceita mensagens do servidor. */
export async function enviarPrivado(cfg: DiscordConfig, discordId: string, componentes: unknown[], anexos: AnexoPainel[] = []): Promise<'ok' | 'fechado' | 'erro'> {
  if (!ehSnowflake(discordId)) return 'erro'
  try {
    const dm = await chamar(`${API}/users/@me/channels`, {
      method: 'POST', headers: { Authorization: `Bot ${cfg.botToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ recipient_id: discordId }),
    })
    if (!dm.ok) return 'erro'
    const { id } = await dm.json() as { id?: unknown }
    if (!ehSnowflake(id)) return 'erro'
    const res = await chamar(`${API}/channels/${id}/messages`, { method: 'POST', headers: { Authorization: `Bot ${cfg.botToken}` }, body: corpoV2(componentes, anexos) })
    if (res.ok) return 'ok'
    return res.status === 403 ? 'fechado' : 'erro'
  } catch { return 'erro' }
}

// ── Fórum das carteirinhas ──────────────────────────────────────────────────────

/**
 * Posta a carteirinha no fórum: dentro do tópico do membro (se já existir) ou num tópico novo.
 * Devolve o ID do tópico, 'sem_acesso' (bot sem permissão / fórum inexistente) ou undefined (falha).
 */
/** `mencionar`: Discord do dono da carteirinha — vira @ no início do post e só ELE é notificado (nunca @everyone/cargos). */
export async function postarNoForum(cfg: DiscordConfig, forumId: string, topicoId: string | undefined, nomeTopico: string, texto: string, anexo: AnexoPainel, mencionar?: string, soNoTopico = false):
  Promise<{ topicoId: string; novo: boolean } | 'sem_acesso' | undefined> {
  if (!ehSnowflake(forumId)) return 'sem_acesso'
  const marcado = mencionar && ehSnowflake(mencionar) ? mencionar : undefined
  const mensagem = {
    content: (marcado ? `<@${marcado}>\n` : '') + texto.slice(0, 1900),
    allowed_mentions: marcado ? { parse: [], users: [marcado] } : { parse: [] },
    attachments: [{ id: 0, filename: anexo.nome }],
  }
  const corpo = (payload: unknown) => {
    const f = new FormData()
    f.append('payload_json', JSON.stringify(payload))
    f.append('files[0]', new Blob([new Uint8Array(anexo.dados)], { type: anexo.mime }), anexo.nome)
    return f
  }
  try {
    if (topicoId && ehSnowflake(topicoId)) {
      const res = await chamar(`${API}/channels/${topicoId}/messages`, { method: 'POST', headers: { Authorization: `Bot ${cfg.botToken}` }, body: corpo(mensagem) })
      if (res.ok) return { topicoId, novo: false }
      // Tópico escolhido à mão: nunca cria outro no lugar
      if (soNoTopico) return res.status === 404 || res.status === 403 ? 'sem_acesso' : undefined
      if (res.status !== 404 && res.status !== 403) return undefined
      // Tópico apagado (ou sem acesso a ele): cria outro abaixo
    }
    const res = await chamar(`${API}/channels/${forumId}/threads`, {
      method: 'POST', headers: { Authorization: `Bot ${cfg.botToken}` },
      body: corpo({ name: nomeTopico.slice(0, 100) || 'Carteirinha', message: mensagem }),
    })
    if (res.status === 403 || res.status === 404) return 'sem_acesso'
    if (!res.ok) return undefined
    const t = await res.json() as { id?: unknown }
    return ehSnowflake(t.id) ? { topicoId: t.id, novo: true } : undefined
  } catch {
    return undefined
  }
}

// ── Registro de auditoria do servidor (só LEITURA, para a página de Logs) ──────────

export interface MudancaAuditoria { chave: string; antes?: unknown; depois?: unknown }
export interface EntradaAuditoria {
  id: string; tipo: number; autorId?: string; alvoId?: string; motivo?: string
  mudancas: MudancaAuditoria[]; opcoes: Record<string, unknown>
}
export interface RegistroAuditoria {
  entradas: EntradaAuditoria[]
  usuarios: Map<string, { nome: string; avatar?: string }>
}

/**
 * Lê as últimas ações do registro de auditoria do servidor (precisa de "Ver registro de auditoria").
 * 'sem_acesso' se o bot não tiver a permissão; undefined se o Discord falhar.
 */
export async function lerRegistroAuditoria(cfg: DiscordConfig): Promise<RegistroAuditoria | 'sem_acesso' | undefined> {
  try {
    const res = await chamar(`${API}/guilds/${cfg.guildId}/audit-logs?limit=100`, comBot(cfg))
    if (res.status === 403) return 'sem_acesso'
    if (!res.ok) return undefined
    const j = await res.json() as { audit_log_entries?: unknown; users?: unknown }
    const usuarios = new Map<string, { nome: string; avatar?: string }>()
    for (const u of Array.isArray(j.users) ? j.users as Record<string, unknown>[] : []) {
      if (!ehSnowflake(u.id)) continue
      const nome = typeof u.global_name === 'string' && u.global_name ? u.global_name : typeof u.username === 'string' ? u.username : 'Usuário'
      const avatar = typeof u.avatar === 'string' && /^(a_)?[0-9a-f]{32}$/.test(u.avatar) ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png` : undefined
      usuarios.set(u.id, { nome: nome.slice(0, 80), ...(avatar ? { avatar } : {}) })
    }
    const entradas: EntradaAuditoria[] = []
    for (const e of Array.isArray(j.audit_log_entries) ? j.audit_log_entries as Record<string, unknown>[] : []) {
      if (!ehSnowflake(e.id) || typeof e.action_type !== 'number') continue
      entradas.push({
        id: e.id, tipo: e.action_type,
        ...(ehSnowflake(e.user_id) ? { autorId: e.user_id } : {}),
        ...(ehSnowflake(e.target_id) ? { alvoId: e.target_id } : {}),
        ...(typeof e.reason === 'string' && e.reason ? { motivo: e.reason.slice(0, 300) } : {}),
        mudancas: (Array.isArray(e.changes) ? e.changes as Record<string, unknown>[] : [])
          .filter(c => typeof c.key === 'string').slice(0, 30)
          .map(c => ({ chave: String(c.key), antes: c.old_value, depois: c.new_value })),
        opcoes: e.options && typeof e.options === 'object' ? e.options as Record<string, unknown> : {},
      })
    }
    return { entradas, usuarios }
  } catch { return undefined }
}

/** Membros atuais do servidor (para registrar quem entrou e quem saiu). Undefined se a lista completa não estiver disponível. */
export async function membrosAtuais(cfg: DiscordConfig): Promise<Map<string, PerfilMembro> | undefined> {
  if (!listagemCompletaDisponivel()) return undefined
  return membrosDoServidor(cfg, [], 55_000)
}

// ── Tópicos de um fórum (carteirinha: escolher em qual post mandar) ─────────────

export interface TopicoForum { id: string; nome: string; arquivado: boolean }

/** Cache curto dos tópicos (várias pessoas abrindo a carteirinha = uma leitura a cada 30 s). */
const cacheTopicos = new Map<string, { valor: Promise<TopicoForum[] | undefined>; em: number }>()
const CACHE_TOPICOS_MS = 30_000

/** Tópicos (posts) do fórum: ativos + os 50 arquivados mais recentes. Só leitura. Undefined se o Discord falhar. */
export function topicosDoForum(cfg: DiscordConfig, forumId: string, forcar = false): Promise<TopicoForum[] | undefined> {
  if (!ehSnowflake(forumId)) return Promise.resolve(undefined)
  const c = cacheTopicos.get(forumId)
  if (!forcar && c && Date.now() - c.em < CACHE_TOPICOS_MS) return c.valor
  const valor = lerTopicos(cfg, forumId)
  cacheTopicos.clear()   // um fórum configurado por vez: guarda só o último
  cacheTopicos.set(forumId, { valor, em: Date.now() })
  void valor.then(v => { if (!v) cacheTopicos.delete(forumId) })   // falha não fica em cache
  return valor
}

async function lerTopicos(cfg: DiscordConfig, forumId: string): Promise<TopicoForum[] | undefined> {
  try {
    const [ativos, arquivados] = await Promise.all([
      chamar(`${API}/guilds/${cfg.guildId}/threads/active`, comBot(cfg)),
      chamar(`${API}/channels/${forumId}/threads/archived/public?limit=50`, comBot(cfg)),
    ])
    if (!ativos.ok) return undefined
    const ler = async (r: Response, arquivado: boolean): Promise<TopicoForum[]> => {
      if (!r.ok) return []
      const j = await r.json() as { threads?: unknown }
      return (Array.isArray(j.threads) ? j.threads as Record<string, unknown>[] : [])
        .filter(t => ehSnowflake(t.id) && t.parent_id === forumId && typeof t.name === 'string')
        .map(t => ({ id: t.id as string, nome: (t.name as string).slice(0, 100), arquivado }))
    }
    const lista = [...await ler(ativos, false), ...await ler(arquivados, true)]
    const vistos = new Set<string>()
    // Mais recentes primeiro (o ID do Discord cresce com o tempo)
    return lista.filter(t => !vistos.has(t.id) && vistos.add(t.id)).sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1)).slice(0, 100)
  } catch { return undefined }
}

// ── Emojis do PRÓPRIO bot (rodapé dos painéis) ──────────────────────────────
/**
 * Emojis da aplicação do bot (não são do servidor): usados como a "fotinha" do rodapé dos painéis V2.
 * Só nomes "du_<hash>" são criados/apagados pelo painel.
 */
export const NOME_EMOJI_RODAPE = /^du_[a-f0-9]{16}$/
export interface EmojiDoBot { id: string; nome: string; animado: boolean }

export async function emojisDoBot(cfg: DiscordConfig): Promise<EmojiDoBot[] | undefined> {
  try {
    const res = await chamar(`${API}/applications/${cfg.clientId}/emojis`, comBot(cfg))
    if (!res.ok) return undefined
    const j = await res.json() as { items?: unknown }
    return (Array.isArray(j.items) ? j.items as Record<string, unknown>[] : [])
      .filter(e => ehSnowflake(e.id) && typeof e.name === 'string')
      .map(e => ({ id: e.id as string, nome: e.name as string, animado: e.animated === true }))
  } catch { return undefined }
}

/** Cria um emoji do bot com a imagem (data URL png/jpeg/webp/gif, até 256 KB). Devolve o ID. */
export async function criarEmojiDoBot(cfg: DiscordConfig, nome: string, dataUrl: string): Promise<string | undefined> {
  if (!NOME_EMOJI_RODAPE.test(nome) || !/^data:image\/(png|jpeg|webp|gif);base64,/.test(dataUrl)) return undefined
  try {
    const res = await chamar(`${API}/applications/${cfg.clientId}/emojis`, {
      method: 'POST', headers: { Authorization: `Bot ${cfg.botToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nome, image: dataUrl }),
    })
    if (!res.ok) return undefined
    const j = await res.json() as { id?: unknown }
    return ehSnowflake(j.id) ? j.id : undefined
  } catch { return undefined }
}

/** Apaga um emoji do bot criado pelo painel (só nomes du_<hash>). */
export async function apagarEmojiDoBot(cfg: DiscordConfig, emoji: EmojiDoBot): Promise<boolean> {
  if (!NOME_EMOJI_RODAPE.test(emoji.nome) || !ehSnowflake(emoji.id)) return false
  try {
    const res = await chamar(`${API}/applications/${cfg.clientId}/emojis/${emoji.id}`, {
      method: 'DELETE', headers: { Authorization: `Bot ${cfg.botToken}` },
    })
    return res.ok || res.status === 404
  } catch { return false }
}

// ── Foto do membro (carteirinha) ────────────────────────────────────────────────

/** Só fotos de perfil do CDN do Discord (usuário ou servidor) — nunca um link qualquer (sem SSRF). */
const URL_FOTO_DISCORD = /^https:\/\/cdn\.discordapp\.com\/(?:avatars\/\d{17,20}|guilds\/\d{17,20}\/users\/\d{17,20}\/avatars)\/(?:a_)?[0-9a-f]{32}\.(?:png|webp|jpg|gif)(?:\?size=\d{2,4})?$/

/**
 * Cache das fotos baixadas (10 min, até 300 fotos / 40 MB): a página Logs, a carteirinha e o rodapé
 * dos painéis pedem as mesmas fotos muitas vezes. Pedidos simultâneos da mesma foto viram um download.
 */
const cacheFotos = new Map<string, { valor: Promise<{ dados: Buffer; mime: string } | undefined>; em: number; bytes: number }>()
const CACHE_FOTOS_MS = 10 * 60_000, MAX_FOTOS = 300, MAX_BYTES_FOTOS = 40 * 1024 * 1024
let bytesFotos = 0

/** Baixa a foto de perfil do Discord (para desenhar na carteirinha). Undefined se não for foto do Discord. */
export function baixarFotoDiscord(url: string, tamanho = 512): Promise<{ dados: Buffer; mime: string } | undefined> {
  if (!URL_FOTO_DISCORD.test(url)) return Promise.resolve(undefined)
  const chave = `${url.replace(/\?size=\d+$/, '')}|${tamanho}`
  const c = cacheFotos.get(chave)
  if (c && Date.now() - c.em < CACHE_FOTOS_MS) return c.valor
  if (c) { bytesFotos -= c.bytes; cacheFotos.delete(chave) }
  const valor = baixarFoto(url, tamanho)
  const item = { valor, em: Date.now(), bytes: 0 }
  cacheFotos.set(chave, item)
  void valor.then(img => {
    if (!img) { if (cacheFotos.get(chave) === item) cacheFotos.delete(chave); return }   // falha não fica em cache
    if (cacheFotos.get(chave) !== item) return
    item.bytes = img.dados.length
    bytesFotos += item.bytes
    // Passou do teto: sai a mais antiga (Map guarda a ordem de inserção)
    while ((cacheFotos.size > MAX_FOTOS || bytesFotos > MAX_BYTES_FOTOS) && cacheFotos.size > 1) {
      const [k, v] = cacheFotos.entries().next().value!
      bytesFotos -= v.bytes
      cacheFotos.delete(k)
    }
  })
  return valor
}

async function baixarFoto(url: string, tamanho: number): Promise<{ dados: Buffer; mime: string } | undefined> {
  try {
    const res = await chamar(url.replace(/\?size=\d+$/, '') + `?size=${tamanho}`, {}, 1)
    const mime = res.headers.get('content-type') ?? ''
    if (!res.ok || !/^image\/(png|jpeg|webp|gif)$/.test(mime)) return undefined
    const dados = Buffer.from(await res.arrayBuffer())
    return dados.length > 0 && dados.length <= 5 * 1024 * 1024 ? { dados, mime } : undefined
  } catch { return undefined }
}
