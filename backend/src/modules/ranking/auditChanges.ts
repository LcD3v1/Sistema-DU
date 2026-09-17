import type { FastData } from '../../types'
import { audit } from '../../security/audit'

export function auditRankingChanges(before: FastData, after: FastData): void {
  const previous = new Map(before.membros.map(m => [m.id, m]))
  for (const member of after.membros) {
    const old = previous.get(member.id)
    if (old && JSON.stringify(old) !== JSON.stringify(member)) {
      audit('MEMBER_UPDATED', undefined, `member=${member.id}`)
      if (old.patenteInterna !== member.patenteInterna || old.patenteNPD !== member.patenteNPD) {
        audit('ROLE_CHANGED', undefined, `member=${member.id}`)
      }
    }
  }
  const oldRoles = new Map(before.contas.map(c => [c.id, c.cargoPermId]))
  for (const account of after.contas) {
    if (oldRoles.has(account.id) && oldRoles.get(account.id) !== account.cargoPermId) {
      audit('ROLE_CHANGED', undefined, `account=${account.id}`)
    }
  }
}
