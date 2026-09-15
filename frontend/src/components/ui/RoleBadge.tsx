import type { Nivel } from '@/types'

const CONFIG: Record<Nivel, { label: string; emoji: string; color: string }> = {
  admin:     { label: 'Admin',          emoji: '👑', color: 'text-gold border-gold/40 bg-gold/10'   },
  moderador: { label: 'Moderador',      emoji: '🔷', color: 'text-blue border-blue/40 bg-blue/10'   },
  membro:    { label: 'Membro',         emoji: '👤', color: 'text-txt2 border-bdr2 bg-bdr/50'       },
  view_only: { label: 'View Only',      emoji: '👁',  color: 'text-txt3 border-bdr2 bg-bdr/30'       },
}

interface Props {
  nivel: Nivel
  size?: 'sm' | 'md'
}

export default function RoleBadge({ nivel, size = 'sm' }: Props) {
  const cfg = CONFIG[nivel] ?? CONFIG.membro
  return (
    <span className={`
      inline-flex items-center gap-1 border rounded px-2 py-0.5 font-mono
      ${size === 'sm' ? 'text-[10px]' : 'text-xs'}
      ${cfg.color}
    `}>
      <span>{cfg.emoji}</span>
      <span>{cfg.label}</span>
    </span>
  )
}
