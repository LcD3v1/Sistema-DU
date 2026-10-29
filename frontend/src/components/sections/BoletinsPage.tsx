import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ScrollText, Plus, Search, Pencil, Trash2, Calendar, MapPin, Users, Image as ImageIcon, Link2, Paperclip, FolderArchive, StickyNote, FileText } from 'lucide-react'
import {
  boletinsApi, inqueritosApi, erroApi, normalizar, hojeISO, dataBR, STATUS_BOLETIM,
  type Boletim, type BoletimInput, type StatusBoletim, type ArquivoRef,
} from '@/hooks/useInvestigacao'
import { useMembros } from '@/hooks/useMembros'
import { usePerms } from '@/hooks/usePerms'
import { useUIStore } from '@/store/uiStore'
import LoadingHud from '@/components/ui/LoadingHud'
import ModalOverlay from '@/components/ui/ModalOverlay'
import { confirmar } from '@/lib/dialogo'
import { linkSeguro } from '@/lib/plataformas'
import {
  INPUT, Campo, CabecalhoPagina, BotaoPrimario, BotaoSecundario, Selo, Vazio, Secao,
  EditorArquivos, ListaArquivos, EditorLinks, ListaLinks, EditorImagens, SeletorInvestigadores, NomesInvestigadores, HistoricoRegistro,
} from '@/components/investigacao/Campos'

/**
 * Boletins — módulo próprio de registro e consulta dos boletins produzidos pela DU
 * (independente dos relatórios). Número próprio ou gerado (BO-DU-ANO-0001).
 */

const EASE = [0.16, 1, 0.3, 1] as const

type Form = Omit<BoletimInput, 'arquivos'> & { arquivos: ArquivoRef[] }
const vazio = (): Form => ({
  numero: '', titulo: '', status: 'aberto', data: hojeISO(), local: '', investigadores: [], descricao: '', observacoes: '',
  imagens: [], links: [], arquivos: [], inqueritoId: null,
})

export default function BoletinsPage() {
  const { data: boletins, isLoading, isError } = boletinsApi.useLista()
  const { canView, canEdit } = usePerms()
  const { data: inqueritos } = inqueritosApi.useLista(canView('inqueritos'))
  const { data: membros } = useMembros()
  const { addToast } = useUIStore()
  const salvar = boletinsApi.useSalvar()
  const remover = boletinsApi.useRemover()
  const podeEditar = canEdit('boletins')

  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState<StatusBoletim | ''>('')
  const [investigador, setInvestigador] = useState<number | ''>('')
  const [aberto, setAberto] = useState<Boletim | null>(null)
  const [foto, setFoto] = useState<string | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [editId, setEditId] = useState<number | null>(null)

  const nomeInq = useMemo(() => new Map((inqueritos ?? []).map(i => [i.id, `${i.numero} · ${i.titulo}`])), [inqueritos])
  const membroPorId = useMemo(() => new Map((membros ?? []).map(m => [m.id, m])), [membros])
  const contagem = useMemo(() => {
    const c: Record<string, number> = {}
    for (const b of boletins ?? []) c[b.status] = (c[b.status] ?? 0) + 1
    return c
  }, [boletins])

  const lista = useMemo(() => {
    const termos = normalizar(busca.trim()).split(/\s+/).filter(Boolean)
    return (boletins ?? []).filter(b => {
      if (status && b.status !== status) return false
      if (investigador && !b.investigadores.includes(investigador)) return false
      if (termos.length === 0) return true
      const nomes = b.investigadores.map(id => { const m = membroPorId.get(id); return m ? `${m.policial} ${m.codinome ?? ''}` : '' }).join(' ')
      const texto = normalizar(`${b.numero} ${b.titulo} ${b.local} ${b.descricao} ${b.observacoes} ${b.autorNome} ${nomes}`)
      return termos.every(t => texto.includes(t))
    })
  }, [boletins, busca, status, investigador, membroPorId])

  function abrirEdicao(b: Boletim) {
    setAberto(null); setEditId(b.id)
    setForm({ numero: b.numero, titulo: b.titulo, status: b.status, data: b.data, local: b.local, investigadores: b.investigadores,
      descricao: b.descricao, observacoes: b.observacoes, imagens: b.imagens, links: b.links, arquivos: b.arquivos, inqueritoId: b.inqueritoId })
  }
  function enviar() {
    if (!form) return
    if (!form.titulo.trim()) { addToast('error', 'Informe o título ou assunto.'); return }
    if (!form.descricao.trim()) { addToast('error', 'Descreva os fatos.'); return }
    salvar.mutate({ ...form, id: editId ?? undefined, arquivos: form.arquivos.map(a => a.id) }, {
      onSuccess: () => { addToast('success', editId ? 'Boletim atualizado!' : 'Boletim registrado!'); setForm(null) },
      onError: e => addToast('error', erroApi(e)),
    })
  }
  async function excluir(b: Boletim) {
    if (!(await confirmar({ titulo: 'Excluir boletim', mensagem: `Excluir ${b.numero} — "${b.titulo}"? Os arquivos anexados também serão apagados.`, tom: 'perigo', textoConfirmar: 'Excluir' }))) return
    remover.mutate(b.id, { onSuccess: () => { addToast('success', 'Boletim excluído.'); setAberto(null) }, onError: e => addToast('error', erroApi(e)) })
  }

  if (isLoading) return <LoadingHud />

  return (
    <div className="w-full max-w-375 mx-auto p-3 sm:p-6 lg:px-8">
      <CabecalhoPagina sobretitulo="Investigação" titulo="Boletins" icone={ScrollText}
        descricao="Registro e consulta dos boletins da unidade, com investigadores responsáveis, imagens, evidências e histórico.">
        {podeEditar && <BotaoPrimario onClick={() => { setEditId(null); setForm(vazio()) }}><Plus size={15} /> Registrar boletim</BotaoPrimario>}
      </CabecalhoPagina>

      {/* Status rápidos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
        {(Object.keys(STATUS_BOLETIM) as StatusBoletim[]).map(s => (
          <button key={s} onClick={() => setStatus(v => v === s ? '' : s)} aria-pressed={status === s}
            className={`rounded-xl border px-4 py-3 text-left transition-colors ${status === s ? 'border-gold/60 bg-gold/10' : 'border-bdr bg-card hover:border-gold/30'}`}>
            <p className="text-2xl font-bold text-txt">{contagem[s] ?? 0}</p>
            <p className="text-[11px] font-mono uppercase tracking-wider" style={{ color: STATUS_BOLETIM[s].cor }}>{STATUS_BOLETIM[s].rotulo}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-2.5 mb-5">
        <div className="relative lg:w-96">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt3" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por número do boletim, assunto, local…" aria-label="Buscar boletins"
            className="input-gold w-full bg-card border border-bdr2 rounded-lg pl-9 pr-3 py-2 text-sm text-txt" />
        </div>
        <select value={investigador} onChange={e => setInvestigador(e.target.value ? Number(e.target.value) : '')} aria-label="Filtrar por investigador"
          className="input-gold bg-card border border-bdr2 rounded-lg px-3 py-2 text-sm text-txt">
          <option value="">Todos os investigadores</option>
          {(membros ?? []).map(m => <option key={m.id} value={m.id}>{m.policial}{m.codinome ? ` "${m.codinome}"` : ''}</option>)}
        </select>
        <span className="lg:ml-auto text-xs font-mono text-txt3">{lista.length} de {boletins?.length ?? 0}</span>
      </div>

      {isError ? (
        <div className="border border-bdr rounded-xl bg-card py-16 text-center text-sm text-red">Não foi possível carregar os boletins.</div>
      ) : (boletins?.length ?? 0) === 0 ? (
        <Vazio icone={ScrollText}>Nenhum boletim registrado{podeEditar ? ' — clique em “Registrar boletim”.' : ' ainda.'}</Vazio>
      ) : lista.length === 0 ? (
        <Vazio icone={Search}>Nenhum boletim encontrado com esses filtros.</Vazio>
      ) : (
        <div className="rounded-xl border border-bdr bg-card overflow-hidden divide-y divide-bdr">
          {lista.map((b, i) => (
            <motion.button key={b.id} onClick={() => setAberto(b)}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: Math.min(i, 20) * 0.02, ease: EASE }}
              className="w-full text-left flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3.5 hover:bg-gold/5 transition-colors">
              <div className="sm:w-44 shrink-0">
                <p className="font-mono text-sm text-gold3">{b.numero}</p>
                <p className="text-[11px] text-txt3 font-mono">{dataBR(b.data)}</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-txt truncate">{b.titulo}</p>
                <p className="text-xs text-txt3 truncate">{b.local ? <><MapPin size={10} className="inline mr-1" />{b.local}</> : b.descricao}</p>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-txt3 shrink-0">
                {b.imagens.length > 0 && <span className="inline-flex items-center gap-1"><ImageIcon size={11} /> {b.imagens.length}</span>}
                {b.arquivos.length > 0 && <span className="inline-flex items-center gap-1"><Paperclip size={11} /> {b.arquivos.length}</span>}
                <span className="inline-flex items-center gap-1"><Users size={11} /> {b.investigadores.length}</span>
                <Selo cor={STATUS_BOLETIM[b.status].cor}>{STATUS_BOLETIM[b.status].rotulo}</Selo>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {/* Detalhes */}
      <ModalOverlay open={!!aberto} onClose={() => setAberto(null)} title="BOLETIM" maxWidth="max-w-3xl">
        {aberto && (
          <div className="space-y-5">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-txt3 mb-1.5">
                <span className="text-gold3 text-sm">{aberto.numero}</span>
                <Selo cor={STATUS_BOLETIM[aberto.status].cor}>{STATUS_BOLETIM[aberto.status].rotulo}</Selo>
              </div>
              <h3 className="text-xl font-semibold text-txt wrap-break-word">{aberto.titulo}</h3>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-txt2 mt-1.5">
                <span className="inline-flex items-center gap-1"><Calendar size={12} /> {dataBR(aberto.data)}</span>
                {aberto.local && <span className="inline-flex items-center gap-1"><MapPin size={12} /> {aberto.local}</span>}
                {aberto.inqueritoId && <span className="inline-flex items-center gap-1"><FolderArchive size={12} /> {nomeInq.get(aberto.inqueritoId) ?? `Inquérito #${aberto.inqueritoId}`}</span>}
              </div>
              <p className="text-xs text-txt3 mt-1">Registrado por {aberto.autorNome} em {new Date(aberto.criadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
            </div>
            <Secao titulo="Investigadores responsáveis" icone={Users}><NomesInvestigadores ids={aberto.investigadores} /></Secao>
            <Secao titulo="Descrição dos fatos" icone={FileText}>
              <div className="rounded-lg border border-bdr bg-card2/60 p-4 text-sm text-txt whitespace-pre-line wrap-break-word leading-relaxed">{aberto.descricao}</div>
            </Secao>
            {aberto.observacoes && (
              <Secao titulo="Observações complementares" icone={StickyNote}>
                <p className="text-sm text-txt2 whitespace-pre-line wrap-break-word">{aberto.observacoes}</p>
              </Secao>
            )}
            {aberto.imagens.length > 0 && (
              <Secao titulo={`Imagens (${aberto.imagens.length})`} icone={ImageIcon}>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {aberto.imagens.filter(linkSeguro).map((src, i) => (
                    <button key={`${src}-${i}`} onClick={() => setFoto(src)} className="aspect-square rounded-lg overflow-hidden border border-bdr hover:border-gold/60">
                      <img src={src} alt={`Imagem ${i + 1} do boletim`} referrerPolicy="no-referrer" loading="lazy" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </Secao>
            )}
            {aberto.arquivos.length > 0 && <Secao titulo="Arquivos"><ListaArquivos arquivos={aberto.arquivos} /></Secao>}
            {aberto.links.length > 0 && <Secao titulo="Outros links e evidências" icone={Link2}><ListaLinks links={aberto.links} /></Secao>}
            <HistoricoRegistro historico={aberto.historico} />
            {podeEditar && (
              <div className="flex gap-2 pt-2 border-t border-bdr">
                <BotaoSecundario onClick={() => abrirEdicao(aberto)}><Pencil size={13} /> Editar</BotaoSecundario>
                <BotaoSecundario onClick={() => excluir(aberto)} className="hover:!text-red"><Trash2 size={13} /> Excluir</BotaoSecundario>
              </div>
            )}
          </div>
        )}
      </ModalOverlay>

      {/* Visualizar imagem */}
      <ModalOverlay open={!!foto} onClose={() => setFoto(null)} title="IMAGEM" maxWidth="max-w-5xl">
        {foto && <img src={foto} alt="Imagem do boletim ampliada" referrerPolicy="no-referrer" className="w-full max-h-[75vh] object-contain rounded-lg" />}
      </ModalOverlay>

      {/* Registro / edição */}
      <ModalOverlay open={!!form} onClose={() => setForm(null)} title={editId ? 'EDITAR BOLETIM' : 'REGISTRAR BOLETIM'} maxWidth="max-w-3xl">
        {form && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Campo rotulo="Número / identificação" dica="Vazio = gerado automaticamente.">
                <input value={form.numero} maxLength={40} onChange={e => setForm({ ...form, numero: e.target.value })} placeholder="BO-DU-2026-0001" className={`${INPUT} font-mono`} />
              </Campo>
              <Campo rotulo="Data *"><input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} className={INPUT} /></Campo>
              <Campo rotulo="Status">
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as StatusBoletim })} className={INPUT}>
                  {(Object.keys(STATUS_BOLETIM) as StatusBoletim[]).map(s => <option key={s} value={s}>{STATUS_BOLETIM[s].rotulo}</option>)}
                </select>
              </Campo>
            </div>
            <Campo rotulo="Título ou assunto *">
              <input autoFocus value={form.titulo} maxLength={150} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Furto qualificado em joalheria" className={INPUT} />
            </Campo>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo rotulo="Local da ocorrência / investigação">
                <input value={form.local} maxLength={150} onChange={e => setForm({ ...form, local: e.target.value })} placeholder="Ex.: Downtown, Av. Michigan" className={INPUT} />
              </Campo>
              {canView('inqueritos') && (
                <Campo rotulo="Inquérito vinculado">
                  <select value={form.inqueritoId ?? ''} onChange={e => setForm({ ...form, inqueritoId: e.target.value ? Number(e.target.value) : null })} className={INPUT}>
                    <option value="">Nenhum</option>
                    {(inqueritos ?? []).map(i => <option key={i.id} value={i.id}>{i.numero} · {i.titulo}</option>)}
                  </select>
                </Campo>
              )}
            </div>
            <Campo rotulo="Investigadores responsáveis">
              <SeletorInvestigadores valor={form.investigadores} onChange={investigadores => setForm({ ...form, investigadores })} />
            </Campo>
            <Campo rotulo="Descrição detalhada dos fatos *">
              <textarea value={form.descricao} maxLength={20000} rows={8} onChange={e => setForm({ ...form, descricao: e.target.value })}
                placeholder="Relate os fatos em ordem cronológica: o que aconteceu, quem estava envolvido, como e quando…" className={`${INPUT} resize-y min-h-36 leading-relaxed`} />
            </Campo>
            <Campo rotulo="Observações complementares">
              <textarea value={form.observacoes} maxLength={5000} rows={3} onChange={e => setForm({ ...form, observacoes: e.target.value })} className={`${INPUT} resize-y`} />
            </Campo>
            <Campo rotulo="Imagens (links)" dica="Adicione quantas imagens precisar — cada uma por link http/https.">
              <EditorImagens imagens={form.imagens} onChange={imagens => setForm({ ...form, imagens })} />
            </Campo>
            <Campo rotulo="Arquivos do computador"><EditorArquivos area="boletins" arquivos={form.arquivos} onChange={arquivos => setForm({ ...form, arquivos })} /></Campo>
            <Campo rotulo="Outros links ou evidências"><EditorLinks links={form.links} onChange={links => setForm({ ...form, links })} /></Campo>
            <div className="flex gap-2 pt-1">
              <BotaoPrimario onClick={enviar} disabled={salvar.isPending} className="flex-1">
                <ScrollText size={14} /> {salvar.isPending ? 'Salvando...' : editId ? 'Salvar alterações' : 'Registrar boletim'}
              </BotaoPrimario>
              <BotaoSecundario onClick={() => setForm(null)}>Cancelar</BotaoSecundario>
            </div>
          </div>
        )}
      </ModalOverlay>
    </div>
  )
}
