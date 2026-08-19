/**
 * Fluxo real da solicitação de ajuste, com duas sessões Chromium separadas.
 *
 * Duas janelas independentes, cada uma com a sua conta e o seu socket — é a
 * única forma de conferir que o tempo real funciona **entre** pessoas, e não só
 * dentro da mesma aba. Nenhum reload manual acontece entre uma ação e a
 * verificação do outro lado: o que atualiza a tela é o evento do Pusher.
 *
 * Cobre, na ordem:
 *
 *  1. Cliente abre um Atendimento concluído e pede um ajuste;
 *  2. o Atendimento **continua** Concluído nas duas telas;
 *  3. o Prestador recebe a novidade sem F5 e analisa pelo drawer;
 *  4. aceite → o card sai de Concluído e entra em Em andamento;
 *  5. a tela do Cliente acompanha, também sem F5;
 *  6. Protocolo e Histórico mostram a sequência;
 *  7. num segundo Atendimento, a recusa mantém o status Concluído.
 *
 * Uso (com `npm run dev` no ar):
 *   node scripts/desenvolvimento/testes-ajuste-atendimento-real.mjs
 */
import { chromium } from 'playwright-core'
import { homedir } from 'node:os'

const executablePath = `${homedir()}/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`
const BASE = 'http://localhost:5173'

const ANA = {
  email: 'demo.profissional.ana.silva@vincis.local',
  senha: 'Teste@123456',
}
/** Atendimento concluído desta Cliente, usado no fluxo de aceite. */
const MARINA = { email: 'cliente.visual@vincis.local', senha: 'Teste@123456' }
/** Atendimento concluído deste Cliente, usado no fluxo de recusa. */
const PAULO = {
  email: 'cliente.teste.atendimentos@vincis.local',
  senha: 'Teste@123456',
}

const PROTOCOLO_ACEITE = process.argv[2] ?? '#2026-0010'
const PROTOCOLO_RECUSA = process.argv[3] ?? '#2026-0007'

const MOTIVO_ACEITE =
  'O documento entregue está com meu endereço antigo. Poderia corrigir?'
const MOTIVO_RECUSA = 'Achei que o serviço incluía a segunda via impressa.'
const JUSTIFICATIVA =
  'A segunda via impressa não faz parte do escopo contratado neste serviço.'

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

/** Abre o Atendimento do protocolo indicado na lista do portal do Cliente. */
async function abrirNoPortal(p, protocolo) {
  await p.goto(`${BASE}/cliente`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(3000)
  // O portal abre na Visão geral: a lista de protocolos vive na aba
  // Atendimentos, que é onde o cartão de conclusão aparece.
  await p.getByRole('button', { name: 'Atendimentos', exact: true }).first().click()
  await p.waitForTimeout(2000)
  await p.locator('button', { hasText: protocolo }).first().click()
  await p.waitForTimeout(1500)
}

/** Envia a solicitação de ajuste pelo cartão de conclusão do portal. */
async function pedirAjuste(p, motivo) {
  await p.getByRole('button', { name: /Solicitar (outro )?ajuste/ }).first().click()
  await p.waitForTimeout(600)
  await p
    .locator('textarea[placeholder*="precisa ser ajustado"]')
    .first()
    .fill(motivo)
  await p.getByRole('button', { name: /Enviar solicitação/ }).click()
  await p.waitForTimeout(3500)
}

const nav = await chromium.launch({ executablePath, headless: true })

// Dois contextos: cookies, sessão e socket independentes em cada um.
const ctxCliente = await nav.newContext({ viewport: { width: 1280, height: 1000 } })
const ctxAna = await nav.newContext({ viewport: { width: 1600, height: 1000 } })
const cliente = await ctxCliente.newPage()
const ana = await ctxAna.newPage()

await Promise.all([entrar(cliente, MARINA), entrar(ana, ANA)])

// --- 1. Estado inicial: concluído nos dois lados ---------------------------
await abrirNoPortal(cliente, PROTOCOLO_ACEITE)
const detalheInicial = await cliente.locator('body').innerText()
ok(
  `Cliente vê o ${PROTOCOLO_ACEITE} concluído`,
  /CONCLUÍDO/i.test(detalheInicial),
)
ok(
  'Portal oferece "Solicitar ajuste" no atendimento concluído',
  (await cliente.getByRole('button', { name: /Solicitar ajuste/ }).count()) > 0,
)

await ana.goto(`${BASE}/admin?pagina=atendimentos`, {
  waitUntil: 'domcontentloaded',
})
await ana.waitForTimeout(4000)
for (const botao of await ana.getByRole('button', { name: /Ver mais/ }).all()) {
  await botao.click()
  await ana.waitForTimeout(300)
}
const quadroAntes = await ana.locator('body').innerText()
const concluidosAntes = Number(
  quadroAntes.match(/Concluídos\n(\d+)/)?.[1] ??
    quadroAntes.match(/Concluidos\n(\d+)/)?.[1] ??
    -1,
)
const andamentoAntes = Number(
  quadroAntes.match(/Em andamento\n(\d+)/)?.[1] ?? -1,
)
const totalAntes = Number(quadroAntes.match(/Total\n(\d+)/)?.[1] ?? -1)
console.log(
  `  contadores antes: total ${totalAntes} · andamento ${andamentoAntes} · concluídos ${concluidosAntes}`,
)

// --- 2. Cliente solicita, e o Prestador recebe sem recarregar --------------
await pedirAjuste(cliente, MOTIVO_ACEITE)

const depoisDoPedido = await cliente.locator('body').innerText()
ok(
  'Cliente vê a solicitação em análise',
  /Solicitação de ajuste/.test(depoisDoPedido) &&
    /EM ANÁLISE/i.test(depoisDoPedido),
)
ok(
  'A solicitação NÃO reabre o atendimento: o Cliente continua vendo Concluído',
  /CONCLUÍDO/i.test(depoisDoPedido),
)
ok(
  'O portal avisa que o atendimento segue concluído até a análise',
  /permanece concluído/i.test(depoisDoPedido),
)

// Nenhum reload aqui: o que muda a tela da Ana é o evento em tempo real.
await ana.waitForTimeout(6000)
const quadroAposPedido = await ana.locator('body').innerText()
const concluidosAposPedido = Number(
  quadroAposPedido.match(/Concluídos\n(\d+)/)?.[1] ??
    quadroAposPedido.match(/Concluidos\n(\d+)/)?.[1] ??
    -1,
)
ok(
  'Kanban da Ana não move o card enquanto o pedido está pendente',
  concluidosAposPedido === concluidosAntes,
  `antes ${concluidosAntes} · depois ${concluidosAposPedido}`,
)

const sino = await ana
  .locator('header')
  .innerText()
  .catch(() => '')
ok(
  'Sino da Ana registra o aviso sem F5',
  /\d/.test(sino) || /Nova/.test(quadroAposPedido),
  sino.replace(/\n/g, ' | ').slice(0, 120),
)

// --- 3. Ana abre o drawer e analisa ---------------------------------------
await ana.locator('button', { hasText: PROTOCOLO_ACEITE }).first().click()
await ana.waitForTimeout(2500)
await ana.getByRole('button', { name: 'Protocolo', exact: true }).first().click()
await ana.waitForTimeout(1200)

const painel = await ana.locator('aside').last().innerText()
ok(
  'Solicitação aparece no Protocolo do drawer, com o motivo do Cliente',
  painel.includes('Solicitação de ajuste') && painel.includes(MOTIVO_ACEITE),
)
ok(
  'Drawer oferece as duas decisões',
  /Aceitar e reabrir/.test(painel) && /Recusar/.test(painel),
)

await ana.getByRole('button', { name: /Aceitar e reabrir/ }).first().click()
await ana.waitForTimeout(600)
await ana
  .locator('textarea[placeholder*="Observação para o cliente"]')
  .first()
  .fill('Vamos corrigir o endereço e reenviar o documento.')
await ana.getByRole('button', { name: /Confirmar reabertura/ }).click()
await ana.waitForTimeout(5000)

const painelDepois = await ana.locator('aside').last().innerText()
ok(
  'Atendimento reaberto: o drawer mostra Em andamento',
  /Em andamento/i.test(painelDepois),
)

await ana.locator('button[aria-label="Fechar painel"]').first().click()
await ana.waitForTimeout(2500)
for (const botao of await ana.getByRole('button', { name: /Ver mais/ }).all()) {
  await botao.click()
  await ana.waitForTimeout(300)
}
const quadroDepois = await ana.locator('body').innerText()
const concluidosDepois = Number(
  quadroDepois.match(/Concluídos\n(\d+)/)?.[1] ??
    quadroDepois.match(/Concluidos\n(\d+)/)?.[1] ??
    -1,
)
const andamentoDepois = Number(
  quadroDepois.match(/Em andamento\n(\d+)/)?.[1] ?? -1,
)
const totalDepois = Number(quadroDepois.match(/Total\n(\d+)/)?.[1] ?? -1)
ok(
  'Concluídos diminui em 1',
  concluidosDepois === concluidosAntes - 1,
  `${concluidosAntes} → ${concluidosDepois}`,
)
ok(
  'Em andamento aumenta em 1',
  andamentoDepois === andamentoAntes + 1,
  `${andamentoAntes} → ${andamentoDepois}`,
)
ok('Total não muda', totalDepois === totalAntes, `${totalAntes} → ${totalDepois}`)

// --- 4. O Cliente acompanha, sem recarregar -------------------------------
await cliente.waitForTimeout(6000)
const clienteDepois = await cliente.locator('body').innerText()
ok(
  'Cliente vê o status mudar para Em andamento sem F5',
  /EM ANDAMENTO/i.test(clienteDepois),
)
ok(
  'Cliente vê a solicitação como Aceita',
  /ACEITA/i.test(clienteDepois),
)
ok(
  'Cliente lê a resposta do profissional',
  /corrigir o endereço e reenviar/i.test(clienteDepois),
)

await cliente
  .getByRole('button', { name: 'Histórico', exact: true })
  .first()
  .click()
await cliente.waitForTimeout(1200)
const historico = await cliente.locator('body').innerText()
ok(
  'Histórico do Cliente mostra a sequência concluído → pedido → aceite → reaberto',
  // A conclusão aparece como o evento próprio da entrega ou, nos Atendimentos
  // antigos de desenvolvimento, como a alteração de status que os encerrou
  // antes de a conclusão real existir.
  (/concluiu o atendimento/i.test(historico) ||
    /para Concluído/i.test(historico)) &&
    /solicitou um ajuste/i.test(historico) &&
    /aceitou a solicitação/i.test(historico) &&
    /reaberto após solicitação do cliente/i.test(historico),
)

await cliente
  .getByRole('button', { name: 'Protocolo', exact: true })
  .first()
  .click()
await cliente.waitForTimeout(1200)
const protocoloCliente = await cliente.locator('body').innerText()
ok(
  'Protocolo do Cliente registra o pedido e a decisão',
  protocoloCliente.includes(MOTIVO_ACEITE) &&
    /aceita\. O atendimento foi reaberto/i.test(protocoloCliente),
)

// --- 5. Duplicidade -------------------------------------------------------
await abrirNoPortal(cliente, PROTOCOLO_ACEITE)
const semBotao = await cliente
  .getByRole('button', { name: /Solicitar ajuste/ })
  .count()
ok(
  'Atendimento reaberto não oferece novo pedido de ajuste',
  semBotao === 0,
)

// --- 6. Recusa, no segundo Atendimento ------------------------------------
const paulo = await (await nav.newContext({
  viewport: { width: 1280, height: 1000 },
})).newPage()
await entrar(paulo, PAULO)
await abrirNoPortal(paulo, PROTOCOLO_RECUSA)
await pedirAjuste(paulo, MOTIVO_RECUSA)

const pendenteDoPaulo = await paulo.locator('body').innerText()
ok(
  'Segundo Cliente registra o pedido e continua vendo Concluído',
  /EM ANÁLISE/i.test(pendenteDoPaulo) && /CONCLUÍDO/i.test(pendenteDoPaulo),
)

// Com o pedido pendente, o portal não oferece outro: uma solicitação por vez.
ok(
  'Duplicidade bloqueada: nenhum botão de novo pedido com um em análise',
  (await paulo.getByRole('button', { name: /Solicitar ajuste/ }).count()) === 0,
)

await ana.waitForTimeout(5000)
await ana.locator('button', { hasText: PROTOCOLO_RECUSA }).first().click()
await ana.waitForTimeout(2500)
await ana.getByRole('button', { name: 'Protocolo', exact: true }).first().click()
await ana.waitForTimeout(1200)
await ana.getByRole('button', { name: /^Recusar$/ }).first().click()
await ana.waitForTimeout(600)
await ana
  .locator('textarea[placeholder*="motivo da recusa"]')
  .first()
  .fill(JUSTIFICATIVA)
await ana.getByRole('button', { name: /Confirmar recusa/ }).click()
await ana.waitForTimeout(5000)

const painelRecusa = await ana.locator('aside').last().innerText()
ok(
  'Recusa mantém o atendimento Concluído no painel',
  /Concluído/i.test(painelRecusa) && /Recusada/i.test(painelRecusa),
)

await paulo.waitForTimeout(6000)
const pauloDepois = await paulo.locator('body').innerText()
ok(
  'Segundo Cliente recebe a recusa sem F5, com a justificativa',
  /RECUSADA/i.test(pauloDepois) && pauloDepois.includes(JUSTIFICATIVA),
)
ok(
  'Atendimento recusado permanece Concluído para o Cliente',
  /CONCLUÍDO/i.test(pauloDepois),
)
ok(
  'Depois de recusada, o portal volta a oferecer um novo pedido',
  (await paulo.getByRole('button', { name: /Solicitar outro ajuste/ }).count()) >
    0,
)

await nav.close()

const falhas = res.filter((r) => !r.v)
console.log(`\n${res.length - falhas.length}/${res.length} verificações OK`)
if (falhas.length) {
  console.log('Falhas:')
  for (const f of falhas) console.log(` - ${f.n}`)
  process.exitCode = 1
}
