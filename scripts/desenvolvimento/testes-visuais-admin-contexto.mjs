/**
 * Valida no navegador que o /admin abre para cada forma de atuação.
 *
 * Uso: node scripts/desenvolvimento/testes-visuais-admin-contexto.mjs
 */
import { chromium } from 'playwright-core'
import { homedir } from 'node:os'

const executablePath = `${homedir()}/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`
const BASE = 'http://localhost:5173'
const DESTINO = '/tmp/claude-1000/-home-junior-vincis2/capturas'
const SENHA = 'Teste@123456'

const CONTAS = [
  { rotulo: 'profissional-em-equipes', email: 'demo.profissional.ana.silva@vincis.local' },
  { rotulo: 'colaborador-sozinho', email: 'demo.colaborador.tiago.moura@vincis.local' },
  { rotulo: 'colaborador-em-equipe', email: 'demo.colaborador.paula.ramos@vincis.local' },
]

const resultados = []
const verificar = (nome, ok, detalhe = '') => {
  resultados.push({ nome, ok })
  console.log(`${ok ? 'PASS' : 'FALHA'}  ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
}

const navegador = await chromium.launch({ executablePath, headless: true })

for (const conta of CONTAS) {
  for (const vp of [
    { nome: 'desktop', width: 1440, height: 900 },
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
      .fill(conta.email)
    await pagina.locator('input[name="senha"]').fill(SENHA)
    await pagina.locator('button[type="submit"]').first().click()

    try {
      await pagina.waitForURL('**/admin**', { timeout: 25000 })
    } catch {
      verificar(`[${conta.rotulo}/${vp.nome}] login leva ao /admin`, false, pagina.url())
      await contexto.close()
      continue
    }
    await pagina.waitForTimeout(4500)

    const texto = (await pagina.locator('body').innerText()).toLowerCase()
    verificar(
      `[${conta.rotulo}/${vp.nome}] painel abre sem tela de erro`,
      !texto.includes('não foi possível abrir seu espaço'),
    )
    verificar(
      `[${conta.rotulo}/${vp.nome}] não pede para selecionar empresa`,
      !texto.includes('selecione uma empresa'),
    )
    verificar(
      `[${conta.rotulo}/${vp.nome}] não força criar escritório`,
      !texto.includes('crie seu escritório'),
    )

    // Serviços e Clientes precisam abrir.
    for (const [pagina_, rotulo] of [
      ['services', 'Serviços'],
      ['clients', 'Clientes'],
    ]) {
      await pagina.goto(`${BASE}/admin?pagina=${pagina_}`, {
        waitUntil: 'domcontentloaded',
      })
      await pagina.waitForTimeout(3500)
      const corpo = (await pagina.locator('body').innerText()).toLowerCase()
      verificar(
        `[${conta.rotulo}/${vp.nome}] ${rotulo} abre`,
        !corpo.includes('não foi possível abrir seu espaço') &&
          !corpo.includes('selecione uma empresa'),
      )
    }

    if (vp.nome === 'desktop') {
      await pagina.goto(`${BASE}/admin?pagina=services`, {
        waitUntil: 'domcontentloaded',
      })
      await pagina.waitForTimeout(3500)
      await pagina.screenshot({
        path: `${DESTINO}/admin-contexto-${conta.rotulo}.png`,
        fullPage: true,
      })
    }

    await contexto.close()
  }
}

await navegador.close()
const falhas = resultados.filter((r) => !r.ok).length
console.log(`\n${resultados.length - falhas}/${resultados.length} verificações aprovadas.`)
process.exit(falhas ? 1 : 0)
