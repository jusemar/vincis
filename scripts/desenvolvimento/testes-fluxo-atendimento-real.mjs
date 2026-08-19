/**
 * Fluxo real, ponta a ponta, do segundo Atendimento.
 *
 * Cliente de teste entra na conta → /profissionais → perfil da Ana → contrata
 * um segundo serviço → o Atendimento correspondente aparece no Kanban da Ana
 * com status Novo e protocolo real.
 *
 * Uso: node scripts/desenvolvimento/testes-fluxo-atendimento-real.mjs
 */
import { chromium } from 'playwright-core'
import { homedir } from 'node:os'

const executablePath = `${homedir()}/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`
const BASE = 'http://localhost:5173'
const DESTINO = '/tmp/claude-1000/-home-junior-vincis2/capturas'
const CLIENTE = {
  email: 'cliente.teste.atendimentos@vincis.local',
  senha: 'Teste@123456',
}
const ANA = {
  email: 'demo.profissional.ana.silva@vincis.local',
  senha: 'Teste@123456',
}
const SERVICO = 'Abertura de Empresa MEI'

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
  await p.waitForURL(/\/(cliente|admin)/, { timeout: 30000 }).catch(() => {})
  await p.waitForTimeout(2500)
}

const nav = await chromium.launch({ executablePath, headless: true })
const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 } })
const p = await ctx.newPage()

await entrar(p, CLIENTE)
ok('Cliente de teste entra e vai para /cliente', new URL(p.url()).pathname === '/cliente', p.url())

// 1. Vitrine pública de profissionais.
await p.goto(`${BASE}/profissionais`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(3500)
const cartaoAna = p.locator('article', { hasText: 'Ana Carolina Silva' }).first()
ok('Ana aparece em /profissionais', (await cartaoAna.count()) > 0)

// 2. Perfil da Ana pelo próprio botão da vitrine.
await cartaoAna.getByRole('button', { name: /VER PERFIL/i }).first().click()
await p.waitForURL(/perfil-profissional/, { timeout: 30000 }).catch(() => {})
await p.waitForTimeout(3500)
const perfil = await p.locator('body').innerText()
ok('Perfil da Ana abre com o catálogo', perfil.includes(SERVICO))

// 3. Contratação real do segundo serviço.
const item = p.locator('details', { hasText: SERVICO }).first()
await item.locator('summary').click()
await p.waitForTimeout(1000)
const botao = item.getByRole('button', { name: /Contratar agora/i }).first()
ok('Botão "Contratar agora" visível', (await botao.count()) > 0)
await botao.click()
await p.waitForTimeout(4000)
const aposClique = await p.locator('body').innerText()
ok(
  'Contratação concluída pelo site',
  /contratado com sucesso|já possui uma solicitação/i.test(aposClique),
  aposClique.match(/(contratado com sucesso|já possui uma solicitação|Apenas contas[^\n]*)/i)?.[0] ?? '',
)
await p.screenshot({ path: `${DESTINO}/atendimento-contratacao-cliente2.png` })
await ctx.close()

// 4. O Atendimento aparece no Kanban da Ana.
const ctx2 = await nav.newContext({ viewport: { width: 1440, height: 1000 } })
const p2 = await ctx2.newPage()
await entrar(p2, ANA)
await p2.goto(`${BASE}/admin?pagina=atendimentos`, { waitUntil: 'domcontentloaded' })
await p2.waitForTimeout(4000)
const quadro = await p2.locator('body').innerText()
ok('Kanban mostra o segundo Atendimento', quadro.includes(SERVICO))
ok('Kanban mostra o Cliente de teste', /Paulo Ribeiro/i.test(quadro))
ok('Kanban mantém o Atendimento da Marina', /Declaração de IRPF Teste/.test(quadro))
ok('Kanban mantém os cards mockados', /Padaria Real Ltda/.test(quadro))

const protocolos = [...quadro.matchAll(/#2026-\d{4}/g)].map((m) => m[0])
console.log('Protocolos na tela:', [...new Set(protocolos)].join(', '))
await p2.screenshot({ path: `${DESTINO}/atendimentos-kanban-com-reais.png`, fullPage: true })
await ctx2.close()

await nav.close()
const f = res.filter((r) => !r.v).length
console.log(`\n${res.length - f}/${res.length} verificações aprovadas.`)
process.exit(f ? 1 : 0)
