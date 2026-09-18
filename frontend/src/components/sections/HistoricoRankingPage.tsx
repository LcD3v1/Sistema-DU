import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, History, Trophy } from 'lucide-react'
import api from '@/lib/axios'

/**
 * Histórico de rankings: /historico-ranking (pública, aberta pelo botão do painel
 * no Discord). Cada "Resetar ranking" guarda o placar do período aqui sozinho;
 * o ranking atual (em andamento) aparece primeiro.
 */

interface Linha { nome: string; total: number }
interface RankingAnterior { id: number; inicio: string | null; fim: string; total: number; linhas: Linha[] }
interface Historico {
  atual: { inicio: string | null; total: number; linhas: Linha[] }
  anteriores: RankingAnterior[]
}

const MEDALHAS = ['🥇', '🥈', '🥉']
const dataBR = (iso: string) => new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
}).format(new Date(iso))
const periodo = (inicio: string | null, fim?: string) =>
  `${inicio ? dataBR(inicio) : 'Início'} → ${fim ? dataBR(fim) : 'hoje'}`
const plural = (n: number) => `${n} apreens${n === 1 ? 'ão' : 'ões'}`

export default function HistoricoRankingPage() {
  const navigate = useNavigate()
  // 'atual' ou o id de um ranking anterior
  const [selecionado, setSelecionado] = useState<'atual' | number>('atual')
  const q = useQuery<Historico>({
    queryKey: ['public', 'ranking-historico'],
    queryFn: async () => (await api.get<Historico>('/public/ranking-historico')).data,
  })

  const h = q.data
  const anterior = typeof selecionado === 'number' ? h?.anteriores.find(r => r.id === selecionado) : undefined
  const exibido = selecionado === 'atual' ? h?.atual : anterior
  const titulo = selecionado === 'atual'
    ? `Ranking atual · ${periodo(h?.atual.inicio ?? null)}`
    : anterior ? `Ranking #${anterior.id} · ${periodo(anterior.inicio, anterior.fim)}` : ''

  const voltar = () => (window.history.length > 1 ? navigate(-1) : navigate('/'))

  return (
    <div className="min-h-screen bg-bg text-txt">
      <div className="w-full max-w-5xl mx-auto px-4 py-6 sm:py-10">
        <button onClick={voltar} className="flex items-center gap-1.5 text-sm text-txt2 hover:text-txt mb-6">
          <ArrowLeft size={16} /> Voltar
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-gold/10 border border-gold/30 flex items-center justify-center">
            <History size={20} className="text-gold" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">Histórico de rankings</h1>
            <p className="font-mono text-[10px] text-txt2 tracking-[0.2em] uppercase">Ranking de apreensões · FAST</p>
          </div>
        </div>

        {q.isLoading && <p className="font-mono text-sm text-txt3">Carregando…</p>}
        {q.isError && <p className="font-mono text-sm text-red">Não foi possível carregar o histórico agora.</p>}

        {h && (
          <div className="grid gap-4 md:grid-cols-[280px_1fr]">
            {/* Lista de rankings */}
            <nav aria-label="Rankings" className="space-y-2 md:max-h-[70vh] md:overflow-y-auto md:pr-1">
              <button onClick={() => setSelecionado('atual')}
                className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${selecionado === 'atual' ? 'border-gold bg-gold/10' : 'border-bdr2 bg-card2 hover:border-bdrg'}`}>
                <span className="block text-sm font-medium">Ranking atual</span>
                <span className="block font-mono text-[11px] text-txt3">{periodo(h.atual.inicio)} · {plural(h.atual.total)}</span>
              </button>
              {h.anteriores.length === 0 && (
                <p className="font-mono text-[11px] text-txt3 px-1 pt-2">
                  Nenhum ranking anterior ainda. Quando o ranking for resetado no Discord, ele aparece aqui.
                </p>
              )}
              {h.anteriores.map(r => (
                <button key={r.id} onClick={() => setSelecionado(r.id)}
                  className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${selecionado === r.id ? 'border-gold bg-gold/10' : 'border-bdr2 bg-card2 hover:border-bdrg'}`}>
                  <span className="block text-sm font-medium">Ranking #{r.id}</span>
                  <span className="block font-mono text-[11px] text-txt3">{periodo(r.inicio, r.fim)} · {plural(r.total)}</span>
                </button>
              ))}
            </nav>

            {/* Classificação do ranking escolhido */}
            <section className="rounded-xl border border-bdr2 bg-card p-4 sm:p-5 min-w-0">
              <h2 className="flex items-center gap-2 text-sm font-semibold mb-4">
                <Trophy size={16} className="text-gold shrink-0" /> <span className="truncate">{titulo}</span>
              </h2>
              {exibido && exibido.linhas.length === 0 && (
                <p className="font-mono text-sm text-txt3">Nenhuma apreensão neste período.</p>
              )}
              {exibido && exibido.linhas.length > 0 && (
                <ol className="divide-y divide-bdr">
                  {exibido.linhas.map((l, i) => (
                    <li key={`${l.nome}-${i}`} className="flex items-center gap-3 py-2.5">
                      <span className="w-8 text-center font-mono text-sm text-txt2 shrink-0">{MEDALHAS[i] ?? `${i + 1}º`}</span>
                      <span className="flex-1 truncate text-sm">{l.nome}</span>
                      <span className="font-mono text-xs text-txt2 shrink-0">{plural(l.total)}</span>
                    </li>
                  ))}
                </ol>
              )}
              {exibido && (
                <p className="mt-4 pt-3 border-t border-bdr font-mono text-xs text-txt2">
                  Total de apreensões: <strong className="text-txt">{exibido.total}</strong>
                </p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
