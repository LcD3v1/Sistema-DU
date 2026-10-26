import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import api from '@/lib/axios'
import { resolveBanner } from '@/lib/banners'
import LinksPerfil from '@/components/perfil/LinksPerfil'
import EmojiPerfil from '@/components/perfil/EmojiPerfil'
import './perfil-publico.css'

/**
 * Perfil público do investigador: /perfil/:slug
 * Mostra identidade personalizada (fundo, codinome, emojis, links) e só as promoções.
 * Some quando o membro é exonerado/inativo.
 */

interface MudancaCargo { data: string; tipo: 'promocao' | 'rebaixamento'; de: string; para: string; por?: string }
interface Perfil {
  slug: string; nome: string; codinome: string; avatar: string | null; badge: string; nivel: number
  cargo: string; patente: string; membroDesde: string; status: string
  historicoCargos: MudancaCargo[]
  banner: string | null
  links: { rotulo: string; url: string; emoji: string | null }[]
  emojis: string[]
}

const dataBR = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10).split('-').reverse().join('/') : '—')

export default function PerfilPublicoPage() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const [fotoFalhou, setFotoFalhou] = useState(false)
  const q = useQuery<Perfil>({
    queryKey: ['perfil-publico', slug],
    queryFn: async () => (await api.get<Perfil>(`/public/perfil/${encodeURIComponent(slug)}`)).data,
    retry: (n, e) => n < 1 && !(isAxiosError(e) && e.response?.status === 404),
  })

  const voltar = () => (window.history.length > 1 ? navigate(-1) : navigate('/'))
  const p = q.data
  const fundo = p ? resolveBanner(p.banner, p.nome) : null

  return (
    <div className="perfil-page">
      <header className="perfil-banner">
        {fundo && (
          <div className="perfil-banner-fundo" aria-hidden="true">
            {fundo.img
              ? <img src={fundo.img} alt="" decoding="async" referrerPolicy="no-referrer" />
              : <div style={{ background: fundo.css }} />}
            {fundo.overlay && <div style={{ background: fundo.overlay }} />}
            <div className="perfil-banner-escurecer" />
          </div>
        )}
        <button className="perfil-voltar" onClick={voltar}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
          <span>Voltar</span>
        </button>
        {p && (
          <div className="perfil-hero">
            <div className="perfil-avatar">
              <span>{p.nome.charAt(0).toUpperCase()}</span>
              {p.avatar && !fotoFalhou && <img src={p.avatar} alt={`Foto de ${p.nome}`} referrerPolicy="no-referrer" onError={() => setFotoFalhou(true)} />}
            </div>
            <div className="perfil-id">
              <div className="perfil-id-top">
                <h1>{p.nome}{p.emojis?.length ? <span className="perfil-emojis" aria-hidden="true">{p.emojis.map((e, i) => <EmojiPerfil key={i} valor={e} />)}</span> : null}</h1>
                <span className="perfil-nivel">Nv. {p.nivel > 0 ? p.nivel : '—'}</span>
              </div>
              {p.codinome && <p className="perfil-codinome">“{p.codinome}”</p>}
              <p className="perfil-meta">
                {p.badge && <>ID {p.badge}<span className="perfil-sep">·</span></>}
                {p.cargo}<span className="perfil-sep">·</span>{p.patente}
              </p>
              <p className="perfil-desde"><span>Membro desde</span><strong>{dataBR(p.membroDesde)}</strong></p>
              <LinksPerfil links={p.links ?? []} className="perfil-links" />
            </div>
          </div>
        )}
        <svg className="perfil-banner-borda" viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 22 C 150 8, 300 34, 450 20 S 750 6, 900 22 S 1100 30, 1200 16 L1200 40 L0 40 Z" />
        </svg>
      </header>

      <main className="perfil-corpo">
        {q.isLoading && <p className="perfil-status">Carregando perfil…</p>}
        {q.isError && (
          <div className="perfil-vazio">
            {isAxiosError(q.error) && q.error.response?.status === 404
              ? 'Este perfil não existe ou o membro não faz mais parte da unidade.'
              : 'Não foi possível carregar o perfil. Tente novamente em instantes.'}
          </div>
        )}

        {p && (
          <>
            <section className="perfil-bloco">
              <h2 className="perfil-bloco-titulo">Histórico de promoções</h2>
              {p.historicoCargos.length === 0 ? (
                <div className="perfil-vazio">Nenhuma promoção ou rebaixamento registrado.</div>
              ) : (
                <div className="perfil-timeline">
                  {p.historicoCargos.map((h, i) => (
                    <div key={i} className="perfil-linha">
                      <span className="perfil-linha-data">{dataBR(h.data)}</span>
                      <span className="perfil-linha-mov">
                        <span>{h.de} → {h.para}</span>
                        {h.por && <em>por {h.por}</em>}
                      </span>
                      <span className="perfil-linha-status">
                        <span className={`perfil-badge ${h.tipo === 'promocao' ? 'perfil-badge--win' : 'perfil-badge--loss'}`}><span />{h.tipo === 'promocao' ? 'Promoção' : 'Rebaixamento'}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
