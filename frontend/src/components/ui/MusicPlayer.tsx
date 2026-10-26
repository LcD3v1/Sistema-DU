import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Music } from 'lucide-react'

export interface Track {
  title: string
  artist?: string
  src: string
  cover?: string
}

const EASE = [0.16, 1, 0.3, 1] as const

function fmt(t: number) {
  if (!isFinite(t) || t < 0) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

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
    try { const v = localStorage.getItem('fast-music-vol'); return v ? Number(v) : 0.6 } catch { return 0.6 }
  })
  const [muted, setMuted] = useState(false)
  const [expanded, setExpanded] = useState(false)

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

  // Aplica volume/mute (reaplica quando o <audio> monta após a playlist carregar)
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = vol
      audioRef.current.muted = muted
    }
    try { localStorage.setItem('fast-music-vol', String(vol)) } catch { /* noop */ }
  }, [vol, muted, idx, tracks.length])

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

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const a = audioRef.current
    if (!a || !dur) return
    a.currentTime = (Number(e.target.value) / 100) * dur
    setCur(a.currentTime)
  }

  if (tracks.length === 0) return null

  const pct = dur ? (cur / dur) * 100 : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE, delay: 0.4 }}
      className="fixed bottom-24 left-4 sm:bottom-[4.5rem] sm:left-6 z-40"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
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

      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/55 backdrop-blur-md px-3 py-2.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.7)]">
        {/* Capa (gira ao tocar) */}
        <div className="relative shrink-0">
          <div
            className="w-11 h-11 rounded-full overflow-hidden border border-white/15 bg-gradient-to-br from-navy2 to-black flex items-center justify-center"
            style={{ animation: playing ? 'logo-ring 8s linear infinite' : 'none' }}
          >
            {track?.cover
              ? <img src={track.cover} alt="" className="w-full h-full object-cover" />
              : <Music size={16} className="text-gold3" />}
          </div>
          {/* furo central do "disco" */}
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-black border border-white/20" />
        </div>

        {/* Info + controles */}
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={prev} disabled={tracks.length < 2}
              className="text-white/50 hover:text-white transition-colors disabled:opacity-25 disabled:hover:text-white/50" aria-label="Anterior">
              <SkipBack size={15} />
            </button>
            <button onClick={toggle}
              className="w-8 h-8 rounded-full bg-gold text-white flex items-center justify-center hover:bg-gold2 transition-colors shrink-0" aria-label={playing ? 'Pausar' : 'Tocar'}>
              {playing ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
            </button>
            <button onClick={next} disabled={tracks.length < 2}
              className="text-white/50 hover:text-white transition-colors disabled:opacity-25 disabled:hover:text-white/50" aria-label="Próxima">
              <SkipForward size={15} />
            </button>
            <div className="min-w-0 ml-1 max-w-[150px]">
              <p className="text-[12px] text-white font-medium truncate leading-tight">{track?.title}</p>
              {track?.artist && <p className="text-[10px] text-white/45 truncate leading-tight">{track.artist}</p>}
            </div>
          </div>

          {/* Barra de progresso + volume (expande no hover) */}
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-2 pt-1">
                  <span className="font-mono text-[9px] text-white/40 tabular-nums w-7 text-right">{fmt(cur)}</span>
                  <input
                    type="range" min={0} max={100} value={pct} onChange={seek}
                    className="fast-range flex-1 h-1 cursor-pointer"
                    style={{ background: `linear-gradient(to right, #8b5cf6 ${pct}%, rgba(255,255,255,0.15) ${pct}%)` }}
                    aria-label="Progresso"
                  />
                  <span className="font-mono text-[9px] text-white/40 tabular-nums w-7">{fmt(dur)}</span>
                  <button onClick={() => setMuted(m => { const nm = !m; if (audioRef.current) audioRef.current.muted = nm; return nm })}
                    className="text-white/50 hover:text-white transition-colors" aria-label="Volume">
                    {muted || vol === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
                  </button>
                  <input
                    type="range" min={0} max={1} step={0.01} value={muted ? 0 : vol}
                    onChange={e => { setMuted(false); if (audioRef.current) audioRef.current.muted = false; setVol(Number(e.target.value)) }}
                    className="fast-range w-14 h-1 cursor-pointer"
                    style={{ background: `linear-gradient(to right, #8b5cf6 ${(muted ? 0 : vol) * 100}%, rgba(255,255,255,0.15) ${(muted ? 0 : vol) * 100}%)` }}
                    aria-label="Nível de volume"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}
