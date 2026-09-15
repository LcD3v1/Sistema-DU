// Lista negra de tokens revogados (logout antes do vencimento natural)
// Em memória — se o servidor reiniciar, tokens antigos expiram no prazo normal do JWT
interface BlacklistEntry {
  jti: string
  expiresAt: number
}

const blacklist = new Map<string, BlacklistEntry>()

// Limpeza periódica de tokens já expirados para não crescer indefinidamente
setInterval(() => {
  const now = Date.now()
  for (const [jti, entry] of blacklist.entries()) {
    if (entry.expiresAt < now) blacklist.delete(jti)
  }
}, 10 * 60 * 1000) // a cada 10 min

export function revokeToken(jti: string, expiresAt: number): void {
  blacklist.set(jti, { jti, expiresAt })
}

export function isRevoked(jti: string): boolean {
  const entry = blacklist.get(jti)
  if (!entry) return false
  if (entry.expiresAt < Date.now()) {
    blacklist.delete(jti)
    return false
  }
  return true
}

export function blacklistSize(): number {
  return blacklist.size
}
