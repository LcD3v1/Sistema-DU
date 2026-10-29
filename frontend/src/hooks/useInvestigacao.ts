import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/lib/axios'

/**
 * Módulos investigativos da DU: Relatórios, Boletins, Arquivo de Inquéritos e Galeria,
 * mais o envio/abertura de arquivos (routes/arquivos.ts no backend).
 * Toda mutation bem-sucedida já invalida as consultas (queryClient → MutationCache).
 */

export interface ArquivoRef { id: string; nome: string; mime: string; tamanho: number }
export interface LinkRegistro { rotulo: string; url: string }
export interface AlteracaoRegistro { em: string; por: string; acao: 'criado' | 'editado' | 'status'; detalhe?: string }

interface RegistroBase {
  id: number
  numero: string
  titulo: string
  investigadores: number[]
  links: LinkRegistro[]
  arquivos: ArquivoRef[]
  autorNome: string
  criadoEm: string
  atualizadoEm?: string
  historico: AlteracaoRegistro[]
}

export interface Relatorio extends RegistroBase {
  tipo: string
  data: string
  conteudo: string
  sigiloso: boolean
  inqueritoId: number | null
  boletimId: number | null
  podeEditar: boolean
}

export type StatusBoletim = 'aberto' | 'em_investigacao' | 'concluido' | 'arquivado'
export interface Boletim extends RegistroBase {
  status: StatusBoletim
  data: string
  local: string
  descricao: string
  observacoes: string
  imagens: string[]
  inqueritoId: number | null
}

export type StatusInquerito = 'em_andamento' | 'concluido' | 'arquivado'
export interface Inquerito extends RegistroBase {
  status: StatusInquerito
  categoria: string
  descricao: string
  envolvidos: string
  capa: string
  cor: string
}

export interface FotoGaleria {
  id: number
  imagem: string
  arquivo: ArquivoRef | null
  titulo: string
  descricao: string
  categoria: string
  data: string
  autorNome: string
  criadoEm: string
  podeEditar: boolean
}

/** Corpo enviado: arquivos vão só pelos IDs (o backend confere e completa). */
type Corpo<T> = Omit<T, 'id' | 'arquivos' | 'autorNome' | 'criadoEm' | 'atualizadoEm' | 'historico' | 'podeEditar'> & { arquivos: string[] }
export type RelatorioInput = Omit<Corpo<Relatorio>, 'numero'>
export type BoletimInput = Corpo<Boletim>
export type InqueritoInput = Corpo<Inquerito>
export type FotoInput = Omit<FotoGaleria, 'id' | 'arquivo' | 'autorNome' | 'criadoEm' | 'podeEditar'> & { arquivo: string }

export const STATUS_BOLETIM: Record<StatusBoletim, { rotulo: string; cor: string }> = {
  aberto:          { rotulo: 'Aberto',          cor: '#a78bfa' },
  em_investigacao: { rotulo: 'Em investigação', cor: '#f5c451' },
  concluido:       { rotulo: 'Concluído',       cor: '#2ecc71' },
  arquivado:       { rotulo: 'Arquivado',       cor: '#9a90ad' },
}
export const STATUS_INQUERITO: Record<StatusInquerito, { rotulo: string; cor: string }> = {
  em_andamento: { rotulo: 'Em andamento', cor: '#f5c451' },
  concluido:    { rotulo: 'Concluído',    cor: '#2ecc71' },
  arquivado:    { rotulo: 'Arquivado',    cor: '#9a90ad' },
}

function crud<T extends { id: number }, I>(chave: string, caminho: string) {
  return {
    useLista: (enabled = true) => useQuery<T[]>({
      queryKey: [chave],
      queryFn: async () => (await api.get<T[]>(caminho)).data,
      enabled,
    }),
    useSalvar: () => useMutation({
      mutationFn: ({ id, ...body }: I & { id?: number }) =>
        id ? api.put<T>(`${caminho}/${id}`, body).then(r => r.data) : api.post<T>(caminho, body).then(r => r.data),
    }),
    useRemover: () => useMutation({ mutationFn: (id: number) => api.delete(`${caminho}/${id}`) }),
  }
}

export const relatoriosApi = crud<Relatorio, RelatorioInput>('relatorios', '/relatorios')
export const boletinsApi = crud<Boletim, BoletimInput>('boletins', '/boletins')
export const inqueritosApi = crud<Inquerito, InqueritoInput>('inqueritos', '/inqueritos')
export const galeriaApi = crud<FotoGaleria, FotoInput>('galeria', '/galeria')

// ── Arquivos ────────────────────────────────────────────────────────────────
export type AreaArquivo = 'inqueritos' | 'boletins' | 'relatorios' | 'cursos' | 'galeria' | 'arvore'
export const MAX_BYTES_ARQUIVO = 10 * 1024 * 1024
export const ACEITA_ARQUIVOS = '.pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.txt,.csv,.zip,.mp3,.mp4'
export const ACEITA_IMAGENS = '.png,.jpg,.jpeg,.gif,.webp'

export async function enviarArquivo(arquivo: File, area: AreaArquivo): Promise<ArquivoRef> {
  const { data } = await api.post<ArquivoRef>('/arquivos', arquivo, {
    params: { area, nome: arquivo.name },
    headers: { 'Content-Type': 'application/octet-stream' },
    timeout: 120_000,
  })
  return data
}

/** Baixa um arquivo autenticado (o token fica só em memória, então não dá para usar <a href>). */
export async function baixarArquivo(ref: ArquivoRef): Promise<void> {
  const { data } = await api.get<Blob>(`/arquivos/${ref.id}`, { responseType: 'blob' })
  const url = URL.createObjectURL(data)
  const a = document.createElement('a')
  a.href = url
  a.download = ref.nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** Abre PDF/imagem em outra aba (via blob; o resto baixa). */
export async function abrirArquivo(ref: ArquivoRef): Promise<void> {
  if (!/^(application\/pdf|image\/)/.test(ref.mime)) return baixarArquivo(ref)
  const aba = window.open('', '_blank')
  const { data } = await api.get<Blob>(`/arquivos/${ref.id}`, { responseType: 'blob' })
  const url = URL.createObjectURL(new Blob([data], { type: ref.mime }))
  if (aba) aba.location.href = url; else window.location.href = url
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000)
}

/** URL local (blob:) de uma imagem enviada, para usar em <img>. Cacheada pelo React Query. */
export function useUrlArquivo(ref: ArquivoRef | null | undefined) {
  return useQuery<string>({
    queryKey: ['arquivo-url', ref?.id],
    queryFn: async () => {
      const { data } = await api.get<Blob>(`/arquivos/${ref!.id}`, { responseType: 'blob' })
      return URL.createObjectURL(data)
    },
    enabled: Boolean(ref?.id),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  })
}

export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export const erroApi = (e: unknown, padrao = 'Erro ao salvar.') => {
  const d = (e as { response?: { data?: { error?: string; details?: string[] } } })?.response?.data
  return d?.details?.[0]?.replace(/^[\w.]+: /, '') ?? d?.error ?? padrao
}

export const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

export const hojeISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const dataBR = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return a && m && d ? `${d}/${m}/${a}` : iso
}
