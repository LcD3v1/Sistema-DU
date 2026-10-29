import { useRef, useState } from 'react'
import { Upload, Link2, Trash2, ImageIcon, AlignLeft, AlignRight, Maximize2 } from 'lucide-react'
import Ajuda from '@/components/ui/Ajuda'
import { ACEITA_FOTO, fotoComTeto, mensagemErroFoto } from '@/lib/imagemArquivo'
import { linkSeguro } from '@/lib/plataformas'
import { MAX_IMAGENS_PAINEL, MAX_BYTES_IMAGEM, type ImagemPainel, type PosicaoImagem } from '@/lib/imagensPainel'

interface Props {
  imagens: ImagemPainel[]
  posicoes: PosicaoImagem[]
  onChange: (imagens: ImagemPainel[]) => void
  onErro: (msg: string) => void
}

/**
 * Imagens do painel: o botão de enviar já fica à vista (no topo), com o "?" explicando.
 * Cada imagem enviada entra na lista com a miniatura e a posição no painel (começa no topo).
 */
export default function ImagensPainel({ imagens, posicoes, onChange, onErro }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [link, setLink] = useState('')
  const [enviando, setEnviando] = useState(false)
  const cheio = imagens.length >= MAX_IMAGENS_PAINEL
  const primeira = posicoes[0]?.valor ?? 'topo'
  const trocar = (i: number, parcial: Partial<ImagemPainel>) => onChange(imagens.map((x, k) => (k === i ? { ...x, ...parcial } : x)))

  async function enviar(arquivos: FileList | null) {
    if (!arquivos?.length) return
    const livres = MAX_IMAGENS_PAINEL - imagens.length
    if (arquivos.length > livres) onErro(`Cabem só mais ${livres} imagem(ns) neste painel (máximo ${MAX_IMAGENS_PAINEL}).`)
    setEnviando(true)
    const novas: ImagemPainel[] = []
    for (const arquivo of [...arquivos].slice(0, livres)) {
      try { novas.push({ posicao: primeira, url: await fotoComTeto(arquivo, { maxLado: 1024, maxBytes: MAX_BYTES_IMAGEM, manterGifAte: 900 * 1024 }) }) }
      catch (e) { onErro(mensagemErroFoto(e)) }
    }
    setEnviando(false)
    if (novas.length) onChange([...imagens, ...novas])
  }

  function adicionarLink() {
    const url = link.trim()
    if (!linkSeguro(url)) { onErro('Link inválido: cole um endereço http:// ou https:// de uma imagem.'); return }
    onChange([...imagens, { posicao: primeira, url }])
    setLink('')
  }

  return (
    <div className="space-y-3">
      {/* Envio sempre à vista */}
      <div className="flex items-start gap-2">
        <div className="flex-1 grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)] items-center">
          <input ref={input} type="file" accept={ACEITA_FOTO} multiple className="hidden"
            onChange={e => { void enviar(e.target.files); e.target.value = '' }} />
          <button type="button" onClick={() => input.current?.click()} disabled={cheio || enviando}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gold hover:bg-gold2 text-white text-sm font-medium transition-colors disabled:opacity-40">
            <Upload size={15} /> {enviando ? 'Preparando…' : 'Enviar imagem'}
          </button>
          <div className="flex gap-2 min-w-0">
            <div className="relative flex-1 min-w-0">
              <Link2 size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-txt3" />
              <input value={link} onChange={e => setLink(e.target.value)} disabled={cheio} maxLength={2048}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarLink() } }}
                placeholder="ou cole o link de uma imagem" aria-label="Link de uma imagem"
                className="w-full bg-card2 rounded-lg pl-8 pr-3 py-2.5 text-sm text-txt placeholder-txt3 outline-none focus:ring-1 focus:ring-gold disabled:opacity-40" />
            </div>
            <button type="button" onClick={adicionarLink} disabled={cheio || !link.trim()}
              className="px-3 py-2 rounded-lg bg-card2 text-sm text-txt2 hover:text-txt disabled:opacity-40">Adicionar</button>
          </div>
        </div>
        <Ajuda titulo="Imagens do painel" lado="direita" tamanho={18}
          passos={[
            'Clique em "Enviar imagem" e escolha o arquivo (ou cole o link de uma imagem e clique em Adicionar).',
            'A imagem aparece na lista abaixo. Em "Posição", escolha em que ponto do painel ela fica.',
            'Escolha o lado: largura toda, ou metade do painel à esquerda ou à direita.',
            'Clique em Salvar: o painel é publicado no Discord com as imagens.',
          ]}
          dicas={[
            `Até ${MAX_IMAGENS_PAINEL} imagens por painel. Duas na mesma posição ficam lado a lado (aí o lado não se aplica).`,
            'Arquivos grandes são comprimidos sozinhos (PNG, JPG, WEBP, GIF ou PDF).',
            'Para tirar uma imagem, clique na lixeira.',
          ]} />
      </div>
      <p className="text-[11px] text-txt3">{imagens.length}/{MAX_IMAGENS_PAINEL} imagens · novas entram em "{posicoes[0]?.rotulo ?? 'Topo'}"; troque a posição na lista.</p>

      {/* Imagens adicionadas: miniatura + posição */}
      {imagens.length > 0 && (
        <ol className="space-y-2">
          {imagens.map((img, i) => (
            <li key={i} className="flex items-center gap-3 bg-card2 rounded-lg p-2">
              <div className="w-16 h-12 rounded-md bg-card overflow-hidden flex items-center justify-center shrink-0">
                {img.url ? <img src={img.url} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" /> : <ImageIcon size={16} className="text-txt3" />}
              </div>
              <div className="flex-1 min-w-0">
                <label htmlFor={`img-pos-${i}`} className="block font-mono text-[10px] text-txt2 tracking-[0.18em] uppercase mb-1">Posição da imagem {i + 1}</label>
                <select id={`img-pos-${i}`} value={img.posicao} onChange={e => trocar(i, { posicao: e.target.value })}
                  className="w-full bg-card rounded px-2 py-1.5 text-xs text-txt outline-none focus:ring-1 focus:ring-gold">
                  {posicoes.map(p => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
                  {!posicoes.some(p => p.valor === img.posicao) && <option value={img.posicao}>(posição removida — escolha outra)</option>}
                </select>
                {/* Lado: largura toda ou metade do painel à esquerda/direita */}
                <div className="flex gap-1 mt-1.5" role="radiogroup" aria-label={`Lado da imagem ${i + 1}`}>
                  {([[null, 'Largura toda', Maximize2], ['esquerda', 'Esquerda', AlignLeft], ['direita', 'Direita', AlignRight]] as const).map(([valor, rotulo, Icone]) => {
                    const ativo = (img.lado ?? null) === valor
                    return (
                      <button key={rotulo} type="button" role="radio" aria-checked={ativo} onClick={() => trocar(i, { lado: valor })}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors ${ativo ? 'bg-gold/20 text-gold3' : 'bg-card text-txt3 hover:text-txt'}`}>
                        <Icone size={12} /> {rotulo}
                      </button>
                    )
                  })}
                </div>
              </div>
              <button type="button" title="Remover imagem" aria-label={`Remover imagem ${i + 1}`} onClick={() => onChange(imagens.filter((_, k) => k !== i))}
                className="p-2 rounded text-txt2 hover:text-red hover:bg-red/10"><Trash2 size={15} /></button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
