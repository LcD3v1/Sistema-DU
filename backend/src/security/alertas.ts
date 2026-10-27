import { readData, writeData } from '../data'
import { notificarAdmins } from '../notificacoes'
import { redact } from './redact'

/**
 * Alertas de atividade suspeita para os administradores:
 *  - notificação no sino do painel (todos os admins);
 *  - opcional: ALERTA_WEBHOOK_URL (ex.: webhook de um canal privado do Discord da staff).
 *    A URL vem SÓ do .env do servidor (nunca de usuário) e precisa ser https.
 *
 * Cada tipo+chave alerta no máximo uma vez a cada JANELA_MS (um ataque não vira spam).
 * O texto passa por redact() e nunca leva senha, token nem corpo de requisição.
 */

export type TipoAlerta = 'login_bloqueado' | 'firewall_ban' | 'restauracao' | 'senha_admin_redefinida'

const JANELA_MS = 10 * 60_000
const MAX_CHAVES = 5_000
const ultimo = new Map<string, number>()

function webhook(): URL | null {
  const bruto = process.env.ALERTA_WEBHOOK_URL?.trim()
  if (!bruto) return null
  try { const u = new URL(bruto); return u.protocol === 'https:' ? u : null } catch { return null }
}

export function alertar(tipo: TipoAlerta, titulo: string, mensagem: string, chave = ''): void {
  const k = `${tipo}|${chave}`
  const agora = Date.now()
  if (agora - (ultimo.get(k) ?? 0) < JANELA_MS) return
  ultimo.set(k, agora)
  if (ultimo.size > MAX_CHAVES) ultimo.delete(ultimo.keys().next().value!)
  const texto = redact(mensagem).slice(0, 500)

  try {
    const data = readData()
    notificarAdmins(data, undefined, 'seguranca', `⚠ ${titulo}`, texto, '/configuracoes')
    writeData(data)
  } catch (err) {
    console.error('[DU][ALERTA] notificar admins:', err instanceof Error ? err.message : err)
  }

  const url = webhook()
  if (url) {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `**[DU · segurança] ${titulo}**\n${texto}`, allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
    }).catch(() => console.error('[DU][ALERTA] falha ao enviar o webhook de alerta'))
  }
}
