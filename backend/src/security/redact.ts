import { format } from 'node:util'

// Nomes de variáveis de ambiente cujo VALOR nunca pode aparecer em log
const ENV_SENSIVEL = /SECRET|TOKEN|PASSWORD|PASSWD|MONGODB_URI|API_KEY|PRIVATE_KEY|ENCRYPTION_KEY|_KEY$|WEBHOOK/i

export function redact(value: string): string {
  let result = value
  for (const [key, secret] of Object.entries(process.env)) {
    if (ENV_SENSIVEL.test(key) && secret && secret.length >= 8) {
      result = result.split(secret).join('[REDACTED]')
    }
  }
  return result
    .replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URI]')
    .replace(/\b(Bearer|Basic)\s+[\w.\-+/=]+/gi, '$1 [REDACTED]')
    .replace(/\bBot\s+[\w.\-+/=]{20,}/g, 'Bot [REDACTED]') // só token; não apaga textos como 'bot no servidor'
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, '[REDACTED_JWT]')
    // Token de bot do Discord sem o prefixo "Bot "
    .replace(/\b[MNO][\w-]{23,27}\.[\w-]{6}\.[\w-]{27,}\b/g, '[REDACTED_DISCORD_TOKEN]')
    // Webhooks do Discord (URL já dá permissão de postar)
    .replace(/(?:https?:\/\/)?(?:\w+\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\S+/gi, '[REDACTED_WEBHOOK]')
    // Códigos de uso único / segredos em hex (64 chars)
    .replace(/\b[a-f0-9]{64}\b/gi, '[REDACTED_HEX]')
    // Valores cifrados em repouso (security/crypto.ts)
    .replace(/enc:v1:[\w-]+:[\w-]+:[\w-]+/g, '[REDACTED_CIPHERTEXT]')
    .replace(/([?&#](?:token|code|access_token|refresh_token|client_secret|state|key)=)[^&\s"]+/gi, '$1[REDACTED]')
}

export function protectConsole(): void {
  for (const method of ['log', 'warn', 'error', 'info', 'debug'] as const) {
    const original = console[method].bind(console)
    console[method] = (...args: unknown[]) => original(redact(format(...args)))
  }
}
