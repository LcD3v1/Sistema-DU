import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Images, Plus, Search, Pencil, Trash2, Calendar, User, Upload, Link2, Loader2, Tag, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  galeriaApi, enviarArquivo, erroApi, normalizar, hojeISO, dataBR, MAX_BYTES_ARQUIVO, ACEITA_IMAGENS,
  type FotoGaleria, type ArquivoRef,
} from '@/hooks/useInvestigacao'
import { usePerms } from '@/hooks/usePerms'
import { useUIStore } from '@/store/uiStore'
import LoadingHud from '@/components/ui/LoadingHud'
import ModalOverlay from '@/components/ui/ModalOverlay'
import { confirmar } from '@/lib/dialogo'
import { linkSeguro } from '@/lib/plataformas'
import { INPUT, Campo, CabecalhoPagina, BotaoPrimario, BotaoSecundario, Vazio, ImagemArquivo } from '@/components/investigacao/Campos'

/**
 * Galeria da DU — fotos de operações, atividades e registros da unidade,
 * com descrição, data, categoria e quem publicou. Foto por link ou do computador.
 */

const EASE = [0.16, 1, 0.3, 1] as const

interface Form { imagem: string; arquivo: ArquivoRef | null; titulo: string; descricao: string; categoria: string; data: string }
const vazio = (): Form => ({ imagem: '', arquivo: null, titulo: '', descricao: '', categoria: '', data: hojeISO() })

function Foto({ foto, className = '' }: { foto: Pick<FotoGaleria, 'imagem' | 'arquivo' | 'titulo'>; className?: string }) {
  if (foto.arquivo) return <ImagemArquivo arquivo={foto.arquivo} alt={foto.titulo} className={className} />
  if (foto.imagem && linkSeguro(foto.imagem)) return <img src={foto.imagem} alt={foto.titulo} referrerPolicy="no-referrer" loading="lazy" decoding="async" className={`${className} object-cover`} />
  return <div className={`${className} bg-card2`} />
}

export default function GaleriaPage() {
  const { data: fotos, isLoading, isError } = galeriaApi.useLista()
  const { canEdit } = usePerms()
  const { addToast } = useUIStore()
  const salvar = galeriaApi.useSalvar()
  const remover = galeriaApi.useRemover()
  const podePublicar = canEdit('galeria')
  const input = useRef<HTMLInputElement>(null)

  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState('')
  const [abertoIdx, setAbertoIdx] = useState<number | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const [enviando, setEnviando] = useState(false)

  const categorias = useMemo(() => [...new Set((fotos ?? []).map(f => f.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [fotos])
  const lista = useMemo(() => {
    const termos = normalizar(busca.trim()).split(/\s+/).filter(Boolean)
    return (fotos ?? []).filter(f => (!categoria || f.categoria === categoria)
      && termos.every(t => normalizar(`${f.titulo} ${f.descricao} ${f.categoria} ${f.autorNome}`).includes(t)))
  }, [fotos, busca, categoria])
  const aberto = abertoIdx !== null ? lista[abertoIdx] ?? null : null

  async function escolherArquivo(file: File | undefined) {
    if (!file || !form) return
    if (file.size > MAX_BYTES_ARQUIVO) { addToast('error', 'A foto passa de 10 MB.'); return }
    setEnviando(true)
    try {
      const ref = await enviarArquivo(file, 'galeria')
      setForm(f => f && { ...f, arquivo: ref, imagem: '', titulo: f.titulo || file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 120) })
    } catch (e) { addToast('error', erroApi(e, 'Não foi possível enviar a foto.')) } finally { setEnviando(false) }
  }
  function abrirEdicao(f: FotoGaleria) {
    setAbertoIdx(null); setEditId(f.id)
    setForm({ imagem: f.imagem, arquivo: f.arquivo, titulo: f.titulo, descricao: f.descricao, categoria: f.categoria, data: f.data })
  }
  function enviar() {
    if (!form) return
    if (!form.arquivo && !linkSeguro(form.imagem.trim())) { addToast('error', 'Envie uma foto do computador ou cole um link de imagem.'); return }
    if (!form.titulo.trim()) { addToast('error', 'Dê um título à foto.'); return }
    salvar.mutate({ id: editId ?? undefined, imagem: form.arquivo ? '' : form.imagem.trim(), arquivo: form.arquivo?.id ?? '', titulo: form.titulo,
      descricao: form.descricao, categoria: form.categoria, data: form.data }, {
      onSuccess: () => { addToast('success', editId ? 'Foto atualizada!' : 'Foto publicada na galeria!'); setForm(null) },
      onError: e => addToast('error', erroApi(e)),
    })
  }
  async function excluir(f: FotoGaleria) {
    if (!(await confirmar({ titulo: 'Excluir foto', mensagem: `Excluir "${f.titulo}" da galeria?`, tom: 'perigo', textoConfirmar: 'Excluir' }))) return
    remover.mutate(f.id, { onSuccess: () => { addToast('success', 'Foto excluída.'); setAbertoIdx(null) }, onError: e => addToast('error', erroApi(e)) })
  }
  const passar = (d: number) => setAbertoIdx(i => i === null || lista.length === 0 ? i : (i + d + lista.length) % lista.length)

  if (isLoading) return <LoadingHud />

  return (
    <div className="w-full max-w-[1800px] mx-auto p-3 sm:p-6 lg:px-8">
      <CabecalhoPagina sobretitulo="Unidade" titulo="Galeria da DU" icone={Images}
        descricao="Operações, atividades e registros da Detective Unit em um só lugar.">
        {podePublicar && <BotaoPrimario onClick={() => { setEditId(null); setForm(vazio()) }}><Plus size={15} /> Publicar foto</BotaoPrimario>}
      </CabecalhoPagina>

      {(fotos?.length ?? 0) > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 mb-5">
          <div className="relative sm:w-80">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt3" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar foto, descrição ou autor" aria-label="Buscar na galeria"
              className="input-gold w-full bg-card border border-bdr2 rounded-lg pl-9 pr-3 py-2 text-sm text-txt" />
          </div>
          {categorias.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {['', ...categorias].map(c => (
                <button key={c || 'todas'} onClick={() => setCategoria(c)} aria-pressed={categoria === c}
                  className={`px-3 py-1 rounded-full text-xs font-mono transition-colors ${categoria === c ? 'bg-gold/15 text-gold3 border border-gold/40' : 'text-txt2 border border-bdr2 hover:text-txt'}`}>
                  {c || 'Todas'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {isError ? (
        <div className="border border-bdr rounded-xl bg-card py-16 text-center text-sm text-red">Não foi possível carregar a galeria.</div>
      ) : (fotos?.length ?? 0) === 0 ? (
        <Vazio icone={Images}>A galeria ainda está vazia{podePublicar ? ' — publique a primeira foto.' : '.'}</Vazio>
      ) : lista.length === 0 ? (
        <Vazio icone={Search}>Nenhuma foto encontrada.</Vazio>
      ) : (
        <div className="columns-2 sm:columns-3 lg:columns-4 2xl:columns-5 gap-3 [column-fill:_balance]">
          {lista.map((f, i) => (
            <motion.button key={f.id} onClick={() => setAbertoIdx(i)} aria-label={`Abrir ${f.titulo}`}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: Math.min(i, 20) * 0.03, ease: EASE }}
              className="group relative mb-3 block w-full break-inside-avoid overflow-hidden rounded-xl border border-bdr hover:border-gold/50 text-left">
              <Foto foto={f} className={`w-full ${i % 3 === 0 ? 'aspect-[4/5]' : i % 3 === 1 ? 'aspect-square' : 'aspect-[4/3]'}`} />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 pt-10">
                <p className="text-sm font-medium text-white line-clamp-1">{f.titulo}</p>
                <p className="text-[11px] text-white/70">{dataBR(f.data)} · {f.autorNome}</p>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {/* Visualizar */}
      <ModalOverlay open={!!aberto} onClose={() => setAbertoIdx(null)} title="GALERIA DA DU" maxWidth="max-w-5xl">
        {aberto && (
          <div className="space-y-4">
            <div className="relative rounded-lg overflow-hidden bg-black">
              <Foto foto={aberto} className="w-full max-h-[65vh] !object-contain" />
              {lista.length > 1 && <>
                <button onClick={() => passar(-1)} aria-label="Foto anterior" className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-white hover:bg-gold"><ChevronLeft size={18} /></button>
                <button onClick={() => passar(1)} aria-label="Próxima foto" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-white hover:bg-gold"><ChevronRight size={18} /></button>
              </>}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-txt break-words">{aberto.titulo}</h3>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-txt2 mt-1">
                <span className="inline-flex items-center gap-1"><Calendar size={12} /> {dataBR(aberto.data)}</span>
                <span className="inline-flex items-center gap-1"><User size={12} /> {aberto.autorNome}</span>
                {aberto.categoria && <span className="inline-flex items-center gap-1"><Tag size={12} /> {aberto.categoria}</span>}
              </div>
              {aberto.descricao && <p className="text-sm text-txt2 mt-3 whitespace-pre-line break-words">{aberto.descricao}</p>}
            </div>
            {aberto.podeEditar && (
              <div className="flex gap-2 pt-2 border-t border-bdr">
                <BotaoSecundario onClick={() => abrirEdicao(aberto)}><Pencil size={13} /> Editar</BotaoSecundario>
                <BotaoSecundario onClick={() => excluir(aberto)} className="hover:!text-red"><Trash2 size={13} /> Excluir</BotaoSecundario>
              </div>
            )}
          </div>
        )}
      </ModalOverlay>

      {/* Publicar / editar */}
      <ModalOverlay open={!!form} onClose={() => setForm(null)} title={editId ? 'EDITAR FOTO' : 'PUBLICAR FOTO'} maxWidth="max-w-2xl">
        {form && (
          <div className="space-y-4">
            <div className="rounded-xl border border-bdr bg-card2 overflow-hidden">
              {form.arquivo || linkSeguro(form.imagem.trim())
                ? <Foto foto={{ ...form, imagem: form.imagem.trim() }} className="w-full max-h-72 aspect-video" />
                : <div className="aspect-video flex items-center justify-center text-txt3 text-sm"><Images size={28} /></div>}
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <BotaoSecundario type="button" onClick={() => input.current?.click()} disabled={enviando} className="sm:w-56">
                {enviando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {form.arquivo ? 'Trocar foto' : 'Enviar do computador'}
              </BotaoSecundario>
              <input ref={input} type="file" accept={ACEITA_IMAGENS} className="hidden" onChange={e => { void escolherArquivo(e.target.files?.[0]); e.target.value = '' }} />
              <div className="relative flex-1">
                <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt3" />
                <input value={form.imagem} maxLength={2048} inputMode="url" onChange={e => setForm({ ...form, imagem: e.target.value, arquivo: null })}
                  placeholder="ou cole o link da imagem" className={`${INPUT} pl-9 font-mono`} />
              </div>
            </div>
            <Campo rotulo="Título *"><input value={form.titulo} maxLength={120} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Operação Midnight — briefing" className={INPUT} /></Campo>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo rotulo="Data"><input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} className={INPUT} /></Campo>
              <Campo rotulo="Categoria">
                <input value={form.categoria} maxLength={40} list="categorias-galeria" onChange={e => setForm({ ...form, categoria: e.target.value })} placeholder="Ex.: Operações" className={INPUT} />
                <datalist id="categorias-galeria">{['Operações', 'Treinamentos', 'Eventos', 'Registros', ...categorias].filter((v, i, a) => a.indexOf(v) === i).map(c => <option key={c} value={c} />)}</datalist>
              </Campo>
            </div>
            <Campo rotulo="Descrição"><textarea value={form.descricao} maxLength={1000} rows={3} onChange={e => setForm({ ...form, descricao: e.target.value })} className={`${INPUT} resize-none`} /></Campo>
            <div className="flex gap-2 pt-1">
              <BotaoPrimario onClick={enviar} disabled={salvar.isPending || enviando} className="flex-1"><Images size={14} /> {salvar.isPending ? 'Salvando...' : editId ? 'Salvar alterações' : 'Publicar'}</BotaoPrimario>
              <BotaoSecundario onClick={() => setForm(null)}>Cancelar</BotaoSecundario>
            </div>
          </div>
        )}
      </ModalOverlay>
    </div>
  )
}
