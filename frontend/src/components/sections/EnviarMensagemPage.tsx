import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ChevronLeft, Send, Loader2, Hash, AlertTriangle, Eraser, Info } from 'lucide-react'
import api from '@/lib/axios'
import { useUIStore } from '@/store/uiStore'
import { useAuthStore } from '@/store/authStore'
import Brand from '@/components/ui/Brand'
import LoadingHud from '@/components/ui/LoadingHud'

const MAX_TITULO = 100
const MAX_MENSAGEM = 3500

interface CanaisResp { botConfigurado: boolean; canais: { id: string; name: string }[] }

const erroApi = (err: unknown, padrao: string) =>
  (err as { response?: { data?: { error?: string } } }).response?.data?.error || padrao

/** Envia uma mensagem pelo bot, no painel da FAST (Components V2), no canal escolhido. */
export default function EnviarMensagemPage() {
  const navigate = useNavigate()
  const { addToast } = useUIStore()
  const usuario = useAuthStore(s => s.user)
  const [canalId, setCanalId] = useState('')
  const [titulo, setTitulo] = useState('')
  const [mensagem, setMensagem] = useState('')

  const canais = useQuery({
    queryKey: ['mensagens', 'canais'],
    queryFn: async () => (await api.get<CanaisResp>('/mensagens/canais')).data,
    staleTime: 30_000,
  })
  const canal = useMemo(() => canais.data?.canais.find(c => c.id === canalId), [canais.data, canalId])

  const enviar = useMutation({
    mutationFn: () => api.post('/mensagens', { canalId, titulo: titulo.trim() || undefined, mensagem: mensagem.trim() }),
    onSuccess: () => {
      addToast('success', `Mensagem enviada em #${canal?.name ?? 'canal'}.`)
      setTitulo(''); setMensagem('')
    },
    onError: err => addToast('error', erroApi(err, 'Não foi possível enviar a mensagem.')),
  })

  const pronto = Boolean(canalId && mensagem.trim()) && mensagem.length <= MAX_MENSAGEM && !enviar.isPending
  const inputCls = 'input-gold w-full bg-card2 border border-bdr2 rounded-lg px-3 py-2.5 text-sm text-txt placeholder-txt3'
  const labelCls = 'font-mono text-[11px] text-txt2 tracking-wider block mb-1.5'

  if (canais.isLoading) return <LoadingHud />

  return (
    <div className="w-full max-w-[1800px] mx-auto p-3 sm:p-6 lg:px-8">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-txt2 hover:text-txt text-xs font-mono tracking-wider mb-4 transition-colors">
        <ChevronLeft size={14} /> VOLTAR
      </button>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <p className="font-mono text-[10px] text-gold3 tracking-[0.25em] uppercase mb-1">Discord</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-txt">Enviar mensagem</h1>
          <p className="text-sm text-txt2 mt-1">Escreva, escolha o canal e o bot da FAST publica no painel oficial.</p>
        </div>
        <div className="flex items-center gap-2 text-txt2">
          <Brand size={30} />
          <span className="font-mono text-[11px] tracking-[0.15em] uppercase">FAST / Mensagem</span>
        </div>
      </div>

      {canais.isError || canais.data?.botConfigurado === false ? (
        <div className="flex items-start gap-3 rounded-xl border border-red/40 bg-red/10 p-4 text-sm text-txt">
          <AlertTriangle size={18} className="text-red shrink-0 mt-0.5" />
          {canais.isError ? erroApi(canais.error, 'Não foi possível carregar os canais do Discord.') : 'O bot do Discord não está configurado no servidor.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-start">
          {/* ── Formulário ─────────────────────────────────────── */}
          <form className="bg-card border border-bdr rounded-xl p-5 space-y-4" onSubmit={e => { e.preventDefault(); if (pronto) enviar.mutate() }}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-txt">Mensagem</h2>
              <button type="button" onClick={() => { setTitulo(''); setMensagem('') }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-bdr2 text-txt2 text-xs hover:text-txt hover:border-bdrg transition-colors">
                <Eraser size={13} /> Limpar
              </button>
            </div>

            <div>
              <label className={labelCls}>Canal *</label>
              <select value={canalId} onChange={e => setCanalId(e.target.value)} className={inputCls}>
                <option value="">Escolha o canal…</option>
                {(canais.data?.canais ?? []).map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-mono text-[11px] text-txt2 tracking-wider">Título</label>
                <span className="font-mono text-[10px] text-txt3">{titulo.length}/{MAX_TITULO}</span>
              </div>
              <input value={titulo} maxLength={MAX_TITULO} onChange={e => setTitulo(e.target.value)} placeholder="Opcional" className={inputCls} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-mono text-[11px] text-txt2 tracking-wider">Texto *</label>
                <span className={`font-mono text-[10px] ${mensagem.length > MAX_MENSAGEM ? 'text-red' : 'text-txt3'}`}>{mensagem.length}/{MAX_MENSAGEM}</span>
              </div>
              <textarea value={mensagem} onChange={e => setMensagem(e.target.value)} rows={9} maxLength={MAX_MENSAGEM}
                placeholder="Escreva a mensagem. Dá para usar **negrito**, *itálico* e listas do Discord."
                className={`${inputCls} resize-y leading-relaxed`} />
              <p className="flex items-start gap-1.5 font-mono text-[10px] text-txt3 mt-1.5">
                <Info size={12} className="shrink-0 mt-px" /> Menções (@everyone, @cargo, @pessoa) aparecem no texto, mas o bot não notifica ninguém.
              </p>
            </div>

            <div className="flex justify-end pt-1">
              <button type="submit" disabled={!pronto}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gold text-white text-sm font-medium hover:bg-gold2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_10px_30px_-12px_rgba(58,114,196,0.7)]">
                {enviar.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Enviar no Discord
              </button>
            </div>
          </form>

          {/* ── Prévia (como sai no Discord) ───────────────────── */}
          <div className="bg-card border border-bdr rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-txt">Prévia no Discord</h2>
              <span className="flex items-center gap-1 font-mono text-[11px] text-txt2"><Hash size={12} />{canal?.name ?? 'canal'}</span>
            </div>
            <div className="rounded-lg bg-[#2b2d31] p-4">
              <div className="flex rounded-lg overflow-hidden bg-[#232428] border border-black/20">
                <div className="w-1 shrink-0 bg-[#3a72c4]" />
                <div className="flex-1 min-w-0 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] text-[#949ba4] uppercase tracking-wide">Comunicado · FAST</p>
                      {titulo.trim() && <p className="text-lg font-bold text-[#f2f3f5] mt-1 break-words">{titulo.trim()}</p>}
                    </div>
                    <Brand size={40} />
                  </div>
                  <div className="my-3 h-px bg-[#3f4147]" />
                  <p className="text-sm text-[#dbdee1] whitespace-pre-wrap break-words leading-relaxed">
                    {mensagem.trim() || <span className="text-[#949ba4] italic">A mensagem aparece aqui.</span>}
                  </p>
                  <div className="my-3 h-px bg-[#3f4147]" />
                  <p className="text-[11px] text-[#949ba4]">
                    Enviado por {usuario?.username || 'você'} · agora · FAST · North Police Department
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
