import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle, XCircle, Info, X } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import type { Toast } from '@/types'

const ICONS = {
  success: CheckCircle,
  error:   XCircle,
  info:    Info,
}

const COLORS = {
  success: 'border-green/40 bg-green/10 text-green',
  error:   'border-red/40 bg-red/10 text-red',
  info:    'border-blue/40 bg-blue/10 text-blue',
}

function ToastItem({ toast }: { toast: Toast }) {
  const { removeToast } = useUIStore()
  const Icon = ICONS[toast.type]

  useEffect(() => {
    const t = setTimeout(() => removeToast(toast.id), 4000)
    return () => clearTimeout(t)
  }, [toast.id, removeToast])

  return (
    <motion.div
      initial={{ x: 120, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 120, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      className={`
        flex items-center gap-3 px-4 py-3 border rounded-lg bg-card
        shadow-lg min-w-[280px] max-w-sm
        ${COLORS[toast.type]}
      `}
    >
      <Icon size={18} className="shrink-0" />
      <p className="flex-1 text-sm font-mono text-txt">{toast.message}</p>
      <button onClick={() => removeToast(toast.id)} className="text-txt3 hover:text-txt transition-colors">
        <X size={14} />
      </button>
    </motion.div>
  )
}

export default function ToastContainer() {
  const { toasts } = useUIStore()

  return (
    <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-[99999]">
      <AnimatePresence>
        {toasts.map(t => <ToastItem key={t.id} toast={t} />)}
      </AnimatePresence>
    </div>
  )
}
