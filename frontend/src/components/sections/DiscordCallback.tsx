import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import api from '@/lib/axios'
import type { AuthUser } from '@/types'

export default function DiscordCallback() {
  const navigate = useNavigate()
  const started = useRef(false)
  const setAuth = useAuthStore(s => s.setAuth)
  useEffect(() => {
    if (started.current) return
    started.current = true
    const code = new URLSearchParams(window.location.hash.slice(1)).get('code')
    window.history.replaceState(null, '', window.location.pathname)
    if (!code) { navigate('/login?reason=discord_erro', { replace: true }); return }
    void api.post<AuthUser & { token: string }>('/auth/discord/exchange', { code }).then(({ data }) => {
      setAuth(data.token, { contaId: data.contaId, username: data.username, nivel: data.nivel })
      navigate('/dashboard', { replace: true })
    }).catch(() => navigate('/login?reason=discord_erro', { replace: true }))
  }, [setAuth, navigate])
  return <div className="altura-tela w-full flex items-center justify-center bg-black text-white/70 font-mono text-sm">Autenticando via Discord…</div>
}
