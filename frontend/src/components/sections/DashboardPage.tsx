import { useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { FileSearch, ScrollText, FolderArchive, Users, BadgeCheck, Plus, Images, ShieldAlert, CalendarClock, ArrowRight, Lock } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useMembros } from '@/hooks/useMembros'
import { useAusencias, statusAusencia } from '@/hooks/useAusencias'
import { useAuthStore } from '@/store/authStore'
import { useMe } from '@/hooks/useMe'
import { usePerms } from '@/hooks/usePerms'
import { relatoriosApi, boletinsApi, inqueritosApi, galeriaApi, STATUS_BOLETIM, STATUS_INQUERITO, dataBR } from '@/hooks/useInvestigacao'
import LoadingHud from '@/components/ui/LoadingHud'
import { Selo, ImagemArquivo } from '@/components/investigacao/Campos'
import type { Membro } from '@/types'

/**
 * Visão geral da DU: painel pessoal do investigador, números das investigações,
 * ritmo de produção (relatórios + boletins), registros recentes, efetivo e galeria.
 * Cada bloco só aparece para quem tem permissão de ver a área de origem.
 */

function isoDiasAtras(n: number) {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function StatCard({ icone: Icone, label, value, sub, to }: { icone: typeof FileSearch; label: string; value: string | number; sub: string; to?: string }) {
  const corpo = (
    <div className="group h-full bg-card border border-bdr rounded-xl p-4 sm:p-5 hover:border-gold/40 transition-colors relative overflow-hidden">
      <Icone size={64} aria-hidden className="absolute -right-3 -bottom-3 text-gold/[0.07] group-hover:text-gold/[0.12] transition-colors" />
      <p className="font-mono text-[10px] text-txt2 tracking-[0.18em] uppercase mb-3 flex items-center gap-1.5"><Icone size={12} className="text-gold2" /> {label}</p>
      <p className="text-3xl font-bold text-txt leading-none mb-2">{value}</p>
      <p className="text-[11px] text-txt2">{sub}</p>
    </div>
  )
  return to ? <Link to={to} className="block h-full">{corpo}</Link> : corpo
}

function Panel({ eyebrow, title, right, children }: { eyebrow: string; title: string; right?: React.ReactNode; children: React.ReactNode }) {
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

const ChartTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-bdr2 rounded-lg px-3 py-2 text-xs font-mono shadow-xl">
      <p className="text-txt2 mb-1">{label}</p>
      {payload.map(p => <p key={p.name} style={{ color: p.color }}>{p.name}: {p.value}</p>)}
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { canView, canEdit, admin } = usePerms()
  const { data: membros, isLoading: membrosLoading } = useMembros()
  const { data: ausencias } = useAusencias()
  const { data: me } = useMe()
  const { data: relatorios } = relatoriosApi.useLista(canView('relatorios'))
  const { data: boletins } = boletinsApi.useLista(canView('boletins'))
  const { data: inqueritos } = inqueritosApi.useLista(canView('inqueritos'))
  const { data: fotos } = galeriaApi.useLista(canView('galeria'))

  const membrosList: Membro[] = useMemo(() => membros ?? [], [membros])
  const rel = useMemo(() => relatorios ?? [], [relatorios])
  const bol = useMemo(() => boletins ?? [], [boletins])
  const inq = useMemo(() => inqueritos ?? [], [inqueritos])

  const dateStr = useMemo(() => new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }), [])

  const efetivo = useMemo(() => {
    const total = membrosList.length || 1
    const ativos = membrosList.filter(m => m.status === 'Ativo').length
    const ausencia = membrosList.filter(m => m.status === 'Ausência').length
    const inativos = membrosList.filter(m => m.status === 'Inativo').length
    const pct = (n: number) => Math.round((n / total) * 100)
    return { totalReal: membrosList.length, ativos, ausencia, inativos, pctAtivos: pct(ativos), pctAusencia: pct(ausencia), pctInativos: pct(inativos) }
  }, [membrosList])

  const ausAtivas = useMemo(() => (ausencias ?? []).filter(a => statusAusencia(a) === 'ativa').length, [ausencias])

  // Ritmo de produção: relatórios e boletins por dia nos últimos 30 dias
  const { serie, rel30, bol30 } = useMemo(() => {
    const de = isoDiasAtras(29)
    const s = Array.from({ length: 30 }, (_, i) => {
      const iso = isoDiasAtras(29 - i)
      return { label: `${iso.slice(8, 10)}/${iso.slice(5, 7)}`, iso, Relatórios: 0, Boletins: 0 }
    })
    const porDia = new Map(s.map(x => [x.iso, x]))
    for (const r of rel) { const d = porDia.get(r.data); if (d) d.Relatórios++ }
    for (const b of bol) { const d = porDia.get(b.data); if (d) d.Boletins++ }
    return { serie: s, rel30: rel.filter(r => r.data >= de).length, bol30: bol.filter(b => b.data >= de).length }
  }, [rel, bol])

  if (membrosLoading) return <LoadingHud />

  const nomeExibido = me?.nome || me?.nomeServidor || user?.username || 'investigador'   // codinome (regra)
  const fotoExibida = me?.avatarAtual || null
  const meuMembro = membrosList.find(m => m.id === me?.membroId)
  const meuCargo = meuMembro?.cargoNome || (admin ? 'Acesso total' : 'Sem cargo')
  const minhaAdv = meuMembro ? (meuMembro.adv2 ? 2 : meuMembro.adv1 ? 1 : 0) : 0
  const meusRel = meuMembro ? rel.filter(r => r.investigadores.includes(meuMembro.id)).length : 0
  const meusBol = meuMembro ? bol.filter(b => b.investigadores.includes(meuMembro.id) && b.status !== 'arquivado' && b.status !== 'concluido').length : 0
  const meusInq = meuMembro ? inq.filter(i => i.investigadores.includes(meuMembro.id) && i.status === 'em_andamento').length : 0
  const bolAtivos = bol.filter(b => b.status === 'aberto' || b.status === 'em_investigacao').length
  const inqAndamento = inq.filter(i => i.status === 'em_andamento').length

  return (
    <div className="w-full max-w-450 mx-auto p-3 sm:p-6 lg:px-8 space-y-6 sm:space-y-8">
      {/* ── Cabeçalho com arte ─────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-bdr">
        <div aria-hidden className="absolute inset-0 bg-cover bg-[center_30%]" style={{ backgroundImage: 'url(/media/du/hero-dashboard.webp)' }} />
        <div aria-hidden className="absolute inset-0 bg-linear-to-r from-bg via-bg/80 to-bg/20" />
        <div aria-hidden className="absolute inset-0 bg-linear-to-t from-bg/90 via-transparent to-transparent" />
        <div className="relative flex items-end justify-between gap-4 flex-wrap px-5 sm:px-8 py-7 sm:py-10 min-h-48">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full border-2 border-gold/60 bg-card2 overflow-hidden flex items-center justify-center text-gold3 text-lg font-semibold shrink-0 shadow-[0_0_30px_-6px_rgba(139,92,246,0.7)]">
              {fotoExibida
                ? <img src={fotoExibida} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                : nomeExibido.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-mono text-[10px] text-gold3 tracking-[0.25em] uppercase mb-1">Detective Unit · DPD</p>
              <h1 className="text-xl sm:text-3xl font-bold text-txt truncate">Bem-vindo, {nomeExibido}!</h1>
              {meuMembro?.codinome && <p className="text-gold2 font-display text-sm sm:text-base tracking-[0.15em] uppercase">“{meuMembro.codinome}”</p>}
              <p className="text-sm text-txt2 mt-1 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-gold/40 bg-gold/10 text-gold3 text-xs font-medium"><BadgeCheck size={12} /> {meuCargo}</span>
                <span className="capitalize">{dateStr}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {canEdit('relatorios') && (
              <button onClick={() => navigate('/relatorios/novo')}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gold text-white text-sm font-medium hover:bg-gold2 transition-colors shadow-[0_8px_24px_-10px_rgba(139,92,246,0.8)]">
                <Plus size={16} /> Cadastrar relatório
              </button>
            )}
            {canEdit('boletins') && (
              <button onClick={() => navigate('/boletins')} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gold/40 bg-bg/60 text-txt text-sm hover:bg-gold/15 transition-colors">
                <ScrollText size={15} /> Boletins
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Meu painel ─────────────────────────────────────────── */}
      {meuMembro && (
        <section>
          <p className="font-mono text-[10px] text-txt2 tracking-[0.18em] uppercase mb-3">Meu painel</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-card border border-bdr rounded-xl p-4 flex items-center gap-3">
              <FileSearch size={20} className="text-gold3 shrink-0" />
              <div><p className="text-2xl font-bold text-txt leading-none">{meusRel}</p><p className="text-[11px] text-txt2 mt-1">relatórios em que estou</p></div>
            </div>
            <div className="bg-card border border-bdr rounded-xl p-4 flex items-center gap-3">
              <FolderArchive size={20} className="text-gold3 shrink-0" />
              <div><p className="text-2xl font-bold text-txt leading-none">{meusInq + meusBol}</p><p className="text-[11px] text-txt2 mt-1">{meusInq} inquérito(s) · {meusBol} boletim(ns) ativos</p></div>
            </div>
            <div className="bg-card border border-bdr rounded-xl p-4 flex items-center gap-3">
              <ShieldAlert size={20} className={minhaAdv ? 'text-orange-400 shrink-0' : 'text-txt3 shrink-0'} />
              <div><p className="text-2xl font-bold text-txt leading-none">{minhaAdv ? `Nível ${minhaAdv}` : 'Nenhuma'}</p><p className="text-[11px] text-txt2 mt-1">advertência</p></div>
            </div>
            <div className="bg-card border border-bdr rounded-xl p-4 flex items-center gap-3">
              <CalendarClock size={20} className="text-gold2 shrink-0" />
              <div><p className="text-2xl font-bold text-txt leading-none">{meuMembro.status}</p><p className="text-[11px] text-txt2 mt-1">{meuMembro.ausenteAte ? `ausente até ${meuMembro.ausenteAte.split('-').reverse().join('/')}` : 'status atual'}</p></div>
            </div>
          </div>
        </section>
      )}

      {/* ── Números da unidade ─────────────────────────────────── */}
      <section>
        <p className="font-mono text-[10px] text-txt2 tracking-[0.18em] uppercase mb-1">Leitura consolidada</p>
        <h2 className="text-xl font-semibold text-txt mb-4">Central de investigações</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          {canView('relatorios') && <StatCard icone={FileSearch} label="Relatórios" value={rel.length} sub={`${rel30} nos últimos 30 dias`} to="/relatorios" />}
          {canView('boletins') && <StatCard icone={ScrollText} label="Boletins ativos" value={bolAtivos} sub={`${bol.length} no total · ${bol30} em 30 dias`} to="/boletins" />}
          {canView('inqueritos') && <StatCard icone={FolderArchive} label="Inquéritos em andamento" value={inqAndamento} sub={`${inq.length} no arquivo`} to="/inqueritos" />}
          <StatCard icone={Users} label="Investigadores" value={efetivo.totalReal} sub={`${efetivo.ativos} ativos · ${ausAtivas} ausentes`} to={canView('membros') ? '/membros' : undefined} />
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
        <div className="xl:col-span-2 space-y-4 min-w-0">
          {(canView('relatorios') || canView('boletins')) && (
            <Panel eyebrow="Últimos 30 dias" title="Ritmo das investigações"
              right={
                <div className="flex items-center gap-4 font-mono text-[10px] text-txt2">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-sm bg-gold" /> RELATÓRIOS</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-sm bg-[#f5c451]" /> BOLETINS</span>
                </div>
              }>
              <div className="h-56 sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={serie} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gRel" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.45} /><stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient>
                      <linearGradient id="gBol" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f5c451" stopOpacity={0.3} /><stop offset="100%" stopColor="#f5c451" stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid stroke="#221a2e" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#615874', fontSize: 10 }} interval={6} tickLine={false} axisLine={{ stroke: '#221a2e' }} />
                    <YAxis tick={{ fill: '#615874', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="Relatórios" stroke="#8b5cf6" strokeWidth={2} fill="url(#gRel)" />
                    <Area type="monotone" dataKey="Boletins" stroke="#f5c451" strokeWidth={1.5} fill="url(#gBol)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {canView('relatorios') && (
              <Panel eyebrow="Recentes" title="Últimos relatórios" right={<Link to="/relatorios" className="text-xs text-gold3 hover:text-gold2 inline-flex items-center gap-1">Ver todos <ArrowRight size={12} /></Link>}>
                {rel.length === 0 ? <p className="text-sm text-txt3 py-4 text-center">Nenhum relatório ainda.</p> : (
                  <ul className="divide-y divide-bdr">
                    {rel.slice(0, 5).map(r => (
                      <li key={r.id} className="py-2.5 flex items-center gap-3">
                        <span className="font-mono text-[11px] text-gold3 w-28 shrink-0 truncate">{r.numero}</span>
                        <span className="flex-1 min-w-0 truncate text-sm text-txt">{r.sigiloso && <Lock size={11} className="inline mr-1 text-red" />}{r.titulo}</span>
                        <span className="text-[11px] text-txt3 font-mono shrink-0">{dataBR(r.data).slice(0, 5)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}
            {canView('boletins') && (
              <Panel eyebrow="Recentes" title="Últimos boletins" right={<Link to="/boletins" className="text-xs text-gold3 hover:text-gold2 inline-flex items-center gap-1">Ver todos <ArrowRight size={12} /></Link>}>
                {bol.length === 0 ? <p className="text-sm text-txt3 py-4 text-center">Nenhum boletim ainda.</p> : (
                  <ul className="divide-y divide-bdr">
                    {bol.slice(0, 5).map(b => (
                      <li key={b.id} className="py-2.5 flex items-center gap-3">
                        <span className="font-mono text-[11px] text-gold3 w-28 shrink-0 truncate">{b.numero}</span>
                        <span className="flex-1 min-w-0 truncate text-sm text-txt">{b.titulo}</span>
                        <Selo cor={STATUS_BOLETIM[b.status].cor}>{STATUS_BOLETIM[b.status].rotulo}</Selo>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}
          </div>
        </div>

        <div className="space-y-4 min-w-0">
          <Panel eyebrow="Composição atual" title="Panorama do efetivo"
            right={<div className="text-right"><p className="text-lg font-bold text-txt leading-none">{efetivo.pctAtivos}%</p><p className="font-mono text-[9px] text-txt3 tracking-widest uppercase">Disponível</p></div>}>
            <div className="h-1.5 rounded-full bg-bdr overflow-hidden mb-4"><div className="h-full rounded-full bg-gold" style={{ width: `${efetivo.pctAtivos}%` }} /></div>
            <div className="space-y-2.5">
              <CompRow dot="#27ae60" label="Ativos" count={efetivo.ativos} pct={efetivo.pctAtivos} />
              <CompRow dot="#c9a23a" label="Em ausência" count={efetivo.ausencia} pct={efetivo.pctAusencia} />
              <CompRow dot="#b8433a" label="Inativos" count={efetivo.inativos} pct={efetivo.pctInativos} />
            </div>
          </Panel>

          {canView('inqueritos') && inq.length > 0 && (
            <Panel eyebrow="Arquivo" title="Inquéritos por status">
              <div className="space-y-2.5">
                {(Object.keys(STATUS_INQUERITO) as (keyof typeof STATUS_INQUERITO)[]).map(s => {
                  const n = inq.filter(i => i.status === s).length
                  return <CompRow key={s} dot={STATUS_INQUERITO[s].cor} label={STATUS_INQUERITO[s].rotulo} count={n} pct={Math.round((n / inq.length) * 100)} />
                })}
              </div>
            </Panel>
          )}

          {canView('galeria') && (fotos?.length ?? 0) > 0 && (
            <Panel eyebrow="Galeria da DU" title="Registros recentes" right={<Link to="/galeria" className="text-xs text-gold3 hover:text-gold2 inline-flex items-center gap-1"><Images size={12} /> Abrir</Link>}>
              <div className="grid grid-cols-2 gap-2">
                {fotos!.slice(0, 4).map(f => (
                  <Link key={f.id} to="/galeria" className="aspect-square rounded-lg overflow-hidden border border-bdr hover:border-gold/50">
                    {f.arquivo
                      ? <ImagemArquivo arquivo={f.arquivo} alt={f.titulo} className="w-full h-full" />
                      : <img src={f.imagem} alt={f.titulo} referrerPolicy="no-referrer" loading="lazy" className="w-full h-full object-cover" />}
                  </Link>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
