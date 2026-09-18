import { useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { Plus, Trophy, Target, ShieldAlert, CalendarClock, BadgeCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAllAcoes } from '@/hooks/useAcoes'
import { useMembros } from '@/hooks/useMembros'
import { useAusencias, statusAusencia } from '@/hooks/useAusencias'
import { useAuthStore } from '@/store/authStore'
import { useMe } from '@/hooks/useMe'
import { usePerms } from '@/hooks/usePerms'
import LoadingHud from '@/components/ui/LoadingHud'
import { calcWinRate } from '@/lib/utils'
import type { Membro, Acao } from '@/types'

type Win = 7 | 15 | 30

function isoDaysAgo(n: number) {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
function br(n: number, dec = 0) {
  return n.toFixed(dec).replace('.', ',')
}

/* ── Cards ─────────────────────────────────────────────────────── */
function StatCard({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="bg-card border border-bdr rounded-xl p-4 sm:p-5">
      <p className="font-mono text-[10px] text-txt2 tracking-[0.18em] uppercase mb-3">{label}</p>
      <p className="text-3xl font-bold text-txt leading-none mb-2">{value}</p>
      <p className="text-[11px] text-txt2">{sub}</p>
    </div>
  )
}

function Panel({ eyebrow, title, right, children }: {
  eyebrow: string; title: string; right?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="bg-card border border-bdr rounded-xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <p className="font-mono text-[10px] text-txt2 tracking-[0.18em] uppercase mb-1">{eyebrow}</p>
          <h3 className="text-base font-semibold text-txt">{title}</h3>
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

function CompRow({ dot, label, count, pct }: { dot: string; label: string; count: number; pct: number }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dot }} />
      <span className="text-txt2 flex-1">{label}</span>
      <span className="text-txt font-medium">{count}</span>
      <span className="text-txt3 font-mono text-xs w-9 text-right">{pct}%</span>
    </div>
  )
}

function Mini({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="bg-card border border-bdr rounded-lg p-3">
      <p className="font-mono text-[9px] text-txt2 tracking-[0.15em] uppercase mb-1.5">{label}</p>
      <p className="text-xl font-bold text-txt leading-none mb-1">{value}</p>
      <p className="text-[10px] text-txt3">{sub}</p>
    </div>
  )
}

function BarRow({ label, count, pct }: { label: string; count: number; pct: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="text-txt2">{label} <span className="text-txt font-medium ml-1">{count}</span></span>
        <span className="font-mono text-xs text-txt3">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-bdr overflow-hidden">
        <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

const ChartTooltip = ({ active, payload, label }: {
  active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string
}) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-bdr2 rounded-lg px-3 py-2 text-xs font-mono shadow-xl">
      <p className="text-txt2 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { data: acoesData, isLoading: acoesLoading } = useAllAcoes()
  const { data: membros, isLoading: membrosLoading } = useMembros()
  const { data: ausencias } = useAusencias()
  const { data: me } = useMe()
  const { canEdit, admin } = usePerms()

  const [win, setWin] = useState<Win>(30)

  // Memoizados: arrays novos a cada render invalidavam todos os useMemo abaixo
  const acoes: Acao[] = useMemo(
    () => (acoesData?.acoes ?? []).filter(a => (a.status ?? 'aprovada') === 'aprovada'),
    [acoesData],
  )
  const membrosList: Membro[] = useMemo(() => membros ?? [], [membros])

  const ausStats = useMemo(() => {
    const list = ausencias ?? []
    return {
      ativa: list.filter(a => statusAusencia(a) === 'ativa').length,
      programada: list.filter(a => statusAusencia(a) === 'programada').length,
      encerrada: list.filter(a => statusAusencia(a) === 'encerrada').length,
    }
  }, [ausencias])

  const dateStr = useMemo(
    () => new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }),
    [],
  )

  // ── Win rate no período selecionado ──────────────────────────
  const winStats = useMemo(() => {
    const from = isoDaysAgo(win)
    const inWindow = acoes.filter(a => a.data >= from)
    const wins = inWindow.filter(a => a.resultado === 'Vitória').length
    return { rate: calcWinRate(inWindow), wins, total: inWindow.length }
  }, [acoes, win])

  // ── Efetivo ──────────────────────────────────────────────────
  const efetivo = useMemo(() => {
    const total = membrosList.length || 1
    const ativos = membrosList.filter(m => m.status === 'Ativo').length
    const ausencia = membrosList.filter(m => m.status === 'Ausência').length
    const inativos = membrosList.filter(m => m.status === 'Inativo').length
    const pct = (n: number) => Math.round((n / total) * 100)
    return {
      totalReal: membrosList.length, ativos, ausencia, inativos,
      pctAtivos: pct(ativos), pctAusencia: pct(ausencia), pctInativos: pct(inativos),
      disponivel: membrosList.length ? pct(ativos) : 0,
    }
  }, [membrosList])

  // ── Série diária (atual vs anterior) ─────────────────────────
  const { series, mini } = useMemo(() => {
    const today0 = new Date(); today0.setHours(0, 0, 0, 0)
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    const s = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(today0); d.setDate(d.getDate() - (29 - i))
      const prev = new Date(d); prev.setDate(prev.getDate() - 30)
      return {
        label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
        atual: acoes.filter(a => a.data === iso(d)).length,
        anterior: acoes.filter(a => a.data === iso(prev)).length,
      }
    })
    const atualSum = s.reduce((t, x) => t + x.atual, 0)
    const anteriorSum = s.reduce((t, x) => t + x.anterior, 0)
    const pico = s.reduce((m, x) => Math.max(m, x.atual), 0)
    const diasAtivos = s.filter(x => x.atual > 0).length
    const hoje = s[s.length - 1]?.atual ?? 0
    return {
      series: s,
      mini: { anteriorSum, media: atualSum / 30, pico, diasAtivos, hoje },
    }
  }, [acoes])

  // ── Perfil das apreensões (por QRU) ──────────────────────────
  const perfil = useMemo(() => {
    const total = acoes.length || 1
    const counts = new Map<string, number>()
    acoes.forEach(a => counts.set(a.qru, (counts.get(a.qru) ?? 0) + 1))
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count, pct: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4)
  }, [acoes])

  if (acoesLoading || membrosLoading) return <LoadingHud />

  // ── Dados pessoais do usuário logado ─────────────────────────
  const nomeExibido = me?.nomeServidor || user?.username || 'operador'
  const fotoExibida = me?.avatarAtual || null
  const meuMembro = membrosList.find(m => m.id === me?.membroId)
  const minhas = meuMembro ? acoes.filter(a => a.participants.some(p => p.memberId === meuMembro.id)) : []
  const minhasVitorias = minhas.filter(a => a.resultado === 'Vitória').length
  const minhasDerrotas = minhas.filter(a => a.resultado === 'Derrota').length
  const meuAproveitamento = minhasVitorias + minhasDerrotas ? Math.round((minhasVitorias / (minhasVitorias + minhasDerrotas)) * 100) : 0
  const minhaAdv = meuMembro ? (meuMembro.adv3 ? 3 : meuMembro.adv2 ? 2 : meuMembro.adv1 ? 1 : 0) : 0
  const meuCargo = meuMembro?.cargoNome || (admin ? 'Acesso total' : 'Sem cargo')
  const pendentes = acoes.filter(a => a.resultado === 'Empate').length

  return (
    <div className="w-full max-w-[1800px] mx-auto p-3 sm:p-6 lg:px-8 space-y-6 sm:space-y-8">
      {/* ── Cabeçalho ──────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full border-2 border-gold/50 bg-card2 overflow-hidden flex items-center justify-center text-gold3 text-lg font-semibold shrink-0 shadow-[0_0_24px_-6px_rgba(58,114,196,0.6)]">
            {fotoExibida
              ? <img src={fotoExibida} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              : nomeExibido.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl font-bold text-txt truncate">Bem-vindo, {nomeExibido}!</h1>
            <p className="text-sm text-txt2 mt-1 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-gold/40 bg-gold/10 text-gold3 text-xs font-medium">
                <BadgeCheck size={12} /> {meuCargo}
              </span>
              <span className="capitalize">{dateStr}</span>
              <span className="text-txt3">· {pendentes} pendência{pendentes === 1 ? '' : 's'} aguardando ação</span>
            </p>
          </div>
        </div>
        {canEdit('registrar_acao') && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/acoes/nova')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gold text-white text-sm font-medium hover:bg-gold2 transition-colors shadow-[0_8px_24px_-10px_rgba(58,114,196,0.7)]"
            >
              <Plus size={16} /> Nova apreensão
            </button>
          </div>
        )}
      </div>

      {/* ── Meu desempenho (específico de cada usuário) ─────────── */}
      {meuMembro && (
        <section>
          <p className="font-mono text-[10px] text-txt2 tracking-[0.18em] uppercase mb-3">Meu desempenho</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-card border border-bdr rounded-xl p-4 flex items-center gap-3">
              <Target size={20} className="text-gold3 shrink-0" />
              <div><p className="text-2xl font-bold text-txt leading-none">{minhas.length}</p><p className="text-[11px] text-txt2 mt-1">apreensões que participei</p></div>
            </div>
            <div className="bg-card border border-bdr rounded-xl p-4 flex items-center gap-3">
              <Trophy size={20} className="text-green shrink-0" />
              <div><p className="text-2xl font-bold text-txt leading-none">{meuAproveitamento}%</p><p className="text-[11px] text-txt2 mt-1">{minhasVitorias} vitória{minhasVitorias === 1 ? '' : 's'} · {minhasDerrotas} derrota{minhasDerrotas === 1 ? '' : 's'}</p></div>
            </div>
            <div className="bg-card border border-bdr rounded-xl p-4 flex items-center gap-3">
              <ShieldAlert size={20} className={minhaAdv ? 'text-orange-400 shrink-0' : 'text-txt3 shrink-0'} />
              <div><p className="text-2xl font-bold text-txt leading-none">{minhaAdv ? `Nível ${minhaAdv}` : 'Nenhuma'}</p><p className="text-[11px] text-txt2 mt-1">advertência</p></div>
            </div>
            <div className="bg-card border border-bdr rounded-xl p-4 flex items-center gap-3">
              <CalendarClock size={20} className="text-blue shrink-0" />
              <div><p className="text-2xl font-bold text-txt leading-none">{meuMembro.status}</p><p className="text-[11px] text-txt2 mt-1">{meuMembro.ausenteAte ? `ausente até ${meuMembro.ausenteAte.split('-').reverse().join('/')}` : 'status atual'}</p></div>
            </div>
          </div>
        </section>
      )}

      {/* ── Inteligência operacional ───────────────────────────── */}
      <section>
        <p className="font-mono text-[10px] text-txt2 tracking-[0.18em] uppercase mb-1">Leitura consolidada</p>
        <div className="flex items-end justify-between gap-2 flex-wrap mb-4">
          <h2 className="text-xl font-semibold text-txt">Inteligência operacional</h2>
          <p className="font-mono text-[10px] text-txt3 tracking-[0.15em] uppercase">
            Últimos {win} dias + histórico geral
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          {/* WIN RATE — card destacado */}
          <div className="rounded-xl p-5 border border-gold/40 relative overflow-hidden"
               style={{ background: 'linear-gradient(135deg, rgba(58,114,196,0.22), rgba(20,33,61,0.35))' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="font-mono text-[10px] text-gold3 tracking-[0.18em] uppercase">Win rate</p>
              <div className="flex gap-0.5 bg-black/30 rounded-md p-0.5">
                {([7, 15, 30] as Win[]).map(d => (
                  <button
                    key={d}
                    onClick={() => setWin(d)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                      win === d ? 'bg-gold text-white' : 'text-txt2 hover:text-txt'
                    }`}
                  >
                    {d} dias
                  </button>
                ))}
              </div>
            </div>
            <p className="text-4xl font-bold text-txt leading-none mb-2">{winStats.rate}%</p>
            <p className="text-[11px] text-gold3/80">
              {winStats.wins} vitórias em {winStats.total} ações fechadas
            </p>
          </div>

          <StatCard label="Total de apreensões" value={acoes.length} sub="histórico aprovado" />
          <StatCard label="Membros" value={efetivo.totalReal} sub={`${efetivo.ativos} ativos agora`} />
          <StatCard label="Ausentes" value={efetivo.ausencia} sub="com ausência ativa" />
        </div>
      </section>

      {/* ── Gráfico + Efetivo ──────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
        {/* Coluna esquerda */}
        <div className="xl:col-span-2 space-y-4 min-w-0">
          <Panel
            eyebrow="Atividade diária"
            title="Ritmo de apreensões"
            right={
              <div className="flex items-center gap-4 font-mono text-[10px] text-txt2">
                <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-gold" /> ATUAL</span>
                <span className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-txt3" /> ANTERIOR</span>
              </div>
            }
          >
            <div className="h-52 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#1a2030" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#454f63', fontSize: 10 }} interval={6} tickLine={false} axisLine={{ stroke: '#1a2030' }} />
                  <YAxis tick={{ fill: '#454f63', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="anterior" name="Anterior" stroke="#454f63" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                  <Line type="monotone" dataKey="atual" name="Atual" stroke="#3a72c4" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#5b93de' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <Mini label="Período anterior" value={mini.anteriorSum} sub="30 dias anteriores" />
            <Mini label="Média diária" value={br(mini.media, 1)} sub="apreensões por dia" />
            <Mini label="Pico diário" value={mini.pico} sub="máx. em um dia" />
            <Mini label="Dias ativos" value={mini.diasAtivos} sub="de 30 dias" />
            <Mini label="Hoje" value={mini.hoje} sub="nas últimas 24h" />
          </div>
        </div>

        {/* Coluna direita */}
        <div className="space-y-4 min-w-0">
          <Panel
            eyebrow="Composição atual"
            title="Panorama do efetivo"
            right={
              <div className="text-right">
                <p className="text-lg font-bold text-txt leading-none">{efetivo.disponivel}%</p>
                <p className="font-mono text-[9px] text-txt3 tracking-widest uppercase">Disponível</p>
              </div>
            }
          >
            <div className="h-1.5 rounded-full bg-bdr overflow-hidden mb-4">
              <div className="h-full rounded-full bg-green" style={{ width: `${efetivo.pctAtivos}%` }} />
            </div>
            <div className="space-y-2.5 mb-4">
              <CompRow dot="#27ae60" label="Ativos"     count={efetivo.ativos}   pct={efetivo.pctAtivos} />
              <CompRow dot="#c9a23a" label="Em ausência" count={efetivo.ausencia} pct={efetivo.pctAusencia} />
              <CompRow dot="#b8433a" label="Inativos"    count={efetivo.inativos} pct={efetivo.pctInativos} />
            </div>
            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-bdr">
              <Mini label="Ausências ativas" value={ausStats.ativa} sub="" />
              <Mini label="Programadas" value={ausStats.programada} sub="" />
              <Mini label="Encerradas" value={ausStats.encerrada} sub="" />
            </div>
          </Panel>

          <Panel eyebrow="Base aprovada" title="Perfil das apreensões">
            {perfil.length > 0 ? (
              <div className="space-y-3">
                {perfil.map(p => <BarRow key={p.label} label={p.label} count={p.count} pct={p.pct} />)}
              </div>
            ) : (
              <p className="text-sm text-txt3 py-6 text-center">Sem apreensões registradas</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
