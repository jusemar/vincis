import { ENQUADRAMENTO_ARTE_MAPA } from "../../constants/rede-territorial";

/** As duas artes usam o mesmo quadro SVG, compartilhado com os marcadores e conexões. */
export function MapaBrasil() {
  const { x, y, largura, altura } = ENQUADRAMENTO_ARTE_MAPA;
  return <g className="viva-mapa-asset" aria-hidden="true">
    <image className="viva-mapa-claro" href="/images/rede-vincis/Mapa-3D-do-Brasil-claro.webp" x={x} y={y} width={largura} height={altura} preserveAspectRatio="xMidYMid meet" />
    <image className="viva-mapa-escuro" href="/images/rede-vincis/Mapa-3D-do-Brasil-escuro.webp" x={x} y={y} width={largura} height={altura} preserveAspectRatio="xMidYMid meet" />
  </g>;
}
