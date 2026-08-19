/**
 * Correções pontuais do módulo de Atendimentos, verificadas no navegador.
 *
 * Cobre o que só aparece na tela de verdade: o painel lateral cabendo na
 * viewport de um notebook, as cinco abas acessíveis, a busca por nome, por
 * protocolo e por código do Cliente com os indicadores acompanhando o recorte,
 * e prioridade/prazo sendo decididos pela equipe e apenas lidos pelo Cliente.
 *
 * Usa os Atendimentos reais (#2026-0001, #2026-0002 e #2026-0003) e não cria
 * nem apaga nada além das alterações de prioridade e prazo que os próprios
 * testes pedem.
 *
 * Uso: node scripts/desenvolvimento/testes-visuais-correcoes-atendimentos.mjs
 */
import { chromium } from 'playwright-core'
import { homedir } from 'node:os'

const executablePath = `${homedir()}/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`
const BASE = 'http://localhost:5173'
const DESTINO = '/tmp/claude-1000/-home-junior-vincis2/capturas'

const ANA = { email: 'demo.profissional.ana.silva@vincis.local', senha: 'Teste@123456' }
const MARINA = { email: 'cliente.visual@vincis.local', senha: 'Teste@123456' }
const PAULO = { email: 'cliente.teste.atendimentos@vincis.local', senha: 'Teste@123456' }

const CODIGO_MARINA = 'CLI-915B956F'
/** Atendimentos reais de cada Cliente, do cenário de desenvolvimento. */
const DA_MARINA = ['#2026-0001', '#2026-0003', '#2026-0004', '#2026-0006', '#2026-0008', '#2026-0010']
const DO_PAULO = ['#2026-0002', '#2026-0005', '#2026-0007', '#2026-0009']
const NOTEBOOK = { width: 1366, height: 768 }

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

async function abrirQuadro(p) {
  await p.goto(`${BASE}/admin?pagina=atendimentos`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(5000)
}

const buscar = async (p, termo) => {
  const campo = p.locator('input[placeholder*="Buscar por cliente"]').first()
  await campo.fill(termo)
  await p.waitForTimeout(900)
}

const indicadores = (p) =>
  p.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('[data-indicador]')].map((el) => [
        el.getAttribute('data-indicador'),
        Number(el.querySelectorAll('div')[1]?.textContent?.trim()),
      ]),
    ),
  )

/**
 * Protocolos visíveis no quadro ou na lista, sem repetir.
 *
 * Lê só a área dos cards (`main`): o painel lateral fica fora dela e continua
 * mostrando o atendimento aberto mesmo quando a busca esconde o card dele.
 */
const protocolosVisiveis = (p) =>
  p.evaluate(() => {
    // O quadro é o último `main` da página: o primeiro é a moldura do painel
    // administrativo, que engloba também o drawer lateral.
    const area = [...document.querySelectorAll('main')].pop()
    const achados = (area?.innerText ?? '').match(/#\d{4}-\d{4}/g) ?? []
    return [...new Set(achados)]
  })

const nav = await chromium.launch({ executablePath, headless: true })

// ───────────────────── 1. Painel lateral em notebook ─────────────────────
const ctxAna = await nav.newContext({ viewport: NOTEBOOK })
const ana = await ctxAna.newPage()
await entrar(ana, ANA)
await abrirQuadro(ana)

await ana.locator('button', { hasText: '#2026-0003' }).first().click()
await ana.waitForTimeout(1500)

const painel = () => ana.locator('aside:visible').filter({ hasText: 'Protocolo' }).first()
const caixaPainel = await painel().boundingBox()
ok(
  'Painel inteiro dentro da viewport do notebook',
  caixaPainel.y + caixaPainel.height <= NOTEBOOK.height,
  `fim=${Math.round(caixaPainel.y + caixaPainel.height)} de ${NOTEBOOK.height}`,
)
ok('Cabeçalho do painel visível', await painel().getByText('#2026-0003').first().isVisible())

// As cinco abas, cada uma visível dentro da largura do painel e clicável.
for (const aba of ['Protocolo', 'Conversa', 'Arquivos', 'Histórico', 'Informações']) {
  const botao = painel().getByRole('button', { name: aba, exact: true }).first()
  const caixa = await botao.boundingBox()
  const dentro =
    caixa !== null &&
    caixa.x >= caixaPainel.x - 1 &&
    caixa.x + caixa.width <= caixaPainel.x + caixaPainel.width + 1
  await botao.click()
  await ana.waitForTimeout(700)
  ok(`Aba ${aba} visível e utilizável`, dentro && (await botao.isVisible()))
}

await painel().getByRole('button', { name: 'Conversa', exact: true }).click()
await ana.waitForTimeout(800)
const rolavel = await painel().evaluate((el) => {
  const area = [...el.querySelectorAll('div')].find(
    (d) => getComputedStyle(d).overflowY === 'auto' && d.clientHeight > 0,
  )
  return Boolean(area)
})
ok('Conteúdo central tem rolagem própria', rolavel)

const enviar = painel().getByRole('button', { name: /Enviar/i }).first()
const caixaEnviar = await enviar.boundingBox()
ok(
  'Composer inteiro dentro da tela',
  caixaEnviar.y + caixaEnviar.height <= NOTEBOOK.height,
  `fim=${Math.round(caixaEnviar.y + caixaEnviar.height)}`,
)
// O botão nasce desabilitado (sem texto não há o que enviar). Com o rascunho
// escrito ele fica ativo, e aí dá para conferir o que interessa: está na tela e
// nada está por cima dele. O rascunho é apagado em seguida, sem enviar nada.
await painel().locator('textarea').first().fill('rascunho de conferência')
await ana.waitForTimeout(400)
const alcancavel = await ana.evaluate(({ x, y, width, height }) => {
  const alvo = document.elementFromPoint(x + width / 2, y + height / 2)
  return Boolean(alvo?.closest('button'))
}, caixaEnviar)
ok(
  'Botão de envio visível, ativo e desobstruído',
  (await enviar.isVisible()) && (await enviar.isEnabled()) && alcancavel,
)
await painel().locator('textarea').first().fill('')
await ana.screenshot({ path: `${DESTINO}/correcao-drawer-notebook.png` })

// Tela menor: o painel vira sobreposição e continua inteiro dentro da altura
// visível, com as cinco abas alcançáveis.
await ana.setViewportSize({ width: 1024, height: 700 })
await ana.waitForTimeout(1500)
const painelPequeno = ana.locator('aside:visible').filter({ hasText: 'Protocolo' }).first()
const caixaPequeno = await painelPequeno.boundingBox()
ok(
  'Em 1024×700 o painel continua dentro da tela',
  caixaPequeno.y + caixaPequeno.height <= 700 + 1,
  `fim=${Math.round(caixaPequeno.y + caixaPequeno.height)}`,
)
let abasAlcancaveis = 0
for (const aba of ['Protocolo', 'Conversa', 'Arquivos', 'Histórico', 'Informações']) {
  const botao = painelPequeno.getByRole('button', { name: aba, exact: true }).first()
  await botao.scrollIntoViewIfNeeded()
  if (await botao.isVisible()) abasAlcancaveis += 1
}
ok('Em 1024×700 as cinco abas continuam alcançáveis', abasAlcancaveis === 5, `${abasAlcancaveis}/5`)
await ana.screenshot({ path: `${DESTINO}/correcao-drawer-1024.png` })
await ana.setViewportSize(NOTEBOOK)
await ana.waitForTimeout(1200)

// ───────────────────── 2. Texto redundante do Protocolo ──────────────────
await painel().getByRole('button', { name: 'Protocolo', exact: true }).click()
await ana.waitForTimeout(800)
const textoProtocolo = await painel().innerText()
ok('Faixa "Registro formal · protocolo" removida', !/Registro formal/.test(textoProtocolo))
ok('Manifestação do Cliente continua no Protocolo', /MANIFESTAÇÃO DO CLIENTE/.test(textoProtocolo))
ok('Número do protocolo segue no cabeçalho', /#2026-0003/.test(textoProtocolo))

// ───────────────────── 3. Busca e indicadores ────────────────────────────
await ana.locator('aside:visible button[class*="rounded-md p-1.5"]').first().click().catch(() => {})
await abrirQuadro(ana)

const geral = await indicadores(ana)
ok(
  'Indicadores gerais separam Em andamento de Aguardando cliente',
  geral['Em andamento'] !== undefined && geral['Aguardando cliente'] !== undefined,
  JSON.stringify(geral),
)

await buscar(ana, 'Marina')
const marinaKanban = await protocolosVisiveis(ana)
const contMarina = await indicadores(ana)
ok(
  'Busca por Marina mostra só os protocolos dela (Kanban)',
  marinaKanban.length > 0 &&
    marinaKanban.every((n) => DA_MARINA.includes(n)) &&
    !marinaKanban.some((n) => DO_PAULO.includes(n)),
  marinaKanban.join(' '),
)
ok(
  'Indicadores acompanham a busca por nome',
  contMarina.Total === marinaKanban.length,
  JSON.stringify(contMarina),
)

await ana.locator('button[aria-label="Visualização em lista"]').click()
await ana.waitForTimeout(900)
const marinaLista = await protocolosVisiveis(ana)
const contListaMarina = await indicadores(ana)
ok(
  'Mesma busca vale na Lista',
  marinaLista.every((n) => DA_MARINA.includes(n)) &&
    contListaMarina.Total === contMarina.Total,
  `${marinaLista.join(' ')} · total=${contListaMarina.Total}`,
)
await ana.screenshot({ path: `${DESTINO}/correcao-busca-lista.png` })

await buscar(ana, CODIGO_MARINA)
const porCodigo = await protocolosVisiveis(ana)
const contCodigo = await indicadores(ana)
ok(
  'Código do Cliente traz todos os protocolos dele',
  porCodigo.length > 0 && porCodigo.every((n) => DA_MARINA.includes(n)),
  porCodigo.join(' '),
)
ok(
  'Indicadores acompanham a busca por código',
  contCodigo.Total === contMarina.Total,
  JSON.stringify(contCodigo),
)

await ana.locator('button[aria-label="Visualização em quadro"]').click()
await ana.waitForTimeout(900)
const codigoKanban = await protocolosVisiveis(ana)
ok(
  'Busca por código também no Kanban',
  codigoKanban.length > 0 && codigoKanban.every((n) => DA_MARINA.includes(n)),
  codigoKanban.join(' '),
)

await buscar(ana, '#2026-0003')
const soUm = await protocolosVisiveis(ana)
const contUm = await indicadores(ana)
ok('Busca por protocolo isola o atendimento', soUm.length === 1 && soUm[0] === '#2026-0003')
ok(
  'Indicadores mostram 1 atendimento e o status certo',
  contUm.Total === 1 && contUm.Novos === 1 && contUm['Aguardando cliente'] === 0,
  JSON.stringify(contUm),
)

await buscar(ana, 'Paulo')
const doPaulo = await protocolosVisiveis(ana)
ok(
  'Busca por outro Cliente não traz os da Marina',
  doPaulo.length > 0 &&
    doPaulo.every((n) => DO_PAULO.includes(n)) &&
    !doPaulo.some((n) => DA_MARINA.includes(n)),
  doPaulo.join(' '),
)

await buscar(ana, '')
const voltou = await indicadores(ana)
ok(
  'Limpar a busca devolve os números gerais',
  voltou.Total === geral.Total,
  `${voltou.Total} vs ${geral.Total}`,
)

// ───────────────────── 4. Prioridade e prazo pela equipe ─────────────────
await buscar(ana, '#2026-0003')
await ana.locator('button', { hasText: '#2026-0003' }).first().click()
await ana.waitForTimeout(1200)

await painel().getByRole('button', { name: 'Alterar prioridade' }).click()
await ana.waitForTimeout(600)
await ana.getByRole('menuitem', { name: 'Prioridade Alta' }).click()
await ana.waitForTimeout(3000)
ok('Prioridade alterada pela profissional', /Alta/.test(await painel().innerText()))

await ana.reload({ waitUntil: 'domcontentloaded' })
await ana.waitForTimeout(5000)
await ana.locator('button', { hasText: '#2026-0003' }).first().click()
await ana.waitForTimeout(1500)
ok('Prioridade persiste depois do refresh', /Alta/.test(await painel().innerText()))

await painel().getByRole('button', { name: 'Informações', exact: true }).click()
await ana.waitForTimeout(800)
await painel().getByRole('button', { name: 'Alterar', exact: true }).click()
await ana.waitForTimeout(500)
await painel().locator('input[type="date"]').fill('2026-09-30')
await painel().getByRole('button', { name: 'Salvar' }).click()
await ana.waitForTimeout(3000)

await ana.reload({ waitUntil: 'domcontentloaded' })
await ana.waitForTimeout(5000)
await ana.locator('button', { hasText: '#2026-0003' }).first().click()
await ana.waitForTimeout(1500)
await painel().getByRole('button', { name: 'Informações', exact: true }).click()
await ana.waitForTimeout(800)
ok(
  'Prazo definido pela equipe persiste',
  /30\/09\/2026/.test(await painel().innerText()),
)

await painel().getByRole('button', { name: 'Histórico', exact: true }).click()
await ana.waitForTimeout(900)
const historico = await painel().innerText()
ok('Histórico registra a prioridade com antes e depois', /Prioridade alterada de .* para Alta/.test(historico))
ok('Histórico registra o prazo', /Prazo (alterado|definido)/.test(historico))
await ana.screenshot({ path: `${DESTINO}/correcao-historico.png` })

// ───────────────────── 5. Área do Cliente ────────────────────────────────
const ctxMarina = await nav.newContext({ viewport: { width: 1366, height: 768 } })
const marina = await ctxMarina.newPage()
await entrar(marina, MARINA)
await marina.goto(`${BASE}/cliente`, { waitUntil: 'domcontentloaded' })
await marina.waitForTimeout(3000)
await marina.getByRole('button', { name: /Atendimentos/i }).first().click()
await marina.waitForTimeout(1500)

const listaMarina = await marina.locator('body').innerText()
ok('Marina vê os próprios atendimentos', /#2026-0001/.test(listaMarina) && /#2026-0003/.test(listaMarina))
ok('Marina não vê o atendimento do Paulo', !/#2026-0002/.test(listaMarina))

await marina.locator('button', { hasText: '#2026-0003' }).first().click()
await marina.waitForTimeout(1500)
const detalhe = () => marina.locator('body')
for (const aba of ['Protocolo', 'Conversa', 'Arquivos', 'Histórico', 'Informações']) {
  const botao = marina.getByRole('button', { name: aba, exact: true }).first()
  await botao.click()
  await marina.waitForTimeout(700)
  ok(`Cliente abre a aba ${aba}`, await botao.isVisible())
}

await marina.getByRole('button', { name: 'Informações', exact: true }).click()
await marina.waitForTimeout(900)
const infoCliente = await detalhe().innerText()
ok('Cliente vê o prazo atualizado', /30\/09\/2026/.test(infoCliente))
ok('Cliente vê a prioridade definida pela equipe', /Prioridade[\s\S]{0,40}Alta/.test(infoCliente))
ok('Cliente vê protocolo, serviço, prestador e status', /#2026-0003/.test(infoCliente) && /Ana Carolina Silva/.test(infoCliente))
ok(
  'Cliente não tem controle de prioridade nem de prazo',
  (await marina.locator('input[type="date"]').count()) === 0 &&
    (await marina.getByRole('button', { name: 'Alterar prioridade' }).count()) === 0,
)
ok('Cliente não vê canal Interno', !/\bInterno\b/.test(infoCliente))

await marina.getByRole('button', { name: 'Histórico', exact: true }).click()
await marina.waitForTimeout(800)
const historicoCliente = await detalhe().innerText()
ok('Histórico do Cliente mostra a mudança de prazo', /Prazo (alterado|definido)/.test(historicoCliente))
ok(
  'Histórico do Cliente não expõe a fila interna da equipe',
  !/Prioridade alterada/.test(historicoCliente),
)
await marina.screenshot({ path: `${DESTINO}/correcao-cliente.png`, fullPage: true })

// ───────────────────── 6. Isolamento entre Clientes ──────────────────────
const ctxPaulo = await nav.newContext({ viewport: { width: 1366, height: 768 } })
const paulo = await ctxPaulo.newPage()
await entrar(paulo, PAULO)
await paulo.goto(`${BASE}/cliente`, { waitUntil: 'domcontentloaded' })
await paulo.waitForTimeout(3000)
await paulo.getByRole('button', { name: /Atendimentos/i }).first().click()
await paulo.waitForTimeout(1500)
const listaPaulo = await paulo.locator('body').innerText()
ok('Paulo vê só o atendimento dele', /#2026-0002/.test(listaPaulo) && !/#2026-0003/.test(listaPaulo))

await nav.close()

const falhas = res.filter((r) => !r.v)
console.log(`\n${res.length - falhas.length}/${res.length} verificações aprovadas`)
if (falhas.length) {
  console.log('Falhas:')
  for (const f of falhas) console.log(` - ${f.n}`)
  process.exit(1)
}
