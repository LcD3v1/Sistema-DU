/**
 * Lista de tokens revogados (logout antes do vencimento natural).
 *
 * Memória = fonte da verdade para a checagem (síncrona, rápida).
 * Persistência em arquivo (sessoes-revogadas.json, na pasta do DATA_PATH): carregada
 * por iniciarPersistenciaRevogacoes() no boot — assim o logout sobrevive a reinícios.
 * Guarda só o SHA-256 do jti (nunca o token).
 */
import path from 'path'
import { hashIdentificador } from './crypto'
import { PASTA_DADOS, gravarAtomico, lerJson } from '../armazenamento'

const MAX_ENTRADAS = 100_000
const blacklist = new Map<string, number>() // hash(jti) → expira em (ms)

const ARQUIVO = path.join(PASTA_DADOS, 'sessoes-revogadas.json')
let persistir = false
let agendado: NodeJS.Timeout | undefined

/** Grava a lista (só as ainda válidas), agrupando logouts seguidos numa escrita. */
function agendarGravacao(): void {
  if (!persistir || agendado) return
  agendado = setTimeout(gravar, 1000)
  agendado.unref()
}
function gravar(): void {
  agendado = undefined
  const agora = Date.now()
  try {
    gravarAtomico(ARQUIVO, JSON.stringify([...blacklist].filter(([, exp]) => exp > agora)))
  } catch {
    console.error('[DU][SEGURANÇA] falha ao persistir revogação de sessão')
  }
}

// Limpeza periódica de tokens já expirados para não crescer indefinidamente
setInterval(() => {
  const now = Date.now()
  for (const [k, exp] of blacklist) if (exp < now) blacklist.delete(k)
}, 10 * 60 * 1000).unref()

function guardar(hash: string, expiresAt: number): void {
  blacklist.set(hash, expiresAt)
  // Teto de memória: descarta os mais antigos (já perto de expirar na prática)
  while (blacklist.size > MAX_ENTRADAS) {
    const k = blacklist.keys().next().value
    if (k === undefined) break
    blacklist.delete(k)
  }
}

export function revokeToken(jti: string, expiresAt: number): void {
  const hash = hashIdentificador(jti)
  guardar(hash, expiresAt)
  agendarGravacao()
}

export function isRevoked(jti: string): boolean {
  const hash = hashIdentificador(jti)
  const exp = blacklist.get(hash)
  if (exp === undefined) return false
  if (exp < Date.now()) { blacklist.delete(hash); return false }
  return true
}

export function blacklistSize(): number {
  return blacklist.size
}

/** Carrega as revogações ainda válidas do arquivo. Falha não derruba o boot. */
export async function iniciarPersistenciaRevogacoes(): Promise<void> {
  if (process.env.REVOGACAO_PERSISTENTE === 'off') return
  try {
    const agora = Date.now()
    for (const [hash, exp] of lerJson<[string, number][]>(ARQUIVO) ?? []) {
      if (typeof hash === 'string' && /^[A-Za-z0-9_-]{43}$/.test(hash) && typeof exp === 'number' && exp > agora) guardar(hash, exp)
    }
    persistir = true
  } catch {
    console.error('[DU][SEGURANÇA] revogação persistente indisponível — usando só memória')
  }
}

export async function encerrarPersistenciaRevogacoes(): Promise<void> {
  if (agendado) { clearTimeout(agendado); gravar() }
  persistir = false
}
