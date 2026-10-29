import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/lib/axios'

/**
 * Registro de Investigação (routes/investigacoes.ts no backend).
 * Privado: a lista só traz os pedidos que a pessoa registrou ou em que participa
 * (todos = acesso total ou gestão/ver). Toda mutation já invalida as consultas (queryClient).
 */

export type MotivoInvestigacao = 'investigacao' | 'coleta_info' | 'info' | 'outro'
export type LocalInvestigacao = 'capital' | 'detroit' | 'ambas'
export type AprovacaoInvestigacao = 'pendente' | 'autorizada' | 'negada'
export type AndamentoInvestigacao = 'aguardando' | 'em_andamento' | 'pausada' | 'concluida' | 'cancelada'

export interface ParticipanteInvestigacao { id: number; codinome: string; passaporte: string }
export interface MudancaAndamento { em: string; por: string; de: AndamentoInvestigacao; para: AndamentoInvestigacao; nota: string | null }

export interface RegistroInvestigacao {
  id: number
  nome: string
  data: string
  hora: string | null                // HH:MM (pedidos antigos: null)
  participantes: ParticipanteInvestigacao[]
  motivo: MotivoInvestigacao
  detalhes: string
  local: LocalInvestigacao
  aprovacao: AprovacaoInvestigacao
  andamento: AndamentoInvestigacao
  autorNome: string
  criadoEm: string
  decididoPor: string | null
  decididoEm: string | null
  observacao: string | null
  historico: MudancaAndamento[]
  arvoreId: number | null            // árvore de investigação (só para quem está nela)
  souResponsavel: boolean
  podeAtualizar: boolean
}

export interface RegistroInvestigacaoInput {
  nome: string
  data: string
  hora: string
  participantes: number[]
  motivo: MotivoInvestigacao
  detalhes: string
  local: LocalInvestigacao
}

export const MOTIVO_INVESTIGACAO: Record<MotivoInvestigacao, string> = {
  investigacao: 'Investigação', coleta_info: 'Coleta de info', info: 'Info', outro: 'Outro',
}
export const LOCAL_INVESTIGACAO: Record<LocalInvestigacao, string> = {
  capital: 'Capital', detroit: 'Detroit', ambas: 'Capital e Detroit',
}
export const APROVACAO_INVESTIGACAO: Record<AprovacaoInvestigacao, { rotulo: string; cor: string }> = {
  pendente:   { rotulo: 'Aguardando aprovação', cor: '#f5c451' },
  autorizada: { rotulo: 'Autorizada',           cor: '#2ecc71' },
  negada:     { rotulo: 'Negada',               cor: '#e74c3c' },
}
export const ANDAMENTO_INVESTIGACAO: Record<AndamentoInvestigacao, { rotulo: string; cor: string }> = {
  aguardando:   { rotulo: 'Aguardando início', cor: '#9a90ad' },
  em_andamento: { rotulo: 'Em andamento',      cor: '#a78bfa' },
  pausada:      { rotulo: 'Pausada',           cor: '#f39c12' },
  concluida:    { rotulo: 'Concluída',         cor: '#2ecc71' },
  cancelada:    { rotulo: 'Cancelada',         cor: '#e74c3c' },
}

export function useRegistrosInvestigacao() {
  return useQuery<RegistroInvestigacao[]>({
    queryKey: ['investigacoes'],
    queryFn: async () => (await api.get<RegistroInvestigacao[]>('/investigacoes')).data,
  })
}

export function useRegistrarInvestigacao() {
  return useMutation({
    mutationFn: (body: RegistroInvestigacaoInput) => api.post<RegistroInvestigacao>('/investigacoes', body).then(r => r.data),
  })
}

export function useAprovacaoInvestigacao() {
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; aprovacao: 'autorizada' | 'negada'; observacao?: string }) =>
      api.put<RegistroInvestigacao>(`/investigacoes/${id}/aprovacao`, body).then(r => r.data),
  })
}

export function useAndamentoInvestigacao() {
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; andamento: AndamentoInvestigacao; nota?: string }) =>
      api.put<RegistroInvestigacao>(`/investigacoes/${id}/andamento`, body).then(r => r.data),
  })
}

export function useExcluirInvestigacao() {
  return useMutation({ mutationFn: (id: number) => api.delete(`/investigacoes/${id}`) })
}

/** Módulo "Aprovar investigações": todos os pedidos (só quem aprova). */
export function useAprovacoesInvestigacao(enabled = true) {
  return useQuery<RegistroInvestigacao[]>({
    queryKey: ['investigacoes', 'aprovacoes'],
    queryFn: async () => (await api.get<RegistroInvestigacao[]>('/investigacoes/aprovacoes')).data,
    enabled,
  })
}

const dataBR = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')
/** Quando é a investigação: "29/10/2026 às 21:30" (pedido antigo sem horário: só a data). */
export const quandoInvestigacao = (r: Pick<RegistroInvestigacao, 'data' | 'hora'>) => r.hora ? `${dataBR(r.data)} às ${r.hora}` : dataBR(r.data)
/** Data e hora de um registro do sistema (pedido feito, decisão…). */
export const dataHoraBR = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
/** Horário de agora (HH:MM) para o formulário. */
export const horaAgora = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
