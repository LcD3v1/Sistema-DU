import { useState } from 'react'
import { Plus, Trash2, Save, Layers } from 'lucide-react'
import { useSetagem, useSetagemDiscord, useSalvarSetores, type SetorSetagem, type SetagemConfig } from '@/hooks/useSetagem'
import { usePerms } from '@/hooks/usePerms'
import { useUIStore } from '@/store/uiStore'
import { queryClient } from '@/lib/queryClient'

type Erro = { response?: { status?: number; data?: { error?: string; config?: SetagemConfig } } }
const erroApi = (e: unknown, padrao: string) => (e as Erro)?.response?.data?.error ?? padrao
const pequeno = 'bg-card2 rounded px-2 py-1.5 text-sm text-txt outline-none focus:ring-1 focus:ring-gold'

/**
 * Setores / subunidades (ex.: COD, DNARC). Aparecem no select do modal "Solicitar set" e no perfil.
 * Cada setor tem 1 ou 2 cargos do Discord, dados SÓ depois da aprovação. Para quem trabalha nos dois,
 * crie o combinado (ex.: "COD/DNARC") com os 2 cargos.
 */
export default function SetoresConfig() {
  const { data, isLoading } = useSetagem()
  const { canEdit } = usePerms()
  const podeEditar = canEdit('setagem')
  const discord = useSetagemDiscord(podeEditar && Boolean(data?.discordConfigurado))
  const salvar = useSalvarSetores()
  const { addToast } = useUIStore()
  const [rascunho, setRascunho] = useState<SetorSetagem[] | null>(null)
  if (isLoading || !data) return <p className="text-xs text-txt3">Carregando setores…</p>

  const setores = rascunho ?? data.config.setores
  const cargos = discord.data?.cargos ?? []
  const atualizar = (i: number, parcial: Partial<SetorSetagem>) => setRascunho(setores.map((x, k) => (k === i ? { ...x, ...parcial } : x)))

  function enviar() {
    salvar.mutate({ setores: setores.map(x => ({ id: x.id, nome: x.nome.trim(), roleIds: x.roleIds.filter(Boolean).slice(0, 2) })), versao: data!.config.versao }, {
      onSuccess: () => { setRascunho(null); addToast('success', 'Setores salvos.') },
      onError: e => {
        const r = (e as Erro).response
        if (r?.status === 409 && r.data?.config) {
          const nova = r.data.config
          queryClient.setQueryData(['setagem'], (a: typeof data) => (a ? { ...a, config: nova } : a))
          setRascunho(null)
        }
        addToast('error', erroApi(e, 'Não foi possível salvar os setores.'))
      },
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-orbitron text-xs text-gold tracking-wider mb-1 flex items-center gap-2"><Layers size={14} /> SETORES / SUBUNIDADES</h3>
        <p className="text-[11px] text-txt3 max-w-2xl">
          Aparecem no select do modal <b>Solicitar set</b> no Discord (escolha <b>opcional</b>) e no perfil. Ao aprovar, a pessoa ganha o cargo da patente e, se escolheu um setor, o do setor.
          Para quem trabalha nos dois setores, use o combinado (ex.: <b>COD/DNARC</b>) com os 2 cargos.
        </p>
      </div>

      {!podeEditar && <p className="text-xs text-txt2">Você pode ver os setores, mas só quem edita a <b>Setagem</b> pode alterar.</p>}
      {data.discordConfigurado === false && <p className="text-xs text-red">O Discord não está configurado no servidor (.env).</p>}

      <ol className="space-y-2">
        {setores.length === 0 && <li className="text-xs text-txt3">Nenhum setor ainda.</li>}
        {setores.map((x, i) => (
          <li key={x.id ?? `novo-${i}`} className="bg-card rounded-lg p-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center">
            <input value={x.nome} maxLength={40} disabled={!podeEditar} onChange={e => atualizar(i, { nome: e.target.value })}
              aria-label="Nome do setor" placeholder="Ex.: COD" className={pequeno} />
            {[0, 1].map(k => {
              const atual = x.roleIds[k] ?? ''
              return (
                <select key={k} value={atual} disabled={!podeEditar} aria-label={`Cargo ${k + 1} do Discord`} className={`${pequeno} text-xs`}
                  onChange={e => { const ids = [...x.roleIds]; ids[k] = e.target.value; atualizar(i, { roleIds: ids.filter(Boolean) }) }}>
                  <option value="">{k === 0 ? 'Cargo do Discord: escolha…' : '2º cargo: nenhum'}</option>
                  {cargos.filter(r => r.id === atual || !x.roleIds.includes(r.id)).map(r =>
                    <option key={r.id} value={r.id}>@{r.nome}{r.bloqueado ? ' ⚠ dar à mão (tem moderação)' : ''}</option>)}
                  {atual && !cargos.some(r => r.id === atual) && <option value={atual}>(cargo atual)</option>}
                </select>
              )
            })}
            {podeEditar && (
              <button type="button" title="Remover setor" aria-label={`Remover ${x.nome}`} onClick={() => setRascunho(setores.filter((_, k) => k !== i))}
                className="p-1.5 rounded text-txt2 hover:text-red hover:bg-red/10"><Trash2 size={14} /></button>
            )}
          </li>
        ))}
      </ol>

      {podeEditar && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={setores.length >= 25} onClick={() => setRascunho([...setores, { id: null, nome: '', roleIds: [] }])}
            className="flex items-center gap-1.5 text-xs font-mono text-gold3 hover:text-gold disabled:opacity-40"><Plus size={14} /> Adicionar setor</button>
          <span className="flex-1" />
          {rascunho && <button type="button" onClick={() => setRascunho(null)} className="px-3 py-2 rounded-lg text-sm text-txt2 hover:text-txt">Descartar</button>}
          <button type="button" onClick={enviar} disabled={!rascunho || salvar.isPending || setores.some(x => !x.nome.trim())}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gold hover:bg-gold2 text-white text-sm font-medium disabled:opacity-50">
            <Save size={15} /> {salvar.isPending ? 'Salvando…' : 'Salvar setores'}
          </button>
        </div>
      )}
      {discord.isError && <p className="text-xs text-red">{erroApi(discord.error, 'Não foi possível carregar os cargos do Discord.')}</p>}
    </div>
  )
}
