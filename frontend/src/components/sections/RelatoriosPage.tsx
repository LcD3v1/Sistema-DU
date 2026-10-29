import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FileSearch, Plus, Search, Lock, Pencil, Trash2, Calendar, FolderArchive, ScrollText, Paperclip, Link2, Users, FilePlus2 } from 'lucide-react'
import {
  relatoriosApi, boletinsApi, inqueritosApi, erroApi, normalizar, hojeISO, dataBR,
  type Relatorio, type RelatorioInput, type ArquivoRef,
} from '@/hooks/useInvestigacao'
import { useMembros } from '@/hooks/useMembros'
import { useMe } from '@/hooks/useMe'
import { usePerms } from '@/hooks/usePerms'
import { useUIStore } from '@/store/uiStore'
import LoadingHud from '@/components/ui/LoadingHud'
import ModalOverlay from '@/components/ui/ModalOverlay'
import { confirmar } from '@/lib/dialogo'
import {
  INPUT, Campo, CabecalhoPagina, BotaoPrimario, BotaoSecundario, Selo, Vazio, Secao,
  EditorArquivos, ListaArquivos, EditorLinks, ListaLinks, SeletorInvestigadores, NomesInvestigadores, HistoricoRegistro,
} from '@/components/investigacao/Campos'

/**
 * Relatórios investigativos — cada investigador cadastra os relatórios produzidos
 * nas investigações. Quem pode ver consulta os da unidade; sigilosos só aparecem
 * para autor, investigadores citados e a gestão de relatórios.
 */

const TIPOS = ['Campo', 'Vigilância', 'Entrevista', 'Interrogatório', 'Análise', 'Perícia', 'Diligência', 'Conclusivo']
const EASE = [0.16, 1, 0.3, 1] as const

type Form = Omit<RelatorioInput, 'arquivos'> & { arquivos: ArquivoRef[] }
const vazio = (): Form => ({
  titulo: '', tipo: TIPOS[0], data: hojeISO(), conteudo: '', investigadores: [], links: [], arquivos: [],
  sigiloso: false, inqueritoId: null, boletimId: null,
})

export default function RelatoriosPage() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { data: relatorios, isLoading, isError } = relatoriosApi.useLista()
  const { canView, canEdit } = usePerms()
  const { data: inqueritos } = inqueritosApi.useLista(canView('inqueritos'))
  const { data: boletins } = boletinsApi.useLista(canView('boletins'))
  const { data: membros } = useMembros()
  const { data: me } = useMe()
  const { addToast } = useUIStore()
  const salvar = relatoriosApi.useSalvar()
  const remover = relatoriosApi.useRemover()
  const podeCadastrar = canEdit('relatorios')

  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState('')
  const [investigador, setInvestigador] = useState<number | ''>('')
  const [meus, setMeus] = useState(false)
  const [aberto, setAberto] = useState<Relatorio | null>(null)
  // /relatorios/novo abre o cadastro direto (item "Cadastrar" do menu; a rota remonta a página pela key)
  const [form, setForm] = useState<Form | null>(() => (pathname === '/relatorios/novo' ? vazio() : null))
  const [editId, setEditId] = useState<number | null>(null)

  const meuMembroId = me?.membroId
  const nomeInq = useMemo(() => new Map((inqueritos ?? []).map(i => [i.id, `${i.numero} · ${i.titulo}`])), [inqueritos])
  const nomeBol = useMemo(() => new Map((boletins ?? []).map(b => [b.id, `${b.numero} · ${b.titulo}`])), [boletins])
  const membroPorId = useMemo(() => new Map((membros ?? []).map(m => [m.id, m])), [membros])

  const lista = useMemo(() => {
    const termos = normalizar(busca.trim()).split(/\s+/).filter(Boolean)
    return (relatorios ?? []).filter(r => {
      if (tipo && r.tipo !== tipo) return false
      if (investigador && !r.investigadores.includes(investigador)) return false
      if (meus && !(meuMembroId && r.investigadores.includes(meuMembroId))) return false
      if (termos.length === 0) return true
      const nomes = r.investigadores.map(id => { const m = membroPorId.get(id); return m ? `${m.policial} ${m.codinome ?? ''}` : '' }).join(' ')
      const texto = normalizar(`${r.numero} ${r.titulo} ${r.tipo} ${r.conteudo} ${r.autorNome} ${nomes} ${nomeInq.get(r.inqueritoId ?? 0) ?? ''} ${nomeBol.get(r.boletimId ?? 0) ?? ''}`)
      return termos.every(t => texto.includes(t))
    })
  }, [relatorios, busca, tipo, investigador, meus, meuMembroId, membroPorId, nomeInq, nomeBol])

  function fecharForm() {
    setForm(null)
    if (pathname === '/relatorios/novo') navigate('/relatorios', { replace: true })
  }
  function abrirEdicao(r: Relatorio) {
    setAberto(null); setEditId(r.id)
    setForm({ titulo: r.titulo, tipo: r.tipo, data: r.data, conteudo: r.conteudo, investigadores: r.investigadores, links: r.links,
      arquivos: r.arquivos, sigiloso: r.sigiloso, inqueritoId: r.inqueritoId, boletimId: r.boletimId })
  }
  function enviar() {
    if (!form) return
    if (!form.titulo.trim()) { addToast('error', 'Dê um título ao relatório.'); return }
    if (!form.conteudo.trim()) { addToast('error', 'Escreva o conteúdo do relatório.'); return }
    salvar.mutate({ ...form, id: editId ?? undefined, arquivos: form.arquivos.map(a => a.id) }, {
      onSuccess: () => { addToast('success', editId ? 'Relatório atualizado!' : 'Relatório cadastrado!'); fecharForm() },
      onError: e => addToast('error', erroApi(e)),
    })
  }
  async function excluir(r: Relatorio) {
    if (!(await confirmar({ titulo: 'Excluir relatório', mensagem: `Excluir ${r.numero} — "${r.titulo}"? Os arquivos anexados também serão apagados.`, tom: 'perigo', textoConfirmar: 'Excluir' }))) return
    remover.mutate(r.id, { onSuccess: () => { addToast('success', 'Relatório excluído.'); setAberto(null) }, onError: e => addToast('error', erroApi(e)) })
  }

  if (isLoading) return <LoadingHud />

  return (
    <div className="w-full max-w-375 mx-auto p-3 sm:p-6 lg:px-8">
      <CabecalhoPagina sobretitulo="Investigação" titulo="Relatórios" icone={FileSearch}
        descricao="Relatórios produzidos pelos investigadores durante as investigações — organizados, pesquisáveis e com anexos.">
        {podeCadastrar && <BotaoPrimario onClick={() => { setEditId(null); setForm(vazio()) }}><Plus size={15} /> Cadastrar relatório</BotaoPrimario>}
      </CabecalhoPagina>

      {/* Filtros */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-2.5 mb-5">
        <div className="relative lg:w-96">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt3" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por número, título, investigador, conteúdo…" aria-label="Buscar relatórios"
            className="input-gold w-full bg-card border border-bdr2 rounded-lg pl-9 pr-3 py-2 text-sm text-txt" />
        </div>
        <select value={tipo} onChange={e => setTipo(e.target.value)} aria-label="Filtrar por tipo" className="input-gold bg-card border border-bdr2 rounded-lg px-3 py-2 text-sm text-txt">
          <option value="">Todos os tipos</option>
          {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={investigador} onChange={e => setInvestigador(e.target.value ? Number(e.target.value) : '')} aria-label="Filtrar por investigador"
          className="input-gold bg-card border border-bdr2 rounded-lg px-3 py-2 text-sm text-txt">
          <option value="">Todos os investigadores</option>
          {(membros ?? []).map(m => <option key={m.id} value={m.id}>{m.policial}{m.codinome ? ` "${m.codinome}"` : ''}</option>)}
        </select>
        {me?.membroId && (
          <button onClick={() => setMeus(v => !v)} aria-pressed={meus}
            className={`px-3 py-2 rounded-lg text-sm border transition-colors ${meus ? 'bg-gold/15 text-gold3 border-gold/40' : 'text-txt2 border-bdr2 hover:text-txt'}`}>
            Só os meus
          </button>
        )}
        <span className="lg:ml-auto text-xs font-mono text-txt3">{lista.length} de {relatorios?.length ?? 0}</span>
      </div>

      {isError ? (
        <div className="border border-bdr rounded-xl bg-card py-16 text-center text-sm text-red">Não foi possível carregar os relatórios.</div>
      ) : (relatorios?.length ?? 0) === 0 ? (
        <Vazio icone={FilePlus2}>Nenhum relatório cadastrado{podeCadastrar ? ' — clique em “Cadastrar relatório”.' : ' ainda.'}</Vazio>
      ) : lista.length === 0 ? (
        <Vazio icone={Search}>Nenhum relatório encontrado com esses filtros.</Vazio>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {lista.map((r, i) => (
            <motion.button key={r.id} onClick={() => setAberto(r)}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: Math.min(i, 15) * 0.025, ease: EASE }}
              className="group text-left rounded-xl border border-bdr bg-card hover:border-gold/50 transition-colors p-4 flex flex-col gap-2.5 relative overflow-hidden">
              <span aria-hidden className="absolute left-0 top-0 bottom-0 w-1 bg-gold/60 group-hover:bg-gold" />
              <div className="flex items-center gap-2 text-[11px] font-mono text-txt3">
                <span className="text-gold3">{r.numero}</span>
                <span>·</span><span>{dataBR(r.data)}</span>
                {r.sigiloso && <span className="ml-auto inline-flex items-center gap-1 text-red"><Lock size={11} /> Sigiloso</span>}
              </div>
              <p className="font-semibold text-txt leading-snug line-clamp-2">{r.titulo}</p>
              <p className="text-sm text-txt2 line-clamp-3 whitespace-pre-line">{r.conteudo}</p>
              <div className="mt-auto flex items-center gap-3 text-[11px] text-txt3 pt-1">
                {r.tipo && <Selo cor="#a78bfa">{r.tipo}</Selo>}
                <span className="inline-flex items-center gap-1"><Users size={11} /> {r.investigadores.length}</span>
                {r.arquivos.length > 0 && <span className="inline-flex items-center gap-1"><Paperclip size={11} /> {r.arquivos.length}</span>}
                {r.links.length > 0 && <span className="inline-flex items-center gap-1"><Link2 size={11} /> {r.links.length}</span>}
                <span className="ml-auto truncate">por {r.autorNome}</span>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {/* Detalhes */}
      <ModalOverlay open={!!aberto} onClose={() => setAberto(null)} title="RELATÓRIO" maxWidth="max-w-3xl">
        {aberto && (
          <div className="space-y-5">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-txt3 mb-1.5">
                <span className="text-gold3">{aberto.numero}</span>
                <span className="inline-flex items-center gap-1"><Calendar size={11} /> {dataBR(aberto.data)}</span>
                {aberto.tipo && <Selo cor="#a78bfa">{aberto.tipo}</Selo>}
                {aberto.sigiloso && <Selo cor="#d0453a">Sigiloso</Selo>}
              </div>
              <h3 className="text-xl font-semibold text-txt wrap-break-word">{aberto.titulo}</h3>
              <p className="text-xs text-txt3 mt-1">Registrado por {aberto.autorNome} em {new Date(aberto.criadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
            </div>
            <Secao titulo="Investigadores responsáveis" icone={Users}><NomesInvestigadores ids={aberto.investigadores} /></Secao>
            {(aberto.inqueritoId || aberto.boletimId) && (
              <div className="flex flex-wrap gap-2 text-sm">
                {aberto.inqueritoId && <span className="inline-flex items-center gap-1.5 rounded-lg border border-bdr2 px-3 py-1.5 text-txt2"><FolderArchive size={13} className="text-gold2" /> {nomeInq.get(aberto.inqueritoId) ?? `Inquérito #${aberto.inqueritoId}`}</span>}
                {aberto.boletimId && <span className="inline-flex items-center gap-1.5 rounded-lg border border-bdr2 px-3 py-1.5 text-txt2"><ScrollText size={13} className="text-gold2" /> {nomeBol.get(aberto.boletimId) ?? `Boletim #${aberto.boletimId}`}</span>}
              </div>
            )}
            <Secao titulo="Conteúdo" icone={FileSearch}>
              <div className="rounded-lg border border-bdr bg-card2/60 p-4 text-sm text-txt whitespace-pre-line wrap-break-word leading-relaxed">{aberto.conteudo}</div>
            </Secao>
            {aberto.arquivos.length > 0 && <Secao titulo="Arquivos"><ListaArquivos arquivos={aberto.arquivos} /></Secao>}
            {aberto.links.length > 0 && <Secao titulo="Links e evidências" icone={Link2}><ListaLinks links={aberto.links} /></Secao>}
            <HistoricoRegistro historico={aberto.historico} />
            {aberto.podeEditar && (
              <div className="flex gap-2 pt-2 border-t border-bdr">
                <BotaoSecundario onClick={() => abrirEdicao(aberto)}><Pencil size={13} /> Editar</BotaoSecundario>
                <BotaoSecundario onClick={() => excluir(aberto)} className="hover:!text-red"><Trash2 size={13} /> Excluir</BotaoSecundario>
              </div>
            )}
          </div>
        )}
      </ModalOverlay>

      {/* Cadastro / edição */}
      <ModalOverlay open={!!form} onClose={fecharForm} title={editId ? 'EDITAR RELATÓRIO' : 'CADASTRAR RELATÓRIO'} maxWidth="max-w-3xl">
        {form && (
          <div className="space-y-4">
            <Campo rotulo="Título *">
              <input autoFocus value={form.titulo} maxLength={150} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Vigilância no galpão da Rua 8" className={INPUT} />
            </Campo>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo rotulo="Tipo">
                <input value={form.tipo} maxLength={40} list="tipos-relatorio" onChange={e => setForm({ ...form, tipo: e.target.value })} className={INPUT} />
                <datalist id="tipos-relatorio">{TIPOS.map(t => <option key={t} value={t} />)}</datalist>
              </Campo>
              <Campo rotulo="Data *"><input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} className={INPUT} /></Campo>
            </div>
            <Campo rotulo="Investigadores responsáveis" dica="Você entra automaticamente ao cadastrar.">
              <SeletorInvestigadores valor={form.investigadores} onChange={investigadores => setForm({ ...form, investigadores })} />
            </Campo>
            {(canView('inqueritos') || canView('boletins')) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {canView('inqueritos') && (
                  <Campo rotulo="Inquérito vinculado">
                    <select value={form.inqueritoId ?? ''} onChange={e => setForm({ ...form, inqueritoId: e.target.value ? Number(e.target.value) : null })} className={INPUT}>
                      <option value="">Nenhum</option>
                      {(inqueritos ?? []).map(i => <option key={i.id} value={i.id}>{i.numero} · {i.titulo}</option>)}
                    </select>
                  </Campo>
                )}
                {canView('boletins') && (
                  <Campo rotulo="Boletim vinculado">
                    <select value={form.boletimId ?? ''} onChange={e => setForm({ ...form, boletimId: e.target.value ? Number(e.target.value) : null })} className={INPUT}>
                      <option value="">Nenhum</option>
                      {(boletins ?? []).map(b => <option key={b.id} value={b.id}>{b.numero} · {b.titulo}</option>)}
                    </select>
                  </Campo>
                )}
              </div>
            )}
            <Campo rotulo="Conteúdo do relatório *">
              <textarea value={form.conteudo} maxLength={20000} rows={10} onChange={e => setForm({ ...form, conteudo: e.target.value })}
                placeholder="Descreva os fatos apurados, diligências, observações e conclusões…" className={`${INPUT} resize-y min-h-40 leading-relaxed`} />
              <span className="text-[10px] text-txt3 text-right font-mono">{form.conteudo.length}/20000</span>
            </Campo>
            <Campo rotulo="Arquivos do computador"><EditorArquivos area="relatorios" arquivos={form.arquivos} onChange={arquivos => setForm({ ...form, arquivos })} /></Campo>
            <Campo rotulo="Links e evidências"><EditorLinks links={form.links} onChange={links => setForm({ ...form, links })} /></Campo>
            <label className="flex items-start gap-2.5 rounded-lg border border-bdr2 bg-card2/60 px-3 py-2.5 cursor-pointer">
              <input type="checkbox" checked={form.sigiloso} onChange={e => setForm({ ...form, sigiloso: e.target.checked })} className="mt-0.5 accent-[#8b5cf6]" />
              <span className="text-sm text-txt"><Lock size={13} className="inline mr-1 text-red" /> Sigiloso
                <span className="block text-[11px] text-txt3">Só você, os investigadores citados e a gestão de relatórios poderão ver.</span></span>
            </label>
            <div className="flex gap-2 pt-1">
              <BotaoPrimario onClick={enviar} disabled={salvar.isPending} className="flex-1">
                <FileSearch size={14} /> {salvar.isPending ? 'Salvando...' : editId ? 'Salvar alterações' : 'Cadastrar relatório'}
              </BotaoPrimario>
              <BotaoSecundario onClick={fecharForm}>Cancelar</BotaoSecundario>
            </div>
          </div>
        )}
      </ModalOverlay>
    </div>
  )
}
