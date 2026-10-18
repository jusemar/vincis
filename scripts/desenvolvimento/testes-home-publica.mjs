/** Verificação local da narrativa, sem dados reais, login ou chamadas de negócio. */
import { chromium } from "playwright-core";
import { homedir } from "node:os";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const destino = "/tmp/vincis-home";
await mkdir(destino, { recursive: true });
const browser = await chromium.launch({ executablePath: `${homedir()}/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`, headless: true });
const erros = [];
const falhas = [];
const avisosExistentes = new Set();
const abrir = async (context) => {
  const page = await context.newPage();
  page.on("pageerror", erro => erros.push(erro.message));
  page.on("console", m => { if (m.type() === "error") { if (m.location().url?.endsWith("/favicon.ico")) avisosExistentes.add("favicon.ico ausente (404), anterior à demonstração"); else erros.push(m.text()); } });
  page.on("response", r => { if (r.status() >= 400 && !r.url().endsWith("/favicon.ico")) falhas.push(`${r.status()} ${r.url()}`); });
  await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
  return page;
};
try {
  for (const [nome, width, height] of [["desktop", 1440, 1100], ["tablet", 820, 1180], ["mobile", 390, 844], ["mobile-estreito", 320, 740]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
    const page = await abrir(context);
    await page.waitForFunction(() => document.querySelector('.viva-aviso')?.textContent.includes('Movimento reduzido'));
    assert.equal(await page.locator("h1").count(), 1);
    assert.equal(await page.locator("main").count(), 1);
    assert.equal(await page.locator(".home-conteudo>section").first().getAttribute("id"), "demonstracao");
    assert.equal(await page.locator(".viva-cliente").count(), 1, "Cena inicial limpa");
    assert.equal(await page.getByRole("button", { name: "Pausar demonstração" }).count(), 0);
    assert.equal(await page.locator('.viva-braco-holografico').first().evaluate(el => getComputedStyle(el).animationName), 'none', 'Braço respeita movimento reduzido');
    const cards = page.locator(width >= 768 ? '.viva-especialistas' : '.viva-mobile');
    for (let etapa = 0; etapa < 6; etapa++) {
      await page.locator('.viva-etapas button').nth(etapa).click();
      await page.waitForFunction(e => document.querySelector('.viva')?.getAttribute('data-etapa') === String(e), etapa);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${nome}: overflow horizontal na etapa ${etapa}`);
      if (etapa === 1) assert.equal(await cards.locator('.viva-card[aria-pressed=true]').count(), 0, 'Nenhum profissional escolhido na especialidade');
      if (etapa === 2) {
        await cards.getByRole('button', {name:'Selecionar Equipe Horizonte'}).click();
        assert.equal(await cards.locator('.viva-card').nth(2).getAttribute('aria-pressed'), 'true');
      }
      if (etapa === 3) {
        assert.equal(await cards.locator('.viva-card').count(), 0, 'Cards recolhidos antes do encaminhamento');
        if (width >= 768) assert.equal(await page.locator('.viva-profissional-0 img').getAttribute('src').then(s => s.includes('escritorio')), true, 'Escolha altera o ator profissional');
        await page.locator('#demonstracao').screenshot({path:`${destino}/${nome}-rede.png`});
      }
      if (etapa === 5) assert.match(await page.locator('.viva-status').innerText(), /Atendimento concluído/);
    }
    await page.locator('#demonstracao').screenshot({path:`${destino}/${nome}-conclusao.png`});
    await page.getByRole('button', {name:'Reiniciar demonstração'}).click();
    await page.waitForFunction(() => document.querySelector('.viva')?.getAttribute('data-etapa') === '0');
    assert.equal(await page.locator('.viva-cliente').count(), 1);
    const t = await page.locator('.viva').getAttribute('data-tempo');
    await page.waitForTimeout(250);
    assert.equal(await page.locator('.viva').getAttribute('data-tempo'), t);
    await page.getByRole('button', {name:'Mudar para tema escuro'}).filter({visible:true}).click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.screenshot({path:`${destino}/${nome}-escuro.png`});
    if (width < 1024) await page.getByRole('button', {name:'Abrir menu'}).click();
    await page.getByRole('button', {name:'Entrar',exact:true}).filter({visible:true}).click();
    assert(await page.getByRole('dialog').isVisible(), 'Login preservado');
    console.log(`PASS ${nome}: seis etapas, escolha, ator, conclusão, reinício, tema, login e sem overflow`);
    await context.close();
  }
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  const page = await abrir(context);
  await page.waitForFunction(() => Number(document.querySelector('.viva')?.getAttribute('data-tempo')) >= 500);
  await page.getByRole('button', {name:'Pausar demonstração'}).click();
  let tempo = await page.locator('.viva').getAttribute('data-tempo');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.viva').getAttribute('data-tempo'),tempo);
  await page.locator('.viva-etapas button').nth(3).click();
  await page.getByRole('button', {name:'Continuar demonstração'}).click();
  const braco = page.locator('.viva-palco .viva-braco-holografico');
  const poseInicial = await braco.evaluate(el => getComputedStyle(el).transform);
  await page.waitForTimeout(650);
  assert.notEqual(await braco.evaluate(el => getComputedStyle(el).transform), poseInicial, 'Braço articula para tocar o holograma');
  await page.getByRole('button', {name:'Pausar demonstração'}).click();
  const posePausada = await braco.evaluate(el => getComputedStyle(el).transform);
  await page.waitForTimeout(250);
  assert.equal(await braco.evaluate(el => getComputedStyle(el).transform), posePausada, 'Pausa também interrompe o braço');
  console.log('PASS robô: articulação do braço e pausa sincronizada');
  // O relógio virtual acelera somente o teste, mantendo o tempo da experiência em produção.
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T00:00:01Z"));
  await page.getByRole('button', {name:'Reiniciar demonstração'}).click();
  await page.clock.runFor(5000);
  assert.equal(await page.locator('.viva-documento').count(),1);
  const origem = await page.locator('.viva-documento').getAttribute('transform');
  await page.clock.runFor(800);
  assert.notEqual(await page.locator('.viva-documento').getAttribute('transform'),origem,'Documento se move no trajeto');
  await page.clock.runFor(1700);
  assert.match(await page.locator('.viva-palco .viva-balao-assistente').innerText(), /Recebi/);
  assert.equal(await page.locator('.viva-especialistas').count(), 0);
  await page.clock.runFor(3000);
  assert.equal(await page.locator('.viva-especialistas .viva-card.neutro').count(), 3);
  await page.clock.runFor(4500);
  assert.equal(await page.locator('.viva-especialistas .selecionado').count(), 1);
  assert.equal(await page.locator('.viva-especialistas .secundario').count(), 2);
  await page.clock.runFor(3000);
  assert.equal(await page.locator('.viva-especialistas').evaluate(el => Number(getComputedStyle(el).opacity)), .5);
  await page.getByRole('button', {name:'Pausar demonstração'}).click();
  await page.clock.runFor(1000);
  assert.equal(await page.locator('.viva-especialistas').evaluate(el => Number(getComputedStyle(el).opacity)), .5, 'Pausa congela recolhimento');
  await page.getByRole('button', {name:'Continuar demonstração'}).click();
  await page.clock.runFor(6000);
  assert.equal(await page.locator('.viva-especialistas').count(), 0);
  assert.equal(await page.locator('.viva-profissional-0 .viva-balao').count(), 0, 'Profissional só responde depois da chegada');
  assert.deepEqual(await page.locator('.viva-atendimentos small').allTextContents(),['Trabalhando','Especialistas','Em breve']);
  // Capturas ficam fora da sequência cronometrada para não avançar animações no Playwright.
  await page.clock.runFor(7000);
  const resposta = await page.locator('.viva-profissional-0 .viva-balao').innerText();
  await page.clock.runFor(5000);
  assert.match(await page.locator('.viva-palco .viva-balao-assistente').innerText(), /Resposta recebida/);
  assert.equal(await page.locator('.viva-cliente-0 .viva-concluido').count(), 0);
  await page.clock.runFor(5500);
  assert((await page.locator('.viva-cliente-0 .viva-concluido').innerText()).includes(resposta));
  assert.match(await page.locator('.viva-status').innerText(),/Atendimento concluído/);
  await page.clock.runFor(38500);
  assert.equal(await page.locator('.viva').getAttribute('data-etapa'),'0','Loop reinicia');
  await page.evaluate(()=>window.scrollTo({top:document.body.scrollHeight,behavior:'instant'}));
  await page.clock.runFor(500);
  assert.equal(await page.locator('.viva').getAttribute('data-executando'),'false');
  await context.close();
  const mobile = await browser.newContext({viewport:{width:390,height:844}});
  const paginaMobile = await abrir(mobile);
  await paginaMobile.waitForFunction(() => Number(document.querySelector('.viva')?.getAttribute('data-tempo')) >= 500);
  await paginaMobile.getByRole('button', {name:'Pausar demonstração'}).click();
  await paginaMobile.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await paginaMobile.clock.pauseAt(new Date("2026-01-01T00:00:01Z"));
  await paginaMobile.getByRole('button', {name:'Reiniciar demonstração'}).click();
  await paginaMobile.clock.runFor(5000);
  assert(await paginaMobile.locator('.viva-documento-mobile').isVisible(), 'Documento no trajeto mobile');
  const posicaoMobile = await paginaMobile.locator('.viva-documento-mobile').getAttribute('style');
  await paginaMobile.clock.runFor(500);
  assert.notEqual(await paginaMobile.locator('.viva-documento-mobile').getAttribute('style'), posicaoMobile);
  await paginaMobile.getByRole('button', {name:'Pausar demonstração'}).click();
  const tempoMobile = await paginaMobile.locator('.viva').getAttribute('data-tempo');
  await paginaMobile.clock.runFor(1000);
  assert.equal(await paginaMobile.locator('.viva').getAttribute('data-tempo'),tempoMobile);
  await mobile.close();
  console.log('PASS mobile animado: documento percorre trajeto e pausa conserva estado');
  for (const aviso of avisosExistentes) console.log(`AVISO EXISTENTE: ${aviso}`);
  assert.deepEqual(erros,[], 'Sem erros no console');
  assert.deepEqual(falhas,[], 'Sem respostas HTTP com falha');
  console.log(`PASS movimento, pausa, escalonamento, conclusão, loop, fora da tela e console. Capturas: ${destino}`);
} finally { await browser.close(); }
