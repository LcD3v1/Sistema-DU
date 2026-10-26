import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { GraduationCap, Plus, Search, BookOpen, ExternalLink, Pencil, Trash2, Link2, User, Tag } from 'lucide-react'
import { useLivros, useCriarLivro, useAtualizarLivro, useRemoverLivro, type Livro, type LivroInput } from '@/hooks/useLivros'
import { usePerms } from '@/hooks/usePerms'
import { useUIStore } from '@/store/uiStore'
import LoadingHud from '@/components/ui/LoadingHud'
import ModalOverlay from '@/components/ui/ModalOverlay'
import HudButton from '@/components/ui/HudButton'
import { confirmar } from '@/lib/dialogo'
import { linkSeguro } from '@/lib/plataformas'
import { EditorArquivos, ListaArquivos } from '@/components/investigacao/Campos'
import type { ArquivoRef } from '@/hooks/useInvestigacao'

/**
 * Cursos Internos — biblioteca de livros. Quem edita cola o link (PDF, Google
 * Drive, Docs, site…) e/ou envia arquivos do computador, e ele vira um livro na
 * estante; o clique abre os detalhes, o link e os arquivos.
 */

const EASE = [0.16, 1, 0.3, 1] as const
const CORES = ['#8b5cf6', '#1f8a5b', '#b8860b', '#8e3b46', '#6b3fa0', '#0f766e', '#c2410c', '#334155']

type FormLivro = Omit<LivroInput, 'arquivos'> & { arquivos: ArquivoRef[] }
const VAZIO: FormLivro = { titulo: '', autor: '', descricao: '', categoria: '', url: '', arquivos: [], capa: '', cor: CORES[0] }

const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

/** Sugere um título a partir do link (nome do arquivo, sem extensão). */
function tituloDoLink(url: string): string {
  try {
    const ultimo = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '')
    if (!/\.(pdf|epub|docx?|pptx?)$/i.test(ultimo)) return ''
    return ultimo.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim().slice(0, 120)
  } catch { return '' }
}

const erroApi = (e: unknown) => {
  const d = (e as { response?: { data?: { error?: string; details?: string[] } } })?.response?.data
  return d?.details?.[0]?.replace(/^[\w.]+: /, '') ?? d?.error ?? 'Erro ao salvar.'
}

function Capa({ livro, className = '' }: { livro: Pick<Livro, 'titulo' | 'autor' | 'capa' | 'cor'>; className?: string }) {
  const [falhou, setFalhou] = useState(false)
  if (livro.capa && !falhou && linkSeguro(livro.capa)) {
    return <img src={livro.capa} alt={`Capa de ${livro.titulo}`} loading="lazy" decoding="async" referrerPolicy="no-referrer"
      onError={() => setFalhou(true)} className={`${className} object-cover`} />
  }
  // Capa gerada: cor escolhida, lombada e título
  return (
    <div className={`${className} relative flex flex-col justify-between p-3 text-white overflow-hidden`}
      style={{ background: `linear-gradient(150deg, ${livro.cor} 0%, ${livro.cor}cc 45%, #07090f 130%)` }}>
      <span className="absolute left-0 top-0 bottom-0 w-2 bg-black/30" aria-hidden="true" />
      <BookOpen size={16} className="opacity-70 ml-1" aria-hidden="true" />
      <div className="ml-1">
        <p className="font-semibold text-sm leading-tight line-clamp-4 break-words">{livro.titulo || 'Sem título'}</p>
        {livro.autor && <p className="text-[10px] opacity-75 mt-1 truncate">{livro.autor}</p>}
      </div>
    </div>
  )
}

export default function CursosPage() {
  const { data: livros, isLoading, isError } = useLivros()
  const { canEdit } = usePerms()
  const { addToast } = useUIStore()
  const criar = useCriarLivro()
  const atualizar = useAtualizarLivro()
  const remover = useRemoverLivro()
  const podeEditar = canEdit('cursos')

  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState('')
  const [aberto, setAberto] = useState<Livro | null>(null)
  const [form, setForm] = useState<FormLivro | null>(null)
  const [editId, setEditId] = useState<number | null>(null)

  const categorias = useMemo(() => [...new Set((livros ?? []).map(l => l.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [livros])
  const lista = useMemo(() => {
    const termos = normalizar(busca.trim()).split(/\s+/).filter(Boolean)
    return (livros ?? []).filter(l => (!categoria || l.categoria === categoria)
      && termos.every(t => normalizar(`${l.titulo} ${l.autor} ${l.categoria} ${l.descricao}`).includes(t)))
  }, [livros, busca, categoria])

  function abrirNovo() { setEditId(null); setForm({ ...VAZIO }) }
  function abrirEdicao(l: Livro) {
    setAberto(null); setEditId(l.id)
    setForm({ titulo: l.titulo, autor: l.autor, descricao: l.descricao, categoria: l.categoria, url: l.url, arquivos: l.arquivos ?? [], capa: l.capa, cor: l.cor })
  }
  function mudarLink(url: string) {
    setForm(f => {
      if (!f) return f
      const sugestao = !f.titulo ? tituloDoLink(url.trim()) : ''
      return { ...f, url, ...(sugestao ? { titulo: sugestao } : {}) }
    })
  }
  function salvar() {
    if (!form) return
    const body = { ...form, url: form.url.trim(), capa: form.capa.trim(), titulo: form.titulo.trim(), arquivos: form.arquivos.map(a => a.id) }
    if (body.url && !linkSeguro(body.url)) { addToast('error', 'O link precisa começar com http:// ou https://.'); return }
    if (!body.url && body.arquivos.length === 0) { addToast('error', 'Cole o link do livro ou envie um arquivo do computador.'); return }
    if (!body.titulo) { addToast('error', 'Dê um título ao livro.'); return }
    if (body.capa && !linkSeguro(body.capa)) { addToast('error', 'A capa precisa ser um link de imagem http/https.'); return }
    const ok = () => { addToast('success', editId ? 'Livro atualizado!' : 'Livro adicionado à biblioteca!'); setForm(null) }
    const erro = (e: unknown) => addToast('error', erroApi(e))
    if (editId) atualizar.mutate({ id: editId, ...body }, { onSuccess: ok, onError: erro })
    else criar.mutate(body, { onSuccess: ok, onError: erro })
  }
  async function excluir(l: Livro) {
    if (!(await confirmar({ titulo: 'Remover livro', mensagem: `Remover "${l.titulo}" da biblioteca?`, tom: 'perigo', textoConfirmar: 'Remover' }))) return
    remover.mutate(l.id, { onSuccess: () => { addToast('success', 'Livro removido.'); setAberto(null) } })
  }

  if (isLoading) return <LoadingHud />

  const salvando = criar.isPending || atualizar.isPending

  return (
    <div className="w-full max-w-[1800px] mx-auto p-3 sm:p-6 lg:px-8">
      {/* Cabeçalho */}
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <p className="font-mono text-[10px] text-txt2 tracking-[0.2em] uppercase mb-1">Formação</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-txt flex items-center gap-2">
            <GraduationCap size={26} className="text-gold" /> Cursos Internos
          </h1>
          <p className="text-sm text-txt2 mt-1">Biblioteca da unidade: manuais, apostilas e materiais de estudo.</p>
        </div>
        {podeEditar && (
          <HudButton size="sm" onClick={abrirNovo}>
            <Plus size={14} className="inline mr-1.5" /> Adicionar livro
          </HudButton>
        )}
      </div>

      {/* Busca e categorias */}
      {(livros?.length ?? 0) > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
          <div className="relative sm:w-80">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt3" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Pesquisar livro, autor ou assunto" aria-label="Pesquisar na biblioteca"
              className="input-gold w-full bg-card border border-bdr2 rounded-lg pl-9 pr-3 py-2 text-sm text-txt" />
          </div>
          {categorias.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {['', ...categorias].map(c => (
                <button key={c || 'todas'} onClick={() => setCategoria(c)} aria-pressed={categoria === c}
                  className={`px-3 py-1 rounded-full text-xs font-mono transition-colors ${categoria === c ? 'bg-gold/15 text-gold3 border border-gold/40' : 'text-txt2 border border-bdr2 hover:text-txt'}`}>
                  {c || 'Todas'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Estante */}
      {isError ? (
        <div className="border border-bdr rounded-xl bg-card py-20 text-center text-sm text-red">Não foi possível carregar a biblioteca.</div>
      ) : (livros?.length ?? 0) === 0 ? (
        <div className="border border-bdr rounded-xl bg-card py-20 text-center">
          <BookOpen size={30} className="text-txt3 mx-auto mb-3" />
          <p className="text-txt2 text-sm">Nenhum livro na biblioteca{podeEditar ? ' — clique em “Adicionar livro” e cole o link.' : ' ainda.'}</p>
        </div>
      ) : lista.length === 0 ? (
        <div className="border border-bdr rounded-xl bg-card py-16 text-center text-sm text-txt2">Nenhum livro encontrado.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
          {lista.map((l, i) => (
            <motion.button key={l.id} onClick={() => setAberto(l)} aria-label={`Abrir ${l.titulo}`}
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: Math.min(i, 20) * 0.03, ease: EASE }}
              className="group text-left">
              <div className="rounded-lg overflow-hidden border border-bdr group-hover:border-gold/50 shadow-lg transition-all group-hover:-translate-y-1 motion-reduce:transform-none">
                <Capa livro={l} className="w-full aspect-[2/3]" />
              </div>
              <p className="text-sm font-medium text-txt mt-2 line-clamp-2 break-words">{l.titulo}</p>
              {(l.autor || l.categoria) && <p className="text-[11px] text-txt3 truncate">{l.autor || l.categoria}</p>}
            </motion.button>
          ))}
        </div>
      )}

      {/* Detalhes do livro */}
      <ModalOverlay open={!!aberto} onClose={() => setAberto(null)} title="LIVRO" maxWidth="max-w-2xl">
        {aberto && (
          <div className="flex flex-col sm:flex-row gap-5">
            <div className="sm:w-44 shrink-0 mx-auto w-40">
              <div className="rounded-lg overflow-hidden border border-bdr"><Capa livro={aberto} className="w-full aspect-[2/3]" /></div>
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <h3 className="text-xl font-semibold text-txt break-words">{aberto.titulo}</h3>
              <div className="flex flex-wrap gap-2 text-xs text-txt2">
                {aberto.autor && <span className="inline-flex items-center gap-1"><User size={12} /> {aberto.autor}</span>}
                {aberto.categoria && <span className="inline-flex items-center gap-1"><Tag size={12} /> {aberto.categoria}</span>}
              </div>
              {aberto.descricao && <p className="text-sm text-txt2 whitespace-pre-line break-words">{aberto.descricao}</p>}
              {linkSeguro(aberto.url) && (
                <a href={aberto.url} target="_blank" rel="noopener noreferrer nofollow"
                  className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 rounded-lg bg-gold text-white text-sm font-medium hover:bg-gold2 transition-colors">
                  <BookOpen size={16} /> Abrir livro <ExternalLink size={13} className="opacity-70" />
                </a>
              )}
              {(aberto.arquivos ?? []).length > 0 && <ListaArquivos arquivos={aberto.arquivos} />}
              {podeEditar && (
                <div className="flex gap-2 pt-2 border-t border-bdr">
                  <button onClick={() => abrirEdicao(aberto)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-bdr2 text-txt2 text-xs hover:text-txt"><Pencil size={13} /> Editar</button>
                  <button onClick={() => excluir(aberto)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-bdr2 text-txt2 text-xs hover:text-red"><Trash2 size={13} /> Remover</button>
                </div>
              )}
            </div>
          </div>
        )}
      </ModalOverlay>

      {/* Adicionar / editar */}
      <ModalOverlay open={!!form} onClose={() => setForm(null)} title={editId ? 'EDITAR LIVRO' : 'ADICIONAR LIVRO'} maxWidth="max-w-2xl">
        {form && (
          <div className="flex flex-col sm:flex-row gap-5">
            <div className="space-y-3 flex-1 min-w-0">
              <Campo rotulo="Link do livro" dica="PDF, Google Drive, Docs ou qualquer site (http/https). Opcional se enviar arquivos.">
                <div className="relative">
                  <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt3" />
                  <input autoFocus value={form.url} onChange={e => mudarLink(e.target.value)} placeholder="https://..." inputMode="url" maxLength={2048}
                    className={`input-gold w-full bg-card2 border rounded-lg pl-9 pr-3 py-2 text-sm font-mono text-txt ${form.url && !linkSeguro(form.url.trim()) ? 'border-red/60' : 'border-bdr2'}`} />
                </div>
              </Campo>
              <Campo rotulo="Arquivos do computador" dica="PDF, Word, PowerPoint, planilhas, imagens, áudio e vídeo.">
                <EditorArquivos area="cursos" arquivos={form.arquivos} onChange={arquivos => setForm(f => f && { ...f, arquivos, titulo: f.titulo || (arquivos[0]?.nome.replace(/\.[a-z0-9]+$/i, '').slice(0, 120) ?? '') })} />
              </Campo>
              <Campo rotulo="Título *"><input value={form.titulo} maxLength={120} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Manual de Abordagem" className="input-gold w-full bg-card2 border border-bdr2 rounded-lg px-3 py-2 text-sm text-txt" /></Campo>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Campo rotulo="Autor"><input value={form.autor} maxLength={80} onChange={e => setForm({ ...form, autor: e.target.value })} placeholder="Opcional" className="input-gold w-full bg-card2 border border-bdr2 rounded-lg px-3 py-2 text-sm text-txt" /></Campo>
                <Campo rotulo="Categoria">
                  <input value={form.categoria} maxLength={40} list="categorias-livros" onChange={e => setForm({ ...form, categoria: e.target.value })} placeholder="Ex.: Táticas" className="input-gold w-full bg-card2 border border-bdr2 rounded-lg px-3 py-2 text-sm text-txt" />
                  <datalist id="categorias-livros">{categorias.map(c => <option key={c} value={c} />)}</datalist>
                </Campo>
              </div>
              <Campo rotulo="Descrição"><textarea value={form.descricao} maxLength={600} rows={3} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Sobre o que é o livro (opcional)" className="input-gold w-full bg-card2 border border-bdr2 rounded-lg px-3 py-2 text-sm text-txt resize-none" /></Campo>
              <Campo rotulo="Capa" dica="Link de uma imagem (opcional). Sem capa, ela é criada com o título e a cor.">
                <input value={form.capa} maxLength={2048} onChange={e => setForm({ ...form, capa: e.target.value })} placeholder="https://... (imagem)" inputMode="url"
                  className={`input-gold w-full bg-card2 border rounded-lg px-3 py-2 text-sm font-mono text-txt ${form.capa && !linkSeguro(form.capa.trim()) ? 'border-red/60' : 'border-bdr2'}`} />
              </Campo>
              <Campo rotulo="Cor da capa">
                <div className="flex gap-2 flex-wrap">
                  {CORES.map(c => (
                    <button key={c} type="button" onClick={() => setForm({ ...form, cor: c })} aria-label={`Cor ${c}`} aria-pressed={form.cor === c}
                      className={`w-7 h-7 rounded-full border-2 transition-transform ${form.cor === c ? 'border-white scale-110' : 'border-transparent'}`} style={{ background: c }} />
                  ))}
                </div>
              </Campo>
              <div className="flex gap-2 pt-1">
                <button onClick={salvar} disabled={salvando}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gold text-white text-sm font-medium hover:bg-gold2 transition-colors disabled:opacity-50">
                  <BookOpen size={14} /> {salvando ? 'Salvando...' : editId ? 'Salvar alterações' : 'Adicionar à biblioteca'}
                </button>
                <button onClick={() => setForm(null)} className="px-3 py-2 rounded-lg border border-bdr2 text-txt2 text-sm hover:text-txt transition-colors">Cancelar</button>
              </div>
            </div>
            <div className="sm:w-40 shrink-0 w-36 mx-auto">
              <p className="font-mono text-[10px] text-txt2 tracking-wider uppercase mb-1.5">Prévia</p>
              <div className="rounded-lg overflow-hidden border border-bdr"><Capa key={form.capa} livro={form} className="w-full aspect-[2/3]" /></div>
            </div>
          </div>
        )}
      </ModalOverlay>
    </div>
  )
}

function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="font-mono text-[10px] text-txt2 tracking-wider uppercase">{rotulo}</label>
      {children}
      {dica && <p className="text-[11px] text-txt3">{dica}</p>}
    </div>
  )
}
