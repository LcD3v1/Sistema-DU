#!/usr/bin/env node
/**
 * Copia os dados REAIS da produção para o banco do teste local (fast-local).
 *
 *   node scripts/copiar-producao-para-local.cjs
 *
 * - Só LÊ o banco de produção (MONGODB_DB, padrão "fast"); nunca escreve nele.
 * - Apaga e recria o banco local (padrão "fast-local") com uma cópia fiel.
 * - Recusa rodar se os dois nomes forem iguais.
 */
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })
// Redação de segredos em qualquer log (URI do Mongo, tokens). Requer build (dist/).
try { require('../dist/security/redact').protectConsole() } catch { console.warn('[FAST] build ausente: logs sem redação — rode npm run build') }
const { MongoClient } = require('mongodb')

const ORIGEM = process.env.MONGODB_DB_PRODUCAO || process.env.MONGODB_DB || 'fast'
const DESTINO = process.env.MONGODB_DB_LOCAL || 'fast-local'

;(async () => {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI não definido no backend/.env')
  if (ORIGEM === DESTINO) throw new Error(`Recusado: origem e destino são o mesmo banco ("${ORIGEM}").`)

  const cliente = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 15_000 })
  try {
    const origem = cliente.db(ORIGEM)
    const destino = cliente.db(DESTINO)
    const colecoes = (await origem.listCollections({}, { nameOnly: true }).toArray()).map(c => c.name).filter(n => !n.startsWith('system.'))
    if (colecoes.length === 0) throw new Error(`O banco de produção "${ORIGEM}" está vazio — nada a copiar.`)

    await destino.dropDatabase()
    const resumo = []
    for (const nome of colecoes) {
      const docs = await origem.collection(nome).find().toArray()
      if (docs.length) await destino.collection(nome).insertMany(docs, { ordered: false })
      resumo.push(`${nome}: ${docs.length}`)
    }
    console.log(`[FAST] Dados reais copiados de "${ORIGEM}" → "${DESTINO}" (${resumo.join(' · ')})`)
  } finally {
    await cliente.close()
  }
})().catch(err => {
  console.error('[FAST] Falha ao copiar dados da produção:', err.message)
  process.exit(1)
})
