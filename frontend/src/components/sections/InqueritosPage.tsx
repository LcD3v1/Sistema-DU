import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { FolderArchive, Plus, Search, Pencil, Trash2, Users, Link2, Paperclip, ScrollText, FileSearch, UserX, FileText, Tag } from 'lucide-react'
import {
  inqueritosApi, boletinsApi, relatoriosApi, erroApi, normalizar, dataBR, STATUS_INQUERITO,
  type Inquerito, type InqueritoInput, type StatusInquerito, type ArquivoRef,
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
  EditorArquivos, ListaArquivos, EditorLinks, ListaLinks, SeletorInvestigadores, NomesInvestigadores, HistoricoRegistro,
} from '@/components/investigacao/Campos'

/**
 * Arquivo de Inquéritos — mesmo modelo de estante dos Cursos Internos, adaptado
 * para os inquéritos da unidade: capa de pasta, status, envolvidos, links e
 * arquivos enviados do computador. Mostra os boletins e relatórios vinculados.
 */

const EASE = [0.16, 1, 0.3, 1] as const
const CORES = ['#8b5cf6', '#6d28d9', '#a21caf', '#4c1d95', '#be123c', '#0f766e', '#b45309', '#334155']

type Form = Omit<InqueritoInput, 'arquivos'> & { arquivos: ArquivoRef[] }
const vazio = (): Form => ({
  numero: '', titulo: '', status: 'em_andamento', categoria: '', descricao: '', envolvidos: '', capa: '', cor: CORES[0],
  investigadores: [], links: [], arquivos: [],
})

function Capa({ inq, className = '' }: { inq: Pick<Inquerito, 'titulo' | 'numero' | 'capa' | 'cor' | 'status'>; className?: string }) {
  const [falhou, setFalhou] = useState(false)
  const status = STATUS_INQUERITO[inq.status]
  if (inq.capa && !falhou && linkSeguro(inq.capa)) {
    return (
      <div className={`${className} relative overflow-hidden`}>
        <img src={inq.capa} alt={`Capa de ${inq.titulo}`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFalhou(true)} className="absolute inset-0 w-full h-full object-cover" />
        <span className="absolute bottom-0 inset-x-0 bg-black/70 px-2 py-1 font-mono text-[10px] text-white truncate">{inq.numero || 'IP-DU'}</span>
      </div>
    )
  }
  // Capa gerada: pasta de arquivo com aba, carimbo e número
  return (
    <div className={`${className} relative overflow-hidden text-white p-3 flex flex-col justify-between`}
      style={{ background: `linear-gradient(160deg, ${inq.cor} 0%, ${inq.cor}bb 50%, #0b0812 140%)` }}>
      <span aria-hidden className="absolute -top-px left-3 h-3 w-14 rounded-b-md bg-black/25" />
      <span aria-hidden className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 22px)' }} />
      <div className="relative flex items-center justify-between mt-2">
        <FolderArchive size={16} className="opacity-80" />
        <span className="font-mono text-[9px] tracking-widest opacity-80">DU · DPD</span>
      </div>
      <div className="relative">
        <p className="font-mono text-[10px] opacity-80 mb-1">{inq.numero || 'IP-DU-…'}</p>
        <p className="font-semibold text-sm leading-tight line-clamp-4 break-words">{inq.titulo || 'Sem título'}</p>
      </div>
      <span className="relative self-start rotate-[-6deg] border-2 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider"
        style={{ borderColor: status.cor, color: status.cor, background: '#00000055' }}>{status.rotulo}</span>
    </div>
  )
}

export default function InqueritosPage() {
  const { data: inqueritos, isLoading, isError } = inqueritosApi.useLista()
  const { canView, canEdit } = usePerms()
  const { data: boletins } = boletinsApi.useLista(canView('boletins'))
  const { data: relatorios } = relatoriosApi.useLista(canView('relatorios'))
  const { data: membros } = useMembros()
  const { addToast } = useUIStore()
  const salvar = inqueritosApi.useSalvar()
  const remover = inqueritosApi.useRemover()
  const podeEditar = canEdit('inqueritos')

  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState<StatusInquerito | ''>('')
  const [categoria, setCategoria] = useState('')
  const [aberto, setAberto] = useState<Inquerito | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [editId, setEditId] = useState<number | null>(null)

  const membroPorId = useMemo(() => new Map((membros ?? []).map(m => [m.id, m])), [membros])
  const categorias = useMemo(() => [...new Set((inqueritos ?? []).map(i => i.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [inqueritos])
  const lista = useMemo(() => {
    const termos = normalizar(busca.trim()).split(/\s+/).filter(Boolean)
    return (inqueritos ?? []).filter(i => {
      if (status && i.status !== status) return false
      if (categoria && i.categoria !== categoria) return false
      if (termos.length === 0) return true
      const nomes = i.investigadores.map(id => { const m = membroPorId.get(id); return m ? `${m.policial} ${m.codinome ?? ''}` : '' }).join(' ')
      const texto = normalizar(`${i.numero} ${i.titulo} ${i.categoria} ${i.descricao} ${i.envolvidos} ${nomes}`)
      return termos.every(t => texto.includes(t))
    })
  }, [inqueritos, busca, status, categoria, membroPorId])

  function abrirEdicao(i: Inquerito) {
    setAberto(null); setEditId(i.id)
    setForm({ numero: i.numero, titulo: i.titulo, status: i.status, categoria: i.categoria, descricao: i.descricao, envolvidos: i.envolvidos,
      capa: i.capa, cor: i.cor, investigadores: i.investigadores, links: i.links, arquivos: i.arquivos })
  }
  function enviar() {
    if (!form) return
    if (!form.titulo.trim()) { addToast('error', 'Dê um título ao inquérito.'); return }
    if (form.capa.trim() && !linkSeguro(form.capa.trim())) { addToast('error', 'A capa precisa ser um link de imagem http/https.'); return }
    salvar.mutate({ ...form, capa: form.capa.trim(), id: editId ?? undefined, arquivos: form.arquivos.map(a => a.id) }, {
      onSuccess: () => { addToast('success', editId ? 'Inquérito atualizado!' : 'Inquérito arquivado!'); setForm(null) },
      onError: e => addToast('error', erroApi(e)),
    })
  }
  async function excluir(i: Inquerito) {
    if (!(await confirmar({ titulo: 'Excluir inquérito', mensagem: `Excluir ${i.numero} — "${i.titulo}"? Arquivos enviados serão apagados; boletins e relatórios vinculados perdem só o vínculo.`, tom: 'perigo', textoConfirmar: 'Excluir' }))) return
    remover.mutate(i.id, { onSuccess: () => { addToast('success', 'Inquérito excluído.'); setAberto(null) }, onError: e => addToast('error', erroApi(e)) })
  }

  if (isLoading) return <LoadingHud />

  const bolVinc = aberto ? (boletins ?? []).filter(b => b.inqueritoId === aberto.id) : []
  const relVinc = aberto ? (relatorios ?? []).filter(r => r.inqueritoId === aberto.id) : []

  return (
    <div className="w-full max-w-[1800px] mx-auto p-3 sm:p-6 lg:px-8">
      <CabecalhoPagina sobretitulo="Investigação" titulo="Arquivo de Inquéritos" icone={FolderArchive}
        descricao="Inquéritos da unidade com documentos, imagens e evidências — anexe links ou arquivos direto do computador.">
        {podeEditar && <BotaoPrimario onClick={() => { setEditId(null); setForm(vazio()) }}><Plus size={15} /> Novo inquérito</BotaoPrimario>}
      </CabecalhoPagina>

      {(inqueritos?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-3 mb-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
            <div className="relative sm:w-96">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt3" />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por número, título, envolvidos, investigador…" aria-label="Buscar inquéritos"
                className="input-gold w-full bg-card border border-bdr2 rounded-lg pl-9 pr-3 py-2 text-sm text-txt" />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {(['', ...Object.keys(STATUS_INQUERITO)] as (StatusInquerito | '')[]).map(s => (
                <button key={s || 'todos'} onClick={() => setStatus(s)} aria-pressed={status === s}
                  className={`px-3 py-1 rounded-full text-xs font-mono transition-colors ${status === s ? 'bg-gold/15 text-gold3 border border-gold/40' : 'text-txt2 border border-bdr2 hover:text-txt'}`}>
                  {s ? STATUS_INQUERITO[s].rotulo : 'Todos'}
                </button>
              ))}
            </div>
          </div>
          {categorias.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {['', ...categorias].map(c => (
                <button key={c || 'todas'} onClick={() => setCategoria(c)} aria-pressed={categoria === c}
                  className={`px-2.5 py-0.5 rounded-md text-[11px] transition-colors ${categoria === c ? 'bg-gold/15 text-gold3' : 'text-txt3 hover:text-txt'}`}>
                  <Tag size={10} className="inline mr-1" />{c || 'Todas as categorias'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {isError ? (
        <div className="border border-bdr rounded-xl bg-card py-16 text-center text-sm text-red">Não foi possível carregar o arquivo.</div>
      ) : (inqueritos?.length ?? 0) === 0 ? (
        <Vazio icone={FolderArchive}>Nenhum inquérito arquivado{podeEditar ? ' — clique em “Novo inquérito”.' : ' ainda.'}</Vazio>
      ) : lista.length === 0 ? (
        <Vazio icone={Search}>Nenhum inquérito encontrado.</Vazio>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
          {lista.map((inq, i) => (
            <motion.button key={inq.id} onClick={() => setAberto(inq)} aria-label={`Abrir ${inq.titulo}`}
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: Math.min(i, 20) * 0.03, ease: EASE }}
              className="group text-left">
              <div className="rounded-lg overflow-hidden border border-bdr group-hover:border-gold/50 shadow-lg transition-all group-hover:-translate-y-1 motion-reduce:transform-none">
                <Capa inq={inq} className="w-full aspect-[3/4]" />
              </div>
              <p className="text-sm font-medium text-txt mt-2 line-clamp-2 break-words">{inq.titulo}</p>
              <p className="text-[11px] text-txt3 truncate">{inq.categoria || inq.numero}</p>
            </motion.button>
          ))}
        </div>
      )}

      {/* Detalhes */}
      <ModalOverlay open={!!aberto} onClose={() => setAberto(null)} title="INQUÉRITO" maxWidth="max-w-4xl">
        {aberto && (
          <div className="flex flex-col md:flex-row gap-6">
            <div className="md:w-48 shrink-0 mx-auto w-40">
              <div className="rounded-lg overflow-hidden border border-bdr"><Capa inq={aberto} className="w-full aspect-[3/4]" /></div>
            </div>
            <div className="flex-1 min-w-0 space-y-5">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-txt3 mb-1">
                  <span className="text-gold3 text-sm">{aberto.numero}</span>
                  <Selo cor={STATUS_INQUERITO[aberto.status].cor}>{STATUS_INQUERITO[aberto.status].rotulo}</Selo>
                  {aberto.categoria && <span className="inline-flex items-center gap-1"><Tag size={11} /> {aberto.categoria}</span>}
                </div>
                <h3 className="text-xl font-semibold text-txt break-words">{aberto.titulo}</h3>
                <p className="text-xs text-txt3 mt-1">Aberto por {aberto.autorNome} em {dataBR(aberto.criadoEm)}</p>
              </div>
              <Secao titulo="Investigadores" icone={Users}><NomesInvestigadores ids={aberto.investigadores} /></Secao>
              {aberto.descricao && (
                <Secao titulo="Descrição" icone={FileText}>
                  <div className="rounded-lg border border-bdr bg-card2/60 p-4 text-sm text-txt whitespace-pre-line break-words leading-relaxed">{aberto.descricao}</div>
                </Secao>
              )}
              {aberto.envolvidos && (
                <Secao titulo="Envolvidos (suspeitos, vítimas, testemunhas)" icone={UserX}>
                  <p className="text-sm text-txt2 whitespace-pre-line break-words">{aberto.envolvidos}</p>
                </Secao>
              )}
              {aberto.arquivos.length > 0 && <Secao titulo={`Documentos e arquivos (${aberto.arquivos.length})`} icone={Paperclip}><ListaArquivos arquivos={aberto.arquivos} /></Secao>}
              {aberto.links.length > 0 && <Secao titulo="Links, imagens e evidências" icone={Link2}><ListaLinks links={aberto.links} /></Secao>}
              {(bolVinc.length > 0 || relVinc.length > 0) && (
                <Secao titulo="Registros vinculados" icone={ScrollText}>
                  <ul className="space-y-1.5">
                    {bolVinc.map(b => (
                      <li key={`b${b.id}`} className="flex items-center gap-2 text-sm text-txt2"><ScrollText size={13} className="text-gold2" /><span className="font-mono text-gold3 text-xs">{b.numero}</span> {b.titulo}</li>
                    ))}
                    {relVinc.map(r => (
                      <li key={`r${r.id}`} className="flex items-center gap-2 text-sm text-txt2"><FileSearch size={13} className="text-gold2" /><span className="font-mono text-gold3 text-xs">{r.numero}</span> {r.titulo}</li>
                    ))}
                  </ul>
                </Secao>
              )}
              <HistoricoRegistro historico={aberto.historico} />
              {podeEditar && (
                <div className="flex gap-2 pt-2 border-t border-bdr">
                  <BotaoSecundario onClick={() => abrirEdicao(aberto)}><Pencil size={13} /> Editar</BotaoSecundario>
                  <BotaoSecundario onClick={() => excluir(aberto)} className="hover:!text-red"><Trash2 size={13} /> Excluir</BotaoSecundario>
                </div>
              )}
            </div>
          </div>
        )}
      </ModalOverlay>

      {/* Novo / editar */}
      <ModalOverlay open={!!form} onClose={() => setForm(null)} title={editId ? 'EDITAR INQUÉRITO' : 'NOVO INQUÉRITO'} maxWidth="max-w-4xl">
        {form && (
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-1 min-w-0 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Campo rotulo="Número" dica="Vazio = gerado.">
                  <input value={form.numero} maxLength={40} onChange={e => setForm({ ...form, numero: e.target.value })} placeholder="IP-DU-2026-0001" className={`${INPUT} font-mono`} />
                </Campo>
                <Campo rotulo="Status">
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as StatusInquerito })} className={INPUT}>
                    {(Object.keys(STATUS_INQUERITO) as StatusInquerito[]).map(s => <option key={s} value={s}>{STATUS_INQUERITO[s].rotulo}</option>)}
                  </select>
                </Campo>
                <Campo rotulo="Categoria">
                  <input value={form.categoria} maxLength={40} list="categorias-inq" onChange={e => setForm({ ...form, categoria: e.target.value })} placeholder="Ex.: Homicídio" className={INPUT} />
                  <datalist id="categorias-inq">{categorias.map(c => <option key={c} value={c} />)}</datalist>
                </Campo>
              </div>
              <Campo rotulo="Título *">
                <input autoFocus value={form.titulo} maxLength={150} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Caso Corktown — tráfico de armas" className={INPUT} />
              </Campo>
              <Campo rotulo="Descrição e informações relevantes">
                <textarea value={form.descricao} maxLength={20000} rows={6} onChange={e => setForm({ ...form, descricao: e.target.value })} className={`${INPUT} resize-y leading-relaxed`} />
              </Campo>
              <Campo rotulo="Envolvidos">
                <textarea value={form.envolvidos} maxLength={5000} rows={3} onChange={e => setForm({ ...form, envolvidos: e.target.value })} placeholder="Suspeitos, vítimas, testemunhas…" className={`${INPUT} resize-y`} />
              </Campo>
              <Campo rotulo="Investigadores">
                <SeletorInvestigadores valor={form.investigadores} onChange={investigadores => setForm({ ...form, investigadores })} />
              </Campo>
              <Campo rotulo="Documentos e arquivos do computador" dica="PDFs, documentos, planilhas, imagens, áudio e vídeo — até 10 MB cada.">
                <EditorArquivos area="inqueritos" arquivos={form.arquivos} onChange={arquivos => setForm({ ...form, arquivos })} />
              </Campo>
              <Campo rotulo="Links de documentos, imagens e evidências"><EditorLinks links={form.links} onChange={links => setForm({ ...form, links })} /></Campo>
              <div className="flex gap-2 pt-1">
                <BotaoPrimario onClick={enviar} disabled={salvar.isPending} className="flex-1">
                  <FolderArchive size={14} /> {salvar.isPending ? 'Salvando...' : editId ? 'Salvar alterações' : 'Arquivar inquérito'}
                </BotaoPrimario>
                <BotaoSecundario onClick={() => setForm(null)}>Cancelar</BotaoSecundario>
              </div>
            </div>
            <div className="md:w-48 shrink-0 space-y-3">
              <p className="font-mono text-[10px] text-txt2 tracking-wider uppercase">Prévia</p>
              <div className="rounded-lg overflow-hidden border border-bdr w-40 md:w-full mx-auto"><Capa key={form.capa} inq={form} className="w-full aspect-[3/4]" /></div>
              <Campo rotulo="Capa (link)">
                <input value={form.capa} maxLength={2048} inputMode="url" onChange={e => setForm({ ...form, capa: e.target.value })} placeholder="https://... (opcional)"
                  className={`${INPUT} font-mono text-xs ${form.capa && !linkSeguro(form.capa.trim()) ? 'border-red/60' : ''}`} />
              </Campo>
              <Campo rotulo="Cor da pasta">
                <div className="flex gap-2 flex-wrap">
                  {CORES.map(c => (
                    <button key={c} type="button" onClick={() => setForm({ ...form, cor: c })} aria-label={`Cor ${c}`} aria-pressed={form.cor === c}
                      className={`w-7 h-7 rounded-full border-2 transition-transform ${form.cor === c ? 'border-white scale-110' : 'border-transparent'}`} style={{ background: c }} />
                  ))}
                </div>
              </Campo>
            </div>
          </div>
        )}
      </ModalOverlay>
    </div>
  )
}
