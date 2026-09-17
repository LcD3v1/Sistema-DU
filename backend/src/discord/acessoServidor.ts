import { botConfigurado } from './forum'

/**
 * Vínculo com o servidor do Discord da unidade:
 *  - o painel só funciona se o BOT estiver no servidor;
 *  - só entra quem FAZ PARTE do servidor.
 *
 * O estado do bot é atualizado em tempo real pelo gateway (entrada/saída do
 * servidor) e, sem gateway (ex.: teste local), consultado pela API com cache curto.
 */

const CACHE_MS = 60_000
let estado: { noServidor: boolean; verificadoEm: number } | undefined

/** Chamado pelo gateway quando o bot entra/sai do servidor ou conecta. */
export function definirBotNoServidor(noServidor: boolean): void {
  estado = { noServidor, verificadoEm: Date.now() }
}

/** Último estado conhecido (undefined = ainda não verificado). Síncrono, para o middleware. */
export function botNoServidorConhecido(): boolean | undefined {
  return estado?.noServidor
}

/** Consulta a API do Discord (com cache) se o bot está no servidor da unidade. */
export async function verificarBotNoServidor(forcar = false): Promise<boolean> {
  if (!botConfigurado()) return false
  if (!forcar && estado && Date.now() - estado.verificadoEm < CACHE_MS) return estado.noServidor
  const res = await fetch(`https://discord.com/api/v10/guilds/${process.env.DISCORD_GUILD_ID}`, {
    signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
  })
  // 403/404 = bot não está (ou não tem acesso) no servidor; outros erros não mudam o estado
  if (res.ok) definirBotNoServidor(true)
  else if (res.status === 403 || res.status === 404) definirBotNoServidor(false)
  else throw new Error(`Discord guild → ${res.status}`)
  return estado!.noServidor
}
