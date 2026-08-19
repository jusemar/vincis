/**
 * Fluxo real de contratação pelo navegador, com conta Cliente de verdade.
 * Uso: node scripts/desenvolvimento/testes-visuais-contratacao-real.mjs
 */
import { chromium } from 'playwright-core'
import { homedir } from 'node:os'

const executablePath = `${homedir()}/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`
const BASE = 'http://localhost:5173'
const DESTINO = '/tmp/claude-1000/-home-junior-vincis2/capturas'
const CLIENTE = { email: 'cliente.visual@vincis.local', senha: 'Teste@123456' }
const ANA = { email: 'demo.profissional.ana.silva@vincis.local', senha: 'Teste@123456' }
const ANA_ID = '706b616e-6d38-4aa0-a40d-8c8cdedafb1a'

const res = []
const ok = (n, v, d = '') => {
  res.push({ n, v })
  console.log(`${v ? 'PASS' : 'FALHA'}  ${n}${d ? ` — ${d}` : ''}`)
}

async function entrar(p, conta) {
  await p.goto(`${BASE}/?entrar=1`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2500)
  await p
    .locator('input[name="emailOuWhatsapp"], input[type="email"]')
    .first()
    .fill(conta.email)
  await p.locator('input[name="senha"]').fill(conta.senha)
  await p.locator('button[type="submit"]').first().click()
  // Espera o redirecionamento concluir de fato, em vez de um tempo fixo.
  await p.waitForURL(/\/(cliente|admin)/, { timeout: 30000 }).catch(() => {})
  await p.waitForTimeout(2500)
}

const nav = await chromium.launch({ executablePath, headless: true })

for (const vp of [
  { nome: 'desktop', width: 1440, height: 1000 },
  { nome: 'mobile', width: 390, height: 844 },
]) {
  const ctx = await nav.newContext({ viewport: { width: vp.width, height: vp.height } })
  const p = await ctx.newPage()

  await entrar(p, CLIENTE)
  ok(`[${vp.nome}] Cliente vai para /cliente`, new URL(p.url()).pathname === '/cliente', p.url())

  await p.goto(`${BASE}/perfil-profissional?prestador=${ANA_ID}`, {
    waitUntil: 'domcontentloaded',
  })
  await p.waitForTimeout(3500)
  const perfil = await p.locator('body').innerText()
  ok(`[${vp.nome}] perfil mostra o catálogo da Ana`, perfil.includes('Declaração de IRPF Teste'))

  const item = p.locator('details', { hasText: 'Declaração de IRPF Teste' }).first()
  await item.locator('summary').click()
  await p.waitForTimeout(900)

  const botao = item
    .getByRole('button', { name: /Contratar agora|Agendar consultoria|Solicitar orçamento/i })
    .first()
  ok(`[${vp.nome}] botão de contratação visível`, (await botao.count()) > 0)
  await botao.click()
  await p.waitForTimeout(3500)
  const aposClique = await p.locator('body').innerText()
  ok(`[${vp.nome}] NÃO aparece "Apenas contas de Cliente"`, !/Apenas contas de Cliente/i.test(aposClique))
  ok(
    `[${vp.nome}] contratação confirmada`,
    /contratado com sucesso|já possui uma solicitação/i.test(aposClique),
    aposClique.match(/(contratado com sucesso|já possui uma solicitação|Apenas contas[^\n]*)/i)?.[0] ?? '',
  )
  if (vp.nome === 'desktop') await p.screenshot({ path: `${DESTINO}/contratacao-real.png` })

  await p.goto(`${BASE}/cliente`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(3000)
  const areaCliente = await p.locator('body').innerText()
  ok(`[${vp.nome}] /cliente lista o serviço contratado`, areaCliente.includes('Declaração de IRPF Teste'))
  ok(`[${vp.nome}] estado vazio desapareceu`, !/ainda não possui serviços contratados/i.test(areaCliente))

  await ctx.close()

  const ctx2 = await nav.newContext({ viewport: { width: vp.width, height: vp.height } })
  const p2 = await ctx2.newPage()
  await entrar(p2, ANA)
  await p2.goto(`${BASE}/admin?pagina=services`, { waitUntil: 'domcontentloaded' })
  // A tabela carrega por Server Action; aguarda o dado aparecer.
  await p2
    .getByText('Declaração de IRPF Teste')
    .first()
    .waitFor({ timeout: 30000 })
    .catch(() => {})
  await p2.waitForTimeout(1500)
  const admin = await p2.locator('body').innerText()
  ok(`[${vp.nome}] Admin da Ana mostra a contratação`, admin.includes('Declaração de IRPF Teste'))
  ok(`[${vp.nome}] com o Cliente correto`, /Marina Souza/i.test(admin))
  ok(`[${vp.nome}] status Pendente`, /Pendente/i.test(admin))
  if (vp.nome === 'desktop') {
    await p2.screenshot({ path: `${DESTINO}/admin-com-contratacao.png`, fullPage: true })
  }
  await ctx2.close()
}

await nav.close()
const f = res.filter((r) => !r.v).length
console.log(`\n${res.length - f}/${res.length} verificações aprovadas.`)
process.exit(f ? 1 : 0)
