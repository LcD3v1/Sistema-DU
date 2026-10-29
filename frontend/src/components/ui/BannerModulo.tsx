import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import Brand from '@/components/ui/Brand'

/**
 * Banner do topo dos módulos (Protocolo, Recrutamento…): logo do sistema, sobretítulo, título,
 * subtítulo e ações à direita. Fundo no roxo noturno da identidade da DU (brilho no canto direito).
 */
export default function BannerModulo({ sobretitulo, icone: Icone, titulo, subtitulo, acoes }: {
  sobretitulo: string
  icone: LucideIcon
  titulo: string
  subtitulo?: string
  acoes?: ReactNode
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gold/25 mb-6"
         style={{ background: 'radial-gradient(70% 120% at 100% 0%, rgba(124, 63, 191, 0.55), transparent 60%), linear-gradient(100deg, #0a0610 0%, #150a24 40%, #2a1347 75%, #3d1d66 100%)' }}>
      <div className="relative flex items-center gap-3 sm:gap-5 p-4 sm:p-6 md:p-8 flex-wrap">
        <div className="shrink-0" style={{ filter: 'drop-shadow(0 0 24px rgba(139, 92, 246,0.4))' }}>
          <Brand size={84} />
        </div>
        <div className="flex-1">
          <p className="font-mono text-[10px] text-gold3 tracking-[0.25em] uppercase mb-1 flex items-center gap-2">
            <Icone size={13} /> {sobretitulo}
          </p>
          <h1 className="wordmark text-2xl md:text-3xl text-white tracking-wide">{titulo}</h1>
          {subtitulo && <p className="text-sm text-white/70 mt-1">{subtitulo}</p>}
        </div>
        {acoes && <div className="flex items-center gap-2 shrink-0">{acoes}</div>}
      </div>
    </div>
  )
}
