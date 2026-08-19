import { chromium } from 'playwright-core'
import { homedir } from 'node:os'

const executablePath = `${homedir()}/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`
const resultados = []
const verificar = (nome, ok, detalhe = '') => {
  resultados.push({ nome, ok })
  console.log(`${ok ? 'PASS' : 'FALHA'}  ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
}

const navegador = await chromium.launch({ executablePath, headless: true })
const contexto = await navegador.newContext()
const pagina = await contexto.newPage()

await pagina.goto('http://localhost:5173/?entrar=1', { waitUntil: 'domcontentloaded' })
await pagina.waitForTimeout(3000)

let senha = pagina.locator('input[name="senha"]')
if (!(await senha.count())) {
  await pagina.getByRole('button', { name: /entrar/i }).first().click()
  await pagina.waitForTimeout(1500)
  senha = pagina.locator('input[name="senha"]')
}

verificar('Campo de senha presente no modal de login', (await senha.count()) > 0)
verificar('Senha começa oculta', (await senha.getAttribute('type')) === 'password')

const olho = pagina.getByRole('button', { name: 'Mostrar senha' })
verificar('Botão de olho existe com rótulo acessível', (await olho.count()) > 0)

await olho.click()
verificar('Clique no olho exibe a senha', (await senha.getAttribute('type')) === 'text')

const olhoFechar = pagina.getByRole('button', { name: 'Ocultar senha' })
verificar('Ícone alterna para fechado', (await olhoFechar.count()) > 0)

await olhoFechar.click()
verificar('Segundo clique oculta novamente', (await senha.getAttribute('type')) === 'password')

// Acessibilidade por teclado: Tab a partir do campo alcança o botão e Enter alterna.
await senha.focus()
await pagina.keyboard.press('Tab')
const focoNoBotao = await pagina.evaluate(
  () => document.activeElement?.getAttribute('aria-label') ?? '',
)
verificar('Tab move o foco para o botão de olho', focoNoBotao === 'Mostrar senha', focoNoBotao)
await pagina.keyboard.press('Enter')
verificar('Enter alterna a visibilidade', (await senha.getAttribute('type')) === 'text')
await pagina.keyboard.press(' ')
verificar('Espaço volta a ocultar', (await senha.getAttribute('type')) === 'password')

// O login do Google segue presente e inalterado.
verificar(
  'Login Google preservado',
  (await pagina.getByRole('button', { name: /Continuar com Google/i }).count()) > 0,
)

await navegador.close()
const falhas = resultados.filter((item) => !item.ok).length
console.log(`\n${resultados.length - falhas}/${resultados.length} verificações de UI aprovadas.`)
process.exit(falhas ? 1 : 0)
