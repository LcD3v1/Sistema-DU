import { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

interface Props {
  children: ReactNode
  className?: string
  onClick?: () => void
}

const EASE = [0.16, 1, 0.3, 1] as const

export default function GlowCard({ children, className = '', onClick }: Props) {
  const reduce = useReducedMotion()
  const interactive = !!onClick

  return (
    <motion.div
      onClick={onClick}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      whileHover={interactive && !reduce ? { y: -5 } : undefined}
      className={`group relative rounded-xl border border-bdr bg-card transition-colors duration-300
        hover:border-gold/40 focus-within:border-gold/50
        ${interactive ? 'cursor-pointer' : ''} ${className}`}
    >
      {/* glow navy no hover/foco */}
      <div
        className="pointer-events-none absolute -inset-px rounded-xl opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-within:opacity-100"
        style={{ boxShadow: '0 0 0 1px rgba(139, 92, 246,0.4), 0 22px 55px -26px rgba(139, 92, 246,0.55)' }}
      />
      <div className="relative">{children}</div>
    </motion.div>
  )
}
