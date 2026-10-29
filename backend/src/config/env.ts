import 'dotenv/config'
import dotenv from 'dotenv'
import path from 'path'
import { protectConsole } from '../security/redact'
// .env da raiz do projeto (variáveis do Discord). Não sobrescreve backend/.env nem o painel da hospedagem.
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true })
protectConsole()

// Nunca permitir que uma variável herdada desabilite a validação TLS.
delete process.env.NODE_TLS_REJECT_UNAUTHORIZED

/**
 * Validação com parada imediata das variáveis de ambiente.
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
  if (/JWT_SECRET|DATA_ENCRYPTION_KEY/.test(msg)) {
    console.error('  Gere um segredo forte com:')
    console.error('    node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"')
    console.error('  e defina no arquivo backend/.env (nunca versione esse arquivo).')
  }
  if (PROD) console.error('  (Modo PRODUÇÃO. Para rodar no seu computador use, na pasta raiz: npm start)')
  console.error('')
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


// Dados em arquivo (DATA_PATH). Em produção ele precisa ficar num disco persistente
// da hospedagem; sem DATA_PATH o arquivo fica dentro da pasta do app e pode sumir no deploy.
function validateDataPath(): void {
  if (PROD && !process.env.DATA_PATH?.trim()) {
    console.warn('[DU][ATENÇÃO] DATA_PATH não definido em produção — os dados ficam em backend/data.json e podem ser perdidos num novo deploy. Aponte para um disco persistente.')
  }
}
validateDataPath()

export const env = {
  JWT_SECRET: validateJwtSecret(),
  PROD,
  PORT: parseInt(process.env.PORT || (PROD ? '80' : '3001'), 10),
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || 'http://localhost:5173',
}


// Aviso extra em produção sobre CORS aberto/origem padrão.
if (PROD && !process.env.ALLOWED_ORIGIN) {
  console.warn('[DU][SEGURANÇA] ALLOWED_ORIGIN não definido em produção — usando same-origin (CORS desligado).')
}

// Chave de criptografia em repouso: obrigatória em produção (protege os
// backups automáticos). Precisa ser válida (32 bytes) e diferente do JWT_SECRET
// (segredos com finalidades distintas nunca são reaproveitados).
{
  const bruta = process.env.DATA_ENCRYPTION_KEY
  if (PROD && (bruta === undefined || bruta.trim() === '')) {
    fail('DATA_ENCRYPTION_KEY não definida — obrigatória em produção (backups criptografados).')
  }
  if (bruta !== undefined && bruta.trim() !== '') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { decodificarChave } = require('../security/crypto') as typeof import('../security/crypto')
    if (!decodificarChave(bruta)) fail('DATA_ENCRYPTION_KEY inválida — use 32 bytes em base64url (43 chars) ou hex (64 chars).')
    if (bruta.trim() === process.env.JWT_SECRET?.trim()) fail('DATA_ENCRYPTION_KEY não pode ser igual ao JWT_SECRET.')
  }
}

// Banco de dados (opcional — MongoDB da Discloud ou Atlas). O site fica em outra hospedagem e fala com o
// banco pela internet: em produção exige TLS e usuário/senha, e nunca aceita certificado inválido.
// O valor da URI nunca é impresso.
{
  const uri = process.env.MONGODB_URI?.trim()
  if (uri) {
    // Formato do MongoDB (aceita vários servidores "h1:27017,h2:27017", que o new URL() recusa)
    const m = /^(mongodb(?:\+srv)?):\/\/(?:([^:@/?]+)(?::([^@/?]*))?@)?([^/?]+)(?:\/[^?]*)?(?:\?(.*))?$/.exec(uri)
    if (!m) fail('MONGODB_URI inválida — use mongodb:// ou mongodb+srv:// (copie da Discloud/Atlas).')
    const [, protocolo, usuario, senha, servidores, consulta] = m!
    const q = new URLSearchParams(consulta ?? '')
    const local = servidores.split(',').every(h => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(h))
    // Rede interna da hospedagem (site e banco na mesma Discloud): nome SEM ponto (ex.: "meubanco123"),
    // que não existe na internet — o tráfego não sai da rede privada. Só aí o TLS pode faltar.
    const redeInterna = protocolo === 'mongodb' && servidores.split(',').every(h => /^[a-z0-9][a-z0-9-]{0,62}(:\d+)?$/i.test(h) && !/^localhost(:\d+)?$/i.test(h))
    const tls = protocolo === 'mongodb+srv' || /^true$/i.test(q.get('tls') ?? q.get('ssl') ?? '')
    if (PROD && !local) {
      if (!usuario || !senha) fail('MONGODB_URI sem usuário e senha — o banco não pode ficar aberto.')
      if (!tls && !redeInterna) fail('MONGODB_URI sem TLS — acrescente ?tls=true (o banco é acessado pela internet).')
    }
    if (/^true$/i.test(q.get('tlsAllowInvalidCertificates') ?? '') || /^true$/i.test(q.get('tlsInsecure') ?? '') || /^true$/i.test(q.get('tlsAllowInvalidHostnames') ?? '')) {
      fail('MONGODB_URI desliga a verificação do certificado TLS — remova tlsInsecure/tlsAllowInvalid*.')
    }
    if (PROD && !process.env.DATA_ENCRYPTION_KEY?.trim()) fail('Com MONGODB_URI, DATA_ENCRYPTION_KEY é obrigatória (os dados vão cifrados para o banco).')
  }
}

// Login pelo Discord: é a única forma de entrar. Em produção, sem a configuração completa
// (ou com redirect sem HTTPS) o servidor não sobe. IDs são snowflakes; segredos nunca são impressos.
{
  const e = process.env
  const id = (v: string | undefined) => /^\d{17,20}$/.test(v?.trim() ?? '')
  // DISCORD_DONO_ID: 1 ou 2 IDs — as ÚNICAS pessoas que entram sem estar no servidor
  const donos = (e.DISCORD_DONO_ID ?? '').split(/[\s,;]+/).map(v => v.trim()).filter(Boolean)
  if (donos.some(v => !id(v))) fail('DISCORD_DONO_ID tem um ID inválido (só números, separados por vírgula).')
  if (new Set(donos).size > 2) fail('DISCORD_DONO_ID aceita no máximo 2 IDs (só duas pessoas entram sem estar no servidor).')
  if (e.DISCORD_ACESSO_LIVRE?.trim()) console.warn('[DU][ATENÇÃO] DISCORD_ACESSO_LIVRE não existe mais e é ignorada — use DISCORD_DONO_ID (máx. 2).')
  const redirect = e.DISCORD_REDIRECT_URI?.trim() || (e.PUBLIC_URL?.trim() ? `${e.PUBLIC_URL.trim().replace(/\/+$/, '')}/api/auth/discord/callback` : '')
  const faltando = [
    !id(e.DISCORD_CLIENT_ID) && 'DISCORD_CLIENT_ID',
    !e.DISCORD_CLIENT_SECRET?.trim() && 'DISCORD_CLIENT_SECRET',
    !id(e.DISCORD_GUILD_ID) && 'DISCORD_GUILD_ID',
    !e.DISCORD_BOT_TOKEN?.trim() && 'DISCORD_BOT_TOKEN',
    !id(donos[0]) && 'DISCORD_DONO_ID',
    !redirect && 'DISCORD_REDIRECT_URI (ou PUBLIC_URL)',
  ].filter(Boolean)
  if (PROD && faltando.length) fail(`Login pelo Discord sem configuração: ${faltando.join(', ')}.`)
  if (PROD && redirect && !redirect.startsWith('https://')) fail('DISCORD_REDIRECT_URI precisa ser https:// em produção.')
  if (e.DISCORD_CLIENT_SECRET?.trim() && e.DISCORD_CLIENT_SECRET.trim() === e.JWT_SECRET?.trim()) fail('DISCORD_CLIENT_SECRET não pode ser igual ao JWT_SECRET.')
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
}
