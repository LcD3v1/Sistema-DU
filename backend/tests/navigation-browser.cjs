// Navegação real com sessão e APIs sintéticas; não conecta ao banco ou Discord.
const assert = require('node:assert/strict')
const path = require('node:path')
const express = require('express')
const { chromium } = require('playwright')

const app = express()
const user = {
  contaId: 1, username: 'teste', nivel: 'membro', onboarded: true,
  membroId: null, cargoPermId: 1, admin: false,
  permissoes: { ranking: { ver: true }, ausencias: { ver: true, editar: true } },
}
app.post('/api/auth/sessao', (_req, res) => res.json({ ...user, token: 'synthetic-browser-session' }))
app.get('/api/auth/me', (_req, res) => res.json(user))
app.get('/api/config/logo', (_req, res) => res.json({ logo: '' }))
app.get('/api/public/revisao', (_req, res) => res.json({ revisao: 1 }))
app.get('/api/notificacoes', (_req, res) => res.json({ notificacoes: [], naoLidas: 0 }))
app.use('/api/ranking', (_req, res) => res.status(503).json({ error: 'Indisponível' }))
app.use('/api', (_req, res) => res.json([]))
const frontend = path.resolve(__dirname, '../../frontend/dist')
app.use(express.static(frontend))
app.use((_req, res) => res.sendFile(path.join(frontend, 'index.html')))

async function main() {
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })
  let browser
  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/assets/RegistrarAusenciaPage-*.js', async route => {
      await new Promise(resolve => setTimeout(resolve, 800))
      await route.continue()
    })
    const base = `http://127.0.0.1:${server.address().port}`
    await page.goto(base + '/ranking')
    await page.getByRole('heading', { name: 'Ranking de QRUs' }).waitFor()
    const navigate = href => page.locator(`nav a[href="${href}"]`).evaluate(el => el.click())
    const visible = async heading => {
      await page.getByRole('heading', { name: heading, exact: true }).waitFor({ timeout: 5000 })
      await page.waitForFunction(() => {
        const el = document.querySelector('main > div')
        return el && getComputedStyle(el).display !== 'none' && Number(getComputedStyle(el).opacity) > 0.9
      }, null, { timeout: 5000 })
    }
    await navigate('/ausencias/nova')
    await page.waitForFunction(() => {
      const main = document.querySelector('main')
      return main?.textContent.includes('CARREGANDO MÓDULO...')
    }, null, { timeout: 5000 })
    assert.equal(await page.locator('main > div').evaluate(el => getComputedStyle(el).opacity), '1',
      'carregamento da rota não pode ficar transparente')
    await visible('Registrar ausência')
    for (const reducedMotion of ['no-preference', 'reduce']) {
      await page.emulateMedia({ reducedMotion })
      for (let i = 0; i < 5; i++) {
        await navigate('/ranking')
        await navigate('/ausencias/nova')
        await navigate('/ranking')
        await visible('Ranking de QRUs')
        await navigate('/ausencias/nova')
        await visible('Registrar ausência')
      }
    }
    await page.goBack()
    await visible('Ranking de QRUs')
    await page.goForward()
    await visible('Registrar ausência')
    await page.reload()
    await visible('Registrar ausência')
    assert.deepEqual(errors, [])
    console.log('OK: carregamento lento, navegação rápida, movimento reduzido, voltar/avançar e recarga sem tela vazia.')
  } finally {
    await browser?.close()
    await new Promise(resolve => server.close(resolve))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
