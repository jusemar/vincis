import { ENQUADRAMENTO_MAPA } from "../../constants/rede-territorial";

/** Os dois assets compartilham o mesmo referencial; o tema global escolhe qual aparece. */
export function MapaBrasil() {
  const { x, y, largura, altura } = ENQUADRAMENTO_MAPA;
  return <g className="viva-mapa-asset" aria-hidden="true">
    <image className="viva-mapa-claro" href="/images/rede-vincis/mapa-brasil-claro.webp" x={x} y={y} width={largura} height={altura} preserveAspectRatio="xMidYMid meet" />
    <image className="viva-mapa-escuro" href="/images/rede-vincis/mapa-brasil-escuro.webp" x={x} y={y} width={largura} height={altura} preserveAspectRatio="xMidYMid meet" />
  </g>;
}
