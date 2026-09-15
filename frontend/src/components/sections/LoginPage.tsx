import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, EyeOff, Lock, User, X, Trophy, Users, UserPlus, Send } from 'lucide-react'
import { useForm } from 'react-hook-form'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/authStore'
import Brand from '@/components/ui/Brand'
import PublicOverlay from '@/components/sections/PublicOverlay'
import type { AuthUser } from '@/types'

interface LoginForm { username: string; password: string }
interface SolicitarForm { nome: string; username: string; password: string }

const DISCORD_URL = (import.meta.env.VITE_API_URL || '') + '/api/auth/discord'

const REASONS: Record<string, string> = {
  desativada: 'Conta desativada. Contate o administrador.',
  discord_off: 'Login por Discord ainda não configurado.',
  discord_nao_vinculado: 'Este Discord não está vinculado a nenhuma conta.',
  discord_erro: 'Falha na autenticação com o Discord. Tente novamente.',
}

function DiscordIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3c-.2.36-.43.845-.59 1.23a18.27 18.27 0 0 0-3.937 0A12.6 12.6 0 0 0 11.44 3a19.74 19.74 0 0 0-3.76 1.37C3.9 8.1 3.2 11.72 3.5 15.29a19.9 19.9 0 0 0 6.03 3.05c.49-.66.92-1.36 1.29-2.1-.71-.27-1.39-.6-2.03-.99.17-.13.34-.26.5-.4a14.2 14.2 0 0 0 12.02 0c.16.14.33.27.5.4-.64.39-1.32.72-2.03.99.37.74.8 1.44 1.29 2.1a19.87 19.87 0 0 0 6.03-3.05c.36-4.13-.6-7.72-2.9-10.92ZM9.68 13.5c-.95 0-1.73-.87-1.73-1.94 0-1.07.76-1.94 1.73-1.94.98 0 1.76.88 1.73 1.94 0 1.07-.76 1.94-1.73 1.94Zm4.64 0c-.95 0-1.73-.87-1.73-1.94 0-1.07.76-1.94 1.73-1.94.98 0 1.76.88 1.73 1.94 0 1.07-.75 1.94-1.73 1.94Z" />
    </svg>
  )
}

/* Fundo em vídeo */
function VideoBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      {/* scale 1.35 recorta o letterbox gravado no arquivo (barras de 12,5% em cima/baixo) */}
      <video className="absolute inset-0 w-full h-full object-cover" style={{ transform: 'scale(1.35)', transformOrigin: 'center' }} src="/media/login-bg.mp4" autoPlay muted loop playsInline />
      {/* scrim da esquerda para legibilidade do hero */}
      <div className="absolute inset-0 pointer-events-none"
           style={{ background: 'linear-gradient(90deg, rgba(4,6,11,0.9) 0%, rgba(4,6,11,0.6) 42%, rgba(4,6,11,0.15) 78%, rgba(4,6,11,0.35) 100%)' }} />
      {/* grão + vinheta */}
      <div className="absolute inset-0 grain-noise opacity-[0.05] pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none"
           style={{ background: 'radial-gradient(130% 100% at 30% 45%, transparent 45%, rgba(0,0,0,0.7) 100%)' }} />
    </div>
  )
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { setAuth } = useAuthStore()

  const [view, setView] = useState<'buttons' | 'login' | 'solicitar'>('buttons')
  const [showPass, setShowPass] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [solStatus, setSolStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [solErro, setSolErro] = useState('')
  const [overlay, setOverlay] = useState<'ranking' | 'membros' | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>()
  const solForm = useForm<SolicitarForm>()
  const reason = params.get('reason')

  useEffect(() => { if (reason === 'desativada') setView('login') }, [reason])

  async function onSubmit(data: LoginForm) {
    setStatus('loading')
    try {
      const res = await api.post<{ token: string; user: AuthUser }>('/auth/login', data)
      setAuth(res.data.token, res.data.user)
      setStatus('success')
      setTimeout(() => navigate('/dashboard'), 1000)
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 2000)
    }
  }

  async function onSolicitar(data: SolicitarForm) {
    setSolStatus('loading'); setSolErro('')
    try {
      await api.post('/auth/solicitar', data)
      setSolStatus('success')
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } }
      setSolErro(err.response?.data?.error || 'Não foi possível enviar a solicitação.')
      setSolStatus('error')
      setTimeout(() => setSolStatus('idle'), 2500)
    }
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white">
      <VideoBackdrop />

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header className="relative z-30 flex items-center justify-between px-8 lg:px-14 pt-6">
        <div className="flex items-center gap-3">
          <Brand size={40} />
          <div className="leading-tight">
            <p className="wordmark text-sm text-white tracking-[0.14em]">FAST</p>
            <p className="font-mono text-[8px] text-white/40 tracking-[0.2em]">NPD</p>
          </div>
        </div>
        <nav className="flex items-center gap-2">
          <button onClick={() => setOverlay('ranking')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 hover:border-white/25 hover:bg-white/5 text-sm text-white/80 transition-colors">
            <Trophy size={15} /> Ranking
          </button>
          <button onClick={() => setOverlay('membros')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 hover:border-white/25 hover:bg-white/5 text-sm text-white/80 transition-colors">
            <Users size={15} /> Membros
          </button>
        </nav>
      </header>

      {/* ── Hero (alinhado à esquerda) ──────────────────────────── */}
      <main className="relative z-20 h-[calc(100%-140px)] flex items-center px-8 lg:px-14">
        <div className="w-full max-w-xl">
          <div className="flex items-center gap-2 mb-5">
            <span className="h-px w-8 bg-gold" />
            <span className="font-mono text-[11px] text-gold3 tracking-[0.3em] uppercase">North Police Department</span>
          </div>

          <h1 className="wordmark text-[84px] md:text-[112px] leading-[0.9] text-white mb-4"
              style={{ textShadow: '0 8px 50px rgba(0,0,0,0.7)' }}>
            FAST
          </h1>

          <p className="text-white/60 text-base max-w-md mb-8 leading-relaxed">
            Central operacional da unidade — controle de apreensões, efetivo e desempenho em tempo real.
          </p>

          <div>
            {view === 'buttons' ? (
              <motion.div key="btns" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <motion.a href={DISCORD_URL} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    className="flex items-center gap-2.5 px-7 py-3.5 rounded-xl bg-[#5865F2] hover:bg-[#4752c4] text-white font-medium text-sm transition-colors shadow-[0_12px_34px_-10px_rgba(88,101,242,0.6)]">
                    <DiscordIcon /> Entrar com Discord
                  </motion.a>
                  <button onClick={() => setView('login')}
                    className="flex items-center gap-1.5 px-6 py-3.5 rounded-xl border border-white/15 hover:border-white/30 hover:bg-white/5 text-white/80 font-medium text-sm transition-colors">
                    <Lock size={15} /> Acesso interno
                  </button>
                </div>
                <button onClick={() => setView('solicitar')}
                  className="flex items-center gap-1.5 text-sm text-white/50 hover:text-gold3 transition-colors w-fit">
                  <UserPlus size={14} /> Não tem acesso? <span className="text-gold3 underline underline-offset-2">Solicitar cadastro</span>
                </button>
              </motion.div>
            ) : view === 'solicitar' ? (
              <motion.div key="sol" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="relative w-full max-w-sm bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-2xl p-6">
                <button onClick={() => { setView('buttons'); setSolStatus('idle') }} className="absolute top-3 right-3 text-white/40 hover:text-white transition-colors"><X size={16} /></button>

                {solStatus === 'success' ? (
                  <div className="flex flex-col items-center text-center gap-3 py-4">
                    <div className="w-12 h-12 rounded-full bg-green/20 border border-green/50 flex items-center justify-center text-green text-2xl">✓</div>
                    <h2 className="wordmark text-white text-lg tracking-wide">Solicitação enviada</h2>
                    <p className="text-white/55 text-sm leading-relaxed">Seu pedido foi enviado ao comando. Assim que aprovado, você poderá entrar com o usuário e senha que cadastrou.</p>
                    <button onClick={() => { setView('buttons'); setSolStatus('idle'); solForm.reset() }}
                      className="mt-1 text-sm text-gold3 hover:text-gold2 transition-colors">Voltar ao início</button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-1">
                      <UserPlus size={14} className="text-gold" />
                      <h2 className="font-mono text-white text-xs tracking-[0.3em]">SOLICITAR CADASTRO</h2>
                    </div>
                    <p className="text-white/45 text-[11px] mb-4 leading-relaxed">Preencha seus dados. Um administrador precisa aprovar antes do primeiro acesso.</p>

                    <form onSubmit={solForm.handleSubmit(onSolicitar)} className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="font-mono text-[10px] text-white/50 tracking-wider">NOME / POLICIAL</label>
                        <div className="relative">
                          <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                          <input {...solForm.register('nome', { required: 'Nome obrigatório' })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 pl-9 text-sm text-white placeholder-white/25 outline-none focus:border-gold transition-colors" placeholder="Ex.: Peter Wolf" />
                        </div>
                        {solForm.formState.errors.nome && <p className="text-red text-[11px] font-mono">{solForm.formState.errors.nome.message}</p>}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="font-mono text-[10px] text-white/50 tracking-wider">USUÁRIO DESEJADO</label>
                        <div className="relative">
                          <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                          <input {...solForm.register('username', { required: 'Usuário obrigatório', minLength: { value: 2, message: 'Mínimo 2 caracteres' }, pattern: { value: /^[\w.\-]+$/, message: 'Sem espaços ou símbolos' } })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 pl-9 text-sm font-mono text-white placeholder-white/25 outline-none focus:border-gold transition-colors" placeholder="seu.usuario" autoComplete="username" />
                        </div>
                        {solForm.formState.errors.username && <p className="text-red text-[11px] font-mono">{solForm.formState.errors.username.message}</p>}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="font-mono text-[10px] text-white/50 tracking-wider">SENHA</label>
                        <div className="relative">
                          <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                          <input {...solForm.register('password', { required: 'Senha obrigatória', minLength: { value: 4, message: 'Mínimo 4 caracteres' } })} type={showPass ? 'text' : 'password'} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 pl-9 pr-10 text-sm font-mono text-white placeholder-white/25 outline-none focus:border-gold transition-colors" placeholder="••••••••" autoComplete="new-password" />
                          <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">{showPass ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                        </div>
                        {solForm.formState.errors.password && <p className="text-red text-[11px] font-mono">{solForm.formState.errors.password.message}</p>}
                      </div>
                      {solErro && <p className="text-red text-[11px] font-mono">{solErro}</p>}
                      <motion.button type="submit" disabled={solStatus === 'loading'} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="mt-1 w-full py-2.5 bg-gold text-white font-medium text-sm rounded-lg hover:bg-gold2 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                        {solStatus === 'loading' ? 'ENVIANDO...' : <><Send size={14} /> Enviar solicitação</>}
                      </motion.button>
                    </form>
                  </>
                )}
              </motion.div>
            ) : (
              <motion.div key="form" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="relative w-full max-w-sm bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-2xl p-6">
                <button onClick={() => setView('buttons')} className="absolute top-3 right-3 text-white/40 hover:text-white transition-colors"><X size={16} /></button>

                <AnimatePresence>
                  {status === 'success' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 rounded-2xl flex flex-col items-center justify-center gap-2 bg-green/20 border border-green/50 backdrop-blur">
                      <span className="text-green text-3xl">✓</span>
                      <p className="font-mono text-sm text-green tracking-wider">ACESSO CONCEDIDO</p>
                    </motion.div>
                  )}
                  {status === 'error' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, x: [0, -8, 8, -8, 8, 0] }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 rounded-2xl flex flex-col items-center justify-center gap-2 bg-red/20 border border-red/50 backdrop-blur">
                      <span className="text-red text-3xl">✕</span>
                      <p className="font-mono text-sm text-red tracking-wider">ACESSO NEGADO</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex items-center gap-2 mb-5">
                  <Lock size={14} className="text-gold" />
                  <h2 className="font-mono text-white text-xs tracking-[0.3em]">ACESSO INTERNO</h2>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[10px] text-white/50 tracking-wider">USUÁRIO</label>
                    <div className="relative">
                      <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                      <input {...register('username', { required: 'Usuário obrigatório' })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 pl-9 text-sm font-mono text-white placeholder-white/25 outline-none focus:border-gold transition-colors" placeholder="seu.usuario" autoComplete="username" />
                    </div>
                    {errors.username && <p className="text-red text-[11px] font-mono">{errors.username.message}</p>}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[10px] text-white/50 tracking-wider">SENHA</label>
                    <div className="relative">
                      <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                      <input {...register('password', { required: 'Senha obrigatória' })} type={showPass ? 'text' : 'password'} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 pl-9 pr-10 text-sm font-mono text-white placeholder-white/25 outline-none focus:border-gold transition-colors" placeholder="••••••••" autoComplete="current-password" />
                      <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">{showPass ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                    </div>
                    {errors.password && <p className="text-red text-[11px] font-mono">{errors.password.message}</p>}
                  </div>
                  <motion.button type="submit" disabled={status === 'loading'} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="mt-1 w-full py-2.5 bg-gold text-white font-medium text-sm rounded-lg hover:bg-gold2 transition-colors disabled:opacity-50">
                    {status === 'loading' ? 'VERIFICANDO...' : 'Entrar'}
                  </motion.button>
                </form>
              </motion.div>
            )}
          </div>

          {reason && REASONS[reason] && (
            <p className="mt-5 text-xs font-mono text-red">{REASONS[reason]}</p>
          )}
        </div>
      </main>

      {/* ── Rodapé ──────────────────────────────────────────────── */}
      <footer className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-end px-8 lg:px-14 py-6">
        <p className="font-mono text-[9px] text-white/30 tracking-[0.25em] uppercase">
          Desenvolvido por <span className="text-gold3/80">LC Dev</span>
        </p>
      </footer>

      {/* ── Overlay Ranking/Membros ─────────────────────────────── */}
      <AnimatePresence>
        {overlay && <PublicOverlay initialTab={overlay} onClose={() => setOverlay(null)} />}
      </AnimatePresence>
    </div>
  )
}
