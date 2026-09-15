import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AuthUser } from '@/types'
import api from '@/lib/axios'

interface AuthState {
  token: string | null
  user: AuthUser | null
  setAuth: (token: string, user: AuthUser) => void
  clearAuth: () => void
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      clearAuth: () => set({ token: null, user: null }),
      logout: async () => {
        // Revogar token no servidor antes de limpar localmente
        try {
          if (get().token) await api.post('/auth/logout')
        } catch {
          // Silencioso — limpar localmente mesmo se falhar
        }
        set({ token: null, user: null })
      },
    }),
    {
      name: 'fast-auth',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
)
