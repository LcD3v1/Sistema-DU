import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldCheck, Check } from 'lucide-react'

const KEY = 'fast_termo_exclusividade_v1'
const EASE = [0.16, 1, 0.3, 1] as const

const PONTOS = [
  { t: 'Nunca presumida.', d: 'Só existe quando definida por escrito em contrato, proposta, ordem de serviço ou aditivo.' },
  { t: 'Por região, serviço e segmento.', d: 'Limitada ao território (Flórida, EUA, ou área definida), aos serviços e ao segmento descritos no contrato.' },
  { t: 'Prazo determinado.', d: 'Termina automaticamente ao fim do período, salvo renovação por escrito.' },
  { t: 'Confidencialidade garantida.', d: 'Informações de um cliente nunca são reutilizadas para beneficiar outro.' },
  { t: 'Duas marcas distintas.', d: 'Um acordo com a Nata Studios não gera exclusividade automática na Nextech, salvo indicação expressa.' },
]

/**
 * Termo de aceite exibido na PRIMEIRA abertura do site (uma vez por navegador).
 * Guarda a escolha em localStorage — apenas conveniência de UI, sem dados sensíveis.
 */
export default function TermoExclusividade() {
  const [aberto, setAberto] = useState(false)
  const [concordo, setConcordo] = useState(false)
  const [recusado, setRecusado] = useState(false)

  useEffect(() => {
    let ok = false
    try { ok = !!localStorage.getItem(KEY) } catch { /* storage bloqueado — mostra o termo */ }
    if (!ok) setAberto(true)
  }, [])

  function aceitar() {
    if (!concordo) return
    try { localStorage.setItem(KEY, JSON.stringify({ aceito: true, data: new Date().toISOString() })) } catch { /* noop */ }
    setAberto(false)
  }

  return (
    <AnimatePresence>
      {aberto && (
        <motion.div
          key="termo"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[10000] grid place-items-center p-4"
          style={{ background: 'rgba(4,5,8,0.82)', backdropFilter: 'blur(4px)' }}
          role="dialog" aria-modal="true" aria-labelledby="termo-titulo"
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.34, ease: EASE }}
            className="w-full max-w-lg max-h-[86vh] flex flex-col rounded-2xl border border-bdr2 overflow-hidden shadow-2xl"
            style={{ background: 'linear-gradient(180deg,#121212,#0b0b0b)' }}
          >
            {/* Cabeçalho */}
            <div className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-bdr">
              <div className="w-11 h-11 shrink-0 rounded-xl bg-gold/15 border border-gold/40 flex items-center justify-center">
                <ShieldCheck size={20} className="text-gold3" />
              </div>
              <div>
                <p className="font-mono text-[10px] text-gold3 tracking-[0.28em] uppercase mb-1">Política de Exclusividade</p>
                <h2 id="termo-titulo" className="text-xl font-bold text-txt leading-tight">Antes de continuar</h2>
                <p className="text-[13px] text-txt2 mt-1.5 leading-relaxed">
                  Para usar o site da Nata Studios e da Nextech, confirme que leu e concorda com a nossa Política de Exclusividade.
                </p>
              </div>
            </div>

            {/* Corpo */}
            <div className="px-6 py-4 overflow-y-auto">
              {recusado && (
                <div className="mb-4 px-3 py-2.5 rounded-lg border border-red/40 bg-red/10 text-[12.5px] text-txt2 leading-relaxed">
                  É preciso concordar com a Política de Exclusividade para acessar o site.
                </div>
              )}
              <p className="text-[13.5px] leading-relaxed text-txt mb-4">
                A exclusividade é uma condição <span className="text-gold3 font-semibold">premium, específica, limitada e contratada separadamente</span> — nunca um benefício automático da simples contratação de um serviço.
              </p>
              <ul className="flex flex-col gap-3">
                {PONTOS.map((p, i) => (
                  <li key={i} className="flex gap-2.5 text-[13px] leading-snug text-txt2">
                    <Check size={15} className="text-gold3 shrink-0 mt-0.5" strokeWidth={2.6} />
                    <span><span className="text-txt font-medium">{p.t}</span> {p.d}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 pt-3.5 border-t border-dashed border-bdr flex flex-wrap gap-y-2 gap-x-6">
                <div><p className="font-mono text-[10px] text-txt3 tracking-wider uppercase">Vigência</p><p className="text-[11px] text-txt2 mt-0.5">14 de setembro de 2026</p></div>
                <div><p className="font-mono text-[10px] text-txt3 tracking-wider uppercase">Atualização</p><p className="text-[11px] text-txt2 mt-0.5">16 de setembro de 2026</p></div>
                <div><p className="font-mono text-[10px] text-txt3 tracking-wider uppercase">Lei aplicável</p><p className="text-[11px] text-txt2 mt-0.5">Flórida, EUA</p></div>
              </div>
            </div>

            {/* Rodapé */}
            <div className="px-6 pt-4 pb-5 border-t border-bdr bg-black/20">
              <label className="flex gap-3 items-start cursor-pointer select-none mb-4">
                <input
                  type="checkbox" id="termo-concordo" checked={concordo}
                  onChange={e => { setConcordo(e.target.checked); if (e.target.checked) setRecusado(false) }}
                  className="peer sr-only"
                />
                <span className="w-5 h-5 mt-0.5 shrink-0 rounded-md border-[1.5px] border-bdrg bg-white/[0.02] grid place-items-center transition-colors peer-checked:bg-gold peer-checked:border-gold peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-gold peer-focus-visible:outline-offset-2">
                  <Check size={13} strokeWidth={3.2} className="text-[#0b0b0b] opacity-0 peer-checked:opacity-100" />
                </span>
                <span className="text-[13.5px] leading-snug text-txt">
                  Li e concordo com a Política de Exclusividade.
                </span>
              </label>
              <div className="flex gap-2.5">
                <button
                  type="button" onClick={() => setRecusado(true)}
                  className="px-4 py-3 rounded-xl border border-bdr2 text-txt2 text-sm font-medium hover:text-txt hover:border-txt2 transition-colors"
                >
                  Recusar
                </button>
                <button
                  type="button" onClick={aceitar} disabled={!concordo}
                  className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold bg-gold text-white hover:bg-gold2 transition-colors disabled:bg-card2 disabled:text-txt3 disabled:cursor-not-allowed"
                >
                  Aceitar e continuar
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
