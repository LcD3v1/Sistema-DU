import { useState } from 'react'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { User, CreditCard, Hash, Shield, Star, Check, Gauge, Fingerprint } from 'lucide-react'
import Brand from '@/components/ui/Brand'
import { useOnboarding, useMe, type OnboardingData } from '@/hooks/useMe'
import { useAuthStore } from '@/store/authStore'

const EASE = [0.16, 1, 0.3, 1] as const

export default function OnboardingPage() {
  const { data: me } = useMe()
  // Pedido de set no Discord: codinome, passaporte e patente já vêm preenchidos
  const setagem = me?.cadastroSetagem
  const { register, handleSubmit, formState: { errors } } = useForm<OnboardingData>({
    values: setagem ? { codinome: setagem.codinome, passaporte: setagem.passaporte, patenteInterna: setagem.patente } as OnboardingData : undefined,
    resetOptions: { keepDirtyValues: true },
  })
  const onboarding = useOnboarding()
  const [erro, setErro] = useState('')
  const username = useAuthStore(s => s.user?.username)

  async function onSubmit(data: OnboardingData) {
    setErro('')
    try {
      await onboarding.mutateAsync(data)
      // useMe é invalidado → AppShell re-renderiza e libera o painel
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } }
      setErro(err.response?.data?.error || 'Não foi possível salvar. Tente novamente.')
    }
  }

  return (
    <div className="relative min-h-screen w-full bg-bg text-txt overflow-y-auto flex items-center justify-center px-4 py-12">
      {/* fundo */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 grain-noise opacity-[0.05]" />
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[min(520px,100vw)] h-[min(520px,100vw)] rounded-full"
             style={{ background: 'radial-gradient(circle, rgba(139, 92, 246,0.16), transparent 70%)' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
        className="relative w-full max-w-lg"
      >
        <div className="flex flex-col items-center text-center mb-8">
          <div className="relative flex items-center justify-center mb-4" style={{ width: 78, height: 78 }}>
            <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, rgba(139, 92, 246,0.45), transparent 68%)' }} />
            <div style={{ filter: 'drop-shadow(0 0 12px rgba(139, 92, 246,0.5))' }}><Brand size={58} /></div>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span className="h-px w-6 bg-gold" />
            <span className="font-mono text-[10px] text-gold3 tracking-[0.3em] uppercase">Primeiro acesso</span>
            <span className="h-px w-6 bg-gold" />
          </div>
          <h1 className="wordmark text-3xl text-txt tracking-wide">Complete seu cadastro</h1>
          <p className="text-txt-muted text-sm mt-2 max-w-sm leading-relaxed">
            {username && <>Olá, <span className="text-gold3">{username}</span>. </>}
            Preencha seus dados de investigador. Eles ficam vinculados ao seu perfil e aparecem nos relatórios, boletins e na carteirinha da DU.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}
          className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-5">

          <div className="grid grid-cols-[1fr_120px] gap-4">
            <Field label="NOME DO INVESTIGADOR" icon={<User size={14} />} error={errors.policial?.message}>
              <input {...register('policial', { required: 'Nome obrigatório' })}
                className="fld" placeholder="Ex.: Peter Wolf" />
            </Field>
            <Field label="NÍVEL *" icon={<Gauge size={14} />} error={errors.nivel?.message}>
              <input type="number" inputMode="numeric" min={1} max={999}
                {...register('nivel', {
                  required: 'Nível obrigatório', valueAsNumber: true,
                  validate: v => (Number.isInteger(v) && v >= 1 && v <= 999) || 'Entre 1 e 999',
                })}
                className="fld" placeholder="Ex.: 48" />
            </Field>
          </div>

          <Field label="CODINOME" icon={<Fingerprint size={14} />}>
            <input {...register('codinome')} maxLength={40} className="fld" placeholder="Ex.: Raven" readOnly={Boolean(setagem)} title={setagem ? 'Aprovado na setagem' : undefined} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="BADGE" icon={<Shield size={14} />}>
              <input {...register('badge')} className="fld" placeholder="Ex.: 4521" />
            </Field>
            <Field label="PASSAPORTE / ID" icon={<Hash size={14} />}>
              <input {...register('passaporte')} className="fld" placeholder="Ex.: 10293" readOnly={Boolean(setagem)} title={setagem ? 'Aprovado na setagem' : undefined} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="PATENTE DPD" icon={<Star size={14} />}>
              <input {...register('patenteDPD')} className="fld" placeholder="Ex.: Soldado" />
            </Field>
            <Field label="CARGO / PATENTE INTERNA" icon={<CreditCard size={14} />}>
              {/* Patente da unidade é definida pelo comando (setagem/aprovação), nunca escolhida aqui */}
              <input {...register('patenteInterna')} className="fld opacity-70" placeholder="Definida pelo comando" readOnly
                title={setagem?.patente ? 'Aprovado na setagem' : 'Definida pelo comando; promoções passam por aprovação'} />
            </Field>
          </div>

          {erro && <p className="text-red text-xs font-mono">{erro}</p>}

          <motion.button type="submit" disabled={onboarding.isPending}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            className="mt-1 w-full py-3 bg-gold text-white font-medium text-sm rounded-lg hover:bg-gold2 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {onboarding.isPending ? 'SALVANDO...' : <><Check size={16} /> Concluir cadastro</>}
          </motion.button>

          <p className="text-txt-muted text-[11px] text-center leading-relaxed">
            Você poderá editar essas informações a qualquer momento no seu perfil.
          </p>
        </form>
      </motion.div>

      <style>{`
        .fld {
          width: 100%;
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--color-border, #1c1c1c);
          border-radius: 0.5rem;
          padding: 0.6rem 0.9rem;
          font-size: 0.875rem;
          color: var(--color-txt, #fff);
          outline: none;
          transition: border-color .15s;
        }
        .fld::placeholder { color: rgba(255,255,255,0.25); }
        .fld:focus { border-color: var(--color-gold, #8b5cf6); }
      `}</style>
    </div>
  )
}

function Field({ label, icon, error, children }: { label: string; icon: React.ReactNode; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-mono text-[10px] text-txt-muted tracking-wider flex items-center gap-1.5">
        <span className="text-gold3">{icon}</span>{label}
      </label>
      {children}
      {error && <p className="text-red text-[11px] font-mono">{error}</p>}
    </div>
  )
}
