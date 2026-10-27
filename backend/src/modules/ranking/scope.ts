import path from 'path'
import { PASTA_DADOS, gravarAtomico, lerJson } from '../../armazenamento'

export interface RankingScope { guildId: string; botId: string }
export function configuredScope(): RankingScope | undefined {
  const guildId = process.env.DISCORD_GUILD_ID?.trim()
  const botId = process.env.DISCORD_CLIENT_ID?.trim()
  return guildId && botId ? { guildId, botId } : undefined
}
export const scopeKey = (scope: RankingScope) => `${scope.guildId}:${scope.botId}`
export function sameScope(a: RankingScope, b: RankingScope): boolean {
  return a.guildId === b.guildId && a.botId === b.botId
}

/**
 * Uma instalação = um arquivo de dados, nunca um tenant escolhido pelo navegador.
 * Na primeira subida grava o servidor/app em escopo.json; depois recusa subir
 * se o .env apontar para outro servidor (evita misturar dados de unidades).
 */
export function bindDataScope(scope: RankingScope): void {
  const arquivo = path.join(PASTA_DADOS, 'escopo.json')
  const stored = lerJson<RankingScope>(arquivo)
  if (!stored) { gravarAtomico(arquivo, JSON.stringify(scope)); return }
  if (!sameScope(stored, scope)) {
    throw new Error('Pasta de dados vinculada a outro servidor/app. Use um DATA_PATH exclusivo para esta instalação.')
  }
}

export function belongsToScope(value: { guildId?: string; botId?: string }, scope: RankingScope): boolean {
  return (!value.guildId || value.guildId === scope.guildId) && (!value.botId || value.botId === scope.botId)
}
