/**
 * Valida a separação catálogo × contratações e a nova aba, no navegador.
 * Uso: node scripts/desenvolvimento/testes-visuais-catalogo.mjs
 */
import { chromium } from 'playwright-core'
import { homedir } from 'node:os'

const executablePath = `${homedir()}/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`
const BASE = 'http://localhost:5173'
const DESTINO = '/tmp/claude-1000/-home-junior-vincis2/capturas'
const EMAIL = 'demo.profissional.ana.silva@vincis.local'
const SENHA = 'Teste@123456'

const resultados = []
const verificar = (n, ok, d = '') => {
  resultados.push({ n, ok })
  console.log(`${ok ? 'PASS' : 'FALHA'}  ${n}${d ? ` — ${d}` : ''}`)
}

const navegador = await chromium.launch({ executablePath, headless: true })

for (const vp of [
  { nome: 'desktop', width: 1440, height: 1000 },
  { nome: 'mobile', width: 390, height: 844 },
]) {
  const ctx = await navegador.newContext({ viewport: { width: vp.width, height: vp.height } })
  const pagina = await ctx.newPage()

  await pagina.goto(`${BASE}/?entrar=1`, { waitUntil: 'domcontentloaded' })
  await pagina.waitForTimeout(2500)
  await pagina.locator('input[name="emailOuWhatsapp"], input[type="email"]').first().fill(EMAIL)
  await pagina.locator('input[name="senha"]').fill(SENHA)
  await pagina.locator('button[type="submit"]').first().click()
  await pagina.waitForURL('**/admin**', { timeout: 25000 })

  // Admin → Serviços: só contratações.
  await pagina.goto(`${BASE}/admin?pagina=services`, { waitUntil: 'domcontentloaded' })
  await pagina.waitForTimeout(4000)
  const admin = await pagina.locator('body').innerText()
  verificar(`[${vp.nome}] Admin Serviços mantém título e subtítulo`,
    admin.includes('Serviços') && admin.includes('Gerencie seus serviços avulsos.'))
  verificar(`[${vp.nome}] botão Novo Serviço continua presente`,
    (await pagina.getByRole('button', { name: /Novo Serviço/i }).count()) > 0)
  verificar(`[${vp.nome}] catálogo NÃO aparece na tabela operacional`,
    !admin.includes('Abertura de MEI') && !admin.includes('Regularização de CNPJ'))
  verificar(`[${vp.nome}] colunas preservadas`,
    ['Serviço', 'Cliente', 'Valor', 'Prazo', 'Status', 'Ações'].every((c) => admin.includes(c)))
  if (vp.nome === 'desktop') {
    await pagina.screenshot({ path: `${DESTINO}/admin-servicos-final.png`, fullPage: true })
  }

  // Meu Perfil → aba Serviços.
  await pagina.goto(`${BASE}/admin?pagina=profile&aba=servicos`, { waitUntil: 'domcontentloaded' })
  await pagina.waitForTimeout(4500)
  const perfil = await pagina.locator('body').innerText()
  verificar(`[${vp.nome}] aba Serviços existe em Meu Perfil`,
    (await pagina.getByRole('tab', { name: /Serviços/i }).count()) > 0)
  verificar(`[${vp.nome}] abas originais preservadas`,
    ['Dados e profissão', 'Especialidades', 'Valores'].every((t) => perfil.includes(t)))
  verificar(`[${vp.nome}] catálogo aparece na aba`, perfil.includes('Abertura de MEI'))
  if (vp.nome === 'desktop') {
    await pagina.screenshot({ path: `${DESTINO}/meu-perfil-servicos.png`, fullPage: true })
  }

  await ctx.close()
}

await navegador.close()
const falhas = resultados.filter((r) => !r.ok).length
console.log(`\n${resultados.length - falhas}/${resultados.length} verificações aprovadas.`)
process.exit(falhas ? 1 : 0)
