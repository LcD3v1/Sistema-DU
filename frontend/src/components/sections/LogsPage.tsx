import { useEffect, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { ScrollText, Search, Globe, MessageSquare, ChevronDown, AlertTriangle, RefreshCw } from 'lucide-react'
import api from '@/lib/axios'

type Origem = 'site' | 'discord'
interface Log {
  id: number; em: string; origem: Origem; categoria: string; acao: string; alvo: string | null
  ator: { nome: string; avatar: string | null }; detalhes: string[]
}
interface Categorias {
  categorias: { origem: Origem; categoria: string; total: number }[]
  discord: { configurado: boolean; erro: 'sem_acesso' | 'discord' | null }
}

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })
function relativo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'agora'
  if (s < 3600) return `há ${Math.floor(s / 60)} min`
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`
  return new Date(iso).toLocaleDateString('pt-BR')
}

/** Foto de quem fez a ação: vem do backend (com a sessão), nunca direto do Discord. */
function Avatar({ chave, nome }: { chave: string | null; nome: string }) {
  const { data: url } = useQuery({
    queryKey: ['logs', 'avatar', chave],
    queryFn: async () => URL.createObjectURL((await api.get(`/logs/avatar/${chave}`, { responseType: 'blob' })).data as Blob),
    enabled: Boolean(chave),
    staleTime: Infinity, gcTime: 30 * 60_000, retry: false,
  })
  const iniciais = nome.split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?'
  return url
    ? <img src={url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0 bg-card2" />
    : <span className="w-9 h-9 rounded-full bg-gold/15 text-gold3 text-xs font-semibold flex items-center justify-center shrink-0">{iniciais}</span>
}

function Linha({ log }: { log: Log }) {
  const [aberto, setAberto] = useState(false)
  return (
    <li className="bg-card rounded-xl px-3 py-2.5">
      <div className="flex items-start gap-3">
        <Avatar chave={log.ator.avatar} nome={log.ator.nome} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-txt leading-snug">
            <button type="button" onClick={() => setAberto(a => !a)} aria-expanded={aberto}
              title="Ver o que foi alterado"
              className="font-semibold text-gold3 hover:text-gold hover:underline underline-offset-2 inline-flex items-center gap-0.5">
              {log.ator.nome}<ChevronDown size={13} className={`transition-transform ${aberto ? 'rotate-180' : ''}`} />
            </button>{' '}
            <span className="text-txt2">{log.acao.charAt(0).toLowerCase() + log.acao.slice(1)}</span>
            {log.alvo && <> <span className="text-txt">{log.alvo}</span></>}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono ${log.origem === 'discord' ? 'bg-gold/15 text-gold3' : 'bg-card2 text-txt2'}`}>
              {log.origem === 'discord' ? <MessageSquare size={10} /> : <Globe size={10} />} {log.origem === 'discord' ? 'Discord' : 'Site'}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-card2 text-txt2">{log.categoria}</span>
            <time dateTime={log.em} title={dataHora(log.em)} className="text-[11px] text-txt3">{relativo(log.em)}</time>
          </div>
          {aberto && (
            <div className="mt-2 rounded-lg bg-card2 px-3 py-2 text-xs">
              <p className="font-mono text-[10px] text-txt3 tracking-wider uppercase mb-1">O que foi alterado · {dataHora(log.em)}</p>
              {log.detalhes.length
                ? <ul className="space-y-0.5 text-txt2 wrap-break-word">{log.detalhes.map((d, i) => <li key={i}>• {d}</li>)}</ul>
                : <p className="text-txt3">Sem detalhes adicionais para esta ação.</p>}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

export default function LogsPage() {
  const [origem, setOrigem] = useState<Origem | ''>('')
  const [categoria, setCategoria] = useState('')
  const [busca, setBusca] = useState('')
  const [buscaAtiva, setBuscaAtiva] = useState('')
  useEffect(() => { const t = setTimeout(() => setBuscaAtiva(busca.trim()), 350); return () => clearTimeout(t) }, [busca])

  const cats = useQuery<Categorias>({ queryKey: ['logs', 'categorias'], queryFn: async () => (await api.get('/logs/categorias')).data, refetchInterval: 30_000 })
  const logs = useInfiniteQuery({
    queryKey: ['logs', 'lista', origem, categoria, buscaAtiva],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => (await api.get<{ logs: Log[]; temMais: boolean }>('/logs', {
      params: { ...(origem ? { origem } : {}), ...(categoria ? { categoria } : {}), ...(buscaAtiva ? { busca: buscaAtiva } : {}), ...(pageParam ? { antes: pageParam } : {}) },
    })).data,
    getNextPageParam: ultima => (ultima.temMais ? ultima.logs[ultima.logs.length - 1]?.id : undefined),
    refetchInterval: 30_000,
  })
  const lista = logs.data?.pages.flatMap(p => p.logs) ?? []
  const categorias = (cats.data?.categorias ?? []).filter(c => !origem || c.origem === origem)
  const porNome = new Map<string, number>()
  for (const c of categorias) porNome.set(c.categoria, (porNome.get(c.categoria) ?? 0) + c.total)

  const aba = (valor: Origem | '', rotulo: string, Icone: typeof Globe) => (
    <button type="button" onClick={() => { setOrigem(valor); setCategoria('') }} aria-pressed={origem === valor}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${origem === valor ? 'bg-gold text-white' : 'bg-card text-txt2 hover:text-txt'}`}>
      <Icone size={14} /> {rotulo}
    </button>
  )

  return (
    <div className="w-full max-w-375 mx-auto p-3 sm:p-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <p className="font-mono text-[10px] text-txt2 tracking-[0.2em] uppercase mb-1">Sistema</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-txt flex items-center gap-2"><ScrollText size={26} className="text-gold" /> Logs</h1>
          <p className="text-sm text-txt2 mt-1 max-w-2xl">Tudo o que acontece no site e no servidor do Discord, por categoria. Clique no nome de quem fez a ação para ver o que foi alterado.</p>
        </div>
        <button type="button" onClick={() => { void logs.refetch(); void cats.refetch() }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-card text-sm text-txt2 hover:text-txt">
          <RefreshCw size={14} className={logs.isFetching ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {cats.data?.discord.configurado && cats.data.discord.erro === 'sem_acesso' && (
        <p role="alert" className="flex gap-2 rounded-lg px-3 py-2.5 text-xs bg-red/10 text-red mb-4"><AlertTriangle size={15} className="shrink-0" />
          O bot não consegue ler o registro do servidor. Dê a ele a permissão <b>Ver registro de auditoria</b> no Discord.</p>
      )}
      {cats.data && !cats.data.discord.configurado && (
        <p className="flex gap-2 rounded-lg px-3 py-2.5 text-xs bg-card text-txt2 mb-4"><AlertTriangle size={15} className="shrink-0" /> O Discord não está configurado no servidor (.env): só os logs do site aparecem.</p>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {aba('', 'Todos', ScrollText)}{aba('site', 'Site', Globe)}{aba('discord', 'Discord', MessageSquare)}
        <label className="relative ml-auto w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt3" />
          <input value={busca} onChange={e => setBusca(e.target.value)} maxLength={100} placeholder="Buscar por nome, ação ou detalhe…" aria-label="Buscar nos logs"
            className="w-full bg-card rounded-lg pl-8 pr-3 py-2 text-sm text-txt placeholder-txt3 outline-none focus:ring-1 focus:ring-gold" />
        </label>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        <button type="button" onClick={() => setCategoria('')} aria-pressed={!categoria}
          className={`px-2.5 py-1 rounded-full text-xs ${!categoria ? 'bg-gold/20 text-gold3' : 'bg-card text-txt2 hover:text-txt'}`}>Todas as categorias</button>
        {[...porNome].map(([nome, total]) => (
          <button key={nome} type="button" onClick={() => setCategoria(nome)} aria-pressed={categoria === nome}
            className={`px-2.5 py-1 rounded-full text-xs ${categoria === nome ? 'bg-gold/20 text-gold3' : 'bg-card text-txt2 hover:text-txt'}`}>
            {nome} <span className="font-mono text-txt3">{total}</span>
          </button>
        ))}
      </div>

      {logs.isLoading ? <p className="text-sm text-txt3">Carregando logs…</p>
        : logs.isError ? <p className="text-sm text-red">Não foi possível carregar os logs.</p>
        : lista.length === 0 ? <p className="text-sm text-txt3">Nenhum log encontrado{categoria || buscaAtiva ? ' com esse filtro' : ' ainda'}.</p>
        : (
          <ul className="space-y-2">{lista.map(l => <Linha key={l.id} log={l} />)}</ul>
        )}
      {logs.hasNextPage && (
        <button type="button" onClick={() => void logs.fetchNextPage()} disabled={logs.isFetchingNextPage}
          className="mt-4 w-full py-2 rounded-lg bg-card text-sm text-txt2 hover:text-txt disabled:opacity-50">
          {logs.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
        </button>
      )}
    </div>
  )
}
