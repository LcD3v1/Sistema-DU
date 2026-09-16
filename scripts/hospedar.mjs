#!/usr/bin/env node
/**
 * Hospedagem local acessível pela internet (Cloudflare Quick Tunnel).
 *
 *   npm run hospedar
 *
 * 1. abre um túnel HTTPS público → http://localhost:PORT
 * 2. grava o link no backend/.env (DISCORD_REDIRECT_URI e FRONTEND_URL)
 * 3. sobe o sistema em produção
 *
 * O link do Quick Tunnel muda a cada execução: cadastre o redirect exibido
 * no Discord Developer Portal (OAuth2 → Redirecionamentos) antes de logar.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BACKEND = path.join(ROOT, 'backend')
const ENV_FILE = path.join(BACKEND, '.env')

function lerEnv() {
  return fs.readFileSync(ENV_FILE, 'utf8')
}

function definirEnv(texto, chave, valor) {
  const re = new RegExp(`^#?\\s*${chave}=.*$`, 'm')
  return re.test(texto) ? texto.replace(re, `${chave}=${valor}`) : `${texto.trimEnd()}\n${chave}=${valor}\n`
}

const porta = (lerEnv().match(/^PORT=(\d+)/m) || [])[1] || '3000'

function acharCloudflared() {
  const candidatos = [
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
  ]
  return candidatos.find(p => fs.existsSync(p)) || 'cloudflared'
}

const filhos = []
function encerrar(codigo = 0) {
  for (const f of filhos) { try { f.kill() } catch { /* noop */ } }
  process.exit(codigo)
}
process.on('SIGINT', () => encerrar(0))
process.on('SIGTERM', () => encerrar(0))

console.log(`\n[HOSPEDAR] Abrindo túnel público para http://localhost:${porta} ...`)
const tunel = spawn(acharCloudflared(), ['tunnel', '--no-autoupdate', '--url', `http://localhost:${porta}`], { windowsHide: true })
filhos.push(tunel)

tunel.on('error', err => {
  console.error('[HOSPEDAR] Não foi possível iniciar o cloudflared:', err.message)
  console.error('  Instale com: winget install --id Cloudflare.cloudflared -e')
  encerrar(1)
})
tunel.on('exit', code => {
  console.error(`[HOSPEDAR] Túnel encerrado (código ${code}).`)
  encerrar(code ?? 1)
})

let iniciado = false
const aoLog = chunk => {
  const texto = chunk.toString()
  const m = texto.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
  if (!m || iniciado) return
  iniciado = true
  const url = m[0]
  const redirect = `${url}/api/auth/discord/callback`

  let env = lerEnv()
  env = definirEnv(env, 'DISCORD_REDIRECT_URI', redirect)
  env = definirEnv(env, 'FRONTEND_URL', url)
  fs.writeFileSync(ENV_FILE, env)

  console.log('\n' + '═'.repeat(72))
  console.log('  ✅ SISTEMA PÚBLICO EM:  ' + url)
  console.log('')
  console.log('  ⚠ Cadastre este redirect no Discord Developer Portal')
  console.log('    (OAuth2 → Redirecionamentos → Adicionar → Salvar):')
  console.log('    ' + redirect)
  console.log('')
  console.log('  Deixe esta janela aberta. Ctrl+C para desligar.')
  console.log('═'.repeat(72) + '\n')

  const servidor = spawn(process.execPath, ['dist/index.js'], {
    cwd: BACKEND,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  })
  filhos.push(servidor)
  servidor.on('exit', code => {
    console.error(`[HOSPEDAR] Servidor encerrado (código ${code}).`)
    encerrar(code ?? 1)
  })
}
tunel.stdout.on('data', aoLog)
tunel.stderr.on('data', aoLog)
