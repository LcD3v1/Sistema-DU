import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Award, X } from 'lucide-react'
import { useMember, errorMessage } from './queries'
import { Avatar, Skeleton, EmptyState } from './shared'
import { formatDate } from './format'
import type { Period } from './types'

export default function MemberProfile({ id, period, publicView, onClose }: {
  id: number; period: Period; publicView: boolean; onClose: () => void
}) {
  const { data: member, isPending, error, refetch } = useMember(id, period, publicView)
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const root = ref.current
    root?.focus()
    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); onClose() }
      if (e.key !== 'Tab') return
      const targets = root?.querySelectorAll<HTMLElement>('button, a[href], input, select, [tabindex="0"]')
      if (!targets?.length) { e.preventDefault(); return }
      const first = targets[0], last = targets[targets.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) { e.preventDefault(); last.focus() }
      if (!e.shiftKey && (document.activeElement === last || document.activeElement === root)) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keydown, true)
    return () => { document.removeEventListener('keydown', keydown, true); previous?.focus() }
  }, [onClose])
  return createPortal(
    <div className="ranking-module fixed inset-0 z-9500 flex justify-end bg-black/75 backdrop-blur-sm" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <motion.div ref={ref} role="dialog" aria-modal="true" aria-labelledby="member-profile-title" tabIndex={-1}
        initial={reduced ? false : { x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.2 }}
        className="bg-card border-l border-bdr2 w-full max-w-lg h-full overflow-y-auto p-5 sm:p-7 outline-none">
        <header className="flex items-center justify-between mb-7">
          <h2 id="member-profile-title" className="text-lg font-semibold text-txt">Perfil do membro</h2>
          <button aria-label="Fechar perfil" className="p-2 text-txt2 hover:text-txt rounded-lg border border-bdr2" onClick={onClose}><X size={18} /></button>
        </header>
        {isPending ? <Skeleton /> : error ? <EmptyState text={errorMessage(error)} retry={() => void refetch()} /> : member && <>
          <div className="flex gap-4 items-center mb-6"><Avatar member={member} large /><div className="min-w-0">
            <h3 className="text-2xl text-txt font-semibold wrap-break-word">{member.name}</h3>
            <p className="text-gold3 text-sm">{member.hierarchy}</p><p className="text-txt2 text-xs mt-1">{member.role}</p>
          </div></div>
          <dl className="grid grid-cols-2 gap-4 text-sm mb-6">
            {[
              ['Discord ID', publicView ? 'Disponível no painel' : member.discordId || 'Não vinculado'],
              ['ID interno', publicView ? member.badge || '—' : member.internalId || member.badge || '—'],
              ['Nível', member.level > 0 ? member.level : '—'], ['Entrada', formatDate(member.joinedAt)], ['Status', member.status],
              ['Posição', member.rank ? `${member.rank}º` : 'Sem classificação'],
            ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-txt2 text-xs mb-1">{label}</dt><dd className="text-txt wrap-break-word">{value}</dd></div>)}
          </dl>
          <div className="grid grid-cols-2 gap-3 mb-6">{[
            ['Vitórias', member.wins], ['Derrotas', member.losses], ['Win Rate', `${member.winRate}%`], ['Registros', member.records],
          ].map(([label, value]) => <div key={label} className="bg-card2 rounded-xl border border-bdr p-4"><p className="text-txt2 text-xs">{label}</p><p className="text-2xl font-semibold text-gold3 mt-1">{value}</p></div>)}</div>
          <h4 className="font-semibold text-sm text-txt mb-3 flex gap-2 items-center"><Award size={16} /> Conquistas no período</h4>
          {member.achievements.length ? <ul className="space-y-2 mb-6">{member.achievements.map(a => <li key={a.id} className="border border-gold/25 rounded-lg p-3 text-sm text-gold3 flex justify-between gap-3"><span>{a.name}</span><span className="text-txt2 text-xs">{formatDate(a.earnedAt)}</span></li>)}</ul>
            : <p className="text-txt2 text-sm mb-6">Nenhuma conquista neste período.</p>}
          <h4 className="font-semibold text-sm text-txt mb-3">Atividade recente</h4>
          {publicView ? <p className="text-txt2 text-sm">Entre no painel para consultar o histórico autorizado.</p> : member.activity.length ? <ul className="space-y-3">{member.activity.map(a => <li key={a.id} className="flex justify-between gap-3 border-b border-bdr pb-3 text-sm"><div><p className="text-txt">{a.type}</p><p className="text-xs text-txt2 mt-1">{formatDate(a.date)}</p></div><span className={a.result === 'Vitória' ? 'text-green' : a.result === 'Derrota' ? 'text-red' : 'text-txt2'}>{a.result}</span></li>)}</ul>
            : <p className="text-txt2 text-sm">Sem atividade no período selecionado.</p>}
        </>}
      </motion.div>
    </div>, document.body,
  )
}
