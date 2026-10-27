import axios from 'axios'
import { useAuthStore } from '@/store/authStore'

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
    // 401 no próprio login/pedido de acesso é "senha errada", não sessão expirada: a tela trata
    const rotaDeEntrada = /\/auth\/(login|solicitar)$/.test(err.config?.url ?? '')
    if (err.response?.status === 401 && !rotaDeEntrada) {
      useAuthStore.getState().clearAuth()
      const body = err.response?.data ?? {}
      let reason = ''
      if (body.error === 'CONTA_DESATIVADA') reason = '?reason=desativada'
      else if (body.error === 'EXONERADO') reason = '?reason=exonerado'
      else if (body.error === 'AUSENTE') reason = `?reason=ausente&ate=${encodeURIComponent(body.ate ?? '')}`
      window.location.href = '/login' + reason
    }
    return Promise.reject(err)
  }
)

export default api
