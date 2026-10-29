import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShieldX, CalendarClock, FileText, Clock, UserX } from 'lucide-react'
import logoDU from '@/assets/du-logo.webp'
import Brand from '@/components/ui/Brand'
import MusicPlayer from '@/components/ui/MusicPlayer'
import PublicOverlay from '@/components/sections/PublicOverlay'

// Motivos vindos de /login?reason= (lista branca: texto fixo, nada vindo da URL é exibido)
const REASONS: Record<string, string> = {
  desativada: 'Conta desativada. Contate o administrador.',
  fora_do_servidor: 'Você precisa estar no servidor do Discord da unidade para entrar.',
  erro: 'Não foi possível entrar com o Discord. Tente novamente.',
  cancelado: 'Login cancelado.',
  indisponivel: 'O login pelo Discord está indisponível no momento. Avise o comando.',
}

/** Inicia o login pelo Discord (o backend redireciona para o Discord e volta). */
const URL_LOGIN_DISCORD = (import.meta.env.VITE_API_URL || '') + '/api/auth/discord'

function IconeDiscord({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
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
              className="h-32 sm:h-40 w-auto mx-auto drop-shadow-[0_14px_40px_rgba(0,0,0,0.75)]" />
          </h1>
          <p className="wordmark text-lg sm:text-2xl tracking-[0.5em] text-gold3 -mt-1 mb-3 pl-[0.5em]">Detective Unit</p>
          <p className="text-white/55 text-sm max-w-md mb-8">Relatórios, boletins, inquéritos e inteligência investigativa — tudo em um só lugar.</p>

          <div className="flex flex-col items-center gap-3">
            <motion.a href={URL_LOGIN_DISCORD} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2.5 w-fit px-8 py-3.5 rounded-xl bg-gold hover:bg-gold2 text-white font-medium text-sm transition-colors shadow-[0_12px_34px_-10px_rgba(139,92,246,0.7)]">
              <IconeDiscord /> Entrar com Discord
            </motion.a>
            <p className="text-[11px] text-white/45 max-w-xs leading-relaxed">
              Só para membros do servidor do Discord da unidade. No primeiro acesso, o comando aprova o seu pedido.
            </p>
          </div>

          {reason === 'saiu' && (
            <div role="alert" className="mt-6 max-w-md w-full text-left flex gap-3 rounded-xl border border-red/50 bg-red/15 backdrop-blur px-4 py-4">
              <UserX size={22} className="text-red shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-white">Você não pertence mais a esta unidade.</p>
                <p className="text-xs text-white/70 mt-1 leading-relaxed">Você saiu do servidor do Discord da Detective Unit e foi exonerado. Seu acesso ao painel foi encerrado. Para voltar, fale com o <span className="text-white font-medium">Alto Comando da unidade</span>.</p>
              </div>
            </div>
          )}
          {reason === 'exonerado' && (
            <div role="alert" className="mt-6 max-w-md w-full text-left flex gap-3 rounded-xl border border-red/50 bg-red/15 backdrop-blur px-4 py-4">
              <ShieldX size={22} className="text-red shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-white">Você foi exonerado da unidade.</p>
                <p className="text-xs text-white/70 mt-1 leading-relaxed">Seu acesso ao painel foi encerrado. Entre em contato com o <span className="text-white font-medium">Alto Comando da unidade</span> para entender o que aconteceu.</p>
              </div>
            </div>
          )}
          {reason === 'pendente' && (
            <div role="status" className="mt-6 max-w-md w-full text-left flex gap-3 rounded-xl border border-gold/50 bg-gold/15 backdrop-blur px-4 py-4">
              <Clock size={22} className="text-gold3 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-white">Pedido de acesso enviado.</p>
                <p className="text-xs text-white/70 mt-1 leading-relaxed">O comando da unidade precisa aprovar o seu acesso. Depois da aprovação, é só entrar com o Discord de novo.</p>
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
          Desenvolvido por <span className="text-gold3/80">LC Dev</span>
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
