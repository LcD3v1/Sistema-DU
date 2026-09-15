import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { X, Crown, Trophy, Users, ArrowRight } from 'lucide-react'
import { usePublicRanking, usePublicMembros } from '@/hooks/usePublic'
import type { MembroPub } from '@/hooks/usePublic'

type Tab = 'ranking' | 'membros'

const WINDOWS = [
  { key: 'all', label: 'Todo o período' },
  { key: '7', label: '7 dias' },
  { key: '15', label: '15 dias' },
  { key: '30', label: '30 dias' },
]

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')
}
function fmtDate(d: string) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function RankingView() {
  const [win, setWin] = useState('all')
  const { data, isLoading } = usePublicRanking(win)
  return (
    <>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="grid grid-cols-3 gap-3 flex-1 min-w-[280px]">
          <div className="rounded-lg border border-gold/40 bg-gold/10 p-3">
            <p className="font-mono text-[9px] text-gold3 tracking-[0.15em] uppercase mb-1">Win rate</p>
            <p className="text-2xl font-bold text-gold3">{data?.winRate ?? 0}%</p>
            <p className="text-[10px] text-white/50 mt-0.5">{data?.vitoriasTotais ?? 0} vitórias / {data?.acoesFechadas ?? 0} fechadas</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="font-mono text-[9px] text-white/50 tracking-[0.15em] uppercase mb-1">Apreensões</p>
            <p className="text-2xl font-bold text-white">{data?.totalApreensoes ?? 0}</p>
            <p className="text-[10px] text-white/50 mt-0.5">registros aprovados</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="font-mono text-[9px] text-white/50 tracking-[0.15em] uppercase mb-1">Conquistas</p>
            <p className="text-2xl font-bold text-white">{data?.conquistas ?? 0}</p>
            <p className="text-[10px] text-white/50 mt-0.5">liberadas</p>
          </div>
        </div>
        <div className="flex gap-0.5 bg-white/5 rounded-md p-0.5 self-start">
          {WINDOWS.map(w => (
            <button key={w.key} onClick={() => setWin(w.key)}
              className={`px-2.5 py-1 rounded text-[10px] font-mono transition-colors ${win === w.key ? 'bg-gold text-white' : 'text-white/50 hover:text-white'}`}>
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-white/40 text-sm py-10 text-center">Carregando…</p>
      ) : (data?.list.length ?? 0) === 0 ? (
        <p className="text-white/40 text-sm py-12 text-center">Nenhum registro no período.</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-8 gap-y-0">
          {data!.list.map(item => (
            <div key={item.memberId} className="flex items-center gap-3 py-2.5 border-b border-white/[0.06]">
              <span className={`font-mono text-sm w-6 text-right ${item.rank <= 3 ? 'text-gold3 font-bold' : 'text-white/40'}`}>{String(item.rank).padStart(2, '0')}</span>
              <div className="w-8 h-8 rounded-md bg-white/10 flex items-center justify-center text-[10px] font-semibold text-white/80 shrink-0">{initials(item.name)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate flex items-center gap-1.5">{item.name}{item.rank <= 3 && <Crown size={11} className="text-gold3" />}</p>
                <p className="text-[11px] text-white/50 truncate">{item.role} · {item.vitorias} vitórias</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-base font-bold text-gold3 leading-none">{item.registros}</p>
                <p className="font-mono text-[8px] text-white/40 tracking-widest uppercase">Reg.</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function MemberRow({ m }: { m: MembroPub }) {
  const active = m.status === 'Ativo'
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="relative shrink-0">
        <div className="w-8 h-8 rounded-md bg-white/10 flex items-center justify-center text-[10px] font-semibold text-white/80">{initials(m.name)}</div>
        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0a0d14] ${active ? 'bg-green' : 'bg-white/30'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate"><span className="font-mono text-white/40 text-xs mr-1.5">{m.badge}</span>{m.name}</p>
        <p className="text-[11px] text-white/50 truncate">{m.role}</p>
      </div>
      <p className="font-mono text-[10px] text-white/40 shrink-0">desde {fmtDate(m.entrada)}</p>
    </div>
  )
}

function MembrosView() {
  const { data, isLoading } = usePublicMembros()
  if (isLoading) return <p className="text-white/40 text-sm py-10 text-center">Carregando…</p>
  if ((data?.grupos.length ?? 0) === 0) return <p className="text-white/40 text-sm py-12 text-center">Nenhum membro cadastrado.</p>
  return (
    <div>
      {data!.grupos.map((g, gi) => (
        <div key={g.patente} className="mb-5">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-mono text-[11px] text-gold3 font-bold">{String(gi + 1).padStart(2, '0')}</span>
            <span className="font-mono text-[11px] text-white/70 tracking-[0.15em] uppercase">{g.patente}</span>
            <span className="flex-1 h-px bg-white/[0.08]" />
            <span className="font-mono text-[10px] text-white/30">{g.membros.length}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-8">
            {g.membros.map(m => <MemberRow key={m.id} m={m} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function PublicOverlay({ initialTab, onClose }: { initialTab: Tab; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>(initialTab)
  useEffect(() => setTab(initialTab), [initialTab])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <motion.div
      className="absolute inset-0 z-40 flex items-center justify-center p-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ y: 24, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 24, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 140, damping: 22 }}
        className="relative w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl border border-white/10 bg-[#0a0d14]/95 shadow-2xl overflow-hidden"
      >
        {/* Header com abas */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-white/10">
          <div className="flex bg-white/5 rounded-lg p-1">
            <button onClick={() => setTab('ranking')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'ranking' ? 'bg-gold text-white' : 'text-white/60 hover:text-white'}`}>
              <Trophy size={15} /> Ranking
            </button>
            <button onClick={() => setTab('membros')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'membros' ? 'bg-gold text-white' : 'text-white/60 hover:text-white'}`}>
              <Users size={15} /> Membros
            </button>
          </div>
          <div className="flex-1">
            <p className="font-mono text-[10px] text-white/40 tracking-[0.2em] uppercase">
              {tab === 'ranking' ? 'Classificação operacional' : 'Diretório da unidade'}
            </p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors"><X size={20} /></button>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto px-6 py-5 text-white">
          {tab === 'ranking' ? <RankingView /> : <MembrosView />}
        </div>

        <div className="px-6 py-2.5 border-t border-white/10 flex items-center justify-between">
          <span className="font-mono text-[10px] text-white/30 tracking-widest uppercase">FAST · North Police Department</span>
          <span className="flex items-center gap-1 font-mono text-[10px] text-white/30"><ArrowRight size={11} /> Esc para fechar</span>
        </div>
      </motion.div>
    </motion.div>
  )
}
