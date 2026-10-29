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
  | 'ARQUIVO_ENVIADO'
  | 'RELATORIO_CREATED' | 'RELATORIO_UPDATED' | 'RELATORIO_DELETED'
  | 'BOLETIM_CREATED' | 'BOLETIM_UPDATED' | 'BOLETIM_DELETED'
  | 'INQUERITO_CREATED' | 'INQUERITO_UPDATED' | 'INQUERITO_DELETED'
  | 'INVESTIGACAO_REGISTRADA' | 'INVESTIGACAO_STATUS' | 'INVESTIGACAO_EXCLUIDA'
  | 'FOTO_CREATED' | 'FOTO_UPDATED' | 'FOTO_DELETED'
  | 'ARVORE_CREATED' | 'ARVORE_UPDATED' | 'ARVORE_DELETED'
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

/** Quem recebe cada evento (o módulo de Logs do painel). Sem import direto: evita ciclo entre módulos. */
type OuvinteAudit = (event: AuditEvent, req: Pick<Request, 'user'> | undefined, detail: string | null) => void
let ouvinte: OuvinteAudit | undefined
export function ouvirAudit(fn: OuvinteAudit): void { ouvinte = fn }

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
  try { ouvinte?.(event, req, entry.detail ? redact(entry.detail) : null) } catch { /* log do painel nunca derruba a ação */ }
}

/** Lê só o fim do arquivo (até 2 MB): o log pode chegar a 20 MB e é lido a cada abertura da tela. */
const MAX_LEITURA_AUDIT = 2 * 1024 * 1024

/**
 * Últimas entradas para a tela de administração. Lista branca: data, evento, usuário e detalhe —
 * o IP fica só no arquivo (regra: logs na tela sem IP).
 */
export function readAuditLog(limit = 200): { ts: unknown; event: unknown; user: unknown; detail: unknown }[] {
  try {
    const fd = fs.openSync(LOG_PATH, 'r')
    let raw: string
    try {
      const tamanho = fs.fstatSync(fd).size
      const ler = Math.min(tamanho, MAX_LEITURA_AUDIT)
      const buf = Buffer.alloc(ler)
      fs.readSync(fd, buf, 0, ler, tamanho - ler)
      raw = buf.toString('utf-8')
      if (ler < tamanho) raw = raw.slice(raw.indexOf('\n') + 1)   // descarta a linha cortada no início
    } finally { fs.closeSync(fd) }
    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .slice(-limit)
      .flatMap(l => {
        try {
          const e = JSON.parse(redact(l)) as Record<string, unknown>
          return [{ ts: e.ts ?? null, event: e.event ?? null, user: e.user ?? null, detail: e.detail ?? null }]
        } catch { return [] }
      })
      .reverse()
  } catch {
    return []
  }
}
