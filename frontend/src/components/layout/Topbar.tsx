import { useState, useRef, useEffect } from 'react'
import { LogOut, ChevronDown, User as UserIcon, Menu } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useMe } from '@/hooks/useMe'
import NotificationBell from './NotificationBell'
import Ajuda from '@/components/ui/Ajuda'
import { ajudaDaRota } from '@/lib/ajuda'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':        'Visão geral',
  '/avisos':           'Avisos',
  '/perfil':           'Meu perfil',
  '/relatorios':       'Relatórios investigativos',
  '/relatorios/novo':  'Cadastrar relatório',
  '/boletins':         'Boletins',
  '/inqueritos':       'Arquivo de Inquéritos',
  '/galeria':          'Galeria da DU',
  '/membros':          'Membros da unidade',
  '/logs':             'Logs',
  '/arvores':          'Árvores de investigação',
  '/ausencias/nova':   'Registrar ausência',
  '/ausencias':        'Ausências',
  '/fardamento':       'Fardamento',
  '/recrutamento':     'Recrutamento',
  '/anuncio':          'Gerar anúncio',
  '/protocolo':        'Protocolo operacional',
  '/carteira':         'Carteirinha da DU',
  '/cursos':           'Cursos internos',
  '/configuracoes':    'Configurações',
  '/hierarquia':       'Hierarquia',
  '/setagem':          'Setagem',
  '/servidor':         'Servidor Discord',
}

function resolveTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  if (pathname.startsWith('/recrutamento/')) return 'Avaliação de recruta'
  if (pathname.startsWith('/arvores/')) return 'Árvore de investigação'
  return 'Detective Unit'
}

export default function Topbar({ onAbrirMenu }: { onAbrirMenu?: () => void }) {
  const { user, logout } = useAuthStore()
  const { data: me } = useMe()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const title = resolveTitle(pathname)
  const ajuda = ajudaDaRota(pathname)
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

  const nomeExibido = me?.nome || me?.nomeServidor || user?.username || '?'   // codinome (regra)
  const fotoExibida = me?.avatarAtual || null
  const initials = nomeExibido.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '?'
  const roleLabel = me?.admin ? 'Administrador' : 'Membro'

  return (
    <header className="h-14 sm:h-16 bg-bg border-b border-bdr flex items-center px-3 sm:px-6 gap-2 sm:gap-4 shrink-0">
      {onAbrirMenu && (
        <button
          type="button"
          onClick={onAbrirMenu}
          className="lg:hidden -ml-1 w-10 h-10 shrink-0 flex items-center justify-center rounded-md text-txt2 hover:text-txt hover:bg-white/5"
          aria-label="Abrir menu"
        >
          <Menu size={20} />
        </button>
      )}
      <div className="flex-1 min-w-0 flex items-center gap-1">
        <p className="font-mono text-[10px] sm:text-[11px] text-txt2 tracking-[0.18em] sm:tracking-[0.25em] uppercase min-w-0 truncate">
          {title}
        </p>
        {/* "?" de todo módulo: explica como a página funciona */}
        {ajuda && <Ajuda key={pathname} titulo={ajuda.titulo} passos={ajuda.passos} dicas={ajuda.dicas} />}
      </div>

      {user && <NotificationBell />}

      {user && (
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-2 sm:gap-3 group min-h-10"
          >
            <div className="hidden sm:block text-right leading-tight">
              <p className="text-sm font-medium text-txt max-w-45 truncate">{nomeExibido}</p>
              <p className="font-mono text-[10px] text-txt2 tracking-wider uppercase">
                {roleLabel}
              </p>
            </div>
            <div className="w-9 h-9 rounded-full bg-card2 border border-bdr2 flex items-center justify-center text-gold3 text-xs font-semibold overflow-hidden">
              {fotoExibida
                ? <img src={fotoExibida} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                : initials}
            </div>
            <ChevronDown size={15} className="text-txt3 group-hover:text-txt2 transition-colors" />
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-2 w-44 bg-card border border-bdr2 rounded-lg shadow-2xl py-1 z-50">
              <button
                onClick={() => { setOpen(false); navigate('/perfil') }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-txt2 hover:text-txt hover:bg-white/3 transition-colors">
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
