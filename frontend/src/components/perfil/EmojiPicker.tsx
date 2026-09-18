import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'

/**
 * Seletor de emoji com busca pelo nome (em português): todos os emojis Unicode,
 * os mesmos que aparecem no Discord, WhatsApp, Instagram etc. Os dados (~580 KB)
 * só são baixados quando o seletor abre pela primeira vez.
 */
interface EmojiDado { unicode: string; label: string; tags?: string[]; group?: number; order?: number }
interface Emoji { unicode: string; label: string; busca: string; grupo: number; ordem: number }

const GRUPOS: [number, string, string][] = [
  [0, '😀', 'Carinhas'], [1, '👋', 'Pessoas'], [3, '🐶', 'Animais e natureza'], [4, '🍔', 'Comida'],
  [5, '🚓', 'Viagens e lugares'], [6, '⚽', 'Atividades'], [7, '💡', 'Objetos'], [8, '❤️', 'Símbolos'], [9, '🏁', 'Bandeiras'],
]

const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

let cache: Promise<Emoji[]> | null = null
function carregarEmojis(): Promise<Emoji[]> {
  cache ??= import('emojibase-data/pt/compact.json')
    .then(m => (m.default as EmojiDado[])
      .filter(e => e.group !== undefined && e.group !== 2)   // 2 = componentes (tons de pele soltos etc.)
      .map(e => ({ unicode: e.unicode, label: e.label, grupo: e.group!, ordem: e.order ?? 0,
        busca: normalizar([e.label, ...(e.tags ?? [])].join(' ')) }))
      .sort((a, b) => a.ordem - b.ordem))
    .catch(err => { cache = null; throw err })
  return cache
}

const LIMITE = 400

export default function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const [emojis, setEmojis] = useState<Emoji[] | null>(null)
  const [falhou, setFalhou] = useState(false)
  const [busca, setBusca] = useState('')
  const [grupo, setGrupo] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let ativo = true
    carregarEmojis().then(e => { if (ativo) setEmojis(e) }).catch(() => { if (ativo) setFalhou(true) })
    return () => { ativo = false }
  }, [])

  useEffect(() => {
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc, true)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc, true) }
  }, [onClose])

  const lista = useMemo(() => {
    if (!emojis) return []
    const termos = normalizar(busca.trim()).split(/\s+/).filter(Boolean)
    if (!termos.length) return emojis.filter(e => e.grupo === grupo)
    return emojis.filter(e => termos.every(t => e.busca.includes(t)))
  }, [emojis, busca, grupo])

  return (
    <div ref={ref} role="dialog" aria-label="Escolher emoji"
      className="absolute z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] bg-card border border-bdr2 rounded-xl shadow-2xl p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-txt3" />
          <input autoFocus value={busca} onChange={e => setBusca(e.target.value)} placeholder="Pesquisar emoji (ex.: fogo, polícia)"
            aria-label="Pesquisar emoji pelo nome"
            className="input-gold w-full bg-card2 border border-bdr2 rounded-lg pl-8 pr-2 py-1.5 text-xs text-txt" />
        </div>
        <button onClick={onClose} aria-label="Fechar" className="text-txt3 hover:text-txt"><X size={15} /></button>
      </div>
      {!busca.trim() && (
        <div className="flex gap-0.5 mb-2 overflow-x-auto">
          {GRUPOS.map(([id, icone, nome]) => (
            <button key={id} title={nome} aria-label={nome} aria-pressed={grupo === id} onClick={() => setGrupo(id)}
              className={`shrink-0 w-8 h-8 rounded-lg text-base transition-colors ${grupo === id ? 'bg-gold/20' : 'hover:bg-white/5'}`}>{icone}</button>
          ))}
        </div>
      )}
      <div className="h-56 overflow-y-auto overscroll-contain">
        {falhou ? <p className="text-xs text-red text-center py-8">Não foi possível carregar os emojis.</p>
          : !emojis ? <p className="text-xs text-txt3 text-center py-8">Carregando emojis…</p>
          : lista.length === 0 ? <p className="text-xs text-txt3 text-center py-8">Nenhum emoji com esse nome.</p>
          : (
            <div className="grid grid-cols-8 gap-0.5">
              {lista.slice(0, LIMITE).map(e => (
                <button key={e.unicode} title={e.label} aria-label={e.label} onClick={() => onPick(e.unicode)}
                  className="w-9 h-9 rounded-lg text-xl leading-none hover:bg-white/10 transition-colors">{e.unicode}</button>
              ))}
            </div>
          )}
        {lista.length > LIMITE && <p className="text-[10px] text-txt3 text-center mt-2">Refine a busca para ver mais.</p>}
      </div>
    </div>
  )
}
