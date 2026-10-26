/**
 * Lista de tokens revogados (logout antes do vencimento natural).
 *
 * Memória = fonte da verdade para a checagem (síncrona, rápida).
 * Persistência opcional no MongoDB (coleção própria `tokensRevogados`, com índice TTL):
 * ativada por iniciarPersistenciaRevogacoes() no boot — assim o logout sobrevive a
 * reinícios. Usa conexão própria e pequena; não mexe no data.ts.
 * Guarda só o SHA-256 do jti (nunca o token).
 */
import { MongoClient, Collection } from 'mongodb'
import { hashIdentificador } from './crypto'

const MAX_ENTRADAS = 100_000
const blacklist = new Map<string, number>() // hash(jti) → expira em (ms)

interface RevogacaoDoc { _id: string; expiraEm: Date }
let colecao: Collection<RevogacaoDoc> | undefined
let cliente: MongoClient | undefined

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
  if (colecao) {
    colecao.updateOne({ _id: hash }, { $set: { expiraEm: new Date(expiresAt) } }, { upsert: true })
      .catch(() => console.error('[DU][SEGURANÇA] falha ao persistir revogação de sessão'))
  }
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

/** Conecta à coleção de revogações e carrega as ainda válidas. Falha não derruba o boot. */
export async function iniciarPersistenciaRevogacoes(): Promise<void> {
  const uri = process.env.MONGODB_URI
  if (!uri || process.env.REVOGACAO_PERSISTENTE === 'off') return
  try {
    cliente = new MongoClient(uri, { maxPoolSize: 2, serverSelectionTimeoutMS: 15_000 })
    await cliente.connect()
    const c = cliente.db(process.env.MONGODB_DB || 'fast').collection<RevogacaoDoc>('tokensRevogados')
    await c.createIndex({ expiraEm: 1 }, { expireAfterSeconds: 0 })
    const agora = new Date()
    for (const d of await c.find({ expiraEm: { $gt: agora } }).limit(MAX_ENTRADAS).toArray()) {
      guardar(d._id, d.expiraEm.getTime())
    }
    colecao = c
  } catch {
    console.error('[DU][SEGURANÇA] revogação persistente indisponível — usando só memória')
  }
}

export async function encerrarPersistenciaRevogacoes(): Promise<void> {
  colecao = undefined
  await cliente?.close().catch(() => {})
}
