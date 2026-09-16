import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, Trash2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useMembros, useCreateMembro, useUpdateMembro, useDeleteMembro, useReorderMembros } from '@/hooks/useMembros'
import { usePatentes, useCargos } from '@/hooks/useConfig'
import { usePerms } from '@/hooks/usePerms'
import { useUIStore } from '@/store/uiStore'
import { useDebounce } from '@/hooks/useDebounce'
import GlowCard from '@/components/ui/GlowCard'
import HudButton from '@/components/ui/HudButton'
import StatusBadge from '@/components/ui/StatusBadge'
import AdvBox from '@/components/ui/AdvBox'
import DragHandle from '@/components/ui/DragHandle'
import ModalOverlay from '@/components/ui/ModalOverlay'
import LoadingHud from '@/components/ui/LoadingHud'
import type { Membro, StatusMembro } from '@/types'

interface NovoMembroForm {
  badge: string; passaporte: string; policial: string
  patenteNPD: string; patenteInterna: string
  status: StatusMembro; entrada: string; promocao: string
  adv1: boolean; adv2: boolean; adv3: boolean
}

interface InlineCellProps {
  field: keyof Membro
  value: string
  canEdit: boolean
  type?: string
  options?: string[]
  onSave: (val: string) => void
}

function InlineCell({ field, value, canEdit, type = 'text', options, onSave }: InlineCellProps) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)

  if (!canEdit) return <span className="font-mono text-xs text-txt">{value || '—'}</span>
  if (!editing) return (
    <span
      onClick={() => setEditing(true)}
      className="font-mono text-xs text-txt cursor-pointer hover:text-gold transition-colors"
    >
      {value || '—'}
    </span>
  )
  if (options) return (
    <select
      autoFocus
      value={val}
      onChange={e => { setVal(e.target.value); onSave(e.target.value); setEditing(false) }}
      onBlur={() => setEditing(false)}
      className="bg-card2 border border-gold/50 rounded px-1 py-0.5 text-xs font-mono text-txt"
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
  return (
    <input
      autoFocus
      type={type}
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => { if (val !== value) onSave(val); setEditing(false) }}
      onKeyDown={e => { if (e.key === 'Enter') { if (val !== value) onSave(val); setEditing(false) } }}
      className="bg-card2 border border-gold/50 rounded px-1 py-0.5 text-xs font-mono text-txt w-28"
    />
  )
}

interface SortableRowProps {
  membro: Membro
  canEdit: boolean
  onUpdate: (id: number, data: Partial<Membro>) => void
  onDelete: (id: number) => void
  patentes: string[]
  cargos: string[]
}

function SortableRow({ membro, canEdit, onUpdate, onDelete, patentes, cargos }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: membro.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <tr ref={setNodeRef} style={style} className="border-b border-bdr/50 hover:bg-bdr/30 transition-colors group">
      <td className="px-2 py-2.5 w-8">
        {canEdit && <DragHandle listeners={listeners as unknown as Record<string, unknown>} attributes={attributes as unknown as Record<string, unknown>} />}
      </td>
      <td className="px-3 py-2.5">
        <InlineCell field="badge" value={membro.badge} canEdit={canEdit} onSave={v => onUpdate(membro.id, { badge: v })} />
      </td>
      <td className="px-3 py-2.5">
        <InlineCell field="passaporte" value={membro.passaporte} canEdit={canEdit} onSave={v => onUpdate(membro.id, { passaporte: v })} />
      </td>
      <td className="px-3 py-2.5">
        <InlineCell field="policial" value={membro.policial} canEdit={canEdit} onSave={v => onUpdate(membro.id, { policial: v })} />
      </td>
      <td className="px-3 py-2.5">
        <InlineCell field="patenteNPD" value={membro.patenteNPD} canEdit={canEdit} options={canEdit ? patentes : undefined} onSave={v => onUpdate(membro.id, { patenteNPD: v })} />
      </td>
      <td className="px-3 py-2.5">
        <InlineCell field="patenteInterna" value={membro.patenteInterna} canEdit={canEdit} options={canEdit ? cargos : undefined} onSave={v => onUpdate(membro.id, { patenteInterna: v })} />
      </td>
      <td className="px-3 py-2.5">
        {canEdit ? (
          <select
            value={membro.status}
            onChange={e => onUpdate(membro.id, { status: e.target.value as StatusMembro })}
            className="bg-card2 border border-bdr2 rounded px-2 py-0.5 text-xs font-mono text-txt"
          >
            <option>Ativo</option>
            <option>Inativo</option>
            <option>Ausência</option>
          </select>
        ) : (
          <StatusBadge status={membro.status} />
        )}
      </td>
      <td className="px-3 py-2.5">
        <InlineCell field="entrada" value={membro.entrada} canEdit={canEdit} type="date" onSave={v => onUpdate(membro.id, { entrada: v })} />
      </td>
      <td className="px-3 py-2.5">
        <InlineCell field="promocao" value={membro.promocao} canEdit={canEdit} type="date" onSave={v => onUpdate(membro.id, { promocao: v })} />
      </td>
      <td className="px-3 py-2.5">
        <div className="flex gap-1">
          <AdvBox active={membro.adv1} index={1} readonly={!canEdit} onClick={() => onUpdate(membro.id, { adv1: !membro.adv1 })} />
          <AdvBox active={membro.adv2} index={2} readonly={!canEdit} onClick={() => onUpdate(membro.id, { adv2: !membro.adv2 })} />
          <AdvBox active={membro.adv3} index={3} readonly={!canEdit} onClick={() => onUpdate(membro.id, { adv3: !membro.adv3 })} />
        </div>
      </td>
      {canEdit && (
        <td className="px-3 py-2.5">
          <button
            onClick={() => onDelete(membro.id)}
            className="opacity-0 group-hover:opacity-100 text-txt3 hover:text-red transition-all"
          >
            <Trash2 size={14} />
          </button>
        </td>
      )}
    </tr>
  )
}

export default function MembrosPage() {
  const { canEdit: can } = usePerms()
  const { addToast } = useUIStore()
  const { data: membros, isLoading } = useMembros()
  const { data: patentes = [] } = usePatentes()
  const { data: cargos = [] } = useCargos()
  const updateMembro = useUpdateMembro()
  const deleteMembro = useDeleteMembro()
  const reorderMembros = useReorderMembros()
  const createMembro = useCreateMembro()

  const [statusFilter, setStatusFilter] = useState<string>('')
  const [modalOpen, setModalOpen] = useState(false)
  const [localOrder, setLocalOrder] = useState<number[] | null>(null)

  const canEdit = can('membros')

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const debouncedReorder = useDebounce((ids: number[]) => {
    reorderMembros.mutate(ids)
  }, 500)

  const orderedMembros = useMemo(() => {
    if (!membros) return []
    let list = [...membros]
    if (localOrder) {
      const orderMap = new Map(localOrder.map((id, i) => [id, i]))
      list = list.sort((a, b) => {
        const ia = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999
        const ib = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999
        return ia - ib
      })
    }
    if (statusFilter) list = list.filter(m => m.status === statusFilter)
    return list
  }, [membros, localOrder, statusFilter])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = orderedMembros.map(m => m.id)
    const oldIndex = ids.indexOf(active.id as number)
    const newIndex = ids.indexOf(over.id as number)
    const newOrder = arrayMove(ids, oldIndex, newIndex)
    setLocalOrder(newOrder)
    debouncedReorder(newOrder)
  }

  async function handleUpdate(id: number, data: Partial<Membro>) {
    try {
      await updateMembro.mutateAsync({ id, ...data })
    } catch {
      addToast('error', 'Erro ao atualizar membro.')
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Remover este membro? Esta operação não pode ser desfeita.')) return
    try {
      await deleteMembro.mutateAsync(id)
      addToast('success', 'Membro removido.')
    } catch {
      addToast('error', 'Erro ao remover membro.')
    }
  }

  const { register, handleSubmit, reset } = useForm<NovoMembroForm>({
    defaultValues: {
      status: 'Ativo',
      entrada: new Date().toISOString().slice(0, 10),
      promocao: new Date().toISOString().slice(0, 10),
      adv1: false, adv2: false, adv3: false,
    },
  })

  async function onCreateMembro(data: NovoMembroForm) {
    try {
      await createMembro.mutateAsync(data)
      addToast('success', 'Membro adicionado!')
      setModalOpen(false)
      reset()
    } catch {
      addToast('error', 'Erro ao adicionar membro.')
    }
  }

  if (isLoading) return <LoadingHud />

  return (
    <div className="p-6 space-y-4">
      <GlowCard>
        <div className="p-4 flex items-center gap-4">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-card2 border border-bdr2 rounded px-3 py-1.5 text-sm font-mono text-txt"
          >
            <option value="">Todos os Status</option>
            <option value="Ativo">Ativo</option>
            <option value="Inativo">Inativo</option>
            <option value="Ausência">Ausência</option>
          </select>

          <span className="font-mono text-xs text-txt2 ml-auto">{orderedMembros.length} membros</span>

          {canEdit && (
            <HudButton size="sm" onClick={() => setModalOpen(true)}>
              <Plus size={14} className="inline mr-1.5" />
              Novo Membro
            </HudButton>
          )}
        </div>
      </GlowCard>

      <GlowCard>
        <div className="overflow-x-auto">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedMembros.map(m => m.id)} strategy={verticalListSortingStrategy}>
              <table className="w-full text-sm min-w-[1000px]">
                <thead>
                  <tr className="border-b border-bdr">
                    {[
                      canEdit ? '⠿' : '',
                      'Badge', 'Passaporte', 'Nome', 'Patente',
                      'Cargo Interno', 'Status', 'Entrada', 'Promoção', 'Adv.',
                      canEdit ? '' : '',
                    ].map((h, i) => (
                      <th key={i} className="text-left font-mono text-xs text-txt3 tracking-wider px-3 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orderedMembros.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="text-center py-12 font-mono text-xs text-txt3">
                        Nenhum membro encontrado
                      </td>
                    </tr>
                  ) : (
                    orderedMembros.map(m => (
                      <SortableRow
                        key={m.id}
                        membro={m}
                        canEdit={canEdit}
                        onUpdate={handleUpdate}
                        onDelete={handleDelete}
                        patentes={patentes}
                        cargos={cargos}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </SortableContext>
          </DndContext>
        </div>
      </GlowCard>

      {/* Modal Novo Membro */}
      <ModalOverlay open={modalOpen} onClose={() => setModalOpen(false)} title="NOVO MEMBRO" maxWidth="max-w-2xl">
        <form onSubmit={handleSubmit(onCreateMembro)} className="grid grid-cols-2 gap-4">
          <div>
            <label className="font-mono text-xs text-txt2 tracking-wider block mb-1">BADGE *</label>
            <input {...register('badge', { required: true })} className="input-gold w-full bg-card2 border border-bdr2 rounded px-3 py-2 text-sm font-mono text-txt" />
          </div>
          <div>
            <label className="font-mono text-xs text-txt2 tracking-wider block mb-1">PASSAPORTE / ID</label>
            <input {...register('passaporte')} className="input-gold w-full bg-card2 border border-bdr2 rounded px-3 py-2 text-sm font-mono text-txt" />
          </div>
          <div className="col-span-2">
            <label className="font-mono text-xs text-txt2 tracking-wider block mb-1">NOME *</label>
            <input {...register('policial', { required: true })} className="input-gold w-full bg-card2 border border-bdr2 rounded px-3 py-2 text-sm font-mono text-txt" />
          </div>
          <div>
            <label className="font-mono text-xs text-txt2 tracking-wider block mb-1">PATENTE</label>
            <select {...register('patenteNPD')} className="input-gold w-full bg-card2 border border-bdr2 rounded px-3 py-2 text-sm font-mono text-txt">
              <option value="">—</option>
              {patentes.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="font-mono text-xs text-txt2 tracking-wider block mb-1">CARGO INTERNO</label>
            <select {...register('patenteInterna')} className="input-gold w-full bg-card2 border border-bdr2 rounded px-3 py-2 text-sm font-mono text-txt">
              <option value="">—</option>
              {cargos.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="font-mono text-xs text-txt2 tracking-wider block mb-1">STATUS</label>
            <select {...register('status')} className="input-gold w-full bg-card2 border border-bdr2 rounded px-3 py-2 text-sm font-mono text-txt">
              <option>Ativo</option>
              <option>Inativo</option>
              <option>Ausência</option>
            </select>
          </div>
          <div>
            <label className="font-mono text-xs text-txt2 tracking-wider block mb-1">ENTRADA</label>
            <input type="date" {...register('entrada')} className="input-gold w-full bg-card2 border border-bdr2 rounded px-3 py-2 text-sm font-mono text-txt" />
          </div>
          <div>
            <label className="font-mono text-xs text-txt2 tracking-wider block mb-1">PROMOÇÃO</label>
            <input type="date" {...register('promocao')} className="input-gold w-full bg-card2 border border-bdr2 rounded px-3 py-2 text-sm font-mono text-txt" />
          </div>
          <div className="col-span-2">
            <label className="font-mono text-xs text-txt2 tracking-wider block mb-2">ADVERTÊNCIAS</label>
            <div className="flex gap-6">
              {([1, 2, 3] as const).map(i => (
                <label key={i} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" {...register(`adv${i}` as 'adv1' | 'adv2' | 'adv3')} className="accent-gold w-4 h-4" />
                  <span className="font-mono text-xs text-txt2">Advertência {i}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="col-span-2 flex gap-3 pt-2">
            <HudButton type="submit" loading={createMembro.isPending} className="flex-1">
              ADICIONAR MEMBRO
            </HudButton>
            <HudButton type="button" variant="ghost" onClick={() => setModalOpen(false)} className="flex-1">
              CANCELAR
            </HudButton>
          </div>
        </form>
      </ModalOverlay>
    </div>
  )
}
