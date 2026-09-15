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
      const reason = err.response?.data?.error === 'CONTA_DESATIVADA' ? '?reason=desativada' : ''
      window.location.href = '/login' + reason
    }
    return Promise.reject(err)
  }
)

export default api
