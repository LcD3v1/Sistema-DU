/**
 * Firewall de aplicação (WAF leve, sem dependências).
 *
 * - Pontuação de abuso por IP (decai com o tempo) → banimento temporário escalonado.
 * - Gatilhos: rajadas de 401/403/404, rate limit, assinaturas de ataque na URL,
 *   sondagem de scanners (/.env, /.git, /wp-admin…), URL/headers gigantes,
 *   métodos HTTP não permitidos, Content-Type errado em rotas JSON.
 * - Memória limitada (tetos + limpeza periódica): o próprio firewall não vira alvo de DoS.
 * - Respostas genéricas (sem pistas). Auditoria com redação (via audit()).
 *
 * Toggles (.env): FIREWALL_ATIVO, FIREWALL_ISENTAR_LOOPBACK, FIREWALL_NAO_BANIR_PRIVADOS, FIREWALL_LIMIAR,
 * FIREWALL_BAN_MINUTOS, FIREWALL_BAN_MAX_HORAS, FIREWALL_MAX_IPS.
 */
import net from 'net'
import { Request, Response, NextFunction } from 'express'
import { audit } from './audit'

const PROD = process.env.NODE_ENV === 'production'

function numEnv(nome: string, padrao: number, min: number, max: number): number {
  const v = Number(process.env[nome])
  return Number.isFinite(v) && v >= min && v <= max ? v : padrao
}
function boolEnv(nome: string, padrao: boolean): boolean {
  const v = process.env[nome]?.trim().toLowerCase()
  if (v === undefined || v === '') return padrao
  return !['off', 'false', '0', 'nao', 'não'].includes(v)
}

// Lido a cada chamada (barato) para permitir testes alternarem via env.
function cfg() {
  return {
    ativo: boolEnv('FIREWALL_ATIVO', true),
    // Fora de produção, loopback é isento por padrão (testes/dev locais).
    isentarLoopback: boolEnv('FIREWALL_ISENTAR_LOOPBACK', !PROD),
    // IP privado/loopback em produção = proxy sem X-Forwarded-For: banir derrubaria todos.
    // Esses IPs continuam barrados por assinatura, só não acumulam pontos/ban.
    naoBanirPrivados: boolEnv('FIREWALL_NAO_BANIR_PRIVADOS', true),
    limiar: numEnv('FIREWALL_LIMIAR', 100, 10, 10_000),
    banBaseMs: numEnv('FIREWALL_BAN_MINUTOS', 15, 1, 1440) * 60_000,
    banMaxMs: numEnv('FIREWALL_BAN_MAX_HORAS', 24, 1, 24 * 30) * 3_600_000,
    maxIps: numEnv('FIREWALL_MAX_IPS', 20_000, 1_000, 500_000),
  }
}

// Pontos por tipo de infração
export const PONTOS = {
  STATUS_401: 3,
  STATUS_403: 5,
  STATUS_404: 3,
  STATUS_400: 1,
  RATE_LIMIT: 15,
  CORPO_INVALIDO: 10,
  CONTENT_TYPE: 10,
  URL_MALFORMADA: 20,
  URL_GIGANTE: 20,
  HEADERS_GIGANTES: 20,
  METODO: 25,
  ASSINATURA: 40,
  SCANNER: 60, // 2 sondagens = ban
} as const

const DECAIMENTO_POR_MS = 10 / 60_000 // perde 10 pontos por minuto
const RETER_REINCIDENCIA_MS = 24 * 3_600_000
const MAX_URL = 2048
const MAX_HEADERS_BYTES = 12 * 1024
const MAX_HEADERS_QTD = 80
const METODOS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])

interface Pontuacao { pontos: number; em: number }
interface Ban { ate: number; ofensas: number; em: number; ultimoLog: number }

// Map preserva ordem de inserção → LRU simples (re-inserir ao tocar, remover o mais antigo).
const pontuacoes = new Map<string, Pontuacao>()
const bans = new Map<string, Ban>()

function limitar<T>(mapa: Map<string, T>, max: number): void {
  while (mapa.size > max) {
    const primeira = mapa.keys().next().value
    if (primeira === undefined) break
    mapa.delete(primeira)
  }
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

/** Chave por IP. IPv6 agrupado por /64 (evita troca de endereço dentro da mesma rede). */
export function chaveIp(req: Pick<Request, 'ip' | 'socket'>): string | null {
  let ip = req.ip || req.socket?.remoteAddress || ''
  if (ip.startsWith('::ffff:') && net.isIPv4(ip.slice(7))) ip = ip.slice(7)
  if (net.isIPv4(ip)) return ip
  if (!net.isIPv6(ip)) return null
  const [cabeca, cauda = ''] = ip.split('::')
  const a = cabeca ? cabeca.split(':') : []
  const b = cauda ? cauda.split(':') : []
  const completo = ip.includes('::') ? [...a, ...Array(8 - a.length - b.length).fill('0'), ...b] : a
  return completo.slice(0, 4).map(h => (parseInt(h, 16) || 0).toString(16)).join(':') + '::/64'
}

function isento(chave: string): boolean {
  return cfg().isentarLoopback && (LOOPBACK.has(chave) || chave === '0:0:0:0::/64')
}

function ipPrivado(chave: string): boolean {
  return /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.)/.test(chave) ||
    /^(0:0:0:0::|f[cd][0-9a-f]{0,2}:|fe[89ab][0-9a-f]?:)/i.test(chave)
}

function banAtivo(chave: string, agora = Date.now()): Ban | undefined {
  const b = bans.get(chave)
  return b && b.ate > agora ? b : undefined
}

/** Soma pontos de abuso ao IP; bane ao passar do limiar. */
export function registrarInfracao(req: Request, motivo: string, pontos: number): void {
  const c = cfg()
  if (!c.ativo) return
  const chave = chaveIp(req)
  if (!chave || isento(chave) || (c.naoBanirPrivados && ipPrivado(chave))) return
  const agora = Date.now()
  if (banAtivo(chave, agora)) return

  const atual = pontuacoes.get(chave)
  const decaido = atual ? Math.max(0, atual.pontos - (agora - atual.em) * DECAIMENTO_POR_MS) : 0
  const total = decaido + pontos
  pontuacoes.delete(chave)

  if (total < c.limiar) {
    pontuacoes.set(chave, { pontos: total, em: agora })
    limitar(pontuacoes, c.maxIps)
    return
  }

  // Banimento escalonado: base × 4^(ofensas-1), teto em banMaxMs
  const anterior = bans.get(chave)
  const ofensas = anterior && agora - anterior.em < RETER_REINCIDENCIA_MS ? anterior.ofensas + 1 : 1
  const duracao = Math.min(c.banBaseMs * 4 ** (ofensas - 1), c.banMaxMs)
  bans.delete(chave)
  bans.set(chave, { ate: agora + duracao, ofensas, em: agora, ultimoLog: agora })
  limitar(bans, c.maxIps)
  audit('FIREWALL_BAN', req, `motivo=${motivo} ofensas=${ofensas} duracaoMin=${Math.round(duracao / 60_000)}`)
}

function negar(res: Response, status: number): void {
  res.setHeader('Cache-Control', 'no-store')
  res.status(status).json({ error: status === 404 ? 'Recurso não encontrado' : 'Requisição recusada' })
}

// Sondagem típica de scanners/bots (o painel não tem nada disso).
const SCANNER = /(^|\/)(\.env|\.git|\.svn|\.hg|\.aws|\.ssh|\.DS_Store|\.htaccess|\.htpasswd|wp-admin|wp-login|wp-content|wp-includes|xmlrpc\.php|phpmyadmin|pma|adminer|cgi-bin|server-status|actuator|vendor\/phpunit|boaform|hnap1|owa|autodiscover|solr|jenkins|manager\/html|console|telescope|_ignition|debug\/default|config\.(php|json|yml|yaml)|web\.config|id_rsa|backup\.(zip|sql|tar|gz)|dump\.sql)(\/|$|\.)|\.(php\d?|aspx?|jsp|cgi|pl|sql|bak|old|swp|ini|conf|env)(\/|$)/i

// Assinaturas de ataque na URL decodificada (path + query)
const ASSINATURAS: RegExp[] = [
  /\.\.[\\/]/,                                   // path traversal
  /\0/,                                          // null byte
  /<\s*\/?\s*(script|iframe|svg|img|object|embed)\b/i, // XSS refletido
  /javascript\s*:/i,
  /\bon(error|load|mouseover)\s*=/i,
  /\bunion\b[\s\S]{0,40}\bselect\b/i,            // SQLi
  /'\s*(or|and)\s*'?\d+'?\s*=\s*'?\d+/i,
  /\b(sleep|benchmark|pg_sleep|waitfor\s+delay)\s*\(/i,
  /;\s*(drop|delete|insert|update|shutdown)\s/i,
  /(^|[?&\[])\$(where|ne|gt|gte|lt|lte|in|nin|regex|expr|function|accumulator|or|and|not|exists|elemMatch)\b/i, // NoSQL
  /\[\s*\$[a-z]+\s*\]/i,
  /__proto__|constructor\s*\[\s*prototype|prototype\s*\[/i,
  /\$\{\s*jndi:/i,                               // log4shell
  /\/etc\/passwd|\/proc\/self|c:\\windows/i,
  /(\||;|`|\$\()\s*(cat|curl|wget|nc|bash|sh|powershell)\b/i, // command injection
]

function tamanhoHeaders(req: Request): number {
  let total = 0
  for (const h of req.rawHeaders) total += h.length + 2
  return total
}

function temCorpo(req: Request): boolean {
  const len = req.headers['content-length']
  return (len !== undefined && len !== '0') || req.headers['transfer-encoding'] !== undefined
}

/** Middleware principal — montar logo após `trust proxy`, antes de parsers. */
export function firewall(req: Request, res: Response, next: NextFunction): void {
  const c = cfg()
  if (!c.ativo) { next(); return }
  const chave = chaveIp(req)
  if (!chave || isento(chave)) { next(); return }

  const agora = Date.now()
  const ban = banAtivo(chave, agora)
  if (ban) {
    // Log de bloqueio no máximo 1x/min por IP (evita inundar o audit.log)
    if (agora - ban.ultimoLog > 60_000) { ban.ultimoLog = agora; audit('FIREWALL_BLOCK', req, 'IP banido') }
    res.setHeader('Connection', 'close')
    negar(res, 403)
    return
  }

  if (!METODOS.has(req.method)) { registrarInfracao(req, 'metodo', PONTOS.METODO); negar(res, 405); return }

  const url = req.originalUrl || req.url || ''
  if (url.length > MAX_URL) { registrarInfracao(req, 'url_gigante', PONTOS.URL_GIGANTE); negar(res, 414); return }
  if (req.rawHeaders.length / 2 > MAX_HEADERS_QTD || tamanhoHeaders(req) > MAX_HEADERS_BYTES) {
    registrarInfracao(req, 'headers_gigantes', PONTOS.HEADERS_GIGANTES); negar(res, 431); return
  }

  let decodificada: string
  try {
    // Decodifica duas vezes para pegar dupla codificação (%252e%252e)
    decodificada = decodeURIComponent(url.replace(/\+/g, ' '))
    try { decodificada += '\n' + decodeURIComponent(decodificada) } catch { /* ok */ }
  } catch {
    registrarInfracao(req, 'url_malformada', PONTOS.URL_MALFORMADA); negar(res, 400); return
  }

  const caminho = decodificada.split('?')[0]
  // Perfil público: slug vem do nome do membro (ex.: "jenkins"). Confere o caminho original (1ª linha)
  // decodificada = 1ª e 2ª decodificação separadas por \n: todas precisam ser caminho de perfil
  const ehPerfil = decodificada.split('\n').every(d => /^\/(api\/public\/)?perfil\/[\w-]{1,80}\/?$/i.test(d.split('?')[0]))
  if (!ehPerfil && SCANNER.test(caminho)) { registrarInfracao(req, 'scanner', PONTOS.SCANNER); negar(res, 404); return }
  if (ASSINATURAS.some(r => r.test(decodificada))) { registrarInfracao(req, 'assinatura', PONTOS.ASSINATURA); negar(res, 400); return }

  // Rotas JSON: corpo precisa ser application/json
  if (req.path.startsWith('/api/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && temCorpo(req)) {
    const tipo = String(req.headers['content-type'] ?? '').toLowerCase()
    if (!/^application\/json\s*(;|$)/.test(tipo)) {
      registrarInfracao(req, 'content_type', PONTOS.CONTENT_TYPE); negar(res, 415); return
    }
  }

  // Pontua respostas de erro (rajadas de 401/403/404 = varredura / força bruta)
  res.once('finish', () => {
    const s = res.statusCode
    if (s === 401) registrarInfracao(req, 'status_401', PONTOS.STATUS_401)
    else if (s === 403) registrarInfracao(req, 'status_403', PONTOS.STATUS_403)
    else if (s === 404) registrarInfracao(req, 'status_404', PONTOS.STATUS_404)
    else if (s === 400) registrarInfracao(req, 'status_400', PONTOS.STATUS_400)
  })
  next()
}

/** Limpeza periódica: remove pontuações zeradas e bans vencidos sem reincidência recente. */
export function limparFirewall(agora = Date.now()): void {
  for (const [k, p] of pontuacoes) {
    if (p.pontos - (agora - p.em) * DECAIMENTO_POR_MS <= 0) pontuacoes.delete(k)
  }
  for (const [k, b] of bans) {
    if (b.ate <= agora && agora - b.em > RETER_REINCIDENCIA_MS) bans.delete(k)
  }
}
setInterval(() => limparFirewall(), 5 * 60_000).unref()

/** Só contagens (diagnóstico/testes) — nunca expõe IPs. */
export function estadoFirewall(): { ipsPontuados: number; ipsBanidos: number } {
  const agora = Date.now()
  let banidos = 0
  for (const b of bans.values()) if (b.ate > agora) banidos++
  return { ipsPontuados: pontuacoes.size, ipsBanidos: banidos }
}

/** Uso em testes. */
export function resetarFirewall(): void {
  pontuacoes.clear()
  bans.clear()
}
