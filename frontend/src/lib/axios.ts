import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'

// Aviso de "muitas ações seguidas" (anti-flood / limites): um só a cada 4 s, mesmo com vários cliques
let ultimoAvisoLimite = 0

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || '') + '/api',
  withCredentials: true,
})

api.interceptors.request.use(cfg => {
  const token = useAuthStore.getState().token
  if (token && cfg.headers) {
    cfg.headers.Authorization = `Bearer ${token}`
  }
  return cfg
})

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 429 && Date.now() - ultimoAvisoLimite > 4000) {
      ultimoAvisoLimite = Date.now()
      const msg = typeof err.response?.data?.error === 'string' ? err.response.data.error : 'Muitas ações seguidas. Espere alguns segundos.'
      useUIStore.getState().addToast('error', msg)
    }
    if (err.response?.status === 401) {
      useAuthStore.getState().clearAuth()
      const body = err.response?.data ?? {}
      let reason = ''
      if (body.error === 'CONTA_DESATIVADA') reason = '?reason=desativada'
      else if (body.error === 'EXONERADO') reason = body.reason === 'saiu' ? '?reason=saiu' : '?reason=exonerado'
      else if (body.error === 'AUSENTE') reason = `?reason=ausente&ate=${encodeURIComponent(body.ate ?? '')}`
      window.location.href = '/login' + reason
    }
    return Promise.reject(err)
  }
)

export default api
