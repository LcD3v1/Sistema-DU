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
import { RotateCcw, Search, Trash2, UserX, Users, X } from 'lucide-react'
import { useMembros, useUpdateMembro, useDeleteMembro, useReorderMembros, useMembrosExonerados, useRetirarExoneracao } from '@/hooks/useMembros'
import { useOpcoesPerfil } from '@/hooks/useSetagem'
import { usePerms } from '@/hooks/usePerms'
import { useAlternarAdv } from '@/hooks/useAlternarAdv'
import { useUIStore } from '@/store/uiStore'
import { useDebounce } from '@/hooks/useDebounce'
import GlowCard from '@/components/ui/GlowCard'
import StatusBadge from '@/components/ui/StatusBadge'
import AdvBox from '@/components/ui/AdvBox'
import DragHandle from '@/components/ui/DragHandle'
import LoadingHud from '@/components/ui/LoadingHud'
import { MembroNomeMenu } from '@/components/sections/MembroGestao'
import AprovacoesPerfil from '@/components/sections/AprovacoesPerfil'
import type { Membro, StatusMembro } from '@/types'
import { confirmar } from '@/lib/dialogo'
import { discordNome, nomeComDiscord } from '@/lib/discordDisplay'
import RankingModule from '@/modules/ranking/RankingModule'

function normalizarBusca(valor: string) {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

interface InlineCellProps {
  field: keyof Membro
  value: string
  canEdit: boolean
  type?: string
  options?: string[]
  onSave: (val: string) => void
}

function InlineCell({ value, canEdit, type = 'text', options, onSave }: InlineCellProps) {
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
      {val && !options.includes(val) && <option value={val}>{val} (atual)</option>}
      {options.map(o => <option key={o} value={o}>{o || '— nenhum —'}</option>)}
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
  setores: string[]
}

function SortableRow({ membro, canEdit, onUpdate, onDelete, patentes, setores }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: membro.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const { alternar: alternarAdv, ocupado: ocupadoAdv } = useAlternarAdv()

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
        <MembroNomeMenu membro={membro}>
          <span className="inline-flex flex-col gap-0.5 leading-tight">
            <span>{nomeComDiscord(membro)}</span>
            {discordNome(membro) && <span className="text-[10px] text-txt3">{membro.policial}</span>}
            {canEdit
              ? <InlineCell field="codinome" value={membro.codinome ?? ''} canEdit onSave={v => onUpdate(membro.id, { codinome: v })} />
              : membro.codinome && <span className="text-[11px] font-mono uppercase tracking-wider text-gold3">“{membro.codinome}”</span>}
          </span>
        </MembroNomeMenu>
        {membro.ausenteAte && (
          <span className="ml-2 px-1.5 py-0.5 rounded bg-blue/15 border border-blue/40 text-blue text-[9px] font-mono" title="Em ausência aprovada">
            AUSENTE ATÉ {membro.ausenteAte.split('-').reverse().join('/')}
          </span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <InlineCell field="setor" value={membro.setor ?? ''} canEdit={canEdit} options={canEdit ? ['', ...setores] : undefined} onSave={v => onUpdate(membro.id, { setor: v })} />
      </td>
      <td className="px-3 py-2.5">
        <div title={membro.cargoNome ? `Cargo de permissão no site: ${membro.cargoNome}` : undefined}>
          <InlineCell field="patenteInterna" value={membro.patenteInterna} canEdit={canEdit} options={canEdit ? patentes : undefined} onSave={v => onUpdate(membro.id, { patenteInterna: v })} />
        </div>
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
          {([1, 2, 3] as const).map(n => (
            <AdvBox key={n} active={membro[`adv${n}`]} index={n} readonly={!canEdit || ocupadoAdv}
              onClick={() => void alternarAdv(membro, n)} />
          ))}
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
  const [directoryOpen, setDirectoryOpen] = useState(false)
  const { canEdit: can } = usePerms()
  const { addToast } = useUIStore()
  const { data: membros, isLoading } = useMembros()
  // Patentes e setores da setagem (os mesmos do modal do Discord)
  const { data: opcoes } = useOpcoesPerfil()
  const patentes = opcoes?.patentes ?? []
  const setores = opcoes?.setores ?? []
  const updateMembro = useUpdateMembro()
  const deleteMembro = useDeleteMembro()
  const reorderMembros = useReorderMembros()

  const [modo, setModo] = useState<'ativos' | 'exonerados'>('ativos')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [busca, setBusca] = useState('')
  const [localOrder, setLocalOrder] = useState<number[] | null>(null)
  const [exoneradoSelecionado, setExoneradoSelecionado] = useState<number | null>(null)

  const canEdit = can('membros')
  const { data: exonerados = [], isLoading: loadingExonerados } = useMembrosExonerados(canEdit)
  const retirarExoneracao = useRetirarExoneracao()

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
    const termo = normalizarBusca(busca)
    if (termo) list = list.filter(m => [m.nomeServidor, m.discordUsername, m.policial, m.badge, m.passaporte]
      .some(v => normalizarBusca(v ?? '').includes(termo)))
    return list
  }, [membros, localOrder, statusFilter, busca])
  // Com filtro/busca a lista é parcial → reordenar enviaria uma ordem incompleta
  const podeReordenar = !statusFilter && !busca.trim()

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !podeReordenar) return
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
    if (!(await confirmar({ titulo: 'Remover membro', mensagem: 'Remover este membro? Se ele tiver conta vinculada, é exonerado: perde todo o acesso e os dados ficam guardados para uma readmissão.', tom: 'perigo', textoConfirmar: 'Remover' }))) return
    try {
      const r = await deleteMembro.mutateAsync(id)
      addToast('success', (r.data as { exonerado?: boolean })?.exonerado ? 'Membro exonerado — acesso bloqueado.' : 'Membro removido.')
    } catch {
      addToast('error', 'Erro ao remover membro.')
    }
  }

  async function handleRetirarExoneracao(id: number) {
    const conta = exonerados.find(e => e.id === id)
    const nome = conta ? nomeComDiscord(conta, conta.username) : 'esta pessoa'
    if (!(await confirmar({
      titulo: 'Retirar exoneração',
      mensagem: `Retirar a exoneração de ${nome}? A conta poderá entrar novamente e vai precisar preencher o cadastro para pedir set de novo.`,
      tom: 'perigo',
      textoConfirmar: 'Retirar exoneração',
    }))) return

    try {
      await retirarExoneracao.mutateAsync(id)
      setExoneradoSelecionado(null)
      addToast('success', 'Exoneração retirada. A pessoa já pode pedir set de novo.')
    } catch {
      addToast('error', 'Não foi possível retirar a exoneração.')
    }
  }

  if (isLoading) return <LoadingHud />

  const totalAtivos = membros?.length ?? 0

  return (
    <div className="w-full max-w-450 mx-auto p-3 sm:p-6 lg:px-8 space-y-6">
      {/* Cabeçalho da página — arte temática da DU */}
      <div className="relative overflow-hidden rounded-2xl border border-bdr">
        <img src="/media/du/membros.webp" alt="" aria-hidden decoding="async" className="absolute inset-0 w-full h-full object-cover object-[center_35%]" />
        <div aria-hidden className="absolute inset-0 bg-linear-to-r from-bg via-bg/80 to-bg/10" />
        <div aria-hidden className="absolute inset-0 bg-linear-to-t from-bg/80 via-transparent to-transparent" />
        <div className="relative flex items-end justify-between gap-4 flex-wrap px-5 sm:px-8 py-8 sm:py-12 min-h-44">
          <div>
            <p className="font-mono text-[10px] text-gold3 tracking-[0.25em] uppercase mb-1">Efetivo da Detective Unit</p>
            <h1 className="text-2xl sm:text-4xl font-bold text-txt">Investigadores</h1>
            <p className="text-sm text-txt2 mt-1 max-w-xl">
              {totalAtivos} {totalAtivos === 1 ? 'investigador cadastrado' : 'investigadores cadastrados'} — gerencie codinomes, setores, patentes, status, advertências e perfis.
            </p>
          </div>
          <button type="button" onClick={() => setDirectoryOpen(v => !v)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gold/40 text-sm font-medium text-gold3 bg-bg/60 backdrop-blur hover:bg-gold/15 transition-colors">
            <Users size={16} /> {directoryOpen ? 'Fechar diretório' : 'Abrir diretório e perfis'}
          </button>
        </div>
      </div>

      {directoryOpen && <RankingModule mode="members" />}
      {canEdit && <AprovacoesPerfil />}

      <GlowCard>
        <div className="p-4 sm:p-5 flex items-center gap-3 sm:gap-4 flex-wrap">
          <div className="flex items-center rounded-lg border border-bdr2 bg-card2 p-1">
            <button
              type="button"
              onClick={() => setModo('ativos')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${modo === 'ativos' ? 'bg-gold text-white' : 'text-txt2 hover:text-txt'}`}
            >
              <Users size={13} /> Ativos
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => setModo('exonerados')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${modo === 'exonerados' ? 'bg-red text-white' : 'text-txt2 hover:text-txt'}`}
              >
                <UserX size={13} /> Exonerados
              </button>
            )}
          </div>

          {modo === 'ativos' && (
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
          )}

          <span className="text-[11px] text-txt3 hidden md:inline">
            {modo === 'ativos' ? 'Clique no nome para promover, gerenciar ou exonerar.' : 'Clique no nome exonerado para liberar a retirada da exoneração.'}
          </span>
          <span className="font-mono text-xs text-txt2 ml-auto">
            {modo === 'ativos' ? `${orderedMembros.length} membros` : `${exonerados.length} exonerados`}
          </span>

          {modo === 'ativos' && (
            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt3 pointer-events-none" />
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Pesquisar pelo nome..."
                aria-label="Pesquisar membro pelo nome"
                className="input-gold w-full bg-card2 border border-bdr2 rounded-lg pl-9 pr-8 py-1.5 text-sm font-mono text-txt placeholder-txt3"
              />
              {busca && (
                <button type="button" onClick={() => setBusca('')} aria-label="Limpar pesquisa"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-txt3 hover:text-txt">
                  <X size={14} />
                </button>
              )}
            </div>
          )}
        </div>
      </GlowCard>

      {modo === 'ativos' ? (
        <GlowCard>
          <div className="overflow-x-auto">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={orderedMembros.map(m => m.id)} strategy={verticalListSortingStrategy}>
                <table className="w-full text-sm min-w-250">
                  <thead>
                    <tr className="border-b border-bdr">
                      {[
                        canEdit ? '⠿' : '',
                        'Badge', 'Passaporte', 'Nome', 'Setor',
                        'Patente', 'Status', 'Entrada', 'Promoção', 'Adv.',
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
                          setores={setores}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </SortableContext>
            </DndContext>
          </div>
        </GlowCard>
      ) : (
        <GlowCard>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-190">
              <thead>
                <tr className="border-b border-bdr">
                  {['Nome', 'Usuário', 'Data', 'Motivo', 'Ação'].map(h => (
                    <th key={h} className="text-left font-mono text-xs text-txt3 tracking-wider px-3 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingExonerados ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 font-mono text-xs text-txt3">Carregando exonerados...</td>
                  </tr>
                ) : exonerados.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 font-mono text-xs text-txt3">Nenhum exonerado encontrado</td>
                  </tr>
                ) : (
                  exonerados.map(conta => {
                    const nome = nomeComDiscord(conta, conta.username)
                    const selecionado = exoneradoSelecionado === conta.id
                    return (
                      <tr key={conta.id} className={`border-b border-bdr/50 transition-colors ${selecionado ? 'bg-red/10' : 'hover:bg-bdr/30'}`}>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => setExoneradoSelecionado(selecionado ? null : conta.id)}
                            className="text-left font-mono text-xs text-txt hover:text-gold transition-colors"
                          >
                            {nome}
                          </button>
                          {conta.cargoNome && <span className="ml-2 text-[10px] font-mono text-txt3">{conta.cargoNome}</span>}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-txt2">{`@${conta.username}`}</td>
                        <td className="px-3 py-3 font-mono text-xs text-txt2">{conta.exoneradoEm ? new Date(conta.exoneradoEm).toLocaleDateString('pt-BR') : '—'}</td>
                        <td className="px-3 py-3 text-xs text-txt2 max-w-90 truncate" title={conta.exoneradoMotivo ?? ''}>{conta.exoneradoMotivo || '—'}</td>
                        <td className="px-3 py-3">
                          <AnimatePresence>
                            {selecionado && (
                              <motion.button
                                type="button"
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                onClick={() => handleRetirarExoneracao(conta.id)}
                                disabled={retirarExoneracao.isPending}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gold/40 text-gold3 text-xs font-mono hover:bg-gold/10 transition-colors disabled:opacity-50"
                              >
                                <RotateCcw size={13} /> Retirar exoneração
                              </motion.button>
                            )}
                          </AnimatePresence>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </GlowCard>
      )}

    </div>
  )
}
