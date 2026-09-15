import fs from 'fs'
import path from 'path'
import { Request } from 'express'

export type AuditEvent =
  | 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'LOGIN_LOCKED'
  | 'LOGOUT' | 'TOKEN_REFRESHED' | 'PASSWORD_CHANGED'
  | 'ACCOUNT_CREATED' | 'ACCOUNT_UPDATED' | 'ACCOUNT_DELETED'
  | 'MEMBRO_CREATED' | 'MEMBRO_UPDATED' | 'MEMBRO_DELETED'
  | 'ACAO_CREATED' | 'ACAO_DELETED' | 'ACAO_APPROVED'
  | 'RECRUTA_CREATED' | 'RECRUTA_AVALIADO' | 'RECRUTA_FECHADO' | 'RECRUTA_DELETED'
  | 'AUSENCIA_CREATED' | 'AUSENCIA_DELETED'
  | 'AVISO_CREATED' | 'AVISO_DELETED'
  | 'SIGNUP_REQUESTED' | 'SIGNUP_APPROVED' | 'SIGNUP_REJECTED'
  | 'ONBOARDING_DONE' | 'PROFILE_SELF_EDITED' | 'PROFILE_MEMBER_LINKED'
  | 'DISCORD_LOGIN_SUCCESS' | 'DISCORD_LOGIN_DENIED' | 'DISCORD_LOGIN_ERROR'
  | 'DISCORD_ACCOUNT_CREATED'
  | 'LOGO_UPDATED' | 'LOGO_DELETED'
  | 'CONFIG_UPDATED'
  | 'BACKUP_DOWNLOADED' | 'RESTORE_EXECUTED'
  | 'UNAUTHORIZED_ACCESS' | 'PRIVILEGE_ESCALATION_ATTEMPT'
  | 'RATE_LIMIT_HIT'

const LOG_PATH = process.env.AUDIT_LOG_PATH
  ? path.resolve(process.env.AUDIT_LOG_PATH)
  : path.resolve(__dirname, '..', '..', 'audit.log')

function getClientIp(req: Pick<Request, 'ip' | 'headers'>): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim()
  return req.ip ?? 'unknown'
}

export function audit(
  event: AuditEvent,
  req?: Pick<Request, 'ip' | 'headers' | 'user'>,
  detail?: string,
): void {
  const entry = {
    ts: new Date().toISOString(),
    event,
    user: req?.user?.username ?? null,
    ip: req ? getClientIp(req) : null,
    detail: detail ?? null,
  }
  const line = JSON.stringify(entry) + '\n'
  // Append não-bloqueante
  fs.appendFile(LOG_PATH, line, () => {})
}

export function readAuditLog(limit = 200): unknown[] {
  try {
    const raw = fs.readFileSync(LOG_PATH, 'utf-8')
    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l))
      .slice(-limit)
      .reverse()
  } catch {
    return []
  }
}
