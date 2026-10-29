import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  ClipboardList, Plus, Search, Trash2, Users, MapPin, CalendarDays, Target, AtSign, X, UserRound, FileText,
  Lock, ShieldCheck, Activity, History, GitBranch,
} from 'lucide-react'
import {
  useRegistrosInvestigacao, useRegistrarInvestigacao, useAndamentoInvestigacao, useExcluirInvestigacao,
  MOTIVO_INVESTIGACAO, LOCAL_INVESTIGACAO, APROVACAO_INVESTIGACAO, ANDAMENTO_INVESTIGACAO, quandoInvestigacao, dataHoraBR,
  horaAgora,
  type RegistroInvestigacao, type RegistroInvestigacaoInput, type MotivoInvestigacao, type LocalInvestigacao,
  type AprovacaoInvestigacao, type AndamentoInvestigacao,
} from '@/hooks/useRegistrosInvestigacao'
import { erroApi, normalizar, hojeISO } from '@/hooks/useInvestigacao'
import { useMembros } from '@/hooks/useMembros'
import { useMe } from '@/hooks/useMe'
import { usePerms } from '@/hooks/usePerms'
import { useUIStore } from '@/store/uiStore'
import LoadingHud from '@/components/ui/LoadingHud'
import ModalOverlay from '@/components/ui/ModalOverlay'
import { confirmar } from '@/lib/dialogo'
import { INPUT, Campo, CabecalhoPagina, BotaoPrimario, BotaoSecundario, Selo, Vazio, Secao } from '@/components/investigacao/Campos'
import type { Membro } from '@/types'

/**
 * Registro de Investigação — pedido para abrir uma investigação: nome, data, participantes
 * marcados por @ (inclusive quem pede), motivo e local (Capital, Detroit ou as duas).
 * Privado: cada um vê só os pedidos que fez ou em que foi marcado (todos = acesso total ou gestão/ver).
 * A gestão autoriza/nega e exclui; o andamento só o responsável e os participantes mudam.
 */

const EASE = [0.16, 1, 0.3, 1] as const

/** Situação única para filtrar: aprovação enquanto não autorizada; depois, o andamento. */
type Situacao = Exclude<AprovacaoInvestigacao, 'autorizada'> | AndamentoInvestigacao
const situacao = (r: RegistroInvestigacao): Situacao => r.aprovacao === 'autorizada' ? r.andamento : r.aprovacao
const SITUACOES: Record<Situacao, { rotulo: string; cor: string }> = {
  pendente: APROVACAO_INVESTIGACAO.pendente, negada: APROVACAO_INVESTIGACAO.negada, ...ANDAMENTO_INVESTIGACAO,
}

const vazio = (): RegistroInvestigacaoInput => ({ nome: '', data: hojeISO(), hora: horaAgora(), participantes: [], motivo: 'investigacao', detalhes: '', local: 'capital' })

/** Codinome primeiro (regra da DU). */
const codinome = (m: Pick<Membro, 'codinome' | 'policial'>) => m.codinome?.trim() || m.policial

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo}
      className={`px-3 py-1.5 rounded-lg text-sm transition-colors border ${ativo ? 'bg-gold/15 text-gold3 border-gold/50' : 'text-txt2 border-bdr2 hover:text-txt hover:border-gold/30'}`}>
      {children}
    </button>
  )
}

/** Marca participantes como menção (@codinome), mostrando o ID (passaporte) de cada um. */
function SeletorParticipantes({ valor, onChange, meuMembroId }: { valor: number[]; onChange: (ids: number[]) => void; meuMembroId: number | null }) {
  const { data: membros } = useMembros()
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(false)
  const porId = useMemo(() => new Map((membros ?? []).map(m => [m.id, m])), [membros])
  const opcoes = useMemo(() => {
    const t = normalizar(busca.trim().replace(/^@/, ''))
    return (membros ?? [])
      .filter(m => !valor.includes(m.id) && m.status !== 'Inativo')
      .filter(m => !t || normalizar(`${m.codinome ?? ''} ${m.policial} ${m.passaporte} ${m.badge}`).includes(t))
      .slice(0, 8)
  }, [membros, busca, valor])
  const adicionar = (id: number) => { onChange([...valor, id]); setBusca('') }

  return (
    <div className="space-y-2">
      {valor.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {valor.map(id => {
            const m = porId.get(id)
            return (
              <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 pl-2.5 pr-1 py-0.5 text-xs text-txt">
                <span className="text-gold3">@{m ? codinome(m) : `#${id}`}</span>
                {m?.passaporte && <span className="font-mono text-txt3">ID {m.passaporte}</span>}
                <button type="button" onClick={() => onChange(valor.filter(x => x !== id))} aria-label="Remover participante" className="p-0.5 text-txt3 hover:text-red"><X size={12} /></button>
              </span>
            )
          })}
        </div>
      )}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <AtSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gold2" />
          <input value={busca} onChange={e => { setBusca(e.target.value); setAberto(true) }} onFocus={() => setAberto(true)}
            onBlur={() => setTimeout(() => setAberto(false), 150)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (opcoes[0]) adicionar(opcoes[0].id) } }}
            placeholder="Mencione o investigador pelo codinome ou ID" aria-label="Mencionar participante"
            className={`${INPUT} pl-9`} />
          {aberto && opcoes.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full rounded-lg border border-bdr2 bg-card shadow-2xl overflow-hidden">
              {opcoes.map(m => (
                <li key={m.id}>
                  <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => adicionar(m.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-txt2 hover:bg-gold/10 hover:text-txt">
                    <UserRound size={13} className="text-txt3" />
                    <span className="flex-1 truncate"><span className="text-gold3">@{codinome(m)}</span></span>
                    {m.passaporte && <span className="text-[11px] font-mono text-txt3">ID {m.passaporte}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {meuMembroId && !valor.includes(meuMembroId) && (
          <BotaoSecundario type="button" onClick={() => onChange([...valor, meuMembroId])}><Plus size={14} /> Me incluir</BotaoSecundario>
        )}
      </div>
    </div>
  )
}

export default function RegistroInvestigacaoPage() {
  const { data: registros, isLoading, isError } = useRegistrosInvestigacao()
  const { data: me } = useMe()
  const navigate = useNavigate()
  const { canView, canEdit } = usePerms()
  const { addToast } = useUIStore()
  const registrar = useRegistrarInvestigacao()
  const andamentoMut = useAndamentoInvestigacao()
  const excluirMut = useExcluirInvestigacao()
  const podeRegistrar = canEdit('investigacoes')
  const podeGerir = canEdit('investigacoes_gestao')
  const veTodas = canView('investigacoes_gestao')

  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState<Situacao | ''>('')
  const [abertoId, setAbertoId] = useState<number | null>(null)
  const [form, setForm] = useState<RegistroInvestigacaoInput | null>(null)
  const [novoAndamento, setNovoAndamento] = useState<AndamentoInvestigacao>('em_andamento')
  const [nota, setNota] = useState('')
  // Detalhe sempre pela lista atual (atualiza sozinho quando alguém muda o andamento)
  const aberto = (registros ?? []).find(r => r.id === abertoId) ?? null
  const abrir = (r: RegistroInvestigacao) => {
    setAbertoId(r.id); setNota('')
    setNovoAndamento(r.andamento === 'aguardando' ? 'em_andamento' : r.andamento === 'em_andamento' ? 'concluida' : 'em_andamento')
  }

  const lista = useMemo(() => {
    const termos = normalizar(busca.trim()).split(/\s+/).filter(Boolean)
    return (registros ?? []).filter(r => {
      if (status && situacao(r) !== status) return false
      if (termos.length === 0) return true
      const texto = normalizar(`${r.nome} ${r.detalhes} ${MOTIVO_INVESTIGACAO[r.motivo]} ${LOCAL_INVESTIGACAO[r.local]} ${r.autorNome} ${r.participantes.map(p => `${p.codinome} ${p.passaporte}`).join(' ')}`)
      return termos.every(t => texto.includes(t))
    })
  }, [registros, busca, status])

  function novo() {
    const f = vazio()
    if (me?.membroId) f.participantes = [me.membroId]   // quem pede já entra como participante
    setForm(f)
  }
  function enviar() {
    if (!form) return
    if (!form.nome.trim()) { addToast('error', 'Dê um nome à investigação.'); return }
    if (!/^\d{2}:\d{2}$/.test(form.hora)) { addToast('error', 'Informe o horário da investigação.'); return }
    if (form.participantes.length === 0) { addToast('error', 'Marque ao menos um participante.'); return }
    if (form.motivo === 'outro' && !form.detalhes.trim()) { addToast('error', 'Descreva o motivo.'); return }
    registrar.mutate(form, {
      onSuccess: () => { addToast('success', 'Solicitação enviada! Os participantes foram avisados.'); setForm(null) },
      onError: e => addToast('error', erroApi(e)),
    })
  }
  function atualizarAndamento(r: RegistroInvestigacao) {
    andamentoMut.mutate({ id: r.id, andamento: novoAndamento, nota: nota.trim() }, {
      onSuccess: () => { addToast('success', `Andamento: ${ANDAMENTO_INVESTIGACAO[novoAndamento].rotulo}.`); setNota('') },
      onError: e => addToast('error', erroApi(e)),
    })
  }
  async function excluir(r: RegistroInvestigacao) {
    if (!(await confirmar({ titulo: 'Excluir registro', mensagem: `Excluir o pedido "${r.nome}"?`, tom: 'perigo', textoConfirmar: 'Excluir' }))) return
    excluirMut.mutate(r.id, { onSuccess: () => { addToast('success', 'Registro excluído.'); setAbertoId(null) }, onError: e => addToast('error', erroApi(e)) })
  }

  if (isLoading) return <LoadingHud />

  return (
    <div className="w-full max-w-450 mx-auto p-3 sm:p-6 lg:px-8">
      <CabecalhoPagina sobretitulo="Investigação" titulo="Saídas à Paisana" icone={ClipboardList}
        descricao="Solicite uma investigação, acompanhe a aprovação, os participantes e o andamento de cada uma.">
        {podeRegistrar && <BotaoPrimario onClick={novo}><Plus size={15} /> Solicitar investigação</BotaoPrimario>}
      </CabecalhoPagina>

      <p className="flex items-center gap-2 text-xs text-txt3 mb-4">
        <Lock size={12} className="text-gold2" />
        {veTodas ? 'Investigações privadas — você vê todas porque tem acesso de gestão.' : 'Investigações privadas — você vê só as que solicitou ou em que foi marcado.'}
      </p>

      {(registros?.length ?? 0) > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 mb-5">
          <div className="relative sm:w-96">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt3" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, participante, motivo, local…" aria-label="Buscar investigações"
              className="input-gold w-full bg-card border border-bdr2 rounded-lg pl-9 pr-3 py-2 text-sm text-txt" />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(['', ...Object.keys(SITUACOES)] as (Situacao | '')[]).map(s => (
              <button key={s || 'todos'} onClick={() => setStatus(s)} aria-pressed={status === s}
                className={`px-3 py-1 rounded-full text-xs font-mono transition-colors ${status === s ? 'bg-gold/15 text-gold3 border border-gold/40' : 'text-txt2 border border-bdr2 hover:text-txt'}`}>
                {s ? SITUACOES[s].rotulo : 'Todas'}
              </button>
            ))}
          </div>
        </div>
      )}

      {isError ? (
        <div className="border border-bdr rounded-xl bg-card py-16 text-center text-sm text-red">Não foi possível carregar os registros.</div>
      ) : (registros?.length ?? 0) === 0 ? (
        <Vazio icone={ClipboardList}>Nenhuma investigação para você{podeRegistrar ? ' — clique em “Solicitar investigação”.' : ' ainda.'}</Vazio>
      ) : lista.length === 0 ? (
        <Vazio icone={Search}>Nenhum registro encontrado.</Vazio>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {lista.map((r, i) => {
            const ap = APROVACAO_INVESTIGACAO[r.aprovacao]
            const an = ANDAMENTO_INVESTIGACAO[r.andamento]
            return (
              <motion.button key={r.id} onClick={() => abrir(r)} aria-label={`Abrir ${r.nome}`}
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: Math.min(i, 20) * 0.03, ease: EASE }}
                className="text-left rounded-xl border border-bdr bg-card p-4 hover:border-gold/50 transition-colors space-y-3">
                <div className="space-y-1.5">
                  <p className="font-semibold text-txt wrap-break-word">{r.nome}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Selo cor={ap.cor}>{ap.rotulo}</Selo>
                    {r.aprovacao === 'autorizada' && <Selo cor={an.cor}>{an.rotulo}</Selo>}
                    {r.souResponsavel ? <span className="text-[11px] font-mono text-gold3">· Responsável</span>
                      : r.participantes.some(p => p.id === me?.membroId) && <span className="text-[11px] font-mono text-gold3">· Você participa</span>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-txt2">
                  <span className="inline-flex items-center gap-1"><CalendarDays size={12} className="text-gold2" /> {quandoInvestigacao(r)}</span>
                  <span className="inline-flex items-center gap-1"><Target size={12} className="text-gold2" /> {MOTIVO_INVESTIGACAO[r.motivo]}</span>
                  <span className="inline-flex items-center gap-1"><MapPin size={12} className="text-gold2" /> {LOCAL_INVESTIGACAO[r.local]}</span>
                </div>
                <p className="text-xs text-txt3 line-clamp-2">
                  {r.participantes.map(p => `@${p.codinome}`).join(' ')}
                </p>
              </motion.button>
            )
          })}
        </div>
      )}

      {/* Detalhes */}
      <ModalOverlay open={!!aberto} onClose={() => setAbertoId(null)} title="SAÍDA À PAISANA" maxWidth="max-w-2xl">
        {aberto && (
          <div className="space-y-5">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <Selo cor={APROVACAO_INVESTIGACAO[aberto.aprovacao].cor}>{APROVACAO_INVESTIGACAO[aberto.aprovacao].rotulo}</Selo>
                {aberto.aprovacao === 'autorizada' && (
                  <Selo cor={ANDAMENTO_INVESTIGACAO[aberto.andamento].cor}>{ANDAMENTO_INVESTIGACAO[aberto.andamento].rotulo}</Selo>
                )}
              </div>
              <h3 className="text-xl font-semibold text-txt wrap-break-word">{aberto.nome}</h3>
              <p className="text-xs text-txt3 mt-1">Responsável: <strong className="text-txt2 font-medium">{aberto.autorNome}</strong> · solicitada em {dataHoraBR(aberto.criadoEm)}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Secao titulo="Data e horário" icone={CalendarDays}><p className="text-sm text-txt">{quandoInvestigacao(aberto)}</p></Secao>
              <Secao titulo="Motivo" icone={Target}><p className="text-sm text-txt">{MOTIVO_INVESTIGACAO[aberto.motivo]}</p></Secao>
              <Secao titulo="Local" icone={MapPin}><p className="text-sm text-txt">{LOCAL_INVESTIGACAO[aberto.local]}</p></Secao>
            </div>
            <Secao titulo={`Participantes (${aberto.participantes.length})`} icone={Users}>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {aberto.participantes.map(p => (
                  <li key={p.id} className="flex items-center gap-2 rounded-lg border border-bdr bg-card2 px-3 py-2 text-sm">
                    <AtSign size={13} className="text-gold2 shrink-0" />
                    <span className="flex-1 min-w-0 truncate text-txt">{p.codinome}</span>
                    <span className="font-mono text-[11px] text-txt3">ID {p.passaporte || '—'}</span>
                  </li>
                ))}
              </ul>
            </Secao>
            {aberto.detalhes && (
              <Secao titulo="Detalhes" icone={FileText}>
                <div className="rounded-lg border border-bdr bg-card2/60 p-3 text-sm text-txt whitespace-pre-line wrap-break-word">{aberto.detalhes}</div>
              </Secao>
            )}
            <Secao titulo="Aprovação" icone={ShieldCheck}>
              <p className="text-sm text-txt2">
                {aberto.aprovacao === 'pendente' ? 'Aguardando quem aprova autorizar ou negar. Ao ser autorizada, ela já começa em andamento.' : (
                  <>
                    {APROVACAO_INVESTIGACAO[aberto.aprovacao].rotulo} por <strong className="text-txt font-medium">{aberto.decididoPor}</strong>
                    {aberto.decididoEm ? ` em ${dataHoraBR(aberto.decididoEm)}` : ''}{aberto.observacao ? ` · ${aberto.observacao}` : ''}
                  </>
                )}
              </p>
            </Secao>

            {aberto.aprovacao === 'autorizada' && (
              <Secao titulo="Andamento" icone={Activity}>
                {aberto.podeAtualizar ? (
                  <div className="space-y-2 rounded-lg border border-bdr bg-card2/60 p-3">
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(ANDAMENTO_INVESTIGACAO) as AndamentoInvestigacao[]).filter(a => a !== aberto.andamento).map(a => (
                        <Chip key={a} ativo={novoAndamento === a} onClick={() => setNovoAndamento(a)}>{ANDAMENTO_INVESTIGACAO[a].rotulo}</Chip>
                      ))}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input value={nota} maxLength={500} onChange={e => setNota(e.target.value)} placeholder="Nota (opcional): o que mudou?" className={`${INPUT} flex-1`} />
                      <BotaoPrimario onClick={() => atualizarAndamento(aberto)} disabled={andamentoMut.isPending || novoAndamento === aberto.andamento}>
                        <Activity size={14} /> {andamentoMut.isPending ? 'Salvando...' : 'Atualizar status'}
                      </BotaoPrimario>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-txt3">Só o responsável e os participantes mudam o andamento.</p>
                )}
                {aberto.historico.length > 0 && (
                  <ol className="space-y-1.5 mt-2">
                    {[...aberto.historico].reverse().map((h, i) => (
                      <li key={i} className="flex gap-2 text-xs">
                        <History size={12} className="text-gold2 shrink-0 mt-0.5" />
                        <span className="font-mono text-txt3 shrink-0">{new Date(h.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                        <span className="text-txt2">
                          <strong className="text-txt font-medium">{h.por}</strong>: {ANDAMENTO_INVESTIGACAO[h.de].rotulo} → {ANDAMENTO_INVESTIGACAO[h.para].rotulo}{h.nota ? ` · ${h.nota}` : ''}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </Secao>
            )}

            {aberto.arvoreId && (
              <Secao titulo="Árvore de investigação" icone={GitBranch}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-gold/30 bg-gold/5 p-3">
                  <p className="flex-1 text-sm text-txt2">Monte as ligações entre suspeitos, locais e veículos — só os envolvidos desta investigação têm acesso.</p>
                  <BotaoPrimario onClick={() => navigate(`/arvores/${aberto.arvoreId}`)}><GitBranch size={14} /> Abrir árvore</BotaoPrimario>
                </div>
              </Secao>
            )}

            {podeGerir && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-bdr">
                {aberto.aprovacao === 'pendente' && (
                  <BotaoSecundario onClick={() => navigate('/investigacoes/aprovacoes')}><ShieldCheck size={13} /> Ir para aprovações</BotaoSecundario>
                )}
                <BotaoSecundario onClick={() => excluir(aberto)} className="hover:text-red!"><Trash2 size={13} /> Excluir</BotaoSecundario>
              </div>
            )}
          </div>
        )}
      </ModalOverlay>

      {/* Novo registro */}
      <ModalOverlay open={!!form} onClose={() => setForm(null)} title="SOLICITAR INVESTIGAÇÃO" maxWidth="max-w-2xl">
        {form && (
          <div className="space-y-4">
            <Campo rotulo="Nome da investigação *">
              <input autoFocus value={form.nome} maxLength={120} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Operação Corktown" className={INPUT} />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Data *">
                <input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} className={INPUT} />
              </Campo>
              <Campo rotulo="Horário *" dica="Hora em que a investigação foi feita.">
                <input type="time" value={form.hora} onChange={e => setForm({ ...form, hora: e.target.value })} className={`${INPUT} font-mono`} />
              </Campo>
            </div>
            <Campo rotulo="Participantes (codinome e ID) *" dica="Digite @ e o codinome para marcar cada investigador — você pode se incluir.">
              <SeletorParticipantes valor={form.participantes} onChange={participantes => setForm({ ...form, participantes })} meuMembroId={me?.membroId ?? null} />
            </Campo>
            <Campo rotulo="Motivo *">
              <div className="flex flex-wrap gap-2">
                {(Object.keys(MOTIVO_INVESTIGACAO) as MotivoInvestigacao[]).map(m => (
                  <Chip key={m} ativo={form.motivo === m} onClick={() => setForm({ ...form, motivo: m })}>{MOTIVO_INVESTIGACAO[m]}</Chip>
                ))}
              </div>
            </Campo>
            <Campo rotulo={form.motivo === 'outro' ? 'Descreva o motivo *' : 'Detalhes (opcional)'}>
              <textarea value={form.detalhes} maxLength={2000} rows={3} onChange={e => setForm({ ...form, detalhes: e.target.value })}
                placeholder="O que vai ser investigado, alvo, observações…" className={`${INPUT} resize-y`} />
            </Campo>
            <Campo rotulo="Local *">
              <div className="flex flex-wrap gap-2">
                {(Object.keys(LOCAL_INVESTIGACAO) as LocalInvestigacao[]).map(l => (
                  <Chip key={l} ativo={form.local === l} onClick={() => setForm({ ...form, local: l })}>{LOCAL_INVESTIGACAO[l]}</Chip>
                ))}
              </div>
            </Campo>
            <div className="flex gap-2 pt-1">
              <BotaoPrimario onClick={enviar} disabled={registrar.isPending} className="flex-1">
                <ClipboardList size={14} /> {registrar.isPending ? 'Enviando...' : 'Enviar solicitação'}
              </BotaoPrimario>
              <BotaoSecundario onClick={() => setForm(null)}>Cancelar</BotaoSecundario>
            </div>
          </div>
        )}
      </ModalOverlay>
    </div>
  )
}
