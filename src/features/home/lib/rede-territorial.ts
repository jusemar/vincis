import { CENTRAL } from "../constants/demonstracao";
import { ENQUADRAMENTO_MAPA, marcadoresTerritoriais } from "../constants/rede-territorial";
import { pontoNaConexao } from "./fluxo-demonstracao";

export function posicaoNoMapa(x: number, y: number): readonly [number, number] {
  const escala = ENQUADRAMENTO_MAPA.largura / 1536;
  return [ENQUADRAMENTO_MAPA.x + x * escala, ENQUADRAMENTO_MAPA.y + y * escala];
}

const clientes = marcadoresTerritoriais.filter(m => m.tipo === "cliente");
const profissionais = marcadoresTerritoriais.filter(m => m.tipo === "profissional");
const suavizar = (valor: number) => {
  const t = Math.max(0, Math.min(1, valor));
  return t * t * (3 - 2 * t);
};

type ConfiguracaoAtividade = {
  intervalo: number;
  antecipacao: number;
  duracoes: readonly number[];
  deslocamentos: readonly number[];
};

/** Janelas próprias por tipo: os relógios se sobrepõem, sem sincronizar a rede inteira. */
function obterConexoes(
  marcadores: readonly (typeof marcadoresTerritoriais)[number][],
  tempo: number,
  reduzido: boolean,
  configuracao: ConfiguracaoAtividade,
) {
  if (reduzido) return [];
  const { intervalo, antecipacao, duracoes, deslocamentos } = configuracao;
  const relogio = tempo + antecipacao;
  const janela = Math.floor(relogio / intervalo);
  // A janela extra permite sobreposição suave quando a nova conexão começa antes da anterior terminar.
  return [janela - 4, janela - 3, janela - 2, janela - 1, janela].flatMap(indice => {
    if (indice < 0) return [];
    const inicio = indice * intervalo + deslocamentos[indice % deslocamentos.length];
    const duracao = duracoes[indice % duracoes.length];
    const local = relogio - inicio;
    if (local <= 0 || local >= duracao) return [];
    const marcador = marcadores[(indice * 7) % marcadores.length];
    const posicao = posicaoNoMapa(marcador.x, marcador.y);
    const intensidade = Math.min(suavizar(local / 1100), suavizar((duracao - local) / 1300));
    // A borda acende primeiro; a linha entra depois e se apaga antes do halo.
    const intensidadeLinha = Math.min(suavizar((local - 350) / 850), suavizar((duracao - local - 300) / 1000));
    const tempoPulso = local - 1200;
    const duracaoTrecho = (duracao - 2600) / 2;
    const retornando = tempoPulso >= duracaoTrecho;
    const progresso = (tempoPulso % duracaoTrecho) / duracaoTrecho;
    const pulso = tempoPulso > 0 && tempoPulso < duracao - 2600 ? {
      ponto: pontoNaConexao(retornando ? CENTRAL : posicao, retornando ? posicao : CENTRAL, suavizar(progresso)),
      opacidade: Math.sin(progresso * Math.PI) * intensidadeLinha,
      direcao: retornando ? "para-marcador" : "para-vincis",
    } : null;
    return [{ id: marcador.id, tipo: marcador.tipo, posicao, intensidade, intensidadeLinha, pulso }];
  });
}

/** Cadência de cerca de quatro clientes ativos, com entradas e saídas independentes. */
export function obterConexoesClientes(tempo: number, reduzido: boolean) {
  return obterConexoes(clientes, tempo, reduzido, {
    intervalo: 2000, antecipacao: 4800,
    duracoes: [7600, 8300, 7900], deslocamentos: [0, 350, 150, 600, 250],
  });
}

/** Cadência de cerca de três profissionais ativos, independente dos clientes. */
export function obterConexoesProfissionais(tempo: number, reduzido: boolean) {
  return obterConexoes(profissionais, tempo, reduzido, {
    intervalo: 2600, antecipacao: 5500,
    duracoes: [7600, 8200, 7900], deslocamentos: [650, 0, 450, 200],
  });
}
