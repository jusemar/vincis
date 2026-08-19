/**
 * Matriz mock × real: os dados reais usam o mesmo visual dos cards mockados?
 *
 * Para cada situação que os mocks representam — checklist pela metade, prazo
 * vencido, dois responsáveis, coluna cheia — existe agora um Atendimento real
 * equivalente. Este roteiro põe os dois lado a lado no navegador e compara o que
 * de fato foi renderizado: o texto do badge, a largura da barra, a quantidade de
 * avatares, a cor do status.
 *
 * Cobre também o que mudou de comportamento nesta etapa: o painel lateral começa
 * fechado, a paginação do quadro e da lista, o checklist real dentro do painel e
 * a solicitação formal ao Cliente.
 *
 * Uso: node scripts/desenvolvimento/testes-visuais-matriz-atendimentos.mjs
 */
import { chromium } from 'playwright-core'
import { homedir } from 'node:os'

const executablePath = `${homedir()}/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`
const BASE = 'http://localhost:5173'
const DESTINO = '/tmp/claude-1000/-home-junior-vincis2/capturas'

const ANA = { email: 'demo.profissional.ana.silva@vincis.local', senha: 'Teste@123456' }
const MARINA = { email: 'cliente.visual@vincis.local', senha: 'Teste@123456' }

const res = []
const ok = (n, v, d = '') => {
  res.push({ n, v })
  console.log(`${v ? 'PASS' : 'FALHA'}  ${n}${d ? ` — ${d}` : ''}`)
}

async function entrar(p, conta) {
  await p.goto(`${BASE}/?entrar=1`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2500)
  await p.locator('input[name="emailOuWhatsapp"], input[type="email"]').first().fill(conta.email)
  await p.locator('input[name="senha"]').fill(conta.senha)
  await p.locator('button[type="submit"]').first().click()
  await p.waitForURL(/\/(cliente|admin)/, { timeout: 30000 }).catch(() => {})
  await p.waitForTimeout(2500)
}

const abrirQuadro = async (p, extra = '') => {
  await p.goto(`${BASE}/admin?pagina=atendimentos${extra}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(6000)
}

const painel = (p) => p.locator('aside:visible').filter({ hasText: 'Protocolo' }).first()
const card = (p, numero) => p.locator('button', { hasText: numero }).first()

/** Lê do card renderizado o que dá para comparar entre mock e real. */
const lerCard = (p, numero) =>
  p.evaluate((n) => {
    // O card é o botão com sombra do quadro; o primeiro `span` dele é a barra
    // de prioridade, então a busca é pelo texto.
    const alvo = [...document.querySelectorAll('button[class*="shadow-card"]')].find((b) =>
      b.textContent?.includes(n),
    )
    if (!alvo) return null
    const barra = alvo.querySelector('div[style*="width"]')
    const rotulos = [...alvo.querySelectorAll('span')].map((s) => s.textContent?.trim())
    const avatares = [...alvo.querySelectorAll('div[class*="rounded-full"]')]
      .filter((d) => /^[A-Z]{2}$/.test(d.textContent?.trim() ?? ''))
      .map((d) => ({
        iniciais: d.textContent.trim(),
        cor: getComputedStyle(d).backgroundColor,
      }))
    return {
      progresso: rotulos.find((t) => /^\d+\/\d+$/.test(t ?? '')) ?? null,
      larguraBarra: barra?.style.width ?? null,
      prazo: rotulos.find((t) => /Vence|Vencido|restantes|Sem prazo/.test(t ?? '')) ?? null,
      classesPrazo:
        [...alvo.querySelectorAll('span')].find((s) =>
          /Vence|Vencido|restantes|Sem prazo/.test(s.textContent?.trim() ?? ''),
        )?.className ?? '',
      avatares,
      contadores: [...alvo.querySelectorAll('span[class*="inline-flex"]')]
        .map((s) => s.textContent?.trim())
        .filter((t) => /^\d+$/.test(t ?? '')),
    }
  }, numero)

const nav = await chromium.launch({ executablePath, headless: true })
const ctxAna = await nav.newContext({ viewport: { width: 1600, height: 1000 } })
const ana = await ctxAna.newPage()
await entrar(ana, ANA)

// ───────────────── 1. Painel começa fechado ─────────────────
await abrirQuadro(ana)
ok('Nenhum atendimento selecionado ao abrir a tela', (await painel(ana).count()) === 0)

await card(ana, '#2026-0004').click()
await ana.waitForTimeout(1500)
ok('Clicar no card abre o painel', (await painel(ana).count()) === 1)

await painel(ana).getByRole('button', { name: 'Fechar painel' }).click()
await ana.waitForTimeout(900)
ok('Fechar o painel mantém ele fechado', (await painel(ana).count()) === 0)

await abrirQuadro(ana)
ok('Refresh sem deep-link mantém o painel fechado', (await painel(ana).count()) === 0)

await abrirQuadro(ana, '&atendimento=%232026-0004')
ok(
  'Deep-link explícito abre o Atendimento pedido',
  (await painel(ana).count()) === 1 &&
    /#2026-0004/.test(await painel(ana).innerText()),
)

// ───────────────── 2. Matriz mock × real ─────────────────
await abrirQuadro(ana)

const mockVencido = await lerCard(ana, '#2026-0042')
const realVencido = await lerCard(ana, '#2026-0005')
ok(
  'Vencido há 1 dia: mock e real com o mesmo texto',
  mockVencido.prazo === 'Vencido há 1 dia' && realVencido.prazo === 'Vencido há 1 dia',
  `${mockVencido.prazo} · ${realVencido.prazo}`,
)
ok(
  'Vencido há 1 dia: mesmo badge visual',
  mockVencido.classesPrazo === realVencido.classesPrazo,
)

const mockParcial = await lerCard(ana, '#2026-0038')
const realParcial = await lerCard(ana, '#2026-0004')
ok(
  'Checklist 4/7: mock e real com a mesma contagem',
  mockParcial.progresso === '4/7' && realParcial.progresso === '4/7',
  `${mockParcial.progresso} · ${realParcial.progresso}`,
)
ok(
  'Checklist 4/7: barra com a mesma largura proporcional',
  mockParcial.larguraBarra === realParcial.larguraBarra,
  `${mockParcial.larguraBarra} · ${realParcial.larguraBarra}`,
)

const realCompleto = await lerCard(ana, '#2026-0007')
ok('Checklist completo real (5/5)', realCompleto.progresso === '5/5', realCompleto.progresso)

const mockDuplo = await lerCard(ana, '#2026-0042')
ok(
  'Dois responsáveis: mock com dois círculos',
  mockDuplo.avatares.length === 2,
  mockDuplo.avatares.map((a) => a.iniciais).join('+'),
)
ok(
  'Dois responsáveis: real com dois círculos, iniciais corretas e cores diferentes',
  realParcial.avatares.length === 2 &&
    realParcial.avatares.map((a) => a.iniciais).join('+') === 'AS+RM' &&
    realParcial.avatares[0].cor !== realParcial.avatares[1].cor,
  realParcial.avatares.map((a) => `${a.iniciais}:${a.cor}`).join(' '),
)

const realVenceAmanha = await lerCard(ana, '#2026-0004')
const realRestantes = await lerCard(ana, '#2026-0006')
const realSemPrazo = await lerCard(ana, '#2026-0010')
ok('Vence amanhã real', realVenceAmanha.prazo === 'Vence amanhã', realVenceAmanha.prazo)
ok('X dias restantes real', /dias restantes/.test(realRestantes.prazo), realRestantes.prazo)
ok('Sem prazo definido real', realSemPrazo.prazo === 'Sem prazo definido', realSemPrazo.prazo)

const corpoQuadro = await ana.locator('main').last().innerText()
for (const [rotulo, protocolo] of [
  ['Novo', '#2026-0010'],
  ['Em andamento', '#2026-0004'],
  ['Aguardando cliente', '#2026-0005'],
  ['Aguardando assinatura', '#2026-0006'],
]) {
  ok(`Coluna ${rotulo} tem Atendimento real`, corpoQuadro.includes(protocolo))
}
await ana.locator('button', { hasText: 'Concluído' }).first().click()
await ana.waitForTimeout(1200)
ok(
  'Concluído real aparece no filtro de Status',
  (await ana.locator('main').last().innerText()).includes('#2026-0007'),
)
await ana.locator('button', { hasText: 'Concluído' }).first().click()
await ana.waitForTimeout(1000)

// Cores de status: a bolinha da coluna e o badge do card falam a mesma língua.
const coresStatus = await ana.evaluate(() => {
  const coluna = [...document.querySelectorAll('h3')].find((h) => h.textContent === 'Novo')
  const ponto = coluna?.previousElementSibling
  return ponto ? getComputedStyle(ponto).backgroundColor : null
})
ok('Coluna Novo usa a cor central do status', coresStatus === 'rgb(0, 102, 255)', String(coresStatus))

await ana.screenshot({ path: `${DESTINO}/matriz-kanban.png` })

// ───────────────── 3. Paginação ─────────────────
const verMais = ana.getByRole('button', { name: /Ver mais/ }).first()
const tinhaVerMais = (await verMais.count()) > 0
const antesDoVerMais = (await ana.locator('main').last().innerText()).match(/#\d{4}-\d{4}/g)
    ?.length ?? 0
if (tinhaVerMais) {
  await verMais.click()
  await ana.waitForTimeout(900)
}
const depoisDoVerMais = (await ana.locator('main').last().innerText()).match(/#\d{4}-\d{4}/g)
    ?.length ?? 0
ok(
  'Kanban revela mais cards sob demanda, sem duplicar',
  tinhaVerMais && depoisDoVerMais > antesDoVerMais,
  `${antesDoVerMais} → ${depoisDoVerMais}`,
)

await ana.locator('button[aria-label="Visualização em lista"]').click()
await ana.waitForTimeout(1200)
const paginaUm = await ana.evaluate(() => {
  const linhas = [...document.querySelectorAll('tbody tr')].map(
    (tr) => tr.querySelector('td')?.textContent?.trim(),
  )
  return { linhas, rodape: document.body.innerText.match(/Mostrando [^\n]*/)?.[0] }
})
ok('Lista pagina em 10 linhas', paginaUm.linhas.length === 10, paginaUm.rodape)

const indicadorTotal = await ana.evaluate(
  () => document.querySelector('[data-indicador="Total"]')?.querySelectorAll('div')[1]?.textContent,
)
ok(
  'Indicador conta o conjunto inteiro, não a página',
  Number(indicadorTotal) > 10,
  `Total ${indicadorTotal} · página com ${paginaUm.linhas.length}`,
)

await ana.getByRole('button', { name: 'Próxima' }).click()
await ana.waitForTimeout(900)
const paginaDois = await ana.evaluate(() =>
  [...document.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('td')?.textContent?.trim()),
)
const repetidos = paginaDois.filter((n) => paginaUm.linhas.includes(n))
ok('Página 2 traz outros atendimentos', paginaDois.length > 0 && repetidos.length === 0)
await ana.screenshot({ path: `${DESTINO}/matriz-lista-pagina2.png` })

await ana.locator('input[placeholder*="Buscar por cliente"]').first().fill('Marina')
await ana.waitForTimeout(1000)
const comBusca = await ana.evaluate(() => ({
  linhas: [...document.querySelectorAll('tbody tr')].length,
  rodape: document.body.innerText.match(/Mostrando [^\n]*/)?.[0],
  total: document.querySelector('[data-indicador="Total"]')?.querySelectorAll('div')[1]?.textContent,
}))
ok(
  'Busca reinicia a paginação e os contadores acompanham',
  comBusca.rodape?.startsWith('Mostrando 1–') && comBusca.linhas === Number(comBusca.total),
  `${comBusca.rodape} · Total ${comBusca.total}`,
)
await ana.locator('input[placeholder*="Buscar por cliente"]').first().fill('')
await ana.waitForTimeout(900)
await ana.locator('button[aria-label="Visualização em quadro"]').click()
await ana.waitForTimeout(900)

// ───────────────── 4. Checklist real no painel ─────────────────
await card(ana, '#2026-0004').click()
await ana.waitForTimeout(1500)
await painel(ana).getByRole('button', { name: 'Informações', exact: true }).click()
await ana.waitForTimeout(1000)
const infoAntes = await painel(ana).innerText()
ok('Painel mostra o checklist real do Atendimento', /Receber documentos do cliente/.test(infoAntes))
ok('Contagem do checklist no painel', /4\/7/.test(infoAntes), infoAntes.match(/\d\/\d/)?.[0])

await painel(ana).locator('input[placeholder="Nova etapa…"]').fill('Conferir procuração')
await painel(ana).getByRole('button', { name: 'Adicionar' }).click()
await ana.waitForTimeout(3000)
ok(
  'Equipe acrescenta etapa e o total sobe',
  /Conferir procuração/.test(await painel(ana).innerText()) &&
    /4\/8/.test(await painel(ana).innerText()),
)

const etapaNova = painel(ana).locator('button', { hasText: 'Conferir procuração' }).first()
await etapaNova.click()
await ana.waitForTimeout(3000)
ok('Marcar etapa atualiza o progresso', /5\/8/.test(await painel(ana).innerText()))

const cardDepois = await lerCard(ana, '#2026-0004')
ok('Barra do card acompanha o checklist real', cardDepois.progresso === '5/8', cardDepois.progresso)

// Desfaz o que o teste acrescentou, para a matriz continuar valendo 4/7.
await etapaNova.click()
await ana.waitForTimeout(2500)
await painel(ana)
  .locator('div', { hasText: 'Conferir procuração' })
  .last()
  .getByRole('button', { name: 'Remover etapa' })
  .click()
await ana.waitForTimeout(3000)
ok('Etapa removida devolve a contagem original', /4\/7/.test(await painel(ana).innerText()))

// ───────────────── 5. Solicitar ao cliente ─────────────────
await abrirQuadro(ana)
await card(ana, '#2026-0002').click()
await ana.waitForTimeout(1500)

/** Escolhe uma transição no menu de status do painel. */
async function transicionar(p, rotulo) {
  await painel(p).getByRole('button', { name: 'Alterar status' }).click()
  await p.waitForTimeout(700)
  await p.getByRole('menuitem', { name: rotulo }).click()
  await p.waitForTimeout(3500)
}

// O roteiro pode ter rodado antes e deixado este Atendimento aguardando o
// Cliente: retomar primeiro deixa o cenário do jeito que o teste espera.
if (/Aguardando cliente/.test(await painel(ana).innerText())) {
  await transicionar(ana, 'Retomar atendimento')
}
ok('Atendimento começa em Em andamento', /Em andamento/.test(await painel(ana).innerText()))

await painel(ana).getByRole('button', { name: 'Alterar status' }).click()
await ana.waitForTimeout(800)
await ana.getByRole('menuitem', { name: 'Solicitar ao cliente' }).click()
await ana.waitForTimeout(1200)
const composer = await painel(ana).innerText()
ok(
  'Solicitar ao cliente abre o Protocolo em modo de solicitação',
  /Criar etapa no checklist/.test(composer) && /Aguardando cliente/.test(composer),
)

await painel(ana)
  .locator('textarea')
  .first()
  .fill('Envie o comprovante de endereço atualizado e a última guia paga.')
await painel(ana).getByRole('button', { name: 'Solicitar' }).click()
await ana.waitForTimeout(4000)
const depoisDaSolicitacao = await painel(ana).innerText()
ok(
  'Solicitação vira manifestação no Protocolo',
  /comprovante de endereço atualizado/.test(depoisDaSolicitacao),
)
ok('Atendimento passa para Aguardando cliente', /Aguardando cliente/.test(depoisDaSolicitacao))

await painel(ana).getByRole('button', { name: 'Informações', exact: true }).click()
await ana.waitForTimeout(1200)
ok(
  'Solicitação vira etapa pendente no checklist',
  /comprovante de endereço atualizado/.test(await painel(ana).innerText()),
)

await painel(ana).getByRole('button', { name: 'Histórico', exact: true }).click()
await ana.waitForTimeout(900)
ok(
  'Histórico registra a solicitação e a etapa',
  /Solicitação enviada ao Cliente/.test(await painel(ana).innerText()),
)

// Depois de conferir o que o Cliente mandou, quem retoma é a equipe — e é
// isso que devolve o Atendimento ao estado em que o roteiro o encontrou.
await transicionar(ana, 'Retomar atendimento')
ok(
  'Equipe retoma o atendimento depois de conferir',
  /Em andamento/.test(await painel(ana).innerText()),
)

// ───────────────── 6. Área do Cliente ─────────────────
const ctxMarina = await nav.newContext({ viewport: { width: 1366, height: 900 } })
const marina = await ctxMarina.newPage()
await entrar(marina, MARINA)
await marina.goto(`${BASE}/cliente`, { waitUntil: 'domcontentloaded' })
await marina.waitForTimeout(3000)
await marina.getByRole('button', { name: /Atendimentos/i }).first().click()
await marina.waitForTimeout(1500)
await marina.locator('button', { hasText: '#2026-0004' }).first().click()
await marina.waitForTimeout(1500)
await marina.getByRole('button', { name: 'Informações', exact: true }).click()
await marina.waitForTimeout(1200)
const infoCliente = await marina.locator('body').innerText()
ok('Cliente vê o andamento em etapas', /Andamento do serviço/.test(infoCliente))
ok('Cliente vê a contagem do checklist público', /4\/7/.test(infoCliente), infoCliente.match(/\d\/\d/)?.[0])
ok('Cliente vê a etapa concluída', /Receber documentos do cliente/.test(infoCliente))
ok(
  'Cliente não tem controle do checklist',
  (await marina.locator('input[placeholder="Nova etapa…"]').count()) === 0 &&
    (await marina.getByRole('button', { name: 'Adicionar' }).count()) === 0,
)
ok('Cliente vê prazo e prioridade reais', /Prazo/.test(infoCliente) && /Prioridade/.test(infoCliente))
await marina.screenshot({ path: `${DESTINO}/matriz-cliente.png`, fullPage: true })

// ───────────────── 7. Mocks preservados ─────────────────
await abrirQuadro(ana)
const corpoFinal = await ana.locator('main').last().innerText()
const MOCKS = [
  '#2026-0042', '#2026-0041', '#2026-0039', '#2026-0038', '#2026-0035',
  '#2026-0033', '#2026-0028', '#2026-0021', '#2026-0019',
]
// Com a paginação por coluna, parte dos mocks fica atrás do "Ver mais": a
// conferência é feita na Lista, que mostra o conjunto inteiro por páginas.
await ana.locator('button[aria-label="Visualização em lista"]').click()
await ana.waitForTimeout(1000)
const naLista = new Set()
for (let pagina = 1; pagina <= 3; pagina += 1) {
  const numeros = await ana.evaluate(() =>
    [...document.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('td')?.textContent?.trim()),
  )
  numeros.forEach((n) => naLista.add(n))
  const proxima = ana.getByRole('button', { name: 'Próxima' })
  if (await proxima.isEnabled()) {
    await proxima.click()
    await ana.waitForTimeout(800)
  }
}
ok(
  'Os 9 cards mockados continuam na tela',
  MOCKS.every((m) => naLista.has(m)),
  MOCKS.filter((m) => !naLista.has(m)).join(', ') || 'nenhum ausente',
)
ok(
  'Os Atendimentos reais originais seguem preservados',
  ['#2026-0001', '#2026-0002', '#2026-0003'].every((m) => naLista.has(m)),
)
ok('Corpo do quadro carregou normalmente', corpoFinal.length > 0)

await nav.close()

const falhas = res.filter((r) => !r.v)
console.log(`\n${res.length - falhas.length}/${res.length} verificações aprovadas`)
if (falhas.length) {
  console.log('Falhas:')
  for (const f of falhas) console.log(` - ${f.n}`)
  process.exit(1)
}
