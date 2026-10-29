import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Shirt, Plus, Trash2, Pencil, Upload, Image as ImageIcon, Link2, Loader2 } from 'lucide-react'
import api from '@/lib/axios'
import { useFardamentos, useCreateFardamento, useUpdateFardamento, useDeleteFardamento, type Fardamento } from '@/hooks/useFardamentos'
import { usePatentes } from '@/hooks/useConfig'
import { usePerms } from '@/hooks/usePerms'
import { useUIStore } from '@/store/uiStore'
import LoadingHud from '@/components/ui/LoadingHud'
import ModalOverlay from '@/components/ui/ModalOverlay'
import HudButton from '@/components/ui/HudButton'
import { confirmar } from '@/lib/dialogo'
import { ACEITA_FOTO, fotoDoArquivo, mensagemErroFoto } from '@/lib/imagemArquivo'

const EASE = [0.16, 1, 0.3, 1] as const

interface Form { patente: string; titulo: string; imagem: string; observacoes: string }
const EMPTY: Form = { patente: '', titulo: '', imagem: '', observacoes: '' }

/** Link para colar no RP: foto do sistema ("/img/...") vira link completo; link externo fica como está; upload antigo não tem link. */
const linkDaImagem = (imagem: string) =>
  imagem.startsWith('/img/') ? `${window.location.origin}${imagem}` : /^https?:\/\//i.test(imagem) ? imagem : null
const erroDaApi = (e: unknown, padrao: string) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? padrao


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
  // Foto enviada → o sistema guarda e devolve um link fixo (o mesmo do Gerar anúncio) para colar no RP
  const [enviando, setEnviando] = useState(false)
  async function linkDaFoto(dataUrl: string): Promise<string> {
    return (await api.post<{ caminho: string }>('/fardamentos/imagem', { imagem: dataUrl })).data.caminho
  }
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return
    setEnviando(true)
    try {
      let dataUrl: string
      try { dataUrl = await fotoDoArquivo(f, { maxLado: 1600, formato: 'image/webp', manterGifAte: 3 * 1024 * 1024 }) }
      catch (err) { addToast('error', mensagemErroFoto(err)); return }
      const caminho = await linkDaFoto(dataUrl)
      setForm(p => ({ ...p, imagem: caminho }))
    } catch (err) { addToast('error', erroDaApi(err, 'Não foi possível enviar a foto.')) }
    finally { setEnviando(false) }
  }
  async function copiar(link: string) {
    try { await navigator.clipboard.writeText(link); addToast('success', 'Link da foto copiado!') }
    catch { addToast('error', 'Não foi possível copiar. Copie manualmente.') }
  }
  // Fardamento antigo (foto guardada dentro do registro): gera o link fixo e já troca no fardamento
  const [gerando, setGerando] = useState<number | null>(null)
  async function gerarLink(f: Fardamento) {
    setGerando(f.id)
    try {
      const caminho = await linkDaFoto(f.imagem)
      await atualizar.mutateAsync({ id: f.id, imagem: caminho })
      await copiar(linkDaImagem(caminho)!)
    } catch (err) { addToast('error', erroDaApi(err, 'Não foi possível gerar o link.')) }
    finally { setGerando(null) }
  }
  function salvar() {
    if (!form.patente.trim()) { addToast('error', 'Escolha a patente.'); return }
    if (enviando) { addToast('error', 'Espere a foto terminar de enviar.'); return }
    if (!form.imagem.trim()) { addToast('error', 'Anexe uma imagem do fardamento.'); return }
    const body = { patente: form.patente, titulo: form.titulo, imagem: form.imagem, observacoes: form.observacoes }
    const onOk = () => { addToast('success', editId ? 'Fardamento atualizado!' : 'Fardamento adicionado!'); setModalOpen(false) }
    const onErr = (e: unknown) => addToast('error', (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro ao salvar.')
    if (editId) atualizar.mutate({ id: editId, ...body }, { onSuccess: onOk, onError: onErr })
    else criar.mutate(body, { onSuccess: onOk, onError: onErr })
  }

  if (isLoading) return <LoadingHud />

  return (
    <div className="w-full max-w-450 mx-auto p-3 sm:p-6 lg:px-8">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-6">
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
                <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-gold/85 text-white text-xs font-mono font-bold tracking-wider">
                  {f.patente}
                </span>
                {podeEditar && (
                  <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
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
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  {f.titulo && <p className="text-base font-semibold text-white truncate">{f.titulo}</p>}
                  {f.observacoes && <p className="text-xs text-white/70 line-clamp-3 mt-1">{f.observacoes}</p>}
                </div>
              </div>
              {/* Link da foto para colar no RP */}
              <div className="flex items-center gap-3 px-4 py-3 border-t border-bdr">
                {linkDaImagem(f.imagem) ? (
                  <>
                    <p className="flex-1 min-w-0 font-mono text-[11px] text-txt3 truncate" title={linkDaImagem(f.imagem)!}>{linkDaImagem(f.imagem)}</p>
                    <button type="button" onClick={() => copiar(linkDaImagem(f.imagem)!)}
                      className="shrink-0 flex items-center gap-1.5 font-mono text-[11px] text-gold3 hover:text-txt transition-colors">
                      <Link2 size={13} /> Copiar link
                    </button>
                  </>
                ) : podeEditar ? (
                  <button type="button" onClick={() => gerarLink(f)} disabled={gerando !== null}
                    className="flex items-center gap-1.5 font-mono text-[11px] text-gold3 hover:text-txt transition-colors disabled:opacity-60">
                    {gerando === f.id ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />} Gerar link da foto
                  </button>
                ) : (
                  <p className="font-mono text-[11px] text-txt3">Sem link — peça para quem edita gerar.</p>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal criar/editar */}
      <ModalOverlay open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'EDITAR FARDAMENTO' : 'NOVO FARDAMENTO'} maxWidth="max-w-3xl">
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
            <input ref={fileRef} type="file" accept={ACEITA_FOTO} onChange={onFile} className="hidden" />
            {enviando ? (
              <div className="w-full flex flex-col items-center justify-center gap-3 py-24 rounded-lg border border-dashed border-bdr2 text-txt3">
                <Loader2 size={30} className="animate-spin text-gold3" /> <span className="text-sm">Enviando a foto…</span>
              </div>
            ) : form.imagem ? (
              <>
                <div className="relative rounded-lg overflow-hidden border border-bdr2">
                  <img src={form.imagem} alt="" className="w-full max-h-[60vh] min-h-64 object-contain bg-black/40" />
                  <button onClick={() => fileRef.current?.click()}
                    className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-2 rounded-md bg-black/60 backdrop-blur border border-white/15 text-white/80 text-sm hover:text-white">
                    <Upload size={14} /> Trocar
                  </button>
                </div>
                {linkDaImagem(form.imagem) && (
                  <button type="button" onClick={() => copiar(linkDaImagem(form.imagem)!)}
                    className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-gold3 hover:text-txt transition-colors">
                    <Link2 size={13} /> Copiar link da foto
                  </button>
                )}
              </>
            ) : (
              <button onClick={() => fileRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-3 py-24 rounded-lg border border-dashed border-bdr2 text-txt3 hover:text-txt hover:border-gold/40 transition-colors">
                <ImageIcon size={34} /> <span className="text-sm">Clique para enviar a foto — o link fica pronto para colar no RP</span>
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
