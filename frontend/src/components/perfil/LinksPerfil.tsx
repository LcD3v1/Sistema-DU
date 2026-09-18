import { ExternalLink } from 'lucide-react'
import { linkSeguro, plataformaDoLink } from '@/lib/plataformas'

export interface LinkExibido { rotulo: string; url: string; emoji?: string | null }

/** Links personalizados do perfil (TikTok, Instagram, Twitch…) como botões. */
export default function LinksPerfil({ links, className = '' }: { links: LinkExibido[]; className?: string }) {
  const validos = links.filter(l => linkSeguro(l.url))
  if (!validos.length) return null
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {validos.map((l, i) => {
        const p = plataformaDoLink(l.url)
        return (
          <a key={`${l.url}-${i}`} href={l.url} target="_blank" rel="noopener noreferrer nofollow ugc" title={l.url}
            className="inline-flex items-center gap-1.5 max-w-[14rem] px-3 py-1 rounded-full border bg-black/40 backdrop-blur text-white/90 text-xs hover:text-white transition-colors"
            style={{ borderColor: p.cor + '66' }}>
            <span aria-hidden="true">{l.emoji || p.emoji}</span>
            <span className="truncate">{l.rotulo}</span>
            <ExternalLink size={11} className="shrink-0 opacity-60" />
          </a>
        )
      })}
    </div>
  )
}
