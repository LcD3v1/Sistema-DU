import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Copy, ClipboardCheck, Eraser, Clipboard, Download, Info, Settings } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { useAnuncioSituacoes } from '@/hooks/useConfig'
import Brand from '@/components/ui/Brand'
import LoadingHud from '@/components/ui/LoadingHud'

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
  const [imagem, setImagem] = useState('')
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
    setLocal(''); setAssinatura(''); setImagem(''); setDuracao(60)
    manual.current = false
    if (situacoes && situacoes.length) setSituacaoId(situacoes[0].id)
    if (situacao) { setTitulo(situacao.titulo); setTexto(resolve(situacao.texto, '', '')) }
    addToast('success', 'Formulário limpo.')
  }

  async function copiar(payload: string, msg: string) {
    try { await navigator.clipboard.writeText(payload); addToast('success', msg) }
    catch { addToast('error', 'Não foi possível copiar. Copie manualmente.') }
  }

  const inputCls = 'input-gold w-full bg-card2 border border-bdr2 rounded-lg px-3 py-2.5 text-sm font-mono text-txt placeholder-txt3'
  const labelCls = 'font-mono text-[11px] text-txt2 tracking-wider block mb-1.5'

  if (isLoading) return <LoadingHud />

  return (
    <div className="p-6 max-w-[1400px]">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-txt2 hover:text-txt text-xs font-mono tracking-wider mb-4 transition-colors">
        <ChevronLeft size={14} /> VOLTAR
      </button>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <p className="font-mono text-[10px] text-gold3 tracking-[0.25em] uppercase mb-1">Ferramenta interna</p>
          <h1 className="text-3xl font-bold text-txt">Gerar anúncio</h1>
          <p className="text-sm text-txt2 mt-1">Monte a mensagem, confira como ficará no jogo e copie tudo de uma vez.</p>
        </div>
        <div className="flex items-center gap-2 text-txt2">
          <Brand size={30} />
          <span className="font-mono text-[11px] tracking-[0.15em] uppercase">FAST / Anúncio</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 items-start">
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
            <div className="grid grid-cols-3 gap-3">
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Duração em segundos *</label>
                <input type="number" min={1} max={600} value={duracao} onChange={e => setDuracao(Math.max(1, Number(e.target.value) || 0))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Imagem (URL)</label>
                <input value={imagem} onChange={e => setImagem(e.target.value)} placeholder="Deixe vazio p/ brasão padrão" className={inputCls} />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-bdr2 bg-card2/60 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-txt flex items-center gap-1.5"><Clipboard size={14} className="text-gold3" /> Auxiliar de Ctrl+V para Windows</p>
                <p className="text-[11px] text-txt3 mt-0.5">Baixe e execute uma vez. Não interfere no Ctrl+V comum.</p>
              </div>
              <button
                onClick={() => addToast('info', 'Auxiliar opcional — em breve. Por ora use "Copiar como texto".')}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-bdr2 text-txt2 text-xs hover:text-txt hover:border-bdrg transition-colors"
              >
                <Download size={13} /> Baixar auxiliar
              </button>
            </div>

            <div className="flex items-center justify-end gap-3 pt-1">
              <button onClick={() => copiar(mensagemCompleta, 'Texto copiado!')} className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-bdr2 text-txt2 text-sm hover:text-txt hover:border-bdrg transition-colors">
                <Copy size={15} /> Copiar como texto
              </button>
              <button onClick={() => copiar(mensagemCompleta, 'Pronto! Cole no jogo com Ctrl+V.')} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gold text-white text-sm font-medium hover:bg-gold2 transition-colors shadow-[0_10px_30px_-12px_rgba(58,114,196,0.7)]">
                <ClipboardCheck size={16} /> Preparar sequência Ctrl+V
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
                  : <Brand size={56} />}
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
