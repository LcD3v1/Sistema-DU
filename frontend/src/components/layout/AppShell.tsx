import { Outlet } from 'react-router-dom'
import LimiteErro from '@/components/ui/LimiteErro'
import { useLocation } from 'react-router-dom'
import { Suspense, useEffect, useState } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import ToastContainer from '@/components/ui/ToastNotification'
import DialogoCentral from '@/components/ui/DialogoCentral'
import LoadingHud from '@/components/ui/LoadingHud'
import { paginaLazy } from '@/lib/rotas'
import NivelObrigatorio from '@/components/ui/NivelObrigatorio'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/authStore'
import { useMe } from '@/hooks/useMe'

const OnboardingPage = paginaLazy('/onboarding')

export default function AppShell() {
  const location = useLocation()
  // Menu lateral em gaveta (celular/tablet); no desktop fica sempre visível
  const [menuAberto, setMenuAberto] = useState(false)
  const token = useAuthStore(s => s.token)
  const { data: me, isLoading: meLoading } = useMe()

  useEffect(() => {
    if (!token) return
    // Só com a aba visível: aba em segundo plano não precisa checar a sessão
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') api.get('/auth/me').catch(() => {})
    }, 10_000)
    return () => clearInterval(id)
  }, [token])

  // Primeiro acesso: conta aprovada ainda sem perfil → força cadastro
  if (!meLoading && me && me.onboarded === false) {
    return <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-bg"><LoadingHud /></div>}><OnboardingPage /></Suspense>
  }

  return (
    <div className="flex altura-tela bg-bg overflow-hidden">
      <Sidebar aberto={menuAberto} onFechar={() => setMenuAberto(false)} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar onAbrirMenu={() => setMenuAberto(true)} />
        {me && !me.admin && !me.cargoPermId && (
          <div className="px-3 sm:px-6 py-2 bg-gold/10 border-b border-gold/30 text-xs font-mono text-gold3">
            Seu cadastro está aguardando aprovação do comando. Você terá acesso assim que um cargo for atribuído.
          </div>
        )}

        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {/* A rota e seu fallback precisam ficar visíveis mesmo se uma transição
              for interrompida por navegação rápida ou carregamento sob demanda. */}
          <div key={location.pathname} className="h-full">
              <LimiteErro>
                <Suspense fallback={<div className="flex items-center justify-center py-24"><LoadingHud message="CARREGANDO MÓDULO..." /></div>}>
                  <Outlet />
                </Suspense>
              </LimiteErro>
          </div>
        </main>
      </div>

      <ToastContainer />
      {me && me.membroId && me.nivelMembro === null && <NivelObrigatorio />}
      <DialogoCentral />
    </div>
  )
}
