import { QueryClient, MutationCache } from '@tanstack/react-query'

// REGRA: qualquer alteração salva atualiza imediatamente todos os módulos da tela.
export const queryClient: QueryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: () => { void queryClient.invalidateQueries() },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
