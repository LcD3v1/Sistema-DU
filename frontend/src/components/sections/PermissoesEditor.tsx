import { useState } from 'react'
import { Plus, Trash2, Star, ShieldCheck, Pencil, Check } from 'lucide-react'
import { PERM_AREAS, emptyPermMap, type PermMap } from '@/lib/permAreas'
import {
  useCargosPermissao, useCreateCargoPerm, useUpdateCargoPerm, useDeleteCargoPerm,
  type CargoPermissao,
} from '@/hooks/useCargosPermissao'
import { useUIStore } from '@/store/uiStore'
import HudButton from '@/components/ui/HudButton'

/* Checkbox estilizado ─ quadrado com check quando marcado */
function PermCheck({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-4 h-4 rounded-[3px] border flex items-center justify-center transition-colors ${
        checked ? 'bg-gold border-gold text-white' : 'bg-transparent border-bdr2 hover:border-gold/60'
      }`}
      aria-pressed={checked}
    >
      {checked && <Check size={11} strokeWidth={3} />}
    </button>
  )
}

/* Grade de áreas ─ ÁREA / VER / EDITAR */
function PermGrid({ value, onToggle }: { value: PermMap; onToggle: (area: string, campo: 'ver' | 'editar', v: boolean) => void }) {
  return (
    <div className="border border-bdr rounded-lg overflow-hidden">
      <div className="flex items-center px-3 py-2 bg-card2/60 border-b border-bdr">
        <span className="flex-1 font-mono text-[10px] text-txt3 tracking-wider uppercase">Área</span>
        <span className="w-14 text-center font-mono text-[10px] text-txt3 tracking-wider uppercase">Ver</span>
        <span className="w-16 text-center font-mono text-[10px] text-txt3 tracking-wider uppercase">Editar</span>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {PERM_AREAS.map(({ id, label }, i) => {
          const p = value[id] ?? { ver: false, editar: false }
          return (
            <div key={id} className={`flex items-center px-3 py-2 ${i % 2 ? 'bg-card2/20' : ''}`}>
              <span className="flex-1 text-sm text-txt">{label}</span>
              <span className="w-14 flex justify-center">
                <PermCheck checked={p.ver} onChange={v => onToggle(id, 'ver', v)} />
              </span>
              <span className="w-16 flex justify-center">
                <PermCheck checked={p.editar} onChange={v => onToggle(id, 'editar', v)} />
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* Card de um cargo já existente (auto-salva as alterações) */
function CargoCard({ cargo }: { cargo: CargoPermissao }) {
  const update = useUpdateCargoPerm()
  const del = useDeleteCargoPerm()
  const { addToast } = useUIStore()
  const [renaming, setRenaming] = useState(false)
  const [nome, setNome] = useState(cargo.nome)

  function toggle(area: string, campo: 'ver' | 'editar', v: boolean) {
    const next: PermMap = { ...cargo.permissoes, [area]: { ...(cargo.permissoes[area] ?? { ver: false, editar: false }), [campo]: v } }
    update.mutate({ id: cargo.id, permissoes: next })
  }
  function salvarNome() {
    const n = nome.trim()
    if (!n || n === cargo.nome) { setRenaming(false); setNome(cargo.nome); return }
    update.mutate({ id: cargo.id, nome: n }, {
      onSuccess: () => { addToast('success', 'Cargo renomeado.'); setRenaming(false) },
      onError: (e: unknown) => { addToast('error', (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro ao renomear.'); setNome(cargo.nome) },
    })
  }

  return (
    <div className="bg-card border border-bdr rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-bdr">
        {renaming ? (
          <input
            autoFocus value={nome} onChange={e => setNome(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') salvarNome(); if (e.key === 'Escape') { setRenaming(false); setNome(cargo.nome) } }}
            onBlur={salvarNome}
            className="input-gold flex-1 bg-card2 border border-bdr2 rounded px-2 py-1 text-sm text-txt"
          />
        ) : (
          <h3 className="flex-1 text-sm font-semibold text-txt flex items-center gap-2">
            {cargo.nome}
            {cargo.padrao && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gold/15 border border-gold/40 text-gold3 text-[10px] font-mono"><Star size={10} /> padrão</span>}
          </h3>
        )}
        <button onClick={() => update.mutate({ id: cargo.id, padrao: !cargo.padrao }, { onSuccess: () => addToast('success', cargo.padrao ? 'Removido dos padrões.' : 'Definido como cargo padrão.') })}
          title="Definir como cargo padrão (atribuído a novos membros)"
          className={`p-1.5 rounded transition-colors ${cargo.padrao ? 'text-gold3' : 'text-txt3 hover:text-gold3'}`}>
          <Star size={15} fill={cargo.padrao ? 'currentColor' : 'none'} />
        </button>
        <button onClick={() => setRenaming(true)} title="Renomear" className="p-1.5 rounded text-txt3 hover:text-txt transition-colors">
          <Pencil size={15} />
        </button>
        <button onClick={() => { if (confirm(`Excluir o cargo "${cargo.nome}"? As contas que o usam voltam ao acesso do nível.`)) del.mutate(cargo.id, { onSuccess: () => addToast('success', 'Cargo excluído.') }) }}
          title="Excluir" className="p-1.5 rounded text-txt3 hover:text-red transition-colors">
          <Trash2 size={15} />
        </button>
      </div>
      <div className="p-3">
        <PermGrid value={cargo.permissoes} onToggle={toggle} />
      </div>
    </div>
  )
}

export default function PermissoesEditor() {
  const { data: cargos = [] } = useCargosPermissao()
  const create = useCreateCargoPerm()
  const { addToast } = useUIStore()
  const [nome, setNome] = useState('')
  const [novaPerm, setNovaPerm] = useState<PermMap>(emptyPermMap())

  function toggleNova(area: string, campo: 'ver' | 'editar', v: boolean) {
    setNovaPerm(p => ({ ...p, [area]: { ...(p[area] ?? { ver: false, editar: false }), [campo]: v } }))
  }
  function criar() {
    if (!nome.trim()) { addToast('error', 'Informe um nome para o cargo.'); return }
    create.mutate({ nome: nome.trim(), permissoes: novaPerm }, {
      onSuccess: () => { addToast('success', 'Cargo criado!'); setNome(''); setNovaPerm(emptyPermMap()) },
      onError: (e: unknown) => addToast('error', (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro ao criar cargo.'),
    })
  }

  return (
    <div className="space-y-5">
      {/* ── Criar novo cargo ─────────────────────────────── */}
      <div>
        <h3 className="font-orbitron text-xs text-gold tracking-wider mb-1 flex items-center gap-2">
          <ShieldCheck size={14} /> CARGOS DE PERMISSÃO
        </h3>
        <p className="text-[11px] text-txt3 mb-3">Defina o que cada cargo pode <span className="text-gold3">ver</span> e <span className="text-gold3">editar</span> em cada área do painel.</p>

        <div className="flex gap-2 mb-3">
          <input
            value={nome}
            onChange={e => setNome(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') criar() }}
            placeholder="Nome do cargo..."
            className="input-gold flex-1 bg-card2 border border-bdr2 rounded-lg px-4 py-2.5 text-sm font-mono text-txt"
          />
          <HudButton onClick={criar} loading={create.isPending}>
            <Plus size={15} className="inline mr-1" /> Criar
          </HudButton>
        </div>

        <PermGrid value={novaPerm} onToggle={toggleNova} />
      </div>

      {/* ── Cargos existentes ────────────────────────────── */}
      {cargos.length > 0 && (
        <div className="space-y-4 pt-2 border-t border-bdr">
          {cargos.map(c => <CargoCard key={c.id} cargo={c} />)}
        </div>
      )}
      {cargos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-txt3 border border-dashed border-bdr rounded-xl">
          <ShieldCheck size={26} className="opacity-40" />
          <p className="font-mono text-xs">Nenhum cargo criado ainda</p>
        </div>
      )}
    </div>
  )
}
