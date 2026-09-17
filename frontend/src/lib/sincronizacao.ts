import { useEffect } from 'react'
import axios from 'axios'
import { queryClient } from '@/lib/queryClient'

/**
 * REGRA: alteração aprovada aparece NA HORA em todos os módulos.
 * O backend incrementa uma "revisão" a cada gravação; quando muda, todas as
 * consultas da tela são recarregadas (nível, patente, avatar, ranking, membros…).
 *
 * Custo baixo: pausa com a aba oculta ou sem rede, nunca sobrepõe requisições e,
 * quando a gravação foi feita por ESTA aba (mutation), só registra a nova revisão —
 * o queryClient já invalidou tudo, evitando recarregar duas vezes.
 */
const INTERVALO_MS = 4_000
const base = (import.meta.env.VITE_API_URL || '') + '/api'

export function useSincronizacaoTempoReal(): void {
  useEffect(() => {
    let ativo = true
    let ultima: number | null = null
    let emAndamento = false

    async function verificar(propria = false) {
      if (document.visibilityState !== 'visible' || navigator.onLine === false) return
      if (emAndamento && !propria) return
      emAndamento = true
      try {
        const { data } = await axios.get<{ revisao: number }>(`${base}/public/revisao`, { timeout: 5_000 })
        if (!ativo) return
        if (!propria && ultima !== null && data.revisao !== ultima) {
          void queryClient.invalidateQueries()
        }
        ultima = data.revisao
      } catch { /* sem conexão: tenta de novo no próximo ciclo */ } finally { emAndamento = false }
    }

    void verificar()
    const id = setInterval(() => { void verificar() }, INTERVALO_MS)
    const aoVoltar = () => { if (document.visibilityState === 'visible') void verificar() }
    document.addEventListener('visibilitychange', aoVoltar)
    window.addEventListener('online', aoVoltar)
    // Gravação desta aba: o MutationCache já invalidou tudo → só sincroniza a revisão
    const cancelarMutacoes = queryClient.getMutationCache().subscribe(evento => {
      if (evento.type === 'updated' && evento.action.type === 'success') void verificar(true)
    })
    return () => {
      ativo = false
      clearInterval(id)
      document.removeEventListener('visibilitychange', aoVoltar)
      window.removeEventListener('online', aoVoltar)
      cancelarMutacoes()
    }
  }, [])
}
