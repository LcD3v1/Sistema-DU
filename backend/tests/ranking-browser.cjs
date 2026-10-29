// Browser integration: real module HTTP handlers + frontend build, synthetic in-memory data only.
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright')
const express = require('express')
const jwt = require('jsonwebtoken')
const { guild, bot, scope, member, action, makeData } = require('./ranking-fixtures.cjs')
process.env.DISCORD_GUILD_ID = guild
process.env.DISCORD_CLIENT_ID = bot
process.env.JWT_SECRET = 'isolated-browser-test-not-a-real-credential'
delete process.env.DISCORD_BOT_TOKEN
const data = makeData()
data.membros = Array.from({ length: 34 }, (_, i) => member(i + 1))
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
data.acoes = Array.from({ length: 34 }, (_, i) => action(i + 1, data.membros.filter(m => m.id <= 34 - i).map(m => m.id), { data: today, resultado: i % 3 ? 'Vitória' : 'Derrota' }))
data.contas[0].avatarServidor = 'https://cdn.discordapp.com/avatars/missing.png'
let revision = 0
const store = require('../dist/data')
store.readData = () => structuredClone(data)
store.dataRevision = () => revision
require('../dist/security/audit').audit = () => {}
const timers = []
const originalInterval = global.setInterval
global.setInterval = (...args) => { const t = originalInterval(...args); timers.push(t); return t }
const { createRankingRouter } = require('../dist/modules/ranking/router')
global.setInterval = originalInterval
const app = express()
const requests = []
app.use((req, _res, next) => { if (req.url.startsWith('/api/ranking') || req.url.startsWith('/api/public/directory')) requests.push(req.url); next() })
app.use('/api/ranking', createRankingRouter())
app.use('/api/public/directory', createRankingRouter(true))
app.get('/api/auth/me', (_req, res) => res.json({ contaId: 1, username: 'comando', nivel: 'admin', membroId: 1, onboarded: true, cargoPermId: 10, admin: true, permissoes: {}, nomeServidor: 'Comando' }))
app.get('/api/config/logo', (_req, res) => res.json({ logo: '' }))
app.get('/api/acoes', (_req, res) => res.json({ acoes: [], total: 0 }))
app.get('/api/avisos', (_req, res) => res.json({ avisos: [], naoVistos: 0 }))
app.get('/api/notificacoes', (_req, res) => res.json({ notificacoes: [], naoLidas: 0 }))
app.use('/api', (_req, res) => res.json([]))
const frontend = path.resolve(__dirname, '../../frontend/dist')
app.use(express.static(frontend))
app.use((_req, res) => res.sendFile(path.join(frontend, 'index.html')))

async function main() {
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  const base = `http://127.0.0.1:${server.address().port}`
  let browser
  const output = path.join(os.tmpdir(), 'du-ranking-browser')
  fs.mkdirSync(output, { recursive: true })
  try {
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route('https://cdn.discordapp.com/**', route => route.abort())
    await page.goto(base + '/login')
    await page.getByRole('button', { name: 'Ranking', exact: true }).click()
    await page.getByRole('heading', { name: 'Ranking', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Ver perfil de Membro 1, 1º lugar' }).waitFor()
    await page.getByRole('button', { name: 'Ver perfil de Membro 1, 1º lugar' }).click()
    await page.getByRole('heading', { name: 'Perfil do membro' }).waitFor()
    await page.getByText('Disponível no painel', { exact: true }).waitFor()
    await page.keyboard.press('Escape')
    await page.getByRole('heading', { name: 'Perfil do membro' }).waitFor({ state: 'detached' })
    assert.equal(await page.getByRole('dialog', { name: 'Ranking e membros' }).count(), 1)
    await page.screenshot({ path: path.join(output, 'public-desktop.png') })
    await page.getByRole('button', { name: 'Fechar ranking e membros' }).click()
    const token = jwt.sign({ contaId: 1, username: 'comando', nivel: 'admin', scope: `${scope.guildId}:${scope.botId}` }, process.env.JWT_SECRET, { expiresIn: '1h' })
    await page.evaluate(value => sessionStorage.setItem('du-auth', JSON.stringify({ state: { token: value, user: { contaId: 1, username: 'comando', nivel: 'admin' } }, version: 0 })), token)
    await page.goto(base + '/ranking')
    await page.getByRole('button', { name: 'Ver perfil de Membro 1, 1º lugar' }).waitFor()
    await page.getByRole('heading', { name: 'Membros', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Ver perfil de Membro 1, 1º lugar' }).click()
    await page.getByText('333333333333333333', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Fechar perfil' }).click()
    assert.equal(await page.getByRole('button', { name: 'Ver perfil de Membro 1, 1º lugar' }).evaluate(el => el === document.activeElement), true)
    await Promise.all([page.waitForResponse(r => r.url().includes('/api/ranking?') && r.url().includes('period=7d')),
      page.getByRole('button', { name: '7 dias', exact: true }).click()])
    const search = page.getByRole('textbox', { name: 'Pesquisar membros' })
    const before = requests.length
    await search.fill('P')
    await search.fill('P3')
    await search.fill('P34')
    await page.waitForResponse(r => r.url().includes('search=P34') && r.url().includes('/members'))
    assert.ok(requests.length - before <= 2, 'debounce envia uma consulta por painel')
    await page.getByRole('region', { name: 'Membros', exact: true }).getByText('Membro 34', { exact: true }).waitFor()
    await search.fill('Nenhum resultado 987654')
    await page.getByText('Nenhum membro encontrado.', { exact: true }).first().waitFor()
    await search.fill('')
    await page.getByRole('button', { name: 'Ver perfil de Membro 1, 1º lugar' }).waitFor()
    await Promise.all([page.waitForResponse(r => r.url().includes('role=10') && r.url().includes('/members')),
      page.getByRole('combobox', { name: 'Filtrar por cargo' }).selectOption('10')])
    await page.getByRole('combobox', { name: 'Filtrar por cargo' }).selectOption('')
    await Promise.all([page.waitForResponse(r => r.url().includes('/api/ranking?') && r.url().includes('page=2')),
      page.getByRole('region', { name: 'Ranking', exact: true }).getByRole('button', { name: 'Próxima' }).click()])
    await page.getByRole('region', { name: 'Ranking', exact: true }).getByText('25º', { exact: true }).waitFor()
    await page.getByRole('region', { name: 'Ranking', exact: true }).getByRole('button', { name: 'Anterior' }).click()
    await page.getByRole('button', { name: 'Ver perfil de Membro 1, 1º lugar' }).waitFor()
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.locator('main').evaluate(el => { el.scrollTop = 0 })
      await page.getByRole('heading', { name: 'Ranking de QRUs' }).waitFor()
      await page.screenshot({ path: path.join(output, `ranking-${width}.png`) })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow ${width}`)
      const rankingBounds = await page.getByRole('region', { name: 'Ranking', exact: true }).boundingBox()
      assert.ok(rankingBounds.width >= Math.min(200, width - 60), `largura útil ${width}`)
    }
    await page.emulateMedia({ reducedMotion: 'reduce' })
    assert.equal(await page.locator('.ranking-hover').first().evaluate(el => getComputedStyle(el).transitionDuration), '0s')
    await page.setViewportSize({ width: 1440, height: 1000 })
    // New confirmed server data changes position without a page reload.
    data.acoes.push(action(500, [2], { data: today }), action(501, [2], { data: today })); revision++
    await page.getByRole('button', { name: 'Atualizar ranking e membros' }).click()
    await page.getByRole('button', { name: 'Ver perfil de Membro 2, 1º lugar' }).waitFor()
    assert.ok(await page.locator('[aria-label*="subiu 1"]').count())
    // Failure is visible and recoverable without leaking technical details.
    await page.route('**/api/ranking?**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'synthetic failure' }) }))
    await page.getByRole('button', { name: 'Atualizar ranking e membros' }).click()
    await page.getByText('Não foi possível carregar os dados. Tente novamente em instantes.').waitFor()
    await page.unroute('**/api/ranking?**')
    await page.getByRole('button', { name: 'Tentar novamente' }).click()
    await page.getByRole('button', { name: 'Ver perfil de Membro 2, 1º lugar' }).waitFor()
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ result: 'passed', viewports: [1440, 1024, 768, 390, 320], checks: ['public preview', 'private profile', 'focus restore', 'Escape', 'period', 'debounce', 'search', 'role filter', 'pagination', 'responsive', 'reduced motion', 'position change', 'API failure/retry', 'no JS errors'], screenshots: output }, null, 2))
    await context.close()
  } finally {
    if (browser) await browser.close()
    timers.forEach(clearInterval)
    await new Promise(resolve => server.close(resolve))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
