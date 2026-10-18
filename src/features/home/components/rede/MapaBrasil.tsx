import { ENQUADRAMENTO_MAPA } from "../../constants/rede-territorial";

/** Asset oficial em proporção 3:2; a rede usa exatamente este referencial. */
export function MapaBrasil() {
  const { x, y, largura, altura } = ENQUADRAMENTO_MAPA;
  return <g className="viva-mapa-asset" aria-hidden="true"><image href="/images/rede-vincis/mapa-brasil.webp" x={x} y={y} width={largura} height={altura} preserveAspectRatio="xMidYMid meet" /></g>;
}
