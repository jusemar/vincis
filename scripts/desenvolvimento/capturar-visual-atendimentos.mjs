/**
 * Capturas da tela de Atendimentos para conferência visual.
 *
 * Só observa: não envia mensagem, não muda status e não contrata nada.
 *
 * Uso: node scripts/desenvolvimento/capturar-visual-atendimentos.mjs
 */
import { chromium } from 'playwright-core'
import { homedir } from 'node:os'

const executablePath = `${homedir()}/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`
const BASE = 'http://localhost:5173'
const DESTINO = '/tmp/claude-1000/-home-junior-vincis2/capturas'
const ANA = { email: 'demo.profissional.ana.silva@vincis.local', senha: 'Teste@123456' }
const MARINA = { email: 'cliente.visual@vincis.local', senha: 'Teste@123456' }

async function entrar(p, conta) {
  await p.goto(`${BASE}/?entrar=1`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2500)
  await p.locator('input[name="emailOuWhatsapp"], input[type="email"]').first().fill(conta.email)
  await p.locator('input[name="senha"]').fill(conta.senha)
  await p.locator('button[type="submit"]').first().click()
  await p.waitForURL(/\/(cliente|admin)/, { timeout: 30000 }).catch(() => {})
  await p.waitForTimeout(2500)
}

const nav = await chromium.launch({ executablePath, headless: true })

const ctx = await nav.newContext({ viewport: { width: 1600, height: 1000 } })
const ana = await ctx.newPage()
await entrar(ana, ANA)
await ana.goto(`${BASE}/admin?pagina=atendimentos`, { waitUntil: 'domcontentloaded' })
await ana.waitForTimeout(4000)
const painel = () => ana.locator('aside:visible').filter({ hasText: 'Conversa' }).first()

await ana.locator('button', { hasText: '#2026-0001' }).first().click()
await ana.waitForTimeout(1500)
await ana.screenshot({ path: `${DESTINO}/final-kanban-conversa.png` })

await painel().getByRole('button', { name: 'Informações' }).click()
await ana.waitForTimeout(800)
await ana.screenshot({ path: `${DESTINO}/final-informacoes.png` })

await ana.getByRole('button', { name: 'Visualização em lista' }).click()
await ana.waitForTimeout(1200)
await ana.screenshot({ path: `${DESTINO}/final-lista.png`, fullPage: true })
await ana.getByRole('button', { name: 'Visualização em quadro' }).click()
await ana.waitForTimeout(1000)

await ana.setViewportSize({ width: 1366, height: 768 })
await ana.waitForTimeout(1500)
await painel().getByRole('button', { name: 'Conversa' }).click()
await ana.waitForTimeout(900)
await ana.screenshot({ path: `${DESTINO}/final-drawer-1366.png` })

await ana.setViewportSize({ width: 390, height: 844 })
await ana.waitForTimeout(1500)
await ana.screenshot({ path: `${DESTINO}/final-mobile.png` })
await ctx.close()

const ctx2 = await nav.newContext({ viewport: { width: 1440, height: 900 } })
const marina = await ctx2.newPage()
await entrar(marina, MARINA)
await marina.goto(`${BASE}/cliente`, { waitUntil: 'domcontentloaded' })
await marina.waitForTimeout(2500)
await marina.getByRole('button', { name: /Atendimentos/i }).first().click()
await marina.waitForTimeout(1200)
await marina.screenshot({ path: `${DESTINO}/final-cliente-lista.png`, fullPage: true })
await marina.locator('button', { hasText: '#2026-0001' }).first().click()
await marina.waitForTimeout(1500)
await marina.screenshot({ path: `${DESTINO}/final-cliente-conversa.png`, fullPage: true })
await ctx2.close()

await nav.close()
console.log('capturas geradas em', DESTINO)
