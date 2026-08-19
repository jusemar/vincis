/**
 * Validação do Protocolo no navegador.
 *
 * O que os testes de unidade provam no servidor, este script confere na tela
 * de verdade, com três sessões simultâneas no mesmo Atendimento `#2026-0003`:
 * a Cliente (Marina), a responsável (Ana) e o participante convidado (Ricardo).
 *
 * O ponto central é a visibilidade assimétrica: a Cliente vê tudo, e cada
 * profissional vê a manifestação dela mais apenas a própria resposta.
 *
 * Pré-requisito (idempotente):
 *   node --env-file=.env --import tsx \
 *     scripts/desenvolvimento/preparar-protocolo-com-dois-participantes.ts
 *
 * Uso: node scripts/desenvolvimento/testes-visuais-protocolo.mjs
 */
import { chromium } from 'playwright-core'
import { homedir } from 'node:os'

const executablePath = `${homedir()}/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`
const BASE = 'http://localhost:5173'
const DESTINO = '/tmp/claude-1000/-home-junior-vincis2/capturas'

const ANA = { email: 'demo.profissional.ana.silva@vincis.local', senha: 'Teste@123456' }
const RICARDO = { email: 'demo.profissional.ricardo.mendes@vincis.local', senha: 'Teste@123456' }
const MARINA = { email: 'cliente.visual@vincis.local', senha: 'Teste@123456' }

const PROTOCOLO = '#2026-0003'
const MANIFESTACAO_CLIENTE = 'Preciso abrir um MEI para prestação de serviços'
const RESPOSTA_ANA = 'Recebi sua solicitação. Vou preparar a abertura do MEI'
const RESPOSTA_RICARDO = 'Complementando pelo lado jurídico'
const CONVERSA_ANA = 'uai e ai'
// Textos fixos: o script confere se já existem antes de escrever, para poder
// rodar quantas vezes for preciso sem encher o Protocolo de repetições.
const NOVA_MANIFESTACAO = 'Também preciso saber se posso emitir nota fiscal logo no primeiro mês.'
const NOVA_RESPOSTA = 'Pode sim: a emissão de nota fica liberada assim que o CNPJ é gerado.'

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

/** Painel lateral visível do quadro (o de desktop, não o overlay escondido). */
const painelDe = (p) =>
  p.locator('aside:visible').filter({ hasText: 'Protocolo' }).first()

async function abrirNoQuadro(p, protocolo) {
  await p.goto(`${BASE}/admin?pagina=atendimentos`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(4000)
  await p.locator('button', { hasText: protocolo }).first().click()
  await p.waitForTimeout(1500)
}

async function abrirNoCliente(p, protocolo) {
  await p.goto(`${BASE}/cliente`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2500)
  await p.getByRole('button', { name: /Atendimentos/i }).first().click()
  await p.waitForTimeout(1200)
  await p.locator('button', { hasText: protocolo }).first().click()
  await p.waitForTimeout(1200)
}

const nav = await chromium.launch({ executablePath, headless: true })

// ─────────────────────────── 1. Ana: abas e Protocolo ──────────────────────
const ctxAna = await nav.newContext({ viewport: { width: 1600, height: 1000 } })
const ana = await ctxAna.newPage()
await entrar(ana, ANA)
await abrirNoQuadro(ana, PROTOCOLO)

const abas = await painelDe(ana).locator('button').allInnerTexts()
const sequencia = abas
  .map((t) => t.trim())
  .filter((t) => /^(Protocolo|Conversa|Arquivos|Histórico|Informações)$/i.test(t))
ok('Abas na ordem Protocolo · Conversa · Arquivos · Histórico · Informações',
  sequencia.slice(0, 5).join(' | ').toLowerCase() ===
    'protocolo | conversa | arquivos | histórico | informações',
  sequencia.join(' | '))

const protocoloAna = await painelDe(ana).innerText()
ok('Ana vê a manifestação da Cliente', protocoloAna.includes(MANIFESTACAO_CLIENTE))
ok('Ana vê a própria resposta', protocoloAna.includes(RESPOSTA_ANA))
ok('Ana NÃO vê a resposta do outro participante',
  !protocoloAna.includes(RESPOSTA_RICARDO))
ok('O Protocolo usa o número do Atendimento, sem numeração nova',
  protocoloAna.includes(PROTOCOLO))
await ana.screenshot({ path: `${DESTINO}/protocolo-ana.png` })

// ─────────────────────────── 2. Protocolo ≠ Conversa ───────────────────────
ok('A conversa do chat não aparece no Protocolo', !protocoloAna.includes(CONVERSA_ANA))
await painelDe(ana).getByRole('button', { name: 'Conversa' }).click()
await ana.waitForTimeout(1000)
const conversaAna = await painelDe(ana).innerText()
ok('A Conversa mostra o chat', conversaAna.includes(CONVERSA_ANA))
ok('A Conversa NÃO mostra a manifestação do Protocolo',
  !conversaAna.includes(MANIFESTACAO_CLIENTE))
ok('A Conversa NÃO mostra a resposta do Protocolo', !conversaAna.includes(RESPOSTA_ANA))

// ─────────────────────────── 3. Histórico sem vazamento ────────────────────
await painelDe(ana).getByRole('button', { name: 'Histórico' }).click()
await ana.waitForTimeout(1000)
const historicoAna = await painelDe(ana).innerText()
ok('Histórico registra a abertura do Protocolo', /Protocolo aberto/i.test(historicoAna))
ok('Histórico registra que houve resposta', /Resposta registrada no protocolo/i.test(historicoAna))
ok('Histórico não repete o conteúdo das respostas',
  !historicoAna.includes(RESPOSTA_ANA) && !historicoAna.includes(RESPOSTA_RICARDO))

// ─────────────────────────── 4. Ricardo: o outro lado ──────────────────────
const ctxRicardo = await nav.newContext({ viewport: { width: 1600, height: 1000 } })
const ricardo = await ctxRicardo.newPage()
await entrar(ricardo, RICARDO)
await abrirNoQuadro(ricardo, PROTOCOLO)
const protocoloRicardo = await painelDe(ricardo).innerText()
ok('Ricardo alcança o Atendimento como participante',
  protocoloRicardo.includes(PROTOCOLO))
ok('Ricardo vê a manifestação da Cliente',
  protocoloRicardo.includes(MANIFESTACAO_CLIENTE))
ok('Ricardo vê a própria resposta', protocoloRicardo.includes(RESPOSTA_RICARDO))
ok('Ricardo NÃO vê a resposta da Ana', !protocoloRicardo.includes(RESPOSTA_ANA))
// Nem no HTML: o texto alheio não chega ao navegador dele.
const htmlRicardo = await ricardo.content()
ok('A resposta da Ana não trafega até a página do Ricardo',
  !htmlRicardo.includes(RESPOSTA_ANA))
await ricardo.screenshot({ path: `${DESTINO}/protocolo-ricardo.png` })

// ─────────────────────────── 5. Cliente vê tudo ────────────────────────────
const ctxMarina = await nav.newContext({ viewport: { width: 1440, height: 900 } })
const marina = await ctxMarina.newPage()
await entrar(marina, MARINA)
await abrirNoCliente(marina, PROTOCOLO)
let protocoloMarina = await marina.locator('body').innerText()
ok('A área do Cliente tem a aba Protocolo', /Protocolo/.test(protocoloMarina))
ok('A Cliente vê a própria manifestação',
  protocoloMarina.includes(MANIFESTACAO_CLIENTE))
ok('A Cliente vê a resposta da Ana', protocoloMarina.includes(RESPOSTA_ANA))
ok('A Cliente vê a resposta do Ricardo', protocoloMarina.includes(RESPOSTA_RICARDO))
ok('A Cliente não vê nota interna da equipe',
  !/Nota interna/i.test(protocoloMarina))
await marina.screenshot({ path: `${DESTINO}/protocolo-cliente.png`, fullPage: true })

// ─────────────────────────── 6. Cliente escreve nova manifestação ──────────
if (!protocoloMarina.includes(NOVA_MANIFESTACAO)) {
  await marina.locator('textarea').first().fill(NOVA_MANIFESTACAO)
  await marina.getByRole('button', { name: /Registrar/i }).first().click()
  await marina.waitForTimeout(3500)
  protocoloMarina = await marina.locator('body').innerText()
}
ok('A Cliente registra nova manifestação no mesmo Atendimento',
  protocoloMarina.includes(NOVA_MANIFESTACAO))
ok('Nenhum Atendimento novo foi aberto para a nova manifestação',
  (protocoloMarina.match(/#2026-\d{4}/g) ?? []).every((n) => n === PROTOCOLO),
  (protocoloMarina.match(/#2026-\d{4}/g) ?? []).join(', '))

// ─────────────────────────── 7. Ana responde e a Cliente recebe ────────────
await ana.reload({ waitUntil: 'domcontentloaded' })
await ana.waitForTimeout(4000)
await ana.locator('button', { hasText: PROTOCOLO }).first().click()
await ana.waitForTimeout(1500)
let painelAna = await painelDe(ana).innerText()
ok('A nova manifestação da Cliente chega à Ana',
  painelAna.includes(NOVA_MANIFESTACAO))

if (!painelAna.includes(NOVA_RESPOSTA)) {
  await painelDe(ana).locator('textarea').first().fill(NOVA_RESPOSTA)
  await painelDe(ana).getByRole('button', { name: /Responder/i }).first().click()
  await ana.waitForTimeout(4000)
  await ana.locator('button', { hasText: PROTOCOLO }).first().click()
  await ana.waitForTimeout(1500)
  painelAna = await painelDe(ana).innerText()
}
ok('A resposta da Ana fica registrada no Protocolo', painelAna.includes(NOVA_RESPOSTA))

await marina.reload({ waitUntil: 'domcontentloaded' })
await marina.waitForTimeout(2500)
await abrirNoCliente(marina, PROTOCOLO)
const marinaDepois = await marina.locator('body').innerText()
ok('A Cliente recebe a resposta nova', marinaDepois.includes(NOVA_RESPOSTA))

await ricardo.reload({ waitUntil: 'domcontentloaded' })
await ricardo.waitForTimeout(4000)
await ricardo.locator('button', { hasText: PROTOCOLO }).first().click()
await ricardo.waitForTimeout(1500)
const ricardoDepois = await painelDe(ricardo).innerText()
ok('Ricardo vê a nova manifestação da Cliente',
  ricardoDepois.includes(NOVA_MANIFESTACAO))
ok('Ricardo continua sem ver a resposta da Ana',
  !ricardoDepois.includes(NOVA_RESPOSTA))

// ─────────────────────────── 8. Nada mudou de status ───────────────────────
ok('Publicar no Protocolo não mudou o status do Atendimento',
  /Novo/i.test(painelAna))

// ─────────────────────────── 9. Telas preservadas ──────────────────────────
// O quadro desenha um lote por coluna: revelar o resto é o mesmo que rolar a
// coluna até o fim.
for (const botao of await ana.getByRole('button', { name: /Ver mais/ }).all()) {
  await botao.click()
  await ana.waitForTimeout(400)
}
const quadro = await ana.locator('body').innerText()
const MOCKS = ['#2026-0042', '#2026-0041', '#2026-0039', '#2026-0038', '#2026-0035',
  '#2026-0033', '#2026-0028', '#2026-0021', '#2026-0019']
ok('Os 9 cards mockados continuam na tela', MOCKS.every((m) => quadro.includes(m)),
  MOCKS.filter((m) => !quadro.includes(m)).join(', ') || 'nenhum ausente')
ok('Os três atendimentos reais continuam visíveis',
  ['#2026-0001', '#2026-0002', '#2026-0003'].every((p) => quadro.includes(p)))
await ana.screenshot({ path: `${DESTINO}/protocolo-quadro-final.png`, fullPage: true })

await ctxAna.close()
await ctxRicardo.close()
await ctxMarina.close()
await nav.close()
const f = res.filter((r) => !r.v).length
console.log(`\n${res.length - f}/${res.length} verificações aprovadas.`)
process.exit(f ? 1 : 0)
