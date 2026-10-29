import { useEffect, useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Play, Pause, SkipBack, SkipForward, Music, Volume2, VolumeX } from 'lucide-react'

export interface Track {
  title: string
  artist?: string
  src: string
  cover?: string
}

const EASE = [0.16, 1, 0.3, 1] as const

/**
 * Player de música flutuante (canto inferior esquerdo da tela de login).
 * Lê a playlist de /media/music/playlist.json. Se não houver faixas, não renderiza.
 * A reprodução só inicia após um clique (política de autoplay dos navegadores).
 */
export default function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)
  const [dur, setDur] = useState(0)
  const [vol, setVol] = useState(() => {
    try {
      const salvo = localStorage.getItem('du-music-vol')
      const v = Number(salvo)
      return salvo !== null && v >= 0 && v <= 1 ? v : 0.6
    } catch { return 0.6 }
  })

  // Carrega a playlist
  useEffect(() => {
    let alive = true
    fetch('/media/music/playlist.json', { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : []))
      .then((list: unknown) => {
        if (!alive) return
        const valid = Array.isArray(list)
          ? list.filter((t): t is Track => !!t && typeof (t as Track).src === 'string' && typeof (t as Track).title === 'string')
          : []
        setTracks(valid)
      })
      .catch(() => { if (alive) setTracks([]) })
    return () => { alive = false }
  }, [])

  const track = tracks[idx]

  // Aplica o volume salvo (reaplica quando o <audio> monta após a playlist carregar)
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = vol
  }, [vol, idx, tracks.length])

  // Ao trocar de faixa, se estava tocando, continua tocando
  useEffect(() => {
    const a = audioRef.current
    if (!a || !track) return
    if (playing) a.play().catch(() => setPlaying(false))
  }, [idx]) // eslint-disable-line react-hooks/exhaustive-deps

  // Autoplay: tenta tocar ao abrir; se o navegador bloquear (política de autoplay),
  // inicia no primeiro clique/tecla em qualquer lugar da página.
  useEffect(() => {
    if (tracks.length === 0) return
    const a = audioRef.current
    if (!a) return
    let started = false
    const cleanup = () => {
      window.removeEventListener('pointerdown', start)
      window.removeEventListener('keydown', start)
      window.removeEventListener('touchstart', start)
    }
    function start() {
      if (started || !a) return
      a.play().then(() => { started = true; cleanup() }).catch(() => {})
    }
    start() // 1ª tentativa (funciona se o navegador permitir)
    window.addEventListener('pointerdown', start)
    window.addEventListener('keydown', start)
    window.addEventListener('touchstart', start)
    return cleanup
  }, [tracks.length])

  const toggle = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    if (a.paused) { a.play().then(() => setPlaying(true)).catch(() => setPlaying(false)) }
    else { a.pause(); setPlaying(false) }
  }, [])

  const next = useCallback(() => setIdx(i => (tracks.length ? (i + 1) % tracks.length : 0)), [tracks.length])
  const prev = useCallback(() => setIdx(i => (tracks.length ? (i - 1 + tracks.length) % tracks.length : 0)), [tracks.length])

  /** Barra de volume (0–100): aplica na hora e guarda para a próxima visita. */
  function mudarVolume(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Number(e.target.value) / 100
    setVol(v)
    try { localStorage.setItem('du-music-vol', String(v)) } catch { /* modo privado */ }
  }

  if (tracks.length === 0) return null

  // Anel em volta da foto: enche conforme a música toca, até ela terminar
  const progresso = dur ? Math.min(cur / dur, 1) : 0
  const RAIO = 21, VOLTA = 2 * Math.PI * RAIO
  const volPct = Math.round(vol * 100)

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE, delay: 0.4 }}
      className="fixed bottom-24 left-4 sm:bottom-[4.5rem] sm:left-6 z-40"
    >
      <audio
        ref={audioRef}
        src={track?.src}
        loop={tracks.length === 1}
        onLoadedMetadata={e => setDur(e.currentTarget.duration)}
        onTimeUpdate={e => setCur(e.currentTarget.currentTime)}
        onEnded={() => { if (tracks.length > 1) next() }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />

      {/* Visual minimalista: foto com o anel do tempo · título + volume · controles (sem caixa de fundo) */}
      <div className="flex items-center gap-3 w-[min(17rem,calc(100vw-2rem))]">
        <div className="relative w-12 h-12 shrink-0" role="progressbar" aria-label="Tempo da música"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progresso * 100)}>
          <svg viewBox="0 0 48 48" className="absolute inset-0 w-full h-full -rotate-90" aria-hidden="true">
            <circle cx="24" cy="24" r={RAIO} fill="none" stroke="rgba(139,92,246,0.2)" strokeWidth="2.5" />
            <circle cx="24" cy="24" r={RAIO} fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round"
              strokeDasharray={VOLTA} strokeDashoffset={VOLTA * (1 - progresso)}
              style={{ transition: 'stroke-dashoffset 0.25s linear', filter: 'drop-shadow(0 0 4px rgba(139,92,246,0.6))' }} />
          </svg>
          <div className="absolute inset-1.25 rounded-full overflow-hidden bg-gold/15 flex items-center justify-center">
            {track?.cover
              ? <img src={track.cover} alt="" className="w-full h-full object-cover" />
              : <Music size={14} className="text-gold3" />}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.02em] text-gold3 truncate leading-tight" title={track?.artist ? `${track.title} — ${track.artist}` : track?.title}>
            {track?.title}
          </p>
          <div className="flex items-center gap-1.5 mt-2">
            {vol === 0 ? <VolumeX size={11} className="text-gold3/80 shrink-0" /> : <Volume2 size={11} className="text-gold3/80 shrink-0" />}
            <input
              type="range" min={0} max={100} step={1} value={volPct} onChange={mudarVolume}
              className="du-range-min w-full h-0.75 cursor-pointer block"
              style={{ background: `linear-gradient(to right, #8b5cf6 ${volPct}%, rgba(139,92,246,0.2) ${volPct}%)` }}
              aria-label="Volume da música" title={`Volume ${volPct}%`}
            />
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 text-gold3/80">
          <button onClick={prev} disabled={tracks.length < 2} className="hover:text-gold3 hover:brightness-125 transition disabled:opacity-30" aria-label="Anterior">
            <SkipBack size={11} fill="currentColor" />
          </button>
          <button onClick={toggle} className="hover:text-gold3 hover:brightness-125 transition" aria-label={playing ? 'Pausar' : 'Tocar'}>
            {playing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
          </button>
          <button onClick={next} disabled={tracks.length < 2} className="hover:text-gold3 hover:brightness-125 transition disabled:opacity-30" aria-label="Próxima">
            <SkipForward size={11} fill="currentColor" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}
