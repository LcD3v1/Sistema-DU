import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { useSincronizacaoTempoReal } from '@/lib/sincronizacao'
import { useAuthStore } from '@/store/authStore'
import { useMe } from '@/hooks/useMe'
import type { AreaId } from '@/lib/permAreas'
import { Suspense } from 'react'
import { MotionConfig } from 'framer-motion'
import AppShell from '@/components/layout/AppShell'
import DiscordCallback from '@/components/sections/DiscordCallback'
import LoadingHud from '@/components/ui/LoadingHud'
import { paginaLazy } from '@/lib/rotas'
import FaixaAmbiente from '@/components/ui/FaixaAmbiente'
import LimiteErro from '@/components/ui/LimiteErro'
import TermoAceite from '@/components/ui/TermoAceite'

// Páginas sob demanda: cada rota baixa só o próprio código (recharts, jspdf, dnd-kit…)
const LoginPage = paginaLazy('/login')
const PerfilPublicoPage = paginaLazy('/perfil-publico')
const TermosPage = paginaLazy('/termos')
const DashboardPage = paginaLazy('/dashboard')
const RelatoriosPage = paginaLazy('/relatorios')
const BoletinsPage = paginaLazy('/boletins')
const InqueritosPage = paginaLazy('/inqueritos')
const GaleriaPage = paginaLazy('/galeria')
const AvisosPage = paginaLazy('/avisos')
const ProfilePage = paginaLazy('/perfil')
const RegistrarAusenciaPage = paginaLazy('/ausencias/nova')
const AusenciasPage = paginaLazy('/ausencias')
const FardamentoPage = paginaLazy('/fardamento')
const GerarAnuncioPage = paginaLazy('/anuncio')
const ProtocoloPage = paginaLazy('/protocolo')
const GerarCarteiraPage = paginaLazy('/carteira')
const EnviarMensagemPage = paginaLazy('/mensagens')
const CursosPage = paginaLazy('/cursos')
const RecrutamentoPage = paginaLazy('/recrutamento')
const RecrutaCandidatoPage = paginaLazy('/recrutamento/:id')
const MembrosPage = paginaLazy('/membros')
const ConfiguracoesPage = paginaLazy('/configuracoes')

// Recarregou a página: tenta recuperar a sessão pelo cookie httpOnly (uma vez)
void useAuthStore.getState().restaurarSessao()

function TelaCarregando() {
  return <div className="min-h-screen w-full flex items-center justify-center bg-bg"><LoadingHud /></div>
}

interface ProtectedRouteProps {
  children: React.ReactNode
  area?: AreaId
  adminOnly?: boolean
}

function ProtectedRoute({ children, area, adminOnly = false }: ProtectedRouteProps) {
  const { token, user, restaurando } = useAuthStore()
  const { data: me } = useMe()
  if (!token && restaurando) return <TelaCarregando />
  if (!token || !user) return <Navigate to="/login" replace />

  // Enquanto o /me carrega, renderiza (evita piscar). Quando carregado, aplica o cargo.
  if (me) {
    if (adminOnly && !me.admin) return <Navigate to="/perfil" replace />
    if (area && !me.admin && !me.permissoes?.[area]?.ver) return <Navigate to="/perfil" replace />
  }
  return <>{children}</>
}

function SincronizacaoTempoReal() {
  useSincronizacaoTempoReal()
  return null
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { token, restaurando } = useAuthStore()
  if (!token && restaurando) return <TelaCarregando />
  if (token) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function RootRedirect() {
  return <Navigate to="/dashboard" replace />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Respeita "reduzir movimento" do sistema: efeitos de transform viram só fade */}
      <MotionConfig reducedMotion="user">
      <FaixaAmbiente />
      <SincronizacaoTempoReal />
      <BrowserRouter>
        <TermoAceite />
        <LimiteErro telaCheia>
        <Suspense fallback={<TelaCarregando />}>
        <Routes>
          <Route path="/login" element={
            <PublicRoute><LoginPage /></PublicRoute>
          } />
          <Route path="/auth/discord" element={<DiscordCallback />} />
          <Route path="/perfil/:slug" element={<PerfilPublicoPage />} />
          <Route path="/termos" element={<TermosPage />} />
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
            <Route path="relatorios" element={
              <ProtectedRoute key="lista" area="relatorios"><RelatoriosPage /></ProtectedRoute>
            } />
            <Route path="relatorios/novo" element={
              <ProtectedRoute key="novo" area="relatorios"><RelatoriosPage /></ProtectedRoute>
            } />
            <Route path="boletins" element={
              <ProtectedRoute area="boletins"><BoletinsPage /></ProtectedRoute>
            } />
            <Route path="inqueritos" element={
              <ProtectedRoute area="inqueritos"><InqueritosPage /></ProtectedRoute>
            } />
            <Route path="galeria" element={
              <ProtectedRoute area="galeria"><GaleriaPage /></ProtectedRoute>
            } />
            <Route path="ausencias/nova" element={
              <ProtectedRoute area="ausencias"><RegistrarAusenciaPage /></ProtectedRoute>
            } />
            <Route path="ausencias" element={
              <ProtectedRoute area="ausencias"><AusenciasPage /></ProtectedRoute>
            } />
            <Route path="fardamento" element={
              <ProtectedRoute area="fardamento"><FardamentoPage /></ProtectedRoute>
            } />
            <Route path="anuncio" element={
              <ProtectedRoute area="anuncio"><GerarAnuncioPage /></ProtectedRoute>
            } />
            <Route path="protocolo" element={
              <ProtectedRoute area="protocolo"><ProtocoloPage /></ProtectedRoute>
            } />
            <Route path="carteira" element={
              <ProtectedRoute area="carteira"><GerarCarteiraPage /></ProtectedRoute>
            } />
            <Route path="mensagens" element={
              <ProtectedRoute area="mensagens"><EnviarMensagemPage /></ProtectedRoute>
            } />
            <Route path="cursos" element={
              <ProtectedRoute area="cursos"><CursosPage /></ProtectedRoute>
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
        </Suspense>
        </LimiteErro>
      </BrowserRouter>
      </MotionConfig>
    </QueryClientProvider>
  )
}
