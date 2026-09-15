import 'dotenv/config'

/**
 * Validação fail-fast das variáveis de ambiente.
 * Importado no topo de index.ts — o processo NÃO sobe se um segredo crítico
 * estiver ausente, fraco ou igual ao placeholder de exemplo.
 *
 * Princípio: "secure by default" — é melhor recusar o boot do que rodar
 * com um segredo forjável (que permitiria falsificar tokens de admin).
 */

const PLACEHOLDERS = new Set([
  'mude-para-uma-string-aleatoria-forte-minimo-48-chars',
  'changeme',
  'secret',
  'your-secret-here',
])

const PROD = process.env.NODE_ENV === 'production'

function fail(msg: string): never {
  console.error('\n[FAST][SEGURANÇA] Falha de configuração — o servidor não vai iniciar.')
  console.error('  → ' + msg)
  console.error('  Gere um segredo forte com:')
  console.error('    node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"')
  console.error('  e defina JWT_SECRET no arquivo backend/.env (nunca versione esse arquivo).\n')
  process.exit(1)
}

function validateJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) fail('JWT_SECRET não está definido.')
  if (PLACEHOLDERS.has(secret!.trim())) {
    fail('JWT_SECRET ainda é o valor de exemplo — qualquer pessoa poderia forjar tokens.')
  }
  if (secret!.length < 32) fail('JWT_SECRET é muito curto (mínimo 32 caracteres; recomendado 64+).')
  // Entropia mínima: pelo menos ~16 caracteres distintos evita "aaaaaaaa..."
  if (new Set(secret!).size < 12) fail('JWT_SECRET tem entropia insuficiente (poucos caracteres distintos).')
  return secret!
}

// Discord OAuth é opcional; se parcialmente configurado, avisa.
function validateDiscord(): void {
  const { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI } = process.env
  const some = DISCORD_CLIENT_ID || DISCORD_CLIENT_SECRET || DISCORD_REDIRECT_URI
  const all = DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET && DISCORD_REDIRECT_URI
  if (some && !all) {
    console.warn('[FAST][SEGURANÇA] Discord OAuth parcialmente configurado — login por Discord ficará desativado até preencher CLIENT_ID, CLIENT_SECRET e REDIRECT_URI.')
  }
}

export const env = {
  JWT_SECRET: validateJwtSecret(),
  PROD,
  PORT: parseInt(process.env.PORT || '3001', 10),
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || 'http://localhost:5173',
}

validateDiscord()

// Aviso extra em produção sobre CORS aberto/origem padrão.
if (PROD && !process.env.ALLOWED_ORIGIN) {
  console.warn('[FAST][SEGURANÇA] ALLOWED_ORIGIN não definido em produção — usando same-origin (CORS desligado).')
}
