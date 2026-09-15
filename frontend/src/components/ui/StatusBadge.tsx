import type { StatusMembro } from '@/types'

const CONFIG: Record<StatusMembro, { color: string; dot: string }> = {
  'Ativo':   { color: 'text-green border-green/30 bg-green/10',  dot: 'bg-green' },
  'Inativo': { color: 'text-red border-red/30 bg-red/10',        dot: 'bg-red'   },
  'Ausência':{ color: 'text-gold border-gold/30 bg-gold/10',     dot: 'bg-gold'  },
}

interface Props {
  status: StatusMembro
}

export default function StatusBadge({ status }: Props) {
  const cfg = CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1.5 border rounded-full px-2.5 py-0.5 text-xs font-mono ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {status}
    </span>
  )
}
