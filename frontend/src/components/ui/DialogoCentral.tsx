import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, Check, X, Scale } from 'lucide-react'
import { useDialogo, type Tom, type Pedido } from '@/lib/dialogo'

const TOM: Record<Tom, { icon: typeof Info; cor: string; botao: string }> = {
  info:    { icon: Info,          cor: '#3a72c4', botao: 'bg-gold text-white hover:bg-gold2' },
  sucesso: { icon: CheckCircle2,  cor: '#2ecc71', botao: 'bg-green/20 border border-green/50 text-green hover:bg-green/30' },
  aviso:   { icon: AlertTriangle, cor: '#f39c12', botao: 'bg-orange-400/20 border border-orange-400/50 text-orange-400 hover:bg-orange-400/30' },
  perigo:  { icon: ShieldAlert,   cor: '#e74c3c', botao: 'bg-red/20 border border-red/50 text-red hover:bg-red/30' },
}

/** Card central de confirmação/decisão (montado uma vez no AppShell). */
export default function DialogoCentral() {
  const { atual, fechar } = useDialogo()
  return (
    <AnimatePresence>
      {atual && <Card key={atual.id} atual={atual} fechar={fechar} />}
    </AnimatePresence>
  )
}

function Card({ atual, fechar }: { atual: Pedido; fechar: () => void }) {
  const [motivo, setMotivo] = useState('')
  const [reprovando, setReprovando] = useState(false)
  const [erroMotivo, setErroMotivo] = useState(false)
  const motivoRef = useRef<HTMLTextAreaElement>(null)

  function cancelar() {
    atual.resolver(null)
    fechar()
  }

  function confirmarAcao() {
    if (atual.tipo !== 'confirmar') return
    if (atual.opcoes.motivo === 'obrigatorio' && motivo.trim().length < 3) { setErroMotivo(true); motivoRef.current?.focus(); return }
    atual.resolver({ motivo: motivo.trim() })
    fechar()
  }

  function aprovar() {
    if (atual.tipo !== 'decidir') return
    atual.resolver({ decisao: 'aprovar' })
    fechar()
  }

  function reprovar() {
    if (atual.tipo !== 'decidir') return
    const exige = atual.opcoes.motivoReprovar ?? 'opcional'
    if (exige !== 'nenhum' && !reprovando) { setReprovando(true); setTimeout(() => motivoRef.current?.focus(), 50); return }
    if (exige === 'obrigatorio' && motivo.trim().length < 3) { setErroMotivo(true); motivoRef.current?.focus(); return }
    atual.resolver({ decisao: 'reprovar', motivo: motivo.trim() })
    fechar()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { atual.resolver(null); fechar() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [atual, fechar])

  const decisao = atual.tipo === 'decidir'
  const tom: Tom = atual.tipo === 'confirmar' ? (atual.opcoes.tom ?? 'info') : 'info'
  const Icon = decisao ? Scale : TOM[tom].icon
  const cor = decisao ? '#3a72c4' : TOM[tom].cor
  const pedeMotivo = atual.tipo === 'confirmar'
    ? (atual.opcoes.motivo ?? 'nenhum') !== 'nenhum'
    : reprovando

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9500] flex items-center justify-center p-4"
      style={{ backdropFilter: 'blur(6px)', background: 'rgba(5,5,5,0.75)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) cancelar() }}
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="relative w-full max-w-md bg-card border border-bdr2 rounded-2xl shadow-2xl overflow-y-auto overscroll-contain max-h-[calc(100vh-2rem)] max-h-[calc(100dvh-2rem)]"
      >
        <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, transparent, ${cor}, transparent)` }} />
        <button onClick={cancelar} className="absolute top-2 right-2 w-9 h-9 flex items-center justify-center text-txt3 hover:text-txt transition-colors" aria-label="Fechar">
          <X size={16} />
        </button>

        <div className="px-6 pt-6 pb-5 text-center">
          <div className="mx-auto mb-3 w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: cor + '1f', border: `1px solid ${cor}66` }}>
            <Icon size={22} style={{ color: cor }} />
          </div>
          <h2 className="text-base font-semibold text-txt">{atual.opcoes.titulo}</h2>
          {atual.opcoes.mensagem && <p className="text-sm text-txt2 mt-1.5 leading-relaxed">{atual.opcoes.mensagem}</p>}

          {atual.opcoes.detalhes && atual.opcoes.detalhes.length > 0 && (
            <dl className="mt-4 text-left rounded-lg border border-bdr bg-card2/50 divide-y divide-bdr/60">
              {atual.opcoes.detalhes.map(d => (
                <div key={d.label} className="flex gap-3 px-3 py-2 text-xs">
                  <dt className="w-24 shrink-0 font-mono text-txt3 uppercase tracking-wider text-[10px] pt-0.5">{d.label}</dt>
                  <dd className="flex-1 text-txt break-words">{d.valor || '—'}</dd>
                </div>
              ))}
            </dl>
          )}

          {pedeMotivo && (
            <div className="mt-4 text-left">
              <label className="font-mono text-[10px] text-txt2 tracking-wider uppercase">
                {atual.tipo === 'confirmar' ? (atual.opcoes.rotuloMotivo ?? 'Motivo') : 'Motivo da reprovação'}
                {(atual.tipo === 'confirmar' ? atual.opcoes.motivo : atual.opcoes.motivoReprovar ?? 'opcional') === 'obrigatorio'
                  ? <span className="text-red"> *</span> : <span className="text-txt3"> (opcional)</span>}
              </label>
              <textarea
                ref={motivoRef}
                autoFocus
                value={motivo}
                onChange={e => { setMotivo(e.target.value); setErroMotivo(false) }}
                rows={3}
                maxLength={300}
                className={`input-gold mt-1 w-full bg-card2 border rounded-lg px-3 py-2 text-sm text-txt resize-none ${erroMotivo ? 'border-red' : 'border-bdr2'}`}
              />
              {erroMotivo && <p className="text-[11px] text-red mt-1">Informe o motivo (mínimo 3 caracteres).</p>}
            </div>
          )}
        </div>

        <div className="flex gap-2 px-6 pb-6">
          {atual.tipo === 'confirmar' ? (
            <>
              <button onClick={cancelar}
                className="flex-1 py-2.5 rounded-lg border border-bdr2 text-txt2 text-sm hover:text-txt hover:bg-white/[0.03] transition-colors">
                {atual.opcoes.textoCancelar ?? 'Cancelar'}
              </button>
              <button onClick={confirmarAcao} autoFocus={!pedeMotivo}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${TOM[tom].botao}`}>
                {atual.opcoes.textoConfirmar ?? 'Confirmar'}
              </button>
            </>
          ) : reprovando ? (
            <>
              <button onClick={() => { setReprovando(false); setErroMotivo(false) }}
                className="flex-1 py-2.5 rounded-lg border border-bdr2 text-txt2 text-sm hover:text-txt transition-colors">
                Voltar
              </button>
              <button onClick={reprovar}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium bg-red/20 border border-red/50 text-red hover:bg-red/30 transition-colors">
                <X size={15} /> Confirmar reprovação
              </button>
            </>
          ) : (
            <>
              <button onClick={reprovar}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium bg-red/15 border border-red/40 text-red hover:bg-red/25 transition-colors">
                <X size={15} /> {atual.opcoes.textoReprovar ?? 'Reprovar'}
              </button>
              <button onClick={aprovar} autoFocus
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium bg-green/20 border border-green/50 text-green hover:bg-green/30 transition-colors">
                <Check size={15} /> {atual.opcoes.textoAprovar ?? 'Aprovar'}
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
