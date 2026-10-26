import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/axios'
import type { Member, Page, Role } from '@/modules/ranking/types'
import './diretorio-publico.css'

/**
 * Consulta pública da tela inicial (sem login), no visual "paper panel":
 *  - botão MEMBROS no topo abre o diretório da unidade (a DU não tem ranking).
 * Dados da API pública do diretório (sem IDs do Discord nem histórico).
 */

const DURACAO_DESENROLAR = 1050

const semPrefixo = (nome: string) => nome.replace(/^\(DU\)\s*/i, '')
const doisDigitos = (n: number) => String(n).padStart(2, '0')
const dataBR = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10).split('-').reverse().join('/') : '—')
const iniciais = (nome: string) => nome.split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '?'

function IconeFechar() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
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
  // Com o painel aberto, atualiza a cada 30 s para acompanhar o online/offline do Discord
  const q = useQuery({ queryKey: ['publico', 'membros'], queryFn: buscarTodosMembros, staleTime: 30_000, enabled: aberto,
    refetchInterval: aberto ? 30_000 : false })

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
                {g.membros.map(m => (
                  <article key={m.id} className="directory-member-card" tabIndex={0} role="link" aria-label={`Abrir perfil de ${m.name}`}
                    title={`${m.role} · desde ${dataBR(m.joinedAt)}`}
                    onClick={() => navigate(`/perfil/${m.slug}`)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/perfil/${m.slug}`) } }}>
                    <Foto membro={m} className="directory-avatar directory-member-avatar">
                      {typeof m.online === 'boolean' && (
                        <span className={`directory-member-presence${m.online ? ' is-online' : ''}`} role="img"
                          aria-label={m.online ? 'Online no Discord' : 'Offline no Discord'} title={m.online ? 'Online' : 'Offline'} />
                      )}
                    </Foto>
                    <span className="directory-member-identity">
                      {m.badge && <span className="directory-member-id">{m.badge}</span>}
                      <span className="directory-member-name">{m.name}</span>
                    </span>
                    <span className="directory-member-level">NV.{m.level > 0 ? m.level : '—'}</span>
                  </article>
                ))}
              </div>
            </section>
          ))}
      </div>
    </section>
  )
}

export default function PublicOverlay() {
  const [membros, setMembros] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMembros(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="public-directory">
      <nav className="public-directory__nav" aria-label="Consulta pública">
        <button className={`public-directory__trigger${membros ? ' is-active' : ''}`} aria-expanded={membros} onClick={() => setMembros(v => !v)}>Membros</button>
      </nav>
      <PainelMembros aberto={membros} onClose={() => setMembros(false)} />
    </div>
  )
}
