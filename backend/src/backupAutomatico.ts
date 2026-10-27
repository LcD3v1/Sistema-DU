import fs from 'fs'
import path from 'path'
import { PASTA_DADOS, gravarAtomico } from './armazenamento'
import { readData } from './data'
import { criptografar, descriptografar, criptografiaDisponivel } from './security/crypto'

/**
 * Backups automáticos do arquivo de dados, CRIPTOGRAFADOS (AES-256-GCM com a
 * DATA_ENCRYPTION_KEY): um ao iniciar e outro a cada 24 h, em <pasta do DATA_PATH>/backups,
 * guardando os MANTER mais recentes. Quem copiar a pasta sem a chave não lê nada.
 *
 * Recuperar: `node scripts/restaurar-backup.cjs <arquivo.enc> <saida.json>` (precisa da chave).
 * Os arquivos enviados (arquivos/, anuncio-imagens/) não entram aqui — copie a pasta
 * inteira no backup da hospedagem (ver docs/SECURITY.md).
 */

export const PASTA_BACKUPS = path.join(PASTA_DADOS, 'backups')
const MANTER = 14
const INTERVALO_MS = 24 * 60 * 60_000
const AAD = 'du:backup:v1'
const NOME = /^du-\d{8}-\d{6}\.json\.enc$/

export function criarBackup(agora = new Date()): string | null {
  if (!criptografiaDisponivel()) return null
  const carimbo = agora.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  const arquivo = path.join(PASTA_BACKUPS, `du-${carimbo}.json.enc`)
  gravarAtomico(arquivo, criptografar(JSON.stringify(readData()), AAD))
  // Rotação: mantém só os mais recentes
  const todos = fs.readdirSync(PASTA_BACKUPS).filter(f => NOME.test(f)).sort()
  for (const velho of todos.slice(0, Math.max(0, todos.length - MANTER))) fs.rmSync(path.join(PASTA_BACKUPS, velho), { force: true })
  return arquivo
}

/** Lê um backup (para o script de restauração e os testes). */
export function lerBackup(arquivo: string): unknown {
  return JSON.parse(descriptografar(fs.readFileSync(arquivo, 'utf8'), AAD))
}

export function iniciarBackupAutomatico(): void {
  if (!criptografiaDisponivel()) {
    console.warn('[DU][BACKUP] DATA_ENCRYPTION_KEY ausente — backups automáticos desligados.')
    return
  }
  const rodar = () => {
    try { criarBackup() } catch (err) { console.error('[DU][BACKUP] falha ao criar backup:', err instanceof Error ? err.message : err) }
  }
  rodar()
  setInterval(rodar, INTERVALO_MS).unref()
}
