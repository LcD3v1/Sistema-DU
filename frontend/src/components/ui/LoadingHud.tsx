import { motion } from 'framer-motion'

interface Props {
  message?: string
}

export default function LoadingHud({ message = 'CARREGANDO SISTEMA...' }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 p-8">
      <div className="hud-corners p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 border-2 border-bdrg rounded-full" />
            <div className="absolute inset-0 border-2 border-t-gold border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin" />
          </div>
          <p className="font-mono text-xs text-txt2 tracking-widest animate-pulse">{message}</p>
        </div>
      </div>
      <motion.div
        className="w-48 h-0.5 bg-bdrg rounded overflow-hidden"
      >
        <motion.div
          className="h-full bg-gold rounded"
          animate={{ x: ['-100%', '100%'] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>
    </div>
  )
}
