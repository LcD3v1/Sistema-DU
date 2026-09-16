import { useMe } from './useMe'
import type { AreaId } from '@/lib/permAreas'

/**
 * Permissões efetivas do usuário atual, definidas pelo CARGO DE PERMISSÃO.
 * - `admin`: acesso total (conta dona ou cargo com "acesso total").
 * - `canView`/`canEdit`: permissão por área. Admin sempre pode.
 * Enquanto o /me carrega, libera (evita piscar); após carregar, respeita o cargo.
 */
export function usePerms() {
  const { data: me, isLoading } = useMe()
  const admin = Boolean(me?.admin)
  const perms = me?.permissoes ?? null

  const canView = (area: AreaId): boolean => {
    if (admin) return true
    if (isLoading || !me) return true       // ainda carregando — não bloqueia
    return Boolean(perms?.[area]?.ver)
  }
  const canEdit = (area: AreaId): boolean => {
    if (admin) return true
    if (isLoading || !me) return true
    return Boolean(perms?.[area]?.editar)
  }

  return { admin, canView, canEdit, perms, loading: isLoading }
}
