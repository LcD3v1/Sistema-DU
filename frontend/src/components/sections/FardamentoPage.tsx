import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Shirt, Plus, Trash2, Pencil, Upload, Image as ImageIcon } from 'lucide-react'
import { useFardamentos, useCreateFardamento, useUpdateFardamento, useDeleteFardamento, type Fardamento } from '@/hooks/useFardamentos'
import { usePatentes } from '@/hooks/useConfig'
import { usePerms } from '@/hooks/usePerms'
import { useUIStore } from '@/store/uiStore'
import LoadingHud from '@/components/ui/LoadingHud'
import ModalOverlay from '@/components/ui/ModalOverlay'
import HudButton from '@/components/ui/HudButton'
import { confirmar } from '@/lib/dialogo'

const EASE = [0.16, 1, 0.3, 1] as const

interface Form { patente: string; titulo: string; imagem: string; observacoes: string }
const EMPTY: Form = { patente: '', titulo: '', imagem: '', observacoes: '' }

function fileToDataUrl(file: File, cb: (s: string) => void) {
  const r = new FileReader(); r.onload = () => cb(r.result as string); r.readAsDataURL(file)
}

export default function FardamentoPage() {
  const { data: fardamentos, isLoading } = useFardamentos()
  const { data: patentes = [] } = usePatentes()
  const { canEdit } = usePerms()
  const { addToast } = useUIStore()
  const criar = useCreateFardamento()
  const atualizar = useUpdateFardamento()
  const remover = useDeleteFardamento()

  const podeEditar = canEdit('fardamento')
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const fileRef = useRef<HTMLInputElement>(null)

  // Ordena por hierarquia de patentes (as sem patente conhecida vão ao fim)
  const lista = useMemo(() => {
    const rank = new Map(patentes.map((p, i) => [p, i]))
    return [...(fardamentos ?? [])].sort((a, b) => {
      const ra = rank.has(a.patente) ? rank.get(a.patente)! : 999
      const rb = rank.has(b.patente) ? rank.get(b.patente)! : 999
      return ra - rb || b.id - a.id
    })
  }, [fardamentos, patentes])

  function abrirNovo() {
    setEditId(null)
    setForm({ ...EMPTY, patente: patentes[0] ?? '' })
    setModalOpen(true)
  }
  function abrirEdicao(f: Fardamento) {
    setEditId(f.id)
    setForm({ patente: f.patente, titulo: f.titulo, imagem: f.imagem, observacoes: f.observacoes })
    setModalOpen(true)
  }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    if (f.size > 3_000_000) { addToast('error', 'Imagem muito grande (máx 3MB).'); return }
    fileToDataUrl(f, url => setForm(p => ({ ...p, imagem: url })))
  }
  function salvar() {
    if (!form.patente.trim()) { addToast('error', 'Escolha a patente.'); return }
    if (!form.imagem.trim()) { addToast('error', 'Anexe uma imagem do fardamento.'); return }
    const body = { patente: form.patente, titulo: form.titulo, imagem: form.imagem, observacoes: form.observacoes }
    const onOk = () => { addToast('success', editId ? 'Fardamento atualizado!' : 'Fardamento adicionado!'); setModalOpen(false) }
    const onErr = (e: unknown) => addToast('error', (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro ao salvar.')
    if (editId) atualizar.mutate({ id: editId, ...body }, { onSuccess: onOk, onError: onErr })
    else criar.mutate(body, { onSuccess: onOk, onError: onErr })
  }

  if (isLoading) return <LoadingHud />

  return (
    <div className="p-3 sm:p-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <p className="font-mono text-[10px] text-txt2 tracking-[0.2em] uppercase mb-1">Efetivo</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-txt flex items-center gap-2">
            <Shirt size={26} className="text-gold" /> Fardamento
          </h1>
          <p className="text-sm text-txt2 mt-1">Modelos de fardamento por patente da unidade.</p>
        </div>
        {podeEditar && (
          <HudButton size="sm" onClick={abrirNovo}>
            <Plus size={14} className="inline mr-1.5" /> Adicionar fardamento
          </HudButton>
        )}
      </div>

      {/* Lista */}
      {lista.length === 0 ? (
        <div className="border border-bdr rounded-xl bg-card py-20 text-center">
          <Shirt size={30} className="text-txt3 mx-auto mb-3" />
          <p className="text-txt2 text-sm">Nenhum fardamento cadastrado{podeEditar ? ' — clique em “Adicionar fardamento”.' : '.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {lista.map((f, i) => (
            <motion.div
              key={f.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.03, ease: EASE }}
              className="group relative bg-card border border-bdr rounded-xl overflow-hidden hover:border-gold/40 transition-colors"
            >
              {/* Imagem */}
              <div className="relative aspect-[3/4] bg-black/40">
                <img src={f.imagem} alt={f.patente} className="w-full h-full object-cover" />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 55%, rgba(5,7,12,0.9))' }} />
                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-gold/85 text-white text-[10px] font-mono font-bold tracking-wider">
                  {f.patente}
                </span>
                {podeEditar && (
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => abrirEdicao(f)} title="Editar"
                      className="w-7 h-7 rounded-md bg-black/60 backdrop-blur border border-white/15 text-white/80 hover:text-white flex items-center justify-center">
                      <Pencil size={13} />
                    </button>
                    <button onClick={async () => { if (await confirmar({ titulo: 'Remover fardamento', mensagem: `Remover o fardamento de ${f.patente}?`, tom: 'perigo', textoConfirmar: 'Remover' })) remover.mutate(f.id, { onSuccess: () => addToast('success', 'Fardamento removido.') }) }}
                      title="Excluir"
                      className="w-7 h-7 rounded-md bg-black/60 backdrop-blur border border-white/15 text-white/80 hover:text-red flex items-center justify-center">
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  {f.titulo && <p className="text-sm font-semibold text-white truncate">{f.titulo}</p>}
                  {f.observacoes && <p className="text-[11px] text-white/70 line-clamp-2 mt-0.5">{f.observacoes}</p>}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal criar/editar */}
      <ModalOverlay open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'EDITAR FARDAMENTO' : 'NOVO FARDAMENTO'}>
        <div className="space-y-4">
          <div>
            <label className="font-mono text-xs text-txt2 block mb-1">PATENTE</label>
            <select
              value={form.patente}
              onChange={e => setForm(p => ({ ...p, patente: e.target.value }))}
              className="input-gold w-full bg-card2 border border-bdr2 rounded px-3 py-2 text-sm font-mono text-txt"
            >
              <option value="">Selecione...</option>
              {patentes.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="font-mono text-xs text-txt2 block mb-1">TÍTULO (opcional)</label>
            <input
              value={form.titulo}
              onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))}
              placeholder="Ex: Fardamento padrão"
              className="input-gold w-full bg-card2 border border-bdr2 rounded px-3 py-2 text-sm text-txt placeholder:text-txt3"
            />
          </div>
          <div>
            <label className="font-mono text-xs text-txt2 block mb-1">IMAGEM DO FARDAMENTO</label>
            <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
            {form.imagem ? (
              <div className="relative rounded-lg overflow-hidden border border-bdr2">
                <img src={form.imagem} alt="" className="w-full max-h-64 object-contain bg-black/40" />
                <button onClick={() => fileRef.current?.click()}
                  className="absolute bottom-2 right-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-black/60 backdrop-blur border border-white/15 text-white/80 text-xs hover:text-white">
                  <Upload size={13} /> Trocar
                </button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-lg border border-dashed border-bdr2 text-txt3 hover:text-txt hover:border-gold/40 transition-colors">
                <ImageIcon size={22} /> <span className="text-xs">Clique para anexar uma imagem (máx 3MB)</span>
              </button>
            )}
          </div>
          <div>
            <label className="font-mono text-xs text-txt2 block mb-1">OBSERVAÇÕES (opcional)</label>
            <textarea
              value={form.observacoes}
              onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))}
              rows={3}
              placeholder="Detalhes do fardamento, acessórios, cores..."
              className="input-gold w-full bg-card2 border border-bdr2 rounded px-3 py-2 text-sm text-txt placeholder:text-txt3 resize-none"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <HudButton loading={criar.isPending || atualizar.isPending} onClick={salvar} className="flex-1">
              {editId ? 'SALVAR' : 'ADICIONAR'}
            </HudButton>
            <HudButton variant="ghost" onClick={() => setModalOpen(false)} className="flex-1">CANCELAR</HudButton>
          </div>
        </div>
      </ModalOverlay>
    </div>
  )
}
