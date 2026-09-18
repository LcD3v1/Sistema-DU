import fs from 'fs'
import path from 'path'
import { Request } from 'express'
import { redact } from './redact'

export type AuditEvent =
  | 'RANKING_VIEW' | 'MEMBER_VIEW' | 'MEMBER_UPDATED' | 'ROLE_CHANGED' | 'RANKING_RECALCULATED'
  | 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'LOGIN_LOCKED'
  | 'LOGOUT' | 'TOKEN_REFRESHED' | 'PASSWORD_CHANGED'
  | 'ACCOUNT_CREATED' | 'ACCOUNT_UPDATED' | 'ACCOUNT_DELETED'
  | 'MEMBRO_CREATED' | 'MEMBRO_UPDATED' | 'MEMBRO_DELETED'
  | 'ACAO_CREATED' | 'ACAO_DELETED' | 'ACAO_APPROVED'
  | 'CANAIS_UPDATED'
  | 'RECRUTA_CREATED' | 'RECRUTA_AVALIADO' | 'RECRUTA_FECHADO' | 'RECRUTA_DELETED'
  | 'AUSENCIA_CREATED' | 'AUSENCIA_DELETED' | 'AUSENCIA_APROVADA' | 'AUSENCIA_RECUSADA' | 'AUSENCIA_ENCERRADA'
  | 'MEMBRO_PROMOVIDO' | 'MEMBRO_REBAIXADO' | 'MEMBRO_EXONERADO' | 'ACCOUNT_READMITTED'
  | 'ADVERTENCIA_APLICADA' | 'ADVERTENCIA_REMOVIDA'
  | 'PERFIL_SOLICITADO' | 'PERFIL_APROVADO' | 'PERFIL_RECUSADO'
  | 'AVISO_CREATED' | 'AVISO_DELETED'
  | 'SIGNUP_REQUESTED' | 'SIGNUP_APPROVED' | 'SIGNUP_REJECTED'
  | 'ONBOARDING_DONE' | 'PROFILE_SELF_EDITED' | 'PROFILE_MEMBER_LINKED' | 'TERMOS_ACEITOS'
  | 'DISCORD_LOGIN_SUCCESS' | 'DISCORD_LOGIN_DENIED' | 'DISCORD_LOGIN_ERROR'
  | 'DISCORD_ACCOUNT_CREATED' | 'DISCORD_MEMBER_LEFT'
  | 'LOGO_UPDATED' | 'LOGO_DELETED'
  | 'CARTEIRA_POSTADA' | 'RANKING_APREENSOES_RESETADO' | 'ANUNCIO_IMAGEM_ENVIADA' | 'MENSAGEM_DISCORD_ENVIADA'
  | 'CONFIG_UPDATED'
  | 'BACKUP_DOWNLOADED' | 'RESTORE_EXECUTED'
  | 'UNAUTHORIZED_ACCESS' | 'PRIVILEGE_ESCALATION_ATTEMPT'
  | 'RATE_LIMIT_HIT'
  | 'FIREWALL_BAN' | 'FIREWALL_BLOCK' | 'TOKEN_INVALIDO'

const LOG_PATH = process.env.AUDIT_LOG_PATH
  ? path.resolve(process.env.AUDIT_LOG_PATH)
  : path.resolve(__dirname, '..', '..', 'audit.log')

// Rotação simples: ao passar de AUDIT_LOG_MAX_MB (padrão 20), move para audit.log.1
const MAX_BYTES = Math.max(1, Number(process.env.AUDIT_LOG_MAX_MB) || 20) * 1024 * 1024
let escritas = 0
function rotacionarSeNecessario(): void {
  if (++escritas % 200 !== 0) return
  fs.stat(LOG_PATH, (err, st) => {
    if (!err && st.size > MAX_BYTES) fs.rename(LOG_PATH, LOG_PATH + '.1', () => {})
  })
}

function getClientIp(req: Pick<Request, 'ip' | 'headers'>): string {
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
    // Limita o detalhe (evita log gigante com dados controlados pelo cliente)
    detail: detail ? (detail.length > 1000 ? detail.slice(0, 1000) + '…' : detail) : null,
  }
  const line = redact(JSON.stringify(entry)) + '\n'
  rotacionarSeNecessario()
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
      .map(l => JSON.parse(redact(l)))
      .slice(-limit)
      .reverse()
  } catch {
    return []
  }
}
