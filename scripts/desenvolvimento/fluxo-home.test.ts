import assert from "node:assert/strict";
import { test } from "node:test";
import { obterFluxo, pontoNaConexao, obterViagem, mensagemCliente, obterAtendimentoVisual, obterFocoNarrativo } from "../../src/features/home/lib/fluxo-demonstracao";
import { etapasDemo, DURACAO_CICLO, atendimentosDemo, especialistasDemo } from "../../src/features/home/constants/demonstracao";

test("seis etapas e clientes escalonados com dezesseis segundos de intervalo", () => {
  assert.equal(etapasDemo.length, 6);
  assert.deepEqual([0, 1, 2].map(i => obterFluxo(0, i).etapa), [0, -1, -1]);
  assert.deepEqual([0, 1, 2].map(i => obterFluxo(24000, i).etapa), [4, 1, -1]);
  etapasDemo.forEach((etapa, indice) => assert.equal(obterFluxo(etapa.inicio, 0).etapa, indice));
});
test("resultado é recebido antes de reiniciar e os ciclos seguem independentes", () => {
  assert.equal(obterFluxo(43999, 0).etapa, 5);
  assert.equal(obterFluxo(DURACAO_CICLO, 0).etapa, 0);
  assert.equal(obterFluxo(DURACAO_CICLO, 0).ciclo, 1);
  assert.equal(obterFluxo(DURACAO_CICLO, 1).etapa, -1);
});
test("documentos têm quatro trajetos contínuos, incluindo volta pela central", () => {
  for (const [inicio, fim, trecho] of [[4000, 7000, "entrada"], [22500, 26000, "encaminhamento"], [32000, 35500, "retorno"], [37500, 41000, "entrega"]] as const) {
    assert.deepEqual(obterViagem(inicio), { trecho, progresso: 0 });
    assert.equal(obterViagem((inicio + fim) / 2)?.progresso, .5);
  }
  assert.equal(obterViagem(41000), null);
  assert.deepEqual(pontoNaConexao([10, 20], [100, 200], 0), { x: 10, y: 20 });
  assert.deepEqual(pontoNaConexao([10, 20], [100, 200], .5), { x: 55, y: 110 });
  assert.deepEqual(pontoNaConexao([10, 20], [100, 200], 1), { x: 100, y: 200 });
  assert.deepEqual(pontoNaConexao([10, 20], [100, 200], 2), { x: 100, y: 200 });
});
test("digitação gradual, texto inteiro com movimento reduzido e conclusão integrada", () => {
  const pedido = "Preciso de suporte em importação.";
  assert.equal(mensagemCliente(0, 0, false, pedido), "P");
  assert(mensagemCliente(1600, 0, false, pedido).length < pedido.length);
  assert.equal(mensagemCliente(0, 0, true, pedido), pedido);
  assert.equal(mensagemCliente(41000, 0, false, pedido), atendimentosDemo[0].resposta);
});


test("clientes têm assets próprios e não reutilizam imagens de profissionais", () => {
  const clientes = new Set<string>(atendimentosDemo.map(item => item.asset));
  assert.equal(clientes.size, atendimentosDemo.length);
  for (const profissional of especialistasDemo) assert.equal(clientes.has(profissional.asset), false);
});


test("narrativa separa recepção, escolha, recolhimento, encaminhamento e entrega", () => {
  const cena = (tempo: number) => obterAtendimentoVisual(tempo, 0, {}, false);
  assert(cena(7500).assistente);
  assert.equal(cena(7500).cardsVisiveis, false);
  assert.equal(cena(10500).escolhido, null);
  assert.equal(cena(10500).cardsVisiveis, true);
  assert.equal(cena(15000).escolhido, 0);
  assert.equal(cena(18000).progressoCards, .5);
  assert.equal(cena(18500).cardsVisiveis, false);
  assert.equal(cena(24000).profissionalAtivo, false);
  assert.equal(cena(26000).profissionalAtivo, true);
  assert.equal(cena(31000).mensagemProfissional, atendimentosDemo[0].resposta);
  assert.equal(cena(40000).concluido, false);
  assert.equal(cena(41000).mensagemCliente, cena(31000).mensagemProfissional);
  assert.equal(cena(79000).concluido, true);
  assert.deepEqual([0, 44000, 60000, 80000].map(obterFocoNarrativo), [0, 1, 2, 0]);
  const escolhas = {0: {ciclo: 0, indice: 2}};
  assert.equal(obterAtendimentoVisual(24000, 0, escolhas, false).escolhido, 2);
  assert.equal(obterAtendimentoVisual(95000, 0, escolhas, false).escolhido, 0);
});

test("personagens ficam ON durante cada participação e OFF fora dela nos três atendimentos", () => {
  for (const indice of [0, 1, 2]) {
    const cena = (local: number) => obterAtendimentoVisual(indice * 16000 + local, indice, {}, false);
    for (const local of [0, 3200, 4000, 6999, 37500, 40000, 41000]) {
      assert.equal(cena(local).clienteEmAtividade, true, `cliente ${indice} em ${local}`);
    }
    for (const local of [7000, 22500, 26000, 35500, 42100]) {
      assert.equal(cena(local).clienteEmAtividade, false, `cliente ${indice} em ${local}`);
    }
    for (let local = 22500; local < 35500; local += 100) {
      assert.equal(cena(local).profissionalEmAtividade, true, `profissional ${indice} em ${local}`);
    }
    assert.equal(cena(22499).profissionalEmAtividade, false);
    assert.equal(cena(35500).profissionalEmAtividade, false);
  }
});

test("rede territorial mantém atividades independentes, limitadas e sobrepostas", async () => {
  const { obterConexoesClientes, obterConexoesProfissionais } = await import("../../src/features/home/lib/rede-territorial");
  const { marcadoresTerritoriais } = await import("../../src/features/home/constants/rede-territorial");
  assert.equal(marcadoresTerritoriais.filter(m => m.tipo === "cliente").length, 19);
  assert.equal(marcadoresTerritoriais.filter(m => m.tipo === "profissional").length, 15);
  for (const [obter, limite, quantidade, alvo] of [[obterConexoesClientes, 5, 19, 4], [obterConexoesProfissionais, 4, 15, 3]] as const) {
    assert.deepEqual(obter(8000, true), []);
    const vistos = new Set<string>();
    const direcoes = new Set<string>();
    let maximo = 0;
    let soma = 0;
    let amostras = 0;
    for (let tempo = 0; tempo < 180000; tempo += 100) {
      const conexoes = obter(tempo, false);
      assert(conexoes.length >= 2 && conexoes.length <= limite);
      assert.equal(new Set(conexoes.map(c => c.id)).size, conexoes.length);
      maximo = Math.max(maximo, conexoes.length);
      soma += conexoes.length;
      amostras++;
      for (const conexao of conexoes) {
        vistos.add(conexao.id);
        assert(conexao.intensidade > 0 && conexao.intensidade <= 1);
        assert(conexao.intensidadeLinha >= 0 && conexao.intensidadeLinha <= 1);
        if (conexao.pulso) direcoes.add(conexao.pulso.direcao);
      }
    }
    assert.equal(maximo, limite);
    assert(Math.abs(soma / amostras - alvo) < .2);
    assert.equal(vistos.size, quantidade);
    assert.deepEqual([...direcoes].sort(), ["para-marcador", "para-vincis"]);
  }
  // Uma troca de cliente não reinicia os profissionais nem sincroniza seus pulsos.
  const mudancas = (obter: typeof obterConexoesClientes) => {
    let anteriores = "";
    return Array.from({length: 200}, (_, i) => i * 100).filter(t => {
      const ids = obter(t, false).map(c => c.id).join(",");
      const mudou = ids !== anteriores; anteriores = ids; return mudou;
    });
  };
  assert.notDeepEqual(mudancas(obterConexoesClientes), mudancas(obterConexoesProfissionais));
});
