import { useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { Trophy, RefreshCw } from 'lucide-react'
import AnimatedCounter from '@/components/ui/AnimatedCounter'
import type { Member } from './types'

export function Avatar({ member, large = false }: { member: Pick<Member, 'name' | 'avatar'>; large?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null)
  return <span className={`inline-flex shrink-0 rounded-full overflow-hidden bg-gold/10 border border-gold/25 items-center justify-center font-semibold text-gold3 ${large ? 'w-16 h-16 text-xl' : 'w-10 h-10 text-xs'}`}>
    {member.avatar && failed !== member.avatar ? <img src={member.avatar} alt="" loading="lazy" width={large ? 64 : 40} height={large ? 64 : 40} className="w-full h-full object-cover" onError={() => setFailed(member.avatar)} />
      : member.name.split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '?'}
  </span>
}
export function Counter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const reduced = useReducedMotion()
  return reduced ? <>{value.toLocaleString('pt-BR')}{suffix}</> : <AnimatedCounter value={value} suffix={suffix} />
}
export function Skeleton() {
  return <div role="status" aria-label="Carregando ranking e membros" className="space-y-3 motion-safe:animate-pulse">
    <span className="sr-only">Carregando dados…</span>
    <div className="grid grid-cols-3 gap-3 mb-5">{[0, 1, 2].map(i => <div key={i} className="h-20 rounded-xl bg-card2 border border-bdr" />)}</div>
    {[0, 1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-card2 border border-bdr flex gap-3 p-4 items-center"><div className="w-10 h-10 rounded-full bg-bdr2" /><div className="flex-1 space-y-2"><div className="h-3 w-2/3 bg-bdr2 rounded" /><div className="h-2 w-1/3 bg-bdr2 rounded" /></div></div>)}
  </div>
}
export function EmptyState({ text, retry }: { text: string; retry?: () => void }) {
  return <div className="rounded-xl border border-bdr p-8 text-center text-txt2" role={retry ? 'alert' : 'status'}><Trophy size={26} className="mx-auto mb-3 text-gold3" /><p className="text-sm">{text}</p>{retry && <button className="inline-flex items-center gap-2 mt-4 text-sm text-gold3" onClick={retry}><RefreshCw size={14} /> Tentar novamente</button>}</div>
}
export function Pagination({ page, pages, total, onChange }: { page: number; pages: number; total: number; onChange: (page: number) => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 mt-4 text-xs text-txt2"><span>{total} resultados · Página {page} de {Math.max(page, pages)}</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => onChange(page - 1)} className="px-3 py-2 border border-bdr2 rounded-lg disabled:opacity-30">Anterior</button><button disabled={page >= pages} onClick={() => onChange(page + 1)} className="px-3 py-2 border border-bdr2 rounded-lg disabled:opacity-30">Próxima</button></div></div>
}
