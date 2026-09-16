import { useMemo, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, Crown, Medal, Award, Target, Flame, TrendingUp, Shield, CalendarDays, Hash, Star } from 'lucide-react'
import { useAllAcoes } from '@/hooks/useAcoes'
import { useMembros } from '@/hooks/useMembros'
import { usePublicPerfis } from '@/hooks/usePublic'
import { resolveBanner } from '@/lib/banners'
import LoadingHud from '@/components/ui/LoadingHud'
import type { Membro, Acao } from '@/types'

const BANNER = '/media/races/race-2.png'
const EASE = [0.16, 1, 0.3, 1] as const

type Win = 'all' | '7' | '15' | '30'
const WINDOWS: { key: Win; label: string }[] = [
  { key: 'all', label: 'Todo o período' },
  { key: '7', label: '7 dias' },
  { key: '15', label: '15 dias' },
  { key: '30', label: '30 dias' },
]

const MEDALS = ['#f5c451', '#cbd5e1', '#cd7f45'] // ouro, prata, bronze

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')
}
function isoDaysAgo(n: number) {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
function fmtData(d?: string) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

interface Row {
  id: number; nome: string; patente: string
  sucedidas: number; total: number; winRate: number
}

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-[#0a0d14] py-2.5 text-center">
      <p className="text-lg font-bold leading-none" style={{ color }}>{value}</p>
      <p className="font-mono text-[8px] text-txt3 tracking-widest uppercase mt-1">{label}</p>
    </div>
  )
}
function Info({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[11px] gap-2">
      <span className="text-txt3 flex items-center gap-1.5 shrink-0">{icon}{label}</span>
      <span className="text-txt font-medium truncate">{value}</span>
    </div>
  )
}

export default function RankingPage() {
  const { data: acoesData, isLoading: la } = useAllAcoes()
  const { data: membros, isLoading: lm } = useMembros()
  const { data: perfis } = usePublicPerfis()
  const [win, setWin] = useState<Win>('all')

  const perfilMap = useMemo(() => new Map((perfis ?? []).map(p => [p.membroId, p])), [perfis])

  const acoes: Acao[] = (acoesData?.acoes ?? []).filter(a => (a.status ?? 'aprovada') === 'aprovada')
  const membrosList: Membro[] = membros ?? []
  const membroMap = useMemo(() => new Map(membrosList.map(m => [m.id, m])), [membrosList])

  // Card de perfil ao passar o mouse
  const [hoverId, setHoverId] = useState<number | null>(null)
  const [mouse, setMouse] = useState({ x: 0, y: 0 })
  const rowHandlers = (id: number) => ({
    onMouseEnter: () => setHoverId(id),
    onMouseMove: (e: React.MouseEvent) => setMouse({ x: e.clientX, y: e.clientY }),
    onMouseLeave: () => setHoverId(null),
  })

  const { rows, totalSucedidas, topQru } = useMemo(() => {
    const from = win === 'all' ? null : isoDaysAgo(parseInt(win, 10))
    const scoped = from ? acoes.filter(a => a.data >= from) : acoes

    const rows: Row[] = membrosList.map(m => {
      const mine = scoped.filter(a => a.participants.some(p => p.memberId === m.id))
      const sucedidas = mine.filter(a => a.resultado === 'Vitória').length
      return {
        id: m.id, nome: m.policial, patente: m.patenteInterna || m.patenteNPD,
        sucedidas, total: mine.length,
        winRate: mine.length ? Math.round((sucedidas / mine.length) * 100) : 0,
      }
    }).filter(r => r.sucedidas > 0)
      .sort((a, b) => b.sucedidas - a.sucedidas || b.winRate - a.winRate)

    const totalSucedidas = scoped.filter(a => a.resultado === 'Vitória').length

    const qruCount = new Map<string, number>()
    scoped.filter(a => a.resultado === 'Vitória').forEach(a => qruCount.set(a.qru, (qruCount.get(a.qru) ?? 0) + 1))
    const topQru = [...qruCount.entries()].sort((a, b) => b[1] - a[1])[0] ?? null

    return { rows, totalSucedidas, topQru }
  }, [acoes, membrosList, win])

  if (la || lm) return <LoadingHud />

  const podium = rows.slice(0, 3)
  const resto = rows.slice(3)
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(Boolean) as Row[] // 2º,1º,3º
  const maxSucedidas = rows[0]?.sucedidas ?? 1

  return (
    <div className="p-6 max-w-[1400px]">
      {/* ── Hero banner ─────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-bdr mb-6">
        <img src={BANNER} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(5,5,5,0.95) 0%, rgba(5,7,12,0.75) 45%, rgba(58,114,196,0.25) 100%)' }} />
        <div className="relative p-6 md:p-8">
          <p className="font-mono text-[10px] text-gold3 tracking-[0.25em] uppercase mb-1 flex items-center gap-2">
            <Trophy size={13} /> Destaques operacionais
          </p>
          <h1 className="wordmark text-3xl md:text-4xl text-white tracking-wide">Ranking de QRUs</h1>
          <p className="text-sm text-white/70 mt-1">Classificação por operações bem-sucedidas da unidade.</p>

          <div className="flex items-center gap-4 mt-5 flex-wrap">
            <div className="flex gap-0.5 bg-black/40 backdrop-blur rounded-lg p-1">
              {WINDOWS.map(w => (
                <button key={w.key} onClick={() => setWin(w.key)}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-mono transition-colors ${win === w.key ? 'bg-gold text-white' : 'text-white/60 hover:text-white'}`}>
                  {w.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-white/80 text-sm"><Flame size={15} className="text-gold3" /> {totalSucedidas} QRUs sucedidas</span>
              {topQru && <span className="flex items-center gap-1.5 text-white/80 text-sm"><Target size={15} className="text-gold3" /> Top QRU: <span className="text-white font-medium">{topQru[0]}</span></span>}
            </div>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="border border-bdr rounded-xl bg-card py-20 text-center">
          <Trophy size={32} className="text-txt3 mx-auto mb-3" />
          <p className="text-txt2 text-sm">Nenhuma QRU bem-sucedida registrada no período.</p>
        </div>
      ) : (
        <>
          {/* ── Pódio ─────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-4 items-end mb-6">
            {podiumOrder.map(r => {
              const place = rows.indexOf(r) // 0,1,2
              const isFirst = place === 0
              const medal = MEDALS[place]
              const MedalIcon = place === 0 ? Crown : place === 1 ? Medal : Award
              const perfil = perfilMap.get(r.id)
              const bn = resolveBanner(perfil?.banner ?? null, place + 1)
              const avSize = isFirst ? 76 : 60
              return (
                <motion.div
                  key={r.id}
                  {...rowHandlers(r.id)}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: EASE, delay: place * 0.1 }}
                  className={`relative rounded-2xl border overflow-hidden p-5 text-center cursor-pointer ${isFirst ? 'border-gold/50 pb-8' : 'border-bdr'}`}
                  style={isFirst ? { boxShadow: '0 24px 60px -24px rgba(58,114,196,0.6)' } : undefined}
                >
                  {/* Banner de fundo (escolha do usuário / tier) */}
                  {bn.img
                    ? <img src={bn.img} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    : <div className="absolute inset-0" style={{ background: bn.css }} />}
                  {bn.overlay && <div className="absolute inset-0" style={{ background: bn.overlay }} />}
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(5,7,12,0.30) 0%, rgba(5,7,12,0.62) 52%, rgba(5,7,12,0.9) 100%)' }} />

                  <div className="relative flex flex-col items-center">
                    <MedalIcon size={isFirst ? 24 : 20} style={{ color: medal }} className="mb-2" />
                    <div className="rounded-full overflow-hidden flex items-center justify-center font-semibold text-white mb-3 border-2 bg-white/[0.06]"
                      style={{ width: avSize, height: avSize, fontSize: isFirst ? 22 : 17, borderColor: medal }}>
                      {perfil?.avatar
                        ? <img src={perfil.avatar} alt="" className="w-full h-full object-cover" />
                        : initials(r.nome)}
                    </div>
                    <p className="font-mono text-[11px] font-bold tracking-widest" style={{ color: medal }}>{place + 1}º</p>
                    <p className={`font-semibold text-txt truncate max-w-full ${isFirst ? 'text-lg' : 'text-sm'}`}>{r.nome}</p>
                    <p className="text-[11px] text-txt2 truncate max-w-full">{r.patente}</p>
                    <div className="mt-3">
                      <p className={`font-bold ${isFirst ? 'text-4xl' : 'text-3xl'}`} style={{ color: medal }}>{r.sucedidas}</p>
                      <p className="font-mono text-[9px] text-txt3 tracking-widest uppercase">QRUs sucedidas</p>
                    </div>
                    <p className="mt-2 text-[11px] text-txt2 flex items-center gap-1"><TrendingUp size={11} className="text-green" /> {r.winRate}% aproveitamento</p>
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* ── Restante ──────────────────────────────────────── */}
          {resto.length > 0 && (
            <div className="bg-card border border-bdr rounded-xl overflow-hidden">
              {resto.map((r, i) => (
                <motion.div
                  key={r.id}
                  {...rowHandlers(r.id)}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.03 }}
                  className="flex items-center gap-4 px-4 py-3 border-b border-bdr/60 last:border-0 hover:bg-white/[0.02] transition-colors cursor-pointer"
                >
                  <span className="font-mono text-sm text-txt3 w-7 text-right">{i + 4}º</span>
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-white/10 flex items-center justify-center text-[11px] font-semibold text-white/80 shrink-0">
                    {perfilMap.get(r.id)?.avatar
                      ? <img src={perfilMap.get(r.id)!.avatar!} alt="" className="w-full h-full object-cover" />
                      : initials(r.nome)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-txt truncate">{r.nome}</p>
                    <p className="text-[11px] text-txt2 truncate">{r.patente}</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-2 w-40">
                    <div className="flex-1 h-1.5 rounded-full bg-bdr overflow-hidden">
                      <div className="h-full rounded-full bg-gold" style={{ width: `${Math.round((r.sucedidas / maxSucedidas) * 100)}%` }} />
                    </div>
                    <span className="text-[10px] text-txt3 font-mono w-9 text-right">{r.winRate}%</span>
                  </div>
                  <div className="text-right shrink-0 w-14">
                    <p className="text-lg font-bold text-gold3 leading-none">{r.sucedidas}</p>
                    <p className="font-mono text-[8px] text-txt3 tracking-widest uppercase">QRUs</p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Card de perfil (hover) ────────────────────────────── */}
      <AnimatePresence>
        {hoverId != null && (() => {
          const hr = rows.find(x => x.id === hoverId)
          if (!hr) return null
          const rank = rows.findIndex(x => x.id === hoverId) + 1
          const perfil = perfilMap.get(hoverId)
          const m = membroMap.get(hoverId)
          const bn = resolveBanner(perfil?.banner ?? null, rank)
          const wins = acoes.filter(a => a.resultado === 'Vitória' && a.participants.some(p => p.memberId === hoverId))
          const qc = new Map<string, number>()
          wins.forEach(a => qc.set(a.qru, (qc.get(a.qru) ?? 0) + 1))
          const topQru = [...qc.entries()].sort((a, b) => b[1] - a[1])[0] ?? null
          const derrotas = Math.max(0, hr.total - hr.sucedidas)
          const medal = rank <= 3 ? MEDALS[rank - 1] : '#3a72c4'
          const CARD_W = 300
          const vw = typeof window !== 'undefined' ? window.innerWidth : 1440
          const vh = typeof window !== 'undefined' ? window.innerHeight : 900
          let x = mouse.x + 20; if (x + CARD_W > vw - 8) x = Math.max(8, mouse.x - CARD_W - 20)
          let y = mouse.y + 14; if (y + 380 > vh) y = Math.max(12, vh - 392)
          return (
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.16, ease: EASE }}
              className="fixed z-50 pointer-events-none w-[300px] rounded-2xl overflow-hidden border border-white/10 bg-[#0a0d14] shadow-[0_24px_60px_-16px_rgba(0,0,0,0.85)]"
              style={{ left: x, top: y }}
            >
              {/* Banner */}
              <div className="relative h-24">
                {bn.img
                  ? <img src={bn.img} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  : <div className="absolute inset-0" style={{ background: bn.css }} />}
                {bn.overlay && <div className="absolute inset-0" style={{ background: bn.overlay }} />}
                <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(5,7,12,0.15), rgba(5,7,12,0.9))' }} />
                <span className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold"
                  style={{ color: medal, background: medal + '22', border: `1px solid ${medal}66` }}>
                  <Trophy size={10} /> {rank}º no ranking
                </span>
              </div>
              {/* Avatar + nome */}
              <div className="px-4 -mt-8 relative">
                <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 flex items-center justify-center text-lg font-bold text-white bg-[#141821]" style={{ borderColor: medal }}>
                  {perfil?.avatar
                    ? <img src={perfil.avatar} alt="" className="w-full h-full object-cover" />
                    : initials(hr.nome)}
                </div>
                <p className="text-txt font-semibold text-base mt-2 truncate">{hr.nome}</p>
                <p className="text-[11px] text-txt2 truncate">{hr.patente || '—'}</p>
              </div>
              {/* Stats */}
              <div className="grid grid-cols-3 gap-px bg-white/5 mt-3">
                <Stat label="Sucedidas" value={hr.sucedidas} color="#f5c451" />
                <Stat label="Aproveit." value={`${hr.winRate}%`} color="#2ecc71" />
                <Stat label="Ações" value={hr.total} color="#8fb8ee" />
              </div>
              {/* Infos */}
              <div className="px-4 py-3 space-y-1.5">
                {topQru && <Info icon={<Star size={12} className="text-gold3" />} label="QRU favorita" value={`${topQru[0]} (${topQru[1]})`} />}
                <Info icon={<TrendingUp size={12} className="text-green" />} label="Vitórias / Derrotas" value={`${hr.sucedidas} / ${derrotas}`} />
                {m?.badge && <Info icon={<Shield size={12} className="text-gold3" />} label="Badge" value={m.badge} />}
                {m?.passaporte && <Info icon={<Hash size={12} className="text-gold3" />} label="Passaporte" value={m.passaporte} />}
                <Info icon={<CalendarDays size={12} className="text-gold3" />} label="Entrada" value={fmtData(m?.entrada)} />
              </div>
            </motion.div>
          )
        })()}
      </AnimatePresence>
    </div>
  )
}
