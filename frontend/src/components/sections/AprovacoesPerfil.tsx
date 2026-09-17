import { useQuery, useMutation } from '@tanstack/react-query'
import { UserCog, Scale, ArrowRight } from 'lucide-react'
import api from '@/lib/axios'
import { queryClient } from '@/lib/queryClient'
import { useUIStore } from '@/store/uiStore'
import { ROTULO_CAMPO } from '@/lib/perfil'
import { decidir } from '@/lib/dialogo'

export interface SolicitacaoPerfil {
  id: number
  membroId: number
  membroNome: string
  solicitante?: string
  alteracoes: { campo: string; de: string; para: string }[]
  criadoEm: string
}

const erroApi = (e: unknown, padrao: string) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? padrao

function invalidar() {
  queryClient.invalidateQueries({ queryKey: ['membros'] })
}

/** Alterações de perfil aguardando aprovação de um superior. */
export default function AprovacoesPerfil() {
  const { addToast } = useUIStore()
  const { data: lista = [] } = useQuery<SolicitacaoPerfil[]>({
    queryKey: ['membros', 'solicitacoes-perfil'],
    queryFn: async () => (await api.get<SolicitacaoPerfil[]>('/membros/solicitacoes-perfil')).data,
    refetchInterval: 30_000,
  })
  const aprovar = useMutation({ mutationFn: (id: number) => api.put(`/membros/solicitacoes-perfil/${id}/aprovar`), onSuccess: invalidar })
  const recusar = useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo?: string }) => api.put(`/membros/solicitacoes-perfil/${id}/recusar`, { motivo }),
    onSuccess: invalidar,
  })

  if (lista.length === 0) return null

  return (
    <div className="bg-card border border-gold/30 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-bdr bg-gold/5">
        <UserCog size={15} className="text-gold3" />
        <p className="text-sm font-semibold text-txt">Alterações de perfil aguardando aprovação</p>
        <span className="ml-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-white text-[10px] font-bold flex items-center justify-center">{lista.length}</span>
      </div>
      <div className="divide-y divide-bdr/60">
        {lista.map(sp => (
          <div key={sp.id} className="flex flex-wrap items-start gap-4 px-4 py-3">
            <div className="min-w-[160px]">
              <p className="text-sm text-txt font-medium">{sp.membroNome}</p>
              <p className="text-[11px] font-mono text-txt3">{sp.solicitante ? `@${sp.solicitante} · ` : ''}{new Date(sp.criadoEm).toLocaleString('pt-BR')}</p>
            </div>
            <div className="flex-1 min-w-0 sm:min-w-[220px] space-y-1">
              {sp.alteracoes.map(a => (
                <p key={a.campo} className="text-xs flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-txt3 w-24">{ROTULO_CAMPO[a.campo] ?? a.campo}</span>
                  <span className="text-txt2 line-through decoration-red/60">{a.de || '—'}</span>
                  <ArrowRight size={11} className="text-txt3" />
                  <span className="text-green font-medium">{a.para || '—'}</span>
                </p>
              ))}
            </div>
            <button
              disabled={aprovar.isPending || recusar.isPending}
              onClick={async () => {
                const r = await decidir({
                  titulo: 'Alteração de perfil',
                  mensagem: `${sp.membroNome} pediu para alterar o perfil. Ao aprovar, as mudanças valem na hora e são enviadas ao canal dele.`,
                  detalhes: [
                    ...sp.alteracoes.map(a => ({ label: ROTULO_CAMPO[a.campo] ?? a.campo, valor: `${a.de || '—'} → ${a.para || '—'}` })),
                    { label: 'Pedido em', valor: new Date(sp.criadoEm).toLocaleString('pt-BR') },
                  ],
                })
                if (r?.decisao === 'aprovar') {
                  aprovar.mutate(sp.id, {
                    onSuccess: () => addToast('success', `Perfil de ${sp.membroNome} atualizado.`),
                    onError: e => addToast('error', erroApi(e, 'Erro ao aprovar.')),
                  })
                } else if (r?.decisao === 'reprovar') {
                  recusar.mutate({ id: sp.id, motivo: r.motivo || undefined }, {
                    onSuccess: () => addToast('success', 'Alteração reprovada.'),
                    onError: e => addToast('error', erroApi(e, 'Erro ao reprovar.')),
                  })
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold/15 border border-gold/40 text-gold3 text-xs font-medium hover:bg-gold/25 disabled:opacity-50">
              <Scale size={13} /> Analisar
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
