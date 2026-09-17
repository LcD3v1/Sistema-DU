import { memo, useCallback, useEffect, useState } from 'react'
import { MotionConfig, motion, useReducedMotion } from 'framer-motion'
import { Trophy, Crown, Medal, Award, Search, Users, ArrowUp, ArrowDown, RefreshCw } from 'lucide-react'
import { resolveBanner } from '@/lib/banners'
import { useRanking, useDirectory, useRankingInvalidation, errorMessage } from './queries'
import { Avatar, Counter, EmptyState, Pagination, Skeleton } from './shared'
import { formatDate } from './format'
import MemberProfile from './MemberProfile'
import type { Member, Period, Ranking } from './types'
import './ranking.css'

const periods: { id: Period; label: string }[] = [{ id: 'all', label: 'Geral' }, { id: '7d', label: '7 dias' }, { id: '15d', label: '15 dias' }, { id: '30d', label: '30 dias' }]
const medals = ['#f5c451', '#cbd5e1', '#cd7f45']

function Position({ rank }: { rank: number | null }) {
  const [last, setLast] = useState(rank)
  const [delta, setDelta] = useState(0)
  if (last !== rank) { setDelta(last && rank ? last - rank : 0); setLast(rank) }
  useEffect(() => { const timer = setTimeout(() => setDelta(0), 6500); return () => clearTimeout(timer) }, [rank])
  return <span className="inline-flex items-center gap-1 font-mono text-xs shrink-0" aria-label={`Posição ${rank ?? 'não classificado'}${delta ? `, ${delta > 0 ? 'subiu' : 'caiu'} ${Math.abs(delta)}` : ''}`}>
    {rank ? `${rank}º` : '—'}{delta !== 0 && <span className={`inline-flex items-center text-[10px] ${delta > 0 ? 'text-green' : 'text-red'}`}>{delta > 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}{Math.abs(delta)}</span>}
  </span>
}

// memo: digitar na busca re-renderiza o módulo, mas os cards (com animação de layout) só quando o membro muda
const RankingCard = memo(function RankingCard({ member, onSelect, podium = false }: { member: Member; onSelect: (id: number) => void; podium?: boolean }) {
  const reduced = useReducedMotion()
  const index = (member.rank ?? 1) - 1
  const medal = medals[index] ?? 'var(--gold3)'
  const MedalIcon = index === 0 ? Crown : index === 1 ? Medal : Award
  const banner = resolveBanner(null, member.rank)
  if (podium) return <motion.button layout={!reduced} initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
    onClick={() => onSelect(member.id)} aria-label={`Ver perfil de ${member.name}, ${member.rank}º lugar`}
    className={`ranking-hover relative min-w-0 overflow-hidden rounded-2xl border p-4 sm:p-5 text-center ${index === 0 ? 'border-gold/50 sm:pb-8 shadow-[0_16px_40px_-20px_rgba(58,114,196,0.6)]' : 'border-bdr'}`}>
    {banner.img ? <img src={banner.img} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" /> : <div className="absolute inset-0" style={{ background: banner.css }} />}
    {banner.overlay && <div className="absolute inset-0" style={{ background: banner.overlay }} />}
    <div className="absolute inset-0 bg-gradient-to-b from-black/35 to-black/95" />
    <div className="relative flex flex-col items-center gap-2"><MedalIcon size={index === 0 ? 24 : 20} style={{ color: medal }} /><Avatar member={member} large />
      <span style={{ color: medal }}><Position rank={member.rank} /></span><p className="text-txt font-semibold truncate max-w-full">{member.name}</p>
      <p className="text-txt2 text-xs truncate max-w-full">{member.hierarchy}</p><p className="text-3xl font-bold" style={{ color: medal }}>{member.records}</p>
      <p className="font-mono text-[9px] uppercase tracking-wider text-txt2">Registros</p><p className="text-xs text-txt2">{member.wins} vitórias · {member.winRate}% WR</p>
    </div>
  </motion.button>
  return <motion.button layout={!reduced} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} onClick={() => onSelect(member.id)}
    className="ranking-hover w-full flex items-center gap-3 p-3 sm:p-4 border-b border-bdr last:border-0 text-left">
    <span className="text-gold3 min-w-7"><Position rank={member.rank} /></span><Avatar member={member} />
    <span className="flex-1 min-w-0"><span className="block text-sm text-txt font-medium truncate">{member.name}</span><span className="block text-xs text-txt2 truncate mt-1">{member.role} · {member.wins} vitórias · {member.winRate}% WR</span></span>
    <span className="text-right shrink-0"><span className="block text-lg font-bold text-gold3">{member.records}</span><span className="text-[9px] text-txt2 uppercase">Registros</span></span>
  </motion.button>
})

function Statistics({ data }: { data: Ranking }) {
  const stats = data.stats
  return <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 mb-5">
    {[
      { label: 'Win Rate', value: stats.winRate, suffix: '%', hint: `${stats.wins} vitórias · ${stats.losses} derrotas` },
      { label: 'Total de registros', value: stats.records, hint: 'Registros aprovados' },
      { label: 'Conquistas', value: stats.achievements, hint: 'No período selecionado' },
      { label: 'Sua posição', value: stats.position ?? 0, suffix: stats.position ? 'º' : '', hint: stats.position ? 'Ranking geral do período' : 'Sem classificação' },
      { label: 'Atividade', value: stats.activity, hint: `Participantes · ${stats.activeMembers} membros` },
    ].map((stat, i) => <div key={stat.label} className={`rounded-xl border p-3 sm:p-4 min-w-0 ${i === 0 ? 'bg-gold/10 border-gold/30' : 'bg-card border-bdr'}`}><p className="font-mono text-[10px] uppercase tracking-wider text-txt2">{stat.label}</p><p className="text-2xl font-semibold text-txt mt-2">{stat.label === 'Sua posição' ? (stats.position ? `${stats.position}º` : '—') : <Counter value={stat.value} suffix={stat.suffix} />}</p><p className="text-[10px] text-txt2 mt-1">{stat.hint}</p></div>)}
  </div>
}

export default function RankingModule({ publicView = false, mode = 'both' }: { publicView?: boolean; mode?: 'ranking' | 'members' | 'both' }) {
  const [period, setPeriod] = useState<Period>('all')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [role, setRole] = useState('')
  const [rankPage, setRankPage] = useState(1)
  const [memberPage, setMemberPage] = useState(1)
  const [selected, setSelected] = useState<number | null>(null)
  useRankingInvalidation()
  useEffect(() => {
    const timer = setTimeout(() => { setDebounced(search); setRankPage(1); setMemberPage(1) }, 350)
    return () => clearTimeout(timer)
  }, [search])
  const filters = { period, search: debounced, role }
  const ranking = useRanking({ ...filters, page: rankPage }, publicView, mode !== 'members')
  const directory = useDirectory({ ...filters, page: memberPage }, publicView, mode !== 'ranking')
  const roles = ranking.data?.roles ?? directory.data?.roles ?? []
  const closeProfile = useCallback(() => setSelected(null), [])
  const changePeriod = (value: Period) => { setPeriod(value); setRankPage(1); setMemberPage(1) }
  const busy = ranking.isFetching || directory.isFetching
  const refresh = () => { if (mode !== 'members') void ranking.refetch(); if (mode !== 'ranking') void directory.refetch() }
  const top = ranking.data?.items.filter(m => m.rank && m.rank <= 3) ?? []
  const podium = [top.find(m => m.rank === 2), top.find(m => m.rank === 1), top.find(m => m.rank === 3)].filter((m): m is Member => !!m)
  const rest = ranking.data?.items.filter(m => !m.rank || m.rank > 3) ?? []
  return <MotionConfig reducedMotion="user"><div className="ranking-module min-w-0">
    <div className="flex flex-wrap gap-3 items-center mb-5">
      <div className="flex bg-card2 border border-bdr rounded-lg p-1" aria-label="Período">{periods.map(p => <button key={p.id} aria-pressed={period === p.id} onClick={() => changePeriod(p.id)} className={`px-3 py-2 text-xs rounded-md transition-colors ${period === p.id ? 'bg-gold text-white' : 'text-txt2 hover:text-txt'}`}>{p.label}</button>)}</div>
      <label className="flex items-center gap-2 bg-card border border-bdr2 rounded-lg px-3 flex-1 min-w-[180px]"><Search size={15} className="text-txt2 shrink-0" /><input aria-label="Pesquisar membros" value={search} maxLength={100} onChange={e => setSearch(e.target.value)} placeholder={publicView ? 'Nome, identificação ou cargo' : 'Nome, Discord ID, ID interno ou cargo'} className="w-full min-w-0 py-2.5 text-xs bg-transparent text-txt outline-none" /></label>
      <select aria-label="Filtrar por cargo" value={role} onChange={e => { setRole(e.target.value); setRankPage(1); setMemberPage(1) }} className="max-w-full bg-card border border-bdr2 rounded-lg p-2.5 text-xs text-txt"><option value="">Todos os cargos</option>{roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
      <button disabled={busy} onClick={refresh} aria-label="Atualizar ranking e membros" className="p-2.5 rounded-lg border border-bdr2 text-txt2 hover:text-gold3 disabled:opacity-40"><RefreshCw size={16} /></button>
    </div>
    <p className="text-[11px] text-txt2 mb-4" role="status">{busy ? 'Atualizando dados…' : 'Dados atualizados · atualização automática a cada minuto'}</p>
    {mode !== 'members' && ranking.data && !ranking.error && <Statistics data={ranking.data} />}
    <div className={mode === 'both' ? 'grid grid-cols-1 xl:grid-cols-2 gap-6 items-start' : ''}>
      {mode !== 'members' && <section aria-label="Ranking" className="min-w-0"><h2 className="flex items-center gap-2 text-lg font-semibold text-txt mb-4"><Trophy size={18} className="text-gold3" /> Ranking</h2>
        {ranking.isPending ? <Skeleton /> : ranking.error ? <EmptyState text={errorMessage(ranking.error)} retry={() => void ranking.refetch()} /> : ranking.data && <>
          {!ranking.data.items.length ? <EmptyState text={search || role ? 'Nenhum membro encontrado.' : 'Ainda não existem dados suficientes para gerar o ranking.'} /> : <>
            {podium.length > 0 && <div className="ranking-podium grid grid-cols-1 sm:grid-cols-3 gap-3 items-end mb-4">{podium.map(m => <RankingCard key={`${period}:${m.id}`} member={m} onSelect={setSelected} podium />)}</div>}
            {!!rest.length && <div className="rounded-xl border border-bdr bg-card overflow-hidden">{rest.map(m => <RankingCard key={`${period}:${m.id}`} member={m} onSelect={setSelected} />)}</div>}
          </>}
          <Pagination page={rankPage} pages={ranking.data.pages} total={ranking.data.total} onChange={setRankPage} />
        </>}
      </section>}
      {mode !== 'ranking' && <section aria-label="Membros" className="min-w-0"><h2 className="flex items-center gap-2 text-lg font-semibold text-txt mb-4"><Users size={18} className="text-gold3" /> Membros</h2>
        {directory.isPending ? <Skeleton /> : directory.error ? <EmptyState text={errorMessage(directory.error)} retry={() => void directory.refetch()} /> : directory.data && <>
          {!directory.data.items.length ? <EmptyState text="Nenhum membro encontrado." /> : <div className="space-y-5">{directory.data.roles.map((r, i) => {
            const members = directory.data!.items.filter(m => m.roleId === r.id)
            if (!members.length) return null
            return <div key={r.id}><h3 className="flex items-center gap-2 text-xs font-mono uppercase text-txt border-b border-bdr2 pb-2 mb-2"><span className="text-gold3">{String(i + 1).padStart(2, '0')}</span>{r.name}</h3><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2 gap-2">{members.map(m => <button key={m.id} onClick={() => setSelected(m.id)} className="ranking-hover text-left flex gap-3 p-3 rounded-xl border border-bdr bg-card min-w-0"><div className="relative self-start"><Avatar member={m} /><span title={m.status} className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-card ${m.status === 'Ativo' ? 'bg-green' : 'bg-gold'}`} /></div><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="text-[10px] font-mono text-gold3 shrink-0">{m.badge || m.internalId || '—'}</span><span className="text-sm font-medium text-txt truncate">{m.name}</span></span><span className="block text-xs text-txt2 truncate mt-1">{m.role} · Nível {m.level > 0 ? m.level : '—'}</span><span className="block text-[10px] text-txt2 mt-1">Desde {formatDate(m.joinedAt)}</span><span className="flex flex-wrap gap-2 items-center text-[10px] text-gold3 mt-2"><Position key={period} rank={m.rank} />{m.wins} vitórias · {m.winRate}% WR</span>{!publicView && <span className="block text-[10px] text-txt2 truncate mt-1">Discord: {m.discordId || 'Não vinculado'}</span>}</span></button>)}</div></div>
          })}</div>}
          <Pagination page={memberPage} pages={directory.data.pages} total={directory.data.total} onChange={setMemberPage} />
        </>}
      </section>}
    </div>
    {selected !== null && <MemberProfile id={selected} period={period} publicView={publicView} onClose={closeProfile} />}
  </div></MotionConfig>
}
