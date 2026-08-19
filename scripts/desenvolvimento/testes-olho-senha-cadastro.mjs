/**
 * Verificação de UI dos campos de senha na criação de conta.
 *
 * Complementa `testes-olho-senha.mjs` (que cobre o login) validando que os dois
 * campos do cadastro — Senha e Confirmar senha — usam o mesmo componente
 * compartilhado e alternam de forma independente.
 *
 * Requer o dev server em http://localhost:5173.
 *
 * Uso: node scripts/desenvolvimento/testes-olho-senha-cadastro.mjs
 */
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

await pagina.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })
await pagina.waitForTimeout(3000)

// Abre o modal de cadastro e escolhe o tipo Colaborador.
await pagina.getByRole('button', { name: /criar conta/i }).first().click()
await pagina.waitForTimeout(1200)
await pagina.getByText(/colaborador/i).first().click()
await pagina.waitForTimeout(1200)

const senha = pagina.locator('input[name="senha"]')
const confirmar = pagina.locator('input[name="confirmar"]')

verificar('Campo Senha presente', (await senha.count()) > 0)
verificar('Campo Confirmar senha presente', (await confirmar.count()) > 0)
verificar('Senha começa oculta', (await senha.getAttribute('type')) === 'password')
verificar(
  'Confirmar senha começa oculta',
  (await confirmar.getAttribute('type')) === 'password',
)

const olhos = pagina.getByRole('button', { name: 'Mostrar senha' })
verificar('Existem dois botões de olho', (await olhos.count()) === 2, `${await olhos.count()}`)

// Independência: mostrar o primeiro não pode revelar o segundo.
await olhos.nth(0).click()
verificar('Clique revela a Senha', (await senha.getAttribute('type')) === 'text')
verificar(
  'Confirmar senha continua oculta (campos independentes)',
  (await confirmar.getAttribute('type')) === 'password',
)

await pagina.getByRole('button', { name: 'Mostrar senha' }).first().click()
verificar('Clique revela Confirmar senha', (await confirmar.getAttribute('type')) === 'text')
verificar('Senha segue visível', (await senha.getAttribute('type')) === 'text')

// Segundo clique oculta cada um de volta.
await pagina.getByRole('button', { name: 'Ocultar senha' }).nth(0).click()
verificar('Segundo clique oculta a Senha', (await senha.getAttribute('type')) === 'password')
verificar('Confirmar senha permanece visível', (await confirmar.getAttribute('type')) === 'text')

// Acessibilidade por teclado no campo de confirmação.
await confirmar.focus()
await pagina.keyboard.press('Tab')
const rotuloFocado = await pagina.evaluate(
  () => document.activeElement?.getAttribute('aria-label') ?? '',
)
verificar('Tab alcança o botão de olho', rotuloFocado.includes('senha'), rotuloFocado)
await pagina.keyboard.press('Enter')
verificar(
  'Enter alterna a visibilidade',
  (await confirmar.getAttribute('type')) === 'password',
)

// A validação de confirmação de senha continua ativa.
await pagina.locator('input[name="nome"]').fill('Colaborador Teste UI')
await pagina.locator('input[name="email"]').fill('colaborador.ui@exemplo.com')
await pagina.locator('input[name="telefone"]').fill('(11) 97000-0002')
await senha.fill('senhaSegura123')
await confirmar.fill('senhaDiferente123')
await pagina.locator('button[type="submit"]').click()
await pagina.waitForTimeout(1500)
verificar(
  'Confirmação de senha preservada',
  (await pagina.getByText(/senhas não conferem/i).count()) > 0,
)

await navegador.close()
const falhas = resultados.filter((item) => !item.ok).length
console.log(`\n${resultados.length - falhas}/${resultados.length} verificações de UI aprovadas.`)
process.exit(falhas ? 1 : 0)
