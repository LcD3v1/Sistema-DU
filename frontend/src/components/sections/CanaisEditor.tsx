import { RefreshCw, MessagesSquare, AlertTriangle } from 'lucide-react'
import { useCanais, useUpdateCanais } from '@/hooks/useConfig'
import type { CanalChave } from '@/hooks/useConfig'
import { useUIStore } from '@/store/uiStore'
import LoadingHud from '@/components/ui/LoadingHud'

const MODULOS: { chave: CanalChave; titulo: string; descricao: string; tipos?: number[] }[] = [
  { chave: 'registro',   titulo: 'Registro',   descricao: 'Cada cadastro concluído vira uma postagem no canal configurado. Quando possível, exonerações entram no mesmo tópico.' },
  { chave: 'apreensoes', titulo: 'Apreensões', descricao: 'Cada apreensão aprovada vira uma mensagem direta no canal configurado.', tipos: [0, 5] },
  { chave: 'carteira',   titulo: 'Carteira',   descricao: 'Fórum onde as carteirinhas são postadas. Na tela de gerar carteira você escolhe o tópico de destino a cada envio.', tipos: [15, 16] },
  { chave: 'rankingApreensoes', titulo: 'Ranking de apreensões', descricao: 'Ao escolher o canal, o painel é postado lá e se reordena sozinho a cada apreensão aprovada. Os botões do painel só funcionam para quem tem editar em Aprovações.', tipos: [0, 5] },
]

const TIPO_CANAL: Record<number, string> = {
  0: 'texto',
  5: 'anúncio',
  15: 'fórum',
  16: 'mídia',
}

export default function CanaisEditor() {
  const { addToast } = useUIStore()
  const { data, isLoading, refetch, isFetching } = useCanais()
  const update = useUpdateCanais()

  if (isLoading || !data) return <LoadingHud />

  function salvar(chave: CanalChave, id: string) {
    update.mutate({ [chave]: id || null }, {
      onSuccess: () => addToast('success', id ? 'Canal vinculado.' : 'Canal desvinculado.'),
      onError: (err: unknown) => addToast('error', (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro ao salvar canal.'),
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-orbitron text-xs text-gold tracking-wider mb-1">CANAIS DO DISCORD</h3>
          <p className="text-[11px] text-txt3">Escolha para onde cada módulo envia as postagens. O bot lista canais de <span className="text-gold3">texto, anúncio, fórum e mídia</span>.</p>
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
          <span>Bot do Discord não configurado. Defina <span className="font-mono text-gold3">DISCORD_BOT_TOKEN</span> e <span className="font-mono text-gold3">DISCORD_GUILD_ID</span> no <span className="font-mono">backend/.env</span> e reinicie o servidor.</span>
        </div>
      )}
      {data.erro && (
        <div className="flex gap-2 px-3 py-2.5 rounded border border-red/40 bg-red/10 text-[11px] text-red">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" /> <span>{data.erro}</span>
        </div>
      )}
      {data.botConfigurado && !data.erro && data.foruns.length === 0 && (
        <p className="text-[11px] text-txt3">Nenhum canal de postagem encontrado no servidor (ou o bot não tem acesso a eles).</p>
      )}

      <div className="space-y-2">
        {MODULOS.map(mod => {
          const atual = data.canais[mod.chave] ?? ''
          const canais = mod.tipos ? data.foruns.filter(f => f.type === undefined || mod.tipos?.includes(f.type)) : data.foruns
          const perdido = atual && !canais.some(f => f.id === atual)
          return (
            <div key={mod.chave} className="flex flex-wrap items-center gap-3 px-4 py-3 bg-card2 border border-bdr rounded-lg">
              <MessagesSquare size={16} className="text-gold3 shrink-0" />
              <div className="flex-1 min-w-0 sm:min-w-[200px]">
                <p className="text-sm text-txt font-medium">{mod.titulo}</p>
                <p className="text-[11px] text-txt3">{mod.descricao}</p>
              </div>
              <select
                value={atual}
                disabled={!data.botConfigurado || update.isPending}
                onChange={e => salvar(mod.chave, e.target.value)}
                className="bg-card border border-bdr2 rounded px-2 py-1.5 text-xs font-mono text-txt w-full sm:w-auto sm:min-w-[200px] disabled:opacity-50"
              >
                <option value="">— nenhum canal —</option>
                {perdido && <option value={atual}>⚠ canal indisponível ({atual})</option>}
                {canais.map(f => <option key={f.id} value={f.id}># {f.name}{f.type !== undefined ? ` · ${TIPO_CANAL[f.type] ?? 'canal'}` : ''}</option>)}
              </select>
            </div>
          )
        })}
      </div>
    </div>
  )
}
