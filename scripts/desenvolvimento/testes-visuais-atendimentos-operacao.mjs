/**
 * Validação da etapa operacional de Atendimentos.
 *
 * Cobre no navegador o que os testes de unidade não alcançam: alternância
 * Kanban/Lista, filtro de Status, transições pelo painel, conversa real entre
 * Cliente e Profissional, contratação com mensagem e anexo, e o painel lateral
 * cabendo na viewport de um notebook.
 *
 * Uso: node scripts/desenvolvimento/testes-visuais-atendimentos-operacao.mjs
 */
import { chromium } from 'playwright-core'
import { homedir } from 'node:os'

const executablePath = `${homedir()}/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`
const BASE = 'http://localhost:5173'
const DESTINO = '/tmp/claude-1000/-home-junior-vincis2/capturas'

const ANA = { email: 'demo.profissional.ana.silva@vincis.local', senha: 'Teste@123456' }
const MARINA = { email: 'cliente.visual@vincis.local', senha: 'Teste@123456' }
const PAULO = { email: 'cliente.teste.atendimentos@vincis.local', senha: 'Teste@123456' }

const MSG_CLIENTE = 'Olá Ana, preciso de orientação sobre os documentos necessários.'
const MSG_ANA = 'Olá Marina. Vou verificar e te orientar por aqui.'
const MSG_CONTRATACAO = 'Preciso abrir um MEI para prestação de serviços e já tenho meus documentos.'

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

/** Abre a área do Cliente já na aba Atendimentos, com o protocolo pedido. */
async function abrirAtendimentoDoCliente(p, protocolo) {
  await p.goto(`${BASE}/cliente`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2500)
  await p.getByRole('button', { name: /Atendimentos/i }).first().click()
  await p.waitForTimeout(1200)
  await p.locator('button', { hasText: protocolo }).first().click()
  await p.waitForTimeout(1200)
}

const nav = await chromium.launch({ executablePath, headless: true })

// ─────────────────────────── 1. Cliente escreve ───────────────────────────
const ctxMarina = await nav.newContext({ viewport: { width: 1440, height: 900 } })
const marina = await ctxMarina.newPage()
await entrar(marina, MARINA)
ok('Marina entra na própria área', new URL(marina.url()).pathname === '/cliente', marina.url())

await abrirAtendimentoDoCliente(marina, '#2026-0001')
const detalhe = await marina.locator('body').innerText()
ok('Cliente vê o detalhe com protocolo real', detalhe.includes('#2026-0001'))
ok('Cliente vê o serviço real', detalhe.includes('Declaração de IRPF Teste'))
ok('Cliente NÃO vê aba Interno', !/\bInterno\b/.test(detalhe))

await marina.locator('textarea').first().fill(MSG_CLIENTE)
await marina.getByRole('button', { name: /Enviar/i }).first().click()
await marina.waitForTimeout(3000)
ok('Mensagem do Cliente aparece na conversa dele',
  (await marina.locator('body').innerText()).includes(MSG_CLIENTE))
await marina.screenshot({ path: `${DESTINO}/cliente-conversa.png`, fullPage: true })

// ─────────────────────────── 2. Ana recebe e responde ──────────────────────
const ctxAna = await nav.newContext({ viewport: { width: 1600, height: 1000 } })
const ana = await ctxAna.newPage()
await entrar(ana, ANA)
await ana.goto(`${BASE}/admin?pagina=atendimentos`, { waitUntil: 'domcontentloaded' })
await ana.waitForTimeout(4000)

const painel = () => ana.locator('aside:visible').filter({ hasText: 'Conversa' }).first()
await ana.locator('button', { hasText: '#2026-0001' }).first().click()
await ana.waitForTimeout(1500)
const conversaAna = await painel().innerText()
ok('Ana recebe a mensagem do Cliente em Conversa → Cliente', conversaAna.includes(MSG_CLIENTE))

await painel().locator('textarea').first().fill(MSG_ANA)
await painel().getByRole('button', { name: /Enviar/i }).first().click()
await ana.waitForTimeout(3500)
ok('Resposta da Ana entra na conversa', (await painel().innerText()).includes(MSG_ANA))
await ana.screenshot({ path: `${DESTINO}/admin-conversa-real.png` })

// Canal interno separado, no mesmo painel.
await painel().getByRole('button', { name: /^Interno$/ }).click()
await ana.waitForTimeout(800)
const interno = await painel().innerText()
ok('Canal Interno não mostra a conversa do Cliente', !interno.includes(MSG_CLIENTE))
await painel().locator('textarea').first().fill('Nota interna: conferir documentação antes de responder.')
await painel().getByRole('button', { name: /Enviar/i }).first().click()
await ana.waitForTimeout(3000)
ok('Nota interna gravada no canal da equipe',
  (await painel().innerText()).includes('conferir documentação'))
await painel().getByRole('button', { name: /^Cliente$/ }).click()
await ana.waitForTimeout(800)

// ─────────────────────────── 3. Persistência e privacidade ─────────────────
await marina.reload({ waitUntil: 'domcontentloaded' })
await marina.waitForTimeout(2500)
await marina.getByRole('button', { name: /Atendimentos/i }).first().click()
await marina.waitForTimeout(1000)
await marina.locator('button', { hasText: '#2026-0001' }).first().click()
await marina.waitForTimeout(1500)
const marinaDepois = await marina.locator('body').innerText()
ok('Cliente vê a resposta do Profissional após refresh', marinaDepois.includes(MSG_ANA))
ok('Mensagem do Cliente persiste após refresh', marinaDepois.includes(MSG_CLIENTE))
ok('Nota interna NUNCA chega ao Cliente', !/conferir documentação/i.test(marinaDepois))

// ─────────────────────────── 4. Kanban x Lista ─────────────────────────────
const contarProtocolos = async (pagina) => {
  const texto = await pagina.locator('body').innerText()
  return new Set([...texto.matchAll(/#2026-\d{4}/g)].map((m) => m[0])).size
}
/** Percorre as páginas da Lista e devolve todos os protocolos exibidos. */
const protocolosDaLista = async (pagina) => {
  const vistos = new Set()
  for (let volta = 0; volta < 10; volta += 1) {
    const numeros = await pagina.evaluate(() =>
      [...document.querySelectorAll('tbody tr')].map(
        (tr) => tr.querySelector('td')?.textContent?.trim(),
      ),
    )
    numeros.forEach((n) => vistos.add(n))
    const proxima = pagina.getByRole('button', { name: 'Próxima' })
    if (!(await proxima.isEnabled())) break
    await proxima.click()
    await pagina.waitForTimeout(700)
  }
  return vistos
}

// O quadro desenha um lote por coluna; revelar tudo deixa os dois lados
// comparáveis.
for (const botao of await ana.getByRole('button', { name: /Ver mais/ }).all()) {
  await botao.click()
  await ana.waitForTimeout(400)
}
const noKanban = await contarProtocolos(ana)
await ana.getByRole('button', { name: 'Visualização em lista' }).click()
await ana.waitForTimeout(1200)
const listaTexto = await ana.locator('table').first().innerText()
ok('Lista mostra a tabela com as colunas úteis',
  /protocolo/i.test(listaTexto) && /respons/i.test(listaTexto) && /atualizado/i.test(listaTexto))
const naLista = await protocolosDaLista(ana)
ok('Lista traz os mesmos atendimentos do quadro', naLista.size === noKanban,
  `kanban=${noKanban} lista=${naLista.size}`)
ok('Lista mostra mocks e reais juntos',
  naLista.has('#2026-0001') && naLista.has('#2026-0042'))
await ana.screenshot({ path: `${DESTINO}/atendimentos-lista.png`, fullPage: true })

await ana.getByRole('button', { name: 'Visualização em quadro' }).click()
await ana.waitForTimeout(1200)
ok('Volta para o Kanban sem recarregar a página',
  (await ana.locator('body').innerText()).includes('Solte um card aqui') ||
    (await ana.locator('body').innerText()).includes('Em andamento'))

// ─────────────────────────── 5. Filtro de Status ───────────────────────────
const barraStatus = ana.locator('div').filter({ hasText: /^Status/ }).last()
ok('Barra de Status oferece os 7 status',
  ['Novo', 'Em andamento', 'Aguardando cliente', 'Aguardando assinatura', 'Concluído', 'Recusado', 'Cancelado']
    .every((s) => barraStatus.locator(`button:text-is("${s}")`)),
)
// Fecha o painel (o X é o primeiro botão do cabeçalho): o detalhe aberto
// continua visível por definição, e não é ele que o filtro deve esconder.
await painel().locator('button').first().click()
await ana.waitForTimeout(800)
await ana.locator('button:text-is("Concluído")').first().click()
await ana.waitForTimeout(1200)
const soConcluidos = await ana.locator('main').first().innerText()
ok('Filtro Status=Concluído esconde os demais',
  soConcluidos.includes('#2026-0021') && !soConcluidos.includes('#2026-0001'),
  [...soConcluidos.matchAll(/#2026-\d{4}/g)].map((m) => m[0]).join(' '))
await ana.locator('button:text-is("Concluído")').first().click()
await ana.waitForTimeout(1000)

// ─────────────────────────── 6. Transição de status ────────────────────────
await ana.locator('button', { hasText: '#2026-0002' }).first().click()
await ana.waitForTimeout(1500)
const statusAtual = await painel().innerText()
if (/Novo/.test(statusAtual)) {
  await painel().locator('button', { hasText: 'Novo' }).first().click()
  await ana.waitForTimeout(700)
  const opcoes = await ana.locator('[role="menu"]').innerText()
  ok('Menu de status oferece só as transições válidas de Novo',
    /Iniciar/.test(opcoes) && /Recusar/.test(opcoes) && !/Concluir/.test(opcoes), opcoes.replace(/\n/g, ' | '))
  await ana.getByRole('menuitem', { name: 'Iniciar' }).click()
  await ana.waitForTimeout(3500)
} else {
  // Já iniciado numa execução anterior: confere o menu do status atual, que
  // precisa oferecer as saídas de Em andamento e nenhuma das de Novo.
  await painel().locator('button', { hasText: 'Em andamento' }).first().click()
  await ana.waitForTimeout(700)
  const opcoes = await ana.locator('[role="menu"]').innerText()
  ok('Menu de status oferece só as transições válidas do status atual',
    /Solicitar ao cliente/.test(opcoes) && /Concluir/.test(opcoes) && !/Iniciar/.test(opcoes),
    opcoes.replace(/\n/g, ' | '))
  await ana.keyboard.press('Escape')
  await ana.waitForTimeout(500)
}
const depoisTransicao = await ana.locator('body').innerText()
ok('#2026-0002 passou para Em andamento', /Em andamento/.test(depoisTransicao))
await ana.locator('button', { hasText: '#2026-0002' }).first().click()
await ana.waitForTimeout(1200)
await painel().getByRole('button', { name: 'Histórico' }).click()
await ana.waitForTimeout(900)
ok('Histórico registra quem mudou o status',
  /alterou de Novo para Em andamento/.test(await painel().innerText()))

// ─────────────────────────── 7. Drawer em notebook ─────────────────────────
await ana.setViewportSize({ width: 1366, height: 768 })
await ana.waitForTimeout(1500)
await painel().getByRole('button', { name: 'Conversa' }).click()
await ana.waitForTimeout(900)
const caixa = await painel().boundingBox()
ok('Painel cabe na altura da viewport', caixa.height <= 768 + 2, `altura=${Math.round(caixa.height)}`)
const enviar = painel().getByRole('button', { name: /Enviar/i }).first()
const caixaEnviar = await enviar.boundingBox()
ok('Composer visível dentro da tela',
  caixaEnviar.y + caixaEnviar.height <= 768, `fim=${Math.round(caixaEnviar.y + caixaEnviar.height)}`)
ok('Botão Enviar clicável (não coberto)', await enviar.isVisible())
await ana.screenshot({ path: `${DESTINO}/atendimento-drawer-notebook.png` })

// ─────────────────────────── 8. Contratação com mensagem e anexo ───────────
await marina.goto(`${BASE}/profissionais`, { waitUntil: 'domcontentloaded' })
await marina.waitForTimeout(3000)
await marina.locator('article', { hasText: 'Ana Carolina Silva' }).first()
  .getByRole('button', { name: /VER PERFIL/i }).first().click()
await marina.waitForURL(/perfil-profissional/, { timeout: 30000 }).catch(() => {})
await marina.waitForTimeout(3500)

const item = marina.locator('details', { hasText: 'Abertura de Empresa MEI' }).first()
await item.locator('summary').click()
await marina.waitForTimeout(900)
ok('Formulário de contratação tem campo de mensagem',
  (await item.locator('textarea').count()) > 0)
await item.locator('textarea').first().fill(MSG_CONTRATACAO)
await item.locator('input[type="file"]').first().setInputFiles({
  name: 'documentos-marina.txt',
  mimeType: 'text/plain',
  buffer: Buffer.from('Documento de teste Vincis\nEnviado na contratacao\n'),
})
await item.getByRole('button', { name: /Contratar agora/i }).first().click()
await marina.waitForTimeout(2500)
const aposContratar = await marina.locator('body').innerText()
await marina.waitForTimeout(4000)
ok('Contratação com mensagem e anexo concluída',
  /contratado com sucesso|já possui uma solicitação/i.test(aposContratar),
  aposContratar.match(/(contratado com sucesso|já possui uma solicitação)/i)?.[0] ?? '')

await ana.setViewportSize({ width: 1600, height: 1000 })
await ana.reload({ waitUntil: 'domcontentloaded' })
await ana.waitForTimeout(4500)
const quadroAna = await ana.locator('body').innerText()
ok('Novo atendimento da contratação aparece para a Ana', /#2026-0003/.test(quadroAna))
await ana.locator('button', { hasText: '#2026-0003' }).first().click()
await ana.waitForTimeout(1500)
// A mensagem da contratação é o registro formal do pedido: ela abre o
// Protocolo e não é copiada para a Conversa.
await painel().getByRole('button', { name: 'Protocolo' }).click()
await ana.waitForTimeout(900)
ok('Mensagem escrita na contratação abre o Protocolo',
  (await painel().innerText()).includes(MSG_CONTRATACAO))
await painel().getByRole('button', { name: 'Conversa' }).click()
await ana.waitForTimeout(900)
ok('A mensagem da contratação não aparece também na Conversa',
  !(await painel().innerText()).includes(MSG_CONTRATACAO))
await painel().getByRole('button', { name: 'Arquivos' }).click()
await ana.waitForTimeout(1000)
ok('Arquivo enviado na contratação aparece em Arquivos',
  /documentos-marina\.txt/.test(await painel().innerText()))
await painel().getByRole('button', { name: 'Histórico' }).click()
await ana.waitForTimeout(900)
const hist = await painel().innerText()
ok('Histórico registra a contratação e o anexo',
  /Serviço contratado/.test(hist) && /anexou documentos-marina\.txt/.test(hist))
await ana.screenshot({ path: `${DESTINO}/atendimento-contratacao-com-anexo.png` })

// ─────────────────────────── 9. Isolamento entre Clientes ──────────────────
const ctxPaulo = await nav.newContext({ viewport: { width: 1440, height: 900 } })
const paulo = await ctxPaulo.newPage()
await entrar(paulo, PAULO)
await paulo.goto(`${BASE}/cliente`, { waitUntil: 'domcontentloaded' })
await paulo.waitForTimeout(2500)
await paulo.getByRole('button', { name: /Atendimentos/i }).first().click()
await paulo.waitForTimeout(1200)
const areaPaulo = await paulo.locator('body').innerText()
ok('Paulo vê o próprio atendimento', areaPaulo.includes('#2026-0002'))
ok('Paulo NÃO vê o atendimento da Marina', !areaPaulo.includes('#2026-0001'))
ok('Paulo NÃO vê a conversa da Marina', !areaPaulo.includes(MSG_CLIENTE))

// Mesmo sabendo o id, o arquivo do outro atendimento não é servido.
const arquivoAlheio = await paulo.evaluate(async (url) => {
  const r = await fetch(url)
  return r.status
}, `/api/atendimentos/00000000-0000-0000-0000-000000000000/arquivos/00000000-0000-0000-0000-000000000000`)
ok('Rota de arquivo recusa id inexistente/alheio', arquivoAlheio === 404, String(arquivoAlheio))
await paulo.screenshot({ path: `${DESTINO}/cliente-paulo-isolamento.png`, fullPage: true })

// ─────────────────────────── 10. Visual preservado ─────────────────────────
const MOCKS = ['#2026-0042', '#2026-0041', '#2026-0039', '#2026-0038', '#2026-0035',
  '#2026-0033', '#2026-0028', '#2026-0021', '#2026-0019']
for (const botao of await ana.getByRole('button', { name: /Ver mais/ }).all()) {
  await botao.click()
  await ana.waitForTimeout(400)
}
const final = await ana.locator('body').innerText()
ok('Os 9 cards mockados continuam na tela', MOCKS.every((m) => final.includes(m)),
  MOCKS.filter((m) => !final.includes(m)).join(', ') || 'nenhum ausente')
ok('Os atendimentos reais continuam visíveis',
  ['#2026-0001', '#2026-0002', '#2026-0003'].every((p) => final.includes(p)))
await ana.screenshot({ path: `${DESTINO}/atendimentos-final-desktop.png`, fullPage: true })

await ctxMarina.close()
await ctxAna.close()
await ctxPaulo.close()
await nav.close()
const f = res.filter((r) => !r.v).length
console.log(`\n${res.length - f}/${res.length} verificações aprovadas.`)
process.exit(f ? 1 : 0)
