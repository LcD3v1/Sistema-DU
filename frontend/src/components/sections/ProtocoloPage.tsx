import { useState } from 'react'
import { BookOpen, Maximize2, ExternalLink, ShieldCheck } from 'lucide-react'
import Brand from '@/components/ui/Brand'

const FLIPBOOK = 'https://heyzine.com/flip-book/79e82a2e02.html'

const SECOES = [
  'Introdução', 'Juramento', 'Diretrizes Gerais', 'Hierarquia',
  'Especialização da FAST', 'Organização de PTR', 'Acompanhamento',
  'Acompanhamento 2.0', 'Viatura e Fardamento', 'Site da FAST', 'Conclusão',
]

export default function ProtocoloPage() {
  const [loaded, setLoaded] = useState(false)

  return (
    <div className="w-full max-w-[1800px] mx-auto p-3 sm:p-6 lg:px-8">
      {/* ── Banner ─────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-gold/25 mb-6"
           style={{ background: 'radial-gradient(120% 140% at 15% 0%, rgba(58,114,196,0.28), rgba(20,33,61,0.5) 40%, #070a12 80%)' }}>
        <div className="absolute inset-0 grain-noise opacity-[0.05] pointer-events-none" />
        <div className="relative flex items-center gap-3 sm:gap-5 p-4 sm:p-6 md:p-8 flex-wrap">
          <div className="shrink-0" style={{ filter: 'drop-shadow(0 0 24px rgba(58,114,196,0.4))' }}>
            <Brand size={84} />
          </div>
          <div className="flex-1">
            <p className="font-mono text-[10px] text-gold3 tracking-[0.25em] uppercase mb-1 flex items-center gap-2">
              <ShieldCheck size={13} /> Documento oficial
            </p>
            <h1 className="wordmark text-2xl md:text-3xl text-white tracking-wide">Protocolo Operacional</h1>
            <p className="text-sm text-white/70 mt-1">Force Action Strike Terrestrial — North Police Department</p>
          </div>
          <a href={FLIPBOOK} target="_blank" rel="noopener noreferrer"
             className="hidden md:flex shrink-0 items-center gap-2 px-4 py-2.5 rounded-xl bg-gold text-white text-sm font-medium hover:bg-gold2 transition-colors shadow-[0_10px_30px_-12px_rgba(58,114,196,0.7)]">
            <Maximize2 size={15} /> Abrir em tela cheia
          </a>
        </div>
      </div>

      {/* ── Índice de seções ───────────────────────────────── */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="font-mono text-[10px] text-txt2 tracking-[0.2em] uppercase flex items-center gap-1.5 mr-1">
          <BookOpen size={12} /> Conteúdo
        </span>
        {SECOES.map(s => (
          <span key={s} className="px-3 py-1 rounded-full border border-bdr2 bg-card2/60 text-txt2 text-xs">{s}</span>
        ))}
      </div>

      {/* ── Flipbook ───────────────────────────────────────── */}
      <div className="relative rounded-2xl border border-bdr bg-card overflow-hidden">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-txt3">
              <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
              <p className="font-mono text-xs tracking-wider">Carregando protocolo…</p>
            </div>
          </div>
        )}
        <iframe
          src={FLIPBOOK}
          title="Protocolo Operacional FAST"
          onLoad={() => setLoaded(true)}
          allowFullScreen
          className="w-full h-[72vh] min-h-[520px] block"
          style={{ border: 0, opacity: loaded ? 1 : 0, transition: 'opacity 0.4s' }}
        />
      </div>

      <div className="mt-3 flex items-center justify-end">
        <a href={FLIPBOOK} target="_blank" rel="noopener noreferrer"
           className="flex items-center gap-1.5 font-mono text-[11px] text-txt3 hover:text-gold3 transition-colors">
          Abrir o protocolo em nova aba <ExternalLink size={12} />
        </a>
      </div>
    </div>
  )
}
