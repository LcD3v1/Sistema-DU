/**
 * Criptografia de campos em repouso (AES-256-GCM) + utilitários timing-safe.
 *
 * Chave: DATA_ENCRYPTION_KEY = 32 bytes em base64/base64url (44/43 chars) ou hex (64 chars).
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
 *
 * Formato do texto cifrado: enc:v1:<iv>:<tag>:<dados>  (base64url; IV de 12 bytes aleatório).
 * AAD opcional (ex.: "conta:12:passaporte") amarra o valor ao registro — impede copiar
 * o cifrado de um registro para outro.
 *
 * NÃO há migração automática dos dados existentes (ver docs/SECURITY.md).
 */
import crypto from 'crypto'

const PREFIXO = 'enc:v1:'
const ALG = 'aes-256-gcm'

export function decodificarChave(bruta: string | undefined): Buffer | null {
  const v = bruta?.trim()
  if (!v) return null
  let buf: Buffer | null = null
  if (/^[0-9a-f]{64}$/i.test(v)) buf = Buffer.from(v, 'hex')
  else if (/^[A-Za-z0-9+/_-]{43}=?$/.test(v)) buf = Buffer.from(v.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  return buf && buf.length === 32 ? buf : null
}

function chave(explicita?: Buffer): Buffer {
  const k = explicita ?? decodificarChave(process.env.DATA_ENCRYPTION_KEY)
  if (!k) throw new Error('DATA_ENCRYPTION_KEY ausente ou inválida')
  return k
}

export function criptografiaDisponivel(): boolean {
  return decodificarChave(process.env.DATA_ENCRYPTION_KEY) !== null
}

export function estaCriptografado(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.startsWith(PREFIXO)
}

export function criptografar(texto: string, aad?: string, chaveExplicita?: Buffer): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALG, chave(chaveExplicita), iv)
  if (aad) cipher.setAAD(Buffer.from(aad, 'utf8'))
  const dados = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIXO + [iv, tag, dados].map(b => b.toString('base64url')).join(':')
}

/** Lança erro genérico se o valor foi adulterado, a chave está errada ou o AAD não confere. */
export function descriptografar(cifrado: string, aad?: string, chaveExplicita?: Buffer): string {
  if (!estaCriptografado(cifrado)) throw new Error('Valor não criptografado')
  const partes = cifrado.slice(PREFIXO.length).split(':')
  if (partes.length !== 3) throw new Error('Falha ao descriptografar')
  try {
    const [iv, tag, dados] = partes.map(p => Buffer.from(p, 'base64url'))
    if (iv.length !== 12 || tag.length !== 16) throw new Error()
    const decipher = crypto.createDecipheriv(ALG, chave(chaveExplicita), iv, { authTagLength: 16 })
    if (aad) decipher.setAAD(Buffer.from(aad, 'utf8'))
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(dados), decipher.final()]).toString('utf8')
  } catch {
    throw new Error('Falha ao descriptografar')
  }
}

/** Lê um campo que pode estar em texto puro (legado) ou criptografado. */
export function lerCampo(valor: string | undefined, aad?: string): string | undefined {
  if (valor === undefined) return undefined
  return estaCriptografado(valor) ? descriptografar(valor, aad) : valor
}

/** Comparação em tempo constante (não vaza, pelo tempo, quantos caracteres batem). */
export function iguaisSeguro(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const ha = crypto.createHash('sha256').update(a).digest()
  const hb = crypto.createHash('sha256').update(b).digest()
  return crypto.timingSafeEqual(ha, hb) && a.length === b.length
}

/** Hash não reversível para guardar identificadores de sessão (ex.: jti revogado). */
export function hashIdentificador(valor: string): string {
  return crypto.createHash('sha256').update(valor).digest('base64url')
}
