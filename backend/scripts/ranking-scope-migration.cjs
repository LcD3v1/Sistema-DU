// Incremental metadata migration. No member, account or activity is rewritten.
require('dotenv/config')
const { MongoClient } = require('mongodb')
const { bindDatabaseScope, configuredScope, scopeKey } = require('../dist/modules/ranking/scope')

async function main() {
  const scope = configuredScope()
  if (!scope) throw new Error('Configure DISCORD_GUILD_ID e DISCORD_CLIENT_ID.')
  const direction = process.argv[2]
  if (!['up', 'down'].includes(direction)) throw new Error('Uso: node scripts/ranking-scope-migration.cjs up|down')
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 })
  try {
    await client.connect()
    const db = client.db(process.env.MONGODB_DB || 'fast')
    if (direction === 'up') await bindDatabaseScope(db, scope)
    else {
      if (process.argv[3] !== `--confirm-scope=${scopeKey(scope)}`) throw new Error('Rollback requer --confirm-scope=GUILD_ID:CLIENT_ID e aplicação parada.')
      await db.collection('config').deleteOne({ _id: 'ranking-scope-v1', ...scope })
    }
    console.log(`Ranking scope migration ${direction}: concluída.`)
  } finally { await client.close() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
