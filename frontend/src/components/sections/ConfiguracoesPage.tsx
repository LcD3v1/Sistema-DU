import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
  Plus, Trash2, Megaphone, Inbox, Clock, ShieldCheck, MessagesSquare, Scale,
} from 'lucide-react'
import {
  useQrus, useQrusTipos, useTipoQru, useAddQru, useDeleteQru, useReorderQrus,
  usePatentes, useAddPatente, useDeletePatente,
  useCargos, useAddCargo, useDeleteCargo,
  useLogo,
  useRecCfg, useUpdateRecCfg,
  useAnuncioSituacoes, useAddSituacao, useUpdateSituacao, useDeleteSituacao,
} from '@/hooks/useConfig'
import type { SituacaoAnuncio } from '@/hooks/useConfig'
import { useContas, useUpdateConta, useDeleteConta } from '@/hooks/useContas'
import { useCargosPermissao } from '@/hooks/useCargosPermissao'
import PermissoesEditor from '@/components/sections/PermissoesEditor'
import CanaisEditor from '@/components/sections/CanaisEditor'
import CargosAdvEditor from '@/components/sections/CargosAdvEditor'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import GlowCard from '@/components/ui/GlowCard'
import HudButton from '@/components/ui/HudButton'
import LoadingHud from '@/components/ui/LoadingHud'
import LogoUploader from '@/components/ui/LogoUploader'
import DragHandle from '@/components/ui/DragHandle'
import { usePerms } from '@/hooks/usePerms'
import type { CategoriaRecrutamento, TipoQru } from '@/types'
import { confirmar, decidir } from '@/lib/dialogo'

const TABS = [
  { id: 'logo',       label: 'Logo',          icon: Image,    minNivel: 'moderador' },
  { id: 'patentes',   label: 'Patentes',       icon: List,     minNivel: 'moderador' },
  { id: 'cargos',     label: 'Cargos',         icon: Briefcase, minNivel: 'moderador' },
  { id: 'qrus',       label: 'QRUs',           icon: Radio,    minNivel: 'moderador' },
  { id: 'anuncios',   label: 'Anúncios',       icon: Megaphone, minNivel: 'moderador' },
  { id: 'recrutamento', label: 'Recrutamento', icon: UserPlus, minNivel: 'moderador' },
  { id: 'solicitacoes', label: 'Solicitações', icon: Inbox,    minNivel: 'admin' },
  { id: 'canais',     label: 'Canais',         icon: MessagesSquare, minNivel: 'admin' },
  { id: 'permissoes', label: 'Permissões',     icon: ShieldCheck, minNivel: 'admin' },
  { id: 'contas',     label: 'Contas',         icon: Users,    minNivel: 'admin' },
] as const

function SortableListItem({
  id, item, canEdit, onDelete, canReorder, extra,
}: {
  id: string
  item: string
  canEdit: boolean
  onDelete: (v: string) => void
  canReorder: boolean
  extra?: (item: string) => ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

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
      {extra?.(item)}
      {canEdit && (
        <button onClick={() => onDelete(item)} className="opacity-0 group-hover:opacity-100 text-txt3 hover:text-red transition-all">
          <Trash2 size={12} />
        </button>
      )}
    </div>
  )
}

function ListEditor({
  items, onAdd, onDelete, onReorder, placeholder, canEdit, semAdicionar, extra,
}: {
  items: string[]; onAdd: (v: string) => void; onDelete: (v: string) => void
  onReorder?: (items: string[]) => void
  placeholder: string; canEdit: boolean
  semAdicionar?: boolean                    // o campo de adicionar fica fora (ex.: QRUs escolhem o tipo antes)
  extra?: (item: string) => ReactNode       // ação extra por item
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

  // ID por ocorrência (nome + nº da repetição): itens com o mesmo nome continuam distintos
  const ids = useMemo(() => {
    const vistos = new Map<string, number>()
    return localItems.map(it => { const n = vistos.get(it) ?? 0; vistos.set(it, n + 1); return `${it}\u0000${n}` })
  }, [localItems])

  function handleDragEnd(event: DragEndEvent) {
    if (!onReorder) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return

    const next = arrayMove(localItems, oldIndex, newIndex)
    setLocalItems(next)
    onReorder(next)
  }

  return (
    <div className="space-y-3">
      {canEdit && !semAdicionar && (
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
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <div className="space-y-1">
                {localItems.map((item, i) => (
                  <SortableListItem
                    key={ids[i]}
                    id={ids[i]}
                    item={item}
                    canEdit={canEdit}
                    canReorder={canReorder}
                    onDelete={onDelete}
                    extra={extra}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          localItems.map((item, i) => (
            <div key={ids[i]} className="flex items-center justify-between px-3 py-2 bg-card2 border border-bdr rounded group">
              <span className="font-mono text-xs text-txt flex-1">{item}</span>
              {extra?.(item)}
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

const TIPOS_QRU: { tipo: TipoQru; titulo: string; desc: string }[] = [
  { tipo: 'convencional', titulo: 'QRU CONVENCIONAL', desc: 'Apreensão — sem vitória/derrota (ex.: registradora, ATM)' },
  { tipo: 'fechado',      titulo: 'QRU FECHADO',      desc: 'Ação — com vitória ou derrota' },
]

/** QRUs separados por tipo: ao criar, escolhe convencional ou fechado primeiro. */
function QrusEditor() {
  const { addToast } = useUIStore()
  const { data: qrus = [] } = useQrus()
  const { data: tipos = [] } = useQrusTipos()
  const addQru = useAddQru()
  const deleteQru = useDeleteQru()
  const reorderQrus = useReorderQrus()
  const tipoQru = useTipoQru()
  const [novoTipo, setNovoTipo] = useState<TipoQru | null>(null)
  const [nome, setNome] = useState('')

  const tipoDe = (q: string): TipoQru => tipos.find(t => t.nome === q)?.tipo ?? 'convencional'
  const porTipo = (t: TipoQru) => qrus.filter(q => tipoDe(q) === t)

  function adicionar() {
    const v = nome.trim()
    if (!v || !novoTipo) return
    addQru.mutate({ nome: v, tipo: novoTipo }, {
      onSuccess: () => { setNome(''); addToast('success', `QRU ${v} criado.`) },
      onError: () => addToast('error', 'Não foi possível criar o QRU. Tente novamente.'),
    })
  }

  // Reordena dentro do tipo; a lista completa fica convencionais → fechados
  function reordenar(t: TipoQru, itens: string[]) {
    const outros = porTipo(t === 'convencional' ? 'fechado' : 'convencional')
    reorderQrus.mutate(t === 'convencional' ? [...itens, ...outros] : [...outros, ...itens])
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-bdr2 bg-card2/40 p-3 space-y-3">
        <p className="font-mono text-[11px] text-txt2 tracking-wider">NOVO QRU — QUAL O TIPO?</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {TIPOS_QRU.map(o => (
            <button key={o.tipo} type="button" onClick={() => setNovoTipo(o.tipo)}
              className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${novoTipo === o.tipo ? 'border-gold bg-gold/10 text-txt' : 'border-bdr2 text-txt2 hover:border-bdrg'}`}>
              <span className="block font-mono text-xs tracking-wider">{o.titulo}</span>
              <span className="block text-[11px] text-txt3 mt-0.5">{o.desc}</span>
            </button>
          ))}
        </div>
        {novoTipo && (
          <div className="flex gap-2">
            <input
              value={nome}
              onChange={e => setNome(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') adicionar() }}
              maxLength={200}
              placeholder={novoTipo === 'convencional' ? 'Ex.: QRU Registradora' : 'Ex.: Ação Banco Central'}
              className="input-gold flex-1 bg-card2 border border-bdr2 rounded px-3 py-2 text-sm font-mono text-txt"
            />
            <HudButton size="sm" onClick={adicionar} loading={addQru.isPending}>
              <Plus size={14} />
            </HudButton>
          </div>
        )}
      </div>

      {TIPOS_QRU.map(o => (
        <div key={o.tipo}>
          <p className="font-mono text-[11px] text-gold3 tracking-wider mb-2">{o.titulo} · {porTipo(o.tipo).length}</p>
          <ListEditor
            items={porTipo(o.tipo)}
            onAdd={() => {}}
            semAdicionar
            onDelete={v => deleteQru.mutate(v)}
            onReorder={itens => reordenar(o.tipo, itens)}
            placeholder=""
            canEdit={true}
            extra={q => (
              <button type="button"
                onClick={() => tipoQru.mutate({ nome: q, tipo: o.tipo === 'convencional' ? 'fechado' : 'convencional' })}
                className="font-mono text-[10px] text-txt3 hover:text-gold border border-bdr2 rounded px-1.5 py-0.5 transition-colors">
                mover p/ {o.tipo === 'convencional' ? 'fechado' : 'convencional'}
              </button>
            )}
          />
        </div>
      ))}
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
        <button onClick={async () => { if (await confirmar({ titulo: 'Remover situação', mensagem: `Remover a situação "${s.label}"?`, tom: 'perigo', textoConfirmar: 'Remover' })) onDelete(s.id) }}
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
  const [novo, setNovo] = useState({ label: '', titulo: 'D.P.D INFORMA:', texto: '' })

  function add() {
    if (!novo.label.trim() || !novo.texto.trim()) return
    onAdd({ label: novo.label.trim(), titulo: novo.titulo.trim() || 'D.P.D INFORMA:', texto: novo.texto.trim() })
    setNovo({ label: '', titulo: 'D.P.D INFORMA:', texto: '' })
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-xs text-gold tracking-wider mb-1">SITUAÇÕES DE ANÚNCIO</h3>
        <p className="text-[11px] text-txt3">Modelos usados em "Gerar anúncio". Use <span className="text-gold3">[LOCAL]</span> e <span className="text-gold3">[ASSINATURA]</span> como marcadores.</p>
      </div>

      {/* Adicionar */}
      <div className="border border-gold/20 rounded-lg bg-gold/4 p-3 space-y-2">
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
  const { admin: isAdmin, dev: souDev } = usePerms()
  const { addToast } = useUIStore()
  const [activeTab, setActiveTab] = useState('logo')

  // A página inteira é admin-only (protegida na rota) — todas as abas ficam visíveis.
  const visibleTabs = TABS

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
  const updateConta = useUpdateConta()
  const deleteConta = useDeleteConta()

  const { data: cargosPermTodos = [] } = useCargosPermissao(isAdmin)
  // Cargo de dev só aparece (e só é atribuível) para um dev.
  const cargosPerm = cargosPermTodos.filter(cp => souDev || cp.dev !== true)
  // Pendentes = contas criadas pelo Discord que ainda não receberam cargo
  const solicitacoes = contas.filter(c => c.id !== 1 && !c.cargoPermId && c.ativo)
  const cargoPadraoId = cargosPerm.find(c => c.padrao)?.id
  const [cargoPorSol, setCargoPorSol] = useState<Record<number, number | ''>>({})

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
    <div className="w-full max-w-[1800px] mx-auto p-3 sm:p-6 lg:px-8 space-y-4">
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
        <div className="p-4 sm:p-6">
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
              <QrusEditor />
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
                <p className="text-[11px] text-txt3">Quem entra pelo Discord pela primeira vez aparece aqui. Aprove escolhendo um cargo de permissão — ao aprovar (com o cadastro concluído), o registro é postado no fórum.</p>
              </div>

              {solicitacoes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-txt3">
                  <Inbox size={28} className="opacity-40" />
                  <p className="font-mono text-xs">Nenhuma solicitação pendente</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {solicitacoes.map(sol => {
                    const cargoSel = cargoPorSol[sol.id] ?? cargoPadraoId ?? ''
                    return (
                      <div key={sol.id} className="flex flex-wrap items-center gap-3 px-4 py-3 bg-card2 border border-bdr rounded-lg">
                        <div className="flex-1 min-w-[180px]">
                          <p className="text-sm text-txt font-medium">{sol.discordUsername ?? sol.username}</p>
                          <p className="font-mono text-[11px] text-txt3 flex items-center gap-2">
                            <span className="text-gold3">@{sol.username}</span>
                            <span className="flex items-center gap-1"><Clock size={10} /> {sol.onboarded === false ? 'cadastro pendente' : 'cadastro concluído'}</span>
                          </p>
                        </div>
                        <select
                          value={cargoSel}
                          onChange={e => setCargoPorSol(p => ({ ...p, [sol.id]: e.target.value ? Number(e.target.value) : '' }))}
                          className="bg-card border border-bdr2 rounded px-2 py-1.5 text-xs font-mono text-txt"
                        >
                          <option value="">Escolha o cargo</option>
                          {cargosPerm.map(cp => <option key={cp.id} value={cp.id}>{cp.nome}</option>)}
                        </select>
                        <button
                          disabled={updateConta.isPending || deleteConta.isPending}
                          onClick={async () => {
                            const nome = sol.discordUsername ?? sol.username
                            const cargoNome = cargosPerm.find(cp => cp.id === cargoSel)?.nome
                            const r = await decidir({
                              titulo: 'Solicitação de acesso',
                              mensagem: cargoNome
                                ? `Ao aprovar, ${nome} recebe o cargo ${cargoNome} e passa a ver o que esse cargo libera.`
                                : 'Escolha um cargo na lista antes de aprovar.',
                              detalhes: [
                                { label: 'Discord', valor: nome },
                                { label: 'Usuário', valor: `@${sol.username}` },
                                { label: 'Cadastro', valor: sol.onboarded === false ? 'ainda não preenchido' : 'concluído' },
                                { label: 'Cargo', valor: cargoNome ?? 'não selecionado' },
                              ],
                              motivoReprovar: 'nenhum',
                              textoReprovar: 'Reprovar e remover',
                            })
                            if (r?.decisao === 'aprovar') {
                              if (cargoSel === '') { addToast('error', 'Escolha o cargo antes de aprovar.'); return }
                              updateConta.mutate({ id: sol.id, cargoPermId: cargoSel }, {
                                onSuccess: () => addToast('success', `${nome} aprovado.`),
                                onError: (err: unknown) => addToast('error', (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro ao aprovar.'),
                              })
                            } else if (r?.decisao === 'reprovar') {
                              deleteConta.mutate(sol.id, { onSuccess: () => addToast('success', 'Solicitação reprovada.') })
                            }
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gold/15 border border-gold/40 text-gold3 text-xs font-mono hover:bg-gold/25 transition-colors disabled:opacity-50"
                        >
                          <Scale size={13} /> Analisar
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Canais do Discord (admin only) */}
          {activeTab === 'canais' && <div className="space-y-8"><CanaisEditor /><CargosAdvEditor /></div>}

          {/* Permissões (admin only) */}
          {activeTab === 'permissoes' && <PermissoesEditor />}

          {/* Contas (admin only) */}
          {activeTab === 'contas' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-orbitron text-xs text-gold tracking-wider mb-1">CONTAS DE ACESSO</h3>
                <p className="text-[11px] text-txt3">Contas são criadas automaticamente no primeiro login com Discord.</p>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-bdr">
                    {['Usuário', 'Discord', 'Cargo de permissão', 'Status', 'Ações'].map(h => (
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
                        {conta.exonerado && <span title={conta.exoneradoMotivo} className="ml-2 px-1.5 py-0.5 rounded bg-red/15 border border-red/40 text-red text-[9px] font-mono">EXONERADO</span>}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-txt2">
                        {conta.discordUsername ?? (conta.discordId ? conta.discordId : <span className="text-txt3">não vinculado</span>)}
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
                          title={conta.exonerado ? 'Readmitir: libera o acesso e pede um novo cadastro' : undefined}
                          onClick={async () => {
                            if (conta.exonerado && !(await confirmar({
                              titulo: 'Readmitir membro',
                              mensagem: `Readmitir ${conta.discordUsername ?? conta.username}? A exoneração é retirada e a pessoa refaz o cadastro.`,
                              detalhes: conta.exoneradoMotivo ? [{ label: 'Exonerado por', valor: conta.exoneradoMotivo }] : undefined,
                              tom: 'sucesso',
                              textoConfirmar: 'Readmitir',
                            }))) return
                            updateConta.mutate({ id: conta.id, ativo: !conta.ativo })
                          }}
                          className={`font-mono text-xs px-2 py-0.5 rounded border disabled:opacity-40 ${
                            conta.ativo
                              ? 'border-green/40 text-green bg-green/10'
                              : 'border-red/40 text-red bg-red/10'
                          }`}
                        >
                          {conta.ativo ? '● Ativo' : conta.exonerado ? '↺ Readmitir' : '○ Inativo'}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        {conta.id !== user?.contaId && (
                          <button
                            onClick={async () => {
                              if (!(await confirmar({ titulo: 'Excluir conta', mensagem: `Excluir a conta ${conta.discordUsername ?? conta.username}? Esta ação não pode ser desfeita.`, tom: 'perigo', textoConfirmar: 'Excluir' }))) return
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
            </div>
          )}

        </div>
      </GlowCard>
    </div>
  )
}
