// Proteção contra força bruta com bloqueio temporário de conta
const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000   // janela de 15 min
const LOCKOUT_MS = 15 * 60 * 1000  // bloqueio de 15 min após esgotar tentativas

interface Entry {
  attempts: number
  firstAttempt: number
  lockedUntil?: number
}

const store = new Map<string, Entry>()

export function checkLockout(username: string): { locked: boolean; remainingMs?: number } {
  const key = username.toLowerCase()
  const entry = store.get(key)
  if (!entry) return { locked: false }

  const now = Date.now()

  // Bloqueio ativo
  if (entry.lockedUntil) {
    if (now < entry.lockedUntil) return { locked: true, remainingMs: entry.lockedUntil - now }
    store.delete(key) // Bloqueio expirado — limpar
    return { locked: false }
  }

  // Janela expirada sem bloqueio
  if (now - entry.firstAttempt > WINDOW_MS) {
    store.delete(key)
    return { locked: false }
  }

  return { locked: false }
}

export function recordFailed(username: string): number {
  const key = username.toLowerCase()
  const now = Date.now()
  const entry = store.get(key) ?? { attempts: 0, firstAttempt: now }

  // Reset se janela expirou
  if (now - entry.firstAttempt > WINDOW_MS) {
    entry.attempts = 0
    entry.firstAttempt = now
    delete entry.lockedUntil
  }

  entry.attempts++
  if (entry.attempts >= MAX_ATTEMPTS) entry.lockedUntil = now + LOCKOUT_MS

  store.set(key, entry)
  return Math.max(0, MAX_ATTEMPTS - entry.attempts)
}

export function clearAttempts(username: string): void {
  store.delete(username.toLowerCase())
}

export function getLockoutStats(): { total: number; locked: number } {
  const now = Date.now()
  let locked = 0
  for (const entry of store.values()) {
    if (entry.lockedUntil && now < entry.lockedUntil) locked++
  }
  return { total: store.size, locked }
}
