import { useState } from 'react'
import { UserPlus, Check, X, Clock } from 'lucide-react'
import { usePedidosAcesso, useAprovarAcesso, useRecusarAcesso } from '@/hooks/useContas'
import { useUIStore } from '@/store/uiStore'
import { confirmar } from '@/lib/dialogo'
import type { CargoPermissao } from '@/hooks/useCargosPermissao'

const erroApi = (e: unknown, padrao: string) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? padrao

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

/**
 * Pedidos de acesso feitos na tela de login (igual ao Sistema Tática).
 * Aprovar cria a conta com o usuário e a senha que a pessoa escolheu.
 */
export default function PedidosAcesso({ cargos, cargoPadraoId }: { cargos: CargoPermissao[]; cargoPadraoId?: number }) {
  const { addToast } = useUIStore()
  const { data: pedidos = [] } = usePedidosAcesso()
  const aprovar = useAprovarAcesso()
  const recusar = useRecusarAcesso()
  const [cargoPorPedido, setCargoPorPedido] = useState<Record<number, number | ''>>({})

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-orbitron text-xs text-gold tracking-wider mb-1">PEDIDOS DE ACESSO</h3>
        <p className="text-[11px] text-txt3">Pedidos feitos na tela de login. Ao aprovar, a conta é criada com o usuário e a senha que a pessoa escolheu; no primeiro acesso ela preenche o cadastro.</p>
      </div>
      {pedidos.length === 0 ? (
        <p className="font-mono text-xs text-txt3 px-1">Nenhum pedido de acesso pendente.</p>
      ) : (
        <div className="space-y-2">
          {pedidos.map(p => {
            const cargoSel = cargoPorPedido[p.id] ?? cargoPadraoId ?? ''
            const ocupado = aprovar.isPending || recusar.isPending
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 bg-card2 border border-bdr rounded-lg">
                <UserPlus size={16} className="text-gold3 shrink-0" />
                <div className="flex-1 min-w-[180px]">
                  <p className="text-sm text-txt font-medium">{p.nome}</p>
                  <p className="font-mono text-[11px] text-txt3 flex items-center gap-2">
                    <span className="text-gold3">@{p.username}</span>
                    <span className="flex items-center gap-1"><Clock size={10} /> {dataHora(p.criadoEm)}</span>
                  </p>
                </div>
                <select
                  value={cargoSel}
                  onChange={e => setCargoPorPedido(s => ({ ...s, [p.id]: e.target.value ? Number(e.target.value) : '' }))}
                  className="bg-card border border-bdr2 rounded px-2 py-1.5 text-xs font-mono text-txt"
                  aria-label={`Cargo para ${p.nome}`}
                >
                  <option value="">Sem cargo (definir depois)</option>
                  {cargos.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <button
                  disabled={ocupado}
                  onClick={() => aprovar.mutate({ id: p.id, cargoPermId: cargoSel === '' ? null : cargoSel }, {
                    onSuccess: () => addToast('success', `Acesso de ${p.nome} aprovado.`),
                    onError: e => addToast('error', erroApi(e, 'Não foi possível aprovar.')),
                  })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-green/15 border border-green/40 text-green text-xs font-mono hover:bg-green/25 transition-colors disabled:opacity-50"
                >
                  <Check size={13} /> Aprovar
                </button>
                <button
                  disabled={ocupado}
                  onClick={async () => {
                    if (!(await confirmar({ titulo: 'Recusar pedido', mensagem: `Recusar o pedido de acesso de ${p.nome} (@${p.username})?`, tom: 'perigo', textoConfirmar: 'Recusar' }))) return
                    recusar.mutate(p.id, {
                      onSuccess: () => addToast('success', 'Pedido recusado.'),
                      onError: e => addToast('error', erroApi(e, 'Não foi possível recusar.')),
                    })
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-red/40 text-red text-xs font-mono hover:bg-red/10 transition-colors disabled:opacity-50"
                >
                  <X size={13} /> Recusar
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
