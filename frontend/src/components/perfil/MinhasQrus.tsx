import { useState } from 'react'
import { FileText, ImageOff, Hourglass, MapPin, UserRound, Users, CalendarDays, ExternalLink } from 'lucide-react'
import { useMinhasQrus, type MinhaQru } from '@/hooks/useMe'
import ModalOverlay from '@/components/ui/ModalOverlay'
import { linkSeguro } from '@/lib/plataformas'

type Filtro = 'todas' | 'convencional' | 'fechado'
const POR_PAGINA = 24

const dataBR = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10).split('-').reverse().join('/') : '—')

function Resultado({ q }: { q: MinhaQru }) {
  if (q.status === 'pendente') return <span className="inline-flex items-center gap-1 text-[10px] font-mono text-orange-400"><Hourglass size={10} /> Aguardando</span>
  if (!q.resultado) return <span className="text-[10px] font-mono text-blue">Apreensão</span>
  const cor = q.resultado === 'Vitória' ? 'text-green' : q.resultado === 'Derrota' ? 'text-red' : 'text-txt2'
  return <span className={`text-[10px] font-mono ${cor}`}>{q.resultado === 'Empate' ? 'Encerrado' : q.resultado}</span>
}

function Foto({ src, alt, className, inteira = false }: { src: string | null; alt: string; className: string; inteira?: boolean }) {
  const [falhou, setFalhou] = useState(false)
  if (!src || falhou || !linkSeguro(src)) {
    return <div className={`${className} flex items-center justify-center bg-card2 text-txt3`}><ImageOff size={20} /></div>
  }
  return <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFalhou(true)} className={`${className} ${inteira ? 'object-contain' : 'object-cover'}`} />
}

/** QRUs do próprio membro: foto pequena + nome; o clique abre o boletim num modal. */
export default function MinhasQrus({ ativo }: { ativo: boolean }) {
  const { data: qrus, isLoading, isError } = useMinhasQrus(ativo)
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [limite, setLimite] = useState(POR_PAGINA)
  const [aberta, setAberta] = useState<MinhaQru | null>(null)

  const lista = (qrus ?? []).filter(q => filtro === 'todas' || q.tipo === filtro)

  return (
    <div className="bg-card border border-bdr rounded-xl p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <h2 className="text-sm font-semibold text-txt flex items-center gap-2"><FileText size={16} className="text-gold" /> Minhas QRUs {qrus && <span className="text-txt3 font-mono text-xs">({qrus.length})</span>}</h2>
        <div className="flex gap-1">
          {([['todas', 'Todas'], ['convencional', 'Apreensões'], ['fechado', 'Ações']] as const).map(([id, nome]) => (
            <button key={id} onClick={() => { setFiltro(id); setLimite(POR_PAGINA) }} aria-pressed={filtro === id}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-colors ${filtro === id ? 'bg-gold/15 text-gold3 border border-gold/40' : 'text-txt2 border border-bdr2 hover:text-txt'}`}>{nome}</button>
          ))}
        </div>
      </div>

      {isLoading ? <p className="text-xs text-txt3 py-8 text-center">Carregando QRUs…</p>
        : isError ? <p className="text-xs text-red py-8 text-center">Não foi possível carregar suas QRUs.</p>
        : lista.length === 0 ? <p className="text-xs text-txt3 py-8 text-center">Nenhuma QRU registrada com você ainda.</p>
        : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {lista.slice(0, limite).map(q => (
                <button key={q.id} onClick={() => setAberta(q)} aria-label={`Abrir boletim de ${q.qru}`}
                  className="group text-left rounded-lg overflow-hidden border border-bdr bg-card2 hover:border-gold/50 transition-colors">
                  <Foto src={q.imagem} alt="" className="w-full h-24 group-hover:opacity-90 transition-opacity" />
                  <div className="p-2">
                    <p className="text-xs font-medium text-txt truncate" title={q.qru}>{q.qru}</p>
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <span className="text-[10px] font-mono text-txt3">{dataBR(q.data)}</span>
                      <Resultado q={q} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
            {lista.length > limite && (
              <button onClick={() => setLimite(l => l + POR_PAGINA)} className="mt-3 w-full text-xs text-txt3 hover:text-gold3 font-mono transition-colors">Mostrar mais ({lista.length - limite})</button>
            )}
          </>
        )}

      <ModalOverlay open={!!aberta} onClose={() => setAberta(null)} title="BOLETIM DA QRU" maxWidth="max-w-xl">
        {aberta && (
          <div className="space-y-4">
            {aberta.imagem && linkSeguro(aberta.imagem) ? (
              <a href={aberta.imagem} target="_blank" rel="noopener noreferrer" title="Abrir imagem em tamanho real" className="block rounded-lg overflow-hidden border border-bdr">
                <Foto src={aberta.imagem} alt={`Boletim de ${aberta.qru}`} className="w-full max-h-[50vh] bg-black" inteira />
              </a>
            ) : (
              <div className="rounded-lg border border-bdr bg-card2 py-8 text-center text-xs text-txt3"><ImageOff size={20} className="mx-auto mb-2" /> Sem foto do boletim</div>
            )}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-txt break-words">{aberta.qru}</h3>
                <p className="text-xs text-txt2">{aberta.tipo === 'fechado' ? 'Ação' : 'Apreensão'}</p>
              </div>
              <Resultado q={aberta} />
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div><dt className="text-txt3 text-[11px] flex items-center gap-1"><CalendarDays size={11} /> Data</dt><dd className="text-txt">{dataBR(aberta.data)}</dd></div>
              <div><dt className="text-txt3 text-[11px] flex items-center gap-1"><UserRound size={11} /> Comandante</dt><dd className="text-txt break-words">{aberta.comandante || '—'}</dd></div>
              {aberta.local && <div className="sm:col-span-2"><dt className="text-txt3 text-[11px] flex items-center gap-1"><MapPin size={11} /> Local</dt><dd className="text-txt break-words">{aberta.local}</dd></div>}
            </dl>
            <div>
              <p className="text-txt3 text-[11px] flex items-center gap-1 mb-1.5"><Users size={11} /> Participantes ({aberta.participantes.length})</p>
              <ul className="flex flex-wrap gap-1.5">
                {aberta.participantes.map((p, i) => (
                  <li key={i} className="px-2 py-0.5 rounded-full border border-bdr2 bg-card2 text-[11px] text-txt2">
                    {p.patente && <span className="text-gold3 mr-1">{p.patente}</span>}{p.nome}{p.externo && <span className="text-txt3"> · externo</span>}
                  </li>
                ))}
              </ul>
            </div>
            {aberta.imagem && linkSeguro(aberta.imagem) && (
              <a href={aberta.imagem} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-txt3 hover:text-gold3"><ExternalLink size={12} /> Abrir foto em tamanho real</a>
            )}
          </div>
        )}
      </ModalOverlay>
    </div>
  )
}
