import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, X, Send, UserX, MapPin, Image, CheckCircle2, Copy, ScrollText, ArrowRight, RotateCcw, Search } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useCreateAcao } from '@/hooks/useAcoes'
import { useQrus, useQrusTipos } from '@/hooks/useConfig'
import { useMembros } from '@/hooks/useMembros'
import { useMe } from '@/hooks/useMe'
import { useUIStore } from '@/store/uiStore'
import GlowCard from '@/components/ui/GlowCard'
import HudButton from '@/components/ui/HudButton'
import LoadingHud from '@/components/ui/LoadingHud'
import type { ResultadoAcao, Membro, Acao, TipoQru } from '@/types'

function normalizarBusca(valor: string) {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function buildBoletimModelo(a: Acao) {
  const dataBR = a.data.split('-').reverse().join('/')
  return [
    'North Police Department',
    `Responsável: ${a.comandante || 'Não informado'}`,
    '/'.repeat(110),
    '',
    `📄 Relato da ocorrência: Ocorrência de ${a.qru}${a.local ? ` na região de ${a.local}` : ''} registrada em ${dataBR}. [Descreva os detalhes da ação...]`,
    '',
    '📦 Objetos apreendidos: Em anexo',
    '🚓 Veículos apreendidos: N/A',
    `📝 Observações: ${a.imagem || 'N/A'}`,
    '-'.repeat(90),
    `${dataBR} - North Police Department`,
    'Atenciosamente, [Officer].',
  ].join('\n')
}

interface FormData {
  data: string
  qru: string
  resultado: ResultadoAcao
}

interface ExtraParticipante {
  nome: string
  patente: string
}

const TIPO_OPTIONS: { value: TipoQru; titulo: string; desc: string }[] = [
  { value: 'convencional', titulo: 'QRU CONVENCIONAL', desc: 'Apreensão' },
  { value: 'fechado',      titulo: 'QRU FECHADO',      desc: 'Ação · vitória ou derrota' },
]

const RESULTADO_OPTIONS: { value: ResultadoAcao; color: string }[] = [
  { value: 'Vitória',      color: 'border-green text-green bg-green/10'   },
  { value: 'Derrota',      color: 'border-red text-red bg-red/10'         },
]

export default function RegistrarAcaoPage() {
  const navigate = useNavigate()
  const { addToast } = useUIStore()
  const { data: qrus, isLoading: qrusLoading } = useQrus()
  const { data: qrusTipos, isLoading: tiposLoading } = useQrusTipos()
  const [tipo, setTipo] = useState<TipoQru | null>(null)
  const [listaAberta, setListaAberta] = useState(false)
  const { data: membros, isLoading: membrosLoading } = useMembros()
  const createAcao = useCreateAcao()

  const { data: me, isLoading: meLoading } = useMe()
  const responsavel = me?.nomeServidor || me?.discordUsername || me?.username || ''

  const [local, setLocal] = useState('')
  const [imagem, setImagem] = useState('')
  const [registrado, setRegistrado] = useState<Acao | null>(null)

  const [selectedMembros, setSelectedMembros] = useState<Array<{ memberId: number; patenteUnidade: string }>>([])
  const [membroSearch, setMembroSearch] = useState('')

  const [participantesExtras, setParticipantesExtras] = useState<ExtraParticipante[]>([])
  const [extraNome, setExtraNome] = useState('')
  const [extraPatente, setExtraPatente] = useState('')

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      data: new Date().toISOString().slice(0, 10),
      resultado: 'Vitória',
    },
  })

  const resultado = watch('resultado')
  const tipoDe = (q: string): TipoQru => qrusTipos?.find(t => t.nome === q)?.tipo ?? 'convencional'
  const qrusDoTipo = tipo ? (qrus ?? []).filter(q => tipoDe(q) === tipo) : []

  function escolherTipo(t: TipoQru) {
    setTipo(t)
    setValue('qru', '')   // QRU do outro tipo não vale
  }

  const filteredMembros = (membros ?? []).filter((m: Membro) =>
    !selectedMembros.some(s => s.memberId === m.id) &&
    [m.nomeServidor, m.discordUsername, m.policial, m.badge].some(nome =>
      normalizarBusca(nome ?? '').includes(normalizarBusca(membroSearch)))
  )

  function addMembro(m: Membro) {
    setSelectedMembros(prev => [...prev, { memberId: m.id, patenteUnidade: m.patenteInterna || m.patenteNPD }])
    setMembroSearch('')   // lista segue aberta para adicionar vários
  }

  function removeMembro(id: number) {
    setSelectedMembros(prev => prev.filter(s => s.memberId !== id))
  }

  function addExtra() {
    const nome = extraNome.trim()
    if (!nome) return
    setParticipantesExtras(prev => [...prev, { nome, patente: extraPatente.trim() }])
    setExtraNome('')
    setExtraPatente('')
  }

  function removeExtra(idx: number) {
    setParticipantesExtras(prev => prev.filter((_, i) => i !== idx))
  }

  async function onSubmit(data: FormData) {
    if (!tipo) { addToast('error', 'Escolha QRU convencional ou QRU fechado.'); return }
    try {
      const res = await createAcao.mutateAsync({
        data: data.data,
        qru: data.qru,
        tipo,
        ...(tipo === 'fechado' ? { resultado: data.resultado } : {}),
        local: local.trim() || undefined,
        imagem: imagem.trim() || undefined,
        participants: selectedMembros,
        participantesExtras: participantesExtras.map(e => ({
          nome: e.nome,
          patente: e.patente || undefined,
        })),
      })
      addToast('success', 'Apreensão registrada!')
      setRegistrado(res.data)
    } catch {
      addToast('error', 'Erro ao registrar apreensão.')
    }
  }

  function copiar(txt: string, msg: string) {
    navigator.clipboard.writeText(txt).then(() => addToast('success', msg)).catch(() => addToast('error', 'Falha ao copiar.'))
  }

  if (qrusLoading || tiposLoading || membrosLoading || meLoading) return <LoadingHud />

  // ── Painel de resultado (após registrar) ──────────────────────
  if (registrado) {
    const modelo = buildBoletimModelo(registrado)
    function resetForm() {
      setRegistrado(null); setLocal(''); setImagem(''); setTipo(null); setValue('qru', '')
      setSelectedMembros([]); setParticipantesExtras([])
    }
    return (
      <div className="p-3 sm:p-6 max-w-2xl mx-auto">
        <GlowCard>
          <div className="p-4 sm:p-6">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-14 h-14 rounded-full bg-green/15 border border-green/40 flex items-center justify-center mb-3">
                <CheckCircle2 size={28} className="text-green" />
              </div>
              <h2 className="text-lg font-semibold text-txt">Apreensão registrada!</h2>
              <p className="text-sm text-txt2 mt-1">{registrado.qru}{registrado.local ? ` · ${registrado.local}` : ''}</p>
            </div>

            {/* Nº do BO */}
            <div className="flex items-center justify-between rounded-xl border border-gold/40 bg-gold/6 px-4 py-3 mb-4">
              <div>
                <p className="font-mono text-[10px] text-gold3 tracking-[0.2em] uppercase">Número do BO</p>
                <p className="text-2xl font-bold text-txt">Nº {registrado.id}</p>
              </div>
              <button onClick={() => copiar(String(registrado.id), 'Nº do BO copiado!')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-bdr2 text-txt2 text-xs hover:text-txt hover:border-bdrg transition-colors">
                <Copy size={13} /> Copiar Nº
              </button>
            </div>

            {/* Modelo de boletim */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-mono text-[11px] text-txt2 tracking-wider flex items-center gap-1.5"><ScrollText size={12} /> MODELO DE BOLETIM</label>
                <button onClick={() => copiar(modelo, 'Modelo copiado!')} className="flex items-center gap-1.5 text-gold3 text-xs hover:text-white transition-colors">
                  <Copy size={12} /> Copiar modelo
                </button>
              </div>
              <textarea readOnly value={modelo} rows={9}
                className="w-full bg-card2 border border-bdr2 rounded-lg px-3 py-2.5 text-xs font-mono text-txt leading-relaxed resize-none" />
              <p className="font-mono text-[10px] text-txt3 mt-1.5">Copie e preencha, ou abra no Gerar Boletim já com a QRU.</p>
            </div>

            <div className="flex items-center gap-3">
              <HudButton onClick={() => navigate(`/boletim?bo=${registrado.id}`)} className="flex-1 justify-center">
                <span className="flex items-center justify-center gap-2"><ScrollText size={15} /> Abrir no Gerar Boletim <ArrowRight size={14} /></span>
              </HudButton>
              <HudButton variant="ghost" onClick={resetForm}>
                <span className="flex items-center gap-2"><RotateCcw size={14} /> Registrar outra</span>
              </HudButton>
            </div>
          </div>
        </GlowCard>
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-6 max-w-2xl mx-auto">
      <GlowCard>
        <div className="p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-xl bg-gold/10 border border-gold/30 flex items-center justify-center">
              <Send size={18} className="text-gold" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-txt leading-tight">Nova apreensão</h2>
              <p className="font-mono text-[10px] text-txt2 tracking-[0.2em] uppercase">Registrar apreensão</p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Data */}
            <div>
              <label className="font-mono text-xs text-txt2 tracking-wider block mb-1.5">DATA</label>
              <input
                {...register('data', { required: 'Data obrigatória' })}
                type="date"
                className="input-gold w-full bg-card2 border border-bdr2 rounded-lg px-3 py-2.5 text-sm font-mono text-txt"
              />
              {errors.data && <p className="text-red text-xs font-mono mt-1">{errors.data.message}</p>}
            </div>

            {/* Tipo: convencional (apreensão) × fechado (ação) */}
            <div>
              <label className="font-mono text-xs text-txt2 tracking-wider block mb-2">TIPO DE QRU</label>
              <div className="grid grid-cols-2 gap-3">
                {TIPO_OPTIONS.map(opt => (
                  <motion.button
                    key={opt.value}
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => escolherTipo(opt.value)}
                    className={`py-3 px-2 border rounded-lg text-center transition-all ${
                      tipo === opt.value ? 'border-gold text-txt bg-gold/10' : 'border-bdr text-txt3 hover:border-bdrg hover:text-txt2'
                    }`}
                  >
                    <span className="block font-medium text-xs tracking-wider">{opt.titulo}</span>
                    <span className="block font-mono text-[10px] text-txt3 mt-0.5">{opt.desc}</span>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* QRU */}
            <div>
              <label className="font-mono text-xs text-txt2 tracking-wider block mb-1.5">QRU</label>
              <select
                {...register('qru', { required: 'QRU obrigatório' })}
                disabled={!tipo}
                className="input-gold w-full bg-card2 border border-bdr2 rounded-lg px-3 py-2.5 text-sm font-mono text-txt disabled:opacity-50"
              >
                <option value="">{tipo ? 'Selecione...' : 'Escolha o tipo acima primeiro'}</option>
                {qrusDoTipo.map(q => (
                  <option key={q} value={q}>{q}</option>
                ))}
              </select>
              {tipo && qrusDoTipo.length === 0 && (
                <p className="font-mono text-[10px] text-txt3 mt-1.5">Nenhum QRU desse tipo cadastrado em Configurações.</p>
              )}
              {errors.qru && <p className="text-red text-xs font-mono mt-1">{errors.qru.message}</p>}
            </div>

            {/* Local */}
            <div>
              <label className="font-mono text-xs text-txt2 tracking-wider block mb-1.5">LOCAL</label>
              <div className="relative">
                <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt3" />
                <input
                  value={local}
                  onChange={e => setLocal(e.target.value)}
                  placeholder="Ex: Aduana, Banco Principal, Ilha..."
                  className="input-gold w-full bg-card2 border border-bdr2 rounded-lg px-3 py-2.5 pl-9 text-sm font-mono text-txt placeholder-txt3"
                />
              </div>
            </div>

            {/* Link da imagem / ShareX */}
            <div>
              <label className="font-mono text-xs text-txt2 tracking-wider block mb-1.5">LINK DA IMAGEM / SHAREX</label>
              <div className="relative">
                <Image size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt3" />
                <input
                  value={imagem}
                  onChange={e => setImagem(e.target.value)}
                  placeholder="https://... (print da apreensão)"
                  className="input-gold w-full bg-card2 border border-bdr2 rounded-lg px-3 py-2.5 pl-9 text-sm font-mono text-txt placeholder-txt3"
                />
              </div>
            </div>

            {/* Resultado — só em QRU fechado (ação) */}
            {tipo === 'fechado' && <div>
              <label className="font-mono text-xs text-txt2 tracking-wider block mb-2">RESULTADO</label>
              <div className="flex gap-3">
                {RESULTADO_OPTIONS.map(opt => (
                  <motion.button
                    key={opt.value}
                    type="button"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setValue('resultado', opt.value)}
                    className={`flex-1 py-3 border rounded-lg font-medium text-xs tracking-wider transition-all ${
                      resultado === opt.value ? opt.color : 'border-bdr text-txt3 hover:border-bdrg hover:text-txt2'
                    }`}
                  >
                    {opt.value.toUpperCase()}
                  </motion.button>
                ))}
              </div>
            </div>}

            {/* Responsável identificado pela sessão */}
            <div>
              <label htmlFor="responsavel" className="font-mono text-xs text-txt2 tracking-wider block mb-2">RESPONSÁVEL</label>
              <input id="responsavel" readOnly value={responsavel}
                className="w-full bg-card2 border border-bdr2 rounded-lg px-3 py-2 text-sm font-mono text-txt" />
              <p className="font-mono text-[10px] text-txt3 mt-1.5">Identificado automaticamente pela sua conta.</p>
            </div>

            {/* Participantes da Unidade */}
            <div>
              <label className="font-mono text-xs text-txt2 tracking-wider block mb-2">
                PARTICIPANTES DA UNIDADE ({selectedMembros.length})
              </label>

              {selectedMembros.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {selectedMembros.map(s => {
                    const m = (membros ?? []).find((m: Membro) => m.id === s.memberId)
                    return (
                      <motion.span
                        key={s.memberId}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="flex items-center gap-1.5 bg-bdr border border-bdr2 rounded-lg px-2 py-1 text-xs font-mono text-txt"
                      >
                        {m?.nomeServidor || m?.policial || `ID:${s.memberId}`}
                        <button type="button" onClick={() => removeMembro(s.memberId)}
                          className="text-txt3 hover:text-red transition-colors">
                          <X size={12} />
                        </button>
                      </motion.span>
                    )
                  })}
                </div>
              )}

              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt3 pointer-events-none" />
                <input
                  value={membroSearch}
                  onChange={e => { setMembroSearch(e.target.value); setListaAberta(true) }}
                  onFocus={() => setListaAberta(true)}
                  onBlur={() => setListaAberta(false)}
                  onKeyDown={e => { if (e.key === 'Escape') setListaAberta(false) }}
                  placeholder="Pesquisar pelo nome ou rolar a lista..."
                  className="input-gold w-full bg-card2 border border-bdr2 rounded-lg px-3 py-2 pl-9 text-sm font-mono text-txt placeholder-txt3"
                />
                {listaAberta && (
                  <div className="absolute top-full left-0 right-0 z-50 bg-card border border-bdr rounded-b-lg shadow-xl max-h-60 overflow-y-auto">
                    {filteredMembros.length === 0 && (
                      <p className="px-3 py-2 text-xs font-mono text-txt3">Nenhum membro encontrado.</p>
                    )}
                    {filteredMembros.map((m: Membro) => (
                      <button
                        key={m.id}
                        type="button"
                        onMouseDown={e => e.preventDefault()}   // mantém o foco: a lista não fecha antes do clique
                        onClick={() => addMembro(m)}
                        className="w-full text-left px-3 py-2 text-xs font-mono text-txt2 hover:bg-bdr hover:text-txt transition-colors flex items-center gap-2"
                      >
                        <Plus size={12} className="text-gold" />
                        <span>{m.nomeServidor || m.policial}{m.nomeServidor && m.nomeServidor !== m.policial && <small className="block text-txt3">{m.policial}</small>}</span>
                        <span className="text-txt3 ml-auto">{m.badge}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Participantes Externos */}
            <div>
              <label className="font-mono text-xs text-txt2 tracking-wider block mb-2">
                PARTICIPANTES EXTERNOS ({participantesExtras.length})
              </label>

              {participantesExtras.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {participantesExtras.map((e, i) => (
                    <motion.span
                      key={i}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="flex items-center gap-1.5 bg-blue/10 border border-blue/30 rounded px-2 py-1 text-xs font-mono text-txt"
                    >
                      <UserX size={11} className="text-blue shrink-0" />
                      {e.patente ? <span className="text-txt3">[{e.patente}]</span> : null}
                      {e.nome}
                      <button type="button" onClick={() => removeExtra(i)}
                        className="text-txt3 hover:text-red transition-colors">
                        <X size={12} />
                      </button>
                    </motion.span>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  value={extraPatente}
                  onChange={e => setExtraPatente(e.target.value)}
                  placeholder="Patente (opcional)"
                  className="input-gold w-36 bg-card2 border border-bdr2 rounded-lg px-3 py-2 text-sm font-mono text-txt placeholder-txt3"
                />
                <input
                  value={extraNome}
                  onChange={e => setExtraNome(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExtra() } }}
                  placeholder="Nome do participante externo..."
                  className="input-gold flex-1 bg-card2 border border-bdr2 rounded-lg px-3 py-2 text-sm font-mono text-txt placeholder-txt3"
                />
                <button
                  type="button"
                  onClick={addExtra}
                  disabled={!extraNome.trim()}
                  className="border border-bdr2 rounded-lg px-3 py-2 text-txt3 hover:text-txt hover:border-blue/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
              <p className="font-mono text-[10px] text-txt3 mt-1.5">
                Participantes de fora da unidade — não constam no cadastro de membros
              </p>
            </div>

            {/* Submit */}
            <div className="pt-2">
              <HudButton
                type="submit"
                loading={createAcao.isPending}
                size="lg"
                className="w-full justify-center"
              >
                <Send size={16} className="inline mr-2" />
                TRANSMITIR DADOS
              </HudButton>
            </div>
          </form>
        </div>
      </GlowCard>
    </div>
  )
}
