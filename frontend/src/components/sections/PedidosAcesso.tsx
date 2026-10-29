import { useState } from 'react'
import { UserPlus, Check, X, Clock, Pencil } from 'lucide-react'
import { usePedidosAcesso, useAprovarAcesso, useRecusarAcesso, useCorrigirAcesso } from '@/hooks/useContas'
import { useUIStore } from '@/store/uiStore'
import { confirmar } from '@/lib/dialogo'
import type { CargoPermissao } from '@/hooks/useCargosPermissao'

const erroApi = (e: unknown, padrao: string) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? padrao

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

/**
 * Pedidos de acesso: primeiro login pelo Discord ou pedido de set (botão Solicitar set no Discord).
 * Aprovar cria a conta ligada ao Discord; no pedido de set também dá os cargos da patente no
 * Discord, avisa no privado e apaga o canal temporário.
 */
export default function PedidosAcesso({ cargos, cargoPadraoId }: { cargos: CargoPermissao[]; cargoPadraoId?: number }) {
  const { addToast } = useUIStore()
  const { data: pedidos = [] } = usePedidosAcesso()
  const aprovar = useAprovarAcesso()
  const recusar = useRecusarAcesso()
  const corrigir = useCorrigirAcesso()
  const [cargoPorPedido, setCargoPorPedido] = useState<Record<number, number | ''>>({})

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-orbitron text-xs text-gold tracking-wider mb-1">PEDIDOS DE ACESSO</h3>
        <p className="text-[11px] text-txt3">Pedidos do primeiro login pelo Discord e pedidos de set (botão no Discord). Ao aprovar, a conta é criada ligada ao Discord da pessoa e, no pedido de set, ela ganha os cargos da patente e o cadastro já vem preenchido. Quem sai do servidor antes da aprovação tem o pedido descartado.</p>
      </div>
      {pedidos.length === 0 ? (
        <p className="font-mono text-xs text-txt3 px-1">Nenhum pedido de acesso pendente.</p>
      ) : (
        <div className="space-y-2">
          {pedidos.map(p => {
            // Pedido de set: sugere o cargo do site ligado à patente
            const cargoSel = cargoPorPedido[p.id] ?? p.setagem?.patente?.cargoPermId ?? cargoPadraoId ?? ''
            const ocupado = aprovar.isPending || recusar.isPending || corrigir.isPending
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 bg-card2 border border-bdr rounded-lg">
                {p.avatar
                  ? <img src={p.avatar} alt="" width={28} height={28} referrerPolicy="no-referrer" className="w-7 h-7 rounded-full shrink-0" />
                  : <UserPlus size={16} className="text-gold3 shrink-0" />}
                <div className="flex-1 min-w-45">
                  <p className="text-sm text-txt font-medium">{p.nome}
                    {p.setagem && <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-gold/15 text-gold3">PEDIDO DE SET</span>}
                  </p>
                  {p.setagem && (
                    <p className="text-[11px] text-txt2 mt-0.5">
                      Codinome <span className="text-txt">{p.setagem.codinome}</span> · Passaporte <span className="text-txt font-mono">{p.setagem.passaporte}</span> · Patente <span className="text-txt">{p.setagem.patente?.nome ?? 'removida'}</span>{p.setagem.setor && <> · Setor <span className="text-txt">{p.setagem.setor}</span></>}
                      {p.setagem.status === 'correcao' && <span className="block text-gold3">✏️ Aguardando correção: {p.setagem.motivoCorrecao}</span>}
                    </p>
                  )}
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
                    onSuccess: r => {
                      const res = r?.data as { cargoDiscord?: string; cargosManuais?: string[] } | undefined
                      const falhou = res?.cargoDiscord && res.cargoDiscord !== 'ok'
                      addToast(falhou ? 'error' : 'success', falhou
                        ? `${p.nome} aprovado, mas o bot não conseguiu dar algum cargo no Discord (permissão do bot).`
                        : `Acesso de ${p.nome} aprovado.`)
                      if (res?.cargosManuais?.length) addToast('error', `Dê à mão no Discord para ${p.nome}: ${res.cargosManuais.map(c => '@' + c).join(', ')} (cargo com moderação — o bot não entrega).`)
                    },
                    onError: e => addToast('error', erroApi(e, 'Não foi possível aprovar.')),
                  })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-green/15 border border-green/40 text-green text-xs font-mono hover:bg-green/25 transition-colors disabled:opacity-50"
                >
                  <Check size={13} /> Aprovar
                </button>
                {p.setagem && (
                  <button
                    disabled={ocupado}
                    title="Pede para a pessoa refazer o preenchimento no Discord (o motivo vai no privado dela)"
                    onClick={async () => {
                      const r = await confirmar({ titulo: 'Pedir para refazer o cadastro', tom: 'aviso', textoConfirmar: 'Enviar',
                        mensagem: `${p.nome} recebe no privado do Discord o motivo e um botão para refazer o pedido de set. O pedido fica "aguardando correção".`,
                        motivo: 'obrigatorio', rotuloMotivo: 'O que precisa ser corrigido' })
                      if (!r) return
                      corrigir.mutate({ id: p.id, motivo: r.motivo }, {
                        onSuccess: d => addToast(d.privado === 'ok' ? 'success' : 'error', d.privado === 'ok'
                          ? `Correção pedida a ${p.nome} no privado do Discord.`
                          : `Pedido marcado para correção, mas não foi possível avisar ${p.nome} no privado (DM fechada).`),
                        onError: e => addToast('error', erroApi(e, 'Não foi possível pedir a correção.')),
                      })
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-gold/40 text-gold3 text-xs font-mono hover:bg-gold/10 transition-colors disabled:opacity-50"
                  >
                    <Pencil size={13} /> Refazer
                  </button>
                )}
                <button
                  disabled={ocupado}
                  onClick={async () => {
                    const r = await confirmar({ titulo: 'Recusar pedido', mensagem: `Recusar o pedido de acesso de ${p.nome} (@${p.username})?`, tom: 'perigo', textoConfirmar: 'Recusar',
                      ...(p.setagem ? { motivo: 'opcional' as const, rotuloMotivo: 'Motivo (vai no privado do Discord)' } : {}) })
                    if (!r) return
                    recusar.mutate({ id: p.id, ...(r.motivo?.trim() ? { motivo: r.motivo.trim() } : {}) }, {
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
