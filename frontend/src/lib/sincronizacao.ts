import { useEffect } from 'react'
import axios from 'axios'
import { queryClient, invalidarTudo } from '@/lib/queryClient'

/**
 * REGRA: alteração aprovada aparece NA HORA em todos os módulos.
 * O backend incrementa uma "revisão" a cada gravação; quando muda, todas as
 * consultas da tela são recarregadas (nível, patente, avatar, ranking, membros…).
 *
 * Custo baixo: pausa com a aba oculta ou sem rede, nunca sobrepõe requisições e,
 * quando a gravação foi feita por ESTA aba (mutation), só registra a nova revisão —
 * o queryClient já invalidou tudo, evitando recarregar duas vezes.
 *
 * Muita gente ao mesmo tempo: uma gravação de qualquer pessoa faria TODAS as abas recarregarem
 * no mesmo segundo. Por isso a recarga por mudança de outra pessoa é espalhada (0,25–2 s aleatórios)
 * e juntada (no máximo uma a cada 8 s por aba, mesmo com muitas gravações seguidas).
 */
const INTERVALO_MS = 4_000
const MIN_ENTRE_RECARGAS_MS = 8_000
const base = (import.meta.env.VITE_API_URL || '') + '/api'

export function useSincronizacaoTempoReal(): void {
  useEffect(() => {
    let ativo = true
    let ultima: number | null = null
    let emAndamento = false
    let agendada: number | undefined
    let ultimaRecarga = 0

    function agendarRecarga() {
      if (agendada !== undefined) return   // já vai recarregar: junta com esta mudança
      const espera = Math.max(0, ultimaRecarga + MIN_ENTRE_RECARGAS_MS - Date.now()) + 250 + Math.random() * 1_750
      agendada = window.setTimeout(() => {
        agendada = undefined
        if (!ativo) return
        ultimaRecarga = Date.now()
        void invalidarTudo()
      }, espera)
    }

    async function verificar(propria = false) {
      if (document.visibilityState !== 'visible' || navigator.onLine === false) return
      if (emAndamento && !propria) return
      emAndamento = true
      try {
        const { data } = await axios.get<{ revisao: number }>(`${base}/public/revisao`, { timeout: 5_000 })
        if (!ativo) return
        if (!propria && ultima !== null && data.revisao !== ultima) agendarRecarga()
        if (propria) ultimaRecarga = Date.now()   // a mutation desta aba já recarregou tudo
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
      if (agendada !== undefined) clearTimeout(agendada)
      document.removeEventListener('visibilitychange', aoVoltar)
      window.removeEventListener('online', aoVoltar)
      cancelarMutacoes()
    }
  }, [])
}
