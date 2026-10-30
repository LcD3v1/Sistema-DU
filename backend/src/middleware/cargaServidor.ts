/**
 * Proteção contra derrubar o servidor (DoS de aplicação):
 *  - limiteConcorrente: no máximo N requisições AO MESMO TEMPO por IP (envio de arquivo: bem menos).
 *    Os limites por minuto não seguram uma rajada de requisições pesadas disparadas juntas;
 *  - protecaoSobrecarga: se o servidor estiver atrasado (laço de eventos lento), recusa na hora o que
 *    não é essencial (503 + Retry-After) em vez de travar para todo mundo. Quem está logado e o
 *    painel continuam com prioridade; o visitante sem login é o primeiro a esperar.
 * Memória com teto; respostas genéricas; nada de IP em resposta.
 */
import { monitorEventLoopDelay } from 'perf_hooks'
import { Request, Response, NextFunction } from 'express'
import { chaveIp } from '../security/firewall'
import { contaDaRequisicao } from '../security/contaDaRequisicao'

export const MAX_SIMULTANEAS_IP = 30
export const MAX_ENVIOS_SIMULTANEOS_IP = 3
const MAX_IPS = 50_000

const emAndamento = new Map<string, { total: number; envios: number }>()

const ehEnvio = (req: Request) => req.method === 'POST' && req.originalUrl.split('?')[0] === '/api/arquivos'

export function limiteConcorrente(req: Request, res: Response, next: NextFunction): void {
  const chave = chaveIp(req)
  if (!chave) { next(); return }
  const envio = ehEnvio(req)
  const e = emAndamento.get(chave) ?? { total: 0, envios: 0 }
  if (e.total >= MAX_SIMULTANEAS_IP || (envio && e.envios >= MAX_ENVIOS_SIMULTANEOS_IP)) {
    res.setHeader('Retry-After', '5')
    res.setHeader('Cache-Control', 'no-store')
    res.status(429).json({ error: envio ? 'Espere os envios em andamento terminarem.' : 'Muitas requisições ao mesmo tempo. Tente de novo em instantes.' })
    return
  }
  e.total++
  if (envio) e.envios++
  emAndamento.set(chave, e)
  if (emAndamento.size > MAX_IPS) {
    // Teto de memória: descarta os IPs mais antigos já sem nada em andamento
    for (const [k, v] of emAndamento) { if (emAndamento.size <= MAX_IPS) break; if (v.total === 0) emAndamento.delete(k) }
  }
  let liberado = false
  const liberar = () => {
    if (liberado) return
    liberado = true
    const atual = emAndamento.get(chave)
    if (!atual) return
    atual.total = Math.max(0, atual.total - 1)
    if (envio) atual.envios = Math.max(0, atual.envios - 1)
    if (atual.total === 0) emAndamento.delete(chave)
  }
  res.once('finish', liberar)
  res.once('close', liberar)
  next()
}

// ── Sobrecarga: atraso do laço de eventos (média dos últimos ~2 s) ─────────────
const atraso = monitorEventLoopDelay({ resolution: 20 })
atraso.enable()
let atrasoMs = 0
let simulado: number | null = null   // testes
setInterval(() => { atrasoMs = simulado ?? atraso.mean / 1e6; atraso.reset() }, 2000).unref()

/** Atraso medido (ms). Exportado para testes/diagnóstico. */
export const atrasoAtualMs = () => atrasoMs
/** Só para testes: simula atraso. */
export function simularAtraso(ms: number): void { simulado = ms || null; atrasoMs = ms }

const LIMITE_VISITANTE_MS = 250   // acima disso, visitante sem login espera
const LIMITE_TODOS_MS = 1000      // acima disso, só o essencial passa

export function protecaoSobrecarga(req: Request, res: Response, next: NextFunction): void {
  if (atrasoMs < LIMITE_VISITANTE_MS) { next(); return }
  const logado = contaDaRequisicao(req) !== undefined
  // Páginas e arquivos do site (fora da API) e quem está logado passam até o limite maior
  const essencial = !req.path.startsWith('/api/') || logado
  if (atrasoMs < LIMITE_TODOS_MS && essencial) { next(); return }
  res.setHeader('Retry-After', '5')
  res.setHeader('Cache-Control', 'no-store')
  res.status(503).json({ error: 'O sistema está com muitos acessos agora. Tente de novo em alguns segundos.' })
}

/** Uso em testes. */
export function resetarCarga(): void { emAndamento.clear(); simulado = null; atrasoMs = 0 }
