import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { useAuthStore } from '@/store/authStore'
import { useMe } from '@/hooks/useMe'
import type { AreaId } from '@/lib/permAreas'
import AppShell from '@/components/layout/AppShell'
import LoginPage from '@/components/sections/LoginPage'
import DashboardPage from '@/components/sections/DashboardPage'
import RegistrarAcaoPage from '@/components/sections/RegistrarAcaoPage'
import HistoricoPage from '@/components/sections/HistoricoPage'
import EstatisticasPage from '@/components/sections/EstatisticasPage'
import RecrutamentoPage from '@/components/sections/RecrutamentoPage'
import RecrutaCandidatoPage from '@/components/sections/RecrutaCandidatoPage'
import MembrosPage from '@/components/sections/MembrosPage'
import ConfiguracoesPage from '@/components/sections/ConfiguracoesPage'
import EmBreve from '@/components/sections/EmBreve'
import DiscordCallback from '@/components/sections/DiscordCallback'
import RegistrarAusenciaPage from '@/components/sections/RegistrarAusenciaPage'
import AusenciasPage from '@/components/sections/AusenciasPage'
import GerarAnuncioPage from '@/components/sections/GerarAnuncioPage'
import GerarBoletimPage from '@/components/sections/GerarBoletimPage'
import RankingPage from '@/components/sections/RankingPage'
import ProtocoloPage from '@/components/sections/ProtocoloPage'
import PendentesPage from '@/components/sections/PendentesPage'
import PromocoesPage from '@/components/sections/PromocoesPage'
import AvisosPage from '@/components/sections/AvisosPage'
import GerarCarteiraPage from '@/components/sections/GerarCarteiraPage'
import ProfilePage from '@/components/sections/ProfilePage'

interface ProtectedRouteProps {
  children: React.ReactNode
  area?: AreaId
  adminOnly?: boolean
}

function ProtectedRoute({ children, area, adminOnly = false }: ProtectedRouteProps) {
  const { token, user } = useAuthStore()
  const { data: me } = useMe()
  if (!token || !user) return <Navigate to="/login" replace />

  // Enquanto o /me carrega, renderiza (evita piscar). Quando carregado, aplica o cargo.
  if (me) {
    if (adminOnly && !me.admin) return <Navigate to="/perfil" replace />
    if (area && !me.admin && !me.permissoes?.[area]?.ver) return <Navigate to="/perfil" replace />
  }
  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore()
  if (token) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function RootRedirect() {
  return <Navigate to="/dashboard" replace />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={
            <PublicRoute><LoginPage /></PublicRoute>
          } />
          <Route path="/auth/discord" element={<DiscordCallback />} />
          <Route path="/" element={
            <ProtectedRoute><AppShell /></ProtectedRoute>
          }>
            <Route index element={<RootRedirect />} />
            <Route path="dashboard" element={
              <ProtectedRoute area="dashboard"><DashboardPage /></ProtectedRoute>
            } />
            <Route path="avisos" element={
              <ProtectedRoute area="avisos"><AvisosPage /></ProtectedRoute>
            } />
            <Route path="perfil" element={
              <ProtectedRoute><ProfilePage /></ProtectedRoute>
            } />
            <Route path="acoes/nova" element={
              <ProtectedRoute area="registrar_acao"><RegistrarAcaoPage /></ProtectedRoute>
            } />
            <Route path="acoes/historico" element={
              <ProtectedRoute area="historico"><HistoricoPage /></ProtectedRoute>
            } />
            <Route path="acoes/pendentes" element={
              <ProtectedRoute area="pendentes"><PendentesPage /></ProtectedRoute>
            } />
            <Route path="estatisticas" element={<EstatisticasPage />} />
            <Route path="ranking" element={<RankingPage />} />
            <Route path="ausencias/nova" element={
              <ProtectedRoute area="ausencias"><RegistrarAusenciaPage /></ProtectedRoute>
            } />
            <Route path="ausencias" element={
              <ProtectedRoute area="ausencias"><AusenciasPage /></ProtectedRoute>
            } />
            <Route path="promocoes" element={
              <ProtectedRoute area="promocoes"><PromocoesPage /></ProtectedRoute>
            } />
            <Route path="anuncio" element={
              <ProtectedRoute area="anuncio"><GerarAnuncioPage /></ProtectedRoute>
            } />
            <Route path="boletim" element={
              <ProtectedRoute area="boletim"><GerarBoletimPage /></ProtectedRoute>
            } />
            <Route path="protocolo" element={
              <ProtectedRoute area="protocolo"><ProtocoloPage /></ProtectedRoute>
            } />
            <Route path="carteira" element={
              <ProtectedRoute area="carteira"><GerarCarteiraPage /></ProtectedRoute>
            } />
            <Route path="cursos" element={
              <ProtectedRoute><EmBreve /></ProtectedRoute>
            } />
            <Route path="recrutamento" element={
              <ProtectedRoute area="recrutamento"><RecrutamentoPage /></ProtectedRoute>
            } />
            <Route path="recrutamento/:id" element={
              <ProtectedRoute area="recrutamento"><RecrutaCandidatoPage /></ProtectedRoute>
            } />
            <Route path="membros" element={
              <ProtectedRoute area="membros"><MembrosPage /></ProtectedRoute>
            } />
            <Route path="configuracoes" element={
              <ProtectedRoute adminOnly><ConfiguracoesPage /></ProtectedRoute>
            } />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
