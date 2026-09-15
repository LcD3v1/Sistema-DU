import { useMe } from './useMe'
import type { AreaId } from '@/lib/permAreas'

/**
 * Permissões efetivas do usuário atual.
 * - Se a conta tem um cargo de permissão (ou é admin), respeita o mapa vindo do backend.
 * - Se não tem cargo (permissoes === null), mantém o comportamento antigo baseado no nível
 *   (permissivo) para não quebrar contas existentes.
 */
export function usePerms() {
  const { data: me } = useMe()
  const perms = me?.permissoes ?? null
  const hasCargo = perms !== null

  const canView = (area: AreaId): boolean => (perms ? Boolean(perms[area]?.ver) : true)
  const canEdit = (area: AreaId): boolean => (perms ? Boolean(perms[area]?.editar) : true)

  return { canView, canEdit, hasCargo, perms }
}
