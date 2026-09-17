import axios from 'axios'
import { useAuthStore } from '@/store/authStore'

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || '') + '/api',
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
    if (err.response?.status === 401) {
      useAuthStore.getState().clearAuth()
      const body = err.response?.data ?? {}
      let reason = ''
      if (body.error === 'CONTA_DESATIVADA') reason = '?reason=desativada'
      else if (body.error === 'EXONERADO') reason = '?reason=exonerado'
      else if (body.error === 'BOT_FORA_DO_SERVIDOR') reason = '?reason=bot_fora_servidor'
      else if (body.error === 'AUSENTE') reason = `?reason=ausente&ate=${encodeURIComponent(body.ate ?? '')}`
      window.location.href = '/login' + reason
    }
    return Promise.reject(err)
  }
)

export default api
