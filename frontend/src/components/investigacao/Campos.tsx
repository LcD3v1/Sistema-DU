import { useMemo, useRef, useState } from 'react'
import {
  Paperclip, Upload, X, Link2, Plus, FileText, FileImage, FileArchive, FileSpreadsheet, Download, ExternalLink,
  Search, History, UserRound, ImagePlus, Loader2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMembros } from '@/hooks/useMembros'
import { useUIStore } from '@/store/uiStore'
import { linkSeguro } from '@/lib/plataformas'
import {
  enviarArquivo, abrirArquivo, baixarArquivo, useUrlArquivo, tamanhoLegivel, erroApi, normalizar,
  MAX_BYTES_ARQUIVO, ACEITA_ARQUIVOS, type ArquivoRef, type AreaArquivo, type LinkRegistro, type AlteracaoRegistro,
} from '@/hooks/useInvestigacao'
import type { Membro } from '@/types'

/** Peças de formulário e exibição comuns a Relatórios, Boletins, Inquéritos, Galeria e Cursos. */

export const INPUT = 'input-gold w-full bg-card2 border border-bdr2 rounded-lg px-3 py-2 text-sm text-txt'

export function Campo({ rotulo, dica, children, className = '' }: { rotulo: string; dica?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="font-mono text-[10px] text-txt2 tracking-wider uppercase">{rotulo}</label>
      {children}
      {dica && <p className="text-[11px] text-txt3">{dica}</p>}
    </div>
  )
}

export function CabecalhoPagina({ sobretitulo, titulo, icone: Icone, descricao, children }: {
  sobretitulo: string; titulo: string; icone: LucideIcon; descricao?: string; children?: React.ReactNode
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-bdr bg-card mb-6">
      <div aria-hidden className="absolute inset-0 bg-cover bg-center opacity-35" style={{ backgroundImage: 'url(/media/du/banner-investigacao.webp)' }} />
      <div aria-hidden className="absolute inset-0 bg-linear-to-r from-bg via-bg/85 to-gold/10" />
      <div className="relative flex items-end justify-between flex-wrap gap-4 px-5 sm:px-7 py-6 sm:py-7">
        <div className="min-w-0">
          <p className="font-mono text-[10px] text-gold3 tracking-[0.25em] uppercase mb-1">{sobretitulo}</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-txt flex items-center gap-2.5">
            <Icone size={26} className="text-gold2 shrink-0" /> {titulo}
          </h1>
          {descricao && <p className="text-sm text-txt2 mt-1.5 max-w-2xl">{descricao}</p>}
        </div>
        {children && <div className="flex gap-2 flex-wrap">{children}</div>}
      </div>
    </div>
  )
}

export function BotaoPrimario({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props}
      className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-gold text-white text-sm font-medium hover:bg-gold2 transition-colors disabled:opacity-50 ${props.className ?? ''}`}>
      {children}
    </button>
  )
}

export function BotaoSecundario({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props}
      className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-bdr2 text-txt2 text-sm hover:text-txt hover:border-gold/40 transition-colors disabled:opacity-50 ${props.className ?? ''}`}>
      {children}
    </button>
  )
}

export function Selo({ cor, children }: { cor: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono border"
      style={{ color: cor, borderColor: `${cor}55`, background: `${cor}14` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: cor }} />{children}
    </span>
  )
}

export function Vazio({ icone: Icone, children }: { icone: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="border border-bdr rounded-xl bg-card py-16 text-center">
      <Icone size={30} className="text-txt3 mx-auto mb-3" />
      <p className="text-txt2 text-sm">{children}</p>
    </div>
  )
}

// ── Arquivos ─────────────────────────────────────────────────────────────────

function iconeDoArquivo(mime: string): LucideIcon {
  if (mime.startsWith('image/')) return FileImage
  if (/zip/.test(mime)) return FileArchive
  if (/sheet|excel|csv/.test(mime)) return FileSpreadsheet
  return FileText
}

/** Envia vários arquivos do computador e mantém a lista do registro. */
export function EditorArquivos({ area, arquivos, onChange, aceita = ACEITA_ARQUIVOS, max = 20 }: {
  area: AreaArquivo; arquivos: ArquivoRef[]; onChange: (a: ArquivoRef[]) => void; aceita?: string; max?: number
}) {
  const { addToast } = useUIStore()
  const input = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(0)
  const [arrastando, setArrastando] = useState(false)

  async function enviar(lista: FileList | File[]) {
    const files = [...lista].slice(0, Math.max(0, max - arquivos.length))
    if (files.length === 0) { addToast('error', `No máximo ${max} arquivos.`); return }
    let atual = arquivos
    for (const f of files) {
      if (f.size > MAX_BYTES_ARQUIVO) { addToast('error', `"${f.name}" passa de 10 MB.`); continue }
      setEnviando(n => n + 1)
      try {
        const ref = await enviarArquivo(f, area)
        atual = [...atual, ref]
        onChange(atual)
      } catch (e) {
        addToast('error', `"${f.name}": ${erroApi(e, 'não foi possível enviar.')}`)
      } finally { setEnviando(n => n - 1) }
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={() => input.current?.click()}
        onDragOver={e => { e.preventDefault(); setArrastando(true) }} onDragLeave={() => setArrastando(false)}
        onDrop={e => { e.preventDefault(); setArrastando(false); if (e.dataTransfer.files.length) void enviar(e.dataTransfer.files) }}
        className={`w-full flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-4 text-sm transition-colors
          ${arrastando ? 'border-gold bg-gold/10 text-txt' : 'border-bdr2 text-txt2 hover:border-gold/50 hover:text-txt'}`}>
        {enviando > 0 ? <Loader2 size={18} className="animate-spin text-gold2" /> : <Upload size={18} className="text-gold2" />}
        <span>{enviando > 0 ? `Enviando ${enviando} arquivo(s)...` : 'Clique ou arraste arquivos do computador'}</span>
        <span className="text-[11px] text-txt3">PDF, documentos, planilhas, imagens, áudio e vídeo · até 10 MB cada</span>
      </button>
      <input ref={input} type="file" multiple accept={aceita} className="hidden"
        onChange={e => { if (e.target.files) void enviar(e.target.files); e.target.value = '' }} />
      {arquivos.length > 0 && (
        <ul className="space-y-1.5">
          {arquivos.map(a => {
            const Icone = iconeDoArquivo(a.mime)
            return (
              <li key={a.id} className="flex items-center gap-2 rounded-lg border border-bdr bg-card2 px-3 py-2">
                <Icone size={15} className="text-gold2 shrink-0" />
                <span className="flex-1 min-w-0 truncate text-sm text-txt">{a.nome}</span>
                <span className="text-[11px] text-txt3 font-mono">{tamanhoLegivel(a.tamanho)}</span>
                <button type="button" onClick={() => onChange(arquivos.filter(x => x.id !== a.id))} aria-label={`Remover ${a.nome}`}
                  className="p-1 text-txt3 hover:text-red"><X size={14} /></button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Lista de arquivos para consulta: abre PDF/imagem, baixa o resto. */
export function ListaArquivos({ arquivos }: { arquivos: ArquivoRef[] }) {
  const { addToast } = useUIStore()
  if (arquivos.length === 0) return null
  const falhou = () => addToast('error', 'Não foi possível abrir o arquivo.')
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {arquivos.map(a => {
        const Icone = iconeDoArquivo(a.mime)
        return (
          <li key={a.id} className="flex items-center gap-2 rounded-lg border border-bdr bg-card2 px-3 py-2">
            <Icone size={16} className="text-gold2 shrink-0" />
            <button type="button" onClick={() => abrirArquivo(a).catch(falhou)} className="flex-1 min-w-0 text-left">
              <span className="block truncate text-sm text-txt hover:text-gold3">{a.nome}</span>
              <span className="block text-[11px] text-txt3 font-mono">{tamanhoLegivel(a.tamanho)}</span>
            </button>
            <button type="button" onClick={() => baixarArquivo(a).catch(falhou)} aria-label={`Baixar ${a.nome}`} className="p-1.5 text-txt3 hover:text-gold3">
              <Download size={15} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** Imagem enviada (protegida por login) exibida via blob. */
export function ImagemArquivo({ arquivo, alt, className = '' }: { arquivo: ArquivoRef; alt: string; className?: string }) {
  const { data: url, isError } = useUrlArquivo(arquivo)
  if (isError) return <div className={`${className} flex items-center justify-center bg-card2 text-txt3 text-xs`}>Imagem indisponível</div>
  if (!url) return <div className={`${className} animate-pulse bg-card2`} />
  return <img src={url} alt={alt} className={`${className} object-cover`} decoding="async" />
}

// ── Links ────────────────────────────────────────────────────────────────────

export function EditorLinks({ links, onChange, placeholder = 'Ex.: Laudo pericial, vídeo da câmera…' }: {
  links: LinkRegistro[]; onChange: (l: LinkRegistro[]) => void; placeholder?: string
}) {
  const [rotulo, setRotulo] = useState('')
  const [url, setUrl] = useState('')
  const valido = linkSeguro(url.trim())
  function adicionar() {
    if (!valido) return
    onChange([...links, { rotulo: rotulo.trim(), url: url.trim() }])
    setRotulo(''); setUrl('')
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <input value={rotulo} maxLength={60} onChange={e => setRotulo(e.target.value)} placeholder={placeholder} className={`${INPUT} sm:w-56`} />
        <div className="relative flex-1">
          <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt3" />
          <input value={url} maxLength={2048} inputMode="url" onChange={e => setUrl(e.target.value)} placeholder="https://..."
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionar() } }}
            className={`${INPUT} pl-9 font-mono ${url && !valido ? 'border-red/60' : ''}`} />
        </div>
        <BotaoSecundario type="button" onClick={adicionar} disabled={!valido}><Plus size={14} /> Adicionar</BotaoSecundario>
      </div>
      {links.length > 0 && (
        <ul className="space-y-1.5">
          {links.map((l, i) => (
            <li key={`${l.url}-${i}`} className="flex items-center gap-2 rounded-lg border border-bdr bg-card2 px-3 py-2 text-sm">
              <Link2 size={14} className="text-gold2 shrink-0" />
              <span className="text-txt shrink-0 max-w-[40%] truncate">{l.rotulo || 'Link'}</span>
              <span className="flex-1 min-w-0 truncate font-mono text-[12px] text-txt3">{l.url}</span>
              <button type="button" onClick={() => onChange(links.filter((_, j) => j !== i))} aria-label="Remover link" className="p-1 text-txt3 hover:text-red"><X size={14} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function ListaLinks({ links }: { links: LinkRegistro[] }) {
  const seguros = links.filter(l => linkSeguro(l.url))
  if (seguros.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-2">
      {seguros.map((l, i) => (
        <li key={`${l.url}-${i}`}>
          <a href={l.url} target="_blank" rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-1.5 rounded-lg border border-bdr2 bg-card2 px-3 py-1.5 text-sm text-txt2 hover:text-gold3 hover:border-gold/40">
            <Link2 size={13} /> {l.rotulo || new URL(l.url).hostname} <ExternalLink size={11} className="opacity-60" />
          </a>
        </li>
      ))}
    </ul>
  )
}

/** Vários links de imagem (anexos do boletim), com miniatura. */
export function EditorImagens({ imagens, onChange }: { imagens: string[]; onChange: (i: string[]) => void }) {
  const [url, setUrl] = useState('')
  const valido = linkSeguro(url.trim())
  function adicionar() {
    if (!valido) return
    onChange([...imagens, url.trim()]); setUrl('')
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <ImagePlus size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt3" />
          <input value={url} maxLength={2048} inputMode="url" onChange={e => setUrl(e.target.value)} placeholder="Cole o link da imagem (https://...)"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionar() } }}
            className={`${INPUT} pl-9 font-mono ${url && !valido ? 'border-red/60' : ''}`} />
        </div>
        <BotaoSecundario type="button" onClick={adicionar} disabled={!valido}><Plus size={14} /> Adicionar</BotaoSecundario>
      </div>
      {imagens.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {imagens.map((src, i) => (
            <div key={`${src}-${i}`} className="relative group aspect-square rounded-lg overflow-hidden border border-bdr bg-card2">
              <img src={src} alt={`Imagem ${i + 1}`} referrerPolicy="no-referrer" loading="lazy" className="w-full h-full object-cover" />
              <button type="button" onClick={() => onChange(imagens.filter((_, j) => j !== i))} aria-label="Remover imagem"
                className="absolute top-1 right-1 p-1 rounded-md bg-black/70 text-white opacity-80 hover:opacity-100"><X size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Investigadores ───────────────────────────────────────────────────────────

const nomeMembro = (m: Pick<Membro, 'policial' | 'codinome'>) => m.codinome ? `${m.policial} "${m.codinome}"` : m.policial

export function SeletorInvestigadores({ valor, onChange }: { valor: number[]; onChange: (ids: number[]) => void }) {
  const { data: membros } = useMembros()
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(false)
  const porId = useMemo(() => new Map((membros ?? []).map(m => [m.id, m])), [membros])
  const opcoes = useMemo(() => {
    const t = normalizar(busca.trim())
    return (membros ?? [])
      .filter(m => !valor.includes(m.id) && m.status !== 'Inativo')
      .filter(m => !t || normalizar(`${m.policial} ${m.codinome ?? ''} ${m.badge}`).includes(t))
      .slice(0, 8)
  }, [membros, busca, valor])

  return (
    <div className="space-y-2">
      {valor.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {valor.map(id => {
            const m = porId.get(id)
            return (
              <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 pl-2.5 pr-1 py-0.5 text-xs text-txt">
                <UserRound size={12} className="text-gold3" /> {m ? nomeMembro(m) : `#${id}`}
                <button type="button" onClick={() => onChange(valor.filter(x => x !== id))} aria-label="Remover investigador" className="p-0.5 text-txt3 hover:text-red"><X size={12} /></button>
              </span>
            )
          })}
        </div>
      )}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt3" />
        <input value={busca} onChange={e => { setBusca(e.target.value); setAberto(true) }} onFocus={() => setAberto(true)}
          onBlur={() => setTimeout(() => setAberto(false), 150)} placeholder="Buscar investigador por nome, codinome ou distintivo"
          className={`${INPUT} pl-9`} />
        {aberto && opcoes.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full rounded-lg border border-bdr2 bg-card shadow-2xl overflow-hidden">
            {opcoes.map(m => (
              <li key={m.id}>
                <button type="button" onMouseDown={e => e.preventDefault()}
                  onClick={() => { onChange([...valor, m.id]); setBusca('') }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-txt2 hover:bg-gold/10 hover:text-txt">
                  <UserRound size={13} className="text-txt3" />
                  <span className="flex-1 truncate">{m.policial}{m.codinome && <span className="text-gold3"> “{m.codinome}”</span>}</span>
                  <span className="text-[11px] font-mono text-txt3">{m.patenteInterna || m.patenteDPD}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export function NomesInvestigadores({ ids }: { ids: number[] }) {
  const { data: membros } = useMembros()
  const porId = useMemo(() => new Map((membros ?? []).map(m => [m.id, m])), [membros])
  if (ids.length === 0) return <span className="text-txt3 text-sm">—</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {ids.map(id => {
        const m = porId.get(id)
        return (
          <span key={id} className="inline-flex items-center gap-1 rounded-full border border-bdr2 bg-card2 px-2.5 py-0.5 text-xs text-txt">
            <UserRound size={11} className="text-gold3" />{m ? m.policial : `#${id}`}{m?.codinome && <span className="text-gold3">“{m.codinome}”</span>}
          </span>
        )
      })}
    </div>
  )
}

// ── Histórico ────────────────────────────────────────────────────────────────

const ROTULO_ACAO: Record<AlteracaoRegistro['acao'], string> = { criado: 'Registrado', editado: 'Editado', status: 'Status' }

export function HistoricoRegistro({ historico }: { historico: AlteracaoRegistro[] }) {
  if (historico.length === 0) return null
  return (
    <details className="group rounded-lg border border-bdr bg-card2/60">
      <summary className="cursor-pointer list-none flex items-center gap-2 px-3 py-2 text-xs font-mono uppercase tracking-wider text-txt2 hover:text-txt">
        <History size={13} className="text-gold2" /> Histórico de alterações ({historico.length})
      </summary>
      <ol className="px-3 pb-3 space-y-1.5">
        {[...historico].reverse().map((h, i) => (
          <li key={i} className="flex gap-2 text-xs">
            <span className="font-mono text-txt3 shrink-0">{new Date(h.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
            <span className="text-txt2"><strong className="text-txt font-medium">{ROTULO_ACAO[h.acao]}</strong> por {h.por}{h.detalhe ? ` · ${h.detalhe}` : ''}</span>
          </li>
        ))}
      </ol>
    </details>
  )
}

export function Secao({ titulo, icone: Icone = Paperclip, children }: { titulo: string; icone?: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="flex items-center gap-1.5 font-mono text-[10px] text-txt2 tracking-[0.18em] uppercase"><Icone size={12} className="text-gold2" /> {titulo}</h4>
      {children}
    </section>
  )
}
