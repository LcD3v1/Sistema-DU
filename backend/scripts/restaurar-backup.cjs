#!/usr/bin/env node
// Restaura um backup automático criptografado (backups/du-AAAAMMDD-HHMMSS.json.enc).
// Uso (com a mesma DATA_ENCRYPTION_KEY do servidor no ambiente ou no backend/.env):
//   npm run build
//   node scripts/restaurar-backup.cjs <backup.json.enc> <saida.json>
// Depois: pare o servidor, guarde o data.json atual e coloque a saída no lugar dele.
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') })
const fs = require('node:fs')
const [origem, destino] = process.argv.slice(2)
if (!origem || !destino) { console.error('Uso: node scripts/restaurar-backup.cjs <backup.json.enc> <saida.json>'); process.exit(1) }
if (fs.existsSync(destino)) { console.error('O arquivo de saída já existe — escolha outro nome (nada foi sobrescrito).'); process.exit(1) }
const { lerBackup } = require('../dist/backupAutomatico')
try {
  const dados = lerBackup(origem)
  fs.writeFileSync(destino, JSON.stringify(dados, null, 2), { mode: 0o600 })
  console.log(`Backup restaurado em ${destino} (${dados.contas?.length ?? 0} contas, ${dados.membros?.length ?? 0} membros).`)
} catch {
  console.error('Não foi possível ler o backup: arquivo alterado ou DATA_ENCRYPTION_KEY diferente.')
  process.exit(1)
}
