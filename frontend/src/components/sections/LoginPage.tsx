import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, Users, ShieldX, CalendarClock } from 'lucide-react'
import Brand from '@/components/ui/Brand'
import MusicPlayer from '@/components/ui/MusicPlayer'
import PublicOverlay from '@/components/sections/PublicOverlay'

const DISCORD_URL = (import.meta.env.VITE_API_URL || '') + '/api/auth/discord'

const REASONS: Record<string, string> = {
  desativada: 'Conta desativada. Contate o administrador.',
  discord_off: 'Login por Discord ainda não configurado.',
  discord_nao_vinculado: 'Acesso negado para este Discord. Contate o administrador.',
  discord_erro: 'Falha na autenticação com o Discord. Tente novamente.',
}

function DiscordIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3c-.2.36-.43.845-.59 1.23a18.27 18.27 0 0 0-3.937 0A12.6 12.6 0 0 0 11.44 3a19.74 19.74 0 0 0-3.76 1.37C3.9 8.1 3.2 11.72 3.5 15.29a19.9 19.9 0 0 0 6.03 3.05c.49-.66.92-1.36 1.29-2.1-.71-.27-1.39-.6-2.03-.99.17-.13.34-.26.5-.4a14.2 14.2 0 0 0 12.02 0c.16.14.33.27.5.4-.64.39-1.32.72-2.03.99.37.74.8 1.44 1.29 2.1a19.87 19.87 0 0 0 6.03-3.05c.36-4.13-.6-7.72-2.9-10.92ZM9.68 13.5c-.95 0-1.73-.87-1.73-1.94 0-1.07.76-1.94 1.73-1.94.98 0 1.76.88 1.73 1.94 0 1.07-.76 1.94-1.73 1.94Zm4.64 0c-.95 0-1.73-.87-1.73-1.94 0-1.07.76-1.94 1.73-1.94.98 0 1.76.88 1.73 1.94 0 1.07-.75 1.94-1.73 1.94Z" />
    </svg>
  )
}

/* Fundo em vídeo */
function VideoBackdrop() {
  const ref = useRef<HTMLVideoElement>(null)

  // O React nem sempre aplica o atributo `muted`; forçamos via propriedade e
  // chamamos play() (retry no 1º toque) para garantir o autoplay do fundo.
  useEffect(() => {
    const v = ref.current
    if (!v) return
    v.muted = true
    v.defaultMuted = true
    const tryPlay = () => { v.play().catch(() => {}) }
    tryPlay()
    const onReady = () => tryPlay()
    v.addEventListener('canplay', onReady)
    document.addEventListener('pointerdown', tryPlay, { once: true })
    document.addEventListener('keydown', tryPlay, { once: true })
    return () => {
      v.removeEventListener('canplay', onReady)
      document.removeEventListener('pointerdown', tryPlay)
      document.removeEventListener('keydown', tryPlay)
    }
  }, [])

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      {/* scale 1.35 recorta o letterbox gravado no arquivo (barras de 12,5% em cima/baixo) */}
      <video ref={ref} className="absolute inset-0 w-full h-full object-cover" style={{ transform: 'scale(1.35)', transformOrigin: 'center' }} src="/media/login-bg.mp4" autoPlay muted loop playsInline preload="auto" />
      {/* scrim da esquerda para legibilidade do hero */}
      <div className="absolute inset-0 pointer-events-none"
           style={{ background: 'linear-gradient(90deg, rgba(4,6,11,0.9) 0%, rgba(4,6,11,0.6) 42%, rgba(4,6,11,0.15) 78%, rgba(4,6,11,0.35) 100%)' }} />
      {/* grão + vinheta */}
      <div className="absolute inset-0 grain-noise opacity-[0.05] pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none"
           style={{ background: 'radial-gradient(130% 100% at 30% 45%, transparent 45%, rgba(0,0,0,0.7) 100%)' }} />
    </div>
  )
}

export default function LoginPage() {
  const [params] = useSearchParams()
  const [overlay, setOverlay] = useState<'ranking' | 'membros' | null>(null)
  const reason = params.get('reason')
  const ate = params.get('ate')
  const ateFmt = ate && /^\d{4}-\d{2}-\d{2}$/.test(ate) ? ate.split('-').reverse().join('/') : null

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white">
      <VideoBackdrop />

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header className="relative z-30 flex items-center justify-between px-8 lg:px-14 pt-6">
        <div className="flex items-center gap-3">
          <Brand size={40} />
          <div className="leading-tight">
            <p className="wordmark text-sm text-white tracking-[0.14em]">FAST</p>
            <p className="font-mono text-[8px] text-white/40 tracking-[0.2em]">NPD</p>
          </div>
        </div>
        <nav className="flex items-center gap-2">
          <button onClick={() => setOverlay('ranking')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 hover:border-white/25 hover:bg-white/5 text-sm text-white/80 transition-colors">
            <Trophy size={15} /> Ranking
          </button>
          <button onClick={() => setOverlay('membros')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 hover:border-white/25 hover:bg-white/5 text-sm text-white/80 transition-colors">
            <Users size={15} /> Membros
          </button>
        </nav>
      </header>

      {/* ── Hero (alinhado à esquerda) ──────────────────────────── */}
      <main className="relative z-20 h-[calc(100%-140px)] flex items-center px-8 lg:px-14">
        <div className="w-full max-w-xl">
          <div className="flex items-center gap-2 mb-5">
            <span className="h-px w-8 bg-gold" />
            <span className="font-mono text-[11px] text-gold3 tracking-[0.3em] uppercase">North Police Department</span>
          </div>

          <h1 className="wordmark text-[84px] md:text-[112px] leading-[0.9] text-white mb-4"
              style={{ textShadow: '0 8px 50px rgba(0,0,0,0.7)' }}>
            FAST
          </h1>

          <p className="text-white/60 text-base max-w-md mb-8 leading-relaxed">
            Central operacional da unidade — controle de apreensões, efetivo e desempenho em tempo real.
          </p>

          <div className="flex flex-col gap-3">
            <motion.a href={DISCORD_URL} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2.5 w-fit px-7 py-3.5 rounded-xl bg-[#5865F2] hover:bg-[#4752c4] text-white font-medium text-sm transition-colors shadow-[0_12px_34px_-10px_rgba(88,101,242,0.6)]">
              <DiscordIcon /> Entrar com Discord
            </motion.a>
            <p className="text-white/45 text-xs">Primeiro acesso? Entre com o Discord e complete seu cadastro — o comando aprova em seguida.</p>
          </div>

          {reason === 'exonerado' && (
            <div className="mt-6 max-w-md flex gap-3 rounded-xl border border-red/50 bg-red/15 backdrop-blur px-4 py-4">
              <ShieldX size={22} className="text-red shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-white">Você foi exonerado da unidade.</p>
                <p className="text-xs text-white/70 mt-1 leading-relaxed">Seu acesso ao painel foi encerrado. Entre em contato com o <span className="text-white font-medium">Alto Comando da unidade</span> para entender o que aconteceu.</p>
              </div>
            </div>
          )}
          {reason === 'ausente' && (
            <div className="mt-6 max-w-md flex gap-3 rounded-xl border border-gold/50 bg-gold/15 backdrop-blur px-4 py-4">
              <CalendarClock size={22} className="text-gold3 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-white">Você está em ausência{ateFmt ? ` até ${ateFmt}` : ''}.</p>
                <p className="text-xs text-white/70 mt-1 leading-relaxed">O acesso ao painel volta automaticamente ao fim do período. Se retornou antes, peça ao comando para retirar sua ausência.</p>
              </div>
            </div>
          )}
          {reason && REASONS[reason] && (
            <p className="mt-5 text-xs font-mono text-red">{REASONS[reason]}</p>
          )}
        </div>
      </main>

      {/* ── Rodapé ──────────────────────────────────────────────── */}
      <footer className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-end px-8 lg:px-14 py-6">
        <p className="font-mono text-[9px] text-white/30 tracking-[0.25em] uppercase">
          Desenvolvido por <span className="text-gold3/80">LC Dev</span>
        </p>
      </footer>

      {/* ── Player de música (canto inferior esquerdo) ──────────── */}
      <MusicPlayer />

      {/* ── Overlay Ranking/Membros ─────────────────────────────── */}
      <AnimatePresence>
        {overlay && <PublicOverlay initialTab={overlay} onClose={() => setOverlay(null)} />}
      </AnimatePresence>
    </div>
  )
}
