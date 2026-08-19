/**
 * Captura o Admin → Serviços do prestador, em desktop e mobile.
 *
 * Uso: node scripts/desenvolvimento/capturar-visual-admin-servicos.mjs <email> <senha> <sufixo>
 */
import { chromium } from 'playwright-core'
import { homedir } from 'node:os'

const executablePath = `${homedir()}/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`
const BASE = 'http://localhost:5173'
const DESTINO = '/tmp/claude-1000/-home-junior-vincis2/capturas'
const [email, senha, sufixo = 'atual'] = process.argv.slice(2)

const navegador = await chromium.launch({ executablePath, headless: true })

for (const vp of [
  { nome: 'desktop', width: 1440, height: 1000 },
  { nome: 'mobile', width: 390, height: 844 },
]) {
  const contexto = await navegador.newContext({
    viewport: { width: vp.width, height: vp.height },
  })
  const pagina = await contexto.newPage()

  await pagina.goto(`${BASE}/?entrar=1`, { waitUntil: 'domcontentloaded' })
  await pagina.waitForTimeout(2500)
  await pagina
    .locator('input[name="emailOuWhatsapp"], input[type="email"]')
    .first()
    .fill(email)
  await pagina.locator('input[name="senha"]').fill(senha)
  await pagina.locator('button[type="submit"]').first().click()
  await pagina.waitForURL('**/admin**', { timeout: 25000 })

  await pagina.goto(`${BASE}/admin?pagina=services`, {
    waitUntil: 'domcontentloaded',
  })
  await pagina.waitForTimeout(4000)

  await pagina.screenshot({
    path: `${DESTINO}/admin-servicos-${vp.nome}-${sufixo}.png`,
    fullPage: true,
  })
  console.log(`capturado admin ${vp.nome} (${sufixo})`)
  await contexto.close()
}

await navegador.close()
