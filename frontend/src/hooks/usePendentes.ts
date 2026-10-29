import { useQuery } from '@tanstack/react-query'
import api from '@/lib/axios'
import { usePerms } from '@/hooks/usePerms'
import { statusAusencia, type Ausencia } from '@/hooks/useAusencias'
import type { PedidoAcesso } from '@/hooks/useContas'
import type { RegistroInvestigacao } from '@/hooks/useRegistrosInvestigacao'
import type { SolicitacaoPerfil } from '@/components/sections/AprovacoesPerfil'

const ATUALIZAR = 30_000

/**
 * Tudo que espera aprovação e que ESTA pessoa pode decidir — cada lista vem da rota de aprovação
 * já existente (com a própria permissão no backend). Sem permissão, a lista nem é pedida (null).
 * As chaves são as mesmas das telas de origem: aprovar em qualquer lugar atualiza o contador.
 */
export function usePendentes() {
  const { admin, canEdit, loading } = usePerms()
  const pronto = !loading
  const pode = {
    perfil: pronto && canEdit('membros'),
    acesso: pronto && admin,
    ausencias: pronto && canEdit('ausencias'),
    investigacoes: pronto && canEdit('investigacoes_gestao'),
  }

  const perfil = useQuery<SolicitacaoPerfil[]>({
    queryKey: ['membros', 'solicitacoes-perfil'],
    queryFn: async () => (await api.get<SolicitacaoPerfil[]>('/membros/solicitacoes-perfil')).data,
    enabled: pode.perfil, refetchInterval: ATUALIZAR,
  })
  const acesso = useQuery<PedidoAcesso[]>({
    queryKey: ['config', 'solicitacoes-acesso'],
    queryFn: async () => (await api.get<PedidoAcesso[]>('/config/solicitacoes-acesso')).data,
    enabled: pode.acesso, refetchInterval: ATUALIZAR,
  })
  const ausencias = useQuery<Ausencia[]>({
    queryKey: ['ausencias'],
    queryFn: async () => (await api.get<Ausencia[]>('/ausencias')).data,
    enabled: pode.ausencias, refetchInterval: ATUALIZAR,
  })
  const investigacoes = useQuery<RegistroInvestigacao[]>({
    queryKey: ['investigacoes', 'aprovacoes'],
    queryFn: async () => (await api.get<RegistroInvestigacao[]>('/investigacoes/aprovacoes')).data,
    enabled: pode.investigacoes, refetchInterval: ATUALIZAR,
  })

  const listas = {
    perfil: pode.perfil ? perfil.data ?? [] : null,
    acesso: pode.acesso ? acesso.data ?? [] : null,
    ausencias: pode.ausencias ? (ausencias.data ?? []).filter(a => statusAusencia(a) === 'pendente') : null,
    investigacoes: pode.investigacoes ? (investigacoes.data ?? []).filter(r => r.aprovacao === 'pendente') : null,
  }
  const total = Object.values(listas).reduce((s, l) => s + (l?.length ?? 0), 0)
  const podeAprovar = Object.values(pode).some(Boolean)
  const carregando = [perfil, acesso, ausencias, investigacoes].some(q => q.isLoading && q.fetchStatus !== 'idle')

  return { listas, total, podeAprovar, carregando }
}
