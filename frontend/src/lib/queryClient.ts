import { QueryClient, MutationCache, type Query } from '@tanstack/react-query'

/**
 * Consultas de conteúdo FIXO pelo ID (arquivo enviado, foto dos Logs): nunca mudam, então ficam
 * fora da recarga geral. Sem isso, cada gravação de qualquer pessoa baixava de novo todas as
 * fotos/arquivos da tela (e o limite de requisições do IP estourava com muita gente usando).
 */
const ehConteudoFixo = (q: Query) => q.queryKey[0] === 'arquivo-url' || (q.queryKey[0] === 'logs' && q.queryKey[1] === 'avatar')

/** Recarrega tudo o que pode ter mudado (menos o conteúdo fixo). */
export function invalidarTudo(): Promise<void> {
  return queryClient.invalidateQueries({ predicate: q => !ehConteudoFixo(q) })
}

// REGRA: qualquer alteração salva atualiza imediatamente todos os módulos da tela.
export const queryClient: QueryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: () => { void invalidarTudo() },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// Foto/arquivo guardado como blob: URL: libera a memória quando a consulta sai do cache
queryClient.getQueryCache().subscribe(evento => {
  const dado = evento.type === 'removed' ? evento.query.state.data : undefined
  if (typeof dado === 'string' && dado.startsWith('blob:')) URL.revokeObjectURL(dado)
})
