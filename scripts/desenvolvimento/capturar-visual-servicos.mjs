/**
 * Capturas do perfil público e do Admin → Serviços, em desktop e mobile.
 *
 * Serve para comparar antes/depois e provar que só os dados mudaram.
 *
 * Uso: node scripts/desenvolvimento/capturar-visual-servicos.mjs <sufixo>
 */
import { chromium } from 'playwright-core'
import { homedir } from 'node:os'

const executablePath = `${homedir()}/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`
const BASE = 'http://localhost:5173'
const DESTINO = '/tmp/claude-1000/-home-junior-vincis2/capturas'
const sufixo = process.argv[2] ?? 'atual'
const prestador = process.argv[3] ?? ''

const navegador = await chromium.launch({ executablePath, headless: true })

for (const vp of [
  { nome: 'desktop', width: 1366, height: 1000 },
  { nome: 'mobile', width: 390, height: 844 },
]) {
  const contexto = await navegador.newContext({
    viewport: { width: vp.width, height: vp.height },
  })
  const pagina = await contexto.newPage()

  const url = prestador
    ? `${BASE}/perfil-profissional?prestador=${prestador}`
    : `${BASE}/perfil-profissional`
  await pagina.goto(url, { waitUntil: 'domcontentloaded' })
  await pagina.waitForTimeout(3500)

  const secao = pagina.locator('section', { hasText: 'Serviços disponíveis' }).first()
  if (await secao.count()) {
    await secao.scrollIntoViewIfNeeded()
    await pagina.waitForTimeout(600)
    await secao.screenshot({ path: `${DESTINO}/perfil-servicos-${vp.nome}-${sufixo}.png` })
    console.log(`capturado perfil ${vp.nome} (${sufixo})`)
  } else {
    console.log(`SEÇÃO NÃO ENCONTRADA em ${vp.nome}`)
  }

  await contexto.close()
}

await navegador.close()
