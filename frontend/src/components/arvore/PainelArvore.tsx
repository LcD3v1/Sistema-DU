import { useEffect, useRef, useState } from 'react'
import { abrirArquivo } from '@/hooks/useInvestigacao'
import { ACEITA_FOTO, mensagemErroFoto } from '@/lib/imagemArquivo'
import { linkSeguro } from '@/lib/plataformas'
import { X, MessageSquare, FileText, Send, Phone, Users, Paperclip, Upload, Link2, Video, Film } from 'lucide-react'
import { useEnviarMensagem, enviarFotoArvore, enviarVideoArvore, copiarFotoDoLink, ACEITA_VIDEO, ErroVideo, type AnexoArvore, type ArvoreCompleta, type NoArvore, type FotoArvore as Foto } from '@/hooks/useArvores'
import { useUIStore } from '@/store/uiStore'
import FotoArvore from './FotoArvore'
import { VideoArquivo, CartaoLinkVideo } from './AnexoVideo'

const ehVideo = (a: AnexoArvore) => 'arquivo' in a && a.arquivo.mime.startsWith('video/')

type Erro = { response?: { data?: { error?: string } } }
const erroApi = (e: unknown, padrao: string) => (e as Erro)?.response?.data?.error ?? padrao
const hora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

/**
 * Painel do canto superior direito: "Dados" (todos os dados das pessoas da árvore, já preenchido —
 * base da documentação) e "Chat" da equipe naquela árvore.
 */
export default function PainelArvore({ arvore, aba, setAba, onFechar, onAbrirNo }: {
  arvore: ArvoreCompleta; aba: 'dados' | 'chat'; setAba: (a: 'dados' | 'chat') => void; onFechar: () => void; onAbrirNo: (n: NoArvore) => void
}) {
  const { addToast } = useUIStore()
  const enviar = useEnviarMensagem(arvore.id)
  const [texto, setTexto] = useState('')
  const [anexo, setAnexo] = useState<AnexoArvore | null>(null)
  const [menuClipe, setMenuClipe] = useState(false)
  const [pedindoLink, setPedindoLink] = useState<'imagem' | 'video' | false>(false)
  const [link, setLink] = useState('')
  const [subindo, setSubindo] = useState(false)
  const inputArquivo = useRef<HTMLInputElement>(null)
  const inputVideo = useRef<HTMLInputElement>(null)
  const fim = useRef<HTMLDivElement>(null)
  useEffect(() => { if (aba === 'chat') fim.current?.scrollIntoView({ block: 'end' }) }, [aba, arvore.mensagens.length])

  function mandar() {
    const t = texto.trim()
    if (!t && !anexo) return
    enviar.mutate({ texto: t, anexo }, {
      onSuccess: () => { setTexto(''); setAnexo(null) },
      onError: e => addToast('error', erroApi(e, 'Não foi possível enviar.')),
    })
  }
  /** Clipe → foto do computador (qualquer imagem/PDF, convertida antes de subir). */
  async function anexarArquivo(arquivo: File | undefined) {
    if (!arquivo) return
    setSubindo(true)
    try { setAnexo(await enviarFotoArvore(arquivo)) }
    catch (e) { addToast('error', (e as Erro)?.response ? erroApi(e, 'Não foi possível enviar a foto.') : mensagemErroFoto(e)) }
    finally { setSubindo(false) }
  }
  /**
   * Clipe → link de imagem: o navegador baixa a imagem e ela vira foto guardada no sistema
   * (continua aqui mesmo se o link sair do ar). Se o site não deixar copiar, fica como link.
   */
  async function anexarLink() {
    const url = link.trim()
    if (!linkSeguro(url)) { addToast('error', `Cole um link http:// ou https:// de ${pedindoLink === 'video' ? 'vídeo' : 'imagem'}.`); return }
    // Link de vídeo: vai como link e quem recebe abre e assiste
    if (pedindoLink === 'video') { setAnexo({ video: url }); setLink(''); setPedindoLink(false); return }
    setLink(''); setPedindoLink(false); setSubindo(true)
    try {
      setAnexo(await copiarFotoDoLink(url))
    } catch (e) {
      if ((e as Erro)?.response) { addToast('error', erroApi(e, 'Não foi possível guardar a imagem.')); return }
      setAnexo({ url })
      addToast('error', 'O site desse link não deixa copiar a imagem: ela vai como link e some se o link sair do ar.')
    } finally { setSubindo(false) }
  }
  /** Clipe → vídeo do computador (MP4/MOV até 1 minuto). */
  async function anexarVideo(arquivo: File | undefined) {
    if (!arquivo) return
    setSubindo(true)
    try { setAnexo(await enviarVideoArvore(arquivo)) }
    catch (e) { addToast('error', e instanceof ErroVideo ? e.message : erroApi(e, 'Não foi possível enviar o vídeo.')) }
    finally { setSubindo(false) }
  }
  const abrirAnexo = (f: Foto) => ('arquivo' in f ? void abrirArquivo(f.arquivo) : window.open(f.url, '_blank', 'noopener,noreferrer'))
  const pessoas = [...arvore.nos].sort((a, b) => (a.nome || a.apelido).localeCompare(b.nome || b.apelido))
  const aba_ = (id: 'dados' | 'chat', Icone: typeof Send, label: string, extra?: string) => (
    <button type="button" onClick={() => setAba(id)} aria-pressed={aba === id}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-mono tracking-wider uppercase border-b-2 transition-colors ${aba === id ? 'border-gold text-gold3' : 'border-transparent text-txt3 hover:text-txt'}`}>
      <Icone size={13} /> {label}{extra && <span className="text-txt3">{extra}</span>}
    </button>
  )

  return (
    <aside className="absolute top-0 right-0 bottom-0 z-30 w-full sm:w-100 bg-card/97 backdrop-blur border-l border-bdr shadow-2xl flex flex-col" aria-label="Dados e chat da árvore"
      onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
      <header className="flex items-center gap-2 px-4 pt-3">
        <h2 className="flex-1 text-sm font-semibold text-txt truncate">{arvore.nome}</h2>
        <button type="button" onClick={onFechar} aria-label="Fechar" className="p-1.5 rounded text-txt2 hover:text-txt hover:bg-card2"><X size={16} /></button>
      </header>
      <div className="flex px-2 mt-1 border-b border-bdr">{aba_('dados', FileText, 'Dados')}{aba_('chat', MessageSquare, 'Chat', ` ${arvore.mensagens.length}`)}</div>

      {aba === 'dados' ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div className="col-span-2"><dt className="font-mono text-[10px] text-txt3 uppercase tracking-wider">Inquérito</dt>
              <dd className="text-txt">{arvore.inquerito ? (arvore.inquerito.titulo ? `${arvore.inquerito.numero} · ${arvore.inquerito.titulo}` : 'Ligado a um inquérito') : '—'}</dd></div>
            {arvore.descricao && <div className="col-span-2"><dt className="font-mono text-[10px] text-txt3 uppercase tracking-wider">Descrição</dt><dd className="text-txt2 whitespace-pre-wrap">{arvore.descricao}</dd></div>}
            <div className="col-span-2"><dt className="font-mono text-[10px] text-txt3 uppercase tracking-wider">Quem trabalha nesta árvore</dt>
              <dd className="text-txt">{arvore.privada ? arvore.participantes.map(p => (p.voce ? `${p.nome} (você)` : p.nome)).join(', ') : 'Aberta a todos com acesso às árvores'}<span className="block text-[11px] text-txt3">Admins veem todas as árvores.</span></dd></div>
            <div><dt className="font-mono text-[10px] text-txt3 uppercase tracking-wider">Pessoas no quadro</dt><dd className="text-txt">{arvore.nos.length}</dd></div>
            <div><dt className="font-mono text-[10px] text-txt3 uppercase tracking-wider">Ligações</dt><dd className="text-txt">{arvore.ligacoes.length}</dd></div>
            <div className="col-span-2 text-[11px] text-txt3">Criada por {arvore.criadoPor} · atualizada por {arvore.atualizadoPor} em {hora(arvore.atualizadoEm)}</div>
          </dl>
          <h3 className="flex items-center gap-1.5 font-mono text-[10px] text-txt2 tracking-[0.18em] uppercase"><Users size={12} /> Pessoas da árvore</h3>
          {pessoas.length === 0 ? <p className="text-xs text-txt3">Nenhuma pessoa ainda. Use o + no quadro.</p> : (
            <ul className="space-y-2">
              {pessoas.map(n => (
                <li key={n.id}>
                  <button type="button" onClick={() => onAbrirNo(n)} className="w-full flex gap-3 text-left rounded-lg bg-card2 hover:bg-card2/70 p-2 ring-1 ring-transparent hover:ring-gold/40 transition">
                    <FotoArvore foto={n.foto} nome={n.nome || n.apelido} className="w-12 h-12 rounded-lg shrink-0 text-base" />
                    <span className="min-w-0 text-xs space-y-0.5">
                      <span className="block text-sm text-txt font-medium truncate">{n.nome || 'Sem nome'}{n.apelido && <span className="text-gold3 font-normal"> "{n.apelido}"</span>}</span>
                      {(n.funcao || n.faccao || n.status) && <span className="block text-txt2 truncate">{[n.funcao, n.faccao, n.status].filter(Boolean).join(' · ')}</span>}
                      {n.telefone && <span className="flex items-center gap-1 text-txt3 font-mono"><Phone size={10} /> {n.telefone}</span>}
                      {(n.endereco || n.veiculo) && <span className="block text-txt3 truncate">{[n.endereco, n.veiculo].filter(Boolean).join(' · ')}</span>}
                      {n.observacoes && <span className="block text-txt3 line-clamp-2">{n.observacoes}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {arvore.mensagens.length === 0 && <p className="text-xs text-txt3">Nenhuma mensagem. Combine aqui com a equipe o que foi descoberto nesta árvore.</p>}
            {arvore.mensagens.map(m => (
              <div key={m.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.minha ? 'ml-auto bg-gold/20 text-txt' : 'bg-card2 text-txt'}`}>
                {!m.minha && <p className="text-[11px] font-semibold text-gold3">{m.autor}</p>}
                {m.anexo && ('video' in m.anexo
                  ? <CartaoLinkVideo link={m.anexo.video} />
                  : ehVideo(m.anexo) && 'arquivo' in m.anexo
                    ? <VideoArquivo arquivo={m.anexo.arquivo} className="block my-1 w-full max-h-72 rounded-lg" />
                    : (
                      <button type="button" onClick={() => abrirAnexo(m.anexo as Foto)} title="Abrir a imagem" className="block my-1 w-full">
                        <FotoArvore foto={m.anexo as Foto} nome={m.autor} className="w-full max-h-60 rounded-lg" />
                      </button>
                    ))}
                {m.texto && <p className="whitespace-pre-wrap wrap-break-word">{m.texto}</p>}
                <p className="text-[10px] text-txt3 text-right mt-0.5">{hora(m.em)}</p>
              </div>
            ))}
            <div ref={fim} />
          </div>
          {arvore.podeEditar ? (
            <div className="border-t border-bdr">
              {/* Anexo escolhido (prévia antes de enviar) */}
              {(anexo || subindo) && (
                <div className="flex items-center gap-2 px-3 pt-3">
                  {!anexo ? <span className="w-14 h-14 rounded-lg bg-card2 animate-pulse" />
                    : 'video' in anexo || ehVideo(anexo) ? <span className="w-14 h-14 rounded-lg bg-card2 text-gold3 flex items-center justify-center"><Film size={22} /></span>
                    : <FotoArvore foto={anexo} nome="anexo" className="w-14 h-14 rounded-lg" />}
                  <span className="flex-1 text-[11px] text-txt2 truncate">{subindo ? 'Enviando…'
                    : anexo && 'video' in anexo ? `Link de vídeo: ${anexo.video}`
                    : anexo && ehVideo(anexo) ? 'Vídeo guardado, pronto para enviar'
                    : anexo && 'url' in anexo ? `Só link (não deu para guardar): ${anexo.url}` : 'Foto guardada, pronta para enviar'}</span>
                  {anexo && <button type="button" onClick={() => setAnexo(null)} aria-label="Tirar anexo" className="p-1 rounded text-txt3 hover:text-red"><X size={14} /></button>}
                </div>
              )}
              {pedindoLink && (
                <div className="flex gap-2 px-3 pt-3">
                  <input autoFocus value={link} onChange={e => setLink(e.target.value)} maxLength={2048}
                    placeholder={pedindoLink === 'video' ? 'https://youtu.be/… ou outro link de vídeo' : 'https://…/imagem.png'} aria-label={pedindoLink === 'video' ? 'Link do vídeo' : 'Link da imagem'}
                    onKeyDown={e => { if (e.key === 'Enter') void anexarLink(); if (e.key === 'Escape') setPedindoLink(false) }}
                    className="flex-1 bg-card2 rounded-lg px-3 py-1.5 text-xs text-txt placeholder-txt3 outline-none focus:ring-1 focus:ring-gold" />
                  <button type="button" onClick={() => void anexarLink()} className="px-2.5 rounded-lg bg-card2 text-xs text-gold3 hover:text-gold">Usar</button>
                  <button type="button" onClick={() => setPedindoLink(false)} aria-label="Cancelar link" className="px-1.5 text-txt3 hover:text-txt"><X size={14} /></button>
                </div>
              )}
            <div className="flex gap-2 p-3">
              <input ref={inputArquivo} type="file" accept={ACEITA_FOTO} className="hidden" onChange={e => { void anexarArquivo(e.target.files?.[0]); e.target.value = '' }} />
              <input ref={inputVideo} type="file" accept={ACEITA_VIDEO} className="hidden" onChange={e => { void anexarVideo(e.target.files?.[0]); e.target.value = '' }} />
              <div className="relative">
                <button type="button" onClick={() => setMenuClipe(v => !v)} aria-label="Anexar" aria-expanded={menuClipe} title="Anexar foto"
                  disabled={subindo} className={`h-full px-2.5 rounded-lg ${menuClipe ? 'bg-gold/20 text-gold3' : 'bg-card2 text-txt2 hover:text-txt'} disabled:opacity-40`}><Paperclip size={16} /></button>
                {menuClipe && (
                  <div className="absolute bottom-full left-0 mb-2 w-60 rounded-xl bg-card ring-1 ring-bdrg shadow-xl p-1 z-10" role="menu">
                    <button type="button" role="menuitem" onClick={() => { setMenuClipe(false); inputArquivo.current?.click() }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-txt hover:bg-card2"><Upload size={14} className="text-gold3" /> Foto do computador</button>
                    <button type="button" role="menuitem" onClick={() => { setMenuClipe(false); inputVideo.current?.click() }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-txt hover:bg-card2"><Video size={14} className="text-gold3" /> Vídeo do computador <span className="text-[10px] text-txt3">até 1 min</span></button>
                    <button type="button" role="menuitem" onClick={() => { setMenuClipe(false); setPedindoLink('imagem') }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-txt hover:bg-card2"><Link2 size={14} className="text-gold3" /> Link de imagem</button>
                    <button type="button" role="menuitem" onClick={() => { setMenuClipe(false); setPedindoLink('video') }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-txt hover:bg-card2"><Film size={14} className="text-gold3" /> Link de vídeo</button>
                  </div>
                )}
              </div>
              <textarea value={texto} onChange={e => setTexto(e.target.value)} maxLength={1000} rows={2} placeholder="Escreva para a equipe…" aria-label="Mensagem"
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); mandar() } }}
                className="flex-1 resize-none bg-card2 rounded-lg px-3 py-2 text-sm text-txt placeholder-txt3 outline-none focus:ring-1 focus:ring-gold" />
              <button type="button" onClick={mandar} disabled={(!texto.trim() && !anexo) || enviar.isPending || subindo} aria-label="Enviar"
                className="px-3 rounded-lg bg-gold hover:bg-gold2 text-white disabled:opacity-40"><Send size={16} /></button>
            </div>
            </div>
          ) : <p className="p-3 border-t border-bdr text-[11px] text-txt3">Você pode ler o chat, mas só quem edita a árvore escreve.</p>}
        </>
      )}
    </aside>
  )
}
