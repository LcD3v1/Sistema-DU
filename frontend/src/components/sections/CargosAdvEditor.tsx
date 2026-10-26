import { RefreshCw, ShieldAlert, AlertTriangle, Wand2 } from 'lucide-react'
import { useCargosAdv, useUpdateCargosAdv, useCriarCargosAdv } from '@/hooks/useConfig'
import type { NivelAdvChave } from '@/hooks/useConfig'
import { useUIStore } from '@/store/uiStore'
import LoadingHud from '@/components/ui/LoadingHud'

const NIVEIS: { chave: NivelAdvChave; cor: string }[] = [
  { chave: '1', cor: 'text-gold3' },
  { chave: '2', cor: 'text-orange-400' },
  { chave: '3', cor: 'text-red' },
]

const erroApi = (err: unknown, padrao: string) =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? padrao

/** Cargo do Discord que cada quadradinho de advertência aplica/retira automaticamente. */
export default function CargosAdvEditor() {
  const { addToast } = useUIStore()
  const { data, isLoading, refetch, isFetching } = useCargosAdv()
  const update = useUpdateCargosAdv()
  const criar = useCriarCargosAdv()

  if (isLoading || !data) return <LoadingHud />
  const faltando = NIVEIS.some(n => !data.cargos[n.chave])
  const ocupado = update.isPending || criar.isPending

  function salvar(chave: NivelAdvChave, id: string) {
    update.mutate({ [chave]: id || null }, {
      onSuccess: () => addToast('success', id ? `Cargo do ADV ${chave} salvo. Os membros são atualizados no Discord.` : `ADV ${chave} sem cargo.`),
      onError: err => addToast('error', erroApi(err, 'Erro ao salvar o cargo.')),
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-orbitron text-xs text-gold tracking-wider mb-1">CARGOS DE ADVERTÊNCIA</h3>
          <p className="text-[11px] text-txt3">
            Cada quadradinho de ADV espelha um cargo: marcou, o bot dá o cargo; desmarcou, o bot tira. Os níveis são independentes.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-bdr2 text-txt2 text-xs font-mono hover:text-txt hover:bg-bdr transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {!data.botConfigurado && (
        <div className="flex gap-2 px-3 py-2.5 rounded border border-gold/30 bg-gold/6 text-[11px] text-txt2">
          <AlertTriangle size={14} className="text-gold shrink-0 mt-0.5" />
          <span>Bot do Discord não configurado no servidor.</span>
        </div>
      )}
      {data.erro && (
        <div className="flex gap-2 px-3 py-2.5 rounded border border-red/40 bg-red/10 text-[11px] text-red">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" /> <span>{data.erro}</span>
        </div>
      )}
      {data.botConfigurado && !data.erro && !data.podeGerenciar && (
        <div className="flex gap-2 px-3 py-2.5 rounded border border-red/40 bg-red/10 text-[11px] text-txt2">
          <AlertTriangle size={14} className="text-red shrink-0 mt-0.5" />
          <span>O bot não tem a permissão <span className="text-txt font-medium">Gerenciar Cargos</span>. Dê essa permissão ao cargo do bot no servidor para ele aplicar e retirar os cargos de ADV.</span>
        </div>
      )}

      <div className="space-y-2">
        {NIVEIS.map(({ chave, cor }) => {
          const atual = data.cargos[chave] ?? ''
          const perdido = atual && !data.roles.some(r => r.id === atual)
          const acimaDoBot = atual && data.roles.some(r => r.id === atual && !r.gerenciavel)
          return (
            <div key={chave} className="flex flex-wrap items-center gap-3 px-4 py-3 bg-card2 border border-bdr rounded-lg">
              <ShieldAlert size={16} className={`${cor} shrink-0`} />
              <div className="flex-1 min-w-0 sm:min-w-[200px]">
                <p className={`text-sm font-medium ${cor}`}>ADV {chave}</p>
                <p className="text-[11px] text-txt3">
                  {acimaDoBot ? 'Este cargo está acima do cargo do bot: suba o cargo do bot na lista do servidor.' : `Aplicado a quem estiver com o quadradinho ${chave} marcado.`}
                </p>
              </div>
              <select
                value={atual}
                disabled={!data.botConfigurado || ocupado}
                onChange={e => salvar(chave, e.target.value)}
                className="bg-card border border-bdr2 rounded px-2 py-1.5 text-xs font-mono text-txt w-full sm:w-auto sm:min-w-[220px] disabled:opacity-50"
              >
                <option value="">— sem cargo —</option>
                {perdido && <option value={atual}>⚠ cargo apagado ({atual})</option>}
                {data.roles.map(r => (
                  <option key={r.id} value={r.id} disabled={!r.gerenciavel && r.id !== atual}>
                    @{r.nome}{r.gerenciavel ? '' : ' · acima do bot'}
                  </option>
                ))}
              </select>
            </div>
          )
        })}
      </div>

      {data.botConfigurado && faltando && (
        <button
          onClick={() => criar.mutate(undefined, {
            onSuccess: () => addToast('success', 'Cargos ADV DU 1, 2 e 3 prontos no servidor.'),
            onError: err => addToast('error', erroApi(err, 'Erro ao criar os cargos.')),
          })}
          disabled={ocupado || !data.podeGerenciar}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gold/40 bg-gold/10 text-gold3 text-xs font-mono hover:bg-gold/20 transition-colors disabled:opacity-50"
        >
          <Wand2 size={13} /> Criar ADV DU 1, 2 e 3 automaticamente
        </button>
      )}
    </div>
  )
}
