import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GitBranch, Plus, Search, Pencil, Trash2, Users, Link2, FolderArchive, X, Lock, Unlock, Check, ShieldCheck } from 'lucide-react'
import { useArvores, useSalvarArvore, useApagarArvore, useInqueritosArvore, usePessoasArvore, type ResumoArvore } from '@/hooks/useArvores'
import { usePerms } from '@/hooks/usePerms'
import { useUIStore } from '@/store/uiStore'
import { confirmar } from '@/lib/dialogo'
import LoadingHud from '@/components/ui/LoadingHud'

type Erro = { response?: { data?: { error?: string } } }
const erroApi = (e: unknown, padrao: string) => (e as Erro)?.response?.data?.error ?? padrao
const campo = 'w-full bg-card2 rounded-lg px-3 py-2 text-sm text-txt placeholder-txt3 outline-none focus:ring-1 focus:ring-gold'
const rotulo = 'block font-mono text-[10px] text-txt2 tracking-[0.18em] uppercase mb-1.5'
const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

interface Form {
  id?: number; nome: string; descricao: string; inqueritoId: number | null
  participantes: number[]   // quem trabalha na árvore (quem cria sempre entra)
  gerenciar: boolean        // pode escolher as pessoas (quem criou ou admin)
  aberta?: boolean          // árvore antiga, ainda aberta a todos
}

/** Escolha de quem trabalha na árvore: busca + marcar. Admins veem todas de qualquer jeito. */
function SeletorPessoas({ marcados, onChange, desativado }: { marcados: number[]; onChange: (ids: number[]) => void; desativado: boolean }) {
  const { data: pessoas = [], isLoading } = usePessoasArvore(true)
  const [busca, setBusca] = useState('')
  const termo = busca.trim().toLowerCase()
  const lista = pessoas.filter(p => !termo || p.nome.toLowerCase().includes(termo))
  const alternar = (id: number) => onChange(marcados.includes(id) ? marcados.filter(x => x !== id) : [...marcados, id])
  return (
    <div className="rounded-xl bg-card2 p-2.5">
      <div className="relative mb-2">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-txt3" />
        <input value={busca} onChange={e => setBusca(e.target.value)} disabled={desativado} placeholder="Buscar pessoa…" aria-label="Buscar pessoa"
          className="w-full bg-card rounded-lg pl-7 pr-2 py-1.5 text-xs text-txt placeholder-txt3 outline-none focus:ring-1 focus:ring-gold disabled:opacity-50" />
      </div>
      <ul className="max-h-48 overflow-y-auto space-y-0.5">
        {isLoading && <li className="text-[11px] text-txt3 px-1">Carregando…</li>}
        {lista.map(p => {
          const fixo = p.voce
          const marcado = fixo || marcados.includes(p.id)
          return (
            <li key={p.id}>
              <button type="button" onClick={() => !fixo && !desativado && alternar(p.id)} disabled={fixo || desativado} aria-pressed={marcado}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm ${marcado ? 'bg-gold/15 text-txt' : 'text-txt2 hover:bg-card'} disabled:cursor-default`}>
                <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${marcado ? 'bg-gold text-white' : 'ring-1 ring-bdr2'}`}>{marcado && <Check size={11} />}</span>
                <span className="flex-1 truncate">{p.nome}{fixo && <span className="text-txt3 text-xs"> (você)</span>}</span>
                {p.admin && <span title="Admin: vê todas as árvores" className="text-gold3"><ShieldCheck size={13} /></span>}
              </button>
            </li>
          )
        })}
        {!isLoading && lista.length === 0 && <li className="text-[11px] text-txt3 px-1">Ninguém encontrado.</li>}
      </ul>
    </div>
  )
}

/** Criar/editar árvore: nome, descrição e o inquérito ligado (opcional). */
function ModalArvore({ inicial, onFechar }: { inicial: Form; onFechar: () => void }) {
  const navigate = useNavigate()
  const { addToast } = useUIStore()
  const salvar = useSalvarArvore()
  const inqueritos = useInqueritosArvore(true)
  const [form, setForm] = useState(inicial)
  const [fechar, setFechar] = useState(!inicial.aberta)   // árvore antiga: o gestor decide se fecha
  function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nome.trim()) return
    salvar.mutate({
      ...(form.id ? { id: form.id } : {}), nome: form.nome.trim(), descricao: form.descricao.trim(), inqueritoId: form.inqueritoId,
      ...(form.gerenciar && fechar ? { participantes: form.participantes } : {}),
    }, {
      onSuccess: a => { addToast('success', form.id ? 'Árvore atualizada.' : 'Árvore criada.'); onFechar(); if (!form.id) navigate(`/arvores/${a.id}`) },
      onError: er => addToast('error', erroApi(er, 'Não foi possível salvar.')),
    })
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="arvore-modal-titulo">
      <form onSubmit={enviar} className="w-full max-w-lg bg-card rounded-2xl shadow-2xl ring-1 ring-bdrg">
        <header className="flex items-center gap-2 px-5 py-4 border-b border-bdr">
          <GitBranch size={18} className="text-gold" />
          <h2 id="arvore-modal-titulo" className="flex-1 text-base font-semibold text-txt">{form.id ? 'Editar árvore' : 'Nova árvore de investigação'}</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="p-1.5 rounded text-txt2 hover:text-txt hover:bg-card2"><X size={16} /></button>
        </header>
        <div className="p-5 space-y-4">
          <label className="block"><span className={rotulo}>Nome da árvore</span>
            <input autoFocus value={form.nome} maxLength={60} required onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex.: Ballas, Crips, Família Vagos…" className={campo} />
          </label>
          <label className="block"><span className={rotulo}>Inquérito <span className="normal-case tracking-normal text-txt3">(opcional)</span></span>
            <select value={form.inqueritoId ?? ''} onChange={e => setForm(f => ({ ...f, inqueritoId: e.target.value ? Number(e.target.value) : null }))} className={campo}>
              <option value="">Sem inquérito</option>
              {(inqueritos.data ?? []).map(i => <option key={i.id} value={i.id}>{i.numero} · {i.titulo}</option>)}
            </select>
            {inqueritos.data?.length === 0 && <span className="block text-[11px] text-txt3 mt-1">Nenhum inquérito disponível para você.</span>}
          </label>
          <label className="block"><span className={rotulo}>Descrição <span className="normal-case tracking-normal text-txt3">(opcional)</span></span>
            <textarea value={form.descricao} maxLength={500} rows={3} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Objetivo da investigação, equipe responsável…" className={campo} />
          </label>
          <div>
            <span className={rotulo}>Quem trabalha nesta árvore</span>
            {form.aberta && form.gerenciar && (
              <label className="flex items-center gap-2 text-xs text-txt2 mb-2">
                <input type="checkbox" checked={fechar} onChange={e => setFechar(e.target.checked)} className="accent-[#8b5cf6]" />
                Tornar privada (hoje esta árvore antiga está aberta a todos com acesso às árvores)
              </label>
            )}
            {form.gerenciar ? (
              (!form.aberta || fechar) && <SeletorPessoas marcados={form.participantes} onChange={ids => setForm(f => ({ ...f, participantes: ids }))} desativado={false} />
            ) : <p className="text-[11px] text-txt3">Só quem criou a árvore ou um admin escolhe as pessoas.</p>}
            <p className="text-[11px] text-txt3 mt-1.5">Só quem criou{form.participantes.length ? ' e as pessoas marcadas' : ''} veem esta árvore. Os cargos com acesso total (admins) veem todas.</p>
          </div>
        </div>
        <footer className="flex justify-end gap-2 px-5 py-4 border-t border-bdr">
          <button type="button" onClick={onFechar} className="px-3 py-2 rounded-lg text-sm text-txt2 hover:text-txt">Cancelar</button>
          <button type="submit" disabled={!form.nome.trim() || salvar.isPending} className="px-4 py-2 rounded-lg bg-gold hover:bg-gold2 text-white text-sm font-medium disabled:opacity-50">
            {salvar.isPending ? 'Salvando…' : form.id ? 'Salvar' : 'Criar e abrir'}
          </button>
        </footer>
      </form>
    </div>
  )
}

export default function ArvoresPage() {
  const { data, isLoading } = useArvores()
  const { canEdit } = usePerms()
  const podeEditar = canEdit('arvore')
  const apagar = useApagarArvore()
  const { addToast } = useUIStore()
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState<Form | null>(null)
  if (isLoading) return <LoadingHud />

  const termo = busca.trim().toLowerCase()
  const lista = (data ?? []).filter(a => !termo || `${a.nome} ${a.descricao} ${a.inquerito?.titulo ?? ''} ${a.inquerito?.numero ?? ''}`.toLowerCase().includes(termo))

  async function remover(a: ResumoArvore) {
    if (!(await confirmar({ titulo: 'Apagar árvore', mensagem: `Apagar "${a.nome}" com ${a.totalNos} pessoa(s), as ligações, as fotos e o chat? Isso não pode ser desfeito.`, tom: 'perigo', textoConfirmar: 'Apagar' }))) return
    apagar.mutate(a.id, { onSuccess: () => addToast('success', 'Árvore apagada.'), onError: e => addToast('error', erroApi(e, 'Não foi possível apagar.')) })
  }

  return (
    <div className="w-full max-w-375 mx-auto p-3 sm:p-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <p className="font-mono text-[10px] text-txt2 tracking-[0.2em] uppercase mb-1">Investigação</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-txt flex items-center gap-2"><GitBranch size={26} className="text-gold" /> Árvores de investigação</h1>
          <p className="text-sm text-txt2 mt-1 max-w-2xl">Quadros de vínculos: cada equipe abre a árvore da sua investigação, coloca as pessoas com foto e dados e liga umas às outras. Cada árvore é privada de quem a criou e das pessoas escolhidas; os admins veem todas.</p>
        </div>
        {podeEditar && (
          <button type="button" onClick={() => setModal({ nome: '', descricao: '', inqueritoId: null, participantes: [], gerenciar: true })}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-gold hover:bg-gold2 text-white text-sm font-medium shadow-[0_10px_30px_-12px_rgba(139,92,246,0.7)]">
            <Plus size={16} /> Nova árvore
          </button>
        )}
      </div>

      <label className="relative block w-full sm:w-80 mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt3" />
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar árvore ou inquérito…" aria-label="Buscar árvores"
          className="w-full bg-card rounded-lg pl-8 pr-3 py-2 text-sm text-txt placeholder-txt3 outline-none focus:ring-1 focus:ring-gold" />
      </label>

      {lista.length === 0 ? (
        <div className="bg-card rounded-xl p-10 text-center">
          <GitBranch size={36} className="mx-auto text-txt3" />
          <p className="mt-3 text-sm text-txt2">{data?.length ? 'Nenhuma árvore com essa busca.' : 'Nenhuma árvore ainda.'}</p>
          {podeEditar && !data?.length && <p className="text-[11px] text-txt3 mt-1">Crie a primeira em <b>Nova árvore</b> — uma para cada investigação.</p>}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map(a => (
            <li key={a.id} className="group bg-card rounded-xl ring-1 ring-transparent hover:ring-gold/40 transition">
              <Link to={`/arvores/${a.id}`} className="block p-4">
                <div className="flex items-start gap-3">
                  <span className="w-10 h-10 rounded-xl bg-gold/15 text-gold3 flex items-center justify-center shrink-0"><GitBranch size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold text-txt truncate group-hover:text-gold3">{a.nome}</h2>
                    <p className="flex items-center gap-1 text-[11px] font-mono truncate" title={a.privada ? a.participantes.map(p => p.nome).join(', ') : 'Aberta a todos com acesso às árvores'}>
                      {a.privada
                        ? <span className="flex items-center gap-1 text-gold3"><Lock size={11} /> {a.participantes.length === 1 ? 'Só ' + (a.participantes[0].voce ? 'você' : a.participantes[0].nome) : `${a.participantes.length} pessoas`}</span>
                        : <span className="flex items-center gap-1 text-txt3"><Unlock size={11} /> Aberta</span>}
                    </p>
                    <p className="flex items-center gap-1 text-[11px] font-mono text-txt3 truncate">
                      <FolderArchive size={11} /> {a.inquerito ? (a.inquerito.titulo ? `${a.inquerito.numero} · ${a.inquerito.titulo}` : 'Inquérito ligado') : 'Sem inquérito'}
                    </p>
                  </div>
                </div>
                {a.descricao && <p className="mt-2 text-xs text-txt2 line-clamp-2">{a.descricao}</p>}
                <div className="mt-3 flex items-center gap-3 text-[11px] text-txt2">
                  <span className="flex items-center gap-1"><Users size={12} /> {a.totalNos}</span>
                  <span className="flex items-center gap-1"><Link2 size={12} /> {a.totalLigacoes}</span>
                  <span className="ml-auto text-txt3">Atualizada {quando(a.atualizadoEm)}</span>
                </div>
              </Link>
              {podeEditar && (
                <div className="flex justify-end gap-1 px-3 pb-3 -mt-1">
                  <button type="button" onClick={() => setModal({ id: a.id, nome: a.nome, descricao: a.descricao, inqueritoId: a.inquerito?.id ?? null,
                    participantes: a.participantes.map(p => p.id), gerenciar: a.podeGerenciar, aberta: !a.privada })}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-txt2 hover:text-txt hover:bg-card2"><Pencil size={12} /> Editar</button>
                  <button type="button" onClick={() => void remover(a)} className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-red hover:bg-red/10"><Trash2 size={12} /> Apagar</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {modal && <ModalArvore inicial={modal} onFechar={() => setModal(null)} />}
    </div>
  )
}
