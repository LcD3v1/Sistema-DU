import { Play, ExternalLink } from 'lucide-react'
import { useUrlArquivo, type ArquivoRef } from '@/hooks/useInvestigacao'

/** Vídeo enviado: baixado pelo backend (com a sessão) e tocado aqui mesmo. */
export function VideoArquivo({ arquivo, className = '' }: { arquivo: ArquivoRef; className?: string }) {
  const { data: url, isError } = useUrlArquivo(arquivo)
  if (isError) return <div className={`${className} flex items-center justify-center bg-card2 text-txt3 text-xs p-4`}>Vídeo indisponível</div>
  if (!url) return <div className={`${className} animate-pulse bg-card2 aspect-video`} />
  return <video src={url} controls preload="metadata" playsInline className={`${className} bg-black`} />
}

/** ID do YouTube (youtu.be, watch?v=, shorts, embed) para mostrar a miniatura. */
function idYoutube(link: string): string | null {
  try {
    const u = new URL(link)
    const host = u.hostname.replace(/^www\.|^m\./, '')
    let id: string | null = null
    if (host === 'youtu.be') id = u.pathname.slice(1)
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') id = u.searchParams.get('v') ?? (/^\/(shorts|embed|live)\/([\w-]+)/.exec(u.pathname)?.[2] ?? null)
    return id && /^[\w-]{6,20}$/.test(id) ? id : null
  } catch { return null }
}

/** Link de vídeo: cartão com miniatura (YouTube) que abre o vídeo em outra aba para quem recebeu. */
export function CartaoLinkVideo({ link }: { link: string }) {
  const yt = idYoutube(link)
  let host = 'vídeo'
  try { host = new URL(link).hostname.replace(/^www\./, '') } catch { /* link já validado */ }
  return (
    <a href={link} target="_blank" rel="noopener noreferrer" title="Abrir o vídeo"
      className="block my-1 rounded-lg overflow-hidden bg-black/40 ring-1 ring-bdrg hover:ring-gold/60 transition">
      <span className="relative block aspect-video bg-card2">
        {yt && <img src={`https://i.ytimg.com/vi/${yt}/hqdefault.jpg`} alt="" referrerPolicy="no-referrer" loading="lazy" className="w-full h-full object-cover" />}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-12 h-12 rounded-full bg-gold/90 text-white flex items-center justify-center shadow-lg"><Play size={22} className="ml-0.5" fill="currentColor" /></span>
        </span>
      </span>
      <span className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-txt2"><ExternalLink size={11} /> <span className="truncate">{yt ? 'YouTube' : host} · toque para assistir</span></span>
    </a>
  )
}
