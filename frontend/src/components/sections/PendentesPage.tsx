import { motion } from 'framer-motion'
import { ClipboardCheck, Check, X, Calendar, MapPin, Users, Trophy, Image as ImageIcon, ShieldAlert } from 'lucide-react'
import { useAcoes, useApproveAcao, useDeleteAcao } from '@/hooks/useAcoes'
import { useMembros } from '@/hooks/useMembros'
import { usePerms } from '@/hooks/usePerms'
import { useUIStore } from '@/store/uiStore'
import LoadingHud from '@/components/ui/LoadingHud'
import type { Membro } from '@/types'

const RESULTADO_CLS: Record<string, string> = {
  'Vitória': 'text-green border-green/40 bg-green/10',
  'Derrota': 'text-red border-red/40 bg-red/10',
  'Empate':  'text-blue border-blue/40 bg-blue/10',
}

function fmt(d: string) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export default function PendentesPage() {
  const { data, isLoading } = useAcoes({ status: 'pendente', limit: 200 })
  const { data: membros } = useMembros()
  const aprovar = useApproveAcao()
  const recusar = useDeleteAcao()
  const { canEdit } = usePerms()
  const { addToast } = useUIStore()

  const isMod = canEdit('pendentes')
  const membrosMap = new Map((membros ?? []).map((m: Membro) => [m.id, m]))
  const acoes = data?.acoes ?? []

  if (isLoading) return <LoadingHud />

  return (
    <div className="p-6 max-w-[1400px]">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <p className="font-mono text-[10px] text-txt2 tracking-[0.2em] uppercase mb-1">Apreensões</p>
          <h1 className="text-3xl font-bold text-txt flex items-center gap-2">
            <ClipboardCheck size={26} className="text-gold" /> Pendentes
          </h1>
          <p className="text-sm text-txt2 mt-1">
            {isMod ? 'Aprove ou recuse as apreensões aguardando validação do comando.' : 'Apreensões aguardando aprovação do comando.'}
          </p>
        </div>
        <span className="px-3 py-1.5 rounded-lg border border-gold/30 bg-gold/10 text-gold3 font-mono text-xs">
          {acoes.length} pendente{acoes.length === 1 ? '' : 's'}
        </span>
      </div>

      {acoes.length === 0 ? (
        <div className="border border-bdr rounded-xl bg-card py-20 text-center">
          <ClipboardCheck size={30} className="text-txt3 mx-auto mb-3" />
          <p className="text-txt2 text-sm">Nenhuma apreensão pendente. Tudo em dia! ✔</p>
        </div>
      ) : (
        <div className="space-y-3">
          {acoes.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
              className="bg-card border border-bdr rounded-xl p-4 hover:border-gold/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="font-mono text-[11px] text-txt3">BO Nº {a.id}</span>
                    <span className="text-txt font-semibold">{a.qru}</span>
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-mono tracking-wider uppercase ${RESULTADO_CLS[a.resultado] ?? 'text-txt2 border-bdr2'}`}>
                      {a.resultado}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-txt2 flex-wrap">
                    <span className="flex items-center gap-1"><Calendar size={12} /> {fmt(a.data)}</span>
                    {a.local && <span className="flex items-center gap-1"><MapPin size={12} /> {a.local}</span>}
                    <span className="flex items-center gap-1"><Users size={12} /> {a.participants.length + (a.participantesExtras?.length ?? 0)} participante(s)</span>
                    {a.imagem && <a href={a.imagem} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-gold3 hover:text-white transition-colors"><ImageIcon size={12} /> print</a>}
                  </div>
                  {a.participants.length > 0 && (
                    <p className="text-[11px] text-txt3 mt-2 truncate">
                      {a.participants.map(p => membrosMap.get(p.memberId)?.policial ?? `#${p.memberId}`).join(', ')}
                    </p>
                  )}
                </div>

                {isMod ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => aprovar.mutate(a.id, { onSuccess: () => addToast('success', `BO Nº ${a.id} aprovado!`) })}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green/15 border border-green/40 text-green text-sm font-medium hover:bg-green/25 transition-colors">
                      <Check size={15} /> Aprovar
                    </button>
                    <button
                      onClick={() => { if (confirm(`Recusar o BO Nº ${a.id}? Ele será excluído.`)) recusar.mutate(a.id, { onSuccess: () => addToast('success', 'Apreensão recusada.') }) }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-bdr2 text-txt2 text-sm hover:text-red hover:border-red/40 transition-colors">
                      <X size={15} /> Recusar
                    </button>
                  </div>
                ) : (
                  <span className="flex items-center gap-1.5 text-txt3 text-xs font-mono shrink-0">
                    <ShieldAlert size={13} /> Aguardando comando
                  </span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
