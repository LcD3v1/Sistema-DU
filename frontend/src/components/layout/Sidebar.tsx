import { NavLink } from 'react-router-dom'
import {
  LayoutGrid, FilePlus2, ClipboardCheck, History,
  Users, Trophy, CalendarPlus, CalendarDays, ArrowUpNarrowWide, UserPlus,
  Megaphone, GraduationCap, ScrollText, BookOpen, CreditCard, Shirt,
  Settings, ArrowUpRight, Code2, Bell,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAcoes } from '@/hooks/useAcoes'
import { useAvisos } from '@/hooks/useAvisos'
import { usePerms } from '@/hooks/usePerms'
import Brand from '@/components/ui/Brand'
import type { Nivel } from '@/types'
import type { AreaId } from '@/lib/permAreas'

interface NavItem {
  to: string
  icon: LucideIcon
  label: string
  minNivel: Nivel
  area?: AreaId
  viewOnly?: boolean
  badge?: number
  external?: boolean
}
interface NavGroup {
  title: string
  items: NavItem[]
}

const GROUPS: NavGroup[] = [
  {
    title: 'Painel',
    items: [
      { to: '/dashboard', icon: LayoutGrid, label: 'Visão geral', minNivel: 'membro', area: 'dashboard' },
      { to: '/avisos',    icon: Bell,       label: 'Avisos',      minNivel: 'membro', viewOnly: true, area: 'avisos' },
    ],
  },
  {
    title: 'Apreensões',
    items: [
      { to: '/acoes/nova',       icon: FilePlus2,      label: 'Cadastrar',       minNivel: 'membro', area: 'registrar_acao' },
      { to: '/acoes/pendentes',  icon: ClipboardCheck, label: 'Pendentes',       minNivel: 'membro', area: 'pendentes' },
      { to: '/acoes/historico',  icon: History,        label: 'Histórico',       minNivel: 'membro', area: 'historico' },
    ],
  },
  {
    title: 'Efetivo',
    items: [
      { to: '/membros',        icon: Users,             label: 'Membros',            minNivel: 'membro', viewOnly: true, area: 'membros' },
      { to: '/ranking',        icon: Trophy,            label: 'Ranking',            minNivel: 'membro', viewOnly: true, area: 'ranking' },
      { to: '/ausencias/nova', icon: CalendarPlus,      label: 'Registrar Ausência', minNivel: 'membro', area: 'ausencias' },
      { to: '/ausencias',      icon: CalendarDays,      label: 'Ausências',          minNivel: 'membro', area: 'ausencias' },
      { to: '/promocoes',      icon: ArrowUpNarrowWide, label: 'Promoções',          minNivel: 'moderador', area: 'promocoes' },
      { to: '/fardamento',     icon: Shirt,             label: 'Fardamento',         minNivel: 'membro', area: 'fardamento' },
      { to: '/recrutamento',   icon: UserPlus,          label: 'Recrutamento',       minNivel: 'membro', external: true, area: 'recrutamento' },
    ],
  },
  {
    title: 'Interações',
    items: [
      { to: '/anuncio',  icon: Megaphone,     label: 'Gerar anúncio',    minNivel: 'moderador', area: 'anuncio' },
      { to: '/boletim',  icon: ScrollText,    label: 'Gerar boletim',    minNivel: 'membro', area: 'boletim' },
      { to: '/protocolo', icon: BookOpen,     label: 'Protocolo',        minNivel: 'membro', viewOnly: true, area: 'protocolo' },
      { to: '/carteira',  icon: CreditCard,   label: 'Gerar carteira',   minNivel: 'membro', area: 'carteira' },
      { to: '/cursos',   icon: GraduationCap, label: 'Cursos Internos',  minNivel: 'membro', external: true },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { to: '/configuracoes', icon: Settings, label: 'Configurações', minNivel: 'moderador', area: 'configuracoes' },
    ],
  },
]

export default function Sidebar() {
  const { data: pend } = useAcoes({ status: 'pendente', limit: 1 })
  const pendingCount = pend?.total ?? 0
  const { data: avisosData } = useAvisos()
  const avisosNaoVistos = avisosData?.naoVistos ?? 0

  const { canView, admin } = usePerms()

  const groups = GROUPS
    .map(g => ({
      ...g,
      items: g.items.filter(item => {
        // Configurações é administração do sistema → só admin
        if (item.area === 'configuracoes') return admin
        // Demais áreas: conforme a permissão de "ver" do cargo
        if (item.area && !canView(item.area)) return false
        return true
      }),
    }))
    .filter(g => g.items.length > 0)

  return (
    <nav className="w-60 bg-sb border-r border-bdr flex flex-col shrink-0 overflow-hidden">
      {/* Logo + nome */}
      <div className="flex flex-col items-center pt-6 pb-5 px-3 gap-2 border-b border-bdr/60">
        <div className="relative flex items-center justify-center" style={{ width: 86, height: 86 }}>
          <div className="absolute inset-0 rounded-full pointer-events-none"
               style={{ background: 'radial-gradient(circle, rgba(58,114,196,0.5), transparent 68%)', animation: 'logo-aura 3.2s ease-in-out infinite' }} />
          <div className="absolute inset-1.5 rounded-full pointer-events-none"
               style={{
                 background: 'conic-gradient(from 0deg, transparent 0deg, rgba(58,114,196,0.95) 90deg, transparent 210deg)',
                 WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))',
                 mask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))',
                 animation: 'logo-ring 5s linear infinite',
               }} />
          <div style={{ animation: 'logo-float 4s ease-in-out infinite', filter: 'drop-shadow(0 0 12px rgba(58,114,196,0.5))' }}>
            <Brand size={62} />
          </div>
        </div>
        <p className="wordmark text-[15px] text-txt tracking-[0.18em] mt-1">Fast Unit</p>
      </div>

      {/* Navegação */}
      <div className="flex-1 overflow-y-auto pb-4 px-3">
        {groups.map(group => (
          <div key={group.title} className="mb-1">
            <p className="font-mono text-[10px] text-txt3 tracking-[0.2em] uppercase px-2 mt-5 mb-2">
              {group.title}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end
                  className={({ isActive }) =>
                    `group relative flex items-center gap-3 pl-3 pr-2 py-2 rounded-md text-sm transition-colors
                    ${isActive
                      ? 'bg-gold/10 text-txt font-medium'
                      : 'text-txt2 hover:text-txt hover:bg-white/[0.03]'
                    }`
                  }
                >
                  {({ isActive }) => {
                    const badge = item.to === '/acoes/pendentes' ? pendingCount
                      : item.to === '/avisos' ? avisosNaoVistos
                      : item.badge
                    return (
                    <>
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-gold" />
                      )}
                      <item.icon
                        size={17}
                        className={`shrink-0 ${isActive ? 'text-gold' : 'text-txt3 group-hover:text-txt2'}`}
                      />
                      <span className="flex-1 truncate">{item.label}</span>
                      {badge != null && badge > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1 rounded-md bg-red/90 text-white text-[11px] font-semibold flex items-center justify-center">
                          {badge}
                        </span>
                      )}
                      {item.external && (
                        <ArrowUpRight size={13} className="shrink-0 text-txt3" />
                      )}
                    </>
                    )
                  }}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer — desenvolvido por */}
      <div className="group m-3 flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-gradient-to-br from-navy2/50 to-transparent px-3 py-2.5 transition-colors hover:border-gold/30">
        <div className="w-7 h-7 shrink-0 rounded-md bg-gold/15 border border-gold/30 flex items-center justify-center transition-transform group-hover:scale-105">
          <Code2 size={14} className="text-gold3" />
        </div>
        <div className="leading-tight">
          <p className="font-mono text-[8px] text-txt3 tracking-[0.22em] uppercase">Desenvolvido por</p>
          <p className="text-[12px] font-semibold text-txt tracking-wide">
            LC<span className="text-gold3"> Dev</span>
          </p>
        </div>
      </div>
    </nav>
  )
}
