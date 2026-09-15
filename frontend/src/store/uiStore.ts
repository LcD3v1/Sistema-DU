import { create } from 'zustand'
import type { Toast } from '@/types'
import { generateId } from '@/lib/utils'

interface UIState {
  sidebarCollapsed: boolean
  toasts: Toast[]
  toggleSidebar: () => void
  addToast: (type: Toast['type'], message: string) => void
  removeToast: (id: string) => void
}

export const useUIStore = create<UIState>()(set => ({
  sidebarCollapsed: false,
  toasts: [],
  toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  addToast: (type, message) =>
    set(s => ({
      toasts: [...s.toasts, { id: generateId(), type, message }],
    })),
  removeToast: id =>
    set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}))
