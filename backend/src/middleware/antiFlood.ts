/**
 * Anti-flood por CONTA (quem está logado): ações demais em poucos segundos na mesma parte do sistema
 * (ex.: mexer sem parar num quadro da árvore) → aquela ação fica 10 s em espera, com aviso claro.
 * Não bane, não pontua no firewall e não atrapalha o resto do site: só segura quem está floodando,
 * para o servidor (e os outros usuários) não sentirem.
 *
 * Grupo = método + 2 primeiros trechos do caminho (/api/arvores/12/itens → "POST /api/arvores").
 * Memória com teto: o anti-flood não vira alvo de DoS.
 */
import { Request, Response, NextFunction } from 'express'
import { contaDaRequisicao } from '../security/contaDaRequisicao'

export const ESPERA_MS = 10_000
const JANELA_MS = 5_000
// Por janela de 5 s, por conta e grupo
const MAX_ESCRITAS = 15
const MAX_LEITURAS = 60
const MAX_CHAVES = 50_000

interface Estado { inicio: number; n: number; bloqueadoAte: number }
const estados = new Map<string, Estado>()

const MUTACAO = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function grupo(req: Request): string {
  const partes = req.originalUrl.split('?')[0].split('/').filter(Boolean).slice(0, 2)
  return `${MUTACAO.has(req.method) ? 'W' : 'R'} /${partes.join('/')}`
}

export function antiFlood(req: Request, res: Response, next: NextFunction): void {
  const conta = contaDaRequisicao(req)
  if (conta === undefined) { next(); return }   // visitante: cuidam os limites por IP e o firewall
  const agora = Date.now()
  const chave = `${conta}|${grupo(req)}`
  let e = estados.get(chave)
  if (e && e.bloqueadoAte > agora) { recusar(res, e.bloqueadoAte - agora); return }
  if (!e || agora - e.inicio >= JANELA_MS) e = { inicio: agora, n: 0, bloqueadoAte: 0 }
  e.n++
  estados.delete(chave); estados.set(chave, e)   // reinsere no fim (ordem = uso mais recente)
  if (estados.size > MAX_CHAVES) estados.delete(estados.keys().next().value!)
  if (e.n > (MUTACAO.has(req.method) ? MAX_ESCRITAS : MAX_LEITURAS)) {
    e.bloqueadoAte = agora + ESPERA_MS
    recusar(res, ESPERA_MS)
    return
  }
  next()
}

function recusar(res: Response, faltaMs: number): void {
  const s = Math.max(1, Math.ceil(faltaMs / 1000))
  res.setHeader('Retry-After', String(s))
  res.setHeader('Cache-Control', 'no-store')
  res.status(429).json({ error: `Muitas ações seguidas. Espere ${s} segundos e tente de novo.`, esperarSegundos: s })
}

setInterval(() => {
  const agora = Date.now()
  for (const [k, e] of estados) if (e.bloqueadoAte <= agora && agora - e.inicio >= JANELA_MS) estados.delete(k)
}, 60_000).unref()

/** Uso em testes. */
export function resetarAntiFlood(): void { estados.clear() }
