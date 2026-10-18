import { CORES_REDE } from "../../constants/rede-territorial";
import { atendimentosDemo, CENTRAL } from "../../constants/demonstracao";
import { caminhoConexao, obterFluxo, obterViagem, pontoNaConexao } from "../../lib/fluxo-demonstracao";

export function Conexoes({ tempo, reduzido, foco }: { tempo: number; reduzido: boolean; foco: number }) {
  return atendimentosDemo.map((item, indice) => {
    const fluxo = obterFluxo(tempo, indice);
    if (fluxo.etapa < 0) return null;
    const viagem = obterViagem(fluxo.local);
    const origem = viagem?.trecho === "retorno" ? item.profissional : viagem?.trecho === "entrada" ? item.cliente : CENTRAL;
    const destino = viagem?.trecho === "encaminhamento" ? item.profissional : viagem?.trecho === "entrega" ? item.cliente : CENTRAL;
    const ponto = pontoNaConexao(origem, destino, viagem?.progresso ?? 0);
    return <g key={item.nome} className="viva-conexao" style={{ opacity: indice === foco ? 1 : 0.55 }}>
      {fluxo.local >= 3500 && <path className={viagem?.trecho === "entrada" || viagem?.trecho === "entrega" ? "viva-linha-principal ativa" : "viva-linha-principal"} style={{ color: CORES_REDE.cliente }} d={caminhoConexao(item.cliente, CENTRAL)} />}
      {fluxo.etapa >= 3 && <path className={viagem?.trecho === "encaminhamento" || viagem?.trecho === "retorno" ? "viva-linha-principal ativa" : "viva-linha-principal"} style={{ color: CORES_REDE.profissional }} d={caminhoConexao(CENTRAL, item.profissional)} />}
      {viagem && !reduzido && <g className="viva-documento" transform={`translate(${ponto.x}, ${ponto.y}) rotate(12)`}>
        <path d="M-12-18H5L13-10V18H-12Z" fill="#f5fdff" stroke="#88bdd0" strokeWidth="1.5" />
        <path d="M5-18V-10H13M-7-5H7M-7 1H7M-7 7H3" fill="none" stroke="#88bdd0" strokeWidth="2" />
      </g>}
    </g>;
  });
}
