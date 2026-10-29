import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/lib/axios'
import { queryClient } from '@/lib/queryClient'
import { enviarArquivo, type ArquivoRef } from '@/hooks/useInvestigacao'
import { arquivoDeFoto, arquivoDoLink } from '@/lib/imagemArquivo'

export type Lado = 'cima' | 'direita' | 'baixo' | 'esquerda'
export type FotoArvore = { arquivo: ArquivoRef } | { url: string }
/** Como a foto vai para a API: id do arquivo enviado ou link. */
export type FotoEntrada = { arquivo: string } | { url: string }

export interface NoArvore {
  id: number; x: number; y: number
  nome: string; apelido: string; telefone: string; funcao: string; faccao: string
  endereco: string; veiculo: string; observacoes: string; status: string
  foto: FotoArvore | null; fotos: FotoArvore[]; atualizadoEm: string
}
/** Cada ponta: card + lado OU ponto (t de 0 a 1) de outra linha. */
export interface LigacaoArvore {
  id: number
  de: number | null; deLado: Lado | null; deLig: number | null; deT: number | null
  para: number | null; paraLado: Lado | null; paraLig: number | null; paraT: number | null
  cor: string; rotulo: string; curva: { dx: number; dy: number } | null
}
export interface Participante { id: number; nome: string; voce: boolean }
/** Anexo do chat: foto/vídeo enviado, imagem por link ou link de vídeo. */
export type AnexoArvore = FotoArvore | { video: string }
export interface MensagemArvore { id: number; autor: string; texto: string; em: string; anexo: AnexoArvore | null; minha: boolean }
export interface ResumoArvore {
  id: number; nome: string; descricao: string
  inquerito: { id: number; numero: string | null; titulo: string | null } | null
  totalNos: number; totalLigacoes: number; versao: number
  privada: boolean; participantes: Participante[]; podeGerenciar: boolean
  criadoPor: string; criadoEm: string; atualizadoPor: string; atualizadoEm: string
}
export interface ArvoreCompleta extends ResumoArvore {
  podeEditar: boolean; nos: NoArvore[]; ligacoes: LigacaoArvore[]; mensagens: MensagemArvore[]
}
export type DadosNo = Omit<NoArvore, 'id' | 'foto' | 'fotos' | 'atualizadoEm'>

export const paraEntrada = (f: FotoArvore): FotoEntrada => ('arquivo' in f ? { arquivo: f.arquivo.id } : { url: f.url })
const chave = (id: number) => ['arvores', id] as const

export function useArvores() {
  return useQuery<ResumoArvore[]>({ queryKey: ['arvores'], queryFn: async () => (await api.get('/arvores')).data })
}

/** Pessoas que podem trabalhar numa árvore (só nomes). */
export function usePessoasArvore(ativo: boolean) {
  return useQuery<(Participante & { admin: boolean })[]>({
    queryKey: ['arvores', 'pessoas'], queryFn: async () => (await api.get('/arvores/pessoas')).data, enabled: ativo, staleTime: 60_000,
  })
}

export function useInqueritosArvore(ativo: boolean) {
  return useQuery<{ id: number; numero: string; titulo: string }[]>({
    queryKey: ['arvores', 'inqueritos'], queryFn: async () => (await api.get('/arvores/inqueritos')).data, enabled: ativo, staleTime: 60_000,
  })
}

/**
 * Quadro aberto: pergunta a cada 4 s se a versão mudou (outra pessoa mexeu) e só então baixa tudo.
 * `pausar` = enquanto alguém arrasta aqui, não sobrescreve o que está na tela.
 */
export function useArvore(id: number, pausar: boolean) {
  return useQuery<ArvoreCompleta>({
    queryKey: chave(id),
    queryFn: async () => {
      const atual = queryClient.getQueryData<ArvoreCompleta>(chave(id))
      const { data } = await api.get<ArvoreCompleta | { versao: number; igual: true }>(`/arvores/${id}`, { params: atual ? { versao: atual.versao } : {} })
      return 'igual' in data && atual ? atual : data as ArvoreCompleta
    },
    refetchInterval: pausar ? false : 4000,
    refetchIntervalInBackground: false,
  })
}

/** Junta a resposta de uma mudança no cache (sem esperar a próxima consulta). */
function aplicar(id: number, fn: (a: ArvoreCompleta) => ArvoreCompleta) {
  queryClient.setQueryData<ArvoreCompleta>(chave(id), a => (a ? fn(a) : a))
}

export function useSalvarArvore() {
  return useMutation({
    mutationFn: async ({ id, ...body }: { id?: number; nome: string; descricao: string; inqueritoId: number | null; participantes?: number[] }) =>
      (id ? await api.put<ArvoreCompleta>(`/arvores/${id}`, body) : await api.post<ArvoreCompleta>('/arvores', body)).data,
    onSuccess: a => { queryClient.setQueryData(chave(a.id), a); void queryClient.invalidateQueries({ queryKey: ['arvores'], exact: true }) },
  })
}

export function useApagarArvore() {
  return useMutation({
    mutationFn: async (id: number) => (await api.delete(`/arvores/${id}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['arvores'], exact: true }),
  })
}

export function useCriarNo(arvoreId: number) {
  return useMutation({
    mutationFn: async (body: DadosNo & { foto: FotoEntrada | null; fotos: FotoEntrada[] }) =>
      (await api.post<{ no: NoArvore; versao: number }>(`/arvores/${arvoreId}/nos`, body)).data,
    onSuccess: r => aplicar(arvoreId, a => ({ ...a, versao: r.versao, nos: [...a.nos, r.no] })),
  })
}

export function useAtualizarNo(arvoreId: number) {
  return useMutation({
    mutationFn: async ({ id, ...body }: Partial<DadosNo> & { id: number; foto?: FotoEntrada | null; fotos?: FotoEntrada[] }) =>
      (await api.patch<{ no: NoArvore; versao: number }>(`/arvores/${arvoreId}/nos/${id}`, body)).data,
    onSuccess: r => aplicar(arvoreId, a => ({ ...a, versao: r.versao, nos: a.nos.map(n => (n.id === r.no.id ? r.no : n)) })),
  })
}

export function useRemoverNo(arvoreId: number) {
  return useMutation({
    mutationFn: async (id: number) => ({ id, ...(await api.delete<{ versao: number }>(`/arvores/${arvoreId}/nos/${id}`)).data }),
    onSuccess: r => aplicar(arvoreId, a => ({ ...a, versao: r.versao, nos: a.nos.filter(n => n.id !== r.id), ligacoes: a.ligacoes.filter(l => l.de !== r.id && l.para !== r.id) })),
  })
}

export function useCriarLigacao(arvoreId: number) {
  return useMutation({
    mutationFn: async (body: Partial<Omit<LigacaoArvore, 'id' | 'curva'>> & { cor: string }) =>
      (await api.post<{ ligacao: LigacaoArvore; versao: number }>(`/arvores/${arvoreId}/ligacoes`, body)).data,
    onSuccess: r => aplicar(arvoreId, a => ({ ...a, versao: r.versao, ligacoes: [...a.ligacoes, r.ligacao] })),
  })
}

export function useAtualizarLigacao(arvoreId: number) {
  return useMutation({
    mutationFn: async ({ id, ...body }: Partial<Omit<LigacaoArvore, 'id' | 'de' | 'para'>> & { id: number }) =>
      (await api.patch<{ ligacao: LigacaoArvore; versao: number }>(`/arvores/${arvoreId}/ligacoes/${id}`, body)).data,
    onSuccess: r => aplicar(arvoreId, a => ({ ...a, versao: r.versao, ligacoes: a.ligacoes.map(l => (l.id === r.ligacao.id ? r.ligacao : l)) })),
  })
}

export function useRemoverLigacao(arvoreId: number) {
  return useMutation({
    mutationFn: async (id: number) => ({ id, ...(await api.delete<{ versao: number }>(`/arvores/${arvoreId}/ligacoes/${id}`)).data }),
    onSuccess: r => aplicar(arvoreId, a => ({ ...a, versao: r.versao, ligacoes: a.ligacoes.filter(l => l.id !== r.id) })),
  })
}

export function useEnviarMensagem(arvoreId: number) {
  return useMutation({
    mutationFn: async ({ texto, anexo }: { texto: string; anexo: AnexoArvore | null }) =>
      (await api.post<ArvoreCompleta>(`/arvores/${arvoreId}/mensagens`, { texto, anexo: anexo ? ('video' in anexo ? { video: anexo.video } : paraEntrada(anexo)) : null })).data,
    onSuccess: a => queryClient.setQueryData(chave(arvoreId), a),
  })
}

/** Link de imagem: o NAVEGADOR copia a imagem e ela sobe como arquivo da área "arvore" (fica guardada com a árvore). */
export async function copiarFotoDoLink(url: string): Promise<{ arquivo: ArquivoRef }> {
  return { arquivo: await enviarArquivo(await arquivoDoLink(url), 'arvore') }
}

export const MAX_BYTES_VIDEO = 50 * 1024 * 1024
export const ACEITA_VIDEO = 'video/mp4,video/quicktime,.mp4,.mov'
export class ErroVideo extends Error {}

/** Duração do vídeo lida pelo navegador (aviso rápido; o servidor confere de novo pelos bytes). */
function duracaoNoNavegador(arquivo: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo)
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration) }
    v.onerror = () => { URL.revokeObjectURL(url); reject(new ErroVideo('Não foi possível ler esse vídeo. Envie em MP4.')) }
    v.src = url
  })
}

/** Vídeo do computador (MP4/MOV, até 1 minuto e 50 MB) → arquivo da área "arvore". */
export async function enviarVideoArvore(arquivo: File): Promise<{ arquivo: ArquivoRef }> {
  const ext = /\.(mp4|mov)$/i.exec(arquivo.name)?.[1]?.toLowerCase() ?? (arquivo.type === 'video/quicktime' ? 'mov' : arquivo.type === 'video/mp4' ? 'mp4' : '')
  if (!ext) throw new ErroVideo('Envie o vídeo em MP4 ou MOV.')
  if (arquivo.size > MAX_BYTES_VIDEO) throw new ErroVideo('Vídeo grande demais (máx 50 MB).')
  const segundos = await duracaoNoNavegador(arquivo).catch(() => 0)   // se o navegador não ler, o servidor decide
  if (segundos > 60.5) throw new ErroVideo(`O vídeo tem ${Math.round(segundos)} s: o máximo é 1 minuto.`)
  const nome = /\.(mp4|mov)$/i.test(arquivo.name) ? arquivo.name : `video.${ext}`
  return { arquivo: await enviarArquivo(new File([arquivo], nome, { type: arquivo.type }), 'arvore') }
}

/** Qualquer imagem/PDF vira WEBP no navegador e sobe como arquivo da área "arvore". */
export async function enviarFotoArvore(arquivo: File): Promise<{ arquivo: ArquivoRef }> {
  const foto = await arquivoDeFoto(arquivo, { maxLado: 1600, formato: 'image/webp', qualidade: 0.88 })
  return { arquivo: await enviarArquivo(foto, 'arvore') }
}
