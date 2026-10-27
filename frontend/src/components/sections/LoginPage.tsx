import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldX, CalendarClock, FileText, LogIn, UserPlus, User, Lock, Eye, EyeOff, ArrowLeft, CheckCircle2, IdCard } from 'lucide-react'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/authStore'
import type { AuthUser } from '@/types'
import logoDU from '@/assets/du-logo.webp'
import Brand from '@/components/ui/Brand'
import MusicPlayer from '@/components/ui/MusicPlayer'
import PublicOverlay from '@/components/sections/PublicOverlay'

const REASONS: Record<string, string> = {
  desativada: 'Conta desativada. Contate o administrador.',
}

const erroApi = (e: unknown, padrao: string) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? padrao

const campo = 'w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 pl-9 text-sm font-mono text-white placeholder-white/25 outline-none focus:border-gold transition-colors'
const rotulo = 'block font-mono text-[10px] text-white/50 tracking-[0.2em] uppercase mb-1.5'

function Campo({ icone: Icone, children }: { icone: typeof User; children: React.ReactNode }) {
  return (
    <div className="relative">
      <Icone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none" />
      {children}
    </div>
  )
}

/** Entrar com usuário e senha (igual ao Sistema Tática). */
function FormEntrar({ onVoltar }: { onVoltar: () => void }) {
  const navigate = useNavigate()
  const [, setParams] = useSearchParams()
  const setAuth = useAuthStore(s => s.setAuth)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [ver, setVer] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setErro(''); setEnviando(true)
    try {
      const { data } = await api.post<AuthUser & { token: string }>('/auth/login', { username: username.trim(), password })
      setAuth(data.token, { contaId: data.contaId, username: data.username, nivel: data.nivel })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      const corpo = (err as { response?: { data?: { reason?: string; ate?: string } } })?.response?.data
      if (corpo?.reason) { setParams(corpo.ate ? { reason: corpo.reason, ate: corpo.ate } : { reason: corpo.reason }); onVoltar(); return }
      setErro(erroApi(err, 'Não foi possível entrar. Tente novamente.'))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={entrar} className="w-full max-w-sm flex flex-col gap-4 text-left rounded-2xl border border-white/10 bg-black/45 backdrop-blur-md p-6">
      <div>
        <label htmlFor="login-usuario" className={rotulo}>Usuário</label>
        <Campo icone={User}>
          <input id="login-usuario" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoFocus required maxLength={32} placeholder="seu.usuario" className={campo} />
        </Campo>
      </div>
      <div>
        <label htmlFor="login-senha" className={rotulo}>Senha</label>
        <Campo icone={Lock}>
          <input id="login-senha" type={ver ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required maxLength={128} placeholder="••••••••" className={`${campo} pr-10`} />
          <button type="button" onClick={() => setVer(v => !v)} aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">{ver ? <EyeOff size={15} /> : <Eye size={15} />}</button>
        </Campo>
      </div>
      {erro && <p role="alert" className="text-red text-xs font-mono">{erro}</p>}
      <button type="submit" disabled={enviando}
        className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gold hover:bg-gold2 text-white font-medium text-sm transition-colors disabled:opacity-60 shadow-[0_12px_34px_-10px_rgba(139,92,246,0.7)]">
        <LogIn size={16} /> {enviando ? 'Entrando...' : 'Entrar'}
      </button>
      <button type="button" onClick={onVoltar} className="flex items-center justify-center gap-1.5 text-xs text-white/45 hover:text-white transition-colors">
        <ArrowLeft size={13} /> Voltar
      </button>
    </form>
  )
}

/** Pedido de acesso: o comando aprova em Configurações → Solicitações. */
function FormSolicitar({ onVoltar }: { onVoltar: () => void }) {
  const [nome, setNome] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirma, setConfirma] = useState('')
  const [ver, setVer] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  async function solicitar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username.trim())) { setErro('Usuário: 3 a 32 caracteres, só letras, números, ponto, hífen e sublinhado.'); return }
    if (password.length < 8) { setErro('A senha precisa de pelo menos 8 caracteres.'); return }
    if (password !== confirma) { setErro('A confirmação não bate com a senha.'); return }
    setEnviando(true)
    try {
      await api.post('/auth/solicitar', { nome: nome.trim(), username: username.trim(), password })
      setEnviado(true)
    } catch (err) {
      setErro(erroApi(err, 'Não foi possível enviar o pedido. Tente novamente.'))
    } finally {
      setEnviando(false)
    }
  }

  if (enviado) {
    return (
      <div className="w-full max-w-sm flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-black/45 backdrop-blur-md p-6">
        <CheckCircle2 size={34} className="text-green" />
        <p className="text-white font-semibold">Pedido enviado!</p>
        <p className="text-white/55 text-sm leading-relaxed">Seu pedido foi enviado ao comando. Assim que for aprovado, entre com o usuário e a senha que você escolheu.</p>
        <button onClick={onVoltar} className="mt-2 flex items-center gap-1.5 text-xs text-white/55 hover:text-white transition-colors"><ArrowLeft size={13} /> Voltar</button>
      </div>
    )
  }

  return (
    <form onSubmit={solicitar} className="w-full max-w-sm flex flex-col gap-4 text-left rounded-2xl border border-white/10 bg-black/45 backdrop-blur-md p-6">
      <div>
        <label htmlFor="sol-nome" className={rotulo}>Nome (no RP)</label>
        <Campo icone={IdCard}>
          <input id="sol-nome" value={nome} onChange={e => setNome(e.target.value)} required minLength={2} maxLength={60} autoFocus placeholder="Ex: Peter Wolf" className={campo} />
        </Campo>
      </div>
      <div>
        <label htmlFor="sol-usuario" className={rotulo}>Usuário</label>
        <Campo icone={User}>
          <input id="sol-usuario" value={username} onChange={e => setUsername(e.target.value)} required maxLength={32} autoComplete="username" placeholder="peter.wolf" className={campo} />
        </Campo>
      </div>
      <div>
        <label htmlFor="sol-senha" className={rotulo}>Senha</label>
        <Campo icone={Lock}>
          <input id="sol-senha" type={ver ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={8} maxLength={128} autoComplete="new-password" placeholder="mín. 8 caracteres" className={`${campo} pr-10`} />
          <button type="button" onClick={() => setVer(v => !v)} aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">{ver ? <EyeOff size={15} /> : <Eye size={15} />}</button>
        </Campo>
      </div>
      <div>
        <label htmlFor="sol-confirma" className={rotulo}>Confirme a senha</label>
        <Campo icone={Lock}>
          <input id="sol-confirma" type={ver ? 'text' : 'password'} value={confirma} onChange={e => setConfirma(e.target.value)} required maxLength={128} autoComplete="new-password" placeholder="••••••••" className={campo} />
        </Campo>
      </div>
      {erro && <p role="alert" className="text-red text-xs font-mono">{erro}</p>}
      <button type="submit" disabled={enviando}
        className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gold hover:bg-gold2 text-white font-medium text-sm transition-colors disabled:opacity-60">
        <UserPlus size={16} /> {enviando ? 'Enviando...' : 'Solicitar acesso'}
      </button>
      <button type="button" onClick={onVoltar} className="flex items-center justify-center gap-1.5 text-xs text-white/45 hover:text-white transition-colors">
        <ArrowLeft size={13} /> Voltar
      </button>
    </form>
  )
}

/* Fundo: arte investigativa da DU com movimento lento (respeita reduzir movimento) */
function FundoInvestigativo() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <div className="absolute inset-[-4%] bg-cover bg-center motion-safe:animate-[du-pan_38s_ease-in-out_infinite_alternate]"
           style={{ backgroundImage: 'url(/media/du/login-bg.webp)' }} />
      {/* brilho roxo + scrim central para legibilidade */}
      <div className="absolute inset-0 pointer-events-none"
           style={{ background: 'radial-gradient(60% 70% at 50% 55%, rgba(7,5,11,0.86) 0%, rgba(7,5,11,0.6) 55%, rgba(7,5,11,0.35) 100%)' }} />
      <div className="absolute inset-0 pointer-events-none mix-blend-screen opacity-60"
           style={{ background: 'radial-gradient(45% 40% at 50% 100%, rgba(139,92,246,0.35), transparent 70%)' }} />
      <div className="absolute inset-0 grain-noise opacity-[0.06] pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none"
           style={{ background: 'radial-gradient(130% 100% at 50% 50%, transparent 45%, rgba(0,0,0,0.75) 100%)' }} />
    </div>
  )
}

export default function LoginPage() {
  const [params] = useSearchParams()
  const reason = params.get('reason')
  const ate = params.get('ate')
  const ateFmt = ate && /^\d{4}-\d{2}-\d{2}$/.test(ate) ? ate.split('-').reverse().join('/') : null
  const [tela, setTela] = useState<'inicio' | 'entrar' | 'solicitar'>('inicio')

  return (
    <div className="relative altura-tela w-full overflow-hidden bg-black text-white">
      <FundoInvestigativo />

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header className="relative z-30 flex items-center justify-between px-5 sm:px-8 lg:px-14 pt-5 sm:pt-6">
        <div className="flex items-center gap-3">
          <Brand size={40} />
          <div className="leading-tight">
            <p className="wordmark text-sm text-white tracking-[0.14em]">Detective Unit</p>
            <p className="font-mono text-[8px] text-white/45 tracking-[0.2em] uppercase">Detroit Police Department</p>
          </div>
        </div>
      </header>

      {/* ── Hero (centralizado) ──────────────────────────────────── */}
      <main className="relative z-20 h-[calc(100%-140px)] flex items-center justify-center px-5 sm:px-8 lg:px-14">
        <div className="w-full max-w-xl flex flex-col items-center text-center">
          <div className="flex items-center gap-2 mb-5">
            <span className="h-px w-8 bg-gold" />
            <span className="font-mono text-[11px] text-gold3 tracking-[0.3em] uppercase">Detroit Police Department</span>
            <span className="h-px w-8 bg-gold" />
          </div>

          <h1 className="mb-3">
            <img src={logoDU} alt="Detective Unit — Detroit Police Department" width={130} height={158}
              className={`${tela === 'inicio' ? 'h-32 sm:h-40' : 'h-20 sm:h-24'} w-auto mx-auto drop-shadow-[0_14px_40px_rgba(0,0,0,0.75)] transition-all duration-300`} />
          </h1>
          <p className="wordmark text-lg sm:text-2xl tracking-[0.5em] text-gold3 -mt-1 mb-3 pl-[0.5em]">Detective Unit</p>
          <p className="text-white/55 text-sm max-w-md mb-8">Relatórios, boletins, inquéritos e inteligência investigativa — tudo em um só lugar.</p>

          <AnimatePresence mode="wait">
            <motion.div key={tela} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}
              className="w-full flex flex-col items-center">
              {tela === 'inicio' && (
                <div className="flex flex-col items-center gap-3">
                  <motion.button onClick={() => setTela('entrar')} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    className="flex items-center gap-2.5 w-fit px-8 py-3.5 rounded-xl bg-gold hover:bg-gold2 text-white font-medium text-sm transition-colors shadow-[0_12px_34px_-10px_rgba(139,92,246,0.7)]">
                    <LogIn size={17} /> Entrar no painel
                  </motion.button>
                  <button onClick={() => setTela('solicitar')} className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors">
                    <UserPlus size={14} /> Não tem acesso? <span className="text-gold3 underline underline-offset-2">Solicitar acesso</span>
                  </button>
                </div>
              )}
              {tela === 'entrar' && <FormEntrar onVoltar={() => setTela('inicio')} />}
              {tela === 'solicitar' && <FormSolicitar onVoltar={() => setTela('inicio')} />}
            </motion.div>
          </AnimatePresence>

          {reason === 'exonerado' && (
            <div className="mt-6 max-w-md w-full text-left flex gap-3 rounded-xl border border-red/50 bg-red/15 backdrop-blur px-4 py-4">
              <ShieldX size={22} className="text-red shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-white">Você foi exonerado da unidade.</p>
                <p className="text-xs text-white/70 mt-1 leading-relaxed">Seu acesso ao painel foi encerrado. Entre em contato com o <span className="text-white font-medium">Alto Comando da unidade</span> para entender o que aconteceu.</p>
              </div>
            </div>
          )}
          {reason === 'ausente' && (
            <div className="mt-6 max-w-md w-full text-left flex gap-3 rounded-xl border border-gold/50 bg-gold/15 backdrop-blur px-4 py-4">
              <CalendarClock size={22} className="text-gold3 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-white">Você está em ausência{ateFmt ? ` até ${ateFmt}` : ''}.</p>
                <p className="text-xs text-white/70 mt-1 leading-relaxed">O acesso ao painel volta automaticamente ao fim do período. Se retornou antes, peça ao comando para retirar sua ausência.</p>
              </div>
            </div>
          )}
          {reason && REASONS[reason] && (
            <p className="mt-5 text-xs font-mono text-red">{REASONS[reason]}</p>
          )}
        </div>
      </main>

      {/* ── Rodapé ──────────────────────────────────────────────── */}
      <footer className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-end px-5 sm:px-8 lg:px-14 py-6">
        <p className="font-mono text-[9px] text-white/30 tracking-[0.25em] uppercase">
          Desenvolvido por <span className="text-gold3/80">LC Dev e Vilão</span>
        </p>
      </footer>

      {/* ── Player de música (canto inferior esquerdo) ──────────── */}
      <MusicPlayer />

      {/* ── Termos (logo abaixo do player) ──────────────────────── */}
      <Link
        to="/termos"
        className="group fixed bottom-14 left-4 sm:bottom-6 sm:left-6 z-40 flex items-center gap-2.5 px-3 py-2 transition-opacity opacity-70 hover:opacity-100 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"
      >
        <FileText size={15} className="text-gold3 shrink-0" />
        <span className="leading-tight">
          <span className="block text-[12px] font-semibold text-white/85 group-hover:text-white">Termos e Privacidade</span>
          <span className="block font-mono text-[8.5px] tracking-[0.18em] uppercase text-white/40">© Nata Studios</span>
        </span>
      </Link>

      {/* ── Overlay Membros ─────────────────────────────── */}
      <PublicOverlay />
    </div>
  )
}
