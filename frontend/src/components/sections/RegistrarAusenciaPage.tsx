import BannerModulo from '@/components/ui/BannerModulo';
import HudButton from '@/components/ui/HudButton';
import LoadingHud from '@/components/ui/LoadingHud';
import { useCreateAusencia } from '@/hooks/useAusencias';
import { useMe } from '@/hooks/useMe';
import { useMembros } from '@/hooks/useMembros';
import { useUIStore } from '@/store/uiStore';
import type { Membro } from '@/types';
import { CalendarDays, CalendarPlus, CheckCircle2, Clock, Hourglass, ListChecks, Lock, Search, Shield, UserRound, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';

interface FormData {
  dataInicio: string
  dataFim: string
  motivo: string
}

/** Regra: a pessoa aparece pelo codinome. */
const nomeDe = (m: Membro) => m.codinome?.trim() || m.policial

const MAX_MOTIVO = 500
const FUSO = 'America/Sao_Paulo'   // fuso da unidade (UTC virava o dia seguinte depois das 21h)
const hojeIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: FUSO })

/** "2026-10-29" + n dias → "2026-11-01" (conta em UTC: sem horário de verão no meio). */
function somarDias(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
/** Dias corridos do período, contando o primeiro e o último. */
function diasDoPeriodo(de: string, ate: string) {
  if (!de || !ate || ate < de) return 0
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000) + 1
}
const dataBr = (iso: string) => iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short' }) : '—'

const ATALHOS = [{ rotulo: 'Só hoje', dias: 1 }, { rotulo: '3 dias', dias: 3 }, { rotulo: '1 semana', dias: 7 }, { rotulo: '15 dias', dias: 15 }, { rotulo: '30 dias', dias: 30 }]

const campo = 'input-gold w-full bg-card2 border border-bdr2 rounded-lg px-3.5 py-3 text-sm font-mono text-txt placeholder-txt3'
const rotulo = 'font-mono text-[11px] text-txt2 tracking-[0.15em] uppercase block mb-2'

/** Bloco numerado do formulário. */
function Etapa({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) {
  return (
    <section className="relative pl-11">
      <span className="absolute left-0 top-0 w-7 h-7 rounded-full bg-gold/15 border border-gold/40 text-gold3 font-mono text-xs font-bold flex items-center justify-center">{n}</span>
      <h3 className="text-sm font-semibold text-txt mb-3 leading-7">{titulo}</h3>
      {children}
    </section>
  )
}

export default function RegistrarAusenciaPage() {
  const navigate = useNavigate()
  const { addToast } = useUIStore()
  const { data: membros, isLoading } = useMembros()
  const createAusencia = useCreateAusencia()

  const [nome, setNome] = useState('')
  const [memberId, setMemberId] = useState<number | undefined>(undefined)
  const [showDropdown, setShowDropdown] = useState(false)
  const { data: me } = useMe()

  // Por padrão, a ausência é do próprio usuário
  useEffect(() => {
    if (memberId !== undefined || nome || !me?.membroId || !membros) return
    const eu = membros.find(m => m.id === me.membroId)
    if (eu) { setNome(nomeDe(eu)); setMemberId(eu.id) }
  }, [me, membros, memberId, nome])

  const today = hojeIso()
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    defaultValues: { dataInicio: today, dataFim: today, motivo: '' },
  })
  const dataInicio = watch('dataInicio')
  const dataFim = watch('dataFim')
  const motivo = watch('motivo') ?? ''
  const dias = diasDoPeriodo(dataInicio, dataFim)
  const selecionado = memberId !== undefined ? (membros ?? []).find(m => m.id === memberId) : undefined

  const filtered = (membros ?? []).filter((m: Membro) =>
    nome !== '' && (
      nomeDe(m).toLowerCase().includes(nome.toLowerCase()) ||
      m.badge.toLowerCase().includes(nome.toLowerCase())
    ),
  )

  function atalho(n: number) {
    const de = dataInicio || today
    setValue('dataInicio', de, { shouldValidate: true })
    setValue('dataFim', somarDias(de, n - 1), { shouldValidate: true })
  }

  async function onSubmit(data: FormData) {
    if (memberId === undefined) { addToast('error', 'Selecione um membro da lista.'); return }
    try {
      await createAusencia.mutateAsync({
        nome: nome.trim(),
        memberId,
        dataInicio: data.dataInicio,
        dataFim: data.dataFim,
        motivo: data.motivo.trim(),
      })
      addToast('success', 'Ausência enviada para aprovação!')
      navigate('/ausencias')
    } catch (e) {
      addToast('error', (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro ao registrar ausência.')
    }
  }

  if (isLoading) return <LoadingHud />

  return (
    <div className="w-full max-w-450 mx-auto p-3 sm:p-6 lg:px-8">
      <BannerModulo sobretitulo="Efetivo · Afastamento" icone={CalendarPlus} titulo="Registrar ausência" subtitulo="Detective Unit — Detroit Police Department"
        acoes={
          <Link to="/ausencias" className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/10 text-white text-sm hover:bg-white/20 transition-colors">
            <ListChecks size={15} /> <span className="hidden sm:inline">Ver ausências</span>
          </Link>
        } />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-5 sm:gap-6 items-start">
        {/* ── Formulário ─────────────────────────────────────── */}
        <form onSubmit={handleSubmit(onSubmit)} className="bg-card border border-bdr rounded-2xl p-5 sm:p-8 space-y-8">
          <Etapa n={1} titulo="Quem vai se ausentar">
            {selecionado ? (
              <div className="flex items-center gap-3 rounded-xl border border-gold/30 bg-gold/5 px-4 py-3">
                <div className="w-10 h-10 rounded-full bg-gold/15 border border-gold/30 flex items-center justify-center shrink-0">
                  <UserRound size={18} className="text-gold3" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-txt truncate">{nomeDe(selecionado)}</p>
                  <p className="font-mono text-[11px] text-txt3 truncate">{selecionado.patenteInterna || selecionado.patenteDPD || 'Sem patente'}{selecionado.badge ? ` · Distintivo ${selecionado.badge}` : ''}</p>
                </div>
                <button type="button" onClick={() => { setNome(''); setMemberId(undefined); setShowDropdown(true) }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-bdr2 text-txt2 text-xs hover:text-txt hover:border-bdrg transition-colors">
                  <X size={13} /> Trocar
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-txt3 pointer-events-none" />
                <input
                  value={nome}
                  autoFocus
                  onChange={e => { setNome(e.target.value); setMemberId(undefined); setShowDropdown(true) }}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Buscar pelo codinome ou distintivo..."
                  className={`${campo} pl-10`}
                />
                {showDropdown && filtered.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-card border border-bdr rounded-lg shadow-xl max-h-60 overflow-y-auto">
                    {filtered.slice(0, 8).map((m: Membro) => (
                      <button
                        key={m.id}
                        type="button"
                        onMouseDown={() => { setNome(nomeDe(m)); setMemberId(m.id); setShowDropdown(false) }}
                        className="w-full text-left px-3.5 py-2.5 text-sm font-mono text-txt2 hover:bg-bdr hover:text-txt transition-colors flex items-center gap-2"
                      >
                        <Shield size={13} className="text-gold" />
                        <span>{nomeDe(m)}</span>
                        <span className="text-txt3 ml-auto text-xs">{m.patenteInterna || m.patenteDPD}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Etapa>

          <Etapa n={2} titulo="Período">
            <div className="flex flex-wrap gap-2 mb-4">
              {ATALHOS.map(a => (
                <button key={a.dias} type="button" onClick={() => atalho(a.dias)}
                  className={`px-3 py-1.5 rounded-full border text-xs transition-colors ${dias === a.dias ? 'border-gold/60 bg-gold/15 text-gold3' : 'border-bdr2 text-txt2 hover:text-txt hover:border-bdrg'}`}>
                  {a.rotulo}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={rotulo}>De</label>
                <input {...register('dataInicio', { required: 'Data inicial obrigatória' })} type="date" className={campo} />
                {errors.dataInicio && <p className="text-red text-xs font-mono mt-1">{errors.dataInicio.message}</p>}
              </div>
              <div>
                <label className={rotulo}>Até</label>
                <input
                  {...register('dataFim', {
                    required: 'Data final obrigatória',
                    validate: v => v >= dataInicio || 'Deve ser igual ou após a data inicial',
                  })}
                  type="date"
                  min={dataInicio}
                  className={campo}
                />
                {errors.dataFim && <p className="text-red text-xs font-mono mt-1">{errors.dataFim.message}</p>}
              </div>
            </div>
          </Etapa>

          <Etapa n={3} titulo="Motivo">
            <textarea
              {...register('motivo', { maxLength: { value: MAX_MOTIVO, message: `Até ${MAX_MOTIVO} caracteres` } })}
              rows={5}
              maxLength={MAX_MOTIVO}
              placeholder="Ex.: viagem, trabalho, estudos, problema de saúde..."
              className={`${campo} resize-none leading-relaxed`}
            />
            <div className="flex justify-between mt-1.5">
              <p className="font-mono text-[10px] text-txt3">Opcional, mas ajuda quem aprova.</p>
              <p className={`font-mono text-[10px] ${motivo.length > MAX_MOTIVO - 50 ? 'text-gold3' : 'text-txt3'}`}>{motivo.length}/{MAX_MOTIVO}</p>
            </div>
          </Etapa>

          <div className="pl-11">
            <HudButton type="submit" loading={createAusencia.isPending} size="lg" className="w-full justify-center">
              <span className="flex items-center justify-center gap-2"><CalendarDays size={16} /> Solicitar ausência</span>
            </HudButton>
          </div>
        </form>

        {/* ── Resumo e regras ────────────────────────────────── */}
        <aside className="space-y-5 lg:sticky lg:top-6">
          <div className="bg-card border border-bdr rounded-2xl p-5 sm:p-6">
            <p className="font-mono text-[11px] text-gold3 tracking-[0.2em] uppercase mb-4">Resumo do pedido</p>
            <div className="rounded-xl border border-gold/25 bg-linear-to-br from-gold/10 to-transparent p-5 text-center mb-4">
              <p className="text-5xl font-bold text-txt leading-none">{dias || '—'}</p>
              <p className="font-mono text-[11px] text-txt2 tracking-wider uppercase mt-2">{dias === 1 ? 'dia de ausência' : 'dias de ausência'}</p>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-txt3">Membro</dt><dd className="text-txt font-medium truncate">{selecionado ? nomeDe(selecionado) : '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-txt3">Início</dt><dd className="text-txt capitalize">{dataBr(dataInicio)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-txt3">Volta</dt><dd className="text-txt capitalize">{dataFim ? dataBr(somarDias(dataFim, 1)) : '—'}</dd></div>
              <div className="flex justify-between gap-3 items-center">
                <dt className="text-txt3">Situação</dt>
                <dd className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gold/15 text-gold3 text-xs"><Hourglass size={12} /> Aguardará aprovação</dd>
              </div>
            </dl>
          </div>

          <div className="bg-card border border-bdr rounded-2xl p-5 sm:p-6">
            <p className="font-mono text-[11px] text-gold3 tracking-[0.2em] uppercase mb-4">Como funciona</p>
            <ol className="space-y-4">
              {[
                { icone: Clock, texto: 'O pedido vai para quem aprova ausências.' },
                { icone: CheckCircle2, texto: 'Aprovado, a ausência vale no período escolhido.' },
                { icone: Lock, texto: 'Durante o período, o membro fica sem acesso ao painel.' },
                { icone: ListChecks, texto: 'Acompanhe tudo em Ausências.' },
              ].map(({ icone: Icone, texto }, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-8 h-8 rounded-lg bg-card2 border border-bdr2 flex items-center justify-center shrink-0"><Icone size={15} className="text-gold3" /></span>
                  <p className="text-sm text-txt2 leading-snug pt-1.5">{texto}</p>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  )
}
