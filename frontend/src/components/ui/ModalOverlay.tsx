import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { ReactNode, useEffect } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  maxWidth?: string
}

export default function ModalOverlay({
  open, onClose, title, children, maxWidth = 'max-w-lg'
}: Props) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-9000 flex items-center justify-center p-3 sm:p-4"
          style={{ backdropFilter: 'blur(4px)', background: 'rgba(5,5,5,0.85)' }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className={`bg-card border border-bdr rounded-xl w-full ${maxWidth} shadow-2xl flex flex-col max-h-[calc(100dvh-1.5rem)]`}
          >
            {title && (
              <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-bdr shrink-0">
                <h2 className="font-orbitron text-sm font-bold text-gold tracking-wider">{title}</h2>
                <button onClick={onClose} className="-mr-2 w-9 h-9 flex items-center justify-center text-txt3 hover:text-red transition-colors" aria-label="Fechar">
                  <X size={18} />
                </button>
              </div>
            )}
            <div className="px-4 sm:px-6 py-4 sm:py-5 overflow-y-auto overscroll-contain">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
