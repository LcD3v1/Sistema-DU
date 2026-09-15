import { useState, useRef, useEffect } from 'react'
import { LogOut, ChevronDown, User as UserIcon, Eye } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useMe } from '@/hooks/useMe'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':        'Visão geral',
  '/avisos':           'Avisos',
  '/perfil':           'Meu perfil',
  '/acoes/nova':       'Cadastrar apreensão',
  '/acoes/pendentes':  'Apreensões pendentes',
  '/acoes/historico':  'Histórico de apreensões',
  '/estatisticas':     'Estatísticas',
  '/membros':          'Membros da unidade',
  '/ranking':          'Ranking',
  '/ausencias/nova':   'Registrar ausência',
  '/ausencias':        'Ausências',
  '/promocoes':        'Promoções',
  '/recrutamento':     'Recrutamento',
  '/anuncio':          'Gerar anúncio',
  '/boletim':          'Gerar boletim',
  '/protocolo':        'Protocolo operacional',
  '/carteira':         'Gerar carteira',
  '/cursos':           'Cursos internos',
  '/configuracoes':    'Configurações',
}

function resolveTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  if (pathname.startsWith('/recrutamento/')) return 'Avaliação de recruta'
  return 'FAST NPD'
}

const NIVEL_LABEL: Record<string, string> = {
  admin: 'Comando',
  moderador: 'Supervisor',
  membro: 'Officer',
  view_only: 'Observador',
}

export default function Topbar() {
  const { user, logout } = useAuthStore()
  const { data: me } = useMe()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const title = resolveTitle(pathname)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const initials = (user?.username ?? '?').slice(0, 2).toUpperCase()
  const isViewOnly = user?.nivel === 'view_only'

  return (
    <header className="h-16 bg-bg border-b border-bdr flex items-center px-6 gap-4 shrink-0">
      <p className="font-mono text-[11px] text-txt2 tracking-[0.25em] uppercase flex-1">
        {title}
      </p>

      {isViewOnly && (
        <div className="flex items-center gap-1.5 px-3 py-1 rounded border border-bdr2 bg-card font-mono text-[10px] text-txt2 tracking-widest">
          <Eye size={11} className="text-txt3" />
          SOMENTE LEITURA
        </div>
      )}

      {user && (
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-3 group"
          >
            <div className="text-right leading-tight">
              <p className="text-sm font-medium text-txt">{user.username}</p>
              <p className="font-mono text-[10px] text-txt2 tracking-wider uppercase">
                {NIVEL_LABEL[user.nivel] ?? user.nivel}
              </p>
            </div>
            <div className="w-9 h-9 rounded-full bg-card2 border border-bdr2 flex items-center justify-center text-gold3 text-xs font-semibold overflow-hidden">
              {me?.avatar
                ? <img src={me.avatar} alt="" className="w-full h-full object-cover" />
                : initials}
            </div>
            <ChevronDown size={15} className="text-txt3 group-hover:text-txt2 transition-colors" />
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-2 w-44 bg-card border border-bdr2 rounded-lg shadow-2xl py-1 z-50">
              <button
                onClick={() => { setOpen(false); navigate('/perfil') }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-txt2 hover:text-txt hover:bg-white/[0.03] transition-colors">
                <UserIcon size={15} /> Meu perfil
              </button>
              <div className="h-px bg-bdr my-1" />
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red hover:bg-red/10 transition-colors"
              >
                <LogOut size={15} /> Sair
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  )
}
