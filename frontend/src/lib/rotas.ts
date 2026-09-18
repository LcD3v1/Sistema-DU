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
  '/historico-ranking': () => import('@/components/sections/HistoricoRankingPage'),
  '/termos': () => import('@/components/sections/TermosPage'),
  '/onboarding': () => import('@/components/sections/OnboardingPage'),
  '/dashboard': () => import('@/components/sections/DashboardPage'),
  '/avisos': () => import('@/components/sections/AvisosPage'),
  '/perfil': () => import('@/components/sections/ProfilePage'),
  '/acoes/nova': () => import('@/components/sections/RegistrarAcaoPage'),
  '/acoes/historico': () => import('@/components/sections/HistoricoPage'),
  '/acoes/pendentes': () => import('@/components/sections/PendentesPage'),
  '/estatisticas': () => import('@/components/sections/EstatisticasPage'),
  '/relatorio': () => import('@/components/sections/RelatorioUnidadePage'),
  '/ranking': () => import('@/components/sections/RankingPage'),
  '/ausencias/nova': () => import('@/components/sections/RegistrarAusenciaPage'),
  '/ausencias': () => import('@/components/sections/AusenciasPage'),
  '/fardamento': () => import('@/components/sections/FardamentoPage'),
  '/anuncio': () => import('@/components/sections/GerarAnuncioPage'),
  '/boletim': () => import('@/components/sections/GerarBoletimPage'),
  '/protocolo': () => import('@/components/sections/ProtocoloPage'),
  '/carteira': () => import('@/components/sections/GerarCarteiraPage'),
  '/mensagens': () => import('@/components/sections/EnviarMensagemPage'),
  '/cursos': () => import('@/components/sections/EmBreve'),
  '/recrutamento': () => import('@/components/sections/RecrutamentoPage'),
  '/recrutamento/:id': () => import('@/components/sections/RecrutaCandidatoPage'),
  '/membros': () => import('@/components/sections/MembrosPage'),
  '/configuracoes': () => import('@/components/sections/ConfiguracoesPage'),
} satisfies Record<string, Loader>

export type Rota = keyof typeof carregadores

const iniciados = new Set<string>()

export function precarregarRota(rota: string): void {
  const fn = (carregadores as Record<string, Loader>)[rota]
  if (!fn || iniciados.has(rota)) return
  iniciados.add(rota)
  fn().catch(() => iniciados.delete(rota))
}

const CHAVE_RECARGA = 'fast:recarga-chunk'

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
