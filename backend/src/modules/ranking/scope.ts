import type { Db } from 'mongodb'

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

/** This architecture has one database/cache per installation, never a browser-selected tenant. */
export async function bindDatabaseScope(db: Db, scope: RankingScope): Promise<void> {
  const collection = db.collection<{ _id: string; guildId: string; botId: string }>('config')
  const id = 'ranking-scope-v1'
  try {
    await collection.updateOne({ _id: id }, { $setOnInsert: { ...scope } }, { upsert: true })
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error
  }
  const stored = await collection.findOne({ _id: id })
  if (!stored || !sameScope(stored, scope)) {
    throw new Error('Banco vinculado a outro servidor/bot. Configure um banco exclusivo para esta instalação.')
  }
}

export function belongsToScope(value: { guildId?: string; botId?: string }, scope: RankingScope): boolean {
  return (!value.guildId || value.guildId === scope.guildId) && (!value.botId || value.botId === scope.botId)
}
