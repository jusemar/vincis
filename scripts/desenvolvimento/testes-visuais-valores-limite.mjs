/**
 * Valida no navegador: salvar Valor por hora, limite de 5 e Admin → Serviços.
 * Uso: node scripts/desenvolvimento/testes-visuais-valores-limite.mjs
 */
import { chromium } from 'playwright-core'
import { homedir } from 'node:os'

const executablePath = `${homedir()}/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`
const BASE = 'http://localhost:5173'
const DESTINO = '/tmp/claude-1000/-home-junior-vincis2/capturas'
// Especialista fiscal: cadastro completo (não exige OAB/CRC), serve ao
// caminho de sucesso. As contas reguladas do seed estão sem registro gravado.
const EMAIL = process.env.EMAIL_TESTE ?? 'demo.profissional.ana.silva@vincis.local'
const SENHA = 'Teste@123456'

const res = []
const ok = (n, v, d = '') => { res.push({ n, v }); console.log(`${v ? 'PASS' : 'FALHA'}  ${n}${d ? ` — ${d}` : ''}`) }

const nav = await chromium.launch({ executablePath, headless: true })

for (const vp of [
  { nome: 'desktop', width: 1440, height: 1000 },
  { nome: 'mobile', width: 390, height: 844 },
]) {
  const ctx = await nav.newContext({ viewport: { width: vp.width, height: vp.height } })
  const p = await ctx.newPage()

  await p.goto(`${BASE}/?entrar=1`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2500)
  await p.locator('input[name="emailOuWhatsapp"], input[type="email"]').first().fill(EMAIL)
  await p.locator('input[name="senha"]').fill(SENHA)
  await p.locator('button[type="submit"]').first().click()
  await p.waitForURL('**/admin**', { timeout: 25000 })

  // Admin → Serviços: botão removido.
  await p.goto(`${BASE}/admin?pagina=services`, { waitUntil: 'domcontentloaded' })
  await p.getByText('Gerencie seus serviços avulsos.').waitFor({ timeout: 30000 }).catch(() => {})
  await p.waitForTimeout(1200)
  const admin = await p.locator('body').innerText()
  ok(`[${vp.nome}] Admin Serviços SEM botão Novo Serviço`,
    (await p.getByRole('button', { name: /Novo Serviço/i }).count()) === 0)
  ok(`[${vp.nome}] título e subtítulo preservados`,
    admin.includes('Serviços') && admin.includes('Gerencie seus serviços avulsos.'))
  ok(`[${vp.nome}] colunas preservadas`,
    ['Serviço','Cliente','Valor','Prazo','Status','Ações'].every((c) => admin.includes(c)))
  if (vp.nome === 'desktop') await p.screenshot({ path: `${DESTINO}/admin-servicos-sem-botao.png`, fullPage: true })

  // Meu Perfil → Valores: salvar valor/hora.
  await p.goto(`${BASE}/admin?pagina=profile`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(4000)
  await p.getByRole('tab', { name: /Valores/i }).click()
  await p.waitForTimeout(1200)
  const campo = p.locator('input[name="valorHora"]').first()
  if (await campo.count()) {
    await campo.fill('365')
    await p.getByRole('button', { name: /Salvar alterações/i }).click()
    // Aguarda o toast aparecer em vez de torcer por um tempo fixo: o Sonner
    // some sozinho e a leitura de innerText corria com o auto-dismiss.
    const toastSucesso = p.getByText(/atualizado com sucesso/i).first()
    const apareceu = await toastSucesso
      .waitFor({ timeout: 20000 })
      .then(() => true)
      .catch(() => false)
    const corpo = await p.locator('body').innerText()
    if (vp.nome === 'desktop') await p.screenshot({ path: `${DESTINO}/valores-apos-salvar.png` })
    console.log('   [debug toast/erro]', (corpo.match(/(atualizado com sucesso|Informe[^\n]*|não podem[^\n]*|Revise[^\n]*)/i) ?? ['nenhum'])[0])
    ok(`[${vp.nome}] salvar valor/hora não acusa CEP`, !/CEP/i.test(corpo), corpo.match(/CEP[^\n]*/)?.[0] ?? '')
    ok(`[${vp.nome}] toast de sucesso aparece`, apareceu)
  } else {
    ok(`[${vp.nome}] campo valorHora encontrado`, false)
  }

  // Meu Perfil → Serviços: contador do limite.
  await p.goto(`${BASE}/admin?pagina=profile&aba=servicos`, { waitUntil: 'domcontentloaded' })
  await p.getByText(/de 5 serviços|limite de 5 serviços/i).first().waitFor({ timeout: 30000 }).catch(() => {})
  await p.waitForTimeout(1200)
  const cat = await p.locator('body').innerText()
  ok(`[${vp.nome}] contador "de 5" presente`, /de 5 serviços|limite de 5 serviços/i.test(cat),
    (cat.match(/Meus serviços[\s\S]{0,120}/) ?? [''])[0].replace(/\n/g, ' | '))

  // Endereço continua bloqueado após a aprovação.
  await p.goto(`${BASE}/admin?pagina=profile`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(4000)
  const cepInput = p.locator('input[name="cep"]').first()
  ok(`[${vp.nome}] CEP continua bloqueado`, await cepInput.isDisabled())
  ok(`[${vp.nome}] CEP tem valor preenchido`, ((await cepInput.inputValue()) ?? '').length === 8,
    await cepInput.inputValue())
  if (vp.nome === 'desktop') await p.screenshot({ path: `${DESTINO}/meu-perfil-servicos-limite.png`, fullPage: true })

  await ctx.close()
}

await nav.close()
const f = res.filter((r) => !r.v).length
console.log(`\n${res.length - f}/${res.length} verificações aprovadas.`)
process.exit(f ? 1 : 0)
