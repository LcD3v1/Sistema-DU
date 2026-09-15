import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarPlus, Shield, CalendarDays } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useCreateAusencia } from '@/hooks/useAusencias'
import { useMembros } from '@/hooks/useMembros'
import { useUIStore } from '@/store/uiStore'
import GlowCard from '@/components/ui/GlowCard'
import HudButton from '@/components/ui/HudButton'
import LoadingHud from '@/components/ui/LoadingHud'
import type { Membro } from '@/types'

interface FormData {
  dataInicio: string
  dataFim: string
  motivo: string
}

export default function RegistrarAusenciaPage() {
  const navigate = useNavigate()
  const { addToast } = useUIStore()
  const { data: membros, isLoading } = useMembros()
  const createAusencia = useCreateAusencia()

  const [nome, setNome] = useState('')
  const [memberId, setMemberId] = useState<number | undefined>(undefined)
  const [showDropdown, setShowDropdown] = useState(false)

  const today = new Date().toISOString().slice(0, 10)
  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    defaultValues: { dataInicio: today, dataFim: today, motivo: '' },
  })
  const dataInicio = watch('dataInicio')

  const filtered = (membros ?? []).filter((m: Membro) =>
    nome !== '' && (
      m.policial.toLowerCase().includes(nome.toLowerCase()) ||
      m.badge.toLowerCase().includes(nome.toLowerCase())
    ),
  )

  async function onSubmit(data: FormData) {
    if (!nome.trim()) { addToast('error', 'Informe o nome do membro.'); return }
    try {
      await createAusencia.mutateAsync({
        nome: nome.trim(),
        memberId,
        dataInicio: data.dataInicio,
        dataFim: data.dataFim,
        motivo: data.motivo.trim(),
      })
      addToast('success', 'Ausência registrada!')
      navigate('/ausencias')
    } catch {
      addToast('error', 'Erro ao registrar ausência.')
    }
  }

  if (isLoading) return <LoadingHud />

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <GlowCard>
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-xl bg-gold/10 border border-gold/30 flex items-center justify-center">
              <CalendarPlus size={18} className="text-gold" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-txt leading-tight">Registrar ausência</h2>
              <p className="font-mono text-[10px] text-txt2 tracking-[0.2em] uppercase">Efetivo · afastamento</p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Nome / membro */}
            <div>
              <label className="font-mono text-xs text-txt2 tracking-wider block mb-1.5">MEMBRO</label>
              <div className="relative">
                <input
                  value={nome}
                  onChange={e => { setNome(e.target.value); setMemberId(undefined); setShowDropdown(true) }}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Buscar membro ou digitar nome..."
                  className="input-gold w-full bg-card2 border border-bdr2 rounded-lg px-3 py-2.5 text-sm font-mono text-txt placeholder-txt3"
                />
                {showDropdown && filtered.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 bg-card border border-bdr rounded-b-lg shadow-xl max-h-48 overflow-y-auto">
                    {filtered.slice(0, 8).map((m: Membro) => (
                      <button
                        key={m.id}
                        type="button"
                        onMouseDown={() => { setNome(m.policial); setMemberId(m.id); setShowDropdown(false) }}
                        className="w-full text-left px-3 py-2 text-xs font-mono text-txt2 hover:bg-bdr hover:text-txt transition-colors flex items-center gap-2"
                      >
                        <Shield size={12} className="text-gold" />
                        <span>{m.policial}</span>
                        <span className="text-txt3 ml-auto">{m.patenteInterna || m.patenteNPD}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="font-mono text-[10px] text-txt3 mt-1.5">Selecione um membro da unidade ou digite o nome</p>
            </div>

            {/* Período */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="font-mono text-xs text-txt2 tracking-wider block mb-1.5">DE</label>
                <input
                  {...register('dataInicio', { required: 'Data inicial obrigatória' })}
                  type="date"
                  className="input-gold w-full bg-card2 border border-bdr2 rounded-lg px-3 py-2.5 text-sm font-mono text-txt"
                />
                {errors.dataInicio && <p className="text-red text-xs font-mono mt-1">{errors.dataInicio.message}</p>}
              </div>
              <div>
                <label className="font-mono text-xs text-txt2 tracking-wider block mb-1.5">ATÉ</label>
                <input
                  {...register('dataFim', {
                    required: 'Data final obrigatória',
                    validate: v => v >= dataInicio || 'Deve ser igual ou após a data inicial',
                  })}
                  type="date"
                  min={dataInicio}
                  className="input-gold w-full bg-card2 border border-bdr2 rounded-lg px-3 py-2.5 text-sm font-mono text-txt"
                />
                {errors.dataFim && <p className="text-red text-xs font-mono mt-1">{errors.dataFim.message}</p>}
              </div>
            </div>

            {/* Motivo */}
            <div>
              <label className="font-mono text-xs text-txt2 tracking-wider block mb-1.5">MOTIVO</label>
              <textarea
                {...register('motivo')}
                rows={3}
                placeholder="Descreva o motivo da ausência..."
                className="input-gold w-full bg-card2 border border-bdr2 rounded-lg px-3 py-2.5 text-sm font-mono text-txt placeholder-txt3 resize-none"
              />
            </div>

            <div className="pt-2">
              <HudButton type="submit" loading={createAusencia.isPending} size="lg" className="w-full justify-center">
                <span className="flex items-center justify-center gap-2"><CalendarDays size={16} /> Registrar ausência</span>
              </HudButton>
            </div>
          </form>
        </div>
      </GlowCard>
    </div>
  )
}
