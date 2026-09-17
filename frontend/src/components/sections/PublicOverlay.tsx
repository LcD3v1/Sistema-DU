import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/axios'
import type { Member, Page, Period, Ranking, Role } from '@/modules/ranking/types'
import './diretorio-publico.css'

/**
 * Consulta pública da tela inicial (sem login), no visual "paper panel":
 *  - navegação RANKING — MEMBROS centralizada no topo;
 *  - Ranking (esquerda) e Membros (direita) abrem de forma independente —
 *    os dois podem ficar abertos ao mesmo tempo.
 * Dados da API pública do módulo de ranking (sem IDs do Discord nem histórico).
 */

const PERIODOS: { id: Period; label: string }[] = [
  { id: 'all', label: 'Todo o período' },
  { id: '7d', label: '7 dias' },
  { id: '15d', label: '15 dias' },
  { id: '30d', label: '30 dias' },
]
const DURACAO_DESENROLAR = 1050

const semPrefixo = (nome: string) => nome.replace(/^\(FAST\)\s*/i, '')
const doisDigitos = (n: number) => String(n).padStart(2, '0')
const dataBR = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10).split('-').reverse().join('/') : '—')
const iniciais = (nome: string) => nome.split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '?'

function IconeFechar() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
}
function IconeSeta() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5" /></svg>
}
function Coroa({ pos }: { pos: number }) {
  const tipo = pos === 1 ? 'ouro' : pos === 2 ? 'prata' : 'bronze'
  return (
    <svg className={`directory-ranking-crown directory-ranking-crown--${tipo}`} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M3 8l4.5 3.5L12 5l4.5 6.5L21 8l-1.8 10H4.8z" /><path d="M4.8 18h14.4" />
    </svg>
  )
}

function Foto({ membro, className = 'directory-avatar', children }: { membro: Pick<Member, 'name' | 'avatar'>; className?: string; children?: React.ReactNode }) {
  const [falhou, setFalhou] = useState(false)
  return (
    <span className={className}>
      {membro.avatar && !falhou
        ? <img src={membro.avatar} alt={`Foto de ${membro.name}`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFalhou(true)} />
        : iniciais(membro.name)}
      {children}
    </span>
  )
}

function Carregando() {
  return <div className="directory-loading" role="status"><span /><span /><span /><small>Carregando</small></div>
}
function Erro({ tentar }: { tentar: () => void }) {
  return (
    <div className="directory-error" role="alert">
      <strong>Não foi possível carregar.</strong>
      <button className="directory-retry" onClick={tentar}>Tentar novamente</button>
    </div>
  )
}

/** Controla as classes is-open / is-unrolling (animação de "desenrolar"). */
function useEstadoPainel(aberto: boolean) {
  const [desenrolando, setDesenrolando] = useState(false)
  const anterior = useRef(aberto)
  useEffect(() => {
    if (aberto && !anterior.current) {
      setDesenrolando(true)
      const t = setTimeout(() => setDesenrolando(false), DURACAO_DESENROLAR)
      anterior.current = aberto
      return () => clearTimeout(t)
    }
    anterior.current = aberto
  }, [aberto])
  return `${aberto ? ' is-open' : ''}${aberto && desenrolando ? ' is-unrolling' : ''}`
}

/* ─────────────────────────── RANKING (esquerda) ─────────────────────────── */
function PainelRanking({ aberto, onClose }: { aberto: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const [periodo, setPeriodo] = useState<Period>('all')
  const classes = useEstadoPainel(aberto)
  const q = useQuery<Ranking>({
    queryKey: ['publico', 'ranking', periodo],
    queryFn: async () => (await api.get<Ranking>('/public/directory', { params: { period: periodo, limit: 100, page: 1 } })).data,
    staleTime: 30_000,
    enabled: aberto,
  })
  const itens = q.data?.items ?? []
  const maxRegistros = Math.max(1, ...itens.map(m => m.records))
  const stats = q.data?.stats
  const fechadas = (stats?.wins ?? 0) + (stats?.losses ?? 0)
  const rotuloPeriodo = PERIODOS.find(p => p.id === periodo)!.label.toLowerCase()

  return (
    <section className={`paper-panel paper-panel--ranking${classes}`} aria-hidden={!aberto} aria-labelledby="painel-ranking-titulo">
      <div className="paper-panel__chrome">
        <button className="paper-panel__close" onClick={onClose} aria-label="Fechar ranking"><IconeFechar /></button>
      </div>
      <header className="paper-panel__header">
        <span className="paper-panel__eyebrow">Classificação resumida</span>
        <h2 id="painel-ranking-titulo">Ranking</h2>
        <div className="directory-periods" role="group" aria-label="Período">
          {PERIODOS.map(p => (
            <button key={p.id} className={`directory-period${periodo === p.id ? ' is-selected' : ''}`} aria-pressed={periodo === p.id} onClick={() => setPeriodo(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      </header>
      <div className="paper-panel__body paper-panel__body--ranking">
        {q.isLoading ? <Carregando /> : q.isError ? <Erro tentar={() => q.refetch()} /> : (
          <div className="directory-ranking-summary">
            <div className="directory-ranking-kpis" aria-label="Resumo operacional">
              <article className="directory-ranking-kpi directory-ranking-kpi--accent">
                <span>Win rate</span>
                <strong>{Math.round(stats?.winRate ?? 0)}%</strong>
                <small>{stats?.wins ?? 0} vitórias em {fechadas} ações fechadas</small>
              </article>
              <article className="directory-ranking-kpi">
                <span>Total de apreensões</span>
                <strong>{stats?.records ?? 0}</strong>
                <small>registros aprovados</small>
              </article>
              <article className="directory-ranking-kpi">
                <span>Conquistas</span>
                <strong>{stats?.achievements ?? 0}</strong>
                <small>liberadas pelo efetivo</small>
              </article>
            </div>
            <div className="directory-ranking-meta">
              <span>Top {itens.length} / {rotuloPeriodo}</span>
              <button className="directory-full-link" onClick={() => navigate('/ranking')}>Abrir ranking completo <IconeSeta /></button>
            </div>
            {itens.length === 0 ? <div className="directory-empty directory-empty--ranking">Nenhum registro aprovado neste período.</div> : (
              <div className="directory-ranking-list">
                {itens.map((m, i) => {
                  const pos = m.rank ?? i + 1
                  return (
                    <a key={m.id} href={`/perfil/${m.slug}`} onClick={e => { e.preventDefault(); navigate(`/perfil/${m.slug}`) }}
                      className={`directory-rank-row${pos === 1 ? ' directory-rank-row--leader' : ''}`}
                      style={{ '--rank-width': `${(m.records / maxRegistros) * 100}%` } as React.CSSProperties}>
                      <span className="directory-rank-place">{doisDigitos(pos)}</span>
                      <Foto membro={m} />
                      <span className="directory-rank-copy">
                        <span className="directory-rank-name"><span className="directory-rank-name-text">{m.name}</span>{pos <= 3 && <Coroa pos={pos} />}</span>
                        <span className="directory-rank-role">{m.role} · {m.wins} vitória{m.wins === 1 ? '' : 's'}</span>
                      </span>
                      <span className="directory-rank-score"><strong>{m.records}</strong><small>registros</small></span>
                    </a>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

/* ─────────────────────────── MEMBROS (direita) ─────────────────────────── */
async function buscarTodosMembros(): Promise<{ items: Member[]; roles: Role[] }> {
  const itens: Member[] = []
  let roles: Role[] = []
  for (let pagina = 1; pagina <= 20; pagina++) {
    const { data } = await api.get<Page>('/public/directory/members', { params: { page: pagina, limit: 100, period: 'all' } })
    itens.push(...data.items)
    roles = data.roles
    if (pagina >= data.pages) break
  }
  return { items: itens, roles }
}

function PainelMembros({ aberto, onClose }: { aberto: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const classes = useEstadoPainel(aberto)
  const q = useQuery({ queryKey: ['publico', 'membros'], queryFn: buscarTodosMembros, staleTime: 30_000, enabled: aberto })

  const grupos = useMemo(() => {
    const itens = q.data?.items ?? []
    const ordem = new Map((q.data?.roles ?? []).map(r => [r.name, r.order]))
    const porCargo = new Map<string, Member[]>()
    for (const m of itens) {
      const chave = m.hierarchy || 'Sem cargo'
      porCargo.set(chave, [...(porCargo.get(chave) ?? []), m])
    }
    return [...porCargo.entries()]
      .sort((a, b) => (ordem.get(a[0]) ?? 999) - (ordem.get(b[0]) ?? 999))
      .map(([cargo, membros]) => ({ cargo, membros }))
  }, [q.data])

  return (
    <section className={`paper-panel paper-panel--members${classes}`} aria-hidden={!aberto} aria-labelledby="painel-membros-titulo">
      <div className="paper-panel__chrome">
        <button className="paper-panel__close" onClick={onClose} aria-label="Fechar membros"><IconeFechar /></button>
      </div>
      <header className="paper-panel__header paper-panel__header--members">
        <span className="paper-panel__eyebrow">Diretório da unidade</span>
        <h2 id="painel-membros-titulo">Membros</h2>
      </header>
      <div className="paper-panel__body paper-panel__body--members">
        {q.isLoading ? <Carregando /> : q.isError ? <Erro tentar={() => q.refetch()} />
          : grupos.length === 0 ? <div className="directory-empty">Nenhum membro ativo no diretório.</div>
          : grupos.map((g, gi) => (
            <section key={g.cargo} className="directory-member-group" aria-labelledby={`grupo-${gi}`}>
              <header className="directory-member-group__head">
                <span className="directory-member-group__index">{doisDigitos(gi + 1)}</span>
                <h3 id={`grupo-${gi}`}>{semPrefixo(g.cargo)}</h3>
              </header>
              <div className="directory-member-grid">
                {g.membros.map(m => {
                  const presenca = m.status === 'Ativo' ? ' directory-member-presence--on' : m.status === 'Ausência' ? ' directory-member-presence--ausente' : ''
                  return (
                    <article key={m.id} className="directory-member-card" tabIndex={0} role="link" aria-label={`Abrir perfil de ${m.name}`}
                      onClick={() => navigate(`/perfil/${m.slug}`)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/perfil/${m.slug}`) } }}>
                      <Foto membro={m} className="directory-avatar directory-member-avatar">
                        <span className={`directory-member-presence${presenca}`} role="img" aria-label={m.status} title={m.status} />
                      </Foto>
                      <span className="directory-member-identity">
                        {m.badge && <span className="directory-member-id">{m.badge}</span>}
                        <span className="directory-member-name">{m.name}</span>
                      </span>
                      <span className="directory-member-level">NV.{m.level}</span>
                      <span className="directory-member-police" title={m.role}>{m.role}</span>
                      <span className="directory-member-since"><small>Desde</small>{dataBR(m.joinedAt)}</span>
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
      </div>
    </section>
  )
}

export default function PublicOverlay() {
  const [ranking, setRanking] = useState(false)
  const [membros, setMembros] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setRanking(false); setMembros(false) } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="public-directory">
      <nav className="public-directory__nav" aria-label="Consulta pública">
        <button className={`public-directory__trigger${ranking ? ' is-active' : ''}`} aria-expanded={ranking} onClick={() => setRanking(v => !v)}>Ranking</button>
        <span className="public-directory__separator" aria-hidden="true" />
        <button className={`public-directory__trigger${membros ? ' is-active' : ''}`} aria-expanded={membros} onClick={() => setMembros(v => !v)}>Membros</button>
      </nav>
      <PainelRanking aberto={ranking} onClose={() => setRanking(false)} />
      <PainelMembros aberto={membros} onClose={() => setMembros(false)} />
    </div>
  )
}
