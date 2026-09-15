import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { useAuthStore } from '@/store/authStore'
import { useMe } from '@/hooks/useMe'
import type { Nivel } from '@/types'
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

export const RANK: Record<Nivel, number> = { view_only: -1, membro: 0, moderador: 1, admin: 2 }

interface ProtectedRouteProps {
  children: React.ReactNode
  minNivel?: Nivel
  allowViewOnly?: boolean
  area?: AreaId
}

function ProtectedRoute({ children, minNivel = 'membro', allowViewOnly = false, area }: ProtectedRouteProps) {
  const { token, user } = useAuthStore()
  const { data: me } = useMe()
  if (!token || !user) return <Navigate to="/login" replace />

  if (user.nivel === 'view_only') {
    return allowViewOnly ? <>{children}</> : <Navigate to="/estatisticas" replace />
  }

  if (RANK[user.nivel] < RANK[minNivel]) return <Navigate to="/dashboard" replace />

  // Cargo de permissão: se a conta tem um cargo definido, exige "ver" na área
  if (area && me?.permissoes && !me.permissoes[area]?.ver) {
    return <Navigate to="/perfil" replace />
  }
  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuthStore()
  if (token) return <Navigate to={user?.nivel === 'view_only' ? '/estatisticas' : '/dashboard'} replace />
  return <>{children}</>
}

function RootRedirect() {
  const { user } = useAuthStore()
  return <Navigate to={user?.nivel === 'view_only' ? '/estatisticas' : '/dashboard'} replace />
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
            <ProtectedRoute allowViewOnly={true}><AppShell /></ProtectedRoute>
          }>
            <Route index element={<RootRedirect />} />
            <Route path="dashboard" element={
              <ProtectedRoute allowViewOnly={false} area="dashboard"><DashboardPage /></ProtectedRoute>
            } />
            <Route path="avisos" element={
              <ProtectedRoute minNivel="membro" allowViewOnly={true} area="avisos"><AvisosPage /></ProtectedRoute>
            } />
            <Route path="perfil" element={
              <ProtectedRoute minNivel="membro" allowViewOnly={true}><ProfilePage /></ProtectedRoute>
            } />
            <Route path="acoes/nova" element={
              <ProtectedRoute minNivel="membro" area="registrar_acao"><RegistrarAcaoPage /></ProtectedRoute>
            } />
            <Route path="acoes/historico" element={
              <ProtectedRoute allowViewOnly={false} area="historico"><HistoricoPage /></ProtectedRoute>
            } />
            <Route path="acoes/pendentes" element={
              <ProtectedRoute minNivel="membro" area="pendentes"><PendentesPage /></ProtectedRoute>
            } />
            <Route path="estatisticas" element={<EstatisticasPage />} />
            <Route path="ranking" element={<RankingPage />} />
            <Route path="ausencias/nova" element={
              <ProtectedRoute minNivel="membro" area="ausencias"><RegistrarAusenciaPage /></ProtectedRoute>
            } />
            <Route path="ausencias" element={
              <ProtectedRoute minNivel="membro" area="ausencias"><AusenciasPage /></ProtectedRoute>
            } />
            <Route path="promocoes" element={
              <ProtectedRoute minNivel="moderador" area="promocoes"><PromocoesPage /></ProtectedRoute>
            } />
            <Route path="anuncio" element={
              <ProtectedRoute minNivel="moderador" area="anuncio"><GerarAnuncioPage /></ProtectedRoute>
            } />
            <Route path="boletim" element={
              <ProtectedRoute minNivel="membro" area="boletim"><GerarBoletimPage /></ProtectedRoute>
            } />
            <Route path="protocolo" element={
              <ProtectedRoute minNivel="membro" allowViewOnly={true} area="protocolo"><ProtocoloPage /></ProtectedRoute>
            } />
            <Route path="carteira" element={
              <ProtectedRoute minNivel="membro" area="carteira"><GerarCarteiraPage /></ProtectedRoute>
            } />
            <Route path="cursos" element={
              <ProtectedRoute minNivel="membro"><EmBreve /></ProtectedRoute>
            } />
            <Route path="recrutamento" element={
              <ProtectedRoute minNivel="membro" area="recrutamento"><RecrutamentoPage /></ProtectedRoute>
            } />
            <Route path="recrutamento/:id" element={
              <ProtectedRoute minNivel="membro" area="recrutamento"><RecrutaCandidatoPage /></ProtectedRoute>
            } />
            <Route path="membros" element={
              <ProtectedRoute minNivel="membro" allowViewOnly={true} area="membros"><MembrosPage /></ProtectedRoute>
            } />
            <Route path="configuracoes" element={
              <ProtectedRoute minNivel="moderador" area="configuracoes"><ConfiguracoesPage /></ProtectedRoute>
            } />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
