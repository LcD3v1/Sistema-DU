import { useRef, useState } from 'react'
import { Upload, Link2, X, ImageIcon } from 'lucide-react'

import { ACEITA_FOTO, fotoComTeto, arquivoDoLink, mensagemErroFoto } from '@/lib/imagemArquivo'
import { linkSeguro } from '@/lib/plataformas'

/**
 * Campo de imagem OPCIONAL: enviar arquivo (qualquer imagem ou PDF) ou colar link http/https.
 * O arquivo é convertido no navegador (lado maior até `maxLado`) em PNG e vira data URL; o
 * servidor confere os bytes de novo. GIF pequeno segue como está (mantém a animação).
 */
const MAX_GIF = 900 * 1024

interface Props {
  rotulo: string
  valor: string | null
  onChange: (valor: string | null) => void
  dica?: string
  maxLado?: number
  onErro?: (msg: string) => void
  /** Copia a imagem do link no NAVEGADOR (vira upload): necessário quando o Discord precisa da imagem em si (rodapé). */
  copiarLink?: boolean
  /** Teto em bytes (o servidor recusa acima de 1 MB): passou, comprime em WEBP e reduz até caber. */
  maxBytes?: number
}

export default function CampoImagem({ rotulo, valor, onChange, dica, maxLado = 512, onErro, copiarLink = false, maxBytes }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const ehLink = Boolean(valor && !valor.startsWith('data:'))
  const [modo, setModo] = useState<'arquivo' | 'link'>(ehLink ? 'link' : 'arquivo')
  const [copiando, setCopiando] = useState(false)

  const converter = (arquivo: File) => fotoComTeto(arquivo, { maxLado, maxBytes, manterGifAte: MAX_GIF })

  /** Ao sair do campo de link: o navegador baixa a imagem e ela vira arquivo (data URL). Se o site não deixar, fica o link. */
  async function copiarDoLink() {
    if (!copiarLink || !valor || valor.startsWith('data:') || !linkSeguro(valor)) return
    setCopiando(true)
    try {
      const dataUrl = await converter(await arquivoDoLink(valor, { maxLado, formato: 'image/png' }))
      onChange(dataUrl)
      setModo('arquivo')
    } catch (e) {
      onErro?.(`${mensagemErroFoto(e)} Envie a imagem pelo botão Enviar.`)
    } finally { setCopiando(false) }
  }

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return
    try {
      onChange(await converter(arquivo))
    } catch (e) {
      onErro?.(mensagemErroFoto(e))
    }
  }

  const aba = (m: 'arquivo' | 'link', Icone: typeof Upload, texto: string) => (
    <button type="button" onClick={() => setModo(m)} aria-pressed={modo === m}
      className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono transition-colors ${modo === m ? 'bg-gold/15 text-gold3' : 'text-txt3 hover:text-txt'}`}>
      <Icone size={12} /> {texto}
    </button>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono text-[10px] text-txt2 tracking-[0.18em] uppercase">{rotulo} <span className="normal-case tracking-normal text-txt3">(opcional)</span></span>
        <div className="flex gap-1">{aba('arquivo', Upload, 'Enviar')}{aba('link', Link2, 'Link')}</div>
      </div>
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-lg bg-card2 flex items-center justify-center overflow-hidden shrink-0">
          {valor ? <img src={valor} alt="" referrerPolicy="no-referrer" className="w-full h-full object-contain" /> : <ImageIcon size={18} className="text-txt3" />}
        </div>
        <div className="flex-1 min-w-0">
          {modo === 'arquivo' ? (
            <>
              <input ref={input} type="file" accept={ACEITA_FOTO} className="hidden"
                onChange={e => { void escolher(e.target.files?.[0]); e.target.value = '' }} />
              <button type="button" onClick={() => input.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-card2 hover:bg-card text-sm text-txt2 hover:text-txt transition-colors">
                <Upload size={14} /> {valor?.startsWith('data:') ? 'Trocar imagem' : 'Escolher imagem'}
              </button>
            </>
          ) : (
            <input value={ehLink ? valor! : ''} onChange={e => onChange(e.target.value.trim() || null)} placeholder={copiando ? 'Copiando a imagem…' : 'https://…/imagem.png'} maxLength={2048}
              onBlur={() => void copiarDoLink()} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} disabled={copiando}
              aria-label={`Link: ${rotulo}`}
              className="w-full bg-card2 rounded-lg px-3 py-2 text-sm text-txt placeholder-txt3 outline-none focus:ring-1 focus:ring-gold" />
          )}
          {dica && <p className="text-[11px] text-txt3 mt-1">{dica}</p>}
        </div>
        {valor && (
          <button type="button" onClick={() => onChange(null)} title="Remover imagem" aria-label={`Remover ${rotulo}`}
            className="p-1.5 rounded text-txt3 hover:text-red hover:bg-red/10"><X size={15} /></button>
        )}
      </div>
    </div>
  )
}
