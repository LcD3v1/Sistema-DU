import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Megaphone, Trash2, Send, Pin } from 'lucide-react'
import { useAvisos, useCreateAviso, useDeleteAviso, useMarcarAvisosLidos } from '@/hooks/useAvisos'
import { usePerms } from '@/hooks/usePerms'
import { useUIStore } from '@/store/uiStore'
import LoadingHud from '@/components/ui/LoadingHud'

function initials(n: string) {
  return n.split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')
}
function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function AvisosPage() {
  const { data, isLoading } = useAvisos()
  const criar = useCreateAviso()
  const remover = useDeleteAviso()
  const marcarLidos = useMarcarAvisosLidos()
  const { canEdit } = usePerms()
  const { addToast } = useUIStore()

  const isMod = canEdit('avisos')
  const [titulo, setTitulo] = useState('')
  const [mensagem, setMensagem] = useState('')

  // Marca todos como lidos ao abrir
  useEffect(() => {
    marcarLidos.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function publicar() {
    if (!titulo.trim() || !mensagem.trim()) { addToast('error', 'Preencha título e mensagem.'); return }
    criar.mutate({ titulo: titulo.trim(), mensagem: mensagem.trim() }, {
      onSuccess: () => { addToast('success', 'Aviso publicado!'); setTitulo(''); setMensagem('') },
      onError: () => addToast('error', 'Erro ao publicar aviso.'),
    })
  }

  if (isLoading) return <LoadingHud />
  const avisos = data?.avisos ?? []

  return (
    <div className="p-6 max-w-[1400px]">
      <div className="mb-6">
        <p className="font-mono text-[10px] text-txt2 tracking-[0.2em] uppercase mb-1">Painel</p>
        <h1 className="text-3xl font-bold text-txt flex items-center gap-2">
          <Megaphone size={26} className="text-gold" /> Avisos
        </h1>
        <p className="text-sm text-txt2 mt-1">Mural de comunicados da unidade.</p>
      </div>

      {/* Publicar (comando) */}
      {isMod && (
        <div className="bg-card border border-bdr rounded-xl p-4 mb-6">
          <p className="font-mono text-[11px] text-gold3 tracking-wider uppercase mb-3">Novo aviso</p>
          <input
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            placeholder="Título do aviso"
            className="input-gold w-full bg-card2 border border-bdr2 rounded-lg px-3 py-2.5 text-sm font-medium text-txt placeholder-txt3 mb-2"
          />
          <textarea
            value={mensagem}
            onChange={e => setMensagem(e.target.value)}
            rows={3}
            placeholder="Escreva o comunicado..."
            className="input-gold w-full bg-card2 border border-bdr2 rounded-lg px-3 py-2.5 text-sm font-mono text-txt placeholder-txt3 resize-none"
          />
          <div className="flex justify-end mt-3">
            <button onClick={publicar} disabled={criar.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gold text-white text-sm font-medium hover:bg-gold2 transition-colors disabled:opacity-50">
              <Send size={15} /> Publicar
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {avisos.length === 0 ? (
        <div className="border border-bdr rounded-xl bg-card py-16 text-center">
          <Megaphone size={30} className="text-txt3 mx-auto mb-3" />
          <p className="text-txt2 text-sm">Nenhum aviso publicado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {avisos.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
              className="group bg-card border border-bdr rounded-xl p-4 hover:border-gold/30 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-gold/10 border border-gold/30 flex items-center justify-center shrink-0">
                  <Pin size={15} className="text-gold3" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold text-txt">{a.titulo}</h3>
                    {isMod && (
                      <button onClick={() => { if (confirm('Remover este aviso?')) remover.mutate(a.id) }}
                        className="text-txt3 hover:text-red transition-colors shrink-0 opacity-0 group-hover:opacity-100">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-txt2 mt-1 whitespace-pre-wrap leading-relaxed">{a.mensagem}</p>
                  <div className="flex items-center gap-2 mt-3 text-[11px] text-txt3">
                    <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[9px] font-semibold text-white/70">{initials(a.autor)}</span>
                    <span className="text-txt2">{a.autor}</span>
                    <span>·</span>
                    <span className="font-mono">{fmtDateTime(a.criadoEm)}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
