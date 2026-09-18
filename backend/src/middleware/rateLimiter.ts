import rateLimit, { Options, Store, IncrementResponse } from 'express-rate-limit'
import { Request, Response, NextFunction } from 'express'
import { audit } from '../security/audit'
import { registrarInfracao, PONTOS } from '../security/firewall'

const P = PONTOS.RATE_LIMIT // 15

// Chave = req.ip (confiável com `trust proxy` = 1 atrás do proxy da hospedagem).
// express-rate-limit v8 agrupa IPv6 por sub-rede automaticamente.

const ultimoLog = new Map<string, number>()
setInterval(() => ultimoLog.clear(), 10 * 60_000).unref()

/**
 * Armazenamento em memória COM TETO de chaves. O padrão da lib cresce sem limite: uma botnet com
 * centenas de milhares de IPs diferentes encheria a memória. Ao passar do teto, descarta os mais antigos.
 */
const MAX_CHAVES_LIMITADOR = 50_000
export class LojaLimitada implements Store {
  localKeys = true
  private windowMs = 60_000
  private chaves = new Map<string, { hits: number; reset: number }>()
  init(options: Options): void {
    this.windowMs = options.windowMs
    setInterval(() => {
      const agora = Date.now()
      for (const [k, v] of this.chaves) if (v.reset <= agora) this.chaves.delete(k)
    }, Math.min(this.windowMs, 60_000)).unref()
  }
  async get(key: string): Promise<IncrementResponse | undefined> {
    const e = this.chaves.get(key)
    return e && e.reset > Date.now() ? { totalHits: e.hits, resetTime: new Date(e.reset) } : undefined
  }
  async increment(key: string): Promise<IncrementResponse> {
    const agora = Date.now()
    let e = this.chaves.get(key)
    if (!e || e.reset <= agora) e = { hits: 0, reset: agora + this.windowMs }
    else this.chaves.delete(key) // reinsere no fim (ordem = uso mais recente)
    e.hits++
    this.chaves.set(key, e)
    if (this.chaves.size > MAX_CHAVES_LIMITADOR) {
      const excesso = this.chaves.size - MAX_CHAVES_LIMITADOR
      let i = 0
      for (const k of this.chaves.keys()) { if (i++ >= excesso) break; this.chaves.delete(k) }
    }
    return { totalHits: e.hits, resetTime: new Date(e.reset) }
  }
  async decrement(key: string): Promise<void> { const e = this.chaves.get(key); if (e && e.hits > 0) e.hits-- }
  async resetKey(key: string): Promise<void> { this.chaves.delete(key) }
}

/** Limitador padrão: resposta genérica + pontua no firewall + audita (no máx. 1x/min por IP/limitador). */
// pontos = peso no firewall (limites largos pesam pouco: usuário legítimo exagerado não é banido)
function limitador(nome: string, windowMs: number, limit: number, msg: string, pontos: number, extra: Partial<Options> = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store: new LojaLimitada(),
    ...extra,
    handler(req: Request, res: Response, _next: NextFunction, options: Options) {
      registrarInfracao(req, `rate_limit_${nome}`, pontos)
      const chave = `${nome}|${req.ip}`
      const agora = Date.now()
      if (agora - (ultimoLog.get(chave) ?? 0) > 60_000 && ultimoLog.size < 50_000) {
        ultimoLog.set(chave, agora)
        audit('RATE_LIMIT_HIT', req, `limitador=${nome}`)
      }
      res.setHeader('Cache-Control', 'no-store')
      res.status(options.statusCode).json({ error: msg })
    },
  })
}

const MUTACAO = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Páginas/arquivos (fora de /api, que tem limitadores próprios): 600 req / 15 min por IP.
// Não conta /api: o polling do painel (~15 req/min) estouraria e baniria usuários legítimos.
export const globalLimiter = limitador('global', 15 * 60_000, 600,
  'Muitas requisições. Tente novamente em alguns minutos.', 1, { skip: req => req.path.startsWith('/api/') })

// API geral: 150 req / 1 min por IP
export const apiLimiter = limitador('api', 60_000, 150, 'Muitas requisições à API. Tente em um minuto.', 2)

// Escrita (POST/PUT/PATCH/DELETE): 40 / 1 min por IP
export const mutationLimiter = limitador('mutacao', 60_000, 40,
  'Muitas alterações seguidas. Aguarde um minuto.', 8, { skip: req => !MUTACAO.has(req.method) })

// Uploads de imagem/arquivo (escrita nas rotas de upload): 20 / 15 min por IP
export const uploadLimiter = limitador('upload', 15 * 60_000, 20,
  'Muitos envios de arquivo. Tente novamente em alguns minutos.', 10, { skip: req => !MUTACAO.has(req.method) })

// Endpoints públicos (sem login): 60 / 1 min por IP
export const publicLimiter = limitador('publico', 60_000, 60, 'Muitas requisições. Tente em um minuto.', 5)

// /api/public/revisao (resposta de poucos bytes): 240 / 1 min por IP (~16 abas no mesmo IP)
export const revisaoLimiter = limitador('revisao', 60_000, 240, 'Muitas requisições. Tente em um minuto.', 2)

// Ranking (autenticado, consultas pesadas): 90 / 1 min por IP
export const rankingLimiter = limitador('ranking', 60_000, 90, 'Muitas requisições. Tente em um minuto.', 3)

// Login / OAuth: 10 tentativas / 15 min por IP
export const loginLimiter = limitador('login', 15 * 60_000, 10,
  'Muitas tentativas de login. Tente novamente em 15 minutos.', P)

// Troca do código de login por sessão: 20 / 15 min por IP (separado do fluxo /discord)
export const trocaLoginLimiter = limitador('troca_login', 15 * 60_000, 20,
  'Muitas tentativas de login. Tente novamente em 15 minutos.', 10)

// Restaurar sessão ao recarregar a página: 60 / 15 min por IP
export const sessaoLimiter = limitador('sessao', 15 * 60_000, 60,
  'Muitas tentativas. Entre novamente em alguns minutos.', 5)

// Ações críticas (restore): 5 / 15 min por IP
export const criticalLimiter = limitador('critico', 15 * 60_000, 5,
  'Limite de operações críticas atingido. Tente em 15 minutos.', P + 5)

// Cargos de advertência (consulta/cria/atribui cargos no Discord): 30 / 15 min por IP
export const cargosDiscordLimiter = limitador('cargos_discord', 15 * 60_000, 30,
  'Muitas operações de cargos no Discord. Tente em alguns minutos.', 3)

// Backup (download da base inteira): 5 / 1 h por IP
export const backupLimiter = limitador('backup', 60 * 60_000, 5,
  'Limite de downloads de backup atingido. Tente mais tarde.', P + 5)
