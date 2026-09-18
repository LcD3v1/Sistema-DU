import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/lib/axios'
import { queryClient } from '@/lib/queryClient'

export interface Livro {
  id: number
  titulo: string
  autor: string
  descricao: string
  categoria: string
  url: string
  capa: string
  cor: string
  criadoEm: string
}

export type LivroInput = Omit<Livro, 'id' | 'criadoEm'>

export function useLivros() {
  return useQuery<Livro[]>({
    queryKey: ['livros'],
    queryFn: async () => (await api.get<Livro[]>('/cursos/livros')).data,
  })
}

const invalidar = () => queryClient.invalidateQueries({ queryKey: ['livros'] })

export function useCriarLivro() {
  return useMutation({ mutationFn: (body: LivroInput) => api.post<Livro>('/cursos/livros', body), onSuccess: invalidar })
}

export function useAtualizarLivro() {
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<LivroInput>) => api.put<Livro>(`/cursos/livros/${id}`, body),
    onSuccess: invalidar,
  })
}

export function useRemoverLivro() {
  return useMutation({ mutationFn: (id: number) => api.delete(`/cursos/livros/${id}`), onSuccess: invalidar })
}
