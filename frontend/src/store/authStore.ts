import { create } from 'zustand'
import { queryClient } from '@/lib/queryClient'
// Credenciais ficam somente em memória. Remove sessões de versões anteriores.
for (const name of ['localStorage', 'sessionStorage'] as const) {
  try { window[name].removeItem('fast-auth') } catch { /* indisponível */ }
}
import type { AuthUser } from '@/types'
import api from '@/lib/axios'

interface AuthState {
  token: string | null
  user: AuthUser | null
  /** true enquanto verifica o cookie de sessão (recarregar a página sem novo login) */
  restaurando: boolean
  restaurarSessao: () => Promise<void>
  setAuth: (token: string, user: AuthUser) => void
  clearAuth: () => void
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
    (set, get) => ({
      token: null,
      user: null,
      restaurando: true,
      restaurarSessao: async () => {
        if (get().token) { set({ restaurando: false }); return }
        try {
          // fetch direto (sem o interceptor de 401 do axios, que redirecionaria em loop)
          const r = await fetch((import.meta.env.VITE_API_URL || '') + '/api/auth/sessao', {
            method: 'POST', credentials: 'same-origin', headers: { 'X-Fast-Sessao': '1' },
          })
          if (r.status === 200) {
            const d = await r.json() as AuthUser & { token: string }
            if (!get().token && typeof d.token === 'string') set({ token: d.token, user: { contaId: d.contaId, username: d.username, nivel: d.nivel } })
          }
        } catch { /* sem conexão: segue deslogado */ }
        set({ restaurando: false })
      },
      setAuth: (token, user) => set({ token, user, restaurando: false }),
      clearAuth: () => { queryClient.clear(); set({ token: null, user: null }) },
      logout: async () => {
        // Revogar token no servidor antes de limpar localmente
        try {
          if (get().token) await api.post('/auth/logout')
        } catch {
          // Silencioso — limpar localmente mesmo se falhar
        }
        queryClient.clear()
        set({ token: null, user: null })
      },
    })
)
