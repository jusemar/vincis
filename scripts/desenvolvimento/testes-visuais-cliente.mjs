/**
 * Validação visual da área do Cliente, em desktop e mobile.
 *
 * Exercita o caminho real: abre o site, faz login pelo modal, entra na área
 * autenticada, navega pelas abas e confere que nada de prestador aparece.
 * Também verifica o bloqueio por URL direta.
 *
 * Requer o dev server em http://localhost:5173 e a conta criada por
 * `preparar-cliente-visual.ts criar`.
 *
 * Uso: node scripts/desenvolvimento/testes-visuais-cliente.mjs
 */
import { chromium } from 'playwright-core'
import { homedir } from 'node:os'

const executablePath = `${homedir()}/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`
const BASE = 'http://localhost:5173'
const EMAIL = 'cliente.visual@vincis.local'
const SENHA = 'ClienteVisual123'
const DESTINO_CAPTURAS = '/tmp/claude-1000/-home-junior-vincis2/capturas'

const resultados = []
const verificar = (nome, ok, detalhe = '') => {
  resultados.push({ nome, ok })
  console.log(`${ok ? 'PASS' : 'FALHA'}  ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
}

const navegador = await chromium.launch({ executablePath, headless: true })

async function entrar(pagina) {
  await pagina.goto(`${BASE}/?entrar=1`, { waitUntil: 'domcontentloaded' })
  await pagina.waitForTimeout(2500)
  const campoLogin = pagina.locator('input[name="emailOuWhatsapp"], input[type="email"]').first()
  await campoLogin.fill(EMAIL)
  await pagina.locator('input[name="senha"]').fill(SENHA)
  await pagina.locator('button[type="submit"]').first().click()
  await pagina.waitForURL('**/cliente', { timeout: 20000 })
}

for (const viewport of [
  { nome: 'desktop', width: 1366, height: 900 },
  { nome: 'mobile', width: 390, height: 844 },
]) {
  const contexto = await navegador.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  })
  const pagina = await contexto.newPage()

  await entrar(pagina)
  verificar(
    `[${viewport.nome}] login leva o Cliente para /cliente`,
    new URL(pagina.url()).pathname === '/cliente',
    pagina.url(),
  )

  verificar(
    `[${viewport.nome}] saudação com o nome`,
    (await pagina.getByText(/Olá, Marina/i).count()) > 0,
  )
  verificar(
    `[${viewport.nome}] situação da conta visível`,
    (await pagina.getByText(/Verificada por e-mail/i).count()) > 0,
  )
  verificar(
    `[${viewport.nome}] estado vazio de serviços`,
    (await pagina.getByText(/ainda não possui serviços contratados/i).count()) > 0,
  )

  // Nenhum vestígio das áreas de prestador ou da Gestão.
  const proibidos = [
    'Equipe',
    'Colaborações externas',
    'Meu Perfil profissional',
    'Gestão da Vincis',
    'Novo cliente',
  ]
  const encontrados = []
  for (const termo of proibidos) {
    if (await pagina.getByText(termo, { exact: false }).count()) {
      encontrados.push(termo)
    }
  }
  verificar(
    `[${viewport.nome}] nenhum item de prestador/Gestão na tela`,
    encontrados.length === 0,
    encontrados.join(', '),
  )

  await pagina.screenshot({
    path: `${DESTINO_CAPTURAS}/cliente-visao-${viewport.nome}.png`,
    fullPage: true,
  })

  // Aba Minha conta.
  await pagina.getByRole('button', { name: /Minha conta/i }).click()
  await pagina.waitForTimeout(800)
  verificar(
    `[${viewport.nome}] aba Minha conta abre com os dados`,
    (await pagina.locator('#nome').inputValue()) === 'Marina Souza',
  )
  verificar(
    `[${viewport.nome}] e-mail não editável`,
    await pagina.locator('#email').isDisabled(),
  )
  await pagina.screenshot({
    path: `${DESTINO_CAPTURAS}/cliente-conta-${viewport.nome}.png`,
    fullPage: true,
  })

  // Bloqueio por URL direta nas áreas que não são dele.
  for (const rota of ['/gestao', '/gestao/usuarios', '/admin', '/cadastro-profissional']) {
    await pagina.goto(`${BASE}${rota}`, { waitUntil: 'domcontentloaded' })
    await pagina.waitForTimeout(1500)
    const destino = new URL(pagina.url()).pathname
    verificar(
      `[${viewport.nome}] URL direta ${rota} é bloqueada`,
      destino !== rota,
      `parou em ${destino}`,
    )
  }

  // Logout.
  await pagina.goto(`${BASE}/cliente`, { waitUntil: 'domcontentloaded' })
  await pagina.waitForTimeout(1500)
  await pagina.getByRole('button', { name: /Sair/i }).click()
  await pagina.waitForTimeout(2500)
  await pagina.goto(`${BASE}/cliente`, { waitUntil: 'domcontentloaded' })
  await pagina.waitForTimeout(1500)
  verificar(
    `[${viewport.nome}] após sair, /cliente deixa de abrir`,
    new URL(pagina.url()).pathname !== '/cliente',
    new URL(pagina.url()).pathname,
  )

  await contexto.close()
}

await navegador.close()
const falhas = resultados.filter((item) => !item.ok).length
console.log(`\n${resultados.length - falhas}/${resultados.length} verificações visuais aprovadas.`)
console.log(`Capturas em ${DESTINO_CAPTURAS}`)
process.exit(falhas ? 1 : 0)
