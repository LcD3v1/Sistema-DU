interface Props {
  listeners?: Record<string, unknown>
  attributes?: Record<string, unknown>
}

export default function DragHandle({ listeners, attributes }: Props) {
  return (
    <button
      {...listeners}
      {...attributes}
      className="text-txt3 hover:text-gold cursor-grab active:cursor-grabbing p-1 transition-colors"
      title="Arrastar para reordenar"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
        <circle cx="4" cy="3" r="1.2" />
        <circle cx="10" cy="3" r="1.2" />
        <circle cx="4" cy="7" r="1.2" />
        <circle cx="10" cy="7" r="1.2" />
        <circle cx="4" cy="11" r="1.2" />
        <circle cx="10" cy="11" r="1.2" />
      </svg>
    </button>
  )
}
