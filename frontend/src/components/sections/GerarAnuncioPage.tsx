import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Copy, Eraser, Info, Settings, ImagePlus, Link2, Loader2 } from 'lucide-react'
import api from '@/lib/axios'
import { useUIStore } from '@/store/uiStore'
import { useAnuncioSituacoes } from '@/hooks/useConfig'
import Brand from '@/components/ui/Brand'
import LoadingHud from '@/components/ui/LoadingHud'

/** Brasão padrão do anúncio: escudo NPD, com fallback pro emblema FAST se não existir. */
function DefaultEmblem({ size = 56 }: { size?: number }) {
  const [erro, setErro] = useState(false)
  if (erro) return <Brand size={size} />
  return <img src="/media/npd-shield.png" alt="" width={size} height={size} className="object-contain" style={{ width: size, height: size }} onError={() => setErro(true)} />
}

const TIPOS_FOTO = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const MAX_FOTO = 3 * 1024 * 1024

/** Logo padrão da NPD já preenchida no campo de imagem — editável para trocar por outro link. */
const LOGO_NPD = 'https://fastunit.shardweb.app/media/npd-shield.png'

function resolve(template: string, local: string, assinatura: string) {
  return template
    .replace(/\[LOCAL\]/g, local.trim() || '[LOCAL]')
    .replace(/\[ASSINATURA\]/g, assinatura.trim() || '[ASSINATURA]')
}

export default function GerarAnuncioPage() {
  const navigate = useNavigate()
  const { addToast } = useUIStore()
  const { data: situacoes, isLoading } = useAnuncioSituacoes()

  const [situacaoId, setSituacaoId] = useState<number | null>(null)
  const [local, setLocal] = useState('')
  const [assinatura, setAssinatura] = useState('')
  const [titulo, setTitulo] = useState('')
  const [texto, setTexto] = useState('')
  const [duracao, setDuracao] = useState(60)
  const [imagem, setImagem] = useState(LOGO_NPD)
  const manual = useRef(false)

  const situacao = useMemo(
    () => (situacoes ?? []).find(s => s.id === situacaoId) ?? null,
    [situacoes, situacaoId],
  )

  // Seleciona a primeira situação assim que a lista carrega
  useEffect(() => {
    if (situacaoId === null && situacoes && situacoes.length > 0) {
      setSituacaoId(situacoes[0].id)
    }
  }, [situacoes, situacaoId])

  // Troca de situação → título + reseta edição manual
  useEffect(() => {
    if (situacao) { setTitulo(situacao.titulo); manual.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [situacaoId])

  // Regenera o texto (com LOCAL/ASSINATURA já resolvidos) ao vivo — a menos que editado à mão
  useEffect(() => {
    if (situacao && !manual.current) setTexto(resolve(situacao.texto, local, assinatura))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [situacaoId, local, assinatura, situacao])

  const previewTexto = useMemo(() => resolve(texto, local, assinatura), [texto, local, assinatura])
  const mensagemCompleta = useMemo(() => `${titulo}\n${previewTexto}`.trim(), [titulo, previewTexto])

  function limpar() {
    setLocal(''); setAssinatura(''); setImagem(LOGO_NPD); setDuracao(60)
    manual.current = false
    if (situacoes && situacoes.length) setSituacaoId(situacoes[0].id)
    if (situacao) { setTitulo(situacao.titulo); setTexto(resolve(situacao.texto, '', '')) }
    addToast('success', 'Formulário limpo.')
  }

  async function copiar(payload: string, msg: string) {
    try { await navigator.clipboard.writeText(payload); addToast('success', msg) }
    catch { addToast('error', 'Não foi possível copiar. Copie manualmente.') }
  }

  // Foto enviada → o sistema guarda e devolve um link fixo para colar no jogo
  const arquivoRef = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  async function enviarFoto(arquivo: File) {
    if (!TIPOS_FOTO.includes(arquivo.type)) { addToast('error', 'Use uma imagem PNG, JPG, WEBP ou GIF.'); return }
    if (arquivo.size > MAX_FOTO) { addToast('error', 'A imagem pode ter no máximo 3 MB.'); return }
    setEnviando(true)
    try {
      const dataUrl = await new Promise<string>((ok, falha) => {
        const r = new FileReader(); r.onload = () => ok(r.result as string); r.onerror = falha; r.readAsDataURL(arquivo)
      })
      const { data } = await api.post<{ caminho: string }>('/anuncio/imagem', { imagem: dataUrl })
      const link = `${window.location.origin}${data.caminho}`
      setImagem(link)
      await copiar(link, 'Imagem enviada! Link copiado.')
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
      addToast('error', msg || 'Não foi possível enviar a imagem.')
    } finally { setEnviando(false) }
  }

  const inputCls = 'input-gold w-full bg-card2 border border-bdr2 rounded-lg px-3 py-2.5 text-sm font-mono text-txt placeholder-txt3'
  const labelCls = 'font-mono text-[11px] text-txt2 tracking-wider block mb-1.5'

  if (isLoading) return <LoadingHud />

  return (
    <div className="w-full max-w-[1800px] mx-auto p-3 sm:p-6 lg:px-8">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-txt2 hover:text-txt text-xs font-mono tracking-wider mb-4 transition-colors">
        <ChevronLeft size={14} /> VOLTAR
      </button>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <p className="font-mono text-[10px] text-gold3 tracking-[0.25em] uppercase mb-1">Ferramenta interna</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-txt">Gerar anúncio</h1>
          <p className="text-sm text-txt2 mt-1">Monte a mensagem, confira como ficará no jogo e copie tudo de uma vez.</p>
        </div>
        <div className="flex items-center gap-2 text-txt2">
          <Brand size={30} />
          <span className="font-mono text-[11px] tracking-[0.15em] uppercase">FAST / Anúncio</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-start">
        {/* ── Formulário ─────────────────────────────────────── */}
        <div className="bg-card border border-bdr rounded-xl p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-base font-semibold text-txt">Conteúdo do anúncio</h2>
            <button onClick={limpar} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-bdr2 text-txt2 text-xs hover:text-txt hover:border-bdrg transition-colors">
              <Eraser size={13} /> Limpar
            </button>
          </div>
          <p className="text-xs text-txt3 mb-5">Escolha a situação e informe o local e a assinatura.</p>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-mono text-[11px] text-txt2 tracking-wider">Situação *</label>
                  <button onClick={() => navigate('/configuracoes')} title="Gerenciar situações" className="text-txt3 hover:text-gold3 transition-colors">
                    <Settings size={12} />
                  </button>
                </div>
                <select value={situacaoId ?? ''} onChange={e => setSituacaoId(Number(e.target.value))} className={inputCls}>
                  {(situacoes ?? []).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Local *</label>
                <input value={local} onChange={e => setLocal(e.target.value)} placeholder="Ex: Região Bebidas Samir" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Assinatura do perfil *</label>
                <input value={assinatura} onChange={e => setAssinatura(e.target.value)} placeholder="SO. Peter Wolf" className={inputCls} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Título *</label>
              <input value={titulo} onChange={e => setTitulo(e.target.value)} className={inputCls} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-mono text-[11px] text-txt2 tracking-wider">Texto *</label>
                <span className={`font-mono text-[10px] ${texto.length > 2000 ? 'text-red' : 'text-txt3'}`}>{texto.length}/2000</span>
              </div>
              <textarea
                value={texto}
                onChange={e => { setTexto(e.target.value); manual.current = true }}
                rows={6} maxLength={2000}
                className={`${inputCls} resize-none leading-relaxed`}
              />
              <p className="font-mono text-[10px] text-txt3 mt-1.5">
                O <span className="text-gold3">[LOCAL]</span> e a <span className="text-gold3">[ASSINATURA]</span> são preenchidos automaticamente. Editar o texto pausa o preenchimento (troque a situação para retomar).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Duração em segundos *</label>
                <input type="number" min={1} max={600} value={duracao} onChange={e => setDuracao(Math.max(1, Number(e.target.value) || 0))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Imagem (URL)</label>
                <div className="flex gap-2">
                  <input value={imagem} onChange={e => setImagem(e.target.value)} placeholder="Envie uma foto ou cole um link" className={`${inputCls} min-w-0`} />
                  <input ref={arquivoRef} type="file" accept={TIPOS_FOTO.join(',')} className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) enviarFoto(f) }} />
                  <button type="button" onClick={() => arquivoRef.current?.click()} disabled={enviando} title="Enviar foto"
                    className="shrink-0 flex items-center gap-1.5 px-3 rounded-lg border border-bdr2 text-txt2 text-xs hover:text-txt hover:border-bdrg transition-colors disabled:opacity-60">
                    {enviando ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />} Foto
                  </button>
                </div>
                {imagem.trim() && (
                  <button type="button" onClick={() => copiar(imagem.trim(), 'Link da imagem copiado!')}
                    className="mt-1.5 flex items-center gap-1 font-mono text-[10px] text-gold3 hover:text-txt transition-colors">
                    <Link2 size={12} /> Copiar link da imagem
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-1">
              <button onClick={() => copiar(mensagemCompleta, 'Texto copiado!')} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gold text-white text-sm font-medium hover:bg-gold2 transition-colors shadow-[0_10px_30px_-12px_rgba(58,114,196,0.7)]">
                <Copy size={15} /> Copiar como texto
              </button>
            </div>
          </div>
        </div>

        {/* ── Prévia ─────────────────────────────────────────── */}
        <div className="bg-card border border-bdr rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-txt">Prévia</h2>
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-txt3 tracking-wider uppercase"><Info size={12} /> Atualização automática</span>
          </div>

          <div className="rounded-xl border border-gold/30 bg-gradient-to-br from-navy2/30 to-black/40 p-4 shadow-[0_20px_50px_-24px_rgba(58,114,196,0.5)]">
            <div className="flex items-start gap-3">
              <div className="shrink-0 rounded-lg overflow-hidden border border-gold/30 bg-black/40 p-1">
                {imagem.trim()
                  ? <img src={imagem} alt="" className="w-14 h-14 object-cover rounded" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  : <DefaultEmblem size={56} />}
              </div>
              <div className="min-w-0">
                <p className="wordmark text-gold3 text-sm tracking-wide mb-1">{titulo || 'N.P.D INFORMA:'}</p>
                <p className="text-[13px] text-txt leading-relaxed whitespace-pre-wrap break-words">{previewTexto}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="rounded-lg border border-bdr bg-card2/50 p-3">
              <p className="font-mono text-[10px] text-txt2 tracking-wider uppercase mb-1">Duração</p>
              <p className="text-lg font-bold text-txt">{duracao}<span className="text-xs text-txt3 ml-1">s</span></p>
            </div>
            <div className="rounded-lg border border-bdr bg-card2/50 p-3">
              <p className="font-mono text-[10px] text-txt2 tracking-wider uppercase mb-1">Imagem</p>
              <p className="text-sm text-txt truncate">{imagem.trim() ? imagem : 'Brasão padrão NPD'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
