interface Props {
  active: boolean
  index: 1 | 2 | 3
  onClick?: () => void
  readonly?: boolean
}

const COLORS = {
  inactive: 'border-bdr2 bg-card2',
  1: 'border-gold3 bg-gold3/20 text-gold3',
  2: 'border-orange-400 bg-orange-400/20 text-orange-400',
  3: 'border-red bg-red/20 text-red',
}

export default function AdvBox({ active, index, onClick, readonly = false }: Props) {
  const color = active ? COLORS[index] : COLORS.inactive

  return (
    <button
      onClick={!readonly ? onClick : undefined}
      disabled={readonly}
      title={`Advertência ${index}`}
      className={`
        w-6 h-6 border rounded text-[10px] font-mono font-bold
        transition-all duration-200
        ${color}
        ${!readonly && !active ? 'hover:border-gold3/50 hover:bg-gold3/10' : ''}
        ${readonly ? 'cursor-default' : 'cursor-pointer'}
      `}
    >
      {active ? index : ''}
    </button>
  )
}
