/**
 * Foto de membro sem vazar IDs do Discord.
 * A URL do CDN do Discord leva o ID do servidor e o ID Discord da pessoa
 * (cdn.discordapp.com/guilds/<servidor>/users/<pessoa>/…). Para fora sai só um link do próprio site,
 * /api/public/foto/<chave>, com uma chave opaca (HMAC do ID do membro com o segredo do servidor):
 * não dá para adivinhar, não revela nada e continua a mesma depois de reiniciar.
 * Foto enviada no site (data URL) ou link de terceiros segue como está (não leva ID do Discord).
 */
import crypto from 'crypto'
import { peekData, dataRevision } from './data'
import { avatarAtual } from './identidadeMembro'
import { DuData } from './types'

const ehDoDiscord = (url: string) => url.startsWith('https://cdn.discordapp.com/')

// Segredo lido no PRIMEIRO uso (não ao carregar o módulo): quem só importa o ranking — testes,
// scripts — não precisa do .env carregado antes
let segredo: string | undefined
function segredoFoto(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (segredo ??= (require('./config/env') as typeof import('./config/env')).env.JWT_SECRET)
}

export function chaveDaFoto(membroId: number): string {
  return crypto.createHmac('sha256', segredoFoto()).update(`foto-membro:${membroId}`).digest('base64url').slice(0, 22)
}

/** Link seguro para a foto do membro (null sem foto). */
export function fotoSemIds(membroId: number, url: string | null | undefined): string | null {
  if (!url) return null
  return ehDoDiscord(url) ? `/api/public/foto/${chaveDaFoto(membroId)}` : url
}

// chave → membro (refeito só quando os dados mudam)
let indice: { revisao: number; mapa: Map<string, number> } | undefined
/** Foto atual do membro da chave (URL do CDN ou data URL), ou undefined. */
export function fotoDaChave(chave: string): string | undefined {
  const data = peekData() as DuData
  if (!indice || indice.revisao !== dataRevision()) {
    indice = { revisao: dataRevision(), mapa: new Map(data.membros.map(m => [chaveDaFoto(m.id), m.id])) }
  }
  const membroId = indice.mapa.get(chave)
  if (membroId === undefined) return undefined
  const conta = data.contas.find(c => c.membroId === membroId && !c.exonerado)
  return avatarAtual(conta) ?? undefined
}
