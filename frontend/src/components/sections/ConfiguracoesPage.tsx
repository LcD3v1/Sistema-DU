import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Image, List, Briefcase, Radio, UserPlus, Users,
  Plus, Trash2, Megaphone, Inbox, Check, X, Clock, ShieldCheck,
} from 'lucide-react'
import {
  useQrus, useAddQru, useDeleteQru, useReorderQrus,
  usePatentes, useAddPatente, useDeletePatente,
  useCargos, useAddCargo, useDeleteCargo,
  useLogo,
  useRecCfg, useUpdateRecCfg,
  useAnuncioSituacoes, useAddSituacao, useUpdateSituacao, useDeleteSituacao,
} from '@/hooks/useConfig'
import type { SituacaoAnuncio } from '@/hooks/useConfig'
import { useContas, useCreateConta, useUpdateConta, useDeleteConta } from '@/hooks/useContas'
import { useSolicitacoes, useAprovarSolicitacao, useRejeitarSolicitacao } from '@/hooks/useSolicitacoes'
import { useCargosPermissao } from '@/hooks/useCargosPermissao'
import PermissoesEditor from '@/components/sections/PermissoesEditor'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import GlowCard from '@/components/ui/GlowCard'
import HudButton from '@/components/ui/HudButton'
import ModalOverlay from '@/components/ui/ModalOverlay'
import LoadingHud from '@/components/ui/LoadingHud'
import LogoUploader from '@/components/ui/LogoUploader'
import DragHandle from '@/components/ui/DragHandle'
import { usePerms } from '@/hooks/usePerms'
import type { CategoriaRecrutamento } from '@/types'

const TABS = [
  { id: 'logo',       label: 'Logo',          icon: Image,    minNivel: 'moderador' },
  { id: 'patentes',   label: 'Patentes',       icon: List,     minNivel: 'moderador' },
  { id: 'cargos',     label: 'Cargos',         icon: Briefcase, minNivel: 'moderador' },
  { id: 'qrus',       label: 'QRUs',           icon: Radio,    minNivel: 'moderador' },
  { id: 'anuncios',   label: 'Anúncios',       icon: Megaphone, minNivel: 'moderador' },
  { id: 'recrutamento', label: 'Recrutamento', icon: UserPlus, minNivel: 'moderador' },
  { id: 'solicitacoes', label: 'Solicitações', icon: Inbox,    minNivel: 'admin' },
  { id: 'permissoes', label: 'Permissões',     icon: ShieldCheck, minNivel: 'admin' },
  { id: 'contas',     label: 'Contas',         icon: Users,    minNivel: 'admin' },
] as const

function SortableListItem({
  item, canEdit, onDelete, canReorder,
}: {
  item: string
  canEdit: boolean
  onDelete: (v: string) => void
  canReorder: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.55 : 1,
      }}
      className="flex items-center gap-2 px-3 py-2 bg-card2 border border-bdr rounded group"
    >
      {canEdit && canReorder && (
        <DragHandle
          listeners={listeners as unknown as Record<string, unknown>}
          attributes={attributes as unknown as Record<string, unknown>}
        />
      )}
      <span className="font-mono text-xs text-txt flex-1">{item}</span>
      {canEdit && (
        <button onClick={() => onDelete(item)} className="opacity-0 group-hover:opacity-100 text-txt3 hover:text-red transition-all">
          <Trash2 size={12} />
        </button>
      )}
    </div>
  )
}

function ListEditor({
  items, onAdd, onDelete, onReorder, placeholder, canEdit,
}: {
  items: string[]; onAdd: (v: string) => void; onDelete: (v: string) => void
  onReorder?: (items: string[]) => void
  placeholder: string; canEdit: boolean
}) {
  const [val, setVal] = useState('')
  const [localItems, setLocalItems] = useState(items)
  const canReorder = Boolean(onReorder && canEdit)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    setLocalItems(items)
  }, [items])

  function handleDragEnd(event: DragEndEvent) {
    if (!onReorder) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = localItems.indexOf(String(active.id))
    const newIndex = localItems.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return

    const next = arrayMove(localItems, oldIndex, newIndex)
    setLocalItems(next)
    onReorder(next)
  }

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex gap-2">
          <input
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && val.trim()) { onAdd(val.trim()); setVal('') } }}
            placeholder={placeholder}
            className="input-gold flex-1 bg-card2 border border-bdr2 rounded px-3 py-2 text-sm font-mono text-txt"
          />
          <HudButton size="sm" onClick={() => { if (val.trim()) { onAdd(val.trim()); setVal('') } }}>
            <Plus size={14} />
          </HudButton>
        </div>
      )}
      <div className="space-y-1 max-h-60 overflow-y-auto">
        {canReorder ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={localItems} strategy={verticalListSortingStrategy}>
              <div className="space-y-1">
                {localItems.map(item => (
                  <SortableListItem
                    key={item}
                    item={item}
                    canEdit={canEdit}
                    canReorder={canReorder}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          localItems.map(item => (
            <div key={item} className="flex items-center justify-between px-3 py-2 bg-card2 border border-bdr rounded group">
              <span className="font-mono text-xs text-txt">{item}</span>
              {canEdit && (
                <button onClick={() => onDelete(item)} className="opacity-0 group-hover:opacity-100 text-txt3 hover:text-red transition-all">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))
        )}
        {localItems.length === 0 && (
          <p className="font-mono text-xs text-txt3 text-center py-4">Nenhum item cadastrado</p>
        )}
      </div>
    </div>
  )
}

function SituacaoItem({
  s, onUpdate, onDelete,
}: {
  s: SituacaoAnuncio
  onUpdate: (id: number, patch: Partial<Omit<SituacaoAnuncio, 'id'>>) => void
  onDelete: (id: number) => void
}) {
  return (
    <div className="border border-bdr rounded-lg bg-card2/40 p-3 space-y-2 group">
      <div className="flex items-center gap-2">
        <input
          defaultValue={s.label}
          onBlur={e => { const v = e.target.value.trim(); if (v && v !== s.label) onUpdate(s.id, { label: v }) }}
          placeholder="Nome da situação"
          className="input-gold flex-1 bg-card2 border border-bdr2 rounded px-3 py-1.5 text-sm font-medium text-txt"
        />
        <input
          defaultValue={s.titulo}
          onBlur={e => { const v = e.target.value.trim(); if (v && v !== s.titulo) onUpdate(s.id, { titulo: v }) }}
          placeholder="Título"
          className="input-gold w-48 bg-card2 border border-bdr2 rounded px-3 py-1.5 text-xs font-mono text-txt2"
        />
        <button onClick={() => { if (confirm(`Remover a situação "${s.label}"?`)) onDelete(s.id) }}
          className="text-txt3 hover:text-red transition-colors p-1 opacity-0 group-hover:opacity-100">
          <Trash2 size={14} />
        </button>
      </div>
      <textarea
        defaultValue={s.texto}
        onBlur={e => { const v = e.target.value.trim(); if (v && v !== s.texto) onUpdate(s.id, { texto: v }) }}
        rows={3}
        placeholder="Mensagem padrão — use [LOCAL] e [ASSINATURA]"
        className="input-gold w-full bg-card2 border border-bdr2 rounded px-3 py-2 text-xs font-mono text-txt leading-relaxed resize-none"
      />
    </div>
  )
}

function SituacoesEditor({
  situacoes, onAdd, onUpdate, onDelete,
}: {
  situacoes: SituacaoAnuncio[]
  onAdd: (s: Omit<SituacaoAnuncio, 'id'>) => void
  onUpdate: (id: number, patch: Partial<Omit<SituacaoAnuncio, 'id'>>) => void
  onDelete: (id: number) => void
}) {
  const [novo, setNovo] = useState({ label: '', titulo: 'N.P.D INFORMA:', texto: '' })

  function add() {
    if (!novo.label.trim() || !novo.texto.trim()) return
    onAdd({ label: novo.label.trim(), titulo: novo.titulo.trim() || 'N.P.D INFORMA:', texto: novo.texto.trim() })
    setNovo({ label: '', titulo: 'N.P.D INFORMA:', texto: '' })
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-xs text-gold tracking-wider mb-1">SITUAÇÕES DE ANÚNCIO</h3>
        <p className="text-[11px] text-txt3">Modelos usados em "Gerar anúncio". Use <span className="text-gold3">[LOCAL]</span> e <span className="text-gold3">[ASSINATURA]</span> como marcadores.</p>
      </div>

      {/* Adicionar */}
      <div className="border border-gold/20 rounded-lg bg-gold/[0.04] p-3 space-y-2">
        <p className="font-mono text-[11px] text-gold3 tracking-wider">NOVA SITUAÇÃO</p>
        <div className="flex gap-2">
          <input value={novo.label} onChange={e => setNovo(p => ({ ...p, label: e.target.value }))}
            placeholder="Nome (ex: Área Restrita)" className="input-gold flex-1 bg-card2 border border-bdr2 rounded px-3 py-2 text-sm font-mono text-txt" />
          <input value={novo.titulo} onChange={e => setNovo(p => ({ ...p, titulo: e.target.value }))}
            placeholder="Título" className="input-gold w-48 bg-card2 border border-bdr2 rounded px-3 py-2 text-sm font-mono text-txt" />
        </div>
        <textarea value={novo.texto} onChange={e => setNovo(p => ({ ...p, texto: e.target.value }))}
          rows={2} placeholder="Mensagem padrão — use [LOCAL] e [ASSINATURA]"
          className="input-gold w-full bg-card2 border border-bdr2 rounded px-3 py-2 text-xs font-mono text-txt resize-none" />
        <div className="flex justify-end">
          <HudButton size="sm" onClick={add}><Plus size={14} className="inline mr-1" /> Adicionar</HudButton>
        </div>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {situacoes.map(s => <SituacaoItem key={s.id} s={s} onUpdate={onUpdate} onDelete={onDelete} />)}
        {situacoes.length === 0 && <p className="font-mono text-xs text-txt3 text-center py-4">Nenhuma situação cadastrada</p>}
      </div>
    </div>
  )
}

export default function ConfiguracoesPage() {
  const { user } = useAuthStore()
  const { admin: isAdmin } = usePerms()
  const { addToast } = useUIStore()
  const [activeTab, setActiveTab] = useState('logo')

  // A página inteira é admin-only (protegida na rota) — todas as abas ficam visíveis.
  const visibleTabs = TABS

  const { data: qrus = [] } = useQrus()
  const addQru = useAddQru()
  const deleteQru = useDeleteQru()
  const reorderQrus = useReorderQrus()

  const { data: patentes = [] } = usePatentes()
  const addPatente = useAddPatente()
  const deletePatente = useDeletePatente()

  const { data: cargos = [] } = useCargos()
  const addCargo = useAddCargo()
  const deleteCargo = useDeleteCargo()

  const { data: situacoes = [] } = useAnuncioSituacoes()
  const addSituacao = useAddSituacao()
  const updateSituacao = useUpdateSituacao()
  const deleteSituacao = useDeleteSituacao()

  const { data: logoData } = useLogo()

  const { data: recCfg } = useRecCfg()
  const updateRecCfg = useUpdateRecCfg()

  const { data: contas = [] } = useContas()
  const createConta = useCreateConta()
  const updateConta = useUpdateConta()
  const deleteConta = useDeleteConta()

  const { data: solicitacoes = [] } = useSolicitacoes(isAdmin)
  const { data: cargosPerm = [] } = useCargosPermissao(isAdmin)
  const aprovarSol = useAprovarSolicitacao()
  const rejeitarSol = useRejeitarSolicitacao()
  const [cargoPorSol, setCargoPorSol] = useState<Record<number, number | ''>>({})

  const [novaContaModal, setNovaContaModal] = useState(false)
  const [novaContaForm, setNovaContaForm] = useState<{ username: string; password: string; cargoPermId: number | '' }>({ username: '', password: '', cargoPermId: '' })

  // Recrutamento
  const [newCatNome, setNewCatNome] = useState('')
  function addCategoria() {
    if (!newCatNome.trim() || !recCfg) return
    const novaCategoria: CategoriaRecrutamento = {
      id: Date.now(),
      nome: newCatNome.trim(),
      peso: 1,
    }
    updateRecCfg.mutate({
      categorias: [...recCfg.categorias, novaCategoria],
    })
    setNewCatNome('')
  }
  function deleteCategoria(id: number) {
    if (!recCfg) return
    updateRecCfg.mutate({
      categorias: recCfg.categorias.filter(c => c.id !== id),
    })
  }

  return (
    <div className="p-6 space-y-4">
      {/* Tabs */}
      <GlowCard>
        <div className="p-3 flex gap-1 flex-wrap">
          {visibleTabs.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded text-xs font-mono transition-all ${
                  activeTab === tab.id
                    ? 'bg-bdrg text-gold border border-gold/30'
                    : 'text-txt2 hover:bg-bdr hover:text-txt border border-transparent'
                }`}
              >
                <Icon size={13} />
                {tab.label}
                {tab.id === 'solicitacoes' && solicitacoes.length > 0 && (
                  <span className="ml-0.5 min-w-[16px] h-4 px-1 rounded-full bg-gold text-white text-[10px] font-bold flex items-center justify-center">
                    {solicitacoes.length}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </GlowCard>

      {/* Conteúdo */}
      <GlowCard>
        <div className="p-6">
          {/* Logo */}
          {activeTab === 'logo' && (
            <LogoUploader currentLogo={logoData?.logo ?? ''} />
          )}

          {/* Patentes */}
          {activeTab === 'patentes' && (
            <div>
              <h3 className="font-orbitron text-xs text-gold tracking-wider mb-4">HIERARQUIA DE PATENTES</h3>
              <ListEditor
                items={patentes}
                onAdd={v => addPatente.mutate(v)}
                onDelete={v => deletePatente.mutate(v)}
                placeholder="Nova patente..."
                canEdit={true}
              />
            </div>
          )}

          {/* Cargos */}
          {activeTab === 'cargos' && (
            <div>
              <h3 className="font-orbitron text-xs text-gold tracking-wider mb-4">CARGOS INTERNOS</h3>
              <ListEditor
                items={cargos}
                onAdd={v => addCargo.mutate(v)}
                onDelete={v => deleteCargo.mutate(v)}
                placeholder="Novo cargo..."
                canEdit={true}
              />
            </div>
          )}

          {/* QRUs */}
          {activeTab === 'qrus' && (
            <div>
              <h3 className="font-orbitron text-xs text-gold tracking-wider mb-4">GERENCIAR QRUs</h3>
              <ListEditor
                items={qrus}
                onAdd={v => addQru.mutate(v)}
                onDelete={v => deleteQru.mutate(v)}
                onReorder={items => reorderQrus.mutate(items)}
                placeholder="Novo QRU..."
                canEdit={true}
              />
            </div>
          )}

          {/* Anúncios */}
          {activeTab === 'anuncios' && (
            <SituacoesEditor
              situacoes={situacoes}
              onAdd={s => addSituacao.mutate(s, {
                onSuccess: () => addToast('success', 'Situação adicionada!'),
                onError: () => addToast('error', 'Erro ao adicionar situação.'),
              })}
              onUpdate={(id, patch) => updateSituacao.mutate({ id, ...patch })}
              onDelete={id => deleteSituacao.mutate(id, {
                onSuccess: () => addToast('success', 'Situação removida.'),
              })}
            />
          )}

          {/* Recrutamento */}
          {activeTab === 'recrutamento' && recCfg && (
            <div className="space-y-5">
              <h3 className="font-orbitron text-xs text-gold tracking-wider">CONFIGURAÇÕES DE RECRUTAMENTO</h3>
              <div>
                <label className="font-mono text-xs text-txt2 tracking-wider block mb-1.5">NOTA MÍNIMA</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={0} max={10} step={0.5}
                    defaultValue={recCfg.notaMinima}
                    onBlur={e => updateRecCfg.mutate({ notaMinima: parseFloat(e.target.value) })}
                    className="input-gold w-24 bg-card2 border border-bdr2 rounded px-3 py-2 text-sm font-mono text-txt"
                  />
                  <span className="font-mono text-xs text-txt2">/ 10</span>
                </div>
              </div>
              <div>
                <h4 className="font-mono text-xs text-txt2 tracking-wider mb-3">CATEGORIAS DE AVALIAÇÃO</h4>
                <div className="space-y-2 mb-3">
                  {recCfg.categorias.map(cat => (
                    <div key={cat.id} className="flex items-center gap-3 px-3 py-2 bg-card2 border border-bdr rounded group">
                      <span className="font-mono text-xs text-txt flex-1">{cat.nome}</span>
                      <span className="font-mono text-xs text-txt2">peso: {cat.peso}</span>
                      <button onClick={() => deleteCategoria(cat.id)} className="opacity-0 group-hover:opacity-100 text-txt3 hover:text-red transition-all">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={newCatNome}
                    onChange={e => setNewCatNome(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addCategoria() }}
                    placeholder="Nova categoria..."
                    className="input-gold flex-1 bg-card2 border border-bdr2 rounded px-3 py-2 text-sm font-mono text-txt"
                  />
                  <HudButton size="sm" onClick={addCategoria}><Plus size={14} /></HudButton>
                </div>
              </div>
            </div>
          )}

          {/* Solicitações de cadastro (admin only) */}
          {activeTab === 'solicitacoes' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-orbitron text-xs text-gold tracking-wider mb-1">SOLICITAÇÕES DE CADASTRO</h3>
                <p className="text-[11px] text-txt3">Aprove um pedido e escolha o nível de acesso. A pessoa completa o próprio perfil no primeiro login.</p>
              </div>

              {solicitacoes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-txt3">
                  <Inbox size={28} className="opacity-40" />
                  <p className="font-mono text-xs">Nenhuma solicitação pendente</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {solicitacoes.map(sol => {
                    const cargoSel = cargoPorSol[sol.id] ?? ''
                    return (
                      <div key={sol.id} className="flex flex-wrap items-center gap-3 px-4 py-3 bg-card2 border border-bdr rounded-lg">
                        <div className="flex-1 min-w-[180px]">
                          <p className="text-sm text-txt font-medium">{sol.nome}</p>
                          <p className="font-mono text-[11px] text-txt3 flex items-center gap-2">
                            <span className="text-gold3">@{sol.username}</span>
                            <span className="flex items-center gap-1"><Clock size={10} /> {new Date(sol.criadoEm).toLocaleDateString('pt-BR')}</span>
                          </p>
                        </div>
                        <select
                          value={cargoSel}
                          onChange={e => setCargoPorSol(p => ({ ...p, [sol.id]: e.target.value ? Number(e.target.value) : '' }))}
                          className="bg-card border border-bdr2 rounded px-2 py-1.5 text-xs font-mono text-txt"
                        >
                          <option value="">Cargo: padrão</option>
                          {cargosPerm.map(cp => <option key={cp.id} value={cp.id}>{cp.nome}</option>)}
                        </select>
                        <button
                          disabled={aprovarSol.isPending}
                          onClick={() => aprovarSol.mutate({ id: sol.id, cargoPermId: cargoSel === '' ? null : cargoSel }, {
                            onSuccess: () => addToast('success', `${sol.nome} aprovado.`),
                            onError: (err: unknown) => addToast('error', (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro ao aprovar.'),
                          })}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-green/15 border border-green/40 text-green text-xs font-mono hover:bg-green/25 transition-colors disabled:opacity-50"
                        >
                          <Check size={13} /> Aprovar
                        </button>
                        <button
                          disabled={rejeitarSol.isPending}
                          onClick={() => {
                            if (!confirm(`Recusar a solicitação de ${sol.nome}?`)) return
                            rejeitarSol.mutate(sol.id, { onSuccess: () => addToast('success', 'Solicitação recusada.') })
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-red/10 border border-red/40 text-red text-xs font-mono hover:bg-red/20 transition-colors disabled:opacity-50"
                        >
                          <X size={13} /> Recusar
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Permissões (admin only) */}
          {activeTab === 'permissoes' && <PermissoesEditor />}

          {/* Contas (admin only) */}
          {activeTab === 'contas' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-orbitron text-xs text-gold tracking-wider">CONTAS DE ACESSO</h3>
                <HudButton size="sm" onClick={() => setNovaContaModal(true)}>
                  <Plus size={14} className="inline mr-1.5" />
                  Nova Conta
                </HudButton>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-bdr">
                    {['Usuário', 'Cargo de permissão', 'Status', 'Ações'].map(h => (
                      <th key={h} className="text-left font-mono text-xs text-txt3 px-3 py-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contas.map(conta => (
                    <tr key={conta.id} className="border-b border-bdr/50 hover:bg-bdr/30 transition-colors">
                      <td className="px-3 py-2.5 font-mono text-xs text-txt">
                        {conta.username}
                        {conta.id === 1 && <span className="ml-2 px-1.5 py-0.5 rounded bg-gold/15 border border-gold/40 text-gold3 text-[9px] font-mono">DONO</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          value={conta.cargoPermId ?? ''}
                          disabled={conta.id === 1}
                          onChange={e => updateConta.mutate({ id: conta.id, cargoPermId: e.target.value ? Number(e.target.value) : null })}
                          className="bg-card2 border border-bdr2 rounded px-2 py-0.5 text-xs font-mono text-txt disabled:opacity-50"
                        >
                          <option value="">{conta.id === 1 ? 'Acesso total (dono)' : '— sem cargo —'}</option>
                          {cargosPerm.map(cp => <option key={cp.id} value={cp.id}>{cp.nome}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          disabled={conta.id === user?.contaId}
                          onClick={() => updateConta.mutate({ id: conta.id, ativo: !conta.ativo })}
                          className={`font-mono text-xs px-2 py-0.5 rounded border disabled:opacity-40 ${
                            conta.ativo
                              ? 'border-green/40 text-green bg-green/10'
                              : 'border-red/40 text-red bg-red/10'
                          }`}
                        >
                          {conta.ativo ? '● Ativo' : '○ Inativo'}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        {conta.id !== user?.contaId && (
                          <button
                            onClick={() => {
                              if (!confirm('Excluir esta conta?')) return
                              deleteConta.mutate(conta.id)
                            }}
                            className="text-txt3 hover:text-red transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </GlowCard>

      {/* Modal Nova Conta */}
      <ModalOverlay open={novaContaModal} onClose={() => setNovaContaModal(false)} title="NOVA CONTA">
        <div className="space-y-4">
          <div>
            <label className="font-mono text-xs text-txt2 block mb-1">USUÁRIO</label>
            <input
              value={novaContaForm.username}
              onChange={e => setNovaContaForm(p => ({ ...p, username: e.target.value }))}
              placeholder="min. 2 chars — só letras, números, _ . -"
              className="input-gold w-full bg-card2 border border-bdr2 rounded px-3 py-2 text-sm font-mono text-txt placeholder:text-txt3"
            />
          </div>
          <div>
            <label className="font-mono text-xs text-txt2 block mb-1">SENHA</label>
            <input
              type="password"
              value={novaContaForm.password}
              onChange={e => setNovaContaForm(p => ({ ...p, password: e.target.value }))}
              placeholder="min. 4 caracteres"
              className="input-gold w-full bg-card2 border border-bdr2 rounded px-3 py-2 text-sm font-mono text-txt placeholder:text-txt3"
            />
          </div>
          <div>
            <label className="font-mono text-xs text-txt2 block mb-1">CARGO DE PERMISSÃO</label>
            <select
              value={novaContaForm.cargoPermId}
              onChange={e => setNovaContaForm(p => ({ ...p, cargoPermId: e.target.value ? Number(e.target.value) : '' }))}
              className="input-gold w-full bg-card2 border border-bdr2 rounded px-3 py-2 text-sm font-mono text-txt"
            >
              <option value="">— sem cargo (sem acesso até atribuir) —</option>
              {cargosPerm.map(cp => <option key={cp.id} value={cp.id}>{cp.nome}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <HudButton
              loading={createConta.isPending}
              onClick={() => {
                if (!novaContaForm.username || !novaContaForm.password) return
                createConta.mutate({ username: novaContaForm.username, password: novaContaForm.password, cargoPermId: novaContaForm.cargoPermId === '' ? null : novaContaForm.cargoPermId }, {
                  onSuccess: () => { addToast('success', 'Conta criada!'); setNovaContaModal(false); setNovaContaForm({ username: '', password: '', cargoPermId: '' }) },
                  onError: (err: unknown) => {
                    const data = (err as { response?: { data?: { error?: string; details?: string[] } } })?.response?.data
                    const msg = data?.details?.length ? data.details.join(' | ') : (data?.error ?? 'Erro ao criar conta.')
                    addToast('error', msg)
                  },
                })
              }}
              className="flex-1"
            >
              CRIAR CONTA
            </HudButton>
            <HudButton variant="ghost" onClick={() => setNovaContaModal(false)} className="flex-1">
              CANCELAR
            </HudButton>
          </div>
        </div>
      </ModalOverlay>
    </div>
  )
}
