import { useEffect, useId, useRef, useState } from 'react'
import { HelpCircle, X } from 'lucide-react'

interface Props {
  titulo: string
  /** Passo a passo (cada item vira uma linha numerada). */
  passos: string[]
  /** Dicas soltas abaixo dos passos (opcional). */
  dicas?: string[]
  /** Lado em que o balão abre (padrão: alinhado à esquerda do "?"). */
  lado?: 'esquerda' | 'direita'
  tamanho?: number
}

/**
 * "?" explicativo: um clique abre um balão com o passo a passo de como funciona.
 * Fecha no X, clicando fora ou com Esc. Usado na barra do topo (todo módulo) e em partes das páginas.
 */
export default function Ajuda({ titulo, passos, dicas = [], lado = 'esquerda', tamanho = 16 }: Props) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto])

  return (
    <div className="relative inline-flex" ref={ref}>
      <button type="button" onClick={() => setAberto(a => !a)} aria-expanded={aberto} aria-controls={id}
        title={`Como funciona: ${titulo}`} aria-label={`Como funciona: ${titulo}`}
        className={`rounded-full p-1 transition-colors ${aberto ? 'text-gold3 bg-gold/15' : 'text-txt3 hover:text-gold3 hover:bg-gold/10'}`}>
        <HelpCircle size={tamanho} />
      </button>
      {aberto && (
        <div id={id} role="dialog" aria-label={`Como funciona: ${titulo}`}
          className={`absolute top-full mt-2 z-60 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-gold/30 bg-card shadow-2xl p-4 text-left normal-case tracking-normal ${lado === 'direita' ? 'right-0' : 'left-0'}`}>
          <div className="flex items-start gap-2 mb-3">
            <HelpCircle size={16} className="text-gold3 shrink-0 mt-0.5" />
            <p className="flex-1 text-sm font-semibold text-txt">{titulo}</p>
            <button type="button" onClick={() => setAberto(false)} aria-label="Fechar ajuda" className="p-0.5 rounded text-txt3 hover:text-txt"><X size={14} /></button>
          </div>
          <ol className="space-y-2">
            {passos.map((p, i) => (
              <li key={i} className="flex gap-2 text-xs text-txt2 leading-relaxed">
                <span className="w-5 h-5 rounded-full bg-gold/15 text-gold3 text-[10px] font-mono flex items-center justify-center shrink-0">{i + 1}</span>
                <span>{p}</span>
              </li>
            ))}
          </ol>
          {dicas.length > 0 && (
            <ul className="mt-3 pt-3 border-t border-bdr space-y-1.5">
              {dicas.map((d, i) => <li key={i} className="text-[11px] text-txt3 leading-relaxed">• {d}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
