import { lazy, type ComponentType } from 'react'

/**
 * Páginas carregadas sob demanda (code splitting por rota).
 * Cada import() vira um chunk separado; `precarregarRota` antecipa o download
 * quando o usuário demonstra intenção (hover/toque no menu), para a navegação
 * continuar instantânea.
 */
type Loader = () => Promise<{ default: ComponentType }>

const carregadores = {
  '/login': () => import('@/components/sections/LoginPage'),
  '/perfil-publico': () => import('@/components/sections/PerfilPublicoPage'),
  '/termos': () => import('@/components/sections/TermosPage'),
  '/onboarding': () => import('@/components/sections/OnboardingPage'),
  '/dashboard': () => import('@/components/sections/DashboardPage'),
  '/relatorios': () => import('@/components/sections/RelatoriosPage'),
  '/relatorios/novo': () => import('@/components/sections/RelatoriosPage'),
  '/boletins': () => import('@/components/sections/BoletinsPage'),
  '/inqueritos': () => import('@/components/sections/InqueritosPage'),
  '/investigacoes': () => import('@/components/sections/RegistroInvestigacaoPage'),
  '/investigacoes/aprovacoes': () => import('@/components/sections/AprovarInvestigacoesPage'),
  '/pendentes': () => import('@/components/sections/PendentesPage'),
  '/galeria': () => import('@/components/sections/GaleriaPage'),
  '/avisos': () => import('@/components/sections/AvisosPage'),
  '/perfil': () => import('@/components/sections/ProfilePage'),
  '/ausencias/nova': () => import('@/components/sections/RegistrarAusenciaPage'),
  '/ausencias': () => import('@/components/sections/AusenciasPage'),
  '/fardamento': () => import('@/components/sections/FardamentoPage'),
  '/anuncio': () => import('@/components/sections/GerarAnuncioPage'),
  '/protocolo': () => import('@/components/sections/ProtocoloPage'),
  '/carteira': () => import('@/components/sections/GerarCarteiraPage'),
  '/cursos': () => import('@/components/sections/CursosPage'),
  '/recrutamento': () => import('@/components/sections/RecrutamentoPage'),
  '/recrutamento/:id': () => import('@/components/sections/RecrutaCandidatoPage'),
  '/membros': () => import('@/components/sections/MembrosPage'),
  '/configuracoes': () => import('@/components/sections/ConfiguracoesPage'),
  '/hierarquia': () => import('@/components/sections/HierarquiaPage'),
  '/servidor': () => import('@/components/sections/ServidorPage'),
  '/logs': () => import('@/components/sections/LogsPage'),
  '/arvores': () => import('@/components/sections/ArvoresPage'),
  '/arvores/:id': () => import('@/components/sections/ArvoreQuadroPage'),
  '/setagem': () => import('@/components/sections/SetagemPage'),
} satisfies Record<string, Loader>

export type Rota = keyof typeof carregadores

const iniciados = new Set<string>()

export function precarregarRota(rota: string): void {
  const fn = (carregadores as Record<string, Loader>)[rota]
  if (!fn || iniciados.has(rota)) return
  iniciados.add(rota)
  fn().catch(() => iniciados.delete(rota))
}

const CHAVE_RECARGA = 'du:recarga-chunk'

/** Após um deploy, chunks antigos somem: recarrega a página uma vez para pegar os novos. */
function comRecarga(fn: Loader): Loader {
  return () => fn().then(mod => {
    try { sessionStorage.removeItem(CHAVE_RECARGA) } catch { /* sem storage */ }
    return mod
  }, err => {
    let jaRecarregou = true
    try { jaRecarregou = sessionStorage.getItem(CHAVE_RECARGA) === '1'; sessionStorage.setItem(CHAVE_RECARGA, '1') } catch { /* sem storage */ }
    if (!jaRecarregou) window.location.reload()
    throw err
  })
}

export const paginaLazy = (rota: Rota) => lazy(comRecarga(carregadores[rota] as Loader))
