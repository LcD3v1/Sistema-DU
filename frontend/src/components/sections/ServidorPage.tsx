import { useEffect, useState } from 'react'
import {
  Server, Hash, Volume2, Megaphone, MessagesSquare, Mic, Image as ImageIcon, Folder, RefreshCw, Users, Circle,
  Rocket, Shield, Smile, Copy, Search, Info, UserCheck,
} from 'lucide-react'
import {
  useServidor, useMembrosServidor, useAtualizarServidor, useImagemServidor,
  type CanalServidor, type CargoServidor, type Servidor,
} from '@/hooks/useServidor'
import { usePerms } from '@/hooks/usePerms'
import { useUIStore } from '@/store/uiStore'
import LoadingHud from '@/components/ui/LoadingHud'

const erroApi = (e: unknown, padrao: string) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? padrao
const corHex = (cor: number) => (cor ? `#${cor.toString(16).padStart(6, '0')}` : '#99aab5')
const dataBR = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')
const numero = (n: number | null) => (n === null ? '—' : n.toLocaleString('pt-BR'))

const ICONE_CANAL: Record<string, typeof Hash> = { texto: Hash, voz: Volume2, anuncios: Megaphone, forum: MessagesSquare, palco: Mic, midia: ImageIcon }
const NOME_TIPO: Record<string, string> = { texto: 'Texto', voz: 'Voz', anuncios: 'Anúncios', forum: 'Fórum', palco: 'Palco', midia: 'Mídia' }

type Aba = 'canais' | 'cargos' | 'emojis' | 'membros'

function Numero({ icone: Icone, rotulo, valor }: { icone: typeof Users; rotulo: string; valor: string }) {
  return (
    <div className="bg-card2 rounded-lg px-3 py-2.5">
      <p className="flex items-center gap-1.5 font-mono text-[10px] text-txt3 uppercase tracking-wider"><Icone size={12} /> {rotulo}</p>
      <p className="text-lg font-semibold text-txt mt-0.5">{valor}</p>
    </div>
  )
}

function Canal({ c }: { c: CanalServidor }) {
  const Icone = ICONE_CANAL[c.tipo] ?? Hash
  return (
    <li className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-card2">
      <Icone size={15} className="text-txt3 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm text-txt truncate">{c.nome}
          {c.nsfw && <span className="ml-2 text-[10px] font-mono text-red">+18</span>}
          <span className="ml-2 text-[10px] font-mono text-txt3">{NOME_TIPO[c.tipo] ?? c.tipo}</span>
        </p>
        {c.topico && <p className="text-[11px] text-txt3 truncate">{c.topico}</p>}
      </div>
    </li>
  )
}

function Cargo({ r }: { r: CargoServidor }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2 rounded-lg bg-card2">
      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: corHex(r.cor) }} aria-hidden="true" />
      {r.icone ? <img src={r.icone} alt="" className="w-5 h-5 shrink-0" referrerPolicy="no-referrer" /> : r.emoji ? <span className="w-5 text-center shrink-0">{r.emoji}</span> : null}
      <span className="text-sm font-medium truncate flex-1" style={{ color: corHex(r.cor) }}>{r.nome}</span>
      <span className="hidden sm:flex gap-1">
        {r.separado && <span className="text-[10px] font-mono text-txt3 bg-card px-1.5 py-0.5 rounded">separado</span>}
        {r.mencionavel && <span className="text-[10px] font-mono text-txt3 bg-card px-1.5 py-0.5 rounded">mencionável</span>}
        {r.integracao && <span className="text-[10px] font-mono text-txt3 bg-card px-1.5 py-0.5 rounded">bot</span>}
      </span>
      <span className="text-xs font-mono text-txt2 w-16 text-right">{r.membros === null ? '—' : `${r.membros} 👤`}</span>
    </li>
  )
}

function Membros({ servidor }: { servidor: Servidor }) {
  const [texto, setTexto] = useState('')
  const [busca, setBusca] = useState('')
  useEffect(() => { const t = setTimeout(() => setBusca(texto.trim()), 350); return () => clearTimeout(t) }, [texto])
  const { data, isLoading, isError, error } = useMembrosServidor(true, busca)
  const cargos = new Map(servidor.cargos.map(c => [c.id, c]))
  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt3" />
        <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar por nome, apelido ou @usuário" maxLength={60}
          aria-label="Buscar membros" className="w-full bg-card2 rounded-lg pl-9 pr-3 py-2 text-sm text-txt placeholder-txt3 outline-none focus:ring-1 focus:ring-gold" />
      </div>
      {isLoading && <p className="text-xs text-txt3 font-mono">Carregando membros…</p>}
      {isError && <p className="text-xs text-red">{erroApi(error, 'Não foi possível carregar os membros.')}</p>}
      {data && (
        <>
          <p className="text-[11px] text-txt3 font-mono">{data.total} membro(s){data.total > data.membros.length ? ` — mostrando ${data.membros.length}, refine a busca` : ''}</p>
          <ul className="space-y-1.5">
            {data.membros.map(m => (
              <li key={m.discordId} className="flex flex-wrap items-center gap-3 px-3 py-2 rounded-lg bg-card2">
                {m.avatar ? <img src={m.avatar} alt="" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                  : <span className="w-8 h-8 rounded-full bg-card flex items-center justify-center text-xs text-txt3">{m.nome.slice(0, 1).toUpperCase()}</span>}
                <div className="min-w-40 flex-1">
                  <p className="text-sm text-txt">{m.apelido ?? m.nome}
                    {m.temConta && <UserCheck size={13} className="inline ml-1.5 text-green" aria-label="Tem conta no site" />}
                  </p>
                  <p className="text-[11px] text-txt3 font-mono">@{m.usuario} · entrou em {dataBR(m.entrouEm)}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {m.cargos.map(id => cargos.get(id)).filter(Boolean).sort((a, b) => b!.posicao - a!.posicao).map(c => (
                    <span key={c!.id} className="text-[10px] px-1.5 py-0.5 rounded bg-card" style={{ color: corHex(c!.cor) }}>{c!.nome}</span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export default function ServidorPage() {
  const { data, isLoading, isError, error } = useServidor()
  const { canEdit } = usePerms()
  const podeEditar = canEdit('servidor')
  const atualizar = useAtualizarServidor()
  const { addToast } = useUIStore()
  const [aba, setAba] = useState<Aba>('canais')
  const icone = useImagemServidor('icone', Boolean(data?.temIcone))
  const banner = useImagemServidor('banner', Boolean(data?.temBanner))

  if (isLoading) return <LoadingHud />
  if (isError || !data) {
    return <div className="p-6"><p className="text-sm text-red">{erroApi(error, 'Não foi possível carregar o servidor do Discord.')}</p></div>
  }

  const copiarEmoji = (nome: string, id: string, animado: boolean) => {
    void navigator.clipboard?.writeText(`<${animado ? 'a' : ''}:${nome}:${id}>`)
      .then(() => addToast('success', `Emoji :${nome}: copiado. Cole no painel de hierarquia.`))
      .catch(() => addToast('error', 'Não foi possível copiar.'))
  }
  const abas: { id: Aba; rotulo: string; n: number }[] = [
    { id: 'canais', rotulo: 'Canais', n: data.totalCanais },
    { id: 'cargos', rotulo: 'Cargos', n: data.cargos.length },
    { id: 'emojis', rotulo: 'Emojis', n: data.emojis.length },
    ...(podeEditar ? [{ id: 'membros' as Aba, rotulo: 'Membros', n: data.membros ?? 0 }] : []),
  ]

  return (
    <div className="w-full max-w-375 mx-auto p-3 sm:p-6 lg:px-8 space-y-5">
      {/* Cabeçalho do servidor */}
      <div className="bg-card rounded-xl overflow-hidden">
        {banner && <img src={banner} alt="" className="w-full h-32 sm:h-40 object-cover" />}
        <div className="p-4 sm:p-5 flex flex-wrap items-center gap-4">
          {icone ? <img src={icone} alt="" className="w-16 h-16 rounded-2xl" />
            : <span className="w-16 h-16 rounded-2xl bg-card2 flex items-center justify-center"><Server size={26} className="text-gold" /></span>}
          <div className="flex-1 min-w-50">
            <p className="font-mono text-[10px] text-txt2 tracking-[0.2em] uppercase">Servidor do Discord da unidade</p>
            <h1 className="text-2xl font-bold text-txt">{data.nome}</h1>
            {data.descricao && <p className="text-sm text-txt2 mt-0.5">{data.descricao}</p>}
          </div>
          {podeEditar && (
            <button type="button" disabled={atualizar.isPending}
              onClick={() => atualizar.mutate(undefined, {
                onSuccess: () => addToast('success', 'Dados lidos do Discord agora.'),
                onError: e => addToast('error', erroApi(e, 'Não foi possível atualizar.')),
              })}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-card2 text-sm text-txt2 hover:text-txt disabled:opacity-40">
              <RefreshCw size={14} className={atualizar.isPending ? 'animate-spin' : ''} /> Atualizar do Discord
            </button>
          )}
        </div>
        <div className="px-4 sm:px-5 pb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <Numero icone={Users} rotulo="Membros" valor={numero(data.membros)} />
          <Numero icone={Circle} rotulo="Online" valor={numero(data.online)} />
          <Numero icone={Rocket} rotulo="Impulsos" valor={`${data.impulsos} · nível ${data.nivelImpulso}`} />
          <Numero icone={Hash} rotulo="Canais" valor={String(data.totalCanais)} />
          <Numero icone={Shield} rotulo="Cargos" valor={String(data.cargos.length)} />
          <Numero icone={Smile} rotulo="Emojis" valor={String(data.emojis.length)} />
        </div>
      </div>

      {data.modoMembros === 'contas' && (
        <p role="status" className="flex gap-2 rounded-lg px-3 py-2.5 text-xs bg-gold/10 text-gold3">
          <Info size={15} className="shrink-0 mt-0.5" />
          Contagem de membros por cargo e lista de membros mostram só quem tem conta no site. Para ver todos, ligue Server Members Intent no Discord Developer Portal → Bot.
        </p>
      )}

      {/* Abas */}
      <div className="flex flex-wrap gap-1" role="tablist">
        {abas.map(a => (
          <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${aba === a.id ? 'bg-gold text-white' : 'bg-card text-txt2 hover:text-txt'}`}>
            {a.rotulo} <span className="text-[11px] opacity-70">{a.n}</span>
          </button>
        ))}
      </div>

      <div className="bg-card rounded-xl p-4 sm:p-5">
        {aba === 'canais' && (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {data.canais.map((g, i) => (
              <div key={g.categoria ?? `sem-${i}`}>
                <p className="flex items-center gap-1.5 font-mono text-[10px] text-txt2 tracking-[0.18em] uppercase mb-1">
                  <Folder size={12} /> {g.categoria ?? 'Sem categoria'}
                </p>
                {g.canais.length ? <ul>{g.canais.map(c => <Canal key={c.id} c={c} />)}</ul> : <p className="text-xs text-txt3 px-2">Vazia</p>}
              </div>
            ))}
          </div>
        )}
        {aba === 'cargos' && <ul className="space-y-1.5">{data.cargos.map(r => <Cargo key={r.id} r={r} />)}</ul>}
        {aba === 'emojis' && (
          data.emojis.length === 0 ? <p className="text-sm text-txt3">O servidor não tem emojis próprios.</p> : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2">
              {data.emojis.map(e => (
                <li key={e.id}>
                  <button type="button" onClick={() => copiarEmoji(e.nome, e.id, e.animado)} title="Copiar para usar no painel"
                    className={`w-full flex flex-col items-center gap-1 p-3 rounded-lg bg-card2 hover:bg-card transition-colors ${e.disponivel ? '' : 'opacity-40'}`}>
                    <img src={e.url} alt={`:${e.nome}:`} className="w-8 h-8 object-contain" referrerPolicy="no-referrer" />
                    <span className="text-[11px] text-txt2 truncate max-w-full">:{e.nome}:</span>
                    <Copy size={11} className="text-txt3" />
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
        {aba === 'membros' && podeEditar && <Membros servidor={data} />}
      </div>

      <p className="text-[11px] text-txt3 font-mono">Lido do Discord em {new Date(data.lidoEm).toLocaleString('pt-BR')} · atualiza a cada minuto · bot: {data.bot}</p>
    </div>
  )
}
