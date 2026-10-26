import { motion } from 'framer-motion'
import { ReactNode, ButtonHTMLAttributes } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: 'primary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const VARIANTS = {
  primary: 'bg-gold text-white hover:bg-gold2 shadow-[0_10px_30px_-12px_rgba(139, 92, 246,0.7)]',
  danger:  'bg-red text-white hover:brightness-110 shadow-[0_10px_30px_-12px_rgba(208,69,58,0.6)]',
  ghost:   'border border-bdr2 text-txt2 hover:text-txt hover:border-bdrg bg-transparent',
}

const SIZES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-8 py-3 text-sm',
}

export default function HudButton({
  children, variant = 'primary', size = 'md',
  loading, className = '', disabled, ...rest
}: Props) {
  return (
    <motion.button
      whileHover={{ scale: disabled || loading ? 1 : 1.02 }}
      whileTap={{ scale: disabled || loading ? 1 : 0.98 }}
      disabled={disabled || loading}
      className={`
        font-medium tracking-wide rounded-lg transition-colors duration-200
        disabled:opacity-40 disabled:cursor-not-allowed
        ${VARIANTS[variant]} ${SIZES[size]} ${className}
      `}
      {...(rest as object)}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Aguarde...
        </span>
      ) : children}
    </motion.button>
  )
}
