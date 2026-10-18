import { CENTRAL } from "../../constants/demonstracao";
import { CORES_REDE, marcadoresTerritoriais } from "../../constants/rede-territorial";
import { caminhoConexao } from "../../lib/fluxo-demonstracao";
import { obterConexoesClientes, obterConexoesProfissionais, posicaoNoMapa } from "../../lib/rede-territorial";

type PropriedadesRede = { tempo: number; reduzido: boolean };

/** Apenas conexões ativas: este SVG permanece abaixo dos marcadores e da base. */
export function RedeTerritorial({ tempo, reduzido }: PropriedadesRede) {
  const conexoes = [...obterConexoesClientes(tempo, reduzido), ...obterConexoesProfissionais(tempo, reduzido)];
  return <g className="viva-rede-territorial" aria-hidden="true">
    {conexoes.map(conexao => <g key={conexao.id} className="viva-conexao-territorial" data-id={conexao.id} data-tipo={conexao.tipo} style={{ color: CORES_REDE[conexao.tipo] }}>
      <path className="viva-linha-rede" style={{ opacity: conexao.intensidadeLinha * .82 }} d={caminhoConexao(conexao.posicao, CENTRAL)} />
      {conexao.pulso && <g className="viva-pulso-rede" data-direcao={conexao.pulso.direcao} style={{ opacity: conexao.pulso.opacidade }} transform={`translate(${conexao.pulso.ponto.x} ${conexao.pulso.ponto.y})`}>
        <circle r="5.5" fill={conexao.tipo === "profissional" ? "#ffe6a3" : "#66ffdc"} opacity=".2" />
        <circle r="2" fill={conexao.tipo === "profissional" ? "#fff9e8" : "#f2fff9"} stroke="currentColor" strokeWidth=".9" />
      </g>}
    </g>)}
  </g>;
}

/** Todos os marcadores permanecem ancorados ao mapa; a atividade muda somente o visual. */
export function MarcadoresTerritoriais({ tempo, reduzido }: PropriedadesRede) {
  const conexoes = [...obterConexoesClientes(tempo, reduzido), ...obterConexoesProfissionais(tempo, reduzido)];
  return <g className="viva-marcadores-territoriais" aria-hidden="true">
    {marcadoresTerritoriais.map(marcador => {
      const posicao = posicaoNoMapa(marcador.x, marcador.y);
      const conexao = conexoes.find(item => item.id === marcador.id);
      const intensidade = conexao?.intensidade ?? 0;
      const profissional = marcador.tipo === "profissional";
      const cor = profissional ? "#a46a0c" : "#075740";
      return <g key={marcador.id} className="viva-marcador viva-marcador-rede" data-tipo={marcador.tipo} data-id={marcador.id} data-estado={conexao ? "conectado" : "presente"} transform={`translate(${posicao[0]} ${posicao[1]})`}>
        <g className="viva-marcador-escala">
          <g className="viva-cliente-presente" style={{ opacity: 1 - intensidade }}>
            <circle r="7.6" fill={profissional ? "#fff4d3" : "#eafff2"} fillOpacity=".92" stroke={cor} strokeWidth="1.1" />
            <IconeMarcador profissional={profissional} cor={cor} />
          </g>
          <g className="viva-cliente-holografico" style={{ opacity: intensidade }}>
            <circle className="viva-cliente-brilho" r="17" fill={profissional ? "#ffda79" : "#5cffd6"} fillOpacity=".1" />
            <ellipse cy="7.5" rx="13" ry="4" fill="none" stroke={profissional ? "#ffe6a3" : "#7affdf"} strokeWidth="1" opacity=".8" />
            <circle className="viva-cliente-aura" r="11.5" fill={profissional ? "#fff0c5" : "#c5fff0"} fillOpacity=".16" stroke={profissional ? "#f9cf65" : "#59fbd4"} strokeWidth="1.2" opacity=".85" />
            <circle className="viva-cliente-nucleo" r="8.7" fill={profissional ? "#fff8e5" : "#e6fff7"} fillOpacity=".90" stroke={profissional ? CORES_REDE.profissional : "#25efc3"} strokeWidth="1.5" />
            <IconeMarcador profissional={profissional} cor={cor} />
            <circle cx="7.5" cy="-7" r="2" fill={profissional ? "#fff9e8" : "#e9fff7"} stroke={profissional ? CORES_REDE.profissional : "#25dcb0"} strokeWidth=".75" />
          </g>
        </g>
      </g>;
    })}
  </g>;
}

function IconeMarcador({ profissional, cor }: { profissional: boolean; cor: string }) {
  return profissional
    ? <path d="M-1.5-2.3v-1.2h3v1.2M-3.5-2h7v5h-7ZM-3.5 0h7" fill="none" stroke={cor} strokeWidth="1.1" strokeLinejoin="round" />
    : <g fill={cor}><circle cy="-2.1" r="1.9" /><path d="M-3.4 3.6v-.7a3.4 3.4 0 0 1 6.8 0v.7Z" /></g>;
}
