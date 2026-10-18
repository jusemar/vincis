import {
  DURACAO_CICLO,
  MARCOS_DEMO,
  atendimentosDemo,
  especialistasDemo,
  etapasDemo,
  INTERVALO_CLIENTES,
} from "../constants/demonstracao";

export function obterFluxo(tempo: number, cliente: number) {
  const ciclo = Math.floor(tempo / DURACAO_CICLO);
  const decorrido = tempo % DURACAO_CICLO - cliente * INTERVALO_CLIENTES;
  if (decorrido < 0) return { etapa: -1, progresso: 0, ciclo, local: 0 };
  const local = Math.min(decorrido, MARCOS_DEMO.fimAtendimento - 1);
  const seguinte = etapasDemo.findIndex((item) => local < item.inicio);
  const etapa = seguinte === -1 ? etapasDemo.length - 1 : seguinte - 1;
  const fim = etapasDemo[etapa + 1]?.inicio ?? MARCOS_DEMO.fimAtendimento;
  return {
    etapa,
    local,
    ciclo,
    progresso:
      (local - etapasDemo[etapa].inicio) / (fim - etapasDemo[etapa].inicio),
  };
}

/** Bézier compartilhada entre linha e documento: a entrega percorre o traçado real. */
export function pontoNaConexao(
  origem: readonly number[],
  destino: readonly number[],
  progresso: number,
) {
  const t = Math.min(1, Math.max(0, progresso));
  const meioX = (origem[0] + destino[0]) / 2;
  return {
    x:
      (1 - t) ** 3 * origem[0] +
      3 * (1 - t) ** 2 * t * meioX +
      3 * (1 - t) * t ** 2 * meioX +
      t ** 3 * destino[0],
    y:
      (1 - t) ** 3 * origem[1] +
      3 * (1 - t) ** 2 * t * origem[1] +
      3 * (1 - t) * t ** 2 * destino[1] +
      t ** 3 * destino[1],
  };
}
export function caminhoConexao(
  origem: readonly number[],
  destino: readonly number[],
) {
  const meio = (origem[0] + destino[0]) / 2;
  return `M ${origem[0]} ${origem[1]} C ${meio} ${origem[1]}, ${meio} ${destino[1]}, ${destino[0]} ${destino[1]}`;
}

/** Mensagem de ida, encaminhamento e resposta de volta usam exatamente a mesma curva. */
export function obterViagem(local: number) {
  const trechos = [
    [MARCOS_DEMO.enviar, MARCOS_DEMO.receber, "entrada"],
    [MARCOS_DEMO.encaminhar, MARCOS_DEMO.receberProfissional, "encaminhamento"],
    [MARCOS_DEMO.retornar, MARCOS_DEMO.receberCentral, "retorno"],
    [MARCOS_DEMO.entregar, MARCOS_DEMO.receberCliente, "entrega"],
  ] as const;
  for (const [inicio, fim, trecho] of trechos) {
    if (local >= inicio && local < fim) {
      const linear = (local - inicio) / (fim - inicio);
      // Aceleração e desaceleração suaves; o pacote não salta entre origem e destino.
      return { trecho, progresso: linear * linear * (3 - 2 * linear) };
    }
  }
  return null;
}

export type EscolhasDemo = Partial<Record<number, { ciclo: number; indice: number }>>;

/** A direção de atenção acompanha o atendimento mais antigo ainda em andamento. */
export function obterFocoNarrativo(tempo: number) {
  const local = tempo % DURACAO_CICLO;
  if (local < MARCOS_DEMO.fimAtendimento) return 0;
  if (local < MARCOS_DEMO.fimAtendimento + INTERVALO_CLIENTES) return 1;
  return 2;
}

export function mensagemCliente(tempo: number, indice: number, reduzido: boolean, pedido: string) {
  const { local } = obterFluxo(tempo, indice);
  if (local >= MARCOS_DEMO.receberCliente) return atendimentosDemo[indice].resposta;
  if (local < MARCOS_DEMO.enviar && !reduzido) {
    return pedido.slice(0, Math.max(1, Math.floor(local / MARCOS_DEMO.fimDigitacao * pedido.length)));
  }
  if (local >= MARCOS_DEMO.confirmarEscolha && local < MARCOS_DEMO.fimCards) return "Quero seguir com este profissional.";
  return pedido;
}

/** Estado visual único para desktop, mobile e todos os atendimentos secundários. */
export function obterAtendimentoVisual(tempo: number, indice: number, escolhas: EscolhasDemo, reduzido: boolean) {
  const dados = atendimentosDemo[indice];
  const fluxo = obterFluxo(tempo, indice);
  const { local } = fluxo;
  const manual = escolhas[indice];
  const escolhido = local < MARCOS_DEMO.escolher ? null
    : manual?.ciclo === fluxo.ciclo ? manual.indice
    : local >= MARCOS_DEMO.confirmarEscolha ? indice : null;
  const profissional = especialistasDemo[escolhido ?? indice];
  const cardsVisiveis = fluxo.etapa >= 0 && local >= MARCOS_DEMO.mostrarCards && local < MARCOS_DEMO.fimCards;
  const recolhendo = local >= MARCOS_DEMO.recolherCards;
  const progressoCards = reduzido ? 1 : recolhendo
    ? Math.max(0, (MARCOS_DEMO.fimCards - local) / (MARCOS_DEMO.fimCards - MARCOS_DEMO.recolherCards))
    : Math.min(1, (local - MARCOS_DEMO.mostrarCards) / 800);
  let assistente: string | null = null;
  if (local >= MARCOS_DEMO.receber && local < MARCOS_DEMO.mostrarCards) assistente = "Recebi! Vou encontrar especialistas para você.";
  if (local >= MARCOS_DEMO.fimCards && local < MARCOS_DEMO.receberProfissional) assistente = `Vou conectar você a ${profissional.nome}.`;
  if (local >= MARCOS_DEMO.receberCentral && local < MARCOS_DEMO.receberCliente) assistente = "Resposta recebida. Enviando para você.";
  const profissionalAtivo = local >= MARCOS_DEMO.receberProfissional;
  const respondendo = local >= MARCOS_DEMO.prepararResposta;
  const concluido = local >= MARCOS_DEMO.receberCliente;
  // O desenho acompanha a participação inteira, inclusive o trajeto do documento.
  const clienteEmAtividade = fluxo.etapa >= 0 && (
    local < MARCOS_DEMO.receber ||
    (local >= MARCOS_DEMO.entregar && local < MARCOS_DEMO.receberCliente + 1000)
  );
  const profissionalEmAtividade = fluxo.etapa >= 3 &&
    local >= MARCOS_DEMO.encaminhar && local < MARCOS_DEMO.receberCentral;
  return {
    indice, dados, fluxo, escolhido, profissional, cardsVisiveis, recolhendo,
    progressoCards, assistente, profissionalAtivo, respondendo, concluido,
    clienteEmAtividade, profissionalEmAtividade,
    viagem: obterViagem(local),
    trabalhando: local >= MARCOS_DEMO.trabalhar && local < MARCOS_DEMO.prepararResposta,
    digitando: fluxo.etapa === 0 && local < MARCOS_DEMO.enviar,
    processando: (local >= MARCOS_DEMO.receber && local < MARCOS_DEMO.mostrarCards)
      || (local >= MARCOS_DEMO.fimCards && local < MARCOS_DEMO.receberProfissional)
      || (local >= MARCOS_DEMO.receberCentral && local < MARCOS_DEMO.entregar),
    mensagemCliente: mensagemCliente(tempo, indice, reduzido, dados.pedido),
    mensagemProfissional: respondendo ? dados.resposta
      : local >= MARCOS_DEMO.trabalhar ? "Estou preparando sua resposta."
      : "Recebi sua solicitação. Vou analisar.",
  };
}
export type AtendimentoVisual = ReturnType<typeof obterAtendimentoVisual>;
