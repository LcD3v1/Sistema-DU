import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowUpNarrowWide, ChevronsUp, Calendar } from 'lucide-react'
import { useMembros } from '@/hooks/useMembros'
import { useAllAcoes } from '@/hooks/useAcoes'
import { usePerms } from '@/hooks/usePerms'
import { PromocaoModal } from '@/components/sections/MembroGestao'
import LoadingHud from '@/components/ui/LoadingHud'
import type { Membro, Acao } from '@/types'

function fmt(d: string) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}
function diasDesde(d: string) {
  if (!d) return null
  const ms = Date.now() - new Date(d + 'T12:00:00').getTime()
  return Math.max(0, Math.floor(ms / 86400000))
}
function initials(n: string) {
  return n.split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')
}
function avaliar(winRate: number, total: number) {
  if (total < 3) return { label: 'Sem dados', cls: 'text-txt3 border-bdr2 bg-white/5' }
  if (winRate >= 75) return { label: 'Excelente', cls: 'text-green border-green/40 bg-green/10' }
  if (winRate >= 55) return { label: 'Bom', cls: 'text-gold3 border-gold/40 bg-gold/10' }
  if (winRate >= 35) return { label: 'Regular', cls: 'text-blue border-blue/40 bg-blue/10' }
  return { label: 'Baixo', cls: 'text-red border-red/40 bg-red/10' }
}

export default function PromocoesPage() {
  const { data: membros, isLoading: lm } = useMembros()
  const { data: acoesData, isLoading: la } = useAllAcoes()
  const { canEdit } = usePerms()
  const [alvo, setAlvo] = useState<Membro | null>(null)

  const isMod = canEdit('promocoes')

  const rows = useMemo(() => {
    const acoes: Acao[] = (acoesData?.acoes ?? []).filter(a => (a.status ?? 'aprovada') === 'aprovada')
    return (membros ?? []).map((m: Membro) => {
      const mine = acoes.filter(a => a.participants.some(p => p.memberId === m.id))
      const vitorias = mine.filter(a => a.resultado === 'Vitória').length
      const derrotas = mine.filter(a => a.resultado === 'Derrota').length
      const fechadas = vitorias + derrotas
      const winRate = fechadas ? Math.round((vitorias / fechadas) * 100) : 0
      return { m, vitorias, derrotas, winRate, aval: avaliar(winRate, fechadas), dias: diasDesde(m.promocao) }
    }).sort((a, b) => b.winRate - a.winRate || b.vitorias - a.vitorias)
  }, [membros, acoesData])

  if (lm || la) return <LoadingHud />

  return (
    <div className="p-6 max-w-[1400px]">
      <div className="mb-6">
        <p className="font-mono text-[10px] text-txt2 tracking-[0.2em] uppercase mb-1">Efetivo</p>
        <h1 className="text-3xl font-bold text-txt flex items-center gap-2">
          <ArrowUpNarrowWide size={26} className="text-gold" /> Promoções
        </h1>
        <p className="text-sm text-txt2 mt-1">Analise o desempenho do efetivo e promova quem merece.</p>
      </div>

      {rows.length === 0 ? (
        <div className="border border-bdr rounded-xl bg-card py-20 text-center">
          <ArrowUpNarrowWide size={30} className="text-txt3 mx-auto mb-3" />
          <p className="text-txt2 text-sm">Nenhum membro cadastrado.</p>
        </div>
      ) : (
        <div className="bg-card border border-bdr rounded-xl overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1.6fr_1fr_0.6fr_0.6fr_0.9fr_auto] gap-3 px-4 py-2.5 border-b border-bdr font-mono text-[10px] text-txt3 tracking-wider uppercase">
            <span>Membro</span>
            <span className="flex items-center gap-1"><Calendar size={11} /> Última promoção</span>
            <span className="text-center text-green">Vitórias</span>
            <span className="text-center text-red">Derrotas</span>
            <span>Avaliação</span>
            <span className="text-right">Ação</span>
          </div>

          {rows.map(({ m, vitorias, derrotas, winRate, aval, dias }, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.03 }}
              className="grid grid-cols-[1.6fr_1fr_0.6fr_0.6fr_0.9fr_auto] gap-3 px-4 py-3 border-b border-bdr/50 last:border-0 items-center hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-[11px] font-semibold text-white/80 shrink-0">{initials(m.policial)}</div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-txt truncate">{m.policial}</p>
                  <p className="text-[11px] text-txt2 truncate">{m.cargoNome || m.patenteInterna || m.patenteNPD || '—'}</p>
                </div>
              </div>

              <div className="min-w-0">
                <p className="text-sm text-txt">{fmt(m.promocao)}</p>
                {dias !== null && <p className="text-[11px] text-txt3">há {dias} dia{dias === 1 ? '' : 's'}</p>}
              </div>

              <p className="text-center text-green font-semibold">{vitorias}</p>
              <p className="text-center text-red font-semibold">{derrotas}</p>

              <div>
                <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-mono tracking-wider uppercase ${aval.cls}`}>{aval.label}</span>
                <p className="text-[11px] text-txt3 mt-1">{winRate}% aproveitamento</p>
              </div>

              <div className="text-right">
                {isMod ? (
                  <button
                    onClick={() => setAlvo(m)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold/15 border border-gold/40 text-gold3 text-xs font-medium hover:bg-gold/25 transition-colors">
                    <ChevronsUp size={14} /> Promover / rebaixar
                  </button>
                ) : <span className="text-txt3 text-xs font-mono">—</span>}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {alvo && (
        <PromocaoModal
          membro={(membros ?? []).find(m => m.id === alvo.id) ?? alvo}
          open={!!alvo}
          onClose={() => setAlvo(null)}
        />
      )}
    </div>
  )
}
