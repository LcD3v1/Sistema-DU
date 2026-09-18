import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import api from '@/lib/axios'
import { resolveBanner } from '@/lib/banners'
import LinksPerfil from '@/components/perfil/LinksPerfil'
import ModalOverlay from '@/components/ui/ModalOverlay'
import { linkSeguro } from '@/lib/plataformas'
import './perfil-publico.css'

/**
 * Perfil público do membro: /perfil/:slug
 * Mostra identidade personalizada (fundo, emojis, links), apreensões por período,
 * QRUs (foto do boletim; o clique abre o modal) e só as promoções. Some quando o membro é exonerado/inativo.
 */

interface Apreensao { id: number; data: string; tipo: string; local: string; resultado: string; imagem: string | null }
interface MudancaCargo { data: string; tipo: 'promocao' | 'rebaixamento'; de: string; para: string; por?: string }
interface Perfil {
  slug: string; nome: string; avatar: string | null; badge: string; nivel: number
  cargo: string; patente: string; membroDesde: string; status: string
  apreensoes: { d7: number; d15: number; d30: number; total: number }
  ultimasApreensoes: Apreensao[]
  historicoCargos: MudancaCargo[]
  posicao: number | null
  banner: string | null
  links: { rotulo: string; url: string; emoji: string | null }[]
  emojis: string[]
}

const dataBR = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10).split('-').reverse().join('/') : '—')

function Badge({ resultado }: { resultado: string }) {
  const tipo = resultado === 'Vitória' ? 'win' : resultado === 'Derrota' ? 'loss' : 'closed'
  const texto = resultado === 'Empate' ? 'Encerrado' : resultado === 'Convencional' ? 'Apreensão' : resultado
  return <span className={`perfil-badge perfil-badge--${tipo}`}><span />{texto}</span>
}

function FotoQru({ src, alt, inteira = false }: { src: string | null; alt: string; inteira?: boolean }) {
  const [falhou, setFalhou] = useState(false)
  if (!src || falhou || !linkSeguro(src)) return <span className="perfil-qru-semfoto" aria-hidden="true">Sem foto</span>
  return <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFalhou(true)}
    className={inteira ? 'w-full max-h-[60vh] object-contain bg-black' : 'perfil-qru-foto'} />
}

export default function PerfilPublicoPage() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const [fotoFalhou, setFotoFalhou] = useState(false)
  const [aberta, setAberta] = useState<Apreensao | null>(null)
  const q = useQuery<Perfil>({
    queryKey: ['perfil-publico', slug],
    queryFn: async () => (await api.get<Perfil>(`/public/perfil/${encodeURIComponent(slug)}`)).data,
    retry: (n, e) => n < 1 && !(isAxiosError(e) && e.response?.status === 404),
  })

  const voltar = () => (window.history.length > 1 ? navigate(-1) : navigate('/'))
  const p = q.data
  const fundo = p ? resolveBanner(p.banner, p.posicao) : null

  return (
    <div className="perfil-page">
      <header className="perfil-banner">
        {fundo && (fundo.img || p?.banner) && (
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
                <h1>{p.nome}{p.emojis?.length ? <span className="perfil-emojis" aria-hidden="true">{p.emojis.join(' ')}</span> : null}</h1>
                <span className="perfil-nivel">Nv. {p.nivel > 0 ? p.nivel : '—'}</span>
              </div>
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
            <section className="perfil-resumo" aria-labelledby="perfil-apreensoes-titulo">
              <div className="perfil-periodos">
                <div><span>Últimos 7 dias</span><strong>{p.apreensoes.d7}</strong></div>
                <div><span>Últimos 15 dias</span><strong>{p.apreensoes.d15}</strong></div>
                <div><span>Últimos 30 dias</span><strong>{p.apreensoes.d30}</strong></div>
              </div>
              <header className="perfil-resumo-titulo">
                <span>Registros aprovados</span>
                <h2 id="perfil-apreensoes-titulo">Apreensões</h2>
              </header>
            </section>

            <section className="perfil-bloco">
              <h2 className="perfil-bloco-titulo">QRUs</h2>
              {p.ultimasApreensoes.length === 0 ? (
                <div className="perfil-vazio">Nenhuma QRU aprovada ainda.</div>
              ) : (
                <div className="perfil-qrus">
                  {p.ultimasApreensoes.map(a => (
                    <button key={a.id} className="perfil-qru" onClick={() => setAberta(a)} aria-label={`Abrir boletim de ${a.tipo}`}>
                      <FotoQru src={a.imagem} alt="" />
                      <span className="perfil-qru-nome" title={a.tipo}>{a.tipo}</span>
                      <span className="perfil-qru-rodape"><span>{dataBR(a.data)}</span><Badge resultado={a.resultado} /></span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <ModalOverlay open={!!aberta} onClose={() => setAberta(null)} title="BOLETIM DA QRU" maxWidth="max-w-xl">
              {aberta && (
                <div className="space-y-4">
                  {aberta.imagem && linkSeguro(aberta.imagem) ? (
                    <a href={aberta.imagem} target="_blank" rel="noopener noreferrer" title="Abrir imagem em tamanho real" className="block rounded-lg overflow-hidden border border-bdr">
                      <FotoQru src={aberta.imagem} alt={`Boletim de ${aberta.tipo}`} inteira />
                    </a>
                  ) : (
                    <div className="rounded-lg border border-bdr py-8 text-center text-xs text-txt3">Sem foto do boletim</div>
                  )}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold text-txt break-words">{aberta.tipo}</h3>
                      <p className="text-xs text-txt2">{dataBR(aberta.data)}</p>
                    </div>
                    <Badge resultado={aberta.resultado} />
                  </div>
                </div>
              )}
            </ModalOverlay>

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
