import 'dotenv/config'
import { protectConsole } from '../security/redact'
protectConsole()

// Nunca permitir que uma variável herdada desabilite a validação TLS.
delete process.env.NODE_TLS_REJECT_UNAUTHORIZED

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
  console.error('\n[DU][SEGURANÇA] Falha de configuração — o servidor não vai iniciar.')
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

// Discord OAuth é o ÚNICO método de login; avisa se não estiver configurado.
function validateDiscord(): void {
  const { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI } = process.env
  const some = DISCORD_CLIENT_ID || DISCORD_CLIENT_SECRET || DISCORD_REDIRECT_URI
  const all = DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET && DISCORD_REDIRECT_URI
  if (!all) {
    console.warn(`[DU][ATENÇÃO] Discord OAuth ${some ? 'parcialmente configurado' : 'não configurado'} — o login é SÓ via Discord, então ninguém conseguirá entrar até preencher DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET e DISCORD_REDIRECT_URI.`)
  }
}

function validateMongo(): void {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('\n[DU][CONFIG] MONGODB_URI não está definido — o servidor não vai iniciar.')
    console.error('  Defina a string de conexão do MongoDB no arquivo backend/.env.\n')
    process.exit(1)
  }
  if (uri.includes('<db_username>') || uri.includes('<db_password>')) {
    console.error('\n[DU][CONFIG] MONGODB_URI ainda contém <db_username> — substitua pelo usuário do banco.\n')
    process.exit(1)
  }
}
validateMongo()

export const env = {
  JWT_SECRET: validateJwtSecret(),
  PROD,
  PORT: parseInt(process.env.PORT || (PROD ? '80' : '3001'), 10),
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || 'http://localhost:5173',
}

validateDiscord()

// Aviso extra em produção sobre CORS aberto/origem padrão.
if (PROD && !process.env.ALLOWED_ORIGIN) {
  console.warn('[DU][SEGURANÇA] ALLOWED_ORIGIN não definido em produção — usando same-origin (CORS desligado).')
}

// Chave de criptografia em repouso (opcional): se definida, precisa ser válida (32 bytes)
// e diferente do JWT_SECRET (segredos com finalidades distintas nunca são reaproveitados).
{
  const bruta = process.env.DATA_ENCRYPTION_KEY
  if (bruta !== undefined && bruta.trim() !== '') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { decodificarChave } = require('../security/crypto') as typeof import('../security/crypto')
    if (!decodificarChave(bruta)) fail('DATA_ENCRYPTION_KEY inválida — use 32 bytes em base64url (43 chars) ou hex (64 chars).')
    if (bruta.trim() === process.env.JWT_SECRET?.trim()) fail('DATA_ENCRYPTION_KEY não pode ser igual ao JWT_SECRET.')
  }
}

// Proteções que NÃO devem ser desligadas em produção
if (PROD) {
  for (const [nome, desligado] of [
    ['FIREWALL_ATIVO', /^(off|false|0)$/i],
    ['FORCAR_HTTPS', /^(off|false|0)$/i],
    ['FIREWALL_ISENTAR_LOOPBACK', /^(on|true|1)$/i],
  ] as const) {
    if (desligado.test(process.env[nome]?.trim() ?? '')) {
      console.warn(`[DU][SEGURANÇA] ${nome} enfraquece a proteção em produção — revise o .env.`)
    }
  }
  if (process.env.DISCORD_EXIGIR_SERVIDOR === 'off') {
    console.warn('[DU][SEGURANÇA] DISCORD_EXIGIR_SERVIDOR=off é ignorado em produção.')
  }
}
