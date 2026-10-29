import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/lib/axios'
import { queryClient } from '@/lib/queryClient'

/** As 2 fotos salvas do Gerar anúncio (caminho "/img/<id>.<ext>" ou null), guardadas na conta. */
export type FotosSalvas = (string | null)[]

export function useAnuncioSalvas() {
  return useQuery<FotosSalvas>({
    queryKey: ['anuncio', 'salvas'],
    queryFn: async () => (await api.get<{ imagens: FotosSalvas }>('/anuncio/salvas')).data.imagens,
  })
}

export function useSalvarAnuncioSalvas() {
  return useMutation({
    mutationFn: async (imagens: FotosSalvas) => (await api.put<{ imagens: FotosSalvas }>('/anuncio/salvas', { imagens })).data.imagens,
    onSuccess: imagens => queryClient.setQueryData(['anuncio', 'salvas'], imagens),
  })
}

/** Link completo (para colar no jogo) a partir do caminho salvo. */
export const linkDaFoto = (caminho: string) => `${window.location.origin}${caminho}`
