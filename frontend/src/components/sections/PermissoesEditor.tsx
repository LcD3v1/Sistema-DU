import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Plus, Trash2, Star, ShieldCheck, Pencil, Check, Crown, ChevronUp, ChevronDown, MoreHorizontal, X, Users, Eye, Terminal,
} from 'lucide-react'
import { PERM_AREAS, emptyPermMap, type PermMap } from '@/lib/permAreas'
import {
  useCargosPermissao, useCreateCargoPerm, useUpdateCargoPerm, useDeleteCargoPerm, useReorderCargosPerm,
  type CargoPermissao,
} from '@/hooks/useCargosPermissao'
import { useContas } from '@/hooks/useContas'
import { useMe } from '@/hooks/useMe'
import { useUIStore } from '@/store/uiStore'
import HudButton from '@/components/ui/HudButton'
import { confirmar } from '@/lib/dialogo'

const erroApi = (e: unknown, padrao: string) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? padrao

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
  const todas = (campo: 'ver' | 'editar') => PERM_AREAS.every(a => value[a.id]?.[campo])
  const marcarTodas = (campo: 'ver' | 'editar') => {
    const v = !todas(campo)
    PERM_AREAS.forEach(a => onToggle(a.id, campo, v))
  }
  return (
    <div className="border border-bdr rounded-lg overflow-hidden">
      <div className="flex items-center px-3 py-2 bg-card2/60 border-b border-bdr">
        <span className="flex-1 font-mono text-[10px] text-txt3 tracking-wider uppercase">Área da dashboard</span>
        <button type="button" onClick={() => marcarTodas('ver')} className="w-14 text-center font-mono text-[10px] text-txt3 hover:text-gold3 tracking-wider uppercase" title="Marcar/desmarcar todas">Ver</button>
        <button type="button" onClick={() => marcarTodas('editar')} className="w-16 text-center font-mono text-[10px] text-txt3 hover:text-gold3 tracking-wider uppercase" title="Marcar/desmarcar todas">Editar</button>
      </div>
      <div className="max-h-[46vh] overflow-y-auto">
        {PERM_AREAS.map(({ id, label }, i) => {
          const p = value[id] ?? { ver: false, editar: false }
          return (
            <div key={id} className={`flex items-center px-3 py-2 ${i % 2 ? 'bg-card2/20' : ''}`}>
              <span className="flex-1 text-sm text-txt">{label}</span>
              <span className="w-14 flex justify-center">
                <PermCheck checked={p.ver} onChange={v => { onToggle(id, 'ver', v); if (!v && p.editar) onToggle(id, 'editar', false) }} />
              </span>
              <span className="w-16 flex justify-center">
                <PermCheck checked={p.editar} onChange={v => { onToggle(id, 'editar', v); if (v && !p.ver) onToggle(id, 'ver', true) }} />
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* Modal central de edição de um cargo (abre pelo menu ⋯ → Editar) */
function EditarCargoModal({ cargo, onClose }: { cargo: CargoPermissao; onClose: () => void }) {
  const update = useUpdateCargoPerm()
  const { addToast } = useUIStore()
  const { data: me } = useMe()
  const souDev = me?.dev === true
  const [nome, setNome] = useState(cargo.nome)
  const [admin, setAdmin] = useState(!!cargo.admin)
  const [dev, setDev] = useState(!!cargo.dev)
  const [perm, setPerm] = useState<PermMap>({ ...emptyPermMap(), ...cargo.permissoes })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function toggle(area: string, campo: 'ver' | 'editar', v: boolean) {
    setPerm(p => ({ ...p, [area]: { ...(p[area] ?? { ver: false, editar: false }), [campo]: v } }))
  }
  function salvar() {
    const n = nome.trim()
    if (!n) { addToast('error', 'Informe o nome do cargo.'); return }
    update.mutate({ id: cargo.id, nome: n, admin, ...(souDev ? { dev } : {}), permissoes: perm }, {
      onSuccess: () => { addToast('success', `Cargo "${n}" atualizado.`); onClose() },
      onError: e => addToast('error', erroApi(e, 'Erro ao salvar o cargo.')),
    })
  }

  const qtdVer = PERM_AREAS.filter(a => perm[a.id]?.ver).length

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-9000 flex items-center justify-center p-4"
      style={{ backdropFilter: 'blur(6px)', background: 'rgba(5,5,5,0.75)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      role="dialog" aria-modal="true"
    >
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="w-full max-w-lg bg-card border border-bdr2 rounded-2xl shadow-2xl overflow-y-auto overscroll-contain max-h-[calc(100dvh-2rem)]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-bdr">
          <h2 className="text-sm font-semibold text-txt flex items-center gap-2"><Pencil size={15} className="text-gold3" /> Editar cargo</h2>
          <button onClick={onClose} className="text-txt3 hover:text-txt" aria-label="Fechar"><X size={16} /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="font-mono text-[10px] text-txt2 tracking-wider uppercase">Nome do cargo</label>
            <input value={nome} onChange={e => setNome(e.target.value)} maxLength={50}
              className="input-gold mt-1 w-full bg-card2 border border-bdr2 rounded-lg px-3 py-2 text-sm text-txt" />
          </div>

          {souDev && (
            <button type="button" onClick={() => setDev(v => !v)}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs transition-colors ${dev ? 'border-gold/50 bg-gold/10 text-gold3' : 'border-bdr2 text-txt2 hover:text-txt'}`}>
              <PermCheck checked={dev} onChange={setDev} />
              <Terminal size={13} /> Dev (faz tudo — só um dev concede ou retira este cargo)
            </button>
          )}

          <button type="button" onClick={() => setAdmin(v => !v)}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs transition-colors ${admin ? 'border-red/40 bg-red/10 text-red' : 'border-bdr2 text-txt2 hover:text-txt'}`}>
            <PermCheck checked={admin} onChange={setAdmin} />
            <Crown size={13} /> Acesso total (administra o sistema: contas, cargos, canais e aprovações)
          </button>

          {dev || admin ? (
            <p className="text-[11px] text-txt3 px-1">{dev ? 'Dev libera tudo, sem exceção — não é preciso marcar nada.' : 'Com acesso total, todas as áreas ficam liberadas — não é preciso marcar nada.'}</p>
          ) : (
            <>
              <p className="text-[11px] text-txt3 px-1">
                Marque o que quem tem este cargo pode <span className="text-gold3">ver</span> e <span className="text-gold3">editar</span> na dashboard.
                <span className="text-txt2"> {qtdVer} de {PERM_AREAS.length} áreas visíveis.</span>
              </p>
              <PermGrid value={perm} onToggle={toggle} />
            </>
          )}
        </div>

        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-bdr2 text-txt2 text-sm hover:text-txt transition-colors">Cancelar</button>
          <button onClick={salvar} disabled={update.isPending}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-gold text-white text-sm font-medium hover:bg-gold2 transition-colors disabled:opacity-50">
            <Check size={15} /> {update.isPending ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  )
}

/* Linha de um cargo com o menu ⋯ (Editar, padrão, excluir) */
function CargoLinha({ cargo, posicao, total, membros, onMover }: {
  cargo: CargoPermissao; posicao: number; total: number; membros: number; onMover: (delta: -1 | 1) => void
}) {
  const update = useUpdateCargoPerm()
  const del = useDeleteCargoPerm()
  const { addToast } = useUIStore()
  const { data: me } = useMe()
  const bloqueado = cargo.dev === true && me?.dev !== true   // só um dev mexe num cargo de dev
  const [menu, setMenu] = useState(false)
  const [editando, setEditando] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const fechar = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setMenu(false) }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [menu])

  const visiveis = cargo.dev || cargo.admin ? PERM_AREAS.length : PERM_AREAS.filter(a => cargo.permissoes[a.id]?.ver).length

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-card border border-bdr rounded-xl hover:border-gold/30 transition-colors">
      <div className="flex flex-col -my-1">
        <button onClick={() => onMover(-1)} disabled={posicao === 0} title="Subir na hierarquia"
          className="text-txt3 hover:text-gold3 disabled:opacity-20 transition-colors"><ChevronUp size={14} /></button>
        <button onClick={() => onMover(1)} disabled={posicao === total - 1} title="Descer na hierarquia"
          className="text-txt3 hover:text-gold3 disabled:opacity-20 transition-colors"><ChevronDown size={14} /></button>
      </div>
      <span className="font-mono text-[10px] text-txt3 w-6">{posicao + 1}º</span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-txt flex items-center gap-2 flex-wrap">
          {cargo.nome}
          {cargo.dev && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gold/15 border border-gold/40 text-gold3 text-[10px] font-mono"><Terminal size={10} /> dev</span>}
          {cargo.admin && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red/15 border border-red/40 text-red text-[10px] font-mono"><Crown size={10} /> acesso total</span>}
          {cargo.padrao && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gold/15 border border-gold/40 text-gold3 text-[10px] font-mono"><Star size={10} /> padrão</span>}
        </p>
        <p className="text-[11px] text-txt3 flex items-center gap-3 mt-0.5">
          <span className="flex items-center gap-1"><Users size={11} /> {membros} conta{membros === 1 ? '' : 's'}</span>
          <span className="flex items-center gap-1"><Eye size={11} /> {visiveis} de {PERM_AREAS.length} áreas</span>
        </p>
      </div>

      <div className="relative" ref={ref}>
        <button onClick={() => setMenu(v => !v)} disabled={bloqueado} aria-label="Opções do cargo"
          title={bloqueado ? 'Somente um dev gerencia este cargo' : undefined}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${menu ? 'bg-gold/15 text-gold3' : 'text-txt2 hover:text-txt hover:bg-white/5'}`}>
          <MoreHorizontal size={18} />
        </button>
        <AnimatePresence>
          {menu && (
            <motion.div
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}
              className="absolute right-0 top-full mt-1 z-50 w-52 bg-card border border-bdr2 rounded-lg shadow-2xl p-1"
            >
              <button onClick={() => { setMenu(false); setEditando(true) }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-txt hover:bg-white/5">
                <Pencil size={14} className="text-gold3" /> Editar
              </button>
              <button onClick={() => { setMenu(false); update.mutate({ id: cargo.id, padrao: !cargo.padrao }, { onSuccess: () => addToast('success', cargo.padrao ? 'Removido como padrão.' : 'Definido como cargo padrão.') }) }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-txt hover:bg-white/5">
                <Star size={14} className="text-gold3" /> {cargo.padrao ? 'Remover como padrão' : 'Definir como padrão'}
              </button>
              <div className="h-px bg-bdr my-1" />
              <button
                onClick={async () => {
                  setMenu(false)
                  if (await confirmar({ titulo: 'Excluir cargo', mensagem: `Excluir o cargo "${cargo.nome}"? As contas que o usam ficam sem cargo (sem acesso) até receberem outro.`, tom: 'perigo', textoConfirmar: 'Excluir' })) {
                    del.mutate(cargo.id, { onSuccess: () => addToast('success', 'Cargo excluído.') })
                  }
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-red hover:bg-red/10">
                <Trash2 size={14} /> Excluir
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {editando && <EditarCargoModal cargo={cargo} onClose={() => setEditando(false)} />}
      </AnimatePresence>
    </div>
  )
}

export default function PermissoesEditor() {
  const { data: cargos = [] } = useCargosPermissao()
  const { data: contas = [] } = useContas()
  const create = useCreateCargoPerm()
  const reorder = useReorderCargosPerm()
  const { addToast } = useUIStore()
  const [nome, setNome] = useState('')

  function mover(i: number, delta: -1 | 1) {
    const ids = cargos.map(c => c.id)
    const j = i + delta
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    reorder.mutate(ids, { onError: () => addToast('error', 'Erro ao reordenar a hierarquia.') })
  }

  function criar() {
    const n = nome.trim()
    if (!n) { addToast('error', 'Informe um nome para o cargo.'); return }
    create.mutate({ nome: n, admin: false, permissoes: emptyPermMap() }, {
      onSuccess: () => { addToast('success', `Cargo "${n}" criado. Use ⋯ → Editar para escolher o que ele acessa.`); setNome('') },
      onError: e => addToast('error', erroApi(e, 'Erro ao criar cargo.')),
    })
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-orbitron text-xs text-gold tracking-wider mb-1 flex items-center gap-2">
          <ShieldCheck size={14} /> CARGOS DE PERMISSÃO
        </h3>
        <p className="text-[11px] text-txt3 mb-3">
          Cada cargo define o que aparece na dashboard de quem o recebe. Clique em <span className="text-gold3">⋯ → Editar</span> para escolher as áreas que o cargo pode ver e editar.
        </p>

        <div className="flex gap-2">
          <input
            value={nome}
            onChange={e => setNome(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') criar() }}
            placeholder="Nome do novo cargo..."
            maxLength={50}
            className="input-gold flex-1 bg-card2 border border-bdr2 rounded-lg px-4 py-2.5 text-sm font-mono text-txt"
          />
          <HudButton onClick={criar} loading={create.isPending}>
            <Plus size={15} className="inline mr-1" /> Criar
          </HudButton>
        </div>
      </div>

      {cargos.length > 0 ? (
        <div className="space-y-2 pt-2 border-t border-bdr">
          <p className="text-[11px] text-txt3 pt-2">
            <span className="text-gold3">Hierarquia:</span> o primeiro cargo é o mais alto. Mudar alguém para um cargo acima é <span className="text-green">promoção</span>; para um abaixo, <span className="text-orange-400">rebaixamento</span>.
          </p>
          {cargos.map((c, i) => (
            <CargoLinha key={c.id} cargo={c} posicao={i} total={cargos.length}
              membros={contas.filter(ct => ct.cargoPermId === c.id).length}
              onMover={d => mover(i, d)} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-txt3 border border-dashed border-bdr rounded-xl">
          <ShieldCheck size={26} className="opacity-40" />
          <p className="font-mono text-xs">Nenhum cargo criado ainda</p>
        </div>
      )}
    </div>
  )
}
