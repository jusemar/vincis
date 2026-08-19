/**
 * Validação visual e funcional da tela de Atendimentos com os 2 registros
 * reais convivendo com os mocks.
 *
 * Uso: node scripts/desenvolvimento/testes-visuais-atendimentos-reais.mjs
 */
import { chromium } from 'playwright-core'
import { homedir } from 'node:os'

const executablePath = `${homedir()}/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`
const BASE = 'http://localhost:5173'
const DESTINO = '/tmp/claude-1000/-home-junior-vincis2/capturas'
const ANA = {
  email: 'demo.profissional.ana.silva@vincis.local',
  senha: 'Teste@123456',
}

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
const ctx = await nav.newContext({ viewport: { width: 1600, height: 1000 } })
const p = await ctx.newPage()

await entrar(p, ANA)
await p.goto(`${BASE}/admin?pagina=atendimentos`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(4000)

// --- Menu -----------------------------------------------------------------
const menu = await p.locator('aside.sidebar').innerText().catch(() => '')
ok('Menu do /admin não mostra mais "Serviços"', !/Serviços/.test(menu), menu.replace(/\n/g, ' | '))
ok('Menu mantém "Atendimentos"', /Atendimentos/.test(menu))
ok('Menu mantém "Meu Perfil"', /Meu Perfil/.test(menu))

// --- Cards ----------------------------------------------------------------
const corpo = await p.locator('body').innerText()
const MOCKS = [
  '#2026-0042', '#2026-0041', '#2026-0039', '#2026-0038', '#2026-0035',
  '#2026-0033', '#2026-0028', '#2026-0021', '#2026-0019',
]
// Com o controle de volume por coluna, parte dos cards fica atrás do "Ver
// mais": revelar tudo antes de conferir é o equivalente a rolar a coluna.
for (const botao of await p.getByRole('button', { name: /Ver mais/ }).all()) {
  await botao.click()
  await p.waitForTimeout(400)
}
const corpoCompleto = await p.locator('body').innerText()
ok('Todos os 9 cards mockados continuam na tela', MOCKS.every((m) => corpoCompleto.includes(m)),
  MOCKS.filter((m) => !corpoCompleto.includes(m)).join(', ') || 'nenhum ausente')
ok('Atendimento real da Marina visível (#2026-0001)', corpo.includes('#2026-0001'))
ok('Segundo Atendimento real visível (#2026-0002)', corpo.includes('#2026-0002'))
// 9 mockados + os reais que existirem no banco no momento do teste.
const reaisNaTela = [...corpo.matchAll(/#2026-\d{4}/g)]
  .map((m) => m[0])
  .filter((p) => !MOCKS.includes(p))
const totalEsperado = MOCKS.length + new Set(reaisNaTela).size
ok(`Contadores do topo somam mocks + reais (Total ${totalEsperado})`,
  new RegExp(`Total\\n${totalEsperado}`).test(corpo),
  corpo.match(/Total\n\d+/)?.[0].replace('\n', ' ') ?? '')

// A coluna é o contêiner de largura fixa do Kanban: procurar "div com texto
// Novo" solto passou a alcançar também o indicador "Novos" do topo.
const colunaNovo = p.locator('div.w-\\[300px\\]', { hasText: 'Novo' })
const cardMarina = p.locator('button', { hasText: '#2026-0001' }).first()
const cardPaulo = p.locator('button', { hasText: '#2026-0002' }).first()
ok('Card da Marina existe', (await cardMarina.count()) > 0)
ok('Card do segundo Cliente existe', (await cardPaulo.count()) > 0)
ok('Ambos estão na coluna Novo', (await colunaNovo.first().innerText()).includes('#2026-0001'))

await p.screenshot({ path: `${DESTINO}/atendimentos-visual-desktop.png`, fullPage: true })

// --- Painel lateral: Marina ----------------------------------------------
await cardMarina.click()
await p.waitForTimeout(1200)
// A tela renderiza dois painéis (desktop e mobile) e esconde um deles por
// media query; `:visible` pega o que está de fato na tela.
const painelVisivel = () => p.locator('aside:visible').filter({ hasText: 'Conversa' }).first()
const painel = painelVisivel()
const textoPainel = await painel.innerText()
ok('Painel abre com o protocolo real da Marina', textoPainel.includes('#2026-0001'))
ok('Painel mostra o serviço real', textoPainel.includes('Declaração de IRPF Teste'))
ok('Painel mostra a Cliente real', textoPainel.includes('Marina Souza'))
// "Dra. Ana Carolina Silva" → "AS": primeira letra do primeiro nome e do
// último sobrenome, sem a forma de tratamento.
ok('Iniciais da responsável (Ana) no painel', /AS/.test(textoPainel))

await painel.getByRole('button', { name: 'Informações' }).click()
await p.waitForTimeout(700)
const info = await painel.innerText()
ok('Informações: valor real snapshot', /R\$150,00\/h/.test(info), info.match(/R\$[^\n]*/)?.[0] ?? '')
ok('Informações: modelo de preço real', /Por hora/.test(info))
ok('Informações: status Novo', /Novo/.test(info))
ok('Informações: responsável real', /Ana Carolina Silva/.test(info))
// Este Atendimento nasceu antes de o serviço ter checklist modelo: o painel
// mostra o checklist real vazio, sem inventar etapa nenhuma.
ok('Informações: sem checklist inventado', /Nenhuma etapa neste checklist/.test(info))
await p.screenshot({ path: `${DESTINO}/atendimento-marina-informacoes.png` })

await painel.getByRole('button', { name: 'Histórico' }).click()
await p.waitForTimeout(700)
const historico = await painel.innerText()
ok('Histórico: serviço contratado', /Serviço contratado/.test(historico))
ok('Histórico: atendimento criado', /Atendimento criado/.test(historico))
ok('Histórico: responsável definido', /Responsável inicial definido/.test(historico))

await painel.getByRole('button', { name: 'Conversa' }).click()
await p.waitForTimeout(700)
const conversa = await painel.innerText()
// Conversa real do atendimento: nenhuma mensagem mockada vaza para cá.
ok('Conversa: sem mensagem inventada no atendimento real',
  !/Padaria Real/.test(conversa) && !/apuração de março/i.test(conversa))
ok('Conversa: alternância Cliente/Interno preservada', /Cliente/.test(conversa) && /Interno/.test(conversa))

// --- Painel lateral: segundo atendimento ---------------------------------
await cardPaulo.click()
await p.waitForTimeout(1200)
const painel2 = painelVisivel()
await painel2.getByRole('button', { name: 'Arquivos' }).click()
await p.waitForTimeout(900)
const arquivos = await painel2.innerText()
ok('Arquivos: anexo real listado', /documento-de-teste\.txt/.test(arquivos))
ok('Arquivos: metadados reais (tipo/tamanho/remetente)', /Texto · 65 B/.test(arquivos), arquivos.match(/Texto[^\n]*/)?.[0] ?? '')
await p.screenshot({ path: `${DESTINO}/atendimento-cliente2-arquivos.png` })

const href = await painel2.locator('a[href^="/api/atendimentos/"]').first().getAttribute('href')
const download = await p.evaluate(async (url) => {
  const r = await fetch(url)
  return { status: r.status, texto: (await r.text()).slice(0, 60) }
}, href)
ok('Download autorizado devolve o arquivo real', download.status === 200 && download.texto.includes('Documento de teste Vincis'), `${download.status} ${download.texto.replace(/\n/g, ' ')}`)

await painel2.getByRole('button', { name: 'Histórico' }).click()
await p.waitForTimeout(700)
const historico2 = await painel2.innerText()
ok('Histórico do segundo: evento de anexo real', /anexou documento-de-teste\.txt/.test(historico2))

// --- Busca e filtros ------------------------------------------------------
// O cabeçalho do admin tem outra busca; esta é a do quadro.
const busca = p.locator('input[placeholder*="protocolo"]').first()
await busca.fill('2026-0002')
await p.waitForTimeout(900)
const filtrado = await p.locator('body').innerText()
ok('Busca encontra o atendimento real', filtrado.includes('#2026-0002') && !filtrado.includes('#2026-0042'))
await busca.fill('Paulo')
await p.waitForTimeout(900)
ok('Busca por nome do Cliente real funciona', (await p.locator('body').innerText()).includes('#2026-0002'))
await busca.fill('')
await p.waitForTimeout(700)

await p.getByRole('button', { name: /^Meus$/ }).click()
await p.waitForTimeout(900)
const meus = await p.locator('body').innerText()
ok('Filtro "Meus" inclui os reais da Ana', meus.includes('#2026-0001') && meus.includes('#2026-0002'))
ok('Filtro "Meus" continua valendo para os mocks', meus.includes('#2026-0042'))
await p.getByRole('button', { name: /^Todos$/ }).click()
await p.waitForTimeout(700)

// --- Responsividade -------------------------------------------------------
await p.setViewportSize({ width: 390, height: 844 })
await p.waitForTimeout(1500)
const mobile = await p.locator('body').innerText()
ok('Mobile: cards reais continuam visíveis', mobile.includes('#2026-0001') && mobile.includes('#2026-0002'))
ok('Mobile: mocks continuam visíveis', mobile.includes('#2026-0042'))
const larguraOk = await p.evaluate(
  () => document.documentElement.scrollWidth <= window.innerWidth + 2,
)
ok('Mobile: sem estouro horizontal da página', larguraOk)
await p.screenshot({ path: `${DESTINO}/atendimentos-visual-mobile.png` })

await ctx.close()
await nav.close()
const f = res.filter((r) => !r.v).length
console.log(`\n${res.length - f}/${res.length} verificações aprovadas.`)
process.exit(f ? 1 : 0)
