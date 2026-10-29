// Perfil no navegador: o "Personalizar perfil" não pode sumir quando o sistema recarrega
// as consultas (revisão mudando) nem quando uma consulta secundária falha (403).
// Só dados sintéticos; não conecta ao banco nem ao Discord.
const path = require('node:path')
const express = require('express')
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright')
const app = express()
app.use(express.json())
let revisao = 1
let membros403 = false   // consulta secundária falhando, com latência de rede realista
setInterval(() => { revisao++ }, 3000)
const me = {
  contaId: 1, username: 'teste', nivel: 'membro', onboarded: true, membroId: 5, cargoPermId: 1, admin: false, dev: false,
  nomeServidor: 'Teste', avatarAtual: null, nivelMembro: 40, banner: null, links: [], emojisPerfil: [],
  permissoes: { ranking: { ver: true }, membros: { ver: true } }, termos: { atual: '2026-09-18-2', aceita: '2026-09-18-2' },
}
let meCalls = 0
app.post('/api/auth/sessao', (_q, r) => r.json({ ...me, token: 'synthetic' }))
app.get('/api/auth/me', (_q, r) => { meCalls++; r.json(me) })
app.get('/api/auth/me/qrus', (_q, r) => r.json([]))
app.get('/api/auth/me/solicitacao-perfil', (_q, r) => r.json(null))
app.put('/api/auth/me/personalizacao', (q, r) => { me.links = q.body.links; me.emojisPerfil = q.body.emojis; revisao++; r.json({ ok: true }) })
app.get('/api/membros', (_q, r) => membros403 ? setTimeout(() => r.status(403).json({ error: 'Acesso negado' }), 600) : r.json([{ id: 5, policial: 'Teste', badge: '1', passaporte: '2', patenteDPD: 'Soldado', patenteInterna: 'Officer', status: 'Ativo', entrada: '2026-09-01', promocao: '2026-09-01', adv1: false, adv2: false, adv3: false }]))
app.get('/api/ranking/me', (_q, r) => r.json({ id: 5, rank: 3, wins: 1, losses: 0, records: 1, winRate: 100 }))
app.get('/api/config/logo', (_q, r) => r.json({ logo: '' }))
app.get('/api/public/revisao', (_q, r) => r.json({ revisao }))
app.get('/api/notificacoes', (_q, r) => r.json({ notificacoes: [], naoLidas: 0 }))
app.get('/api/avisos', (_q, r) => r.json({ avisos: [], naoVistos: 0 }))
app.get('/api/acoes', (_q, r) => r.json({ acoes: [], total: 0 }))
app.use('/api', (_q, r) => r.json([]))
const frontend = path.resolve(__dirname, '../../frontend/dist')
app.use(express.static(frontend))
app.use((_q, r) => r.sendFile(path.join(frontend, 'index.html')))
;(async () => {
  const server = await new Promise(res => { const s = app.listen(0, '127.0.0.1', () => res(s)) })
  const base = `http://127.0.0.1:${server.address().port}`
  const browser = await chromium.launch({ headless: true })
  try {
    for (const falha of [false, true]) {
      membros403 = falha
      me.links = []; me.emojisPerfil = []
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
      const erros = []
      page.on('pageerror', e => erros.push(e.message))
      await page.goto(base + '/perfil')
      const card = page.getByText('Personalizar perfil').first()
      await card.waitFor({ timeout: 15000 })
      // Observa o DOM: qualquer momento sem o card (mesmo um piscar) é contado
      await page.evaluate(() => {
        window.__sumicos = 0
        const temCard = () => [...document.querySelectorAll('h2')].some(h => h.textContent.includes('Personalizar perfil'))
        new MutationObserver(() => { if (!temCard()) window.__sumicos++ }).observe(document.body, { childList: true, subtree: true })
      })
      await page.waitForTimeout(12000)   // a revisão muda a cada 3s → recarga de todas as consultas
      assert.equal(await page.evaluate(() => window.__sumicos), 0, `card sumiu (consulta falhando: ${falha})`)
      await page.getByText('Adicionar link').click()
      await page.getByPlaceholder('https://...').first().fill('https://www.tiktok.com/@teste')
      await page.waitForTimeout(6500)
      assert.equal(await page.getByPlaceholder('https://...').first().inputValue(), 'https://www.tiktok.com/@teste', 'o que foi digitado se perdeu')
      await page.getByText('Salvar personalização').click()
      await page.waitForTimeout(1000)
      assert.deepEqual(me.links, [{ rotulo: 'TikTok', url: 'https://www.tiktok.com/@teste' }])
      assert.ok(await card.isVisible())
      assert.deepEqual(erros, [])
      await page.close()
    }
    console.log('perfil-browser: ok')
  } finally { await browser.close(); server.close() }
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
