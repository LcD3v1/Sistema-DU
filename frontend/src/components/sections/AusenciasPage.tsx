import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CalendarPlus, CalendarDays, Trash2, Clock, CheckCircle2, PlayCircle } from 'lucide-react'
import { useAusencias, useDeleteAusencia, statusAusencia } from '@/hooks/useAusencias'
import type { Ausencia, AusenciaStatus } from '@/hooks/useAusencias'
import { usePerms } from '@/hooks/usePerms'
import LoadingHud from '@/components/ui/LoadingHud'

const STATUS_META: Record<AusenciaStatus, { label: string; cls: string; dot: string; icon: typeof Clock }> = {
  ativa:      { label: 'Ativa',      cls: 'text-green border-green/40 bg-green/10', dot: '#2ecc71', icon: PlayCircle },
  programada: { label: 'Programada', cls: 'text-gold3 border-gold/40 bg-gold/10',   dot: '#3a72c4', icon: Clock },
  encerrada:  { label: 'Encerrada',  cls: 'text-txt2 border-bdr2 bg-white/5',       dot: '#8b8b8b', icon: CheckCircle2 },
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')
}
function fmt(d: string) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}
function dias(a: Ausencia) {
  const ms = new Date(a.dataFim + 'T12:00:00').getTime() - new Date(a.dataInicio + 'T12:00:00').getTime()
  return Math.round(ms / 86400000) + 1
}

const FILTERS: { key: 'todas' | AusenciaStatus; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'ativa', label: 'Ativas' },
  { key: 'programada', label: 'Programadas' },
  { key: 'encerrada', label: 'Encerradas' },
]

export default function AusenciasPage() {
  const navigate = useNavigate()
  const { data: ausencias, isLoading } = useAusencias()
  const del = useDeleteAusencia()
  const { canEdit } = usePerms()
  const isMod = canEdit('ausencias')

  const [filter, setFilter] = useState<'todas' | AusenciaStatus>('todas')

  const withStatus = useMemo(
    () => (ausencias ?? []).map(a => ({ ...a, st: statusAusencia(a) })),
    [ausencias],
  )
  const counts = useMemo(() => ({
    ativa: withStatus.filter(a => a.st === 'ativa').length,
    programada: withStatus.filter(a => a.st === 'programada').length,
    encerrada: withStatus.filter(a => a.st === 'encerrada').length,
  }), [withStatus])

  const list = filter === 'todas' ? withStatus : withStatus.filter(a => a.st === filter)

  if (isLoading) return <LoadingHud />

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <p className="font-mono text-[10px] text-txt2 tracking-[0.2em] uppercase mb-1">Efetivo</p>
          <h1 className="text-3xl font-bold text-txt flex items-center gap-2">
            <CalendarDays size={26} className="text-gold" /> Ausências
          </h1>
          <p className="text-sm text-txt2 mt-1">Membros afastados — ativos, programados e encerrados.</p>
        </div>
        <button
          onClick={() => navigate('/ausencias/nova')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold text-white text-sm font-medium hover:bg-gold2 transition-colors shadow-[0_10px_30px_-10px_rgba(58,114,196,0.7)]"
        >
          <CalendarPlus size={16} /> Registrar ausência
        </button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {(['ativa', 'programada', 'encerrada'] as AusenciaStatus[]).map(s => {
          const m = STATUS_META[s]
          const Icon = m.icon
          return (
            <div key={s} className="bg-card border border-bdr rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: m.dot + '18', border: `1px solid ${m.dot}40` }}>
                <Icon size={18} style={{ color: m.dot }} />
              </div>
              <div>
                <p className="text-2xl font-bold text-txt leading-none">{counts[s]}</p>
                <p className="font-mono text-[10px] text-txt2 tracking-wider uppercase mt-1">{m.label}s</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Filtros */}
      <div className="flex gap-1 mb-4 bg-card border border-bdr rounded-lg p-1 w-fit">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              filter === f.key ? 'bg-gold text-white' : 'text-txt2 hover:text-txt'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {list.length === 0 ? (
        <div className="border border-bdr rounded-xl bg-card py-16 text-center">
          <CalendarDays size={30} className="text-txt3 mx-auto mb-3" />
          <p className="text-txt2 text-sm">Nenhuma ausência {filter !== 'todas' ? STATUS_META[filter as AusenciaStatus].label.toLowerCase() : 'registrada'}.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {list.map((a, i) => {
            const m = STATUS_META[a.st]
            return (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                className="group flex items-center gap-4 bg-card border border-bdr rounded-xl px-4 py-3 hover:border-gold/40 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-xs font-semibold text-white/80 shrink-0">
                  {initials(a.nome)}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-txt truncate">{a.nome}</p>
                  <p className="text-[11px] text-txt2 truncate">
                    {a.motivo || <span className="text-txt3 italic">sem motivo informado</span>}
                  </p>
                </div>

                <div className="hidden sm:flex flex-col items-end shrink-0">
                  <span className="text-xs text-txt font-mono">{fmt(a.dataInicio)} → {fmt(a.dataFim)}</span>
                  <span className="text-[10px] text-txt3 font-mono">{dias(a)} dia{dias(a) > 1 ? 's' : ''}</span>
                </div>

                <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-mono text-[10px] tracking-wider uppercase shrink-0 ${m.cls}`}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.dot }} /> {m.label}
                </span>

                {isMod && (
                  <button
                    onClick={() => del.mutate(a.id)}
                    className="text-txt3 hover:text-red transition-colors p-1 opacity-0 group-hover:opacity-100"
                    aria-label="Remover ausência"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
